# 世界王 v2 — 全服共鬥賽季制 重新設計

- 日期：2026-07-19
- 狀態：設計定案，implementation plan 已修訂
- 範圍：v2 greenfield 重寫；舊世界王功能全部拆除，不做資料搬遷、不做向前相容

## 1. 背景：現況架構缺陷

盤點（2026-07-19，branch `main`）確認五組結構性缺陷：

1. **生命週期沒有主人**：無 cron、無狀態機；開王靠管理員手動，王死與活動結束沒有一致收尾。
2. **真相來源錯位**：王血從不儲存，每次由 log 聚合推導，無法原子判定且併發不安全。
3. **God object**：舊 controller 同時負責指令、REST API、傷害、冷卻、回覆與升級計算。
4. **資料模型半殘**：多個死欄位，沒有結算交易層，獎勵副作用混在攻擊流程。
5. **零測試**：文字攻擊、夢幻回歸與成就流程的既有 bug 長期未被測出。

結論：不修補，整套以 v2 重寫，舊件連根拔除。

## 2. 產品設計

### 2.1 賽季外框

- 賽季是全服唯一戰場，具固定 `start_time`–`end_time` 有效窗。
- 管理員先建立 draft，再按「開季」。**開季立即生效**：server 在同一 transaction 以自己的 clock 寫 `start_time=now`，驗證 `end_time` 可解析且 `end_time>now`，並建立第 1 輪。UI/API 不提供 future start scheduling。
- Production active slot 固定為 `1`；資料庫 UNIQUE active slot 加上 transaction lock/recheck，讓併發開季最多成功一筆。
- 草稿可建立、讀取、更新、刪除；active／settled 一律拒絕更新與刪除。
- cron 掃描到期未結算賽季，鎖定同一個 season row 後重查 status 與有效窗，再執行冪等結算。
- 賽季結束後發名次獎，進度留在歷史表供查詢；新賽季使用新的 contribution/round rows，不搬前季進度。

### 2.2 無限輪滾動王

- 賽季內輪次無上限，「第 N 輪」是全服共同進度。
- 每輪從王圖鑑隨機挑一隻；圖鑑多於一隻時避免與上一輪重複。
- 血量為 `tierFormula(round_no) × boss.hp_weight`，前 1–10 輪是新手坡，後續分階段成長；config 可調。
- 全服共享同一隻王與同一筆持久化血量，不依群組分戰場。

### 2.3 攻擊當下原子結算

- 玩家沿用 RPG 職業角色傷害、裝備加成、5 秒冷卻與每日 cost 上限。
- 傷害在單一 DB transaction 原子扣血；血歸零即清輪並建立下一輪。
- 溢傷直接帶進後續輪次，一刀可連清多輪。
- 不做背景攤傷 tick；reply-only 環境只在玩家互動當下有受眾。
- Controller 的每日剩餘量 precheck 只改善 UX；權威 quota 在 attack transaction 內判定。新玩家的第一刀由 controller 以 Lv.1 adventurer 計傷但不先寫 DB，`minigame_level` 只能在 attack transaction 的 lock/find-or-create 流程建立。

### 2.4 獎勵

| 時點 | 內容 | 機制 |
|---|---|---|
| 每刀 | 固定 RPG 職業經驗 | 攻擊 transaction 內更新 `minigame_level` |
| 清輪 | 「第 N 輪討伐成功」公告 | 純顯示，不發素材 |
| 賽季末 | 少量女神石 + 賽季稱號 | cron 依總傷害排名，在安全 transaction 內發放 |

- 每刀發的是 RPG 職業經驗，不是聊天經驗。固定值取代 v1「傷害比例 × boss.exp」；裝備 `exp_bonus` 繼續加成。EXP transition 使用 `minigame_level_unit[level+1].max_exp` 作為下一級門檻，可連升並保留餘數；最高 configured level 沒有下一門檻，`nextLevelExp=null` 且 EXP 繼續累積，不可 dereference missing row。
- 女神石只在賽季末出現，走 Inventory item 999 ledger。
- 排名只有本季累積總傷害。相同總傷害採 competition ranking `1,1,3`：每位同傷玩家 ledger 寫相同 rank，取得完全相同的石頭／稱號 tier；接受同 tier 人數增加造成的少量額外發放。
- 無 LINE Push。每位本季有 contribution 的玩家都會有 authoritative paid reward ledger；超出 configured reward tier 仍寫 `stone_amount=0`、`title_key=null`、`paid_at`，不能只替前 50 名建 ledger。玩家下一次聊天互動與 LIFF 都必須顯示最近 settled season 的個人 `rank`、總傷害、石頭、稱號與 ledger proof（含 `rewardId`／`paidAt`），即使已有更新的 active 賽季也不能遮掉該結果。

