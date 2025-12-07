# Implementation Plan: LINE Bot 事件處理基礎建設

**Branch**: `002-line-event-handler` | **Date**: 2024-12-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-line-event-handler/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

建立 LINE Bot 事件處理的基礎建設，包含：

- Webhook 端點接收 LINE 平台事件
- 使用 LINE 官方 SDK 進行簽名驗證
- 實作類似 Bottender 的 middleware 鏈式處理架構（洋蔥模型）
- 使用 Redis 實作事件 ID 冪等性檢查
- 結構化日誌記錄（不含訊息內容）

## Technical Context

**Language/Version**: TypeScript 5.7+ / Node.js 22+
**Primary Dependencies**: NestJS 11, @line/bot-sdk 9.7, ioredis 5.4, Fastify
**Storage**: Redis（冪等性檢查，帶 TTL）、PostgreSQL（未來擴展用，此功能不使用）
**Testing**: Vitest（單元測試與整合測試）
**Target Platform**: Linux server（Docker 容器）
**Project Type**: Monorepo（pnpm workspace）- apps/backend 為主要開發目標
**Performance Goals**: 單一事件處理 < 1 秒（符合 LINE 平台要求）
**Constraints**: 必須在 LINE 平台重試前完成回應（約 60 秒）、使用 mock 進行測試
**Scale/Scope**: 支援基本的 LINE Bot 互動，初期無高併發需求

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Status  | Evidence                                                                           |
| ------------------------------------ | ------- | ---------------------------------------------------------------------------------- |
| I. Testability-First Design          | ✅ PASS | Middleware 架構使用依賴注入，LINE SDK client 可被 mock；Redis 服務可透過 mock 替代 |
| II. Library Reuse Priority           | ✅ PASS | 使用 @line/bot-sdk 官方 SDK 進行簽名驗證和事件型別；使用 ioredis 處理 Redis 操作   |
| III. Clean Code Compliance           | ✅ PASS | 每個 middleware 為單一職責；事件處理邏輯與 HTTP 層分離                             |
| IV. No Over-Engineering              | ✅ PASS | 僅實作規格要求的功能；middleware 架構是必要的擴展性機制，非過度設計                |
| V. Database-Free Integration Testing | ✅ PASS | 使用 mock Redis；不使用 PostgreSQL；測試可在隔離環境執行                           |

**Gate Result**: ✅ PASS - 可以進入 Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/002-line-event-handler/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── webhook-api.yaml # LINE Webhook endpoint OpenAPI spec
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
apps/backend/
├── src/
│   ├── app.module.ts           # Root module (import LineModule)
│   ├── config/                  # Existing config module
│   ├── redis/                   # Existing Redis service
│   └── line/                    # NEW: LINE Bot 事件處理模組
│       ├── line.module.ts       # LINE module definition
│       ├── line.controller.ts   # Webhook endpoint controller
│       ├── line.service.ts      # LINE client and messaging service
│       ├── middleware/          # Middleware 處理架構
│       │   ├── middleware.types.ts      # Middleware 型別定義
│       │   ├── middleware.runner.ts     # Middleware 執行器（洋蔥模型）
│       │   └── logging.middleware.ts    # 內建日誌 middleware
│       ├── guards/              # NestJS Guards
│       │   └── signature.guard.ts       # LINE 簽名驗證 guard
│       ├── services/            # 輔助服務
│       │   └── idempotency.service.ts   # Redis 冪等性檢查服務
│       └── types/               # 型別定義
│           └── events.ts        # LINE 事件型別 (re-export from SDK)
└── test/
    └── line/                    # LINE 模組測試
        ├── line.controller.spec.ts
        ├── middleware.runner.spec.ts
        ├── signature.guard.spec.ts
        └── idempotency.service.spec.ts
```

**Structure Decision**: 採用 NestJS 模組化架構，在 `apps/backend/src/line/` 建立獨立的 LINE Bot 模組。使用 NestJS Guard 處理簽名驗證，middleware 架構為自定義實作以支援洋蔥模型。

## Complexity Tracking

> Constitution Check 已全部通過，無需記錄違規理由。

## Constitution Check (Post-Phase 1)

_Re-evaluated after design completion_

| Principle                            | Status  | Evidence                                                                                        |
| ------------------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| I. Testability-First Design          | ✅ PASS | 所有服務使用 DI；`IdempotencyService` 可 mock Redis；`SignatureGuard` 可 mock validateSignature |
| II. Library Reuse Priority           | ✅ PASS | 使用 @line/bot-sdk 的 `validateSignature()` 和 `webhook.Event` 型別                             |
| III. Clean Code Compliance           | ✅ PASS | Controller 專注路由；Service 處理業務邏輯；Middleware 單一職責                                  |
| IV. No Over-Engineering              | ✅ PASS | 未引入不必要的抽象層；middleware 架構有明確使用場景（擴展處理邏輯）                             |
| V. Database-Free Integration Testing | ✅ PASS | 僅使用 Redis mock；無 PostgreSQL 依賴；測試可完全隔離                                           |

**Final Gate Result**: ✅ PASS - 設計符合所有憲法原則
