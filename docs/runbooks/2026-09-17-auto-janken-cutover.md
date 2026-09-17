---
title: 每日自動猜拳切換 Runbook
date: 2026-09-17
status: NOT RELEASE READY
scope: PR824 / KTD7、KTD9 operator cutover
---

# 每日自動猜拳切換 Runbook

> **狀態：`NOT RELEASE READY`。** 本文件是 operator checklist，不是已完成的 release 紀錄；所有方框維持未勾選，未提供 host、credential、SSH 或 production data command。

## 先決 STOP gate

- [ ] **先解決舊 worker 的 admission-stop／graceful drain 能力。** 目前沒有已證明的方法可以在不遺失 popped in-flight 工作的情況下停止正在跑的舊 worker。
- [ ] Operator 必須提出該能力的實際證據，或先取得一個**有界、舊版相容的 precursor patch** 並完成驗證；不能靠新版本變更補救，也不能只看 `LLEN = 0` 或 `PROCESSLIST` 就放行。
- [ ] 此 gate 未通過前，停止 release；不要啟動新 bot／worker，不要 activation，不要執行 production cutover。

## Source facts（只列切換需要的依據）

- `app/config/crontab.config.js:109-132`：`Daily Quest Process` 是每分鐘、`immediate: true`；Auto Janken 與其 outbox drainer 目前 `enabled: false`。
- `app/tasks.js:20-34`：disabled job 不載入 bin、不寫 Task history；`immediate` 對應 startup `runOnInit`。
- `app/src/service/DailyQuestService.js:97-158,247-272`：未 activation 不處理；activation 後 scanner 依固定 `since_date` 掃描並在 transaction 內寫 completion、mirror、daily／weekly reward。
- `app/migrations/20260913152813_create_daily_quest_durable_scanner.js:11-38`：bridge、completion、weekly claim 與受保護 archive 表由 migration 建立。
- `app/bin/DailyQuestQueueArchive.js:41-83`：現行 default capture 讀 bridge、`LRANGE` 全佇列並以 SQL transaction 寫 archive，不 pop；當次輸出的分類識別只有 Redis snapshot index，不是 archive stable ID。`app/bin/DailyQuestQueueArchive.js:89-183`：`--audit` 讀全部 persisted archive rows，以 stable archive ID 分頁並逐頁 log `{archiveId,classification}`。
- `app/bin/DailyQuestPreflight.js:17-119`：現行 preflight 檢查 bridge、`+08:00`、runtime／DB 日期、weekday、W0 舊列來源、重複與每週數量。
- 舊 writer 範圍的既有盤點在 `docs/plans/2026-09-12-001-feat-auto-janken-matchmaking-plan.md` KTD7／KTD9；包含 bot 的 legacy achievement 路徑及 worker `AchievementCron`、`RaceService` 等，不可只停 DailyQuest 一支。

## 不變規則

- 所有日期 authority 是 Asia/Taipei；`D_c` 必須是執行當日的 Taipei 日期、週一至週五，且整個切換不可跨午夜。此 runbook 日期的今天是 2026-09-17（週四）；若實際執行日不同，先重新固定並重做檢查。
- Production runner 必須由 production 注入 `NODE_ENV=production` 與既有 runtime config；不要載入 repo root `.env`，不要為了 CLI 另加 local dotenv。
- 下列命令的工作目錄都是 `app/`，不是 repo root。
- Capture（無 `--audit`）是 **Redis read + SQL write**：只 `LRANGE`、把 raw durable commit 到 archive；不 delete、不 pop、不 replay、不把 raw 放進 log。
- CLI arguments 嚴格只接受 `[]`（default capture）或 `['--audit']`；其他旗標、重複或混合 arguments 都 fail，不得執行 capture／audit。
- `--audit` 是新的 agreed contract：只讀 SQL archive 的**全部已保存列**，依 archive 穩定 `id` 順序逐列以當前 DB 分類；Redis-free、SQL-read-only，並逐頁 log 所有已保存列的 `{archiveId,classification}` stable mappings。bridge missing 或已 activation 直接 fail；任何 `unknown` 均 non-zero。
- 分類只能是 `legacyPaid`、`scannerWillPay`、`notEligible`、`unknown`。`unknown` 不得人工猜測、刪除、改日期或 replay。

## Ordered checklist

### A. Merge 前：先凍結 deploy 競態

1. [ ] **先暫停 pull timer**，並等待當時已在執行的 deploy service 及其他 launchers 完成；planned maintenance 期間不可讓背景 launcher 自動拉新 image。
2. [ ] 記錄舊 bot、frontend、worker 的**不可變 image digest**、運行 instance／服務狀態與觀測時間；不可只記 `latest`。
3. [ ] 確認舊 worker admission-stop／drain gate 已由 operator 證明。沒有證據就 STOP，不用 LLEN、PROCESSLIST 或 compose 重建順序代替。

### B. 合併後：只等真正的 main image

