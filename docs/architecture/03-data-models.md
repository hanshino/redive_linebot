# 資料模型設計

## 概述

本文檔定義了權限系統和群組設定系統的資料模型，包含 Prisma Schema、資料表結構、索引策略等。

**設計原則**：
- 權限資料使用關聯式結構（查詢效率）
- 群組設定使用 JSONB（彈性擴展）
- 合理的索引設計（效能優化）
- 預留擴展空間

**最後更新**：2025-01-25

---

## Prisma Schema

### 完整 Schema

```prisma
// ============================================
// 權限系統
// ============================================

/// 用戶權限表
model UserPermission {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  groupId   String?  @map("group_id")  // null = 全域權限
  role      Role
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([userId, groupId])
  @@index([userId])
  @@index([groupId])
  @@map("user_permissions")
}

/// 權限角色枚舉
enum Role {
  USER              // 一般用戶（通常不寫入 DB）
  GROUP_ADMIN       // 群組管理員
  GROUP_OWNER       // 群組擁有者
  BOT_ADMIN         // Bot 管理員（跨所有群組）
  SUPER_ADMIN       // 超級管理員
}

// ============================================
// 群組設定系統
// ============================================

/// 群組設定表
model GroupConfig {
  groupId   String   @id @map("group_id")
  config    Json     // 所有設定存這裡（JSONB）
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("group_configs")
}
```

---

## 資料表結構詳解

### 1. `user_permissions` 表

**用途**：儲存用戶在各群組/全域的權限角色

#### 欄位說明

| 欄位 | 型別 | 說明 | 約束 |
|------|------|------|------|
| `id` | VARCHAR | 主鍵（CUID） | PRIMARY KEY |
| `user_id` | VARCHAR | LINE User ID | NOT NULL |
| `group_id` | VARCHAR | LINE Group ID（null = 全域） | NULLABLE |
| `role` | ENUM | 權限角色 | NOT NULL |
| `created_at` | TIMESTAMP | 建立時間 | NOT NULL, DEFAULT NOW() |
| `updated_at` | TIMESTAMP | 更新時間 | NOT NULL, AUTO UPDATE |

#### 約束條件

```sql
-- 唯一約束：一個用戶在一個群組只能有一個角色
UNIQUE (user_id, group_id)

-- 索引：快速查詢用戶的所有權限
INDEX idx_user_permissions_user_id (user_id)

-- 索引：快速查詢群組的所有管理員
INDEX idx_user_permissions_group_id (group_id)
```

#### 資料範例

```sql
-- 用戶 U123 在群組 C456 是管理員
INSERT INTO user_permissions (id, user_id, group_id, role, created_at, updated_at)
VALUES ('cuid1', 'U123', 'C456', 'GROUP_ADMIN', NOW(), NOW());

-- 用戶 U789 是全域 Bot 管理員
INSERT INTO user_permissions (id, user_id, group_id, role, created_at, updated_at)
VALUES ('cuid2', 'U789', NULL, 'BOT_ADMIN', NOW(), NOW());
```

#### 查詢範例

```sql
-- 查詢：用戶在特定群組的角色
SELECT role FROM user_permissions
WHERE user_id = 'U123' AND group_id = 'C456';

-- 查詢：用戶的全域權限
SELECT role FROM user_permissions
WHERE user_id = 'U123' AND group_id IS NULL;

-- 查詢：用戶是哪些群組的管理員
SELECT group_id, role FROM user_permissions
WHERE user_id = 'U123' 
  AND group_id IS NOT NULL
  AND role IN ('GROUP_ADMIN', 'GROUP_OWNER');

-- 查詢：群組的所有管理員
SELECT user_id, role FROM user_permissions
WHERE group_id = 'C456'
  AND role IN ('GROUP_ADMIN', 'GROUP_OWNER');
```

---

### 2. `group_configs` 表

**用途**：儲存群組的所有設定（功能開關、自訂設定）

#### 欄位說明

| 欄位 | 型別 | 說明 | 約束 |
|------|------|------|------|
| `group_id` | VARCHAR | LINE Group ID | PRIMARY KEY |
| `config` | JSONB | 所有設定（JSON 格式） | NOT NULL |
| `created_at` | TIMESTAMP | 建立時間 | NOT NULL, DEFAULT NOW() |
| `updated_at` | TIMESTAMP | 更新時間 | NOT NULL, AUTO UPDATE |

#### Config JSON 結構

