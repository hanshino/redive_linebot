# Feature Audit & Migration Log

此文件用於記錄從 Bottender (master) 遷移至 NestJS (dev) 的功能盤點。
請逐一確認每個功能是 **Keep (保留)** 還是 **Discard (捨棄)**。

## 1. Core & Princess (核心與公主連結)

| Feature             | Commands                                            | Source Path (Reference)                             | Decision    | Notes                           |
| ------------------- | --------------------------------------------------- | --------------------------------------------------- | ----------- | ------------------------------- |
| **Gacha**           | `#抽`, `#保證抽`, `#歐洲抽`, `#消耗抽`, `#我的包包` | `app/src/controller/princess/gacha.js`              | **Keep**    | 核心轉蛋邏輯                    |
| **Battle**          | `#gbs`, `#gbc`, `#gb`, `#刀表`, `#出完三刀`         | `app/src/controller/princess/battle.js`             | **Discard** | 公會戰排刀系統                  |
| **Character**       | `#升星`, `#升滿星`                                  | `app/src/controller/princess/character.js`          | **Discard** | 角色資料管理                    |
| **Stone Shop**      | `#轉蛋兌換`, `#轉蛋商店`                            | `app/src/controller/princess/GodStoneShop/index.js` | **Discuss** | 女神石商店，需重新討論設計      |
| **Global Orders**   | (全群通用指令邏輯)                                  | `app/src/controller/application/GlobalOrders.js`    | **Keep**    | 處理跨群組通用邏輯 (Admin Only) |
| **Bot Interaction** | `你好`, `@Bot`                                      | `app/src/controller/lineEvent.js` (interactWithBot) | **Discard** | 機器人基本互動                  |

## 2. Social & Interactive (社交與互動)

| Feature           | Commands                              | Source Path (Reference)                                    | Decision    | Notes                         |
| ----------------- | ------------------------------------- | ---------------------------------------------------------- | ----------- | ----------------------------- |
| **Chat Level**    | `#我的狀態`, `#等級排行`, `#你的狀態` | `app/src/controller/application/ChatLevelController.js`    | **Keep**    | 聊天等級系統                  |
| **World Boss**    | `#世界王`, `#攻擊`, `#冒險小卡`       | `app/src/controller/application/WorldBossController.js`    | **Keep**    | 世界王活動                    |
| **Market**        | `#轉帳`, `#快速轉帳`, `#atm`          | `app/src/controller/application/MarketController.js`       | **Discuss** | 金流與經濟系統需重新規劃      |
| **Vote**          | `#vote` (Postback)                    | `app/src/controller/application/VoteController.js`         | **Discard** | 投票功能                      |
| **Guild Service** | (Guild 相關服務)                      | `app/src/controller/application/GuildServiceController.js` | **Discard** | 公會相關服務                  |
| **Status**        | (Status 查詢)                         | `app/src/controller/application/StatusController.js`       | **Keep**    | 顯示使用者基本狀態 (Profile?) |

## 3. Minigames (小遊戲)

| Feature           | Commands                        | Source Path (Reference)                                   | Decision | Notes                                   |
| ----------------- | ------------------------------- | --------------------------------------------------------- | -------- | --------------------------------------- |
| **Janken**        | `#決鬥`, `#猜拳擂台`            | `app/src/controller/application/JankenController.js`      | **Keep** | 猜拳遊戲 (需重構)                       |
| **Lottery**       | `#樂透`, `#買樂透`, `#電腦選號` | `app/src/controller/application/LotteryController.js`     | **Keep** | 樂透系統 (需重構)                       |
| **Scratch Card**  | `#刮刮卡`, `#購買刮刮卡`        | `app/src/controller/application/ScratchCardController.js` | **Keep** | 刮刮卡 (需重構)                         |
| **Number (Dice)** | `#猜 [大/小]`                   | `app/src/controller/application/NumberController.js`      | **Keep** | 骰子比大小 (需重構)                     |
| **Gamble**        | (賭博相關)                      | `app/src/controller/application/GambleController.js`      | **Keep** | 賭博系統 (需重構)                       |
| **Job (RPG)**     | `#轉職`                         | `app/src/controller/application/JobController.js`         | **Keep** | RPG 轉職任務系統 (需重構，與世界王連動) |

