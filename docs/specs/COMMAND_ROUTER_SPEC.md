# Command Router Service Specification

**Status**: Draft  
**Target Phase**: Phase 1 - Foundation  
**Framework**: NestJS + @line/bot-sdk

---

## 1. Overview

Command Router Service 是整個 LINE Bot 的核心中樞，負責接收來自 LINE Webhook 的原始事件，並將其分發 (Dispatch) 給對應的 Controller Handler。

它取代了舊版 Bottender 的 `router([...])` 與 `chain([...])` 架構，改採 **Decorator-based** 的宣告式路由，充分利用 NestJS 的 Discovery 機制。

### Core Capabilities

- **Flexible Prefix**: 支援多重前綴 (`#`, `/`, `.`, `!`) 設定。
- **Hybrid Matching**: 支援字串比對 (String) 與正規表達式 (Regex)。
- **Event Driven**: 不僅處理文字指令，也能路由非文字事件 (Follow, Join, Postback)。
- **Metadata Discovery**: 自動掃描 Controller 方法，無需手動註冊。
- **Context Injection**: 自動解析並注入參數 (Args, Raw Text, Regex Match)。

---

## 2. API Design (Decorators)

### `@Command(options)`

專門處理 **Text Message** 的高階裝飾器。

```typescript
interface CommandOptions {
  command: string | RegExp;  // 指令關鍵字或正則
  aliases?: string[];        // 別名
  description?: string;      // 說明 (供 Help 指令用)
  prefix?: boolean;          // 是否強制需要前綴 (default: true)
}

// 用法範例
@Command({ command: '抽', aliases: ['gacha'] })
```

### `@OnEvent(eventType)`

處理非文字的 LINE 事件。

```typescript
type LineEventType = 'follow' | 'unfollow' | 'join' | 'leave' | 'postback' | 'message' | 'memberJoined' | ...;

// 用法範例
@OnEvent('follow')
async handleFollow() { ... }
```

### `@Postback(action)`

專門處理 Postback 事件的語法糖 (Sugar for `@OnEvent('postback')` with filtering)。

```typescript
// 匹配 data="action=vote&id=123"
@Postback('vote')
```

---

## 3. Context Injection (參數注入)

Handler 方法可以透過 Custom Decorators 取得所需的資料：

```typescript
@Command({ command: '抽' })
async gacha(
  @Context() ctx: LineContext,      // 原始 LINE Context
  @Text() raw: string,              // 去除前綴後的完整字串
  @Args() args: string[],           // 以空白切分的參數陣列
  @Match() match: RegExpMatchArray  // Regex capture groups
) {
  // ...
}
```

---

## 4. Dispatch Logic (分發邏輯)

當 `LineService` 收到 Webhook Event 時，執行流程如下：

1.  **Event Type Check**:
    - 若非 `message` (如 `follow`), 查找 `@OnEvent('follow')` handlers。
    - 若是 `postback`, 查找 `@Postback(action)` handlers。

2.  **Message Type Check**:
    - 若是 `message` 且 type 為 `text`: 進入 **Command Matching** 流程。
    - 若是其他 message (image, sticker): 查找 `@OnEvent('message')` 且過濾 type。

3.  **Command Matching Strategy** (Priority Order):
    1.  **Exact String Match**: 完全符合 `command` 或 `aliases` (需符合 Prefix)。
    2.  **Regex Match**: 符合 `pattern` 正則表達式。
    3.  **Fallback**: 若無匹配，進入 `catch-all` 或忽略。

### Prefix Handling

- System Prefixes: `['#', '/', '.', '!']` (Configurable)
- 處理邏輯：
  1. 檢查訊息開頭是否為 Prefix。
  2. 若是，移除 Prefix 取得 `content`。
  3. 若否，`content` = 原始訊息 (僅當指令允許 `prefix: false` 時才匹配)。

---

## 5. Architecture Components

### `CommandMetaDiscovery`

- 實作 `OnModuleInit`。
- 使用 `@nestjs/core` 的 `DiscoveryService`。
- 掃描所有 Controller，提取 `@Command` 和 `@OnEvent` 的 Metadata。
- 建立 `CommandMap` 和 `EventMap` 供快速查找。

### `CommandDispatcher`

- 接收 `WebhookEvent`。
- 執行上述 Dispatch Logic。
- 解析參數 (`args`, `text`)。
- 呼叫目標 Handler。
- 錯誤處理 (Try-Catch, Error Logging)。

---

## 6. Migration Example

**Before (Bottender):**

```javascript
// app.js
text(/^[/#.]抽(\*(?<times>\d+))?(\s*(?<tag>[\s\S]+))?$/, gacha.play);
```

**After (NestJS):**

```typescript
// gacha.controller.ts
@Controller()
export class GachaController {
  @Command({
    command: /^[/#.]抽(\*(?<times>\d+))?(\s*(?<tag>[\s\S]+))?$/,
    description: "進行轉蛋",
  })
  async play(@Context() ctx: LineContext, @Match() match: RegExpMatchArray) {
    const times = match.groups?.times || 1;
    const tag = match.groups?.tag;
    // ...
  }
}
```

---

## 7. Future Proofing

- **Guard Integration**: 未來可直接掛上 `@UseGuards(AdminGuard)`，Dispatcher 需在呼叫 Handler 前檢查 Guard。
- **Interceptor**: 支援 `@UseInterceptors(LoggingInterceptor)`。
