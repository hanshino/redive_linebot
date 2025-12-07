# Feature Specification: LINE Bot 事件處理基礎建設

**Feature Branch**: `002-line-event-handler`  
**Created**: 2024-12-07  
**Status**: Draft  
**Input**: User description: "後端 LINE 事件處理基礎建設：設計 middleware 架構處理 LINE Bot 各種事件"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 接收並處理 LINE 文字訊息事件 (Priority: P1)

當使用者在 LINE 聊天室中發送文字訊息給機器人時，系統應該能夠接收這個事件，經過 middleware 處理流程，最終產生適當的回應。

**Why this priority**: 文字訊息是最基本且最常見的互動方式，這是 LINE Bot 最核心的功能，沒有這個功能其他所有功能都無法運作。

**Independent Test**: 可透過發送一則文字訊息給機器人，確認系統能接收事件、處理事件、並回傳確認訊息。

**Acceptance Scenarios**:

1. **Given** 系統正在運行且 LINE Webhook 已設定完成，**When** 使用者發送文字訊息 "Hello"，**Then** 系統成功接收事件並記錄事件資訊
2. **Given** 系統收到文字訊息事件，**When** 事件經過 middleware 處理鏈，**Then** 每個 middleware 可以選擇處理、跳過、或中斷處理流程
3. **Given** 事件處理過程中發生錯誤，**When** 錯誤被捕獲，**Then** 系統記錄錯誤資訊並返回適當的回應給 LINE 平台

---

### User Story 2 - 驗證 LINE 請求簽名 (Priority: P1)

當 LINE 平台發送 Webhook 請求到我們的伺服器時，系統必須驗證請求的真實性，確保請求確實來自 LINE 官方平台，防止偽造請求。

**Why this priority**: 安全性是基礎建設的核心要求，不驗證簽名可能導致系統被惡意利用。

**Independent Test**: 可透過發送帶有正確簽名和錯誤簽名的請求，確認系統能正確區分合法與非法請求。

**Acceptance Scenarios**:

1. **Given** 收到來自 LINE 平台的 Webhook 請求，**When** 請求包含有效的 X-Line-Signature header，**Then** 系統接受並處理該請求
2. **Given** 收到 Webhook 請求，**When** 請求的簽名無效或缺失，**Then** 系統拒絕該請求並返回適當的錯誤狀態

---

### User Story 3 - 支援多種 LINE 事件類型 (Priority: P2)

除了文字訊息外，LINE 平台會發送多種不同類型的事件，包括：貼圖、圖片、加入好友、封鎖、Postback 等。系統需要能夠識別並分派不同類型的事件。

**Why this priority**: 支援多種事件類型是建立完整 LINE Bot 體驗的必要條件，但可以在核心 middleware 架構建立後逐步擴展。

**Independent Test**: 可透過模擬不同類型的事件（如 Follow、Unfollow、Postback），確認系統能正確識別並分派處理。

**Acceptance Scenarios**:

1. **Given** 使用者加入機器人好友，**When** 系統收到 Follow 事件，**Then** 事件被正確識別並可由對應的處理器處理
2. **Given** 使用者點擊按鈕觸發 Postback，**When** 系統收到 Postback 事件，**Then** 事件攜帶的 data 可被正確解析並處理
3. **Given** 系統收到未知或不支援的事件類型，**When** 處理該事件時，**Then** 系統記錄該事件並優雅地忽略（不中斷服務）

---

### User Story 4 - Middleware 鏈式處理機制 (Priority: P2)

開發者需要能夠註冊多個 middleware，每個 middleware 可以決定是否繼續將事件傳遞給下一個 middleware，類似於 Express.js 或 Bottender 的 middleware 模式。

**Why this priority**: 這個機制提供了擴展性和靈活性，讓未來可以輕鬆添加新功能（如日誌記錄、權限檢查、狀態管理等）。

**Independent Test**: 可透過註冊多個測試用 middleware，發送事件並確認事件按順序經過每個 middleware。

**Acceptance Scenarios**:

1. **Given** 註冊了 A、B、C 三個 middleware，**When** 事件進入處理流程，**Then** 事件依序經過 A → B → C
2. **Given** Middleware B 決定中斷處理流程，**When** 事件經過 B 時，**Then** 事件不會傳遞給 C
3. **Given** 某個 middleware 需要在後續 middleware 處理完後執行清理工作，**When** 使用 "洋蔥模型" 處理，**Then** 可在 next() 之後執行後置邏輯

