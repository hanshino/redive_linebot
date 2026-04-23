# 說話等級大改版：實作計畫

本文件為 [`chat-level-prestige.md`](./chat-level-prestige.md) 的執行端。Spec 定「要做什麼」，本文件定「怎麼做、什麼順序、什麼時候完成」。

Branch：`feat/chat-level-prestige`

## 設計原則

- **Backend-first**：先完成 XP pipeline 跑得動，再做 LIFF 前端
- **資料層 → 邏輯層 → UI 層** 線性推進
- **單獨可測**：每 Milestone 結束都能 `yarn test` 通過
- **不破壞現役**：所有改動走新表；舊表保留到 rollback window 過期（T+72h）

## 預估工時

- 單 agent 線性：約 4–5 週
- 雙 lane 並行：約 3 週

---

## M1. Foundation（Schema + Seed + Model）

**目的**：DB 結構可用、資料可寫。

**Tasks：**

- [ ] 9 張 knex migration（遵循 spec `DB Schema 詳細設計` 章節）
  - `2026XXXX_rename_and_recreate_chat_user_data.js`（rename 舊為 `chat_user_data_legacy_snapshot` → 新 schema）
  - `2026XXXX_create_prestige_trials.js`
  - `2026XXXX_create_prestige_blessings.js`
  - `2026XXXX_create_user_prestige_trials.js`
  - `2026XXXX_create_user_blessings.js`
  - `2026XXXX_recreate_chat_exp_unit.js`（舊表 DROP + 新曲線 seed）
  - `2026XXXX_create_chat_exp_daily.js`
  - `2026XXXX_create_chat_exp_events.js`
  - `2026XXXX_create_user_prestige_history.js`
  - `2026XXXX_drop_chat_title_tables.js`（DROP `chat_level_title` / `chat_range_title`）
- [ ] Seed：
  - `app/seeds/prestige_trials.js` — 5 列 JSON meta
  - `app/seeds/prestige_blessings.js` — 7 列 JSON meta
  - `app/seeds/chat_exp_unit.js` — 101 列 `round(2.7 × L²)` 公式產出
- [ ] Model（`app/src/model/application/` 底下，繼承 `base.js`）：
  - `ChatUserData.js` / `PrestigeTrial.js` / `PrestigeBlessing.js`
  - `UserPrestigeTrial.js` / `UserBlessing.js` / `ChatExpDaily.js`
  - `ChatExpEvent.js` / `UserPrestigeHistory.js` / `ChatExpUnit.js`
- [ ] 單元測試：每個 model CRUD + seed 驗證

**Exit Criteria**：

- `yarn migrate` + `yarn knex seed:run` 在乾淨 DB 跑完無錯
- `yarn test` 新 model 綠燈

---

## M2. Core XP Pipeline 重寫

**目的**：單句訊息 → XP 入帳的整條路徑全新。

**Tasks：**

- [ ] **EventDequeue.handleChatExp 改寫**（`app/bin/EventDequeue.js`）：
  - 只塞 `{userId, groupId, ts, timeSinceLastMsg, groupCount}` 進 `CHAT_EXP_RECORD` list
  - 不預算 `cooldownRate` / `expUnit`（留給 ChatExpUpdate）
  - 修 `CHAT_TOUCH_TIMESTAMP_{userId}` TTL 5s → 10s
- [ ] **Redis state 結構**（新 `app/src/util/chatUserState.js`）：
  - `CHAT_USER_STATE_{userId}` JSON：`{prestige_count, blessings[], active_trial_id, trial_start_ts, permanent_bonuses}`
  - 讀寫 helper + invalidation 觸發點（轉生 / 試煉 start/end / 祝福選擇 各自 `.del()` 時機）
  - `CHAT_DAILY_XP_{userId}_{YYYY-MM-DD}` TTL 36h（diminish tier 判定用）
- [ ] **ChatExpUpdate 邏輯中心重寫**（`app/bin/ChatExpUpdate.js`）：
  1. 讀 `CHAT_USER_STATE` → 決定 cooldown 表（baseline / ×1.33 試煉 / 祝福 override）
  2. 單句 XP：`base × cooldownRate × groupBonus × (1 + 祝福1)`（祝福 6、7 影響 groupBonus）
  3. 日累計：× 活動倍率 × 蜜月 → diminish（邊界受祝福 4、5 影響）→ × 試煉當期倍率 × (1 + 試煉永久獎勵)
  4. 寫 `chat_user_data` / `chat_exp_daily`（upsert by date）/ `chat_exp_events`
  5. 更新試煉 XP 條件進度（if active）
