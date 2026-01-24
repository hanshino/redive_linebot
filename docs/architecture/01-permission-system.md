# 權限系統設計

## 概述

本文檔定義了 Redive LineBot v2 的權限系統架構，包含權限層級、識別方式、檢查機制等核心設計。

**設計目標**：
- 支援「同一用戶在不同群組擁有不同角色」
- 清晰的權限層級劃分
- 易於擴展和維護
- 適合 LINE Bot 事件驅動架構

**最後更新**：2025-01-25

---

## 權限層級

採用 **五級權限制度**，由低到高：

### Level 1: 普通用戶 (USER)
- **適用範圍**：所有 LINE 用戶（預設）
- **權限**：
  - ✅ 使用基本功能（抽卡、查詢、小遊戲）
  - ✅ 使用自己創建的自訂指令
  - ❌ 不能修改任何設定

### Level 2: 群組管理員 (GROUP_ADMIN)
- **適用範圍**：特定群組內
- **權限**：
  - ✅ 繼承 Level 1 所有權限
  - ✅ 修改**該群組**的設定（功能開關、歡迎訊息、指令前綴等）
  - ✅ 管理**該群組**的自訂指令
  - ✅ 查看**該群組**的統計數據
  - ❌ 不能跨群組操作
  - ❌ 不能指定/移除其他管理員

### Level 3: 群組擁有者 (GROUP_OWNER)
- **適用範圍**：特定群組內
- **權限**：
  - ✅ 繼承 Level 2 所有權限
  - ✅ 指定/移除該群組的 Group Admin
  - ✅ 刪除該群組的所有數據（危險操作）
  - ✅ 轉移 Owner 權限給其他人
  - ❌ 不能跨群組操作

### Level 4: Bot 管理員 (BOT_ADMIN)
- **適用範圍**：全域（所有群組）
- **權限**：
  - ✅ 繼承 Level 3 所有權限（**對所有群組**）
  - ✅ 查看全域統計數據
  - ✅ 管理全域公告
  - ✅ 修改遊戲配置（機率、數值平衡）
  - ✅ 手動發放獎勵/補償
  - ❌ 不能修改系統核心設定（資料庫、API Key）
  - ❌ 不能新增/移除 Bot Admin

### Level 5: 超級管理員 (SUPER_ADMIN)
- **適用範圍**：全域（系統級）
- **權限**：
  - ✅ 繼承 Level 4 所有權限
  - ✅ 新增/移除 Bot Admin
  - ✅ 修改系統核心設定
  - ✅ 執行資料庫遷移/維護操作
  - ✅ 查看敏感日誌
  - ✅ 所有最高權限操作

---

## 權限識別方式

### 群組擁有者 (GROUP_OWNER) 的識別

採用 **手動指定** 方式：

**初始化流程**：
1. 新群組加入時，**第一個執行初始化指令的人**（例如 `#初始化`）自動成為 Owner
2. 如果群組未初始化，任何需要管理員權限的操作都會提示「請先初始化群組」
3. Owner 可以轉移權限給其他人

**設計理由**：
- LINE API 無法可靠取得群組創建者資訊
- 手動指定更靈活，支援權限轉移
- 明確的初始化步驟，避免混淆

### 全域權限 (BOT_ADMIN / SUPER_ADMIN) 的指定

- 由 **Super Admin** 手動指定
- 通常在系統啟動時，透過配置檔或資料庫直接設定初始 Super Admin
- Bot Admin 由 Super Admin 透過指令或管理後台新增

---

## 權限檢查機制

### 檢查粒度

採用 **功能級別（粗粒度）** 權限檢查：

**範例**：
```typescript
// ✅ 功能級別：檢查「是否可以管理群組設定」
@RequirePermission(Permission.MANAGE_GROUP_CONFIG)
async updateConfig() { ... }
```

**不採用**：
```typescript
// ❌ 操作級別（過於細緻）
@RequirePermission(Permission.READ_GROUP_CONFIG)
@RequirePermission(Permission.WRITE_GROUP_CONFIG)
```

**設計理由**：
- 簡化權限管理
- 大部分功能不需要細分「讀/寫」權限
- 易於理解和維護

### 權限檢查流程

```
用戶發送 LINE 事件
    ↓
PermissionMiddleware 攔截
    ↓
查詢 user_permissions 表
    ├─ 有記錄 → 返回角色
    └─ 無記錄 → 預設 USER
    ↓
將權限資訊注入 ctx.permission
    ↓
業務邏輯檢查 ctx.permission.role
    ├─ 權限足夠 → 執行操作
    └─ 權限不足 → 返回錯誤訊息
```

---

## 權限繼承規則

### 全域權限優先於群組權限

```
同一個用戶：
- 在 groupId=null 有 BOT_ADMIN
- 在 groupId=C123 有 USER

→ 在群組 C123 中，該用戶的實際權限是 BOT_ADMIN
```

