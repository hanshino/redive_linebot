# 猜拳競技場前端頁面設計

日期：2026-03-08

## 概述

在前端新增獨立的猜拳競技場頁面（`/janken`），包含戰況播報跑馬燈和 ELO 排行榜。

## 頁面佈局

路由：`/janken`，加入側邊導航列 `mainItems`。

### 上方：戰況播報

- 單筆卡片顯示，淡入淡出切換，每 3~4 秒輪播下一筆
- 每 30 秒 polling `GET /api/janken/recent-matches`，拉最近 20 筆
- 卡片內容格式：`玩家A 出拳 vs 出拳 玩家B｜結果｜積分變化`
- 出拳用文字顯示（石頭、剪刀、布）
- 左邊框顏色區分類型：
  - 預設主題色：一般對戰
  - 紅色：連勝終結（顯示懸賞金額）
  - 金色：高額對決（賭注 > 10,000）
  - 灰色調：平手

### 下方：ELO 排行榜

- Top 20，依 ELO 降序
- 每列顯示：排名、玩家名稱、段位名稱（如「達人 2」）、ELO 分數、勝/負/平、勝率 %、目前連勝（> 0 時）
- 前三名用金/銀/銅色視覺強調
- 卡片式列表，不用 DataGrid

## 新增 API

### `GET /api/janken/rankings`

回傳 Top 20 排行榜。

資料來源：`janken_rating` 表依 `elo` DESC 取前 20，玩家名稱從 `display_name` 欄位讀取（每次對戰時自動更新）。

回傳格式：
```json
[
  {
    "rank": 1,
    "displayName": "小明",
    "rankLabel": "達人 2",
    "rankTier": "master",
    "elo": 1650,
    "winCount": 30,
    "loseCount": 10,
    "drawCount": 5,
    "winRate": 66.7,
    "streak": 3
  }
]
```

### `GET /api/janken/recent-matches`

回傳最近 20 筆對戰紀錄。

資料來源：`janken_records` JOIN `janken_result` 取最近 20 筆，搭配 `janken_rating` 取 ELO 變化。

回傳格式：
```json
[
  {
    "id": "match-uuid",
    "player1": { "displayName": "小明", "choice": "rock", "result": "win" },
    "player2": { "displayName": "小華", "choice": "scissors", "result": "lose" },
    "betAmount": 1000,
    "eloChange": 8,
    "streakBroken": null,
    "createdAt": "2026-03-08T12:00:00Z"
  }
]
```

`streakBroken` 為 `null` 或 `{ holder: "阿強", streak: 5, bounty: 3000 }`.

## 需要的 Migration

### janken_records 新增欄位：
- `p1_choice` (string, nullable) — P1 出拳
- `p2_choice` (string, nullable) — P2 出拳
- `p1_display_name` (string, nullable) — P1 當下名稱快照
- `p2_display_name` (string, nullable) — P2 當下名稱快照
- `elo_change` (integer, nullable) — 勝者的 ELO 變化量
- `streak_broken` (integer, nullable) — 被終結的連勝數
- `bounty_won` (integer, nullable) — 贏得的懸賞金

### janken_rating 新增欄位：
- `display_name` (string, nullable) — 快取的玩家名稱，每次對戰時更新

這些欄位在 `JankenService.resolveMatch()` 時一併寫入。活躍玩家的名稱會自動保持最新。

## 技術選擇

- Polling 30 秒，不用 Socket.IO
- CSS transition（fade in/out）做卡片切換動畫
- 響應式：手機和桌面都是上下堆疊
- 前端 service 新增 `frontend/src/services/janken.js`

## 檔案清單

### 後端（app/）
1. `app/migrations/YYYYMMDD_add_match_details_to_janken_records.js` — 新增欄位
2. `app/src/controller/application/JankenController.js` — 新增 `api.rankings` 和 `api.recentMatches`
3. `app/src/model/application/JankenRating.js` — 新增 `getTopRankings(limit)`
4. `app/src/model/application/JankenRecords.js` — 新增 `getRecentMatches(limit)`
5. `app/src/router/api.js` — 新增兩個 GET 路由
6. `app/src/service/JankenService.js` — resolveMatch 時寫入新欄位

### 前端（frontend/）
7. `frontend/src/pages/Janken/index.jsx` — 主頁面
8. `frontend/src/pages/Janken/BattleFeed.jsx` — 戰況播報元件
9. `frontend/src/pages/Janken/RankingList.jsx` — 排行榜元件
10. `frontend/src/services/janken.js` — API 呼叫
11. `frontend/src/App.jsx` — 新增路由
12. `frontend/src/components/NavDrawer.jsx` — 新增導航項目