```typescript
interface GroupConfigData {
  // 功能開關
  features: {
    welcomeMessage: boolean;      // 歡迎訊息
    gacha: boolean;               // 抽卡系統
    character: boolean;           // 角色查詢
    announce: boolean;            // 公告系統
    customCommands: boolean;      // 自訂指令
    worldBoss: boolean;           // 世界王
    clanBattle: boolean;          // 公會戰
    minigames: boolean;           // 小遊戲（全包）
    chatLevel: boolean;           // 聊天等級
    market: boolean;              // 市場交易
    discordWebhook: boolean;      // Discord Webhook
  };
  
  // 自訂設定
  welcomeMessage?: string;        // 歡迎訊息內容
  commandPrefix: string;          // 指令前綴（預設 "#"）
  groupNickname?: string;         // 群組暱稱
  
  // 冷卻時間覆寫（秒）
  cooldowns?: {
    gacha?: number;      // 抽卡冷卻（最小 30）
    query?: number;      // 查詢冷卻（最小 10）
    minigame?: number;   // 小遊戲冷卻（最小 30）
    customCmd?: number;  // 自訂指令冷卻（最小 5）
  };
}
```

#### 預設設定（新群組）

```json
{
  "features": {
    "welcomeMessage": true,
    "gacha": true,
    "character": true,
    "announce": true,
    "customCommands": true,
    "worldBoss": false,
    "clanBattle": false,
    "minigames": false,
    "chatLevel": false,
    "market": false,
    "discordWebhook": false
  },
  "commandPrefix": "#",
  "cooldowns": {}
}
```

#### 資料範例

```sql
INSERT INTO group_configs (group_id, config, created_at, updated_at)
VALUES (
  'C123456789',
  '{
    "features": {
      "welcomeMessage": true,
      "gacha": true,
      "character": true,
      "announce": true,
      "customCommands": true,
      "worldBoss": false,
      "clanBattle": false,
      "minigames": false,
      "chatLevel": false,
      "market": false,
      "discordWebhook": false
    },
    "welcomeMessage": "歡迎 {username} 加入 {groupname}！",
    "commandPrefix": "#",
    "groupNickname": "公主連結交流群",
    "cooldowns": {
      "gacha": 180
    }
  }'::jsonb,
  NOW(),
  NOW()
);
```

#### 查詢範例

```sql
-- 查詢：取得群組完整設定
SELECT config FROM group_configs
WHERE group_id = 'C123';

-- 查詢：檢查特定功能是否開啟（PostgreSQL JSONB 查詢）
SELECT config->'features'->>'gacha' AS gacha_enabled
FROM group_configs
WHERE group_id = 'C123';

-- 查詢：取得所有開啟世界王的群組
SELECT group_id FROM group_configs
WHERE config->'features'->>'worldBoss' = 'true';

-- 查詢：取得指令前綴
SELECT config->>'commandPrefix' AS prefix
FROM group_configs
WHERE group_id = 'C123';
```

---

## 索引策略

### 權限表索引

```sql
-- 主鍵索引（自動）
CREATE UNIQUE INDEX user_permissions_pkey ON user_permissions (id);

-- 唯一約束索引（自動）
CREATE UNIQUE INDEX user_permissions_user_id_group_id_key 
ON user_permissions (user_id, group_id);

-- 查詢優化索引
CREATE INDEX idx_user_permissions_user_id ON user_permissions (user_id);
CREATE INDEX idx_user_permissions_group_id ON user_permissions (group_id);
```

**索引效益**：
- 查詢「用戶在特定群組的權限」：O(1)
- 查詢「用戶的所有權限」：O(N)，N = 該用戶的權限數量
- 查詢「群組的所有管理員」：O(M)，M = 該群組的管理員數量

### 群組設定表索引

```sql
-- 主鍵索引（自動）
CREATE UNIQUE INDEX group_configs_pkey ON group_configs (group_id);
```

**JSONB 特殊索引（可選）**：

如果需要頻繁查詢「哪些群組開啟了某功能」，可以建立 GIN 索引：

```sql
-- GIN 索引：加速 JSONB 查詢
CREATE INDEX idx_group_configs_config_gin ON group_configs USING GIN (config);
```

**效益**：
- 查詢「所有開啟世界王的群組」效能提升
- 缺點：寫入效能稍降、佔用空間增加

**建議**：初期不建立，等有效能需求時再加

---

## 資料一致性

### 外鍵約束

**不使用外鍵約束**，原因：
- LINE User ID / Group ID 來自外部系統（LINE）
- 不需要在資料庫層級保證外鍵存在
- 避免刪除操作的複雜性

### 應用層保證

```typescript
// 刪除群組設定時，同時刪除相關權限
async deleteGroup(groupId: string) {
  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { groupId } }),
    prisma.groupConfig.delete({ where: { groupId } })
  ]);
}
```

---

## 資料遷移

### 從舊版本遷移

#### 步驟 1：建立新表

```sql
-- 執行 Prisma migration
npx prisma migrate dev --name init_permission_and_config
```

#### 步驟 2：遷移舊資料

**假設舊表結構**：
```sql
-- 舊的權限表
old_admin_table (user_id, group_id, level)

-- 舊的群組設定表
old_group_settings (group_id, gacha_enabled, welcome_text, ...)
```

