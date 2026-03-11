# 賽馬遊戲設計文件

## 概述

Princess Connect Re:Dive LINE Bot 的賽馬小遊戲。每天定時開賽，從角色池隨機抽 5 隻角色進行 10 格賽跑，玩家用女神石下注，採彩池制（Parimutuel）賠率結算。

## 遊戲流程

```
定時開賽（每 2 小時）
    ↓
下注期（15 分鐘）── LINE 指令或 LIFF 下注
    ↓
比賽開始 ── 從角色池隨機抽 5 隻
    ↓
每 10 分鐘推進一回合（cron）
  → 算體力 → 套性格 → 觸發事件 → 移動 → 套地形 → 恢復體力
    ↓
有角色到達第 10 格 → 比賽結束
    ↓
彩池結算 → 扣 10% 手續費 → 按比例分配給押中的玩家
```

## 核心機制

### 移動系統

每回合每隻角色：

1. 計算基礎移動力：`random(0, 2)`
2. 套用體力係數：`actual_move = round(base_move * (stamina / 100))`
3. 套用性格修正（Phase 2）
4. 移動角色
5. 套用地形效果（Phase 2）
6. 消耗體力：`stamina -= random(8, 15)`
7. 自然恢復：`stamina += 5`
8. Clamp stamina 在 0-100

### 體力系統

- 初始體力：100
- 每回合消耗 8-15 點，自然恢復 5 點
- 體力影響移動力，低體力時移動力下降
- 產生「前期衝太快、後面沒力」的戲劇性逆轉

### 性格系統（Phase 2）

| 性格   | 條件                   | 效果                           |
| ------ | ---------------------- | ------------------------------ |
| 逆轉型 | 落後第一名 ≥ 3 格      | 移動 +1                        |
| 領跑型 | 目前第一名             | 移動 +1                        |
| 穩定型 | 無                     | 固定移動 1 格，無視其他修正    |
| 爆發型 | 無                     | 移動改為 random(0, 3)          |
| 社交型 | 同格有其他角色         | 移動 +1                        |

### 地形系統（Phase 2）

| 地形   | 效果                         |
| ------ | ---------------------------- |
| 普通   | 無                           |
| 泥濘   | 下回合 status=slowed，移動 -1 |
| 順風   | 額外前進 1 格                |
| 能量點 | 恢復 20 體力                 |
| 事件格 | 強制觸發隨機事件             |

每場開賽時隨機分配，第 1 格和第 10 格固定為普通。

### 事件系統

每回合 30% 機率觸發隨機事件。事件格則強制觸發。

| 事件     | 效果                         | 台詞模板                           |
| -------- | ---------------------------- | ---------------------------------- |
| 絆倒     | 後退 1 格                    | 「{A} 被石頭絆倒了！」            |
| 換位     | A、B 互換位置                | 「{A} 和 {B} 突然互換了位置！」   |
| 加速     | 額外前進 2 格                | 「{A} 撿到加速道具！」            |
| 全場減速 | 所有角色本回合最多 1 格      | 「突然下起大雨！」                |
| 絆腳索   | 目標下回合 stunned           | 「{A} 對 {B} 使用了絆腳索！」    |

角色有 `custom_events` 時優先使用專屬台詞，否則使用通用台詞。

### 下注與結算

**彩池制（Parimutuel）：**

- 玩家可押注多隻角色，每隻分別下注
- 所有下注匯入彩池
- 結算時扣除 10% 手續費
- 剩餘獎池按押中玩家的下注比例分配

```
total_pool = sum(all bets)
fee = total_pool * 0.1
prize_pool = total_pool - fee

winner_bets = bets where runner_id == winning_runner
winner_total = sum(winner_bets.amount)

for each winning bet:
  payout = prize_pool * (bet.amount / winner_total)
```

無人押中 → 全額退還（不扣手續費）。

**即時賠率顯示：**

下注期間顯示預估賠率 = `total_pool / runner_total_bets`，讓玩家參考。

## 資料庫設計

### `race` — 比賽主體

