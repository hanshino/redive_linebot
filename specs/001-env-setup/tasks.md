# Tasks: 開發環境建制

**Input**: Design documents from `/specs/001-env-setup/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: 此環境建制功能不需要自動化測試（僅需手動驗證服務可用性）

**Organization**: Tasks 按 User Story 分組，確保每個 Story 可獨立實作與驗證

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 可平行執行（不同檔案、無依賴）
- **[Story]**: 所屬 User Story（例如 US1, US2, US3, US4）
- 描述中包含確切檔案路徑

## Path Conventions

採用 Web app monorepo 結構：

- `apps/backend/` - NestJS 後端
- `apps/frontend/` - React 前端
- `packages/` - 共用套件
- `docker/` - Docker 設定

---

## Phase 1: Setup (專案初始化)

**Purpose**: 建立 monorepo 基礎結構與設定檔

- [x] T001 建立根目錄 pnpm-workspace.yaml 定義 workspace 結構
- [x] T002 建立根目錄 package.json 包含 workspace scripts 與 engines 設定
- [x] T003 建立 .nvmrc 指定 Node.js 24 LTS 版本
- [x] T004 建立 tsconfig.base.json 共用 TypeScript 基礎配置
- [x] T005 [P] 建立 .gitignore 排除 node_modules、dist、.env 等
- [x] T006 [P] 建立 .env.example 環境變數範本

---

## Phase 2: Foundational (基礎設施 - 阻塞所有 User Stories)

**Purpose**: Docker 服務與核心設定，必須完成後才能開始任何 User Story

**⚠️ CRITICAL**: 此階段完成前，無法執行任何 User Story

### Docker 環境

- [x] T007 建立 docker/docker-compose.yml 定義 PostgreSQL 16 與 Redis 7 服務
- [x] T008 [P] 建立 docker/.env.example Docker 專用環境變數範本

### Backend 專案初始化

- [x] T009 建立 apps/backend/package.json 定義 NestJS 專案與相依套件
- [x] T010 建立 apps/backend/tsconfig.json 繼承 tsconfig.base.json
- [x] T011 [P] 建立 apps/backend/nest-cli.json NestJS CLI 配置
- [x] T012 建立 apps/backend/src/main.ts NestJS + Fastify 進入點
- [x] T013 建立 apps/backend/src/app.module.ts 根模組

### Frontend 專案初始化

- [x] T014 建立 apps/frontend/package.json 定義 React + Vite 專案與相依套件
- [x] T015 建立 apps/frontend/tsconfig.json 繼承 tsconfig.base.json
- [x] T016 [P] 建立 apps/frontend/tsconfig.node.json Vite 配置專用
- [x] T017 建立 apps/frontend/vite.config.ts Vite 配置含 Tailwind 插件
- [x] T018 建立 apps/frontend/index.html HTML 入口頁面
- [x] T019 建立 apps/frontend/src/main.tsx React 進入點
- [x] T020 建立 apps/frontend/src/App.tsx 根元件

### Prisma 資料庫設定

- [x] T021 建立 apps/backend/prisma/schema.prisma 定義資料庫連線與初始 schema

**Checkpoint**: 基礎設施準備完成 - User Story 實作現在可以開始

---

## Phase 3: User Story 4 - 開發者安裝專案相依套件 (Priority: P1) 🎯 MVP

**Goal**: 確保 `pnpm install` 可成功安裝所有 workspace 相依套件

**Independent Test**: 執行 `pnpm install` 後無錯誤，`pnpm typecheck` 無型別錯誤

### Implementation for User Story 4

- [x] T022 [US4] 驗證 pnpm-workspace.yaml 正確引用 apps/_ 與 packages/_
- [x] T023 [US4] 確認所有 package.json 的 name 欄位使用 @repo/ namespace
- [x] T024 [US4] 在根目錄 package.json 加入 `install` 與 `typecheck` scripts
- [x] T025 [US4] 執行 pnpm install 驗證所有套件安裝成功

**Checkpoint**: User Story 4 完成 - 套件安裝功能可獨立驗證

---

## Phase 4: User Story 1 - 開發者啟動完整開發環境 (Priority: P1) 🎯 MVP

**Goal**: 透過單一指令啟動後端、前端、PostgreSQL、Redis 所有服務

**Independent Test**: 執行 `pnpm dev` 後可存取 http://localhost:3000/health 與 http://localhost:5173

### Implementation for User Story 1

- [x] T026 [US1] 建立 apps/backend/src/config/config.module.ts 設定模組
- [x] T027 [US1] 建立 apps/backend/src/config/configuration.ts 環境變數載入
- [x] T028 [P] [US1] 建立 apps/backend/src/health/health.module.ts 健康檢查模組
- [x] T029 [P] [US1] 建立 apps/backend/src/health/health.controller.ts 健康檢查 API
- [x] T030 [P] [US1] 建立 apps/backend/src/health/health.service.ts 健康檢查邏輯
- [x] T031 [US1] 更新 apps/backend/src/app.module.ts 匯入 ConfigModule 與 HealthModule
- [x] T032 [US1] 在 apps/backend/package.json 加入 `dev` script (nest start --watch)
- [x] T033 [P] [US1] 在 apps/frontend/package.json 加入 `dev` script (vite)
- [x] T034 [US1] 在根目錄 package.json 加入 `dev` script 同時啟動前後端
- [x] T035 [US1] 在根目錄 package.json 加入 `docker:up` 與 `docker:down` scripts
- [x] T036 [US1] 更新 README.md 說明環境啟動步驟

**Checkpoint**: User Story 1 完成 - 開發環境可透過 `pnpm dev` 啟動

---

## Phase 5: User Story 2 - 開發者進行程式碼熱重載開發 (Priority: P1)

**Goal**: 修改程式碼後自動重新載入，無需手動重啟服務

**Independent Test**: 修改 backend/src 檔案後服務自動重啟，修改 frontend/src 檔案後瀏覽器自動更新

### Implementation for User Story 2

- [x] T037 [US2] 確認 apps/backend/package.json dev script 包含 --watch 參數
- [x] T038 [US2] 確認 apps/frontend/vite.config.ts 設定 HMR 支援
- [x] T039 [US2] 在 apps/frontend/src/App.tsx 加入測試用內容以驗證 HMR
- [x] T040 [US2] 更新 quickstart.md 說明熱重載驗證方式

**Checkpoint**: User Story 2 完成 - 熱重載功能可獨立驗證

---

## Phase 6: User Story 3 - 開發者管理資料庫 Schema (Priority: P2)

**Goal**: 透過 Prisma 管理資料庫結構，包含 migration 與 schema 同步

**Independent Test**: 執行 `pnpm db:push` 後資料庫結構成功同步

### Implementation for User Story 3

- [x] T041 [US3] 在 apps/backend/package.json 加入 prisma 與 @prisma/client 相依套件
- [x] T042 [US3] 更新 apps/backend/prisma/schema.prisma 加入 User model
- [x] T043 [US3] 建立 apps/backend/src/prisma/prisma.module.ts Prisma 模組
- [x] T044 [US3] 建立 apps/backend/src/prisma/prisma.service.ts Prisma 服務（單例）
- [x] T045 [US3] 更新 apps/backend/src/app.module.ts 匯入 PrismaModule
- [x] T046 [US3] 在根目錄 package.json 加入 db:generate、db:push、db:migrate、db:studio scripts
- [x] T047 [US3] 更新 apps/backend/src/health/health.service.ts 加入資料庫健康檢查

**Checkpoint**: User Story 3 完成 - 資料庫管理功能可獨立驗證

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 整合優化與文件完善

- [x] T048 [P] 建立 apps/frontend/src/index.css 含 Tailwind 基礎樣式
- [x] T049 [P] 初始化 shadcn/ui 配置 (components.json)
- [x] T050 [P] 建立 apps/frontend/src/lib/utils.ts 含 cn() 工具函式
- [x] T051 [P] 建立 apps/frontend/src/lib/queryClient.ts TanStack Query 配置
- [x] T052 [P] 建立 apps/frontend/src/stores/index.ts Zustand store 基礎結構
- [x] T053 整合 Redis 連線至 apps/backend (ioredis 模組)
- [x] T054 整合 @line/bot-sdk 至 apps/backend/package.json
- [x] T055 更新 README.md 完整說明所有功能與指令
- [x] T056 執行 quickstart.md 驗證所有步驟正確

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無依賴 - 可立即開始
- **Foundational (Phase 2)**: 依賴 Setup 完成 - **阻塞所有 User Stories**
- **User Story 4 (Phase 3)**: 依賴 Foundational 完成 - 套件安裝
- **User Story 1 (Phase 4)**: 依賴 Foundational 完成 - 環境啟動
- **User Story 2 (Phase 5)**: 依賴 User Story 1 完成 - 熱重載
- **User Story 3 (Phase 6)**: 依賴 Foundational 完成 - 資料庫管理
- **Polish (Phase 7)**: 依賴所有核心功能完成

### User Story Dependencies

| User Story     | 依賴    | 說明                 |
| -------------- | ------- | -------------------- |
| US4 套件安裝   | Phase 2 | 可獨立測試           |
| US1 環境啟動   | Phase 2 | 可獨立測試，核心 MVP |
| US2 熱重載     | US1     | 需要服務運行才能測試 |
| US3 資料庫管理 | Phase 2 | 可獨立測試           |

### Parallel Opportunities

```text
Phase 1 (Setup):
├── T001-T004 (sequential - base config)
└── T005, T006 [P] (parallel)

