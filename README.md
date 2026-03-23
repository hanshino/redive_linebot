# 布丁機器人 — 公主連結 LINE Bot

公主連結 Re:Dive 的 LINE 聊天機器人，用 [Bottender](https://bottender.js.org/) 寫的。除了遊戲相關功能之外，也有不少群組互動的玩法，還附了一個 Web 管理後台。

## 功能

### 轉蛋系統

模擬遊戲抽卡，有機率計算和抽卡紀錄。管理員可以在後台設定卡池，玩家可以用女神石在兌換商店換角色。

### 聊天等級 & 排行榜

在群組裡聊天就會累積經驗值升等。每天簽到、連續簽到有額外獎勵。排行榜有好幾種，看誰最會聊。

### 猜拳競技場

跟其他玩家猜拳對戰，有段位系統。可以單挑，也可以開擂台賽讓人來挑戰。

### 世界王

多人一起打的 Raid Boss。可以記錄攻擊傷害、搭配裝備，打的時候會即時通知事件進度。

### 交易市場

玩家之間可以交易物品、互相轉帳，操作介面走 LINE LIFF。

### 背包 & 裝備

收集到的角色和裝備都在這裡管理，跟轉蛋、世界王的掉落物連動。

### 公會戰

報刀、看戰績、算補償刀，有 Web 介面可以用。

### 群組管理

管理員可以自訂群組指令、開關特定功能。後台有全群指令的統一管理頁面。

### AI 對話

接了 Google Gemini。訊息沒有匹配到任何指令的話，機器人會用「布丁」的角色個性回你。

### Web 管理後台

React + MUI 做的後台，有深色模式，手機也能用。可以管理卡池、設定世界王、看即時訊息。登入走 LINE LIFF。

## 技術架構

三個服務跑在 Docker Compose 上：

| 服務 | 說明 |
| --- | --- |
| **app** | Bottender Bot + Express API（port 5000） |
| **frontend** | React 19 + MUI 7 + Vite 管理後台（port 3000） |
| **job** | Node.js 定時排程 |

資料庫用 MySQL，快取用 Redis，前面擋一層 nginx。

後端是 Node.js + Express + Knex，前端是 React 19 + MUI 7 + Vite + React Router v7，圖表用 Recharts，動畫用 Framer Motion，即時更新靠 Socket.IO。AI 的部分接 Google Gemini。部署用 Docker Compose，開發環境可以搭 ngrok。

## 快速開始

### 事前準備

- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/)
- 去 [LINE Official Account Manager](https://manager.line.biz/) 申請機器人，拿到 Access Token 跟 Channel Secret

### 安裝與啟動

```bash
# 下載專案
git clone https://github.com/hanshino/redive_linebot.git
cd redive_linebot

# 設定環境變數
cp .env.example .env
# 編輯 .env，填入 LINE_ACCESS_TOKEN、LINE_CHANNEL_SECRET、DB_PASSWORD 等

# 安裝套件
cd app && yarn install && cd ..
cd frontend && yarn install && cd ..

# 啟動基礎設施
make infra

# 跑 migration
make migrate

# 開發模式（分別在兩個終端跑）
cd app && yarn dev
cd frontend && yarn dev
```

app 預設跑在 port 5000，frontend 跑在 port 3000。

### LINE Webhook 設定

把 `https://{your_domain}/webhooks/line` 填到 LINE 後台的 Webhook URL。

### 開發環境

沒有固定 IP 的話，用 [ngrok](https://ngrok.com/) 把本地服務公開：

```bash
ngrok http 80 --region ap
# 拿到的 https 網址加上 /webhooks/line，貼到 LINE 後台
```

`make logs` 看日誌，`make bash` 進 bot 容器。

## 常用指令

```bash
make infra             # 啟動 MySQL + Redis
make infra-stop        # 停掉基礎設施
make dev               # 啟動基礎設施，提示你去跑 yarn dev
make migrate           # 跑資料庫 migration
make logs              # 看基礎設施日誌
make bash-redis        # 開 Redis CLI
make ngrok-url         # 查 ngrok 公開網址
```

## 授權

開源專案，歡迎貢獻跟回報問題。
