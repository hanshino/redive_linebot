# Tasks: LINE Bot 事件處理基礎建設

**Input**: Design documents from `/specs/002-line-event-handler/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Includes Unit and Integration tests per Constitution Principle I (Testability-First).

**Organization**: Tasks grouped by User Story to support independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Parallelizable (different files, no dependencies)
- **[Story]**: Related User Story (US1, US2, etc.)
- Description includes exact file path

## Path Conventions

- **Web app**: `apps/backend/src/`, `apps/backend/test/`
- Based on plan.md monorepo structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure.

- [ ] T001 Add LINE Bot environment variables to config module in `apps/backend/src/config/configuration.ts`
- [ ] T002 Configure Fastify raw body support (required for signature validation) in `apps/backend/src/main.ts`
- [ ] T003 [P] Create LINE module directory structure in `apps/backend/src/line/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required before any User Story.

**⚠️ CRITICAL**: Must complete before Phase 3.

- [x] T004 Define LINE event types (re-export from SDK) in `apps/backend/src/line/types/events.ts`
- [x] T005 [P] Define Middleware types (Context, NextFunction, Middleware interface) in `apps/backend/src/line/middleware/middleware.types.ts`
- [x] T006 [P] Create empty LINE module definition in `apps/backend/src/line/line.module.ts`
- [x] T007 Import LineModule into AppModule in `apps/backend/src/app.module.ts`

**Checkpoint**: Infrastructure ready. Start User Stories.

---

## Phase 3: User Story 1 & 2 - Receive Message & Verify Signature (Priority: P1) 🎯 MVP

**Goal**: System receives Webhook, verifies signature, and processes via basic middleware.

**Independent Test**: Send request with valid signature to `/line/webhook`, expect 200 OK and event log.

### Tests
- [x] T008 [P] [US2] Create unit test for SignatureGuard in `apps/backend/test/line/signature.guard.spec.ts`
- [x] T009 [P] [US1] Create unit test for MiddlewareRunner (basic execution) in `apps/backend/test/line/middleware.runner.spec.ts`
- [x] T010 [P] [US1] Create unit/integration test for LineController (webhook endpoint) in `apps/backend/test/line/line.controller.spec.ts`

### Implementation
- [x] T011 [US1] Implement MiddlewareRunner (Onion model executor) in `apps/backend/src/line/middleware/middleware.runner.ts`
- [x] T012 [US2] Implement SignatureGuard (LINE signature validation) in `apps/backend/src/line/guards/signature.guard.ts`
- [x] T013 [P] [US1] Implement LoggingMiddleware (structured logging) in `apps/backend/src/line/middleware/logging.middleware.ts`
- [x] T014 [US1] Implement LineService (LINE client wrapper) in `apps/backend/src/line/line.service.ts`
- [x] T015 [US1] Implement LineController (Webhook endpoint POST /line/webhook) in `apps/backend/src/line/line.controller.ts`
- [x] T016 Register providers and guards in LineModule in `apps/backend/src/line/line.module.ts`

**Checkpoint**: MVP complete. Webhook active and secured.

---

## Phase 4: User Story 3 - Support Multiple Event Types (Priority: P2)

**Goal**: Identify and dispatch different LINE events (Follow, Postback, etc.).

**Independent Test**: Simulate Follow/Postback events, verify correct log type and handling.

### Tests
- [x] T017 [US3] Update LineController tests for batch event processing in `apps/backend/test/line/line.controller.spec.ts`
- [x] T018 [US3] Add unit tests for unknown event types in `apps/backend/test/line/line.service.spec.ts`

### Implementation
- [x] T019 [US3] Update LoggingMiddleware to log specific event types in `apps/backend/src/line/middleware/logging.middleware.ts`
- [x] T020 [US3] Implement batch event processing loop in LineController in `apps/backend/src/line/line.controller.ts`
- [x] T021 [US3] Add event type dispatch logic and graceful fallback in `apps/backend/src/line/line.service.ts`

**Checkpoint**: 5+ event types supported.

---

## Phase 5: User Story 4 - Middleware Chain Mechanism (Priority: P2)

**Goal**: Enable multiple middlewares with flow control (next/interrupt).

**Independent Test**: Register A->B->C middlewares, verify execution order and interruption logic.

### Tests
- [x] T022 [US4] Update MiddlewareRunner tests for interruption and error handling in `apps/backend/test/line/middleware.runner.spec.ts`

### Implementation
- [x] T023 [US4] Enhance MiddlewareRunner to support interruption/exceptions in `apps/backend/src/line/middleware/middleware.runner.ts`
- [x] T024 [US4] Implement dynamic middleware registration (DI token) in `apps/backend/src/line/line.module.ts`
- [x] T025 [P] [US4] Create example EchoMiddleware in `apps/backend/src/line/middleware/echo.middleware.ts`
- [x] T026 [US4] Update quickstart.md with custom middleware guide in `specs/002-line-event-handler/quickstart.md`

**Checkpoint**: Extensible middleware architecture active.

---

## Phase 6: Idempotency Check (Cross-Cutting)

**Purpose**: Prevent duplicate event processing using Redis.

### Tests
- [x] T027 [P] Create unit test for IdempotencyService (mock Redis) in `apps/backend/test/line/idempotency.service.spec.ts`

### Implementation
- [x] T028 Implement IdempotencyService (Redis SETNX + TTL) in `apps/backend/src/line/services/idempotency.service.ts`
- [x] T029 Integrate IdempotencyService into LineController in `apps/backend/src/line/line.controller.ts`
- [x] T030 Register IdempotencyService in LineModule in `apps/backend/src/line/line.module.ts`

**Checkpoint**: Duplicate events filtered.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Refinement and multi-story improvements.

- [x] T031 [P] Create barrel export for LINE module in `apps/backend/src/line/index.ts`
- [x] T032 Optimize error handling for partial batch failures in `apps/backend/src/line/line.controller.ts`
- [x] T033 Verify all quickstart examples in `specs/002-line-event-handler/quickstart.md`
- [x] T034 [P] Implement Rate Limiting middleware (basic traffic control) in `apps/backend/src/line/middleware/rate-limit.middleware.ts`

---

## Dependencies & Execution Order

### Phase Dependencies
1. **Setup** (P1) -> **Foundational** (P2) -> **MVP** (P3)
2. **MVP** (P3) unblocks **US3** (P4) and **US4** (P5) and **Idempotency** (P6)
3. **US3**, **US4**, **Idempotency** can run in parallel after MVP.

### Implementation Strategy
1. **MVP First**: Complete Phases 1-3 to get a working, secured Webhook.
2. **Iterate**: Add Event Types (US3) -> Middleware Chain (US4) -> Idempotency.
3. **Verify**: Run tests after each phase.

### Parallel Opportunities
- Tests (T008, T009, T010) can be written alongside implementation.
- US3, US4, and Idempotency phases are largely independent after MVP.
- T003, T005, T006, T031 are independent file creations.