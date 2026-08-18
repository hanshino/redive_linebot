# 世界王五王周回改造 TODO

- 整理日期：2026-08-14
- Branch：`feat/worldboss-v2`
- 狀態：implementation 已存在於 working tree，正在 review；尚未 commit，從未部署
- 現行 spec：`docs/superpowers/specs/2026-07-19-worldboss-v2-design.md`

## 1. 為何需要改造

現行 v2 是「全服同時只有一隻 active 王，擊破後立刻建立下一輪並隨機換王」。使用者實際 E2E 後確認，目標玩法應為：

- 每個賽季設定五隻不同的王，固定為 1–5 號位。
- 同一周回五隻王同時存在，玩家可自由選擇任一尚未擊破的王。
- 五隻全部擊破後才進入下一周回。
- 下一周回沿用同一套五王與固定順序。

這不是 Flex 多顯示四張卡而已；資料模型、攻擊目標、周回切換、API、聊天與 LIFF 都需調整。現有 season lifecycle、quota、RPG 傷害／EXP、contribution、排名與結算大致可保留。

## 2. 已確認的產品決策

1. **每季設定五王**：管理員在 draft 賽季選定五隻王與 1–5 順序。
2. **五隻必須不同**：王圖鑑不足五隻時不得完成可開啟的賽季。
3. **自由選王**：玩家可攻擊該周回任一尚未擊破的王，不必依 1 → 5 順序。
4. **溢傷作廢**：指定王剩 100 HP、玩家算出 500 傷害時，只造成 100 有效傷害，其他王不承接 400。
5. **排行榜記有效傷害**：上述 contribution 記 100，不記完整 500，避免尾刀放大排名。
6. **全滅回覆**：擊破該周回最後一隻王的攻擊回覆只顯示本次結果與「本周回全滅」。此限制適用於群組 reply；LIFF 屬私人脈絡，可直接顯示新周回已開始，詳見第 7.8 節。
7. **開季完整快照**：開季時凍結五王的名稱、圖片、描述與 HP 權重；後續修改王圖鑑不影響進行中賽季或歷史呈現。
8. **資料模型方向**：採獨立的每季五王 roster snapshot 表，不用 JSON，也不在 season 放五組重複欄位。

## 3. 核心資料模型（已依 implementation 定案）

```text
world_boss_season
  └─ world_boss_season_boss × 5
       - position: 1–5
       - world_boss_id
       - snapshot_name
       - snapshot_image
       - snapshot_description
       - snapshot_hp_weight

  └─ world_boss_round × 每周回 5
       - cycle_no
       - season_boss_id
       - max_hp / current_hp
       - cleared_at
```

implementation 的 deliberate normalisation 與原提案不同：

- `world_boss_round` **不直接儲存** `season_id`、`position` 或 `status`，只儲存 `season_boss_id + cycle_no + HP + cleared_at`。`season_id` 與 `position` 透過 join roster 取得；狀態由 HP 與 `cleared_at` 推導。這樣避免 round 再維護一份 roster／狀態真相。
- 原提案的 `UNIQUE(season_id, cycle_no, position)` 實作為 `UNIQUE(season_boss_id, cycle_no)`。因為 roster 已有 `UNIQUE(season_id, position)`，且 round 對 roster 使用 `FOREIGN KEY`、`ON DELETE RESTRICT`，兩者在語意上等價。
- 目前周回由該 season 的 round rows 取最大 `cycle_no` 推導，不新增 `world_boss_cycle` table。

實際 migration constraints：

- roster 的 `position` 為 1–5，且每季 position 與 world boss 各自不可重複。
- round 的 `cycle_no >= 1`、`max_hp > 0`、`current_hp <= max_hp`，並以 CHECK 約束 `current_hp`／`cleared_at` 的一致性。
- round 對 roster 使用 `RESTRICT`；contribution 目前只建立 `season_id`、`round_id` 的 index，沒有 FK。

開季與周回流程已實作為：在 transaction 內鎖定 draft season、重新建立 roster snapshot、寫入 active 狀態並建立第 1 周回五筆 encounter；最後一隻王擊破後，在同一 transaction 建立下一周回五筆。所有 attack 先鎖 active season row，因此 unique constraint 是 invariant backstop，不是 recoverable race path。

