---
title: 每日自動猜拳切換 Runbook
date: 2026-09-17
updated: 2026-09-23
scope: PR824 / DailyQuest 由 Redis 佇列切換為 durable scanner
---

# 每日自動猜拳切換 Runbook

> 2026-09-23 簡化：使用者接受切換時少量漏記（side project），原本「零遺失」的 archive／audit／preflight 與舊 worker graceful-drain gate 全部撤除。

## 為什麼這樣就夠

- 新 `DailyQuestProcess` 在 `daily_quest_bridge_state.activated_at` 寫入前不做任何事（`app/src/service/DailyQuestService.js:97-100`）。
- activation 後 scanner 從 `since_date` 起直接掃 `signin_ledger`／`janken_result`，並以 `daily_quest` 既有列去重：legacy 已付的只補 completion、不重付；legacy 漏掉的會補付。所以舊 worker 被 kill 時 pop 掉的 D_c 當日事件會被補回。
- 唯一要守的是**舊 worker 已不存在後才 activation**，避免每日獎雙付。
- 週獎：seeded 路徑也會檢查週獎（`DailyQuestService.js:140-156`），而 W0 的 `daily_quest_weekly_claim` 一定是空的。若 D_c 當天 legacy 已替某玩家付了第 7 天的週獎，scanner 會再付一次。**D_c 選週日（Taipei，週首）就不會發生**：W0 只有 D_c 一天，不可能湊滿 7。非週日執行則接受這批人多領一份週獎。

## 步驟（同一個 Taipei 日內完成，不跨午夜，建議週日；工作目錄 `app/`）

1. **Merge 前先跑 migration**（舊程式照跑，全部 additive）。線上不會自動 migrate（`app/Dockerfile` 只有 `yarn start`），而新 bot 結算會寫新欄位，所以必須先於新 image 上線：
   ```text
   yarn knex migrate:list   # 確認 pending 清單
   yarn migrate
   ```
2. **Merge PR**，等 `stack-deploy.timer`（約 5 分鐘）拉起新 bot／worker。新 bot 已不再 LPUSH `event_center:daily_quest`；新 worker 的 DailyQuest 在 activation 前靜默。
3. **確認舊 worker 容器已被替換**：`docker compose ps` 看 worker 的建立時間／image 是新的。
4. **Activation**（`D_c` = 今天 Taipei 日期）：
   ```sql
   INSERT INTO daily_quest_bridge_state (id, since_date, activated_at)
   VALUES (1, '<D_c>', NOW());
   ```
   下一分鐘 scanner 開始跑，補結今天所有已完成者。
5. **（可選）清舊佇列**：`DEL event_center:daily_quest`。
6. **觀察**：worker log 有 scanner 處理紀錄、`daily_quest_completion` 有今天的列、沒有同 user 同日兩筆 `daily_quest`。
7. 自動配對 cron（`app/config/crontab.config.js` 的 `Auto Janken Matchmaking` 與 outbox）維持 `enabled: false`，另行決定啟用時機。

## Rollback

- activation 前：直接回舊 image 即可（新增的表／欄位不影響舊程式）。
- activation 後已有新 completion／claim 寫入：只 forward-fix，不回舊 image（舊 worker 不認得新表，會重付）。
