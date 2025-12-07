# Tasks: LINE Bot 事件處理基礎建設

**Input**: Design documents from `/specs/002-line-event-handler/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: 本次不包含測試任務（未明確要求 TDD 流程）

**Organization**: 任務按 User Story 分組，以支援獨立實作和測試

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 可並行執行（不同檔案，無相依性）
- **[Story]**: 所屬 User Story（如 US1, US2, US3, US4）
- 描述中包含確切檔案路徑

## Path Conventions

- **Web app**: `apps/backend/src/`, `apps/backend/test/`
- 基於 plan.md 中定義的 monorepo 結構

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 專案初始化和基礎結構設定

- [ ] T001 新增 LINE Bot 環境變數到 config 模組 in `apps/backend/src/config/configuration.ts`
- [ ] T002 設定 Fastify raw body 支援（簽名驗證需要原始請求體） in `apps/backend/src/main.ts`
- [ ] T003 [P] 建立 LINE 模組目錄結構 in `apps/backend/src/line/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 核心基礎設施，所有 User Story 開始前必須完成

**⚠️ CRITICAL**: 此階段完成前無法開始任何 User Story 實作

- [ ] T004 建立 LINE 事件型別定義（re-export from SDK） in `apps/backend/src/line/types/events.ts`
- [ ] T005 [P] 建立 Middleware 型別定義（Context, NextFunction, Middleware interface） in `apps/backend/src/line/middleware/middleware.types.ts`
- [ ] T006 [P] 建立 LINE 模組定義（空殼，稍後填入 providers） in `apps/backend/src/line/line.module.ts`
- [ ] T007 將 LineModule 匯入至 AppModule in `apps/backend/src/app.module.ts`

**Checkpoint**: 基礎設施就緒 - 可開始 User Story 實作

---

## Phase 3: User Story 1 & 2 - 接收文字訊息 + 驗證簽名 (Priority: P1) 🎯 MVP

**Goal**: 系統能接收 LINE Webhook 請求、驗證簽名、並透過 middleware 處理事件

**Independent Test**: 發送帶有正確簽名的請求到 `/line/webhook`，確認返回 200 OK 並記錄事件

### Implementation for User Story 1 & 2

- [ ] T008 [US1] 實作 MiddlewareRunner（洋蔥模型執行器） in `apps/backend/src/line/middleware/middleware.runner.ts`
- [ ] T009 [US2] 實作 SignatureGuard（LINE 簽名驗證 Guard） in `apps/backend/src/line/guards/signature.guard.ts`
- [ ] T010 [P] [US1] 實作 LoggingMiddleware（結構化日誌記錄） in `apps/backend/src/line/middleware/logging.middleware.ts`
- [ ] T011 [US1] 實作 LineService（LINE client 封裝，處理回覆訊息） in `apps/backend/src/line/line.service.ts`
- [ ] T012 [US1] 實作 LineController（Webhook 端點，POST /line/webhook） in `apps/backend/src/line/line.controller.ts`
- [ ] T013 更新 LineModule 註冊所有 providers 和 guards in `apps/backend/src/line/line.module.ts`

**Checkpoint**: 此時 User Story 1 & 2 應完全可用：系統可接收 LINE Webhook 並驗證簽名

---

## Phase 4: User Story 3 - 支援多種 LINE 事件類型 (Priority: P2)

**Goal**: 系統能識別並分派不同類型的 LINE 事件（Follow、Postback、MemberJoined 等）

**Independent Test**: 模擬 Follow 和 Postback 事件，確認系統能正確識別事件類型並記錄

### Implementation for User Story 3

- [ ] T014 [US3] 擴展 LoggingMiddleware 支援所有事件類型的結構化日誌 in `apps/backend/src/line/middleware/logging.middleware.ts`
- [ ] T015 [US3] 在 LineController 中處理批次事件（迴圈處理 events 陣列） in `apps/backend/src/line/line.controller.ts`
- [ ] T016 [US3] 新增事件類型辨識邏輯與錯誤處理（未知事件優雅忽略） in `apps/backend/src/line/line.service.ts`

**Checkpoint**: 系統能正確識別並處理 5 種以上事件類型

---

## Phase 5: User Story 4 - Middleware 鏈式處理機制 (Priority: P2)

**Goal**: 開發者能註冊多個 middleware，事件按順序經過每個 middleware，支援洋蔥模型

**Independent Test**: 註冊 3 個測試 middleware，確認事件依序經過 A → B → C，且支援 next() 後的後置邏輯

### Implementation for User Story 4

- [ ] T017 [US4] 完善 MiddlewareRunner 支援中斷處理流程 in `apps/backend/src/line/middleware/middleware.runner.ts`
- [ ] T018 [US4] 實作 middleware 註冊機制（使用 NestJS DI token） in `apps/backend/src/line/line.module.ts`
- [ ] T019 [US4] 新增範例 EchoMiddleware 展示如何建立自定義 middleware in `apps/backend/src/line/middleware/echo.middleware.ts`
- [ ] T020 [US4] 更新 quickstart.md 加入自定義 middleware 範例 in `specs/002-line-event-handler/quickstart.md`