## 4. 可保留的現有功能

- `world_boss_season` 的 draft → active → settled 狀態機。
- 全服唯一 active season 與到期 cron 結算。
- 每日 cost quota、台灣日界與玩家 row locking。
- 5 秒攻擊冷卻。
- RPG 職業傷害、裝備加成與每刀職業 EXP。
- Contribution 對 season、user、round 的關聯。
- 賽季總有效傷害排行榜與 competition ranking `1,1,3`。
- 女神石、稱號與 authoritative paid reward ledger。
- 最近 settled reward 的 LINE／LIFF 顯示。
- Admin privilege 與 reply-only delivery 限制。

## 5. 已實作的修改範圍

### 群組訊息設計原則

WorldBoss 多數操作發生在 LINE 群組。群組內的訊息應視為所有成員共享的公共資訊，預設保持客觀，不能因為某位玩家觸發指令，就把該玩家的個人狀態混入公共 Flex。

- `#世界王` 公共戰況只顯示賽季、周回、五王名稱、圖片、HP 與擊破狀態。
- 個人每日行動額度、已消耗額度、賽季個人總傷害、職業 EXP／升級、結算獎勵與 ledger proof 只在 LIFF 個人頁或明確的私人脈絡呈現。
- 群組攻擊戰報若需要顯示，必須能辨識攻擊者，但只保留公共戰鬥事實，例如攻擊者名稱、目標王、有效傷害與擊破／全滅結果。
- 群組攻擊成功不得每刀都產生大型 Flex；應採靜默、節流或彙整，避免洗版。
- debounce、cooldown、stale／已擊破卡片命中時一律靜默。
- 不使用 LINE Push；所有群組訊息維持 reply-only。
- 設計任何新的 LINE 訊息時，先判斷內容是「公共狀態」還是「觸發者個人狀態」，不可因資料取得方便而混在同一張群組卡片。

### Schema / migration

- `app/migrations/20260719174434_create_world_boss_v2.js` 已建立 v2 的 `world_boss`、season、roster、round、contribution、reward tables 與 constraints。
- `world_boss_season_boss` 快照表、round 的 `cycle_no`／`season_boss_id` 與多 encounter 語意已完成。
- fresh-install-only 策略已定案；不寫 upgrade/conversion migration，詳見第 8 節。

### Backend

- `WorldBossSeasonService`：draft roster CRUD／validation、開季建立快照與五筆首周回已完成。
- `WorldBossBattleService`：指定 round attack、溢傷截斷、season row lock、最後一王觸發下一周回已完成。
- `WorldBossRound` model：join roster 取得 season／position／snapshot，並支援目前周回與 row lock。
- Admin handler/API：season payload 要求五王位置；active/settled roster 唯讀已完成。
- Public status API：回傳 `{ cycleNo, rounds[] }`，attack API 使用 authenticated LIFF 的 `roundId`。
- Legacy chat attack postback 已停用並 silent no-op；群組 `#世界王` 只提供 LIFF URI。
- quota、cooldown、EXP、contribution、settlement、reward 與 reply-only broadcast flow 已接上 v2。

### LINE Flex

- `#世界王` 已改為五王 carousel，每張顯示位置、王、HP、cleared 狀態與 LIFF URI。
- 已擊破王不提供攻擊按鈕。
- 攻擊結果與個人 quota／EXP／累積傷害由 authenticated LIFF 顯示；群組只保留可節流的公共擊破公告。

### Frontend

- Admin `/admin/worldboss` 已加入五個固定 position、不可重複且建立時必填的 selectors。
- LIFF `/worldboss` 已顯示目前周回五王、各自 HP／cleared 狀態、排行榜、個人進度與攻擊結果。
- status、leaderboard、me 的 season snapshot coherence 與 attack response merge 已實作。

### Tests

- backend 已涵蓋 migration constraints、roster validation、開季原子建立、自由選王、stale／cleared target、溢傷、quota、EXP、settlement、reward 與 concurrency scenarios。
- frontend 沒有 test runner，因此五王 LIFF／Admin UI 目前沒有 automated coverage。

## 6. 粗略工作量