### 2.5 呈現

- **聊天**：`#世界王` 在 active 時回戰況 Flex（王、血量、第 N 輪、攻擊、LIFF），同一次互動附上最近 settled 個人獎勵卡；沒有 active 時仍回獎勵卡，只有兩者皆無才回無賽季提示。成功攻擊的 reply 也可附最近獎勵卡。
- **LIFF 戰況板**：active 戰況、本季排行榜、個人戰報；無論 active 與否都顯示最近 settled reward。
- **管理頁**：王圖鑑 CRUD；賽季 draft create/update/delete/open。active／settled 只讀，沒有 future start 欄位。
- 接受限制：無共享即時推播、清輪／換王無主動廣播、真實 LINE reply token + LIFF auth E2E 只能人工驗收。

## 3. 資料模型（全新五張表）

```text
world_boss
  id, name VARCHAR(64), image, description,
  hp_weight DECIMAL > 0,
  created_at, updated_at

world_boss_season
  id, name, announcement,
  status ENUM(draft, active, settled),
  active_slot,                         -- production active 固定 1，其他 NULL；UNIQUE
  start_time, end_time, settled_at,
  created_at, updated_at
  CHECK status/active_slot 一致

world_boss_round
  id, season_id, round_no, world_boss_id,
  max_hp > 0, 0 <= current_hp <= max_hp,
  status ENUM(active, cleared),
  active_slot,                         -- active 固定 1，cleared NULL
  cleared_at, created_at, updated_at
  UNIQUE(season_id, round_no)
  UNIQUE(season_id, active_slot)
  CHECK status/active_slot 一致

world_boss_contribution
  id, season_id, round_id, user_id, damage, cost, created_at, updated_at
  INDEX(season_id, user_id), INDEX(round_id), INDEX(user_id, created_at)

world_boss_season_reward
  id, season_id, user_id, ranking, total_damage,
  stone_amount, title_key, paid_at,
  created_at, updated_at
  UNIQUE(season_id, user_id)
```

設計要點：

- 「當前輪」唯一真相是 round 表 `status='active'` 且 `active_slot=1` 的 row；season 不冗存 current round number。
- 王血只由 BattleService transaction 更新。
- 排名 query 為 `SUM(damage) GROUP BY user_id ORDER BY total_damage DESC, user_id ASC`；service 對相同 damage 分組產生 competition rank。
- 每日 quota 不新增第六張表。attack 先 `FOR UPDATE` 鎖玩家 `user` parent row，再鎖／必要時建立該玩家的 `minigame_level`，依 injected clock 以 `Asia/Taipei` 計算該日 `[00:00,next 00:00)` 的 UTC instants，然後在同一 transaction 加總半開區間 contribution；不得依 MySQL session timezone 或 `DATE(created_at)`。這把 per-user lock 同時序列化 quota 與 RPG EXP。
- reward ledger 的 `paid_at` 是完成標記；每位 contributor 都有 ledger，無 tier 者以零石／無稱號完成，有 tier 者只在女神石與稱號於同 transaction 成功後寫入。settled 要求完整 unbounded ranking 中每位 contributor 的 ledger 都已 paid。
- 所有 API datetime 序列化為 UTC ISO 8601（含 `Z`）；mysql2 connection 固定 `timezone: "Z"` 並以真實 DB round-trip test 驗證 exact instant，frontend 只在顯示時使用 locale formatting。

## 4. 分層與介面

```text
app/src/
├── model/application/
│   ├── WorldBoss.js
│   ├── WorldBossSeason.js
│   ├── WorldBossRound.js
│   ├── WorldBossContribution.js
│   └── WorldBossSeasonReward.js
├── service/
│   ├── WorldBossCatalogService.js
│   ├── WorldBossBattleService.js
│   └── WorldBossSeasonService.js
├── controller/application/WorldBossController.js
├── templates/application/WorldBoss.js
├── router/WorldBoss + handler/WorldBoss
└── bin/WorldBossSeasonSettle.js
```

分層鐵則：model 不懂遊戲規則；service 不懂 LINE；controller 不直接查 model/DB；template 是純 Flex JSON builder；admin handler 經 service 做 validation/CRUD。

### 4.1 攻擊 transaction