4. [ ] 取得獨立核准後才 merge；不要把 PR HEAD 當 release source。
5. [ ] 等 CI 發布**實際 merged main SHA** 對應的 backend 與 frontend GHCR images，並以 image digest 核對；image publish 成功不等於 deploy 成功。
6. [ ] 確認 pull timer 仍暫停，沒有其他 launcher 先拉取或啟動新 bot／worker。

### C. Schema：migration-only runner

7. [ ] 使用 pinned、production-injected config 的受控 migration runner，cwd `app/`；本步驟**只跑 migration，不啟動 bot 或 worker**。
8. [ ] 先以現有 knex CLI 的 migration list/status 輸出核對**實際 pending migrations**，再由 operator 核准執行 `yarn migrate`；不要預設「應該是 6 支」或用猜的數量放行。
9. [ ] 核對實際 migration output、`knex_migrations` 與 schema：bridge id constraint、archive、completion、weekly claim、`quest_date` 及索引都真的存在。
10. [ ] Migration 中途失敗即 STOP；不得宣稱「都是 additive 所以 rollback 安全」。先檢查實際部分 DDL、migration row 與 table state，再由 operator 決定處置；不得 down、刪 archive 或 replay data。

### D. 建立 bridge（尚未 activation）

11. [ ] 在 schema 已 durable commit 後，由**人類授權 operator** 以短 SQL transaction 建立／確認唯一 `daily_quest_bridge_state.id = 1`：`since_date = D_c`、`activated_at IS NULL`。不任意改既有 row，不將 activation 與 migration 混在一起。
12. [ ] 以 Taipei runtime date、DB `CURDATE()` 與 `D_c` 三方實測同日；`D_c` 是 weekday 且不跨午夜。任何 date crossing、bridge missing、已 activation 或 state 不一致都 STOP，不任意編輯資料。

### E. 舊 producer／consumer admission stop

13. [ ] 停止**所有**舊 producer 與 consumer 的正常 admission／automatic ticks，不只 DailyQuest：bot 的簽到、轉蛋、手動／arena 猜拳及 legacy achievement writer；worker 的 `AutoGacha`、`AchievementCron`、`RaceService` 相關 achievement 路徑、舊 `DailyQuestProcess` 及其他可能寫入相同事實的程序。依實際 source／runtime 盤點，不以服務名稱猜測。
14. [ ] 等待已 popped 的 in-flight 工作完成或由已證明的舊版相容 drain 機制安全收束；保留 worker instance、admission-stop、完成／失敗 log、DB transaction 與 queue observation 的時間戳證據。
15. [ ] **在第一次 raw archive 前**，證明沒有仍會 pop／寫入的舊 consumer。`LLEN = 0`、單次 `PROCESSLIST`、kill、`Task.last_run_at` 或 compose stop 任一項都不夠；缺少可證明的 graceful admission-stop 即回到先決 STOP gate。

### F. 第一次 raw archive（先 archive，後 controlled drain）

16. [ ] 在 queue 已穩定、舊 admission 已 quiesce 後，於 production-injected runner、cwd `app/` 執行：

    ```text
    node bin/DailyQuestQueueArchive.js
    ```

17. [ ] 確認 archive SQL transaction 已 commit，記錄 capture time、Redis key、snapshot index／raw 數量；default capture 本身只回報 snapshot indices，不提供 archive stable IDs。由 operator 另做 archive table 的 SQL read-only check，以實際 `captured_at` 與已保存的 archive IDs 辨認這一批 row，再保存 batch 對應證據；不得輸出 raw 內容。Redis queue 不得被 pop、delete 或 replay。
18. [ ] 只有 archive durable commit 且證據保存後，才可進行下一步的**受控 legacy drain**；不可先讓舊 worker 自動跑完再補 archive。

### G. 受控 legacy drain，再完全停止舊 writer

19. [ ] 只使用已核准、舊版相容的 **DailyQuest legacy drain**，一次受控執行；不可啟動整個 worker 的 automatic ticks，也不可讓 `AutoGacha`、achievement、Race 或其他 cron 一併執行。
20. [ ] drain 期間仍禁止新 producer；保留每個 popped raw 的完成／未完成證據。無法證明 drain 邊界、in-flight 已收束或可能有其他 writer 時 STOP，不以 queue 變空代替。
21. [ ] drain 結束後，停止所有舊 writer／consumer，並以 instance／process、admission、DB transaction、log 與 queue 的具體證據確認沒有舊程序存活或可再寫入。

### H. 第二次 capture 與完整 audit

22. [ ] 舊 writer 全停後，再執行一次**相同的 default capture**，讓第二次 Redis snapshot 也先 durable commit 到 archive；先記錄第二次的 snapshot indices／raw 數量，再以 operator SQL read-only check 的實際 `captured_at`／archive IDs 建立第二批 mapping。不要假設 capture 回傳 stable IDs；完成兩批 mapping 後，才比較新增、pending、changed 與無法對應的列。
23. [ ] 在同一 production-injected runner、cwd `app/` 執行新的 audit contract：

    ```text
    node bin/DailyQuestQueueArchive.js --audit
    ```