**遷移腳本範例**：
```typescript
async function migratePermissions() {
  const oldAdmins = await db.query('SELECT * FROM old_admin_table');
  
  for (const admin of oldAdmins) {
    const role = mapOldLevelToNewRole(admin.level);
    
    await prisma.userPermission.upsert({
      where: { 
        userId_groupId: { 
          userId: admin.user_id, 
          groupId: admin.group_id 
        } 
      },
      update: { role },
      create: {
        userId: admin.user_id,
        groupId: admin.group_id,
        role
      }
    });
  }
}

async function migrateGroupConfigs() {
  const oldConfigs = await db.query('SELECT * FROM old_group_settings');
  
  for (const old of oldConfigs) {
    const newConfig = {
      features: {
        gacha: old.gacha_enabled === 'Y',
        welcomeMessage: !!old.welcome_text,
        // ... 其他功能
      },
      welcomeMessage: old.welcome_text,
      commandPrefix: old.command_prefix || '#',
      cooldowns: {}
    };
    
    await prisma.groupConfig.upsert({
      where: { groupId: old.group_id },
      update: { config: newConfig },
      create: {
        groupId: old.group_id,
        config: newConfig
      }
    });
  }
}
```

---

## 效能考量

### 讀取效能

| 操作 | 預估時間 | 說明 |
|------|---------|------|
| 查詢單一用戶權限 | < 1ms | 有索引，O(1) |
| 查詢群組設定 | < 1ms | 主鍵查詢 |
| 查詢群組所有管理員 | < 5ms | 有索引，取決於管理員數量 |
| JSONB 條件查詢 | 10-50ms | 無 GIN 索引時較慢 |

### 寫入效能

| 操作 | 預估時間 | 說明 |
|------|---------|------|
| 新增/更新權限 | < 2ms | 單筆寫入 |
| 更新群組設定 | < 2ms | JSONB 整個覆寫 |
| 批次權限變更 | < 10ms | Transaction |

### 快取策略

**建議快取**：
- 用戶權限（Redis TTL: 5 分鐘）
- 群組設定（Redis TTL: 10 分鐘）

**快取更新**：
- 寫入時主動清除快取（Write-Through）
- 或使用 Redis Pub/Sub 通知其他節點

**範例**：
```typescript
async getUserRole(userId: string, groupId: string): Promise<Role> {
  const cacheKey = `permission:${userId}:${groupId}`;
  
  // 1. 嘗試從快取讀取
  const cached = await redis.get(cacheKey);
  if (cached) return cached as Role;
  
  // 2. 從資料庫讀取
  const permission = await prisma.userPermission.findUnique({
    where: { userId_groupId: { userId, groupId } }
  });
  
  const role = permission?.role ?? Role.USER;
  
  // 3. 寫入快取
  await redis.set(cacheKey, role, 'EX', 300);
  
  return role;
}
```

---

## 備份與恢復

### 定期備份

```bash
# PostgreSQL 備份
pg_dump -U postgres -d redive_linebot \
  -t user_permissions \
  -t group_configs \
  > backup_$(date +%Y%m%d).sql
```

### 災難恢復

```bash
# 恢復資料
psql -U postgres -d redive_linebot < backup_20250125.sql
```

### 資料匯出（JSON）

```typescript
// 匯出所有群組設定
async function exportGroupConfigs() {
  const configs = await prisma.groupConfig.findMany();
  
  fs.writeFileSync(
    'group_configs_export.json',
    JSON.stringify(configs, null, 2)
  );
}
```

---

## 資料清理

### 清理策略

**孤立權限記錄**：
- 群組已不存在，但權限記錄還在
- 建議：定期清理（例如：每月一次）

```sql
-- 查詢孤立記錄（假設有 active_groups 表）
SELECT up.* FROM user_permissions up
WHERE up.group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM group_configs gc 
    WHERE gc.group_id = up.group_id
  );
```

**過期設定**：
- 群組長期不活躍（例如：6 個月無訊息）
- 建議：歸檔或刪除

---

## 未來擴展

### 可能新增的表

1. **權限審計表** (`permission_audit_log`)
   - 記錄所有權限變更
   - 欄位：`id`, `group_id`, `user_id`, `changed_by`, `old_role`, `new_role`, `changed_at`

2. **群組設定歷史表** (`group_config_history`)
   - 記錄設定變更歷史
   - 欄位：`id`, `group_id`, `changed_by`, `config_snapshot`, `changed_at`

3. **功能使用統計表** (`feature_usage_stats`)
   - 記錄各功能使用頻率
   - 欄位：`group_id`, `feature_name`, `usage_count`, `last_used_at`

### Schema 版本控制

**使用 Prisma Migrate**：
```bash
# 建立新 migration
npx prisma migrate dev --name add_audit_table

# 套用到生產環境
npx prisma migrate deploy
```

---

## 相關文檔

- [權限系統設計](./01-permission-system.md)
- [群組設定系統設計](./02-group-config-system.md)
- [NestJS 實作指南](./04-implementation-guide.md)

---

## 變更歷史

| 日期 | 版本 | 變更內容 | 作者 |
|------|------|---------|------|
| 2025-01-25 | 1.0 | 初始版本 | Sisyphus |
