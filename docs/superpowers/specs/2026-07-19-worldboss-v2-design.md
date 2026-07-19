# 世界王 v2 — 全服共鬥賽季制 重新設計

- 日期：2026-07-19
- 狀態：設計定案（brainstorming 完成，待實作規劃）
- 範圍：v2 greenfield 重寫 — 舊世界王功能**全部拆除**，不做資料搬遷、不做向前相容

## 1. 背景：現況架構缺陷

盤點（2026-07-19，branch `main`）確認五組結構性缺陷：

1. **生命週期沒有主人** — 無 cron、無狀態機。開王靠管理員手動、王死只是顯示層 no-op、活動結束無人收尾。
2. **真相來源錯位** — 王血從不儲存，每次 `SUM(world_boss_event_log.damage)` 推導；無法原子判定、併發不安全、顯示要全表聚合。
3. **God object** — `WorldBossController.js`（900+ 行）同時是指令 router、REST API、傷害引擎、冷卻限制、回覆批次、升級計算；模板硬編 imgur URL。
4. **資料模型半殘** — `attack/defense/speed/luck` 死欄位；`gold` 從不發放；無結算交易層；獎勵以副作用塞在攻擊流程。
5. **零測試** — 三個既有 bug 長期未被發現（文字攻擊死路、`#夢幻回歸` crash、`boss_top_damage` 永不解鎖）。

結論：不修補，整套以 v2 重寫，舊件連根拔除。

## 2. 產品設計（核心迴圈）

### 2.1 賽季外框

- 賽季 = 全服單一戰場，一段固定時間窗（`start_time`–`end_time`）。
- **開季手動**：管理員在管理頁按「開啟新賽季」，自行決定時機與時間窗。系統**不會**自動開季。
- **結算自動**：cron 掃「已到期未結算」賽季，跑冪等結算。
- 賽季結束 → 發名次獎 → 貢獻榜與進度歸零 → 等管理員開下一季。

### 2.2 無限輪滾動王

- 賽季內輪次無上限，「第 N 輪」即全服共同進度指標。
- 一輪一隻王：每輪從王圖鑑挑一隻（**隨機、避免與上一輪重複**），套當輪 tier 血量。
- 血量曲線：前 1–10 輪低血（新手坡），之後分階段成長；公式 = `tierFormula(round_no) × 圖鑑.hp_weight`，曲線是 config 可調參數。
- 全服共享同一隻王的血量，不分群組（公平性優先，人數不同的群組不各自開戰場）。

### 2.3 戰鬥：攻擊當下原子結算（on-hit）

- 玩家攻擊（沿用現有 RPG 職業角色傷害 + 裝備加成、5 秒冷卻、每日攻擊上限）。
- 傷害在**單一 DB 交易**內直接原子扣王血；血歸零即清輪、立即開下一輪。
- **溢傷滾動**：超出的傷害帶進下一隻王，低血輪可能一刀連清數輪。無浪費、無 feel-bad。
- 不做背景攤傷 tick：reply-only 環境下玩家只在互動當下看得到進度，on-hit 給最新血量，批次心跳無受眾。

### 2.4 獎勵（混合制）

| 時點 | 內容 | 機制 |
|---|---|---|
| 每刀 | 固定聊天經驗（config 可調；每日上限天生封頂 faucet） | 攻擊交易內發放 |
| 清輪 | 進度公告（「第 N 輪討伐成功」），**不發料** | 純顯示 |
| 賽季末 | 依本季總傷害排名：少量女神石 + 賽季稱號 | cron 冪等結算 |

- 女神石**只在賽季末**出現（稀缺、faucet 好控）；走 Inventory ledger（item 999）。
- 排名單一維度：本季累積總傷害。不做分職業多榜。
- 無 LINE Push：結算結果靠下次互動的戰報卡 + LIFF 頁浮現。

### 2.5 呈現

