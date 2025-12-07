# Data Model: LINE Bot 事件處理基礎建設

**Feature Branch**: `002-line-event-handler`  
**Date**: 2024-12-07

## 概述

本功能主要處理 LINE 平台發送的 Webhook 事件，不涉及資料庫持久化儲存。
以下定義的資料模型主要用於運行時處理和型別定義。

## 核心實體

### 1. WebhookRequestBody

LINE 平台發送的 Webhook 請求體。

| 欄位        | 型別        | 必填 | 說明           |
| ----------- | ----------- | ---- | -------------- |
| destination | string      | ✅   | Bot 的 User ID |
| events      | LineEvent[] | ✅   | 事件陣列       |

### 2. LineEvent (Base)

所有 LINE 事件的基礎結構。

| 欄位            | 型別                  | 必填 | 說明                       |
| --------------- | --------------------- | ---- | -------------------------- |
| type            | EventType             | ✅   | 事件類型                   |
| webhookEventId  | string                | ✅   | 事件唯一識別碼             |
| timestamp       | number                | ✅   | 事件發生時間（Unix 毫秒）  |
| mode            | 'active' \| 'standby' | ✅   | Bot 模式                   |
| source          | EventSource           | ✅   | 事件來源                   |
| deliveryContext | DeliveryContext       | ✅   | 傳遞上下文                 |
| replyToken      | string                | ❌   | 回覆用 Token（部分事件有） |

### 3. EventSource

事件來源，使用 discriminated union 設計。

#### UserSource

| 欄位   | 型別   | 必填 | 說明      |
| ------ | ------ | ---- | --------- |
| type   | 'user' | ✅   | 來源類型  |
| userId | string | ✅   | 使用者 ID |

#### GroupSource

| 欄位    | 型別    | 必填 | 說明                  |
| ------- | ------- | ---- | --------------------- |
| type    | 'group' | ✅   | 來源類型              |
| groupId | string  | ✅   | 群組 ID               |
| userId  | string  | ❌   | 發送者 ID（可能為空） |

#### RoomSource

| 欄位   | 型別   | 必填 | 說明                  |
| ------ | ------ | ---- | --------------------- |
| type   | 'room' | ✅   | 來源類型              |
| roomId | string | ✅   | 聊天室 ID             |
| userId | string | ❌   | 發送者 ID（可能為空） |

### 4. DeliveryContext

傳遞上下文資訊。

| 欄位         | 型別    | 必填 | 說明           |
| ------------ | ------- | ---- | -------------- |
| isRedelivery | boolean | ✅   | 是否為重新發送 |

### 5. EventType (Enum)

支援的事件類型。

| 值          | 說明          |
| ----------- | ------------- |
| message     | 訊息事件      |
| follow      | 加入好友事件  |
| unfollow    | 封鎖事件      |
| join        | Bot 加入群組  |
| leave       | Bot 離開群組  |
| memberJoin  | 成員加入群組  |
| memberLeave | 成員離開群組  |
| postback    | Postback 事件 |
| beacon      | Beacon 事件   |
| accountLink | 帳號連結事件  |

---

## Middleware 架構實體

### 6. MiddlewareContext

Middleware 處理上下文。

| 欄位        | 型別                 | 必填 | 說明                         |
| ----------- | -------------------- | ---- | ---------------------------- |
| event       | LineEvent            | ✅   | 目前處理的事件               |
| destination | string               | ✅   | Bot User ID                  |
| state       | Map<string, unknown> | ✅   | 可在 middleware 間共享的狀態 |
| replyToken  | string \| null       | ❌   | 回覆用 Token                 |
| logger      | Logger               | ✅   | 日誌記錄器                   |

### 7. Middleware (Type)

Middleware 函數簽名。

```typescript
type Middleware = (
  context: MiddlewareContext,
  next: () => Promise<void>
) => Promise<void>;
```

---

## 服務層實體

### 8. EventProcessingResult

事件處理結果。

| 欄位             | 型別          | 必填 | 說明             |
| ---------------- | ------------- | ---- | ---------------- |
| eventId          | string        | ✅   | 事件 ID          |
| success          | boolean       | ✅   | 是否成功         |
| error            | Error \| null | ❌   | 錯誤資訊（如有） |
| processingTimeMs | number        | ✅   | 處理耗時（毫秒） |

### 9. IdempotencyRecord

冪等性檢查記錄（儲存於 Redis）。

| 欄位  | 型別   | 說明                          |
| ----- | ------ | ----------------------------- |
| key   | string | `line:event:{webhookEventId}` |
| value | '1'    | 固定值，表示已處理            |
| ttl   | number | 86400 秒（24 小時）           |

---

## 關係圖

```
WebhookRequestBody
    │
    ├── destination: string
    │
    └── events: LineEvent[]
            │
            ├── type: EventType
            ├── webhookEventId: string
            ├── timestamp: number
            ├── mode: string
            ├── deliveryContext: DeliveryContext
            │       └── isRedelivery: boolean
            │
            └── source: EventSource
                    ├── UserSource
                    ├── GroupSource
                    └── RoomSource
```

---

## 狀態轉換

### 事件處理流程狀態

```
[Received] → [Validated] → [Deduplicated] → [Processing] → [Completed/Failed]
     │            │              │                │
     │            ↓              ↓                ↓
     │       [Rejected]    [Skipped]         [Error Logged]
     ↓
[Invalid Signature]
```

| 狀態         | 說明                         |
| ------------ | ---------------------------- |
| Received     | 收到 Webhook 請求            |
| Validated    | 簽名驗證通過                 |
| Deduplicated | 冪等性檢查通過（非重複事件） |
| Processing   | Middleware 處理中            |
| Completed    | 處理成功完成                 |
| Failed       | 處理失敗（已記錄錯誤）       |
| Rejected     | 簽名驗證失敗                 |
| Skipped      | 重複事件，跳過處理           |

---

## 注意事項

1. **型別來源**: 大部分型別直接使用 `@line/bot-sdk` 的 `webhook` 命名空間
2. **無資料庫儲存**: 此功能不涉及 PostgreSQL 資料模型
3. **Redis 僅用於冪等性**: 使用簡單的 key-value 結構，帶 TTL
4. **擴展性**: MiddlewareContext 的 state 可用於在 middleware 間傳遞資料
