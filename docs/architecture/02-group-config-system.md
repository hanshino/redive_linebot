# 群組設定系統設計

## 概述

本文檔定義了 Redive LineBot v2 的群組設定系統，包含功能開關、自訂設定項目、冷卻時間管理等。

**設計目標**：
- 每個群組可以獨立控制功能開關
- 彈性的自訂設定（歡迎訊息、指令前綴等）
- 防洗版機制（功能冷卻時間）
- 易於擴展新設定項目

**最後更新**：2025-01-25

---

## 功能開關

### 預設狀態策略

**新群組加入時的預設行為**：
- ✅ **基本功能**：預設開啟
- ❌ **進階功能**：預設關閉

**設計理由**：
- 基本功能是大部分用戶需要的，預設開啟降低使用門檻
- 進階功能可能干擾群組，由管理員主動開啟

### 基本功能（預設開啟）

| 功能 | 說明 | 預設狀態 |
|------|------|---------|
| **welcome_message** | 新成員歡迎訊息 | ✅ ON |
| **gacha** | 抽卡系統 | ✅ ON |
| **character** | 角色查詢 | ✅ ON |
| **announce** | 公告系統 | ✅ ON |
| **custom_commands** | 自訂指令 | ✅ ON |

### 進階功能（預設關閉）

| 功能 | 說明 | 預設狀態 | 開啟理由 |
|------|------|---------|---------|
| **world_boss** | 世界王系統 | ❌ OFF | 需要活躍玩家群體 |
| **clan_battle** | 公會戰 | ❌ OFF | 需要組織化管理 |
| **minigames** | 小遊戲（猜拳/彩票/賭博/刮刮樂） | ❌ OFF | 可能干擾群組 |
| **chat_level** | 聊天等級追蹤 | ❌ OFF | 隱私考量 |
| **market** | 市場交易 | ❌ OFF | 複雜功能，需主動啟用 |
| **discord_webhook** | Discord Webhook 整合 | ❌ OFF | 需要額外設定 |

### 功能開關粒度

採用 **「全有全無」** 模式（不細分）：

**範例**：
- ✅ `minigames: true` → 所有小遊戲（猜拳、彩票、賭博、刮刮樂）都開啟
- ❌ 不支援：`janken: true, lottery: false`（不細分個別遊戲）

**設計理由**：
- 簡化管理，減少設定複雜度
- 大部分群組不需要細粒度控制
- 未來如有需求可擴展

---

## 自訂設定項目

### 可自訂的設定

| 設定項目 | 資料型別 | 預設值 | 說明 |
|---------|---------|-------|------|
| **welcomeMessage** | `string?` | `null` | 新成員加入時的歡迎訊息，支援變數替換 |
| **commandPrefix** | `string` | `"#"` | 指令前綴，例如 `#抽卡` |
| **groupNickname** | `string?` | `null` | 群組暱稱（用於排行榜顯示） |
| **cooldowns** | `object` | `{}` | 功能冷卻時間覆寫（秒） |

### 歡迎訊息變數替換

**支援的變數**：
```
{username}   → 新成員的顯示名稱
{groupname}  → 群組名稱
```

**範例**：
```
設定：歡迎 {username} 加入 {groupname}！

實際輸出：歡迎 小明 加入 公主連結交流群！
```

### 指令前綴

**可選值**：`#` / `!` / `/` / `.` / `$` 或任意單一字元

**範例**：
```
預設：#抽卡
修改後：!抽卡
```

**限制**：
- 必須是單一字元
- 不可使用空白字元
- 不可與 LINE 系統指令衝突

### 群組暱稱

**用途**：
- 排行榜顯示（避免顯示 LINE 內部的群組 ID）
- 全域公告時的群組識別

**限制**：
- 最大長度：50 字元
- 不可包含特殊符號（emoji 除外）

---

## 冷卻時間機制

### 設計目的

**防洗版**，而非遊戲平衡：
- 避免用戶短時間內重複觸發相同功能
- 減少訊息洪水對群組的干擾
- 保護系統資源

### 系統預設冷卻時間

| 功能 | 預設冷卻（秒） | 最小值（秒） | 說明 |
|------|--------------|-------------|------|
| **gacha** | 120 | 30 | 避免連續洗抽卡結果 |
| **query** | 30 | 10 | 角色查詢、資訊查詢 |
| **minigame** | 60 | 30 | 小遊戲（猜拳、賭博等） |
| **custom_cmd** | 10 | 5 | 自訂指令觸發 |

### 冷卻時間管理規則

**規則**：
- ✅ 群組管理員可以**調高**冷卻時間（例如：120 秒 → 300 秒）
- ❌ 群組管理員**不能調低**於系統最小值（例如：120 秒 → 60 秒 不允許）
- ✅ 設定為 `null` 或不設定時，使用系統預設值

**範例**：
```json
{
  "cooldowns": {
    "gacha": 180,      // 覆寫為 180 秒（允許，因為 > 30）
    "query": null,     // 使用系統預設 30 秒
    "minigame": 20     // ❌ 不允許！低於最小值 30 秒
  }
}
```

### 冷卻時間檢查邏輯

**流程**：
```
1. 用戶執行功能（例如：抽卡）
2. 檢查 Redis: cooldown:{userId}:{功能名稱}
3. 如果存在 → 返回「冷卻中，請等待 X 秒」
4. 如果不存在 → 執行功能，並寫入 Redis（TTL = 冷卻秒數）
```

