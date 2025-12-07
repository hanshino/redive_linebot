# Research: LINE Bot 事件處理基礎建設

**Feature Branch**: `002-line-event-handler`  
**Date**: 2024-12-07

## 研究任務

### 1. LINE SDK 簽名驗證機制

**Decision**: 使用 `@line/bot-sdk` 提供的 `validateSignature()` 函數

**Rationale**:

- LINE 官方 SDK 提供 `validateSignature()` 函數，使用 HMAC-SHA256 進行簽名驗證
- SDK 同時提供 Express `middleware()` 函數，但這不適用於 NestJS + Fastify 架構
- 我們將直接使用 `validateSignature()` 函數封裝成 NestJS Guard

**Source Code Reference**:

```typescript
// @line/bot-sdk/lib/validate-signature.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export default function validateSignature(
  body: string | Buffer,
  channelSecret: string,
  signature: string
): boolean {
  return safeCompare(
    createHmac("SHA256", channelSecret).update(body).digest(),
    s2b(signature, "base64")
  );
}
```

**Alternatives Considered**:

- 使用 SDK 內建的 Express middleware → 不適用，我們使用 Fastify
- 自行實作 HMAC-SHA256 → 不必要，SDK 已提供且使用 `timingSafeEqual` 防止時序攻擊

---

### 2. LINE 事件類型

**Decision**: 使用 `@line/bot-sdk` 的 `webhook` 命名空間中的型別定義

**Rationale**:

- SDK 提供完整的 TypeScript 型別定義
- 支援所有官方事件類型，包括未來的未知事件
- 事件類型使用 discriminated union 設計，便於型別推斷

**主要事件類型**:

| 事件類型      | 說明           | 支援環境   |
| ------------- | -------------- | ---------- |
| `message`     | 使用者發送訊息 | 1:1 / 群組 |
| `follow`      | 使用者加入好友 | 1:1        |
| `unfollow`    | 使用者封鎖     | 1:1        |
| `join`        | Bot 加入群組   | 群組       |
| `leave`       | Bot 離開群組   | 群組       |
| `memberJoin`  | 成員加入群組   | 群組       |
| `memberLeave` | 成員離開群組   | 群組       |
| `postback`    | Postback 動作  | 1:1 / 群組 |
| `beacon`      | Beacon 事件    | 1:1        |
| `accountLink` | 帳號連結       | 1:1        |

**SDK 型別使用方式**:

```typescript
import { webhook } from "@line/bot-sdk";

const event: webhook.Event = {
  type: "message",
  webhookEventId: "xxxxx",
  deliveryContext: { isRedelivery: false },
  timestamp: 123456789,
  mode: "active",
  // ...
};
```

---

### 3. Webhook 請求結構

**Decision**: 遵循 LINE 官方 Webhook 請求結構

**Webhook Request Body**:

```typescript
interface WebhookRequestBody {
  destination: string; // Bot 的 User ID
  events: webhook.Event[]; // 事件陣列（可能包含多個事件）
}
```

**重要的 HTTP Headers**:

- `X-Line-Signature`: HMAC-SHA256 簽名（Base64 編碼）
- `Content-Type`: `application/json`

**關鍵欄位**:

- `webhookEventId`: 事件唯一識別碼，用於冪等性檢查
- `deliveryContext.isRedelivery`: 是否為重新發送的事件
- `timestamp`: 事件發生時間戳記
- `replyToken`: 回覆用的 token（有效期約 1 分鐘）

---

### 4. Middleware 架構設計最佳實踐

**Decision**: 採用洋蔥模型（Onion Model）middleware 架構

**Rationale**:

- 類似 Koa.js / Bottender 的 middleware 設計
- 支援前置處理和後置處理（await next() 前後）
- 易於理解和測試

**設計參考**:

```typescript
type MiddlewareContext = {
  event: webhook.Event;
  state: Map<string, unknown>;
  // 可擴展的共享狀態
};

type NextFunction = () => Promise<void>;

type Middleware = (
  context: MiddlewareContext,
  next: NextFunction
) => Promise<void>;
```

**執行流程**:

```
Request → Middleware A (前) → Middleware B (前) → Middleware C (前)
                                                         ↓
Response ← Middleware A (後) ← Middleware B (後) ← Middleware C (後)
```

---

### 5. NestJS + Fastify 整合考量

**Decision**: 使用 NestJS Guard 進行簽名驗證，自定義 Middleware Runner 處理事件

**Rationale**:

- NestJS Guard 是處理請求驗證的標準方式
- Fastify 需要特殊處理 raw body（簽名驗證需要原始請求體）
- 保持 NestJS 的依賴注入優勢

**Fastify Raw Body 處理**:

```typescript
// 需要在 Fastify 設定中啟用 raw body
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter()
);

// 使用 fastify-raw-body 插件或手動處理
await app.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: false,
});
```

---

### 6. Redis 冪等性檢查策略

**Decision**: 使用 Redis SETNX + TTL 實作冪等性檢查

**Rationale**:

- 專案已配置 Redis
- SETNX 提供原子操作
- TTL 自動清理過期記錄

**實作方式**:

```typescript
// Key 格式: line:event:{webhookEventId}
// TTL: 24 小時（LINE 重試機制的合理範圍）

async isProcessed(eventId: string): Promise<boolean> {
  const key = `line:event:${eventId}`;
  const result = await this.redis.set(key, '1', 'EX', 86400, 'NX');
  return result === null; // null 表示 key 已存在
}
```

**Alternatives Considered**:

- 記憶體快取 → 不支援分散式部署
- PostgreSQL → 查詢開銷較大，增加延遲

---

### 7. 錯誤處理策略

**Decision**: 批次事件獨立處理，單一事件錯誤不影響其他事件

**Rationale**:

- LINE 可能在單一請求中發送多個事件
- 符合規格要求 FR-012

**實作方式**:

```typescript
for (const event of events) {
  try {
    await this.processEvent(event);
  } catch (error) {
    this.logger.error(`Failed to process event ${event.webhookEventId}`, error);
    // 繼續處理下一個事件
  }
}
// 無論處理結果，都返回 200 OK
```

---

### 8. 日誌記錄策略

**Decision**: 使用 NestJS 內建 Logger，結構化記錄事件元資料

**記錄欄位**:

- `webhookEventId`: 事件 ID
- `type`: 事件類型
- `source.type`: 來源類型 (user/group/room)
- `source.userId` / `source.groupId`: 來源 ID
- `timestamp`: 事件時間戳記
- `processingTime`: 處理耗時

**不記錄**:

- 訊息內容 (`message.text`)
- 使用者個人資訊（除 ID 外）

---

## 結論

所有技術問題已解決，可以進入 Phase 1 設計階段。

**Key Decisions Summary**:

| 項目            | 決定                                          |
| --------------- | --------------------------------------------- |
| 簽名驗證        | 使用 `@line/bot-sdk` 的 `validateSignature()` |
| 事件型別        | 使用 `webhook.Event` 型別定義                 |
| Middleware 架構 | 洋蔥模型，自定義實作                          |
| 請求驗證        | NestJS Guard                                  |
| Raw Body        | Fastify 插件或手動處理                        |
| 冪等性          | Redis SETNX + 24hr TTL                        |
| 錯誤處理        | 獨立處理，繼續執行                            |
| 日誌            | 結構化，不含訊息內容                          |