Phase 2 (Foundational):
├── T007-T008 [Docker] (parallel)
├── T009-T013 [Backend] (mostly sequential)
├── T014-T020 [Frontend] (mostly sequential)
└── T021 [Prisma] (parallel with Frontend)

Phase 4 (US1):
├── T028, T029, T030 [P] (Health module - parallel)
└── T033 [P] (Frontend dev script - parallel with backend)

Phase 7 (Polish):
└── T048-T052 [P] (all parallel - different files)
```

---

## Parallel Example: User Story 1

```bash
# 可同時執行的任務：
Task T028: "建立 apps/backend/src/health/health.module.ts"
Task T029: "建立 apps/backend/src/health/health.controller.ts"
Task T030: "建立 apps/backend/src/health/health.service.ts"
Task T033: "在 apps/frontend/package.json 加入 dev script"
```

---

## Implementation Strategy

### MVP First (User Story 4 + 1)

1. ✅ Complete Phase 1: Setup
2. ✅ Complete Phase 2: Foundational (CRITICAL)
3. ✅ Complete Phase 3: User Story 4 (套件安裝)
4. ✅ Complete Phase 4: User Story 1 (環境啟動)
5. **STOP and VALIDATE**: 驗證 `pnpm install` 與 `pnpm dev` 正常運作
6. Deploy/demo if ready - **這是可用的 MVP！**

### Incremental Delivery

1. Setup + Foundational → 基礎架構完成
2. Add US4 (套件安裝) → 測試 `pnpm install`
3. Add US1 (環境啟動) → 測試 `pnpm dev` → **MVP!**
4. Add US2 (熱重載) → 測試程式碼變更自動重載
5. Add US3 (資料庫管理) → 測試 `pnpm db:push`
6. Add Polish → 完整功能

---

## Notes

- [P] 任務 = 不同檔案、無依賴，可平行執行
- [USx] 標籤將任務對應至特定 User Story 以便追蹤
- 每個 User Story 應可獨立完成並測試
- 每個任務或邏輯群組完成後進行 commit
- 在任何 checkpoint 停止以驗證 story 獨立性
- 避免：模糊任務、同一檔案衝突、破壞獨立性的跨 story 依賴