- [ ] 單元測試：
  - Cooldown 表選用（baseline / ★3 試煉 / 祝福 2、3 各組合）
  - 單句 XP 計算各祝福 stacking
  - Diminish tier 跨界（0→200→500 邊界、祝福 4、5 擴區間）
  - 試煉倍率 + 永久獎勵 pipeline 順序

**Dependencies**：M1

**Exit Criteria**：

- 固定 input（timestamp 序列 + 用戶 state）對應固定 output（XP 寫入）
- 單元測試覆蓋 ≥ 80% `ChatExpUpdate.js` + cooldown 選用函式

---

## M3. Trial & Prestige Lifecycle

**目的**：試煉 / 轉生流程完整可跑。

**Tasks：**

- [ ] 新 `app/src/service/PrestigeService.js`：
  - `startTrial(userId, trialId)` — 驗證未完成 trial 清單 + 寫 active + 失效 Redis state
  - `recordTrialProgress(userId, xp)` — 由 ChatExpUpdate 呼叫，累積到 `active_trial_exp_progress`
  - `checkTrialCompletion(userId)` — 達標時觸發 passed、寫 `user_prestige_trials`
  - `forfeitTrial(userId)` — 主動放棄、狀態 forfeited
  - `prestige(userId, blessingId)` — Lv.100 + trial passed + blessing 選擇 → prestige_count++ + 寫 `user_prestige_history` + 失效 Redis state
- [ ] Cron `TrialExpiryCheck`（每日 00:05）：
  - 掃 `chat_user_data.active_trial_started_at < NOW() - INTERVAL 60 DAY`
  - 將 `user_prestige_trials` 狀態置 failed、清 active_trial_id
- [ ] 廣播觸發點（呼 M4 的 `BroadcastQueue.push`）：
  - 進試煉、試煉通過、轉生完成、覺醒達成
- [ ] 整合測試：完整 lifecycle（選試煉 → 刷 XP → 通過 → 選祝福 → 轉生 → 下一循環）
  - 5 次轉生 → 覺醒狀態正確鎖定
  - 60 天時限過期自動 failed
  - Forfeit 後可重新挑同一試煉

**Dependencies**：M2

**Exit Criteria**：

- Lifecycle 各狀態機可 round-trip 測試通過
- 5 完整循環 → awakened + 7 選 5 祝福正確

---

## M4. 廣播基礎架構

**目的**：Reply token queue + broadcast queue。

**Tasks：**

- [ ] `saveReplyToken` 重寫（`app/bin/EventDequeue.js:299-308`）：
  - 改 Redis sorted set：`REPLY_TOKEN_QUEUE_{sourceId}`（score = unix ms timestamp）
  - `ZADD` + `ZREMRANGEBYRANK 0 -6`（留最新 5）+ `ZREMRANGEBYSCORE 0 <now-55000>`
  - TTL 20s → 55s（對齊 LINE 官方 token 有效期）
  - 正則 `[CUD]` → `[CUDR]`（補 room）
- [ ] 新 `app/src/util/broadcastQueue.js`：
  - `push(groupId, {type, text, payload})` — `LPUSH` + `EXPIRE 86400`
  - `pullFreshToken(sourceId)` — `ZRANGEBYSCORE` 取還沒過期的最新一個 + `ZREM` 消費
  - `drain(groupId)` — 取 queue、pull token、reply API、失敗 `LPUSH` 回 queue
- [ ] EventDequeue 消費邏輯：每則群組訊息進來後順便 `drain(groupId)`
- [ ] Cron `BroadcastQueueDrainer`（每 30s）：
  - `SCAN` 所有 `BROADCAST_QUEUE_*` key
  - 對每個 group 嘗試 `pullFreshToken` + `drain`
- [ ] 單元測試 + 整合測試（mock LINE reply API）

**Dependencies**：M1（broadcast queue 資料不進 DB，僅 Redis）

**Parallelizable with M2**

**Exit Criteria**：

- Reply API 失敗時 queue 持久化可 retry
- 24h 無消費機會的 queue 自然過期

---

## M5. AchievementEngine 整合

**目的**：7 個新成就 + 舊 chat_xxx 查詢改寫。

**Tasks：**

- [ ] Seed：
  - 3 個 milestone 成就：`prestige_departure` / `prestige_awakening` / `prestige_pioneer`
  - 4 個隱藏 build 成就：`blessing_breeze` / `blessing_torrent` / `blessing_temperature` / `blessing_solitude`
  - （寫入 `achievements` / `achievement_definitions` 既有表，視現行 schema）
