# Feature Specification: 開發環境建制

**Feature Branch**: `001-env-setup`  
**Created**: 2024-12-07  
**Status**: Draft  
**Input**: User description: "環境建制：根據技術棧建立 NestJS + React + PostgreSQL + Redis 的開發環境"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 開發者啟動完整開發環境 (Priority: P1)

身為開發者，我希望能透過一個指令啟動完整的開發環境（包含後端、前端、資料庫、快取），讓我可以立即開始開發工作。

**Why this priority**: 這是開發工作的基礎，沒有可運行的開發環境，任何功能開發都無法進行。

**Independent Test**: 可以透過執行單一指令驗證所有服務是否正常啟動並可連線。

**Acceptance Scenarios**:

1. **Given** 開發者已安裝 Docker 與 pnpm，**When** 執行環境啟動指令，**Then** 所有服務（NestJS 後端、React 前端、PostgreSQL、Redis）皆成功啟動
2. **Given** 環境已啟動，**When** 存取後端 API 健康檢查端點，**Then** 收到成功回應
3. **Given** 環境已啟動，**When** 存取前端開發伺服器，**Then** 可看到預設頁面

---

### User Story 2 - 開發者進行程式碼熱重載開發 (Priority: P1)

身為開發者，我希望修改程式碼後能自動重新載入，不需要手動重啟服務，提升開發效率。

**Why this priority**: 熱重載是現代開發的基本需求，直接影響開發效率與體驗。

**Independent Test**: 修改任一原始碼檔案後，確認變更自動反映在執行中的服務。

**Acceptance Scenarios**:

1. **Given** 後端服務正在執行，**When** 修改 TypeScript 原始碼並儲存，**Then** 服務自動重新編譯並載入變更
2. **Given** 前端開發伺服器正在執行，**When** 修改 React 元件並儲存，**Then** 瀏覽器自動反映變更（HMR）

---

### User Story 3 - 開發者管理資料庫 Schema (Priority: P2)

身為開發者，我希望能透過 Prisma 管理資料庫結構，包含建立 migration 與同步 schema。

**Why this priority**: 資料庫結構管理是功能開發的前置作業，但初期可用手動方式處理。

**Independent Test**: 建立新的 Prisma migration 並成功套用到資料庫。

**Acceptance Scenarios**:

1. **Given** Prisma schema 已定義，**When** 執行 migration 建立指令，**Then** 成功建立新的 migration 檔案
2. **Given** 存在未套用的 migration，**When** 執行 migration 套用指令，**Then** 資料庫結構成功更新

---

### User Story 4 - 開發者安裝專案相依套件 (Priority: P1)

身為開發者，我希望能快速安裝所有專案相依套件，開始進行開發工作。

**Why this priority**: 安裝相依套件是啟動開發環境的前置步驟，必須簡單且可靠。

**Independent Test**: 執行安裝指令後，所有必要套件皆安裝完成且無錯誤。

**Acceptance Scenarios**:

1. **Given** 專案已 clone 到本機，**When** 執行 pnpm install，**Then** 所有 workspace 的相依套件皆成功安裝
2. **Given** 套件已安裝，**When** 執行型別檢查，**Then** 無型別錯誤

---

### Edge Cases

- 當 Docker 未啟動時，環境啟動指令應顯示清楚的錯誤訊息
- 當 Port 已被佔用時，應提示使用者並建議解決方案
- 當 Node.js 版本不符合要求時，應顯示版本需求提示
- 當 pnpm 未安裝時，應提供安裝指引

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: 專案 MUST 使用 pnpm workspace 管理 monorepo 結構
- **FR-002**: 專案 MUST 包含 backend workspace（NestJS + Fastify + TypeScript）
- **FR-003**: 專案 MUST 包含 frontend workspace（React + Vite + TypeScript）
- **FR-004**: 專案 MUST 使用 Docker Compose 管理 PostgreSQL 與 Redis 服務
- **FR-005**: 後端 MUST 使用 Prisma 作為 ORM 並連線至 PostgreSQL
- **FR-006**: 後端 MUST 能連線至 Redis 進行快取操作
- **FR-007**: 後端 MUST 整合 @line/bot-sdk 作為 LINE Bot SDK
- **FR-008**: 前端 MUST 使用 Tailwind CSS + shadcn/ui 作為 UI 基礎
- **FR-009**: 前端 MUST 使用 Zustand + TanStack Query 管理狀態
- **FR-010**: 專案 MUST 提供開發模式啟動指令（支援熱重載）
- **FR-011**: 專案 MUST 指定 Node.js 24 LTS 為執行環境
- **FR-012**: 後端 MUST 提供健康檢查 API 端點

### Key Entities

- **Backend Workspace**: NestJS 應用程式，處理 API 請求與 LINE Bot webhook
- **Frontend Workspace**: React 應用程式，提供使用者介面
- **PostgreSQL Database**: 主要資料儲存
- **Redis Cache**: 快取與 BullMQ 任務佇列儲存

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 開發者可在 5 分鐘內完成環境設定並啟動所有服務
- **SC-002**: 後端程式碼修改後，在 3 秒內完成重新編譯並載入
- **SC-003**: 前端程式碼修改後，在 1 秒內反映在瀏覽器上
- **SC-004**: 所有服務可透過單一指令啟動或停止
- **SC-005**: 資料庫連線在服務啟動後 10 秒內建立完成
- **SC-006**: 專案文件清楚說明環境需求與啟動步驟

## Assumptions

- 開發者已安裝 Docker Desktop 或 Docker Engine
- 開發者使用的作業系統為 Linux、macOS 或 Windows（WSL2）
- 開發者有基本的終端機操作經驗
- 專案不需要在本機安裝 PostgreSQL 或 Redis（使用 Docker 容器）
- 開發階段不需要設定 HTTPS
- LINE Bot 的 channel credentials 將透過環境變數設定
