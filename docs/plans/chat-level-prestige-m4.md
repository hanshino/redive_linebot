# M4 — 廣播基礎架構

**目的**：Reply token queue + broadcast queue consumer，讓 M3 的 `trial_pass` / `prestige` / `awakening` / `lv_100_cta` 事件能從 Redis 真的送到 LINE 群裡。

**依賴**：M3 完成（`broadcastQueue.pushEvent` 已是生產端）。

**Branch**：`feat/clp-m4` off `feat/chat-level-prestige`。

---

## 背景

M3 結束時：
- `broadcastQueue.pushEvent` 已被 `PrestigeService` 與 `pipeline.onBatchWritten` 呼叫，事件會 `LPUSH` 到 `BROADCAST_QUEUE_{groupId}`（TTL 24h）。
- `EventDequeue.saveReplyToken` 仍是舊版：`redis.set(ReplyToken_{sourceId}, token, {EX:20})`，**且沒有任何讀取者**。

缺的是 consumer：把 queue 裡的事件用一個還沒過期的 replyToken 丟出去。

## 拍板的設計決策

1. **Reply token queue**：ZSET `REPLY_TOKEN_QUEUE_{sourceId}`，score = unix ms，保留最新 5 個，刪除 >55s 的（LINE token 實際壽命約 60s，留 5s 緩衝）。Key 有 55s TTL 作為保險。
2. **Regex 擴張**：`[CUD]` → `[CUDR]` 把 room source 納入（歷史缺陷）。
3. **Broadcast 格式**：每個事件轉一個 LINE text message；單次 `reply` 最多 5 則（LINE 限制）。
4. **消費語意**：`LRANGE key -5 -1` 拿最舊 5 筆 → reply 成功後 `LTRIM key 0 -(N+1)` 丟尾 N 筆。失敗就不 trim，下次 cron 重試。
5. **觸發時機**：
   - Inline：每則 group/room 文字訊息進來，`saveReplyToken` 後馬上 `drain(sourceId)`，讓玩家能**即時**看到回應（1 次訊息觸發 1 次消費）。
   - 定期：cron 每 30s `SCAN` 所有 `BROADCAST_QUEUE_*`，對沒有最近訊息的群也 drain 一次（拿得到 token 才會真的送）。
6. **沒 token 就等**：`pullFreshToken` 拿不到可用 token 時，事件留在 queue，24h 內都有機會。
7. **訊息格式**：純 text（Flex 可留後續迭代）。格式由 `formatMessage(event)` 決定：
   - `trial_enter` → `@{displayName} 踏入了 ★{star} 的試煉`（v1 用 event.text 直出，不查 profile）
   - `trial_pass` / `prestige` / `awakening` / `lv_100_cta` → 同理直出 `event.text`
   - v1 一律用 `event.text`，顯示邏輯都在 producer 端已處理。

---

## 任務

### M4.0 — 擴充 setup.js redis mock

把 ZSET / LRANGE / LTRIM / SCAN 相關方法加到全域 mock，否則新 util 的測試會 hit undefined。

新增：`zAdd`, `zRangeByScore`, `zRem`, `zRemRangeByRank`, `zRemRangeByScore`, `lRange`, `lTrim`, `scanIterator`。

### M4.1 — `app/src/util/replyTokenQueue.js`

```js
async function saveToken(sourceId, token, timestamp) {
  // ZADD key score=timestamp member=token
  // ZREMRANGEBYRANK key 0 -6  (keep newest 5)
  // ZREMRANGEBYSCORE key 0 (now - 55000)
  // EXPIRE key 55
}
async function pullFreshToken(sourceId) {
  // ZRANGEBYSCORE key (now-55000) +inf, pick one, ZREM it, return
}
```

**測試**：新 token 推入、舊 token 過期被清、超出 5 個被截尾、pull 後被移除、無可用 token 回 null。

### M4.2 — 重寫 `EventDequeue.saveReplyToken`

```js
async function saveReplyToken(event) {
  const { type } = event.source;
  const sourceId = event.source[`${type}Id`];
  const token = event.replyToken;
  if (!/^[CUDR][0-9a-f]{32}$/.test(sourceId)) return;
  if (!token) return;
  return replyTokenQueue.saveToken(sourceId, token, event.timestamp);
}
```

**測試**：group/user/room 都被接受；非法 sourceId 被拒；無 token 被拒。

### M4.3 — `broadcastQueue.drain` + `formatMessage`