- 性質：中大型改造，implementation 已在 working tree，尚未 commit 或部署。
- 實際變更約 3000 insertions，分布於約 35 個 modified files 與 4 個 new files，涵蓋 backend、migration、LINE Flex、LIFF、Admin frontend 與 tests。
- 可保留約一半以上既有 season／quota／reward 架構。
- 主要 review 風險：最後幾隻王被 concurrent attacks 擊破時，周回只能切換一次，且不能漏算／多算有效傷害。

## 7. 已定案決策與待使用者確認

本節原本是下次討論的 open questions；implementation 已回答大部分問題，以下記錄實際決策與仍未經使用者確認的產品行為。

### 7.1 核心資料模型

已定案為第 3 節的 roster join normalisation：round 只存 `season_boss_id`、`cycle_no`、HP 與 `cleared_at`，不重複存 season／position／status。

### 7.2 Draft roster

建立 season 時就必須傳入**恰好五個** `boss_ids`，且不可重複；draft 狀態下仍可修改五王。實作見 `app/src/service/WorldBossSeasonService.js:150-160`、`:165-173` 的 `normalizeBossIds` 與 create/update flow。

### 7.3 Postback identity 與攻擊入口

攻擊現由 authenticated LIFF API `POST /api/world-boss/attack` 處理，client 傳 `roundId`，server 以 authenticated profile 作為 user identity；實作見 `app/src/handler/WorldBoss/public.js:82-96`。舊 chat postback 不再進入攻擊流程，`WorldBossController.attackOnBoss()` 為 silent no-op，見 `app/src/controller/application/WorldBossController.js:22-35`。

### 7.4 Concurrency

每次 attack 先對單一 active season row 使用 `FOR UPDATE`，所有 attack 因而全域 serialise；實作見 `app/src/service/WorldBossBattleService.js:232-258`。這比原提案的 per-target locking 保守，正確性優先但放棄五王間的 parallelism；只有實測 lock wait 後才需要重新評估。

### 7.5 周回切換與 invariant

最後一隻王在同一 transaction 內確認五筆 round 全部 cleared，再建立下一周回。`UNIQUE(season_boss_id, cycle_no)` 保留作為 invariant backstop；因 season row lock 已保護建立路徑，unique violation 不再被當成可恢復 race。

### 7.6 Admin UX

Admin 使用五個固定且不可重複的 position selectors，建立 season 時必須全部選滿；實作見 `frontend/src/pages/Admin/Worldboss.jsx:105-191` 與 `:336-355`。

### 7.7 群組不再能直接攻擊（已確認）

群組 Flex 只提供 LIFF URI，沒有 attack postback；實作見 `app/src/templates/application/WorldBoss.js:193-207`，舊 postback 在 controller silent no-op。原本只要求 postback 帶 encounter identity，實作進一步完全移除群組 postback attack。

2026-08-18 使用者確認**接受**：攻擊一律走 LIFF，群組只呈現公共戰況與 LIFF 入口。這也讓群組訊息設計原則更容易維持——攻擊結果屬於個人狀態，本來就不該回進群組。

### 7.8 全滅回覆的顯示範圍（已確認）

原第 2.6 節要求全滅回覆只顯示本次結果與「本周回全滅」，玩家再次輸入 `#世界王` 才看到新周回五王。現行 LIFF 在 attack response 直接顯示「本周回全滅！第 N 周回開始」，見 `frontend/src/pages/Worldboss/index.jsx:491-510`（文字在 `:502-505`）。

2026-08-18 使用者確認**接受**：§2.6 的限制只適用於群組 reply，LIFF 屬於私人脈絡，可直接顯示新周回已開始。

### 7.9 v1 王圖鑑不轉換（已確認）

v1 teardown 會 `DROP TABLE world_boss`（`app/migrations/20260719171943_drop_world_boss_v1.js:13`），v2 再重建同名但不同 schema 的表（`20260719174434_create_world_boss_v2.js:19`）。v1 的 `level`／`hp`／`attack`／`defense`／`speed`／`luck`／`exp`／`gold` 在 v2 沒有對應欄位——v2 的王只有 `hp_weight` 權重，實際 HP 由賽季 tier 推算。因此線上既有的 v1 王資料在 v2 無處可放。

