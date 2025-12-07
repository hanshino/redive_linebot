# Quickstart: LINE Bot 事件處理基礎建設

**Feature Branch**: `002-line-event-handler`  
**Date**: 2024-12-07

## 概述

本功能為 LINE Bot 建立事件處理的基礎建設，包含：

- Webhook 端點接收 LINE 平台事件
- 簽名驗證確保請求安全性
- Middleware 鏈式處理架構
- 冪等性檢查防止重複處理

## 快速開始

### 1. 環境準備

確保以下環境變數已設定（`.env` 檔案）：

```bash
# LINE Bot 憑證
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token_here
LINE_CHANNEL_SECRET=your_channel_secret_here

# Redis（冪等性檢查用）
REDIS_URL="redis://localhost:6379"
```

### 2. 啟動服務

```bash
# 啟動 Docker 服務（PostgreSQL、Redis）
cd docker && docker-compose up -d

# 啟動後端開發伺服器
cd apps/backend && pnpm dev
```

### 3. 設定 LINE Webhook URL

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 選擇你的 Channel
3. 在 Messaging API 頁籤中設定 Webhook URL：
   - 開發環境：使用 ngrok 或類似工具暴露本地服務
   - 生產環境：`https://your-domain.com/line/webhook`

### 4. 測試 Webhook

使用 LINE Console 的「Verify」按鈕測試，或直接透過 LINE App 發送訊息給 Bot。

---

## 使用方式

### 註冊自定義 Middleware

```typescript
import { Injectable } from "@nestjs/common";
import {
  LineMiddleware,
  MiddlewareContext,
} from "./line/middleware/middleware.types";

@Injectable()
export class MyCustomMiddleware implements LineMiddleware {
  async handle(
    context: MiddlewareContext,
    next: () => Promise<void>
  ): Promise<void> {
    // 前置處理
    console.log(`處理事件: ${context.event.type}`);

    // 呼叫下一個 middleware
    await next();

    // 後置處理（洋蔥模型）
    console.log(`事件處理完成: ${context.event.webhookEventId}`);
  }
}
```

### 在模組中註冊 Middleware

```typescript
// line.module.ts
import { Module } from "@nestjs/common";
import { LineController } from "./line.controller";
import { LineService } from "./line.service";
import { MiddlewareRunner } from "./middleware/middleware.runner";
import { LoggingMiddleware } from "./middleware/logging.middleware";
import { MyCustomMiddleware } from "./my-custom.middleware";

@Module({
  controllers: [LineController],
  providers: [
    LineService,
    MiddlewareRunner,
    LoggingMiddleware,
    MyCustomMiddleware,
    {
      provide: "LINE_MIDDLEWARES",
      useFactory: (logging: LoggingMiddleware, custom: MyCustomMiddleware) => [
        logging,
        custom,
      ],
      inject: [LoggingMiddleware, MyCustomMiddleware],
    },
  ],
})
export class LineModule {}
```

### 處理特定事件類型

```typescript
import { Injectable } from "@nestjs/common";
import {
  LineMiddleware,
  MiddlewareContext,
} from "./middleware/middleware.types";
import { webhook } from "@line/bot-sdk";

@Injectable()
export class MessageHandler implements LineMiddleware {
  async handle(
    context: MiddlewareContext,
    next: () => Promise<void>
  ): Promise<void> {
    // 只處理訊息事件
    if (context.event.type !== "message") {
      return next();
    }

    const event = context.event as webhook.MessageEvent;

    if (event.message.type === "text") {
      // 處理文字訊息
      console.log(`收到文字訊息: ${event.message.text}`);

      // 可以在這裡回覆訊息
      // await this.lineService.replyMessage(context.replyToken, [...]);
    }

    await next();
  }
}
```

---

## API 端點

### POST /line/webhook

接收 LINE Webhook 事件。

**Headers**:

- `X-Line-Signature`: LINE 平台簽名（必填）
- `Content-Type`: `application/json`

**Request Body**:

```json
{
  "destination": "Uxxxxxxx...",
  "events": [
    {
      "type": "message",
      "webhookEventId": "...",
      "timestamp": 1234567890000,
      "source": { "type": "user", "userId": "Uxxxxxxx..." },
      "message": { "type": "text", "id": "...", "text": "Hello!" }
    }
  ]
}
```

**Response**:

- `200 OK`: 事件已接收
- `401 Unauthorized`: 簽名驗證失敗

---

## 目錄結構

```
apps/backend/src/line/
├── line.module.ts           # 模組定義
├── line.controller.ts       # Webhook 端點
├── line.service.ts          # LINE 客戶端服務
├── middleware/
│   ├── middleware.types.ts  # 型別定義
│   ├── middleware.runner.ts # 執行器
│   └── logging.middleware.ts
├── guards/
│   └── signature.guard.ts   # 簽名驗證
├── services/
│   └── idempotency.service.ts
└── types/
    └── events.ts
```

---

## 常見問題

### Q: 如何取得 raw body 進行簽名驗證？

使用 Fastify raw body 插件，或在 Controller 中使用 `@Req()` 裝飾器取得原始請求。

### Q: 重複事件如何處理？

系統會使用 Redis 檢查 `webhookEventId`，如果事件已處理過會自動跳過。

### Q: Middleware 執行順序是什麼？

依照註冊順序執行，採用洋蔥模型（先進後出）。

### Q: 如何回覆使用者訊息？

注入 `LineService` 並呼叫 `replyMessage()` 方法：

```typescript
await this.lineService.replyMessage(context.replyToken, [
  { type: "text", text: "收到你的訊息！" },
]);
```

---

## 相關文件

- [spec.md](./spec.md) - 功能規格
- [research.md](./research.md) - 技術研究
- [data-model.md](./data-model.md) - 資料模型
- [contracts/webhook-api.yaml](./contracts/webhook-api.yaml) - API 合約
- [LINE Messaging API 官方文件](https://developers.line.biz/en/docs/messaging-api/)
