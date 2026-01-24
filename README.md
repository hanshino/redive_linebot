# Redive LineBot

公主連結 LINE Bot 翻新專案

## 技術棧

- **Backend**: NestJS + Fastify, Prisma ORM, @line/bot-sdk
- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, Zustand, TanStack Query
- **Database**: PostgreSQL 16, Redis 7
- **DevOps**: Docker Compose, pnpm workspace

## 環境需求

| 工具           | 版本   |
| -------------- | ------ |
| Node.js        | 24 LTS |
| pnpm           | 9.x    |
| Docker         | 24.x+  |
| Docker Compose | v2.x   |

## 快速開始

### 1. Clone 專案

```bash
git clone https://github.com/hanshino/redive_linebot.git
cd redive_linebot
```

### 2. 切換 Node.js 版本

```bash
nvm use  # 或 nvm install 24
```

### 3. 安裝相依套件

```bash
pnpm install
```

### 4. 設定環境變數

```bash
cp .env.example .env
# 編輯 .env 填入必要的設定
```

### 5. 啟動開發環境

```bash
# 啟動 Docker 服務 (PostgreSQL + Redis)
pnpm docker:up

# 同步資料庫 schema
pnpm db:push

# 啟動前後端開發伺服器
pnpm dev
```

## 服務端點

| 服務         | URL                          | 說明              |
| ------------ | ---------------------------- | ----------------- |
| Backend API  | http://localhost:3080        | NestJS API 伺服器 |
| Frontend     | http://localhost:5173        | Vite 開發伺服器   |
| Health Check | http://localhost:3080/health | 健康檢查端點      |

## 常用指令

```bash
# 開發
pnpm dev              # 啟動前後端開發伺服器
pnpm build            # 建置所有專案
pnpm typecheck        # 型別檢查
pnpm lint             # ESLint 檢查

# Docker
pnpm docker:up        # 啟動 PostgreSQL + Redis
pnpm docker:down      # 停止 Docker 服務
pnpm docker:logs      # 查看 Docker logs

# 資料庫
pnpm db:generate      # 生成 Prisma Client
pnpm db:push          # 同步 schema 到資料庫
pnpm db:migrate       # 執行 migration
pnpm db:studio        # 開啟 Prisma Studio
```

## 專案結構

```
redive_linebot/
├── apps/
│   ├── backend/          # NestJS 後端
│   │   ├── src/
│   │   │   ├── config/   # 設定模組
│   │   │   ├── health/   # 健康檢查
│   │   │   ├── prisma/   # Prisma 模組
│   │   │   └── redis/    # Redis 模組
│   │   └── prisma/       # Prisma schema
│   └── frontend/         # React 前端
│       └── src/
│           ├── components/
│           ├── stores/   # Zustand stores
│           └── lib/      # 工具函式
├── docker/               # Docker Compose 設定
├── packages/             # 共用套件 (預留)
└── specs/                # 功能規格文件
```

## License

MIT
