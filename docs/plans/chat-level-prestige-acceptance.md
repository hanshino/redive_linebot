# 說話等級大改版：驗收清單

對應 [chat-level-prestige-impl.md](./chat-level-prestige-impl.md) M1–M9。
M10 上線前在本機 / staging 走完此清單即可視為「功能驗收通過」，再進 T-0。

Branch：`feat/chat-level-prestige`

---

## Pre-check：環境就緒

- [ ] `make infra` — mysql / redis / phpmyadmin up
- [ ] `cd app && yarn migrate` — schema latest（新表 + drop chat_title 表）
- [ ] `cd app && yarn knex seed:run` — `prestige_trials` (5)、`prestige_blessings` (7)、`chat_exp_unit` (101)
- [ ] `cd app && yarn dev`（bot, port 9527）+ `cd frontend && yarn dev`（port 3000）
- [ ] `cd app && yarn worker` — cron scheduler（必要：要驗 `BroadcastQueueDrainer` / `TrialExpiryCheck` / `ChatExpEventsPrune`）
- [ ] `make tunnel` — ngrok URL 同步進 LINE webhook + LIFF endpoint
- [ ] 預備一個本機測試群（至少 1 個 LINE 帳號 + bot 入群）

---

## Layer 1：自動化測試（5 分鐘）

```bash
cd /home/hanshino/workspace/redive_linebot/app
yarn lint
yarn test 2>&1 | tail -40
```

- [ ] `yarn lint` clean
- [ ] `yarn test` ≥ 528/529 pass（僅 `images.test.js` Imgur leftover 失敗，與本次無關）

---

## Layer 2：本機端到端驗收

### A. M2 XP Pipeline — 寫入路徑

- [ ] 在測試群發訊息 → `redis-cli LRANGE CHAT_EXP_RECORD 0 -1` 看到 `{userId, groupId, ts, ...}`
- [ ] 等 ≤ 5 分鐘 / 手動跑 `node app/bin/ChatExpUpdate.js` → 寫入：
  - `chat_user_data.current_exp` / `current_level` 增加
  - `chat_exp_daily` upsert by date（分 moderate/heavy/whale tier）
  - `chat_exp_events` 新增逐筆紀錄
- [ ] `redis-cli GET CHAT_USER_STATE_<userId>` 結構含 `prestige_count / blessings / active_trial_id / permanent_bonuses`
- [ ] `redis-cli GET CHAT_DAILY_XP_<userId>_<YYYY-MM-DD>` 累積值對得上

### B. M2 Cooldown / Diminish 行為

- [ ] **Baseline cooldown**：30 秒內連發兩則訊息，第二則 XP 為 0 / 大幅下降
- [ ] **Diminish tier**：手動把當日累計 XP 灌到 200 / 500 邊界（直接寫 `CHAT_DAILY_XP_*` redis 即可），下一則訊息 XP 套用 50% / 25% 級距
- [ ] 跨日（手動把 redis key 換成下一個 `YYYY-MM-DD`）→ 新一日歸零

### C. M3 Trial / Prestige Lifecycle

> 用 SQL 把 `chat_user_data.current_level` 直接改 99，發訊息升到 100；或直接 UPDATE `current_level = 100, current_exp >= 27000`。

- [ ] **Lv.100 達標** → 廣播 CTA「可進入轉生」（看 `BROADCAST_QUEUE_<groupId>` 有 push）
- [ ] LIFF `/prestige` 進入 `LevelClimbView` / `TrialSelectView` 切換正確
- [ ] **選試煉**：5 選 1 → `user_prestige_trials` 新增 active row，`chat_user_data.active_trial_id` / `started_at` 寫入
- [ ] **Redis state 失效**：選完後 `CHAT_USER_STATE_<userId>` 被刪重讀
- [ ] **進度 / 倒數**：TrialProgressView 顯示 XP 進度條 + 60 天 tiered countdown
- [ ] **試煉通過**：刷 XP 達標 → state 變 passed、廣播觸發
- [ ] **Forfeit**：放棄按鈕 → `user_prestige_trials.status = forfeited`，可重選同一試煉
- [ ] **轉生**：通過後選祝福 → `prestige_count++`、`current_level / current_exp = 0`、`user_prestige_history` 新增、`user_blessings` 新增、廣播觸發
- [ ] **覺醒**：第 5 次轉生 → 7 選 5 祝福 UI 出現、`AwakenedView` 顯示、`prestige_pioneer/awakening` 成就觸發

### D. M3 60 天過期

- [ ] 手動 UPDATE `chat_user_data.active_trial_started_at` 成 61 天前
- [ ] 跑 `node app/bin/TrialExpiryCheck.js` → `user_prestige_trials.status = failed`、`active_trial_id = NULL`
- [ ] 廣播觸發「試煉失敗」訊息

### E. M4 廣播 Queue / Reply Token