---

### Edge Cases

- 當 LINE 平台在短時間內發送大量事件時，系統如何處理？（應具備基本的流量控制）
- 當 middleware 處理時間過長導致 LINE 平台重發請求時，系統透過事件 ID 冪等性檢查過濾重複事件
- 當某個 middleware 拋出未捕獲的異常時，系統中斷該事件的處理鏈並記錄錯誤，但繼續處理其他事件
- 當 LINE Channel Secret 配置錯誤時，系統如何提供清楚的錯誤訊息？

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: 系統必須提供 HTTP 端點接收 LINE Webhook 請求
- **FR-002**: 系統必須驗證所有 LINE Webhook 請求的簽名（X-Line-Signature），優先使用 LINE 官方 SDK 提供的驗證機制
- **FR-003**: 系統必須能夠解析 LINE 事件的 JSON 格式內容
- **FR-004**: 系統必須支援 middleware 鏈式處理架構，允許註冊多個 middleware
- **FR-005**: 每個 middleware 必須能夠選擇繼續傳遞事件、中斷處理流程、或修改事件內容
- **FR-006**: 系統必須能夠識別並分類不同的 LINE 事件類型（Message、Follow、Unfollow、Postback 等）
- **FR-007**: 系統必須在事件處理完成後返回 200 狀態碼給 LINE 平台（符合 LINE 要求）
- **FR-008**: 系統必須在驗證失敗時返回適當的 HTTP 錯誤狀態碼
- **FR-009**: 系統必須以結構化方式記錄所有收到的事件（包含事件 ID、類型、來源、處理狀態），但不記錄訊息內容以保護使用者隱私
- **FR-010**: 系統必須能夠優雅地處理未知或不支援的事件類型（記錄但不中斷服務）
- **FR-011**: 系統必須支援同時處理批次事件（LINE 可能在單一請求中發送多個事件）
- **FR-012**: 系統必須提供錯誤處理機制：當某個 middleware 拋出異常時，中斷該事件的 middleware 鏈，但繼續處理批次中的其他事件
- **FR-013**: 系統必須實作基本的冪等性檢查，使用 Redis 儲存已處理的事件 ID（帶 TTL 自動過期），避免同一事件被重複處理

### Key Entities

- **LineEvent**: 代表一個 LINE 平台事件，包含事件類型、來源（使用者/群組/聊天室）、時間戳記、事件內容
- **EventSource**: 事件來源，可能是 User（單一使用者）、Group（群組）、或 Room（聊天室）
- **Middleware**: 處理單元，接收事件並決定如何處理，可以傳遞給下一個 middleware 或中斷流程
- **MiddlewareContext**: 事件處理的上下文，攜帶事件資訊及可在 middleware 間共享的狀態

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 系統能在 1 秒內完成單一事件的接收和回應（符合 LINE 平台要求）
- **SC-002**: 系統能正確拒絕 100% 的無效簽名請求
- **SC-003**: 系統能正確識別並處理至少 5 種主要 LINE 事件類型（Message、Follow、Unfollow、Postback、MemberJoined）
- **SC-004**: 開發者能在 10 分鐘內新增一個自定義 middleware
- **SC-005**: 系統在處理過程中發生錯誤時，不會導致服務中斷，錯誤復原率達 100%
- **SC-006**: 所有事件處理都有完整的日誌記錄，便於問題追蹤

## Assumptions

- LINE Channel Secret 會透過環境變數或配置管理系統提供
- 使用 NestJS 框架進行開發（符合現有專案架構）
- LINE Messaging API 的行為符合官方文件描述
- 系統需要部署在可接收外部 HTTPS 請求的環境
- 初期不考慮事件的持久化儲存，僅記錄日誌

## Clarifications

### Session 2024-12-07

- Q: 簽名驗證實作策略 → A: 優先使用 LINE 官方 SDK 的簽名驗證機制（如有提供）
- Q: 重複事件處理策略 → A: 實作基本的冪等性檢查（基於事件 ID 過濾重複請求）
- Q: 日誌記錄詳細程度 → A: 結構化日誌（記錄事件 ID、類型、來源、處理狀態，但不記錄訊息內容）
- Q: Middleware 錯誤處理行為 → A: 中斷該事件的 middleware 鏈，但繼續處理批次中的其他事件
- Q: 事件 ID 冪等性檢查的儲存機制 → A: 使用 Redis（帶 TTL 自動過期）