- [ ] 觸發點：
  - PrestigeService 的試煉通過時 → `AchievementEngine.unlock(userId, 'prestige_departure')`（若是 ★1）或 `prestige_awakening`（若是 ★5 = 第 5 次轉生）
  - 第 5 次轉生（`prestige_count 4 → 5`）時檢查 `user_blessings` 組合 → 觸發隱藏 build 成就
- [ ] 遷移腳本觸發 `prestige_pioneer` 一次性發放給 82 人（屬 M9）
- [ ] **改寫 `AchievementEngine.batchEvaluate`**（`app/src/service/AchievementEngine.js:360-362`）：
  ```js
  const chatUsers = await mysql("chat_user_data")
    .select("user_id", mysql.raw("prestige_count * 27000 + current_exp as lifetime_exp"));
  ```
  對應 `chat_100 / chat_1000 / chat_5000` 成就判定。
  - 注意：遷移後池子全重置為 0，短期內不會觸發（moderate ~1 天即達 chat_100、~7 天達 chat_1000、~33 天達 chat_5000）

**Dependencies**：M1（achievements seed）、M3（PrestigeService 觸發點）

**Parallelizable with M6**

---

## M6. LIFF 前端

**目的**：5 個頁面 + Rankings 更新。

**Tasks：**

- [ ] API endpoints（`app/src/router/api.js`，新增 `/api/prestige/*`）：
  - `GET /api/prestige/status` — 當前狀態 + 可選試煉 + 可選祝福
  - `POST /api/prestige/trial/start` — body: `{trialId}`
  - `POST /api/prestige/trial/forfeit`
  - `POST /api/prestige/prestige` — body: `{blessingId}`
- [ ] 前端頁面（`frontend/src/pages/Prestige/`）：
  - `Prestige.jsx`（主頁）— 轉生入口 CTA + 當前狀態卡片
  - `TrialSelect.jsx` — 試煉 5 選 1 + active 進度
  - `BlessingSelect.jsx` — 祝福 7 選 1（標示已取得）
  - `TrialProgress.jsx` — 試煉進度 + forfeit button
  - `Awakened.jsx` — 覺醒者展示頁
- [ ] Rankings 頁補欄：等級 / 轉生次數 / 覺醒標記 / 祝福 build icon（`frontend/src/pages/Rankings/`）
- [ ] LIFF 整合（`@line/liff`）+ 權限驗證（既有 token 機制）
- [ ] Socket.IO 即時更新（選配，試煉達標廣播到前端）

**Dependencies**：M3（API 層）

**Parallelizable with M5**

---

## M7. Controller 精簡

**目的**：拔 admin 指令 + 精簡群組命令。

**Tasks：**

- [ ] 刪 admin 指令（`app/src/controller/application/ChatLevelController.js`）：
  - `setExp` / `setExpRate` / 稱號自選 / 等級查詢管理員版
- [ ] 保留 / 新增：
  - Lv.100 達標 CTA 廣播（「[用戶名] 已達成 Lv.100，可前往 LIFF 轉生」）
  - 文字查詢：`!等級` / `!轉生狀態`（純查詢，不動狀態）
- [ ] 冒險小卡（`app/src/templates/`）：
  - 移除稱號文字欄位
  - 加狀態 flag：`✨ 覺醒者` / `⚔️ ★N 試煉中` / `🌱 蜜月中` / `★★★ 轉生 N 次`
- [ ] OrderBased router 更新：移除廢指令路由、加新路由

**Dependencies**：M3

---

## M8. Housekeeping Cron

**目的**：資料衛生 + feature flag。

**Tasks：**

- [ ] 新 cron `ChatExpEventsPrune`（每日 03:00）：
  ```sql
  DELETE FROM chat_exp_events WHERE ts < NOW() - INTERVAL 30 DAY
  ```
- [ ] `app/config/crontab.config.js` 新增三個 job：
  - M3 的 `TrialExpiryCheck`（每日 00:05）
  - M4 的 `BroadcastQueueDrainer`（每 30s）
  - 本 M8 的 `ChatExpEventsPrune`（每日 03:00）
- [ ] Feature flag：`CHAT_XP_PAUSED` Redis flag
  - EventDequeue 短路：若 flag 為 true 則 return early
  - T-0 停機期間手動設為 true、migration 跑完後 unset

---

## M9. 遷移腳本 + Staging 演練

**目的**：真實資料能成功轉換。

**Tasks：**

- [ ] `app/bin/migrate-prestige-system.js`（一次性腳本）：
  1. Assert `CHAT_XP_PAUSED = 1`（否則 abort）
  2. Rename 舊 `chat_user_data` → `chat_user_data_legacy_snapshot`（若 M1 migration 未執行）
  3. 讀 snapshot 篩 `experience > 8,407,860` → 先驅者 82 人名單
  4. 寫入新 `chat_user_data`：全員 `prestige_count=0, current_level=0, current_exp=0`（包含先驅者）
  5. 批次呼 `AchievementEngine.unlock(userId, 'prestige_pioneer')` 發成就
  6. 輸出 audit log：筆數、先驅者名單、成就發放結果