## 4. System & Tools (系統工具)

| Feature            | Commands                              | Source Path (Reference)                                     | Decision    | Notes                              |
| ------------------ | ------------------------------------- | ----------------------------------------------------------- | ----------- | ---------------------------------- |
| **Customer Order** | `#新增指令`, `#刪除指令`, `#指令列表` | `app/src/controller/application/CustomerOrder.js`           | **Keep**    | 自訂指令系統                       |
| **Group Config**   | `#自訂頭像`, `#群組設定`              | `app/src/controller/application/GroupConfig.js`             | **Discard** | 移除指令設定，改由 Web UI 統一管理 |
| **Subscribe**      | `#訂閱兌換`                           | `app/src/controller/application/SubscribeController.js`     | **Keep**    | 訂閱功能 (需重構)                  |
| **Coupon**         | `#兌換`                               | `app/src/controller/application/CouponController.js`        | **Keep**    | 優惠碼兌換 (需重構)                |
| **Image**          | (圖片處理)                            | `app/src/controller/application/ImageController.js`         | **Keep**    | 圖片控制器                         |
| **OpenAI**         | `/resetsession`, (Chat)               | `app/src/controller/application/OpenaiController.js`        | **Discard** | AI 對話整合                        |
| **Bullshit**       | `#幹話`                               | `app/src/controller/application/BullshitController.js`      | **Discard** | 幹話產生器                         |
| **Advertisement**  | (廣告相關)                            | `app/src/controller/application/AdvertisementController.js` | **Discard** | 廣告推播                           |

## 5. Admin (管理員功能)

| Feature         | Commands  | Source Path (Reference)                                   | Decision    | Notes        |
| --------------- | --------- | --------------------------------------------------------- | ----------- | ------------ |
| **Advancement** | `!adv`    | `app/src/controller/application/AdvancementController.js` | **Discard** | 進階管理     |
| **Alias**       | `!alias`  | `app/src/controller/application/AliasController.js`       | **Discard** | 指令別名管理 |
| **Donate List** | `!donate` | `app/src/controller/application/DonateListController.js`  | **Discard** | 贊助名單管理 |

## 6. Middleware (中介軟體)

| Feature             | Function           | Source Path (Reference)            | Decision    | Notes                      |
| ------------------- | ------------------ | ---------------------------------- | ----------- | -------------------------- |
| **Alias**           | 指令別名替換       | `app/src/middleware/alias.js`      | **Discard** |                            |
| **Config**          | 載入群組設定       | `app/src/middleware/config.js`     | **Keep**    | NestJS 已部分實作          |
| **Discord Webhook** | 轉發訊息到 Discord | `app/src/middleware/dcWebhook.js`  | **Discard** |                            |
| **Profile**         | 用戶資料讀取       | `app/src/middleware/profile.js`    | **Keep**    | NestJS UserSync 已部分實作 |
| **Statistics**      | 數據統計           | `app/src/middleware/statistics.js` | **Keep**    | 需重新設計資料埋點架構     |
| **Validation**      | 權限驗證           | `app/src/middleware/validation.js` | **Keep**    | NestJS Permission 已實作   |
| **Rate Limit**      | 限速               | `app/src/middleware/rateLimit.js`  | **Keep**    | NestJS 已實作              |

## 7. Potential Dead Code (疑似未使用)

這些檔案存在於目錄中，但在 `app.js` 沒有明確引用，需確認是否保留。
| Feature | Source Path (Reference) | Decision | Notes |
|---------|-------------------------|----------|-------|
| **Notify** | `app/src/controller/application/NotifyController.js` | **Discard** | |
| **Group Record** | `app/src/controller/application/GroupRecord.js` | **Discard** | |
| **Guild Model?** | `app/src/controller/application/Guild.js` | **Discard** | 路徑怪異，可能是 Model 放錯位置 |
| **Statistics** | `app/src/controller/application/Statistics.js` | **Discard** | 有 Middleware 版，這個可能是舊的 |
| **Announce** | `app/src/controller/application/AnnounceController.js` | **Discard** | |
| **Princess Announce**| `app/src/controller/princess/announce.js` | **Discard** | |