**查詢順序**：
1. 先檢查全域權限（`groupId = null`）
2. 如果沒有全域權限，再檢查群組權限
3. 如果都沒有，預設為 `USER`

### 權限比較

```
權限層級（數值越大權限越高）：
USER = 1
GROUP_ADMIN = 2
GROUP_OWNER = 3
BOT_ADMIN = 4
SUPER_ADMIN = 5
```

**檢查邏輯**：
```typescript
if (userRole >= requiredRole) {
  // 允許操作
}
```

---

## 權限管理操作

### 指定群組管理員

**執行者**：GROUP_OWNER / BOT_ADMIN / SUPER_ADMIN

**指令範例**：
```
#設定管理員 @使用者
```

**系統操作**：
```sql
INSERT INTO user_permissions (user_id, group_id, role)
VALUES ('U123', 'C456', 'GROUP_ADMIN')
ON CONFLICT (user_id, group_id) DO UPDATE SET role = 'GROUP_ADMIN';
```

### 移除管理員

**執行者**：GROUP_OWNER / BOT_ADMIN / SUPER_ADMIN

**指令範例**：
```
#移除管理員 @使用者
```

**系統操作**：
```sql
DELETE FROM user_permissions 
WHERE user_id = 'U123' AND group_id = 'C456';
```

### 轉移擁有者

**執行者**：GROUP_OWNER（僅限當前 Owner）

**指令範例**：
```
#轉移擁有者 @使用者
```

**系統操作**：
1. 將原 Owner 降級為 GROUP_ADMIN
2. 將新用戶提升為 GROUP_OWNER

### 指定 Bot 管理員

**執行者**：SUPER_ADMIN

**指令範例**：
```
#系統 設定Bot管理員 @使用者
```

**系統操作**：
```sql
INSERT INTO user_permissions (user_id, group_id, role)
VALUES ('U123', NULL, 'BOT_ADMIN');
```

---

## 特殊情境處理

### 情境 1：Owner 離開群組

**問題**：Owner 退出群組後，群組失去最高權限管理者

**解決方案**：
- 系統自動將「最早的 GROUP_ADMIN」提升為 GROUP_OWNER
- 如果沒有 Admin，群組進入「無主狀態」，任何人執行初始化指令可成為新 Owner

### 情境 2：私聊場景

**問題**：私聊沒有 `groupId`，如何處理權限？

**解決方案**：
- 私聊場景下，只檢查全域權限（BOT_ADMIN / SUPER_ADMIN）
- 普通用戶在私聊中只能使用基本功能
- 不支援在私聊中設定群組權限

### 情境 3：用戶在多個群組

**範例**：
- 用戶 U123 在群組 C1 是 GROUP_ADMIN
- 用戶 U123 在群組 C2 是 USER
- 用戶 U123 在群組 C3 是 GROUP_OWNER

**資料庫記錄**：
```
user_permissions:
  (U123, C1, GROUP_ADMIN)
  (U123, C3, GROUP_OWNER)
  # C2 沒有記錄，預設為 USER
```

**行為**：
- 在 C1 中，U123 可以修改群組設定
- 在 C2 中，U123 只能使用基本功能
- 在 C3 中，U123 可以指定/移除管理員

---

## 安全考量

### 防止權限提升攻擊

- ✅ 只有 Owner 可以指定 Admin
- ✅ 只有 Super Admin 可以指定 Bot Admin
- ✅ 不允許自己提升自己的權限
- ✅ 敏感操作需要二次確認（例如：刪除群組數據）

### 審計日誌

所有權限變更操作應記錄：
- 誰（執行者）
- 對誰（目標用戶）
- 做了什麼（新增/移除/修改權限）
- 在哪裡（群組 ID）
- 何時（時間戳）

**建議**：新增 `permission_audit_log` 表記錄這些操作

---

## 未來擴展

### 可能的擴展方向

1. **角色制（RBAC）**：如果未來權限需求變複雜，可以引入角色系統
2. **臨時權限**：例如「臨時管理員」（有時限）
3. **權限委派**：允許 Admin 委派部分權限給其他人
4. **細粒度權限**：如果某些功能需要更細緻的控制，可以引入 Permission Flags

### 向後兼容

- 當前設計已預留擴展空間（使用 Enum 而非硬編碼數字）
- 新增權限層級不會影響現有邏輯
- 資料表結構支援未來新增欄位

---

## 相關文檔

- [群組設定系統設計](./02-group-config-system.md)
- [資料模型設計](./03-data-models.md)
- [NestJS 實作指南](./04-implementation-guide.md)

---

## 變更歷史

| 日期 | 版本 | 變更內容 | 作者 |
|------|------|---------|------|
| 2025-01-25 | 1.0 | 初始版本 | Sisyphus |
