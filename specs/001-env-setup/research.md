# Research: 開發環境建制

**Feature**: 001-env-setup  
**Date**: 2024-12-07  
**Status**: Completed

## 1. NestJS + Fastify 配置

### Decision: 使用 @nestjs/platform-fastify 取代 Express

**Rationale**:

- Fastify 比 Express 快約 2 倍
- 原生支援 TypeScript
- 內建 validation 和 serialization

**Alternatives Considered**:

- Express (預設): 生態系較大但效能較差
- Koa: 需要更多手動配置

**Key Configuration**:

```typescript
// main.ts
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
  );
  // 重要：容器環境必須綁定 0.0.0.0
  await app.listen(process.env.PORT ?? 3000, "0.0.0.0");
}
```

**Pitfalls to Avoid**:

- Fastify 預設只監聽 localhost，容器中必須綁定 `0.0.0.0`
- Express 中間件不相容，需使用 Fastify 版本

---

## 2. pnpm Workspace Monorepo 結構

### Decision: 使用 apps/ + packages/ 結構

**Rationale**:

- 業界標準的 monorepo 結構
- 清晰分離應用程式與共用套件
- 方便擴展多個應用

**Structure**:

```
project-root/
├── pnpm-workspace.yaml
├── apps/
│   ├── backend/          # NestJS 應用
│   └── frontend/         # React 應用
└── packages/
    ├── database/         # Prisma 配置
    └── shared-types/     # 共用型別
```

**pnpm-workspace.yaml**:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Key Practices**:

- 使用 namespace 命名: `@repo/package-name`
- 使用 `workspace:*` 協議引用內部套件
- Root package.json 管理全域腳本

---

## 3. TypeScript Monorepo 配置

### Decision: 使用 Project References 和共享基礎配置

**Rationale**:

- 增量編譯提升效能
- 型別安全的跨套件引用
- IDE 支援更佳

**tsconfig.base.json**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true,
    "incremental": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  }
}
```

**Pitfalls to Avoid**:

- 不要在根目錄放置編譯用 tsconfig.json
- 避免使用 barrel files (index.ts 重導出) 影響效能

---

## 4. Docker Compose 開發環境

### Decision: PostgreSQL 16 Alpine + Redis 7 Alpine

**Rationale**:

- Alpine 版本減少映像大小
- 配置 healthcheck 確保服務就緒
- 使用 named volumes 持久化資料

**docker-compose.yml**:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-redive_dev}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5
    shm_size: 128mb

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

---

## 5. Prisma 在 Monorepo 中的配置

### Decision: 獨立 packages/database 套件

**Rationale**:

- 集中管理資料庫 schema
- 共用 Prisma Client 實例
- 單例模式避免多個連線

**Structure**:

```
packages/database/
├── package.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts          # 匯出 PrismaClient 實例
    └── generated/client/ # Prisma 生成的 client
```

**prisma/schema.prisma**:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Pitfalls to Avoid**:

- 修改 schema 後必須重新執行 `prisma generate`
- CI/CD 中 build 前必須先 generate

---

## 6. React + Vite + shadcn/ui 配置

### Decision: Tailwind CSS v4 + Vite 插件

**Rationale**:

- Tailwind v4 使用 `@tailwindcss/vite` 插件
- 不需要 PostCSS 配置
- 更簡潔的設置

**vite.config.ts**:

```typescript
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
```

**Project Structure**:

```
src/
├── components/
│   ├── ui/              # shadcn/ui 元件
│   ├── layout/          # 版面元件
│   └── common/          # 通用元件
├── features/            # 功能模組
├── pages/               # 頁面元件
├── stores/              # Zustand stores
│   └── slices/          # Store slices
├── services/            # API 服務層
├── hooks/               # 共用 hooks
├── lib/                 # 工具與配置
│   ├── utils.ts
│   └── queryClient.ts
└── types/               # 型別定義
```

---

## 7. Zustand 狀態管理

### Decision: Slices Pattern + persist middleware

**Rationale**:

- 拆分 store 提升可維護性
- persist middleware 持久化重要狀態
- 與 TanStack Query 分工明確

**Best Practices**:

- Actions 與 State 共存於 store 內
- Middleware 只在頂層應用
- 避免將 server state 放入 Zustand

---

## 8. TanStack Query 配置

### Decision: Query Key Factory Pattern

**Rationale**:

- 集中管理 query keys
- 避免 key 衝突
- 方便 invalidation

**Configuration**:

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分鐘
      gcTime: 1000 * 60 * 30, // 30 分鐘
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

---

## 9. Node.js 版本管理

### Decision: 使用 .nvmrc 指定 Node.js 24 LTS

**Rationale**:

- 統一團隊開發環境
- 與 package.json engines 搭配使用

**.nvmrc**:

```
24
```

**package.json**:

```json
{
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

---

## Summary: 關鍵決策清單

| 項目          | 決策                                       |
| ------------- | ------------------------------------------ |
| HTTP 框架     | NestJS + Fastify                           |
| Monorepo 工具 | pnpm workspace                             |
| 專案結構      | apps/ + packages/                          |
| ORM           | Prisma (獨立 database 套件)                |
| 前端框架      | React + Vite                               |
| CSS 框架      | Tailwind CSS v4 + shadcn/ui                |
| 狀態管理      | Zustand (client) + TanStack Query (server) |
| 容器化        | Docker Compose (PostgreSQL 16 + Redis 7)   |
| Node 版本     | 24 LTS                                     |
| 套件管理      | pnpm 9.x                                   |