```text
controller 計算 RPG/裝備傷害
┌─ one DB transaction ──────────────────────────────────────────────┐
│ 1. validate attackType、damage、cost、exp                         │
│ 2. SELECT active season FOR UPDATE；重查 status 與 now<end_time  │
│ 3. SELECT user FOR UPDATE；鎖／必要時建立 minigame_level          │
│ 4. SUM today's contribution cost in same trx；超限即 rollback    │
│ 5. SELECT active round FOR UPDATE；guard max_hp>0                 │
│ 6. 扣血；清輪時 status=cleared/active_slot=NULL，溢傷 loop         │
│ 7. 建下一輪 active_slot=1；UNIQUE conflict 時重讀唯一 active round │
│ 8. INSERT contribution                                           │
│ 9. UPDATE locked minigame_level RPG EXP                           │
│10. 讀本季總傷害與剩餘 quota，commit                               │
└───────────────────────────────────────────────────────────────────┘
```

- 強制 EXP failure 必須使 quota evidence、HP、round、contribution、EXP 全部 rollback。
- 同玩家接近每日上限的 concurrent attacks 必須只有一筆成功。
- 兩個 actual concurrent lethal service attacks 必須恰有一筆新 active round，並實際覆蓋 named UNIQUE recovery branch。因兩者先序列化在同一 season lock，測試以第一筆 transaction 的 awaited hook 建立衝突 row、第二筆真實 service call 等待 season lock；不用 sleep，也不假設兩筆能同時進 round insert。

### 4.2 賽季狀態機

```text
draft ──(管理頁立即開季)──▶ active ──(now >= end_time，推導 ended)──▶ [ended] ──(cron)──▶ settled
```

- `ended` 不落庫。攻擊與結算共用 `now >= end_time` 邊界：相等時禁止攻擊且允許結算。
- open/update/delete 都先 lock target season；open 由 DB UNIQUE active slot 仲裁併發。`ER_LOCK_DEADLOCK` 必須放棄整個 transaction 並最多重試兩次，不能在 deadlocked trx 內繼續；耗盡後重讀 winner，有 winner 映射 `ANOTHER_SEASON_ACTIVE`，否則原錯誤上拋。

### 4.3 結算 transaction

每季結算使用一個 outer transaction：

1. `SELECT season FOR UPDATE`，重查 active 且 `now>=end_time`。
2. 取得完整排名並計算 `1,1,3` competition ranks。
3. 以 internal **unbounded** ranking query 取得所有 contributor（public leaderboard 的 1–100 limit 不得套用）；每位都 lock 或建立 UNIQUE ledger。
4. 若有 reward tier 且尚未 paid，在同一 transaction 發女神石、稱號；無 tier 則寫零石／無稱號；兩者最後都寫 `paid_at`。
5. 驗證完整 contributor 數等於 paid ledger 數；最後才把 season 寫成 `settled`、`active_slot=NULL`、`settled_at=now`。

付款、稱號或 invariant failure 會 rollback 整季 transaction，season 保持 active 供重試。併發 cron 因 season row lock 序列化；已 paid ledger 不重付，未 paid ledger 可完成，永遠不能 double-pay 或在付款未完成時 settled。

### 4.4 對外 contract

- Admin API：boss CRUD；season list/create/update/delete/open。season update/delete 是 draft-only。
- Public API：status、leaderboard（limit 整數 1–100）、me。
- `GET /api/world-boss/me` 即使沒有 active 也回 `latestReward`；有 active 時同時回 `current` 與 `latestReward`。
- Template/controller：`getLatestSettledResult(userId)` 的 rank/stones/title ledger 會在下一次 `#世界王` 或攻擊 interaction 顯示。
- Frontend：admin form 將 `datetime-local` 轉 `Date(...).toISOString()` 後送出，且只送 `end_time`；LIFF 以 API ISO string 顯示 locale time。

## 5. v1 teardown 與 rollback

- DB drop：`world_boss`（v1）、`world_boss_event`、`world_boss_event_log`、`world_boss_user_attack_message`、`attack_message_has_tags`。
- Backend：舊 controller/services/models/template/router/handler/schema、feature-message API、舊 config/tracking/copy。
- Frontend：舊五個 admin pages/routes/nav entries。
- Cron/成就/稱號：移除 v1 delivery 與四個 v1 achievements、progressors/leechers；保留共用 `boss_attack → social_all_features`。
- **正式退役的邊界是聊天入口**：`#冒險小卡` 與 v1 controller 內的 `#裝備` chat route 不重建；Task 1 移除，final residual scan 不得期待或保留它們。獨立 Equipment API、LIFF 裝備頁、`EquipmentService` 與 RPG 裝備加成不在 teardown 範圍，v2 攻擊繼續沿用。
- 同步退役：夢幻回歸、自訂攻擊訊息、v1 debug 指令、文字攻擊死路。

