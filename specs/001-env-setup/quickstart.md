# Quickstart: 開發環境建制

**Feature**: 001-env-setup  
**預估時間**: 5 分鐘

## 前置需求

| 工具           | 版本   | 安裝指引                                                                   |
| -------------- | ------ | -------------------------------------------------------------------------- |
| Node.js        | 24 LTS | [https://nodejs.org/](https://nodejs.org/) 或使用 nvm                      |
| pnpm           | 9.x    | `npm install -g pnpm`                                                      |
| Docker         | 24.x+  | [https://docs.docker.com/get-docker/](https://docs.docker.com/get-docker/) |
| Docker Compose | v2.x   | 隨 Docker Desktop 安裝                                                     |

## 快速開始

### 1. Clone 專案並安裝相依套件

```bash
git clone https://github.com/hanshino/redive_linebot.git
cd redive_linebot
pnpm install
```

### 2. 設定環境變數

```bash
cp .env.example .env
# 編輯 .env 檔案，設定必要的環境變數
```

### 3. 啟動基礎服務 (PostgreSQL + Redis)

```bash
pnpm docker:up
# 或
docker compose up -d
```

### 4. 初始化資料庫

```bash
pnpm db:push
# 或
pnpm db:migrate
```

### 5. 啟動開發伺服器

```bash
# 同時啟動前後端
pnpm dev

# 或分別啟動
pnpm --filter @repo/backend dev
pnpm --filter @repo/frontend dev
```

## 服務端點

| 服務         | 端點                         | 說明              |
| ------------ | ---------------------------- | ----------------- |
| Backend API  | http://localhost:3000        | NestJS API 伺服器 |
| Frontend     | http://localhost:5173        | Vite 開發伺服器   |
| Health Check | http://localhost:3000/health | 健康檢查端點      |
| PostgreSQL   | localhost:5432               | 資料庫            |
| Redis        | localhost:6379               | 快取              |

## 常用指令

```bash
# 安裝相依套件
pnpm install

# 啟動開發環境
pnpm dev

# 啟動 Docker 服務
pnpm docker:up

# 停止 Docker 服務
pnpm docker:down

# 資料庫操作
pnpm db:generate    # 生成 Prisma Client
pnpm db:push        # 同步 schema 到資料庫
pnpm db:migrate     # 執行 migration
pnpm db:studio      # 開啟 Prisma Studio

# 程式碼品質
pnpm lint           # 執行 ESLint
pnpm typecheck      # 執行型別檢查
pnpm test           # 執行測試

# 建置
pnpm build          # 建置所有專案
```

## 驗證環境

執行以下指令確認環境正常：

```bash
# 1. 確認服務啟動
curl http://localhost:3000/health

# 預期回應:
# {"status":"ok","timestamp":"...","services":{"database":"healthy","redis":"healthy"}}

# 2. 確認前端
open http://localhost:5173
# 應顯示預設頁面
```

## 熱重載驗證 (HMR)

開發環境支援程式碼熱重載，修改後自動更新，無需手動重啟服務。

### Backend 熱重載測試

1. 確保 backend 以 `pnpm dev` 或 `pnpm --filter @repo/backend dev` 啟動
2. 編輯 `apps/backend/src/health/health.controller.ts`
3. 修改任意內容（例如 log 訊息）
4. 觀察終端機輸出，應顯示 NestJS 自動重新編譯與啟動

```text
[Nest] LOG [NestFactory] Starting Nest application...
```

### Frontend 熱重載測試

1. 確保 frontend 以 `pnpm dev` 或 `pnpm --filter @repo/frontend dev` 啟動
2. 在瀏覽器開啟 http://localhost:5173
3. 編輯 `apps/frontend/src/App.tsx`
4. 修改標題文字，例如 `🎮 Redive LineBot` → `🎮 Redive LineBot v2`
5. 儲存後瀏覽器應立即更新，無需手動重新整理

### 預期行為

| 變更類型      | 預期行為               | 更新時間 |
| ------------- | ---------------------- | -------- |
| Backend .ts   | 自動重新編譯並重啟服務 | ~2-3 秒  |
| Frontend .tsx | 瀏覽器即時更新 (HMR)   | <1 秒    |
| Frontend .css | 瀏覽器即時更新 (HMR)   | <1 秒    |
| Prisma schema | 需手動執行 db:generate | N/A      |

## 常見問題

### Port 被佔用

```bash
# 檢查 port 使用狀況
lsof -i :3000
lsof -i :5173
lsof -i :5432
lsof -i :6379

# 停止佔用的程序或修改 .env 中的 port 設定
```

### Docker 服務無法啟動

```bash
# 確認 Docker 正在執行
docker info

# 查看容器日誌
docker compose logs -f
```

### Prisma 錯誤

```bash
# 重新生成 Prisma Client
pnpm db:generate

# 重置資料庫（開發環境）
pnpm db:push --force-reset
```

## 下一步

環境建制完成後，您可以開始進行功能開發：

1. 參考 `specs/` 目錄中的功能規格
2. 在 `apps/backend/src/` 中新增 NestJS 模組
3. 在 `apps/frontend/src/` 中新增 React 頁面
4. 使用 `pnpm test` 驗證變更
