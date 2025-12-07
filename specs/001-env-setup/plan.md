# Implementation Plan: 開發環境建制

**Branch**: `001-env-setup` | **Date**: 2024-12-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-env-setup/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

建立完整的 NestJS + React + PostgreSQL + Redis 開發環境，使用 pnpm workspace 管理 monorepo 結構，Docker Compose 管理基礎服務，並提供熱重載開發體驗。

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 24 LTS  
**Primary Dependencies**:

- Backend: NestJS + Fastify, Prisma ORM, @line/bot-sdk, @nestjs/schedule, BullMQ, ioredis
- Frontend: React 18, Vite, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, lucide-react
  **Storage**: PostgreSQL 16 (primary), Redis 7 (cache/queue)  
  **Testing**: Vitest (unit/integration), Playwright (e2e, optional)  
  **Target Platform**: Linux server (Docker), 開發者本機 (Linux/macOS/Windows WSL2)
  **Project Type**: web (frontend + backend monorepo)  
  **Performance Goals**: 開發環境啟動 < 5 分鐘, 熱重載 < 3 秒 (backend) / < 1 秒 (frontend)  
  **Constraints**: 使用 Docker 容器化資料庫，避免本機安裝依賴  
  **Scale/Scope**: 單一開發者或小團隊開發環境

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Status  | Notes                                               |
| ------------------------------------ | ------- | --------------------------------------------------- |
| I. Testability-First Design          | ✅ PASS | 後端使用 NestJS DI 架構，天生支援依賴注入與測試隔離 |
| II. Library Reuse Priority           | ✅ PASS | 優先採用成熟函式庫（NestJS, Prisma, shadcn/ui 等）  |
| III. Clean Code Compliance           | ✅ PASS | 專案結構清晰，遵循慣例                              |
| IV. No Over-Engineering              | ✅ PASS | 僅建立必要的基礎結構，無過度抽象                    |
| V. Database-Free Integration Testing | ✅ PASS | 測試將使用 mock 或 SQLite，非 PostgreSQL            |

## Project Structure

### Documentation (this feature)

```text
specs/001-env-setup/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Web application structure (frontend + backend monorepo)
apps/
├── backend/
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── health/           # 健康檢查模組
│   │   ├── config/           # 設定模組
│   │   └── common/           # 共用工具
│   ├── prisma/
│   │   └── schema.prisma
│   ├── test/
│   │   ├── unit/
│   │   └── integration/
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── components/
    │   │   └── ui/           # shadcn/ui 元件
    │   ├── pages/
    │   ├── stores/           # Zustand stores
    │   └── services/         # TanStack Query hooks
    ├── test/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    └── tsconfig.json

packages/                     # 共用套件 (預留)
├── shared-types/             # 前後端共用型別
└── eslint-config/            # 共用 ESLint 設定

docker/
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example

# Root level
├── pnpm-workspace.yaml
├── package.json              # Root scripts
├── turbo.json                # (optional) Turborepo config
├── .nvmrc                    # Node.js 24 LTS
└── README.md
```

**Structure Decision**: 採用 `apps/` + `packages/` 結構，符合現代 pnpm workspace monorepo 慣例。Backend 與 Frontend 分開管理，未來可擴展為多個應用。

## Constitution Check - Post-Design Verification

_Re-evaluation after Phase 1 design completion._

| Principle                            | Status  | Post-Design Notes                            |
| ------------------------------------ | ------- | -------------------------------------------- |
| I. Testability-First Design          | ✅ PASS | NestJS DI 架構 + Vitest 配置，支援 mock 測試 |
| II. Library Reuse Priority           | ✅ PASS | 所有核心功能皆使用成熟函式庫                 |
| III. Clean Code Compliance           | ✅ PASS | 模組化結構、清晰命名慣例                     |
| IV. No Over-Engineering              | ✅ PASS | 僅建立必要檔案，無預設抽象層                 |
| V. Database-Free Integration Testing | ✅ PASS | Prisma 支援 mock client                      |

**Verification**: All gates passed. Ready for Phase 2 (tasks generation).

## Complexity Tracking

> 無違反憲法原則，不需填寫。