24. [ ] `--audit` 必須讀 archive 表所有已保存 row（按 stable archive `id`，不是當次 snapshot／list index），只讀 SQL、不連 Redis；逐頁 log 全部 row 的 `{archiveId,classification}` stable mappings；確認 bridge 存在且仍 `activated_at IS NULL`。非零或任一 `unknown` 都是 STOP；不得刪 row、改 raw、replay 或以 LLEN 0 視為完成。
25. [ ] 逐筆保留四類結果與 stable IDs。`legacyPaid`、`scannerWillPay`、`notEligible` 以目前 DB classification 為準；同一 persisted row 若由先前 capture／對帳的 `scannerWillPay` 變成 controlled drain 後的 `legacyPaid`，是預期且已解決的 transition，不是阻擋。只有未解決的差異、`unknown`、或缺少 persisted capture／audit evidence 才阻止 activation；所有 evidence 都留在 archive 與 operator record。

### I. Preflight 與 W0

26. [ ] 先確認 activation 之前沒有 new durable write：至少核對 `daily_quest_completion`、`daily_quest_weekly_claim`、`daily_quest.quest_date IS NOT NULL`，以及本 release 新增的其他 writer／outbox／marker 實際沒有在切換前寫入；以 DB 內容與時間戳證明，不用「cron disabled」推定。
27. [ ] 使用實際 operator audit record 作為 reference 執行 preflight（cwd `app/`）：

    ```text
    node bin/DailyQuestPreflight.js --manual-audit-reference=<actual-record-reference>
    ```

28. [ ] `--manual-audit-reference` 目前只做字串格式 validation；它不是 raw archive、來源對帳或 substantive proof。實際 audit record 必須另存並可追溯，不能只填一個看似合法的字串。
29. [ ] 核對 preflight 全部 STOP 條件：DB／runtime `+08:00`、同日、`D_c` weekday；W0 是**含 D_c 的週日為週首的一週**；每筆 W0 legacy row 的來源吻合、無同 user 同日重複、每 user 未達 7；依步驟 25 核對兩次 capture；僅未解決差異、`unknown` 或缺少 persisted evidence 阻擋 activation。gate 只要求 W0 與本次 cutover evidence 可驗證。
30. [ ] `D_c` 以前其他週的 weekly 是否已付若仍 unknown，接受其 unknown 狀態：不重建、不 backpay，也不以此單獨阻擋本次切換。若 W0 被污染、或本次 cutover evidence 無法驗證，整體延後到**下一個乾淨且可驗證的週內 weekday**，不是只等下一個 weekday；不要凍結個人週獎、不要改舊列日期、不要任意補發。

### J. Activation 與觀測

31. [ ] 只有人類授權 operator 在所有 gate 通過後，以**一筆短 transaction** 將 bridge id 1 的 `activated_at` 寫入；不依賴 scanner 第一批成功，不做 bulk data edit。
32. [ ] activation 發生任何 error、日期 crossing、state mismatch 或 audit 改變，立即 STOP；不任意修 row，不把 `activated_at = NULL` 當成撤銷既有 progress／reward 的方法。
33. [ ] activation commit 後才啟動與 merged main SHA／digest 對應的 pinned 新 bot／worker；確認新 `DailyQuestProcess` 使用 `immediate: true`，但 Auto Janken matchmaking 與 outbox 兩個 auto cron **仍 disabled**。
34. [ ] 先做不 awarding 的 observational verification：只核對 instance／image digest、cron flags、bridge state、scanner log、archive／audit evidence 與 read-only SQL；不做真實玩家 award smoke test，不偽造成功結果。
35. [ ] operator 明確核准後，才恢復 pull timer；只允許預定的最新 merged main images，並再次確認沒有其他 launcher。workflow 通知的 image publish 仍不代表 deploy success。

## Rollback／後續 STOP

- **新 writer 尚未寫入前：** 保留 additive schema 與 archive，不 down、不 replay；fallback 回舊 image 以前，必須先證明所有新程式／service 已退出且不能再寫入，並以 DB／log 證明沒有任何 new durable business writes，才可由 operator 核准回到舊 image。部分 DDL 的 migration failure 不可用「可 rollback」概括。
- **一旦確認任何新 achievement marker／progress、daily completion／claim commit：** 絕不回到 legacy writer；只 forward-fix。若出現 unknown writing state，立即 STOP 並調查，不能假設可以 fallback。
- activation 為 NULL 不會撤銷已提交 progress、completion、claim 或 reward；不要以此假設 rollback 可逆。

## 未由本 runbook 證明的事項

- Production collation、table size、長交易／in-flight、maintenance window 與實際 host launcher 能力，均需 operator 以當次證據確認；本文件不假設已知。
- 不要求 production data copy；任何 copy、backup、repair 或資料補償都要另行明確核准。
- 不把本文件的 checklist 當成功紀錄；release evidence、實際 digest、兩次 archive、audit、preflight、activation 與觀測結果須由 operator 另存。