- [ ] 群裡發訊息 → `redis-cli ZRANGE REPLY_TOKEN_QUEUE_<groupId> 0 -1 WITHSCORES` 有 token，最多 5 個
- [ ] 強制 push 到 `BROADCAST_QUEUE_<groupId>` → 群裡發訊息觸發 drain → bot reply
- [ ] 沒有 fresh token 時 worker `BroadcastQueueDrainer`（30s）會嘗試 reply（無就保留）
- [ ] 24h 無消費 → queue 自然 expire（手動驗：`TTL` 該 key 看是否 ≤ 86400）

### F. M5 AchievementEngine 整合

- [ ] **試煉首通**：`user_achievements` 新增 `prestige_departure`
- [ ] **第 5 次轉生**：`prestige_awakening` + 對應 build 成就（`blessing_breeze` / `torrent` / `temperature` / `solitude`）依祝福組合解鎖
- [ ] **batchEvaluate 改寫**：`chat_100 / chat_1000 / chat_5000` 改吃 `prestige_count * 27000 + current_exp`（手動跑 `node app/bin/AchievementCron.js` 看不會炸）

### G. M6 LIFF 前端

LIFF URL 進 `/prestige`：

- [ ] `index.jsx` state-machine 5 step Stepper 對到當前狀態（fresh / climbing / trial / prestige_select / awakened）
- [ ] **TrialSelectView**：已通過試煉 server-side 過濾，不會被選
- [ ] **BlessingSelectView**：已取得祝福不會被選；第 5 次有「輸入確認 friction」
- [ ] **TrialProgressView**：full + compact 模式切換、XP 進度條、tiered countdown、forfeit
- [ ] **AwakenedView**：覺醒展示 + 自動偵測 build 成就 badge
- [ ] **LevelClimbView**：距離 Lv.100 顯示 + 首次 onboarding tip
- [ ] Polling：狀態變化（如試煉通過）UI 自動 refresh

### H. M6 Rankings 補欄

- [ ] `/rankings` PrestigeRankList 顯示：等級 / 轉生次數 / 覺醒標記 / 祝福 build tag
- [ ] 排序依 `prestige_count * 27000 + current_exp`

### I. M7 Controller 文字指令

- [ ] `!等級` → 一行回覆：等級 / 經驗 / 轉生次數 / 狀態 flag
- [ ] `!轉生狀態` → flex 卡片：覺醒 / ★N 試煉 / 蜜月 / 轉生 N 次
- [ ] `#等級排行` → top 5 文字版（依 lifetime XP）
- [ ] mention 好友 → 顯示對方等級資訊
- [ ] **冒險小卡**：原 `Lv.X · Range` 與 `Rank #N` 已移除，改顯示 prestige flag row
- [ ] **admin 指令**：`!setexp` / `!setrate` 已拔除（試打不該回應）

### J. M8 Housekeeping + Kill Switch

- [ ] **CHAT_XP_PAUSED**：`redis-cli SET CHAT_XP_PAUSED 1`
  - 發訊息：`CHAT_EXP_RECORD` 不再 push、`CHAT_TOUCH_TIMESTAMP_*` 也不寫
  - reply token / GuildMembers / 其他 webhook 動作正常
  - `redis-cli DEL CHAT_XP_PAUSED` 後恢復
- [ ] **ChatExpEventsPrune**：UPDATE 一筆 `chat_exp_events.ts` 成 31 天前 → `node app/bin/ChatExpEventsPrune.js` → 該筆消失
- [ ] **TrialExpiryCheck**（已於 D 驗）

---

## Layer 3：Migration 演練（上線前必做）

> 在 staging（或本機跑一份 prod snapshot）執行 — 不要在 prod 直接跑。

- [ ] 拉 prod `chat_user_data` snapshot 進 staging
- [ ] `redis-cli SET CHAT_XP_PAUSED 1`
- [ ] `cd app && yarn migrate`（含 `rename chat_user_data → legacy_snapshot` + 新表）
- [ ] `node app/bin/migrate-prestige-system.js`
  - [ ] Audit log 顯示先驅者數 ≈ 82（依 prod 漂移 ± 少量）
  - [ ] 全員 `prestige_count=0, current_level=0, current_exp=0`
  - [ ] 先驅者全員 `unlocked` / `already_unlocked`，無 `error`
- [ ] 跑第二次 → idempotent（先驅者全 `already_unlocked` + `INSERT IGNORE`）
- [ ] 跑 [m9-runbook.md](./chat-level-prestige-m9-runbook.md) 的 5 項 verify SQL
- [ ] **Rollback 演練**：`node app/bin/rollback-prestige-system.js`
  - [ ] 新 `chat_user_data` DROP
  - [ ] `chat_user_data_legacy_snapshot` rename 回 `chat_user_data`
  - [ ] `prestige_pioneer` 成就解鎖紀錄被刪
- [ ] `redis-cli DEL CHAT_XP_PAUSED`

---

## Sign-off

- [ ] Layer 1 通過
- [ ] Layer 2 A–J 全綠
- [ ] Layer 3 migration / rollback 各跑過一次成功
- [ ] [m9-runbook.md](./chat-level-prestige-m9-runbook.md) 的 T-0 sequence + abort/rollback decision tree 已演練
- [ ] T-14 / T-7 / T-3 / T-1 公告文案 draft 完成

驗收通過後 → 進 M10 Rollout。
