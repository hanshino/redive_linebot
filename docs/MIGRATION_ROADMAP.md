# Redive LineBot - Migration Roadmap

**Status**: Planning Complete  
**Based on**: `docs/FEATURE_AUDIT.md` (2026-01-25)

---

## 🚀 Phase 1: Foundation (基礎建設)

**目標**: 建立穩固的 NestJS 後端架構，確保基本指令路由與事件處理正常運作。

- [x] **Command Router Service**
  - [x] 實作指令解析器 (Text Command Parser)
  - [x] 支援 Regex 與前綴 (`#`, `/`, `.`, `!`)
  - [x] 整合 NestJS Decorator (`@Command()`, `@OnEvent()`, `@Postback()`)
  - [x] 建立 CommandDiscoveryService (自動掃描與註冊)
  - [x] 建立 CommandDispatcherMiddleware (O(1) 查找 + Regex fallback)
  - [x] 支援 aliases (指令別名)
  - [x] 完整單元測試 (38 tests passing)
- [ ] **Postback Handler**
  - [x] 實作 Payload 解析 (JSON + Query String)
  - [x] 建立 Postback 路由機制
  - [ ] 實際應用到功能中 (待 Phase 2 整合)
- [ ] **Middleware Enhancement**
  - [ ] **Statistics**: 設計資料埋點架構 (Log events to Redis/DB)
  - [ ] **Config**: 完善群組設定載入
  - [x] **Profile**: 完善使用者資料同步 (UserSync)
  - [x] **RateLimit**: 確認 Redis 限速機制運作正常
- [ ] **Global Orders**
  - [ ] 移植 `GlobalOrderBase` 邏輯

## 🎮 Phase 2: Core Game Features (核心遊戲)

**目標**: 移植最核心的公主連結功能。

- [ ] **Gacha System (轉蛋)**
  - [ ] 移植 `gacha.js` 核心邏輯
  - [ ] 指令: `#抽`, `#保證抽`, `#歐洲抽`, `#消耗抽`, `#我的包包`
  - [ ] 確保機率與庫存系統正確
- [ ] **Stone Shop (女神石商店) [Redesign]**
  - [ ] 重新設計商店架構
  - [ ] 指令: `#轉蛋兌換`, `#轉蛋商店`

## 👥 Phase 3: Social & Economy (社交與經濟)

**目標**: 建立使用者互動與經濟循環。

- [ ] **Chat Level (聊天等級)**
  - [ ] 移植 `ChatLevelController.js`
  - [ ] 指令: `#我的狀態`, `#等級排行`
- [ ] **World Boss (世界王)**
  - [ ] 移植 `WorldBossController.js`
  - [ ] 指令: `#世界王`, `#攻擊`, `#冒險小卡`
- [ ] **Market System (市場) [Redesign]**
  - [ ] **全面重構金流系統**
  - [ ] 建立交易安全性機制 (Transaction, Lock)
  - [ ] 指令: `#轉帳`, `#快速轉帳`

## 🎲 Phase 4: Minigames (小遊戲)

**目標**: 移植並重構所有小遊戲，增加群組活躍度。

- [ ] **Janken (猜拳) [Redesign]**
  - [ ] `#決鬥`, `#猜拳擂台`
- [ ] **Lottery (樂透) [Redesign]**
  - [ ] `#樂透`, `#買樂透`, `#電腦選號`
- [ ] **Scratch Card (刮刮卡) [Redesign]**
  - [ ] `#刮刮卡`, `#購買刮刮卡`
- [ ] **Number (骰子) [Redesign]**
  - [ ] `#猜 [大/小]`
- [ ] **Gamble (賭博) [Redesign]**
  - [ ] 與 Market 金流系統整合
- [ ] **Job (RPG 轉職) [Redesign]**
  - [ ] `#轉職` (需與 World Boss 系統連動)

## 🛠 Phase 5: System Tools (系統工具)

**目標**: 提供使用者自訂功能與訂閱服務。

- [ ] **Customer Order (自訂指令)**
  - [ ] `#新增指令`, `#刪除指令`, `#指令列表`
- [ ] **Subscribe System (訂閱) [Redesign]**
  - [ ] 重新設計訂閱架構
  - [ ] `#訂閱兌換`
- [ ] **Coupon System (優惠碼) [Redesign]**
  - [ ] `#兌換`
- [ ] **Image Controller**
  - [ ] 移植圖片處理邏輯
- [ ] **Status Controller**
  - [ ] 移植狀態查詢

---

## 🗑 Discarded Features (已移除)

下列功能確認不進行遷移：

- **Princess**: Battle (公會戰), Character (角色)
- **Interactive**: Vote (投票), Guild Service (公會服務)
- **Bot**: Bot Interaction (你好, @Bot)
- **Tools**: Group Config (改 Web UI), OpenAI, Bullshit, Advertisement
- **Admin**: Advancement, Alias, Donate List
- **Middleware**: Alias, Discord Webhook