- [ ] `app/bin/rollback-prestige-system.js`：
  - 設 `CHAT_XP_PAUSED = 1`
  - DROP 新 `chat_user_data`
  - Rename `chat_user_data_legacy_snapshot` → `chat_user_data`
  - 撤回先驅者成就（從 `user_achievements` 刪除 `prestige_pioneer`）
- [ ] **Staging 演練**：
  1. Dump 一份 prod snapshot 到 staging DB
  2. 跑完整遷移腳本
  3. Verify SQL：先驅者名單 / 成就發放 / 新 pipeline 能寫 XP / Rankings 頁顯示正確
  4. 演練 rollback 腳本 → 驗證可回到舊 schema
- [ ] T-0 checklist 文件（詳細步驟 + verify SQL 查詢）

**Dependencies**：M1–M8 完成

**Exit Criteria**：

- Staging 演練成功（遷移 + rollback 雙向可走）
- Audit log 顯示 82 位先驅者正確發放

---

## M10. Rollout

**目的**：真實上線。

**Tasks：**

- [ ] **T-14 / T-7 / T-3 / T-1**：公告廣播到所有活躍群（透過 M4 broadcast queue）
  - T-14：預告新系統
  - T-7：說明機制（轉生 + 試煉 + 祝福）
  - T-3：說明先驅者資格（Lv.100+ 或 XP > 8,407,860）
  - T-1：通知 T-0 停機時間
- [ ] **T-0 停機流程**：
  1. 設 `CHAT_XP_PAUSED = 1`（bot 暫停計 XP，保留 webhook 接收）
  2. 跑 `migrate-prestige-system.js`
  3. Deploy 新 code（bot + worker + frontend，Portainer stack 更新）
  4. Unset `CHAT_XP_PAUSED`
  5. **Verify（必做）**：
     - 隨挑 5 個 userId 看 `chat_user_data` 新 state
     - 發訊息看 XP 寫入（`chat_exp_events` 新增、`chat_exp_daily` 累積）
     - LIFF 可打開 `/prestige` 頁面
     - 先驅者成就頁看得到
- [ ] **T+7 觀察期 checklist**（每日）：
  - 各層每日 XP（`chat_exp_daily` 分 moderate/heavy/whale）符合預估？
  - 試煉 active 數 / 通過數 / 失敗數
  - 轉生事件數（`user_prestige_history` 新增筆數）
  - `chat_exp_events` 異常（burst pattern / 特定用戶暴增）
- [ ] **T+72h**：Rollback window 結束，DROP `chat_user_data_legacy_snapshot`

**Dependencies**：M9

---

## 依賴圖

```
M1 Foundation
  ↓
M2 Core XP pipeline ───┬─→ M3 Trial lifecycle ─┬─→ M5 Achievement
                       │                       │
                       ├─→ M4 Broadcast ───────┤
                       │                       ├─→ M7 Controller cleanup
                       │                       │
                       │                       └─→ M6 LIFF frontend
                       │
                       └─→ M8 Housekeeping cron

M3 + M5 + M6 + M7 ─→ M9 Migration 演練 ─→ M10 Rollout
```

---

## 並行化建議（雙 lane）

| 週 | Lane A | Lane B |
|---|---|---|
| 1 | M1 Schema + Model + Seed | M1 單元測試 |
| 2 | M2 Pipeline 重寫 | M4 廣播基礎架構 |
| 3 | M3 Trial lifecycle | M6 LIFF API + 頁面 |
| 4 | M5 Achievement + M7 Controller | M8 cron + M9 遷移腳本 |
| 5 | M9 Staging 演練 | M10 rollout checklist 演練 |
| 6 | T-14 → T-0 → T+7 觀察 | |

---

## 已拍板但尚未入計畫的細節

以下項目有**設計層決策**但尚未列 task（實作時視情況納入）：

- **廣播文案變體**：覺醒廣播要不要特殊視覺（換色 / 額外 emoji）— spec line 209 flag「可考慮」，留給 M7 實作時決定
- **Rankings 前端顯示樣式細節**：覺醒者聚頂 vs 獨立榜、祝福 build icon — 留給 M6
- **LIFF wireframe 具體 UX**：5 個頁面的 layout / component 選擇 — 留給 M6
- **測試覆蓋率目標**：現訂 M2 ≥ 80%，其他 milestone 未訂硬目標