| 欄位             | 類型         | 說明                              |
| ---------------- | ------------ | --------------------------------- |
| id               | INT PK AUTO  |                                   |
| status           | ENUM         | betting / running / finished      |
| round            | INT          | 目前回合數                        |
| terrain          | JSON         | 10 格地形配置                     |
| winner_runner_id | INT NULL FK  | 勝出角色                          |
| started_at       | DATETIME     | 比賽開始時間（下注期結束）        |
| finished_at      | DATETIME     | 結束時間                          |
| created_at       | DATETIME     | 開賽時間（下注期開始）            |

### `race_runner` — 比賽中的角色

| 欄位         | 類型        | 說明                          |
| ------------ | ----------- | ----------------------------- |
| id           | INT PK AUTO |                               |
| race_id      | INT FK      |                               |
| character_id | INT FK      | 對應角色設定                  |
| lane         | TINYINT     | 1-5 賽道編號                  |
| position     | TINYINT     | 0-10 目前位置                 |
| stamina      | TINYINT     | 目前體力 0-100                |
| status       | ENUM        | normal / slowed / stunned     |

### `race_bet` — 下注紀錄

| 欄位       | 類型        | 說明           |
| ---------- | ----------- | -------------- |
| id         | INT PK AUTO |                |
| race_id    | INT FK      |                |
| user_id    | VARCHAR FK  | 玩家           |
| runner_id  | INT FK      | 押哪隻         |
| amount     | INT         | 下注金額       |
| payout     | INT NULL    | 結算後實際獲得 |
| created_at | DATETIME    |                |

### `race_event` — 比賽事件紀錄

| 欄位           | 類型        | 說明             |
| -------------- | ----------- | ---------------- |
| id             | INT PK AUTO |                  |
| race_id        | INT FK      |                  |
| round          | TINYINT     | 第幾回合         |
| event_type     | VARCHAR     | 事件類型         |
| target_runners | JSON        | 受影響角色       |
| description    | TEXT        | 事件描述文字     |

### `race_character` — 角色定義

| 欄位          | 類型        | 說明                     |
| ------------- | ----------- | ------------------------ |
| id            | INT PK AUTO |                          |
| name          | VARCHAR     | 角色名稱                 |
| personality   | ENUM        | 性格類型                 |
| avatar_url    | VARCHAR     | 頭像                     |
| custom_events | JSON NULL   | 專屬事件（可為空）       |

## 玩家互動

### LINE 指令

- `賽馬` → 顯示目前比賽狀態 + LIFF 連結
- `下注 [角色名] [金額]` → 下注
- `賽馬紀錄` → 查看個人投注歷史

### LIFF 頁面（`/race`）

- **下注期**：角色列表 + 即時賠率 + 下注介面
- **比賽中**：賽道進度條 + 事件時間軸 + 回合紀錄
- **結束**：結果 + 獎金分配明細

前端透過 polling（每 10 秒）取得最新狀態，因推進間隔為 10 分鐘，不需 WebSocket。

## 技術架構

- **後端**：復用現有 Cron + MySQL + Knex 架構
- **遊戲引擎**：`app/src/service/RaceService.js` 處理回合推進邏輯
- **Cron**：每分鐘檢查是否有比賽需要推進或開賽
- **結算**：復用 Inventory model 的女神石交易模式，Knex transaction + forUpdate 鎖
- **前端**：LIFF React 頁面，API polling 取狀態

## 開發分期

### Phase 1 — 核心可玩

- DB migration（5 張表）
- 比賽生命週期（開賽 → 下注 → 推進 → 結算）
- 基礎移動（體力 + 隨機）+ 簡單隨機事件
- Cron 排程
- LINE 下注指令
- LIFF 基本頁面（表格顯示位置，能下注）
- 初始 5-8 隻角色（名字 + 頭像，無專屬事件）

### Phase 2 — 豐富度

- 地形系統
- 性格系統
- 更多事件種類
- 角色專屬事件台詞

### Phase 3 — 體驗升級

- LIFF 賽道動畫
- 回合播報動畫（角色移動、事件特效）
- 歷史戰績統計頁面
- 角色勝率排行