```js
function formatMessage(event) {
  return { type: "text", text: event.text || "[空事件]" };
}
async function drain(groupId, deps) {
  // deps = { lineClient, replyTokenQueue, logger }
  const key = BROADCAST_QUEUE_KEY(groupId);
  const MAX = 5;
  const raws = await redis.lRange(key, -MAX, -1);
  if (!raws || raws.length === 0) return { drained: 0 };
  const token = await deps.replyTokenQueue.pullFreshToken(groupId);
  if (!token) return { drained: 0, reason: "no_token" };
  const events = raws.map(parseOrNull).filter(Boolean);
  // lRange returns head→tail order, but our FIFO display order is tail→head-of-slice
  // so reverse for display: oldest-first.
  const messages = events.reverse().map(formatMessage);
  try {
    await deps.lineClient.reply(token, messages);
    await redis.lTrim(key, 0, -(raws.length + 1));
    return { drained: raws.length };
  } catch (err) {
    deps.logger?.error?.("[broadcastQueue.drain] reply failed", { groupId, err: err.message });
    return { drained: 0, reason: "reply_failed" };
  }
}
```

**測試**：
- 空 queue 直接 return drained:0
- 無 token return reason:"no_token"，不 trim
- reply 成功 → ltrim 對應數量，drained 正確
- reply 失敗 → 不 trim，事件保留
- 超過 5 筆 → 只送最舊 5 筆，其餘留在 queue

### M4.4 — Hook drain 進 `EventDequeue.eventHandle`

在 `saveReplyToken` 呼叫成功之後：

```js
if (event.source.type === "group" || event.source.type === "room") {
  broadcastQueue.drain(event.source[`${event.source.type}Id`], deps).catch(noop);
}
```

不 await、不讓 drain 失敗拖住主 flow。

**測試**：group 事件觸發 drain、user 事件不觸發。

### M4.5 — `app/bin/BroadcastQueueDrainer.js`

```js
async function main() {
  try {
    const iterator = redis.scanIterator({ MATCH: "BROADCAST_QUEUE_*", COUNT: 100 });
    for await (const key of iterator) {
      const groupId = key.replace(/^BROADCAST_QUEUE_/, "");
      await broadcastQueue.drain(groupId, deps);
    }
  } catch (err) {
    console.error("[BroadcastQueueDrainer]", err);
  }
}
```

**測試**：多個 key 都被 drain；單一 drain 失敗不中斷迭代；scanIterator 失敗不崩潰。

### M4.6 — Register cron

`app/config/crontab.config.js`：每 30s 一次（cron 不支援 sub-minute，需用 "*/30" 於秒位）。

```js
{
  name: "Broadcast Queue Drainer",
  description: "consume BROADCAST_QUEUE_* and reply to groups when a fresh token is available",
  period: ["*/30", "*", "*", "*", "*", "*"],
  immediate: false,
  require_path: "./bin/BroadcastQueueDrainer",
}
```

### M4.7 — Integration test

`__tests__/util/broadcastQueue.drain.integration.test.js`：
1. `saveToken("Gabc", "token-new", nowMs)` → zAdd 狀態 OK
2. `pushEvent("Gabc", {type:"trial_pass", text:"通過了 ★1 的試煉"})`
3. `drain("Gabc", {lineClient, replyTokenQueue})` →
   - `lineClient.reply` 被呼叫 1 次，args = (`token-new`, `[{type:"text", text:"通過了 ★1 的試煉"}]`)
   - token 已被 zRem
   - queue 已被 lTrim

（用 in-memory stub 或 jest.fn 模擬 redis/lineClient，不走真網路）

### M4.8 — Merge back

- `yarn test` full suite，確認非 M4 測試全綠
- `yarn lint` clean
- `git checkout feat/chat-level-prestige && git merge --no-ff feat/clp-m4`

---

## Exit Criteria

- [ ] Reply token 可同時保留多個 source 的最新 5 個，55s 後自然過期
- [ ] Group 訊息進來後廣播事件 ≤ 1 秒內送達（inline drain）
- [ ] 沒最近訊息的群也會在 30s 內被 cron 掃到（一旦有下一則訊息就能 reply）
- [ ] Reply API 失敗 → 事件保留在 queue，24h 內重試
- [ ] `yarn test` 新增測試全綠，既有測試零回歸
- [ ] `yarn lint` clean

## Non-goals（延後）

- Flex message 版本（這次只發 text）
- Push API fallback（專案政策明令禁用 LINE Push API）
- Rate-limit 保護（群訊息本來就是瓶頸，drainer 30s 頻率極低）
- 事件合併（多筆一起發）— 已由 `reply(messages[])` 天然支援