- **聊天**：`#世界王` → Flex 卡（當前王、血條快照、第 N 輪、攻擊鈕、開 LIFF 鈕）；攻擊 → reply 個人貢獻（造成傷害、王剩血、本季累計、今日剩餘次數）。
- **LIFF 戰況板**：血條、當前輪次、本季貢獻排行榜、個人戰報。豐富呈現集中於此。
- 接受的限制：無即時共享血條（各自互動當下的快照）、清輪/換王無法主動廣播、無倒數計時器。

## 3. 資料模型（全新 5 張表）

```
world_boss                 王圖鑑（純身分卡）
  id, name, image, description, hp_weight (float, default 1.0)

world_boss_season          賽季
  id, name, announcement,
  status ENUM(draft, active, settled),   -- 'ended' 為推導態：active 且 now > end_time
  start_time, end_time, settled_at

world_boss_round           每輪王實例（兼戰報歷史）
  id, season_id, round_no, world_boss_id,
  max_hp, current_hp,                    -- current_hp 為唯一熱寫入欄位
  status ENUM(active, cleared), cleared_at
  UNIQUE (season_id, round_no)

world_boss_contribution    貢獻記錄
  id, season_id, round_id, user_id, damage, cost, created_at
  INDEX (season_id, user_id) / (round_id) / (user_id, created_at)

world_boss_season_reward   賽季結算冪等 ledger
  id, season_id, user_id, rank, stone_amount, title, created_at
  UNIQUE (season_id, user_id)
```

設計要點：

- 「當前輪」的唯一真相 = round 表 `status='active'` 那筆；season 表**不**冗存 current_round_no。
- 王血持久化於 `world_boss_round.current_hp`，只由攻擊交易寫入。
- 賽季排名 = `SUM(damage) GROUP BY user_id`（`(season_id, user_id)` 索引支撐）。
- 每日上限沿用「今日 cost 加總」（`(user_id, created_at)` 索引支撐）。
- 逐輪不設 reward 表（即時甜頭由 per-hit EXP 承擔）。

## 4. 架構分層

```
app/src/
├── model/application/
│   ├── WorldBoss.js               圖鑑 CRUD
│   ├── WorldBossSeason.js         賽季 CRUD
│   ├── WorldBossRound.js          輪次 CRUD + 原子扣血 method
│   ├── WorldBossContribution.js   貢獻 CRUD + 排名/每日 cost 聚合
│   └── WorldBossSeasonReward.js   ledger + tryInsert（仿 JankenDailyRewardLog）
├── service/
│   ├── WorldBossBattleService.js  戰鬥核心（唯一改王血的地方）
│   └── WorldBossSeasonService.js  賽季生命週期 + 排名 + 冪等結算
├── controller/application/
│   └── WorldBossController.js     薄殼：解指令 → 呼叫 service → 選 template
├── router / handler/
│   └── worldboss admin API        圖鑑 CRUD + 賽季 CRUD/開季 + LIFF 讀取 API
├── templates/application/
│   └── WorldBoss.js               純 Flex JSON builder（不查資料）
└── bin/WorldBossSeasonSettle.js   唯一 cron：掃到期賽季 → 結算
```

分層鐵則：model 不懂遊戲規則、service 不懂 LINE、controller 不懂資料庫、template 不懂一切。

### 4.1 攻擊交易（戰鬥核心）

```
controller: 撈玩家角色算傷害（RPG + 裝備）→ BattleService.attack(userId, damage)
┌─ transaction ────────────────────────────────────────────────┐
│ 1. SELECT active round FOR UPDATE（鎖 row）                   │
│ 2. current_hp -= damage                                       │
│ 3. 若 ≤ 0：標 cleared → 建下一輪（換王、新 tier 血），         │
│    溢傷帶入，loop 直到溢傷耗盡（可連清多輪）                    │
│ 4. INSERT contribution（season_id, round_id, damage, cost）   │
│ 5. 發 per-hit EXP（固定值）                                   │
└───────────────────────────────────────────────────────────────┘
→ 回 { damage, 王剩血, 清輪與否, 現在第 N 輪 } → controller 選卡回覆
```

