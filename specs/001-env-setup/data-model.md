# Data Model: 開發環境建制

**Feature**: 001-env-setup  
**Date**: 2024-12-07  
**Status**: Draft

## Overview

此功能為基礎環境建制，主要專注於專案結構與開發工具配置。資料模型在此階段僅定義初始的 Prisma schema 結構，用於驗證資料庫連線功能。

## Initial Schema

### 基礎使用者實體 (預留)

此模型用於後續功能開發，在環境建制階段僅作為連線測試用途。

```prisma
model User {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Entity Relationships

```
N/A - 環境建制階段無複雜實體關係
```

## Validation Rules

| Entity | Field     | Rule                |
| ------ | --------- | ------------------- |
| User   | id        | CUID 格式，自動產生 |
| User   | createdAt | 自動設定為建立時間  |
| User   | updatedAt | 自動設定為更新時間  |

## State Transitions

```
N/A - 環境建制階段無狀態轉換
```

## Notes

- 此為最小化的初始 schema，僅用於驗證 Prisma 與 PostgreSQL 連線
- 實際業務實體將在後續功能開發時定義
- 遵循 Constitution 原則：避免過度設計，僅建立必要結構