**Checkpoint**: Middleware 鏈式處理完全可用，開發者能輕鬆新增自定義 middleware

---

## Phase 6: 冪等性檢查 (Cross-Cutting)

**Purpose**: 實作事件 ID 冪等性檢查，防止重複處理

- [ ] T021 實作 IdempotencyService（Redis SETNX + TTL） in `apps/backend/src/line/services/idempotency.service.ts`
- [ ] T022 在 LineController 中整合 IdempotencyService 過濾重複事件 in `apps/backend/src/line/line.controller.ts`
- [ ] T023 更新 LineModule 註冊 IdempotencyService in `apps/backend/src/line/line.module.ts`

**Checkpoint**: 重複事件會被自動跳過

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 改進影響多個 User Story 的功能

- [ ] T024 [P] 新增 LINE 模組 barrel export in `apps/backend/src/line/index.ts`
- [ ] T025 [P] 錯誤處理優化：確保單一事件失敗不影響批次中其他事件 in `apps/backend/src/line/line.controller.ts`
- [ ] T026 驗證 quickstart.md 所有範例可正常運作 in `specs/002-line-event-handler/quickstart.md`
- [ ] T027 執行手動測試：發送真實 LINE 訊息驗證完整流程

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無相依性 - 可立即開始
- **Foundational (Phase 2)**: 依賴 Setup 完成 - 阻擋所有 User Stories
- **User Stories 1&2 (Phase 3)**: 依賴 Foundational 完成
- **User Story 3 (Phase 4)**: 依賴 Phase 3 完成
- **User Story 4 (Phase 5)**: 依賴 Phase 3 完成，可與 Phase 4 並行
- **冪等性 (Phase 6)**: 依賴 Phase 3 完成，可與 Phase 4/5 並行
- **Polish (Phase 7)**: 依賴所有期望的 User Stories 完成

### User Story Dependencies

- **User Story 1 & 2 (P1)**: Foundational 完成後即可開始 - 無其他 Story 相依
- **User Story 3 (P2)**: 依賴 US1&2 完成（需要 Controller 和 Middleware 架構）
- **User Story 4 (P2)**: 依賴 US1&2 完成（需要 MiddlewareRunner）

### Within Each User Story

- 型別定義優先
- Guard 和 Service 可並行
- Controller 最後（依賴 Guard 和 Service）
- 模組更新在最後

### Parallel Opportunities

- T001, T002, T003 中只有 T003 可獨立並行（標記 [P]）
- T004, T005, T006 中 T005, T006 可並行（標記 [P]）
- T010 可與 T008, T009 並行
- Phase 4, 5, 6 可在 Phase 3 完成後並行執行

---

## Parallel Example: Phase 2

```bash
# 這些任務可同時執行：
Task T005: "建立 Middleware 型別定義 in apps/backend/src/line/middleware/middleware.types.ts"
Task T006: "建立 LINE 模組定義 in apps/backend/src/line/line.module.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 & 2 Only)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational (CRITICAL - 阻擋所有 stories)
3. 完成 Phase 3: User Story 1 & 2
4. **STOP and VALIDATE**: 獨立測試 User Story 1 & 2
5. 若準備好可部署/展示

### Incremental Delivery

1. 完成 Setup + Foundational → 基礎就緒
2. 新增 User Story 1&2 → 獨立測試 → 部署/展示 (MVP!)
3. 新增 User Story 3 → 獨立測試 → 部署/展示
4. 新增 User Story 4 → 獨立測試 → 部署/展示
5. 新增冪等性檢查 → 測試 → 部署/展示
6. 每個 Story 增加價值且不破壞先前的 Stories

---

## Summary

| 指標                   | 數值 |
| ---------------------- | ---- |
| 總任務數               | 27   |
| Phase 1 (Setup)        | 3    |
| Phase 2 (Foundational) | 4    |
| Phase 3 (US1&2 - MVP)  | 6    |
| Phase 4 (US3)          | 3    |
| Phase 5 (US4)          | 4    |
| Phase 6 (冪等性)       | 3    |
| Phase 7 (Polish)       | 4    |
| 可並行任務             | 8    |

### User Story 任務分布

| User Story            | 任務數 |
| --------------------- | ------ |
| US1 (接收訊息)        | 5      |
| US2 (驗證簽名)        | 1      |
| US3 (多事件類型)      | 3      |
| US4 (Middleware 機制) | 4      |

### MVP 範圍（建議）

僅完成 Phase 1-3（共 13 個任務），即可獲得：

- ✅ LINE Webhook 端點
- ✅ 簽名驗證
- ✅ Middleware 基礎架構
- ✅ 結構化日誌

---

## Notes

- [P] 任務 = 不同檔案，無相依性，可並行
- [Story] 標籤將任務對應到特定 User Story
- 每個 User Story 應能獨立完成和測試
- 每個任務或邏輯群組完成後提交
- 任何 Checkpoint 都可暫停並驗證 Story 獨立性
- 避免：模糊的任務描述、同一檔案衝突、破壞獨立性的跨 Story 相依