- 併發：`FOR UPDATE` + UNIQUE `(season_id, round_no)` 雙保險；兩人同時補刀只會有一人建出下一輪。
- 冷卻（redis 5s）與每日上限（contribution 今日 cost 加總）在 controller 前緣檢查，進不了 service 就擋掉。

### 4.2 賽季狀態機

```
draft ──(管理頁「開季」)──▶ active ──(now > end_time，讀取時判定)──▶ [ended] ──(cron)──▶ settled
```

- 手動動作只有「開季」。`ended` 不落庫，是讀取推導。

### 4.3 結算 cron

`bin/WorldBossSeasonSettle.js`（crontab 每小時）：

1. 找 `status='active' AND end_time < now` 的賽季。
2. 排名 → 逐人 `tryInsert` reward（UNIQUE 擋重複）→ 同交易 `increaseGodStone` + 發稱號。
3. 全數完成 → season 標 `settled`。中途失敗重跑即可，ledger 冪等。

## 5. 拆除清單（v2 上線的 teardown）

- **DB**（一支 teardown migration 全 drop）：`world_boss`（舊版）、`world_boss_event`、`world_boss_event_log`、`world_boss_user_attack_message`、`attack_message_has_tags`。
- **後端**：舊 `WorldBossController.js`、`WorldBossEventService`、`WorldBossEventLogService`、`WorldBossUserAttackMessageService`、5 支舊 model、舊 template、`router/WorldBoss*` + `handler/WorldBoss*` + api.js feature-message 段、`app.js` 舊 wiring。
- **前端**：`Admin/Worldboss.jsx`、`WorldbossEvent.jsx`、`WorldbossMessage*.jsx` + NavDrawer/route。
- **Cron/成就/設定**：`bin/TitleDelivery.js` 的 `deliveryWorldBossTitles` + crontab 條目；舊 `world_boss` 成就與 progressors/leechers 稱號（v2 成就另行設計）；`default.json` worldboss 區塊與 redis keys 重寫。
- **隨拆即廢的功能**（不修，直接刪）：夢幻回歸、自訂攻擊訊息、debug 指令（`/bosslist`、`/allevent`、`/worldrank`）、文字攻擊死路。

## 6. 錯誤處理

- 無 active 賽季 / 賽季已到期時攻擊 → 友善 Flex 提示（禁止 silent no-op）。
- 攻擊交易失敗 → 整筆 rollback（血、貢獻、EXP 同生共死）。
- 結算中途失敗 → cron 下輪重跑，冪等保證不重複發。

## 7. 測試底線（v2 起步即補）

| 標的 | 必測 |
|---|---|
| BattleService | 扣血正確、清輪推進、溢傷連清多輪、併發建輪只成功一人（unique 衝突路徑） |
| 結算 | 排名正確、跑兩次不重複發（冪等）、女神石與稱號同交易 |
| 狀態機 | draft 不能打、到期不能打、settled 不重結算 |

Template 外觀不測。

## 8. 可調參數（config，數值後定）

- HP tier 曲線（前 10 輪低血、分階成長的分段表）、`hp_weight`
- per-hit EXP 固定值
- 每日攻擊上限、攻擊冷卻秒數
- 賽季末名次獎階梯（女神石數量 × 名次區間、稱號）

## 9. 明確不做（out of scope）

- 三職（補師/坦克）、待救池、格擋窗口 — 另案再議
- 裝備強化素材掉落 — 另案再議
- 分職業多榜、跨職換算
- 溢傷追擊/目標選擇（全服制下無張力，已以溢傷滾動取代）
- 資料搬遷、向前相容
- LINE Push（硬限制，設計已繞開）

## 10. 決策軌跡（摘要）

依討論順序：範圍 B+（架構 + 補完玩法破洞）→ 固定天數活動外框 → 多王/溢傷構想收斂為全服共王（公平性優先）→ 傷害池 + 定期攤傷 → 因「開季手動」改為 on-hit 原子扣血（批次心跳在 reply-only 下無受眾）→ 無限輪 + 前 10 輪新手坡 → 混合結算（逐輪甜頭 + 賽季末名次獎）→ 女神石僅賽季末 → v2 greenfield 全拆舊件。