Rollback 必須誠實：

- v1 teardown migration `down()` 重建五張**空的** final v1 schemas；不宣稱恢復資料。
- v2 migration `down()` 先刪依賴 v2 title IDs 的 `user_titles`，再刪 v2 titles 與 tables。
- v1 資料損失仍是 greenfield 的刻意決策；migration 前必須建立非空 DB dump，handoff 記錄精確 backup path 與 restore command。需要資料復原時先停 bot/worker，再用該 dump restore。

## 6. Validation 與錯誤處理

- Boss name trim 後必填且 ≤64；`hp_weight` finite 且 `>0`。
- Season name trim 後必填且 ≤64；日期可解析；create/update/open 都驗證 `end_time>now`；client `start_time` 不會影響開季。
- Attack type 僅 `standard|skill`；damage/cost/exp finite 且 `>0`。
- Leaderboard limit 缺省 50，只接受 1–100 整數；非法值回 400，不 silent clamp。
- `maxHp<=0` 是 service domain error，不能產生 NaN/Infinity 血條。
- 無 active／到期／quota 耗盡回友善 reply；未知錯誤不吞掉。
- 直接執行 settlement cron 時，依賴／DB／service rejection 必須 exit nonzero；不可 catch 後 exit 0。

## 7. 測試與驗收底線

| 標的 | 必測 |
|---|---|
| Schema | ENUM/CHECK/UNIQUE constraints 存在；v2 down 先清 dependent user_titles；v1 down 重建空 schemas |
| Catalog/model | boss validation；bounded limit；deterministic rank order；latest settled paid reward lookup |
| BattleService | 扣血、溢傷連清、EXP 同 trx、forced EXP rollback、expiry equality、invalid numbers、maxHp guard、near-limit concurrent quota、actual concurrent lethal + unique recovery |
| SeasonService | draft CRUD guards、immediate server-now open、concurrent open one winner、`1,1,3` same tier、concurrent/retry no double-pay、forced payment rollback/no settled |
| Cron | subprocess forced failure exits nonzero，success exits 0 |
| API/chat | active + latest reward、no active + latest reward、UTC ISO `Z`、invalid limit/date/weight/attack type |
| Frontend | lint/build；manual active+reward/no-active+reward/draft CRUD/UTC request checks；LINE E2E explicitly manual |

真實 DB 測試只能建立／刪除 test-owned rows（`__wbtest_` prefix、injected test active slot），或在 transaction 內驗證後 rollback；不得 truncate、清空共享 `user_titles`、覆寫 boss catalog，或要求共享 DB 沒有 production active season。每個 suite 要有 deterministic cleanup 與 sentinel assertion。

worldboss 測試加入後，全套 app suite 一律 `yarn test -- --runInBand`。每個改 JS/JSX 的 task 在 commit 前跑 Prettier。Final gate 必須跑 `yarn format:check`、app lint/full suite、frontend lint/build、`git diff --check`，並掃新增的 placeholder debt：`TODO`、`FIXME`、`test.skip`、`.only`、`NotImplemented`、empty catches、`ponytail:`。不得改寫無關註解只為讓 grep 變零。

## 8. 可調參數

- HP tier 曲線與 `hp_weight`
- per-hit RPG EXP
- 每日 cost 上限與冷卻秒數
- 賽季 reward tier 的女神石與稱號

## 9. 明確不做

- 三職玩法、待救池、格擋窗口
- 裝備強化素材掉落
- 分職業多榜、跨職換算
- 目標選擇／追擊；由全服單一王 + 溢傷滾動取代
- v1 資料搬遷與向前相容
- LINE Push
- Task 14 自動 push、PR 或 deploy；本 plan 到 local verification + fresh review 即停止

## 10. 決策摘要

設計由固定活動外框與多王構想，收斂為全服單一 active season、無限輪、on-hit 原子扣血與混合獎勵。產品決策固定為：開季由管理員觸發但 server 立即起跑；同傷採 `1,1,3` 並同 tier 發獎；`#冒險小卡`／`#裝備` **聊天入口**隨 v1 退役，但獨立裝備系統與戰鬥加成保留。工程修訂再補上 DB active-slot 約束、per-user row lock quota、同 transaction RPG EXP、完整 draft CRUD、全員 latest settled reward ledger、安全結算、truthful rollback、shared-DB isolation、UTC serialization 與可執行 failure/concurrency gates。