**Redis Key 格式**：
```
cooldown:{userId}:{feature}:{groupId}

範例：
cooldown:U1234567890:gacha:C0987654321
```

**TTL 計算**：
```typescript
const cooldownSeconds = groupConfig.cooldowns?.gacha ?? DEFAULT_COOLDOWNS.gacha;
await redis.set(key, "1", "EX", cooldownSeconds);
```

---

## 設定變更操作

### 修改功能開關

**執行者**：GROUP_ADMIN / GROUP_OWNER / BOT_ADMIN / SUPER_ADMIN

**指令範例**：
```
#功能 開啟 世界王
#功能 關閉 小遊戲
```

**系統操作**：
```typescript
await prisma.groupConfig.update({
  where: { groupId: 'C123' },
  data: {
    config: {
      ...currentConfig,
      features: {
        ...currentConfig.features,
        worldBoss: true
      }
    }
  }
});
```

### 修改歡迎訊息

**執行者**：GROUP_ADMIN 以上

**指令範例**：
```
#設定歡迎訊息 歡迎 {username} 加入我們！
```

### 修改指令前綴

**執行者**：GROUP_OWNER 以上（因為會影響所有指令）

**指令範例**：
```
#設定前綴 !
```

**注意**：修改後，原本的 `#設定前綴` 會變成 `!設定前綴`

### 修改冷卻時間

**執行者**：GROUP_ADMIN 以上

**指令範例**：
```
#設定冷卻 抽卡 300
```

**驗證邏輯**：
```typescript
const minCooldown = MIN_COOLDOWNS[feature];
if (newCooldown < minCooldown) {
  throw new Error(`冷卻時間不可低於 ${minCooldown} 秒`);
}
```

---

## 群組初始化

### 初始化流程

**觸發時機**：Bot 加入新群組時

**自動操作**：
1. 建立 `GroupConfig` 記錄
2. 設定預設功能開關（基本功能 ON，進階功能 OFF）
3. 等待第一個用戶執行初始化指令，成為 Owner

**資料庫記錄**：
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
    "commandPrefix": "#",
    "cooldowns": {}
  }',
  NOW(),
  NOW()
);
```

### 初始化指令

**指令**：`#初始化` 或 `#init`

**執行條件**：
- 群組尚未有 Owner
- 執行者在該群組內

**執行結果**：
- 執行者成為 GROUP_OWNER
- 返回初始化成功訊息

---

## 設定查詢

### 查看當前設定

**執行者**：所有人（唯讀）

**指令範例**：
```
#設定
#群組設定
```

**返回內容**：
```
📋 群組設定

🔧 功能開關：
  ✅ 歡迎訊息
  ✅ 抽卡系統
  ✅ 角色查詢
  ❌ 世界王
  ❌ 公會戰
  
⚙️ 自訂設定：
  指令前綴：#
  群組暱稱：公主連結交流群
  
⏱️ 冷卻時間：
  抽卡：120 秒
  查詢：30 秒
  小遊戲：60 秒
```

### 查看功能狀態

**執行者**：所有人

**指令範例**：
```
#功能列表
```

**返回內容**：列出所有功能及其開關狀態

---

## 設定遷移

### 從舊版本遷移

**情境**：舊 Bot 的群組設定可能存在不同的資料結構

**遷移策略**：
1. 讀取舊設定（可能是其他格式）
2. 對應到新的 JSON 結構
3. 補齊缺少的預設值
4. 寫入新的 `group_configs` 表

**範例**：
```typescript
// 舊資料
const oldConfig = {
  gacha_enabled: "Y",
  welcome_text: "歡迎加入",
  command_prefix: "#"
};

// 轉換為新格式
const newConfig = {
  features: {
    gacha: oldConfig.gacha_enabled === "Y",
    welcomeMessage: true,
    // ... 其他功能預設值
  },
  welcomeMessage: oldConfig.welcome_text,
  commandPrefix: oldConfig.command_prefix || "#",
  cooldowns: {}
};
```

---

## 安全考量

### 防止惡意設定

- ✅ 指令前綴必須是合法字元（避免特殊字元造成解析錯誤）
- ✅ 歡迎訊息長度限制（避免洗版）
- ✅ 冷卻時間有最小值限制（防止濫用）
- ✅ 群組暱稱長度限制（避免過長名稱）

### 設定變更日誌

**建議**：記錄設定變更歷史

```sql
-- 可選的審計表
CREATE TABLE group_config_audit (
  id SERIAL PRIMARY KEY,
  group_id VARCHAR NOT NULL,
  changed_by VARCHAR NOT NULL,  -- userId
  changed_at TIMESTAMP NOT NULL,
  field_name VARCHAR NOT NULL,   -- 例如：features.gacha
  old_value TEXT,
  new_value TEXT
);
```

---

## 未來擴展

### 可能的擴展方向

1. **設定模板**：預設幾種設定模板（遊戲群、閒聊群、公會群）
2. **設定匯出/匯入**：允許管理員備份設定
3. **定時功能開關**：例如「每天 22:00 - 08:00 關閉小遊戲」
4. **設定繼承**：多個群組共用同一套設定
5. **A/B Testing**：不同群組使用不同預設值，測試效果

---

## 相關文檔

- [權限系統設計](./01-permission-system.md)
- [資料模型設計](./03-data-models.md)
- [NestJS 實作指南](./04-implementation-guide.md)

---

## 變更歷史

| 日期 | 版本 | 變更內容 | 作者 |
|------|------|---------|------|
| 2025-01-25 | 1.0 | 初始版本 | Sisyphus |
