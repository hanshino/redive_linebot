# <!--

# SYNC IMPACT REPORT

Version change: N/A → 1.0.0 (Initial ratification)
Modified principles: None (initial creation)
Added sections:

- Core Principles (5 principles)
- Testing Strategy
- Development Workflow
- Governance
  Removed sections: None
  Templates requiring updates:
- `.specify/templates/plan-template.md` ✅ No updates needed (already supports Constitution Check)
- `.specify/templates/spec-template.md` ✅ No updates needed (supports testable user stories)
- `.specify/templates/tasks-template.md` ✅ No updates needed (supports test-first workflow)
  Follow-up TODOs: None
  ================================================================================
  -->

# Redive LineBot Constitution

## Core Principles

### I. Testability-First Design (NON-NEGOTIABLE)

所有新功能和重構的程式碼 MUST 設計為易於測試的架構：

- 所有業務邏輯 MUST 與外部依賴（資料庫、API、檔案系統）解耦
- MUST 使用依賴注入 (Dependency Injection) 模式，允許測試時替換為 mock 或 stub
- 禁止在業務邏輯中直接實例化外部依賴
- 每個模組 MUST 可在隔離環境中進行單元測試，無需連接真實服務

**理由**：過去測試必須串接真實環境導致測試緩慢、不穩定且難以維護。

### II. Library Reuse Priority

開發新功能時 MUST 優先評估既有解決方案：

- 新功能開發前 MUST 先搜尋專案內是否有可重用的函式或模組
- MUST 優先考慮成熟的第三方函式庫，而非自行實作
- 若需自行開發，MUST 設計為可重用的通用模組
- 禁止在不同模組中重複實作相同功能

**理由**：避免重複造輪子，減少維護成本，提升程式碼品質。

### III. Clean Code Compliance

所有程式碼 MUST 遵循 Clean Code 規範：

- 函式 MUST 保持單一職責，長度不應超過 30 行
- 變數與函式命名 MUST 清晰表達其用途
- MUST 避免過深的巢狀結構（最多 3 層）
- 程式碼 MUST 自我說明，減少註解依賴
- 若需註解，MUST 說明「為什麼」而非「做什麼」

**理由**：提升程式碼可讀性與可維護性。

### IV. No Over-Engineering (NON-NEGOTIABLE)

禁止過度抽象化與過度設計：

- 禁止為了「未來可能的需求」而增加抽象層
- 設計 MUST 遵循 YAGNI (You Aren't Gonna Need It) 原則
- 介面與抽象類別 MUST 有明確且即時的使用場景
- 程式碼易讀性 MUST 優先於設計模式的完美實踐
- 若抽象層無法在 30 秒內向新成員解釋清楚，則視為過度設計

**理由**：過度設計增加理解成本、維護成本，且降低開發效率。

### V. Database-Free Integration Testing

整合測試 MUST 避免使用生產資料庫：

- 整合測試 MUST 使用 mock 或 stub 替代資料庫連線
- 若確實需要資料庫測試，MUST 使用 SQLite 等可替換的輕量級資料庫
- 禁止整合測試依賴外部 MySQL/PostgreSQL 等生產級資料庫
- 資料庫相關測試 MUST 支援平行執行，不互相影響
- 測試資料 MUST 可快速建立與清除

**理由**：降低測試環境複雜度，提升測試執行速度與穩定性。

## Testing Strategy

### 測試金字塔

- **單元測試**：覆蓋所有業務邏輯，使用 mock 隔離外部依賴
- **整合測試**：驗證模組間互動，使用 SQLite 或記憶體資料庫
- **端對端測試**：僅限關鍵流程，數量最少

### 測試要求

- 新功能 MUST 附帶對應的測試案例
- 修復 Bug 前 MUST 先撰寫重現該 Bug 的測試
- 測試 MUST 可在本地環境獨立執行，無需 Docker 或外部服務

## Development Workflow

### 程式碼審查檢查點

每次 PR/Merge Request MUST 驗證：

1. 是否遵循 Testability-First 原則？
2. 是否優先使用既有函式庫？
3. 是否符合 Clean Code 規範？
4. 是否存在過度設計？
5. 測試是否避免使用生產資料庫？

### 重構指南

進行重構時 MUST：

- 確保現有測試通過後再開始
- 小步進行，每次變更 MUST 可獨立驗證
- 禁止在同一 PR 中混合重構與新功能

## Governance

- 本憲法優先於所有其他開發實踐
- 修訂憲法 MUST 包含：文件更新、影響評估、遷移計畫
- 所有程式碼審查 MUST 驗證符合本憲法原則
- 違反原則的程式碼 MUST 提供書面理由並獲得核准
- 複雜度增加 MUST 有明確的業務價值證明

**Version**: 1.0.0 | **Ratified**: 2025-12-07 | **Last Amended**: 2025-12-07