2026-08-18 使用者確認：**不寫轉換 migration**，直接使用 `app/seeds/WorldBossCatalogSeeder.js` 的五隻王（山嶺巨像 1、深淵雙頭犬 0.9、暴風飛龍 1.1、冥府騎士 1.25、潮汐海皇 1.4）。五王周回恰好需要五隻，seeder 已備齊。v1 的王名與圖片不保留。

## 8. 本機 E2E 狀態

原先記錄的 Season 1／Round 1 本機測試資料已過時，不再作為 v2 驗證基準。決策為 **fresh-install only**：本機 DB 會直接刪除後重建，不寫 upgrade/conversion migration。

```bash
drop database Princess
cd app && yarn migrate && yarn knex seed:run
```

理由是 v2 migrations 只存在於這個尚未 release 的 feature branch；`origin/main` 沒有任何 v2 migration，因此不存在需要支援的既有 production schema upgrade path。重建後再進行新的 E2E，不保留文件原先的 Season ID、HP 或攻擊紀錄。

## 9. 本輪 review 已完成的修正

- `app/src/util/broadcastQueue.js`：drain lock 改為 UUID ownership token；release 使用 Lua compare-and-delete，`lTrim` 前再以 Lua atomic renew／ownership re-assert。lock 在 drain 中途被接管時不再錯誤 trim，避免 duplicate announcement 與 silent event loss。
- `app/migrations/20260719174434_create_world_boss_v2.js`：新增 `chk_wbr_cycle_no_positive`，強制 `cycle_no >= 1`；只靠 `UNSIGNED` 允許 0 的問題已修正。
- `app/src/service/WorldBossAttackService.js`：移除 transaction 外、非 authoritative 的 daily quota precheck；quota 現只由 `WorldBossBattleService` 在 season row lock 內重算。對 `ROUND_STALE`、`ROUND_CLEARED`、`DAILY_LIMIT_EXCEEDED` 等未產生 attack 的錯誤，以 ownership token compare-and-delete 釋放 cooldown。
- `app/src/service/WorldBossBattleService.js`：移除 `openCycle()` 將 unique violation 視為 recoverable race 的路徑；season row lock 使該 race path unreachable，真實 corruption 應 rollback，不應被掩飾。unique constraint 仍保留作 invariant backstop。
- migration drift／ownership machinery（完整 `SHOW CREATE TABLE` signature comparison、definition counting、partial ownership 判斷）已刪除。這類機制只能救「migration 自己跑到一半失敗」，救不了「knex 已記錄該 migration 因此不再執行」，在 fresh-install-only 策略下屬於 dead sophistication。殘留的 `TABLE_SIGNATURES`／`rawSqlSignatures` export 也一併移除（全 repo 零引用）。
- concurrency test 已改為真正使用兩個 DB connections，測試名為「兩名玩家同時擊殺最後兩隻王」的 scenario 不再只是單 connection 內交錯呼叫的假併發。

## 10. 已知未解決／刻意 deferred

- season row lock 是全域 serialiser，放棄五王 parallelism；目前以 correctness first 為準，只有測得 lock wait 才重新設計。
- `listSeasons()` 是 N+1：`app/src/service/WorldBossSeasonService.js:143-147` 逐季呼叫 `getSeasonRoster()`；目前資料量可接受。
- `getBattleStatus()` 先讀 season、再讀 current cycle，跨周回 rollover 時可能讀到 torn snapshot；相關路徑為 `app/src/service/WorldBossSeasonService.js:232-237` 與 `app/src/model/application/WorldBossRound.js:62-65`。這只影響 display，不影響 damage accounting。
- `world_boss_contribution` 沒有 `round_id` FK，DB 也無法保證 contribution 的 `season_id` 與 round 所屬 season 一致；migration 見 `app/migrations/20260719174434_create_world_boss_v2.js:131-143`。目前不擴大 scope。
- frontend 沒有 test runner，五王 LIFF／Admin UI 沒有 automated coverage。
- `broadcastQueue` 發生 `lock_lost` 時，slice 已送出但不 trim，下一 cycle 會重送；這是 deliberate duplicate-over-loss trade，優先避免公告遺失。
