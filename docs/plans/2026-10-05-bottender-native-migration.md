# Bottender → LINE 官方 SDK v11 遷移實作計畫

## 1. 目標、範圍與調查限制

以 **in-repo thin compatibility layer** 取代 Bottender，保留現有 controllers 的呼叫方式、middleware 順序、router 與 state 語意；不建立 npm package、不重寫業務邏輯。

依已核可順序執行：

1. 建立 `app/src/lib/bot/index.js` facade，先 re-export Bottender；機械式替換 imports，同一 PR 移除 dead Telegram branches。
2. 實作 `app/src/lib/bot/native/`，預設仍使用 Bottender。
3. 同一組 contract tests 分別執行 Bottender、native。
4. production 以 `BOT_ENGINE=native` 切換；保留 env rollback，穩定後另行移除 Bottender。

**本文件是唯讀調查後的實作計畫，不是驗證結果。** 未修改檔案、未安裝 SDK、未執行 tests、lint 或 LINE 實測。

證據路徑簡寫：

- `B/` = `app/node_modules/bottender/dist/`
- `M/` = `app/node_modules/messaging-api-line/dist/`
- 其他路徑皆相對 repository root。

已直接閱讀本機 Bottender 1.5.5 source；版本指定見 `app/package.json:22`。本機 `app/node_modules/@line/bot-sdk/package.json` **查無**，且本次外部搜尋工具不可用。因此，SDK v11 的實際 exports、error shape、stream type 必須在安裝鎖定版本後，以套件 source/type declarations 和 adapter tests 作為合併門檻，不能把本文的 SDK 對接規格當作已執行驗證。

---

## 2. 核心結論

### 必須維持的 compatibility

- LINE state 是 **per-source conversation**，不是一律 per-user：
  - user → `userId`
  - group → `groupId`，**群組所有成員共用同一份 state**
  - room → `roomId`，**聊天室所有成員共用同一份 state**
- `initialState` 不是與既有 state deep merge；只有缺少 `_state` 時 deep-clone 初始化。
- `setState()` 是 top-level shallow merge。
- `resetState()` 是整份 state 換成 initialState 的 deep clone。
- `session.expiresIn: 60` 實際是 **60 分鐘 sliding TTL**，每次成功寫入 session 刷新。
- `session.state: 15` **查無消費者，不是有效的 15 分鐘 state TTL**。
- `chain()` 建立 action continuation，不會自行跑完 middleware；必須有 dialog driver。
- `replyText()` 等在 batch 階段只是 enqueue，不能改成每次呼叫立即發 API。
- `event._rawEvent` 必須可變；getters 必須即時反映 mutation。
- `getMessageContent()` 對 controllers 必須維持回傳 `Buffer`。
- 不增加 reply → push fallback。

### 明確的 native 行為差異

| 項目 | Bottender 現況 | Native 計畫 |
|---|---|---|
| 超過 5 則 batch reply | warning，僅送第一組 5 則 | **全部放進一次 `replyMessage`，讓 LINE 拒絕；只記錄錯誤** |
| 同 source events | 同 webhook、跨 webhook 均可能競爭覆寫 | 同 source serial queue，依 enqueue 順序 read → execute → save |
| HTTP ACK | session/context 建立完成後才結束 HTTP response | signature/body validation 後先回 200，才非同步執行 events |
| Redis state namespace | `line:<sourceId>` | 新 namespace，一次性 reset |
| `getClient("line")` | 每次建立 bot/session store/client | native process-local singleton，不建立額外 session connection |
| `getProfile()` | repo 有呼叫，但本機舊 client 查無此 method | native 提供 alias，對應官方 `getProfile()` |
| connector 隱藏 member-list 查詢 | 每個 group/room event 嘗試查全部 member IDs | 不重現無 caller 的隱藏查詢；profile 仍走既有 middleware |

這些差異需有明確測試，不能用「兩個 engines 完全相同」概括。

---

## 3. State：現況精確語意

### 3.1 Session key 與共享邊界

`LineConnector.getUniqueSessionKey()`：

- user → `source.userId`
- group → `source.groupId`
- room → `source.roomId`
- 可選 prefix；本專案未設定。
- 非上述 source type 會丟 `TypeError`。

證據：`B/line/LineConnector.js:76–98`、`app/bottender.config.js:56–61`。

`Bot.createRequestHandler()` 再加 platform prefix：

```text
sessionId = "line:" + sourceId
```

證據：`B/bot/Bot.js:120–130`。

Redis cache 預設 prefix 為空，因此實際舊 Redis key 是：

```text
line:U...
line:C...
line:R...
```

證據：`B/cache/RedisCacheStore.js:18–25`。

**不能將 native 改成 `groupId:userId`。** 那會破壞群組 cooldown、群組設定和 profile map 的既有共享範圍。

### 3.2 Initial state、setState、resetState

| 操作 | Bottender 真正行為 | Native 必須維持 |
|---|---|---|
| 新 session | 若 `session._state` falsy，`cloneDeep(initialState)` | 每個新 session 擁有獨立 nested objects |
| 既有 session | 有 `_state` 就直接使用，不補 defaults | 不 shallow/deep merge 新 initialState 到舊 state |
| `state` getter | 直接回傳 `session._state` | 保留直接 nested mutation 的可見性 |
| `setState(patch)` | `{ ...oldState, ...patch }` | nested object 整個替換，不 recursive merge |
| `resetState()` | `cloneDeep(initialState)` | 清掉動態 keys，還原初始 keys |
| 無 session | state getter 回 `{}`；set/reset warning、不寫入 | 保留最小相容行為 |
| save 後 set/reset | warning，但仍修改記憶體物件 | 不承諾追加持久化 |

證據：`B/context/Context.js:21–36,64–89`。

例如：

```text
oldState = { guildConfig: { Battle: "Y", Gacha: "Y" } }
setState({ guildConfig: { Battle: "N" } })

結果 = { guildConfig: { Battle: "N" } }
```

`Gacha` 不會自動保留。

可直接重用已安裝的 `lodash/cloneDeep`，不新增依賴；見 `app/package.json:35`。

### 3.3 載入與儲存時機

現有 request lifecycle：

1. 初始化 session store。
2. 對 webhook body 執行 `camelcaseKeysDeep()`。
3. 將 webhook 轉成 events。
4. 每個 event 分別讀 Redis session、更新 source/session metadata、建立 context。
5. 跑 plugins。
6. 平行執行每個 context 的 dialog。
7. 正常結束後執行 `context.handlerDidEnd()`，flush batch。
8. handler/flush 發生錯誤時執行 `_error.js`。
9. contexts 全部完成後，設定 `isSessionWritten = true`、更新 `lastActivity`，再寫 session。

證據：`B/bot/Bot.js:107–183,208–221`。

本專案 `_error.js` 只記錄 `props.error.stack`，不重新 throw：

- `app/_error.js:1–3`
- error handler 載入：`B/shared/getChannelBots.js:36–54`

因此，本 repo 中：

- handler throw：batch 不會正常 flush，但 error handler 正常返回後仍可能儲存已修改的 state。
- LINE reply reject：error handler 記錄後，state 仍會儲存。
- error handler 自己再 throw：`Promise.all` reject，該 request 的後續整批 session write 會被跳過。

**Native 要維持一般情況的「error handler 返回後仍 save」；不要以 reply 成功與否決定業務 state 是否存在。** Native 將 save/error isolation 改為每個 event 各自處理，不讓一個 source 的 failure 阻斷其他 source。

### 3.4 TTL：60 有效、15 無效

實際傳遞鏈：

```text
bottender.config.session.expiresIn
  → getSessionStore()
  → RedisSessionStore
  → CacheBasedSessionStore.write()
  → RedisCacheStore.put()
  → SETEX(key, expiresIn * 60, JSON.stringify(session))
```

證據：

- 設定：`app/bottender.config.js:2–5`
- 只傳入 `session.expiresIn`：`B/shared/getSessionStore.js:8–27`
- constructor forwarding：`B/session/RedisSessionStore.js:8–12`
- read/write：`B/session/CacheBasedSessionStore.js:22–35`
- 分鐘轉秒、JSON：`B/cache/RedisCacheStore.js:42–49,71–76`

結論：

- session 與 `_state` 一起存同一個 JSON，沒有獨立 state TTL。
- read 不 refresh TTL。
- write refresh 至 3,600 秒，即使該 event 沒有呼叫 `setState()`。
- 活躍群組的 state 可能持續存在，不會每 60 分鐘固定 reset。
- `session.state: 15` 在已閱讀的 Bottender state/session 初始化與儲存流程中沒有被使用；`app/src` 也查無讀取這個 config key 的程式。

**它既不是 Bottender 的 state TTL，也查無 app-level TTL 實作。** Native 不應憑這個設定新增 15 分鐘過期行為；PR 2 刪除或明確註記無效設定，並修正文檔。

### 3.5 同一 webhook 與跨 webhook 的 concurrency

Bottender 並非依 source sequential：

- 建立 contexts 使用 `p-map`，`concurrency: 5`。
- 每個 event 都自行 read session。
- 所有 contexts 建立後，以 `Promise.all` 平行跑 handlers。
- 最後也以 `Promise.all` 寫 sessions。

證據：`B/bot/Bot.js:118–160,167–183,208–219`。

因此，同一 webhook 的兩個同群 event 可以：

1. 都讀到相同舊 state。
2. 各自新增不同 `userDatas[userId]`。
3. 各自寫回完整 JSON。
4. 後寫者覆蓋先寫者。

跨 concurrent webhooks 同樣沒有 source lock，存在 last-write-wins。這不是必須重現的正確行為；native 應修掉，但要放進差異測試。

---

## 4. State key 完整盤點

以下為 `app/src` 實際讀寫、destructuring、`lodash.get()` 與 initialState 的 top-level inventory；業務 MySQL、AI conversation store、其他 Redis keys 不計為 `context.state`。

| State key | 寫入／初始化證據 | 讀取證據 | 語意與風險 |
|---|---|---|---|
| `userDatas` | `app/bottender.config.js:26`；`app/src/middleware/profile.js:39–55` | `middleware/statistics.js:94`；`middleware/dcWebhook.js:30,60–63`；`templates/application/Order.js:161`；`controller/princess/battle.js:23`；`controller/application/OpenaiController.js:66–70` | per-source map，內層以 `userId` 分隔。群組中共用 map 是正確設計，不能改成只保存當前 user。 |
| `groupDatas` | `app/bottender.config.js:27`；`middleware/profile.js:78–89` | `middleware/statistics.js:83–89`；`templates/application/Group/line.js:5,254` | per-group summary/count cache；只在空 object 時載入。private/room 保留初始 `{}`。 |
| `sentCoolDown` | `app/bottender.config.js:28`；`templates/application/CustomerOrder/line.js:198–215,228–245` | 同檔 `:195,225` | per-source。群組/room 共用防洗版 cooldown；不是每位使用者一份。內層 keys 為 `CusInsert`、`CusDelete`，值為毫秒 timestamp。 |
| `guildConfig` | `app/bottender.config.js:29–36`；`middleware/config.js:21–35` | `app/src/app.js:300,316,327`；`controller/application/GlobalOrders.js:16`；`controller/application/WorldBossController.js:19,32`；`controller/princess/gacha.js:67,108`；`templates/application/Group/line.js:255` | per-group。每個 group event 都由既有 Redis-backed model 重新取得，並整份替換。private/room 使用 defaults。 |
| `arena` | `app/bottender.config.js:37` | `app/src` 查無讀寫 | 保留 initialState 的 `{}`，本次不借機刪除。 |
| `sender` | `middleware/config.js:27–35` | `templates/application/Order.js:18`；`controller/application/GroupConfig.js:46–49` | group sender。`GroupConfig` 會直接 mutate nested object，所以不能只在 setState 時判 dirty。 |
| `isAdmin` | `middleware/config.js:14–18` | `controller/application/AdvertisementController.js:17` | 只在 `source.type === "user"` 時載入，因此目前是 per-user，與 user session 一致。 |
| `changeJobMission` | `controller/application/JobController.js:49–56,80–87,115–122,215,229–233,275–280,302,336–355` | 同檔 `:33,64,99,155,237,310,416` | 個人轉職任務，資料包含 `job/count/startTime/endTime/limit/package`；**若在 group/room 執行即落入共享 session，存在 scope mismatch**。 |

補充：

- `guildConfig` 初始 keys：`Battle`、`PrincessCharacter`、`CustomerOrder`、`GlobalOrder`、`Gacha`、`PrincessInformation`。
- 實際另讀 `WorldBossAttack`；來自 group config model，而非 initialState。
- `/state` 讀取整份 state：`app/src/app.js:80–82,195`。
- `/resetstate` reset 整份 conversation state：`app/src/app.js:198`；在群組中會影響所有成員，不是只影響觸發者。

### 4.1 已存在的 scope mismatch，不能由遷移偷偷「修正」

`JobController.router` 只在 private user router 掛載：

- `app/src/app.js:180`

但轉職 postback routes 沒有相同的 private-only guard：

- `app/src/app.js:119–141`

而 mission state 本身沒有 owner user ID，完成任務卻使用當前 `source.userId`：

- `JobController.js:154–175,214–233`
- `JobController.js:236–305`
- `JobController.js:309–358`

所以：

- 正常 private 流程：scope 一致。
- 若 group/room 收到這些 postbacks：可能多人共享／推進同一個 mission，並作用到當前使用者。

本遷移保持 controllers 不變、保持 conversation key，不擅自改 state scope。將此列為既有缺陷與獨立後續項目；contract fixtures 應揭露此行為，不把 native 改成 per-user 當作解法。

另有既有 state 邏輯問題：劍士完成時先設 `null`，隨後又寫回 incremented mission，見 `JobController.js:215,229–233`。本次不混入修復。

---

## 5. Native Redis state store 設計

### 5.1 模組與介面

新增：

```text
app/src/lib/bot/native/state-store.js
```

只提供實際需要的功能：

```text
sourceKey(rawSource)
read(source)
write(source, session)
destroy(source)
runSerial(source, task)
```

使用既有 `app/src/util/redis.js` 的 node-redis client，不新增 ioredis connection，不建立抽象 storage framework。

既有 Redis client：`app/src/util/redis.js:1–15`；依賴版本：`app/package.json:42`。

### 5.2 Key 與 payload

```text
bot:native:v1:line:user:<userId>
bot:native:v1:line:group:<groupId>
bot:native:v1:line:room:<roomId>
```

JSON payload：

```text
{
  version: 1,
  state: <完整 context.state>,
  lastActivity: <epoch milliseconds>
}
```

- source type 明確入 key，但共享邊界與 Bottender相同。
- 不讀、不搬、不 overwrite 舊 `line:*` keys。
- initialState 沿用同一份設定，避免兩引擎 drift。
- session metadata 可由 event 重建，不必持久化舊 Bottender 的完整 profile/member-list 結構。
- `context.session._state` 與 `context.state` 必須指向同一份 working state。
- JSON serialization 維持目前能力：plain objects、arrays、strings、numbers、boolean、null；Date 經 JSON 轉字串，`undefined` property 不保留。
- malformed JSON/version/state shape 不是 cache miss：記錄錯誤並停止該 event，不用空 state 覆寫壞資料。

### 5.3 TTL

每次完成 event persistence：

```text
SET key JSON EX 3600
```

- read 不 refresh。
- 正常 no-op event 仍 write/refresh。
- `_error.js` 正常處理的 handler/reply error 仍 write/refresh。
- Redis read/write failure 不假装成功、不降級成 process-memory state。
- 不另實作 900 秒 state TTL。

### 5.4 Per-source serialization

本次採 **process-local keyed Promise queue**，不新增 distributed-lock package。

每一個 source 的 queue 必須涵蓋完整：

```text
read
→ create context
→ run dialog
→ normal flush 或 error handler
→ serialize/save
→ release queue slot
```

要求：

- 同 webhook 的同 source events 依 body array 順序 enqueue。
- concurrent webhooks 的同 source events 依 server enqueue 順序處理。
- **進入 queue 後才讀 Redis**，不能先 read 再排 handler。
- 不同 source 不互相等待。
- task reject 不污染後續 chain；清除 settled queue entry，避免 Map 永遠成長。
- 不以 `Promise.race(timeout)` 提前釋放仍在執行的 handler，否則舊 handler 仍可能寫入、送訊息，重新產生 overlap。
- 記錄 queue wait、execution duration、pending count，識別 AI request 導致同群 head-of-line blocking。

**部署前提：同一 channel 僅一個 active webhook bot process，切換時不讓舊、新 bot 重疊接收流量。** 這符合目前提供的單 bot 部署資訊，但本次未登入 production 驗證。

加上明確註解：

```text
ponytail: single webhook process; horizontal replicas require a Redis-backed
per-source queue/lock before enabling them.
```

這個 queue 解決單 process 內的 concurrent webhooks，**不宣稱跨 process correctness**。worker 不執行 webhook state handlers；不能把 worker 的存在誤認為需要多 bot replica。

### 5.5 Session invalidation 必須一併遷移

現有外部 coupling：

```text
ConfigRepository.writeConfig()
  → GuildModel.clearLineSession(groupId)
  → redis.del("line:" + groupId)
```

證據：

- `app/src/repositories/princess/guild/ConfigRepository.js:30–32`
- `app/src/model/application/Guild.js:41–43`

PR 2 增加 facade 的 `clearLineSession(groupId)`：

- Bottender engine：維持刪除 `line:<groupId>`。
- Native engine：使用相同 source queue，刪除 native group session key。
- `GuildModel.clearLineSession()` 改為 delegate。
- 不讓 native 還只刪 legacy key。
- invalidation 也要 serialize，避免 event 在刪除後把舊 state 寫回。

目前 caller 是設定 repository，沒有發現 controller 在同一個 state task 內遞迴等待這個 queue；新增測試避免未來造成 self-deadlock。

### 5.6 Failure 與一致性邊界

- signature/body invalid：回 4xx，不 enqueue、不碰 Redis。
- ACK 後 Redis read failure：log、終止 event，不執行業務。
- handler failure：執行既有 `_error.js`；不補做正常 batch flush。
- reply failure：log，不 retry、不 push fallback；error handler 正常返回後 save state。
- save failure：log 高優先級錯誤；不重跑 controller、不重送 reply。
- 無法提供 DB、LINE API、Redis 的跨系統 transaction；LINE 已送成功但 Redis write 失敗仍是可能狀況。
- 200 後 process crash 會遺失未完成的 in-memory event；本次不新增 durable webhook inbox，不能宣稱 exactly-once。
- graceful shutdown 停止接受新 request，等待 pending work；deployment grace period 到期仍可能中斷未完成工作，需觀察並記錄。

---

## 6. Reply batching 與 Context compatibility

### 6.1 Bottender 真實行為

LINE connector 預設：

```text
shouldBatch = true
sendMethod = "reply"
```

證據：`B/line/LineConnector.js:46–54`。

`reply(messages)`：

- 先檢查 `_isReplied`。
- batch 模式：append 到 `_replyMessages`，return `undefined`。
- 非 batch：先設 `_isReplied = true`，再呼叫 client。
- 即使非 batch API reject，flag 也不會還原。

證據：`B/line/LineContext.js:216–224`。

`handlerDidEnd()`：

1. 把 `_shouldBatch` 改為 false。
2. 若有 queued reply 且有 replyToken，送第一組最多 5 則。
3. **這裡沒有把 `_isReplied` 設成 true。**
4. 沒 replyToken 時不送，不自動 push。
5. reply reject 會中止這次 `handlerDidEnd()`，交給 Bot error path。

證據：`B/line/LineContext.js:45–70`。

### 6.2 Native 實作規格

新增 `native/context.js`，提供實際使用的：

- `Context`、`LineContext`
- `client`、`event`、`platform`、`session`、`state`
- `setState()`、`resetState()`、`isSessionWritten`
- `reply()`、`replyText()`、`replyFlex()`、`replyImage()`、`sendText()`
- `getUserProfile()`
- `isReplied`、`handlerDidEnd()` 與最小 error hook

`sendText()` 不能漏掉：`app/src/controller/application/SubscribeController.js:418` 仍有使用。

為保持 controllers 不變，native **保留上述 flag、batch 與 late-reply 語意**，唯一 message-count 差異是：

```text
handlerDidEnd:
  一次 client.reply(replyToken, 全部 queued messages)
  不 chunk、不 slice、不 truncate
```

不要把每個 `await context.replyText()` 解讀成已送達 LINE；batch 階段它只是入 queue。

### 6.3 Late reply 是實際存在的路徑

- `battle.reportFinish()` 沒有 return/await DB Promise，callback 才呼叫 reply：
  `app/src/controller/princess/battle.js:21–27`。
- statistics 背景執行成就通知：
  `app/src/middleware/statistics.js:14–17,68–70`。
- 成就 notifier 使用同一個 context：
  `app/src/service/achievementNotifier.js:45–54`。

因此，不能在 flush 後無條件「關閉 context」而宣稱零行為變更：

- 若 handler 結束時沒 queued reply，late reply 現況會走 immediate path。
- 若先前已 batch reply，因 `_isReplied` 仍 false，late reply 現況可能再次使用 token，然後被 LINE 拒絕。
- native 本次維持此相容性並測試；不新增 push、不在本次重寫背景通知機制。
- late setState 不會有第二次持久化，維持 warning。

### 6.4 Reply helper signatures

| Helper | 輸出 |
|---|---|
| `replyText(text, options)` | `{ type: "text", text, ...options }` |
| `replyFlex(altText, contents, options)` | `{ type: "flex", altText, contents, ...options }` |
| `replyImage(image, options)` | `{ type: "image", originalContentUrl, previewImageUrl: image.previewImageUrl || image.originalContentUrl, ...options }` |
| `reply(messages)` | 原樣保留 message objects |
| `sendText(text, options)` | 在本專案 reply 模式下等同 `replyText()` |

證據：`M/Line.js:3–8,69–72`、`B/line/LineContext.js:225–247,349–357`。

options 是 **message-level**，不是整個 HTTP request-level：

- `sender`：`templates/application/Order.js:48,81,180–187`
- `quoteToken`：`controller/application/JobController.js:138–147`
- `textV2/substitution` 由 `reply()` 原樣傳遞：
  `app/src/app.js:380–400`、`templates/application/Order.js:39–46`
- `quickReply` 在 `app/src` 查無目前 caller，但既有 helper 的 options passthrough 已支援；native 不篩掉此欄位。

---

## 7. LineEvent compatibility

將最小 `LineEvent` 放在 `native/context.js`，不另造跨平台 event framework。

| Getter/property | 必須重現的語意 | 原始碼 |
|---|---|---|
| `_rawEvent`、`rawEvent` | 同一個可變 raw object；`rawEvent` getter 不複製 | `B/line/LineEvent.js:8–14` |
| `timestamp` | 直接讀 raw timestamp | `:15–17` |
| `destination` | constructor options destination，缺少時 `null` | `:18–20` |
| `replyToken` | raw object 有此 property 就回其值，否則 `null` | `:21–23` |
| `source` | `raw.source || null` | `:24–26` |
| `message` | `raw.message || null` | `:30–32` |
| `isMessage` | `raw.type === "message"` | `:27–29` |
| `isText` | `isMessage && message.type === "text"` | `:33–35` |
| `text` | text event 才回 `message.text`，否則 `null` | `:36–41` |
| `isPostback`、`postback` | type 判斷；`raw.postback || null` | `:123–128` |
| `isPayload`、`payload` | `isPayload === isPostback`；payload 是 `postback.data` 字串，**不自動 JSON.parse** | `:129–137` |
| `isFollow/isUnfollow/isJoin/isLeave` | raw type exact equality | `:87–122` |
| `follow/unfollow/join/leave` | 對應 event 回 source，否則 `null` | `:90–122` |
| `isMemberJoined/isMemberLeft` | raw type exact equality | `:174–182` |
| `memberJoined/memberLeft` | `raw.joined || null`／`raw.left || null` | `:177–184` |

保留 message 原始欄位，例如 `mention`、`quotedMessageId`、`quoteToken`，不要做 schema projection 導致新欄位消失。

必測 mutation：

- `profile` 替換 `_rawEvent.source`：`middleware/profile.js:100,108`
- `statistics` 加入 profile/group fields：`middleware/statistics.js:80–97`
- `alias` 修改 `_rawEvent.message.text`：`middleware/alias.js:19–27`
- 下一個 router 必須看到修改後的 text/source。

Bottender 會先 deep-camelcase body，見 `B/bot/Bot.js:114`；正式 LINE payload 已使用 camelCase。Native 對正式 LINE 欄位原樣保留，不引入轉 snake_case 的步驟；不把目前未使用的任意 snake_case input normalization 擴張成相容 API。

另保留 legacy verify-event filtering：

- replyToken 全 0 或全 `f` 的 events 不進 App。
- 混合 webhook 只略過 verify events。
- `events: []` 回 200，不碰 state。

證據：`B/line/LineConnector.js:59–69,197–202`。

---

## 8. Router、chain、withProps

新增 `native/router.js`，實作 repo 使用的語意，而非 Express middleware 模型。

### 8.1 `router(routes)`

- 依序 `await predicate(context)`。
- 第一個 truthy match 就停止搜尋。
- 若 match 是 object，merge 成 `{ ...props, ...match }`。
- 回傳 bound action，不立即自行跑完整 dialog。
- 沒 match 回 `props.next`。

證據：`B/router/index.js:28–40`。

### 8.2 `route(pattern, action)`

- `pattern === "*"`：always true。
- 其他 pattern 視為 predicate。
- 不將任意 string 解讀成 regex。

證據：`B/router/index.js:43–54`。

### 8.3 `text(pattern, action)`

| Pattern | 語意 |
|---|---|
| string | 與 `context.event.text` 完全相等，case-sensitive，不 trim、不 substring |
| `"*"` | 只 match `event.isText` |
| RegExp | 使用原 regex instance 的 `exec(event.text)`；成功回 `{ match }` |
| array | `pattern.includes(event.text)`，不是「每個元素遞迴 matcher」 |
| 其他 | 永不 match |

證據：`B/router/index.js:56–91`。

重要邊界：

- regex match array 包含 numeric captures、`index`、`input`、named `groups`。
- repo 確實解構 `match.groups`：`GroupConfig.js:18–22`、`battle.js:45–48`。
- Bottender regex branch 沒先檢查 `isText`，因此 `exec(null)` 的 JS coercion 也屬可觀察行為。
- `/g`、`/y` regex 的 `lastIndex` 不會被重設；native 不偷偷改成 `.test()` 或 clone regex。

### 8.4 `line.*`

實作 repo 使用的：

```text
line.follow
line.unfollow
line.join
line.leave
line.memberJoined
line.memberLeft
```

條件都是 `context.platform === "line" && event.isX`。

證據：`B/line/routes.js:12–35`；使用點：`app/src/controller/lineEvent.js:10–19`。

可保留便宜的 `line`／`line.any` 與 `line.message`，不實作未使用的跨平台或 beacon/things routing framework。

### 8.5 `chain()`、`next`、dialog driver

Bottender `chain()` 將 actions 由後往前 bind：

- 每個 action 收 `(context, props)`。
- 除最後一個外，props 中 `next` 是下一個 bound action。
- middleware `return next` 表示繼續。
- `return undefined/null/非 function` 表示停止。
- `chain()` 本身回第一個 action，不是 runner。

證據：`B/chain.js:3–24`。

Native `run(action, context, props)` 重現：

```text
result = await action(context, props)
while result is function:
  result = await result(context, {})
return result
```

證據：`B/bot/Bot.js:33–46`。

不得改成「沒呼叫 next 就自動繼續」，也不能把 `next` 改為 Express callback。

### 8.6 `withProps()`

- shallow-freeze 傳入的 props object。
- 預先綁定 action 第二個參數。
- 不與 caller props 自動 merge。
- 保留 action name。

證據：`B/withProps.js:7–13`。

### 8.7 `timing.wrapChain()`

現有 `wrapChain()` 已自行跑上述 dialog loop，以便 finally 真正量到整條 chain：

- `app/src/middleware/timing.js:95–110`
- `app/src/app.js:418–439`

Native 的 outer runner 與它可以共存：outer runner 執行 wrapper；wrapper 跑完整 chain 後回 terminal value，不會重跑。

必須同時測：

- timing enabled：wrapper 自己 drive。
- timing disabled 且 queryProfiler disabled：outer native runner drive。
- action 不重複、`next` 不遺失、timing 不提早結束。

---

## 9. LINE client adapter 與 SDK v11 mapping

新增 `native/client.js`。

選定使用官方 generated clients：

- `messagingApi.MessagingApiClient`
- `messagingApi.MessagingApiBlobClient`

採 CommonJS `require("@line/bot-sdk")`。不依賴舊版 deprecated `Client`。

`LineBotClient` 屬官方 SDK 高階入口的候選 export，但本方案不需要第三個 client wrapper：現有 `getClient("line")` 本來就必須回 compatibility object，直接包兩個 generated clients 最薄。安裝 v11 後需核對 exports，不以名稱猜測 `.messagingApi` 等物件層級。

`getClient("line")` 回 process-local singleton；未知 channel 直接 throw。不要在 native client 初始化時 import server、state store 或整個 App，避免 module cycle 和 worker 啟動 HTTP server。

### 9.1 實際 method inventory 與 mapping

| 對外相容 method | SDK 呼叫／回傳規格 | repo 使用證據 |
|---|---|---|
| `getUserProfile(userId)` | `api.getProfile(userId)`；回 profile；HTTP 404 轉 `null` | `handler/Profile/index.js:63–68`；`util/line.js:42`；`service/achievementNotifier.js:23`；`service/chatXp/pipeline.js:45`；`service/PrestigeService.js:49`；`controller/application/AchievementController.js:95`；`model/princess/gacha/index.js:170` |
| `getProfile(userId)` | alias 到相容 `getUserProfile()` | `controller/application/MarketController.js:67–75` |
| `getGroupMemberProfile(groupId,userId)` | `api.getGroupMemberProfile(groupId,userId)`；回 profile object，error reject | `util/line.js:38,59`；`controller/lineEvent.js:30`；`controller/application/GroupRecord.js:13`；`MarketController.js:72`；`WorldBossController.js:39`；`ChatLevelController.js:127,406`；`JankenController.js:173,272–273,429,455–456`；`PrestigeService.js:46`；`chatXp/pipeline.js:40` |
| `getRoomMemberProfile(roomId,userId)` | `api.getRoomMemberProfile(roomId,userId)` | `util/line.js:40`；`MarketController.js:70` |
| `getGroupSummary(groupId)` | `api.getGroupSummary(groupId)`；回 `{groupId,groupName,pictureUrl?}` | `controller/application/ChatLevelController.js:500` |
| `getGroupCount(groupId)` | `api.getGroupMemberCount(groupId)`；保留 `{count}` object | 現況其實是 `util/line.js:21–31` 的 Axios helper，不是舊 client method |
| `getMessageContent(messageId)` | `blob.getMessageContent(messageId)`；完整收集 stream 後回 `Buffer` | `controller/application/ImageController.js:21–22` |
| `reply(replyToken,messages)` | `api.replyMessage({ replyToken, messages })`；Promise resolve API response，reject 保持失敗 | `util/broadcastQueue.js:156`；Context flush |
| `replyMessage(request)` | adapter 的 object-form forwarding，供 `reply()` delegate 與 timing instrumentation | 現有 timing patch：`middleware/timing.js:144–164` |

worker 路徑不是直接 push：

- `bin/BroadcastQueueDrainer.js:13,35–39`
- `bin/EventDequeue.js:12,79–85`
- 最終都呼叫 `broadcastQueue.drain()` → `lineClient.reply()`。

**`pushMessage/multicast/broadcast` 在目前相關 tests 有禁止呼叫 assertions，不等於 production caller。** 本方案不因 mocks 出現這些 method 就新增推播功能。

### 9.2 Shape 與錯誤相容性

舊 client：

- JSON API 回 `res.data`，不是 Axios response。
- profile fields 本來就是 `userId/displayName/pictureUrl/statusMessage`。
- `getUserProfile()` 特別將 404 轉 `null`。
- group/room profile 不做同樣 404 swallowing。
- `getMessageContent()` 使用 `arraybuffer`。
- `getGroupMembersCount()` 回的是 number，而非 `{count}`。

證據：`M/LineClient.js:1155–1167,1198–1207,1229–1257,1278–1299`。

Native 規格：

- 不做 camelCase → snake_case transformation。
- profile/group/count 呼叫回 decoded body，不回 transport response wrapper。
- SDK error 以實際 v11 HTTP error status 判斷；只在 `getUserProfile/getProfile` 的 404 做 `null` adaptation。
- 不把所有 errors 吞成 `null`。
- stream conversion 必須處理 chunk aggregation、空內容、stream error；不能 `Buffer.from(stream)`。
- 使用 Node stdlib，例如 `node:stream/consumers` 的 buffer collector；安裝後依 SDK 實際 stream type 確認。
- 不新增 automatic reply retry，避免 token 重用。
- error logging 不直接 dump SDK request headers，防止 access token 進 log。

### 9.3 `getProfile()` 是既有不一致

`MarketController` 呼叫 `lineClient.getProfile()`，但本機 `M/LineClient.js` 查無此 method；只有 `getUserProfile()`。

因此：

- PR 1 不「順手」修，維持 facade 原封不動。
- PR 2 native 提供 alias，controllers 不用改。
- contract suite 將它列為 **native extension／舊版已知缺口**，不製造假的 Bottender parity。

### 9.4 `util/line.js`

PR 2 保留其現有 cache keys、TTL、return shape，只把 summary/count 的 Axios transport 換成 adapter：

- `getGroupSummary()` cache TTL 60 秒不變。
- `getGroupCount()` cache TTL 60 秒、`{count}` 不變。
- 移除僅供這兩個 GET 的 token、base URL 與 `doGet()`。

證據：`app/src/util/line.js:1–31,93–100`。

不把 cache 搬進 SDK adapter，避免 worker/controllers 的 cache policy 被意外統一。

### 9.5 Context profile dispatch

`context.getUserProfile()` 依 source/session type dispatch：

- user → `getUserProfile(userId)`
- group → `getGroupMemberProfile(groupId,userId)`
- room → `getRoomMemberProfile(roomId,userId)`
- 沒 user → `null`

證據：`B/line/LineContext.js:96–115`。

保留既有 middleware timeout/cache，不重做：

- `app/src/middleware/profile.js:34–75`

Bottender 隱藏的 `getAllGroupMemberIds/getAllRoomMemberIds` 位於 `B/line/LineConnector.js:120–158`；repo 查無依賴 `context.session.group.members/room.members` 的 caller。Native 不為未使用 metadata 重現每 event API 查詢。

---

## 10. Server wiring、raw body 與 Socket.IO

### 10.1 現況

`app/server.js`：

- `bottender()` 與 `prepare()`：`:33–42`
- global `express.json({verify, limit:"3mb"})`：`:43–50`
- API/static mounts：`:52–55`
- catch-all Bottender handler：`:58–60`
- 使用 shared `http.listen()`：`:62–65`

`app/src/util/connection.js:1–5,20–24` 建立同一個 Express + HTTP + Socket.IO server。

### 10.2 Native mount 順序

Native 分支：

```text
existing shared Express server
  1. POST /webhooks/line
       line.middleware({channelSecret})
       minimal envelope/source validation
       respond 200
       schedule event processing
  2. webhook-specific error handler
  3. existing express.json / express.urlencoded for API
  4. /bot-assets
  5. /api + existing limiter/auth
  6. ordinary 404
existing shared http.listen(port)
```

關鍵：

- 官方 `line.middleware()` **必須先取得未被 global JSON parser 消費的 body**。
- 不先 `express.json()` 再 `JSON.stringify(req.body)` 驗簽。
- 不讓 `express.raw()` 先消費 stream，再假設 SDK middleware 還能自行讀取。
- signature validation 必須在 ACK 前。
- 合法 webhook 先 `res.status(200).end()`；利用 `setImmediate` 排入 async processor，並對 Promise rejection 做集中 logging。
- 200 前不查 Redis、不查 profile、不執行 App。
- malformed envelope/source 在信任邊界拒絕，未知但合法 LINE event type 則保持可進正常 routing。
- 不另開 HTTP port，不重建 Socket.IO instance。
- 不改 API auth、CORS、reverse-proxy prefixes。

Bottender 分支保留原本 parser/rawBody/catch-all wiring，避免 native rollback 時改壞舊驗簽路徑。

### 10.3 Engine selection

`BOT_ENGINE`：

- 未設定／`bottender` → legacy。
- `native` → native。
- 其他值 → boot error，不默默 fallback。

在 module load 時只選一次，不支援 process 內 hot switch。切換需要 restart/recreate bot、worker，使所有 `getClient()` consumers 使用一致 engine。

Native boot 從 `app/index.js` 載入 entry，以保留 `PROJECT_PATH`：

- `app/index.js:1–3`
- `app/src/index.js:1–2`

沿用 `_error.js`，不另外複製 error handler。

---

## 11. 檔案設計與依賴方向

```text
app/src/lib/bot/
  index.js                 # facade / 一次性 engine selection
  native/
    index.js               # native exports
    router.js              # router/route/text/line/chain/withProps/run
    context.js             # Context/LineContext/LineEvent
    client.js              # official SDK adapters + singleton
    state-store.js         # Redis JSON + TTL + keyed queue
    server.js              # mount webhook + event lifecycle + drain
```

依賴：

```text
controllers / services / worker / templates
                  ↓
              bot facade
         ┌────────┴────────┐
     Bottender           native
                           ├─ router/context
                           ├─ client → official SDK
                           └─ server → state-store → existing Redis
```

- `native/client.js` 不依賴 App/server/state。
- `native/server.js` 接受 entry、error handler、client、store，便於 contract tests 注入。
- 不在 production API 加一套 engine factory framework；test harness 自己建立兩種 engine。
- 不修改 controller function bodies，除已核可的 dead Telegram branches；額外 compatibility 修正留在 adapter、model invalidation boundary、server wiring。

---

## 12. Contract test 計畫

### 12.1 避開 global mocks

現況：

- `app/jest.config.js:5–6` 套用全域 setup。
- `app/__tests__/setup.js:129–157` 把 Bottender、router、chain、withProps mock 掉。
- `timing.test.js` 特別使用真實 chain：
  `app/src/middleware/__tests__/timing.test.js:1–3`。
- 多個 SubscribeController tests 特別 unmock router。

**不能在這種 mock 下宣稱引擎相容。**

新增：

```text
app/jest.bot-contract.config.js
app/test/bot-contract/
  harness.js
  router-context.test.js
  lifecycle-state.test.js
  client-webhook.test.js
```

採獨立 config：

- `setupFiles: []`
- 不載入 `app/__tests__/setup.js`
- 只 mock SDK transport、Redis adapter、必要業務外部依賴
- 不 mock 被測的 router、chain、Context、LineEvent

一般 Jest config 排除這個目錄，避免 suite 被 global mocks 再跑一次；新增 `test:bot-contract` script。

### 12.2 同一 contract 跑兩個 engines

Harness 介面：

```text
createHarness(engine, initialState)
dispatch(webhookBody)
drain()
readPersistedState(source)
recordedReplies()
close()
```

Bottender harness：

- 直接使用已安裝的真實 `Bot/LineConnector/LineContext/LineEvent`。
- 注入 fake legacy LINE client。
- session store 讀寫需 JSON clone，模擬 Redis，不共用 object reference。
- 保留 production `sync:false`，harness 追蹤 persistence 完成；不可把 HTTP handler resolve 當成 state 已寫完。

Native harness：

- 相同 event fixtures、初始 state、client recording sink。
- 使用真 native router/context/lifecycle。
- 官方 SDK transport 換成 fake generated client methods。

共同測試使用 `describe.each(["bottender","native"])`。另有 explicit difference cases，不能把預期不同的結果 normalize 掉。

### 12.3 必測案例

#### A. State 與 scope

1. user/group/room session key derivation。
2. 同群不同 user 共用 state；不同群隔離；同 user private 與群組隔離。
3. 新 session nested defaults 不共享 reference。
4. 既有 state 不補新 initialState keys。
5. `setState()` shallow replace、保留其他 top-level keys。
6. `resetState()` 刪除 `sender/isAdmin/changeJobMission` 等非初始 keys。
7. nested direct mutation 可持久化。
8. `userDatas` 兩個 user 的連續新增都保留。
9. `sentCoolDown.CusInsert/CusDelete` 共享範圍。
10. Job private flow 與 group postback 的既有 scope mismatch characterization。
11. read 不續 TTL、write 續 3,600 秒，沒有 900 秒 state expiry。
12. invalidation 使用 active engine namespace。

#### B. Concurrency 與 failures

使用 deferred barriers，不依賴隨機 sleep：

- Bottender 同 source snapshot overwrite 的 characterization。
- Native 同 webhook 同 source FIFO、第二個 event 讀到第一個新 state。
- Native concurrent webhooks 同 source FIFO。
- 不同 source 可平行。
- rejected task 後下一個仍執行。
- Redis read failure 不跑 controller。
- corrupt JSON 不被空 state 覆寫。
- reply reject → `_error` → state write。
- handler throw 不正常 flush。
- error handler throw 不 save 該 event。
- save failure 不 replay DB/LINE operations。
- invalidation 與 active event 不會互相 resurrect session。
- queue Map 能清理，shutdown 能 drain。

#### C. Routing/dialog

- exact string、case sensitivity、array、wildcard、no-match。
- regex positional/named groups、lastIndex、non-text coercion。
- async predicate、object-derived props precedence。
- `return next`、`return withProps(...)`、nested router。
- early stop。
- frozen props。
- timing enabled/disabled，各 action 恰執行一次。

#### D. Event/Reply

- rawEvent/source/message reference identity 與 mutation。
- payload 保持字串。
- follow/unfollow/join/leave/member events。
- missing replyToken、empty webhook、legacy verify token。
- 1、5 則 batch 順序相同。
- 6 則：Bottender API payload 5 則；native API payload 6 則且只有一次呼叫。
- native 6 則被 API reject 時無 retry、無 push。
- sender、quoteToken、quickReply、image preview fallback、textV2 保留。
- batch enqueue return value、`isReplied`、late reply、非 batch reject 後 flag。

#### E. Client/HTTP

- profile user/group/room dispatch。
- profile 404/null 與其他 status rejection。
- `getProfile` native alias；legacy 缺口單獨標示。
- summary/count object shape。
- blob stream 多 chunks → Buffer；stream failure。
- worker `reply()` adapter 不產生 push。
- valid signature、invalid signature、missing signature、malformed JSON。
- response 200 可在 handler 被 barrier 卡住時取得。
- response 後的 error 不造成 unhandled rejection。
- API JSON parsing 與 Socket.IO shared server 不受影響。

### 12.4 Redis integration check

另以 opt-in integration test 接本機 Redis，僅使用 test prefix 並清除自己建立的 keys：

- 實際 JSON round-trip。
- Redis `TTL` 約 3,600 秒。
- read 不 refresh，write refresh。
- namespace isolation、destroy。
- 不使用 `FLUSHDB`，不掃除 application keys。

---

## 13. PR 拆分、順序與 acceptance

### PR 1：Facade/import-only + dead Telegram cleanup

**檔案**

新增：

- `app/src/lib/bot/index.js`

機械式修改：

- `app/src/app.js`
- `app/src/controller/lineEvent.js`
- `app/src/controller/application/` 下所有 Bottender import consumers
- `app/src/controller/princess/{battle.js,character.js,GodStoneShop/router.js}`
- `app/src/handler/Profile/index.js`
- `app/src/model/princess/gacha/index.js`
- `app/src/service/{achievementNotifier.js,PrestigeService.js,chatXp/pipeline.js}`
- `app/src/util/line.js`
- `app/bin/{BroadcastQueueDrainer.js,EventDequeue.js}`
- `app/server.js`
- 相關 tests、global mocks、JSDoc imports

Facade re-export 核可的八個 symbols：

```text
chain, withProps, getClient, Context, router, route, text, line
```

repository 現況還需要 `server.js` 的 `bottender`，以及部分 JSDoc/test 的 `LineContext`；加上過渡 re-export，避免「全部 imports 已切 facade」卻漏掉 server。

**本 PR 不 memoize `getClient()`、不新增 engine switch、不改 TTL/reply/server wiring。**

Telegram cleanup：

- 移除 `app.js:410–414` branch。
- 移除 `CustomerOrder.js:170–171` branch。
- 移除 `Order.js:164–165,190–192` branches。
- 移除 `templates/princess/gacha/index.js:3` export 與空 `telegram.js`。
- `templates/application/CustomerOrder/index.js:2` 的 console export 目前共用 Telegram 檔案，不能直接刪掉而留下 broken require：將共用文字模板移至 `console.js`，保留 console export，刪 Telegram export/file。
- 移除 disabled Telegram channel block；不擴張清理其他平台。

Tests mock 更新：

- global mock 改 target facade。
- 原本 unmock `bottender/router` 的 tests 改用 facade partial mock：保留真 router symbols，同時保留 fake `getClient`。
- 合併目前同一 test 對 bottender 與 router 的兩份 mock，避免 replacement 後同 path mock 互相覆蓋。

**Acceptance**

- runtime imports 除 facade 外不再直接 require Bottender。
- facade export 與原 package function/class identity 相同。
- controllers 業務 bodies 無變更，除 Telegram 刪除。
- LINE messages、state、API wiring 無新行為差異。
- test/lint 待執行通過。

**Rollback**：revert PR 1；不涉及 Redis/schema migration。

### PR 2：Native implementation，預設仍 Bottender

**檔案**

- 新增 `native/` 上述六個檔案。
- 修改 facade、`app/server.js`。
- 修改 `app/src/util/line.js` transport。
- 修改 `app/src/model/application/Guild.js` invalidation delegate。
- `app/bottender.config.js` 移除／註記無效 `session.state`。
- `app/package.json` 加官方 SDK v11、backend `engines.node >=22`。
- 更新 **`app/yarn.lock`**。
- `.env.example` 加 `BOT_ENGINE=bottender`。
- 加最小 component tests 與 lifecycle tests。

Root 已宣告 Node `>=22`：`package.json:5–7`；實際 backend install script 使用 `yarn --cwd app install`：`package.json:14`。Production Docker 也直接複製 `app/yarn.lock`：`app/Dockerfile:8–12`。因此不能只更新 root lockfile。

本次不任意改 Docker Node major；目前使用 floating `node:lts`，需在 acceptance 記錄實際 Node version，確認 build/runtime 相容且 ≥22。

**Acceptance**

- `BOT_ENGINE` unset 時仍走 Bottender。
- native branch 不載入 Bottender runtime。
- worker 只取得 singleton client，不啟動 webhook/state connection。
- state/queue/error 行為符合第 5 節。
- SDK v11 exports、stream/error type 已由實際套件 source/type 與測試補證。
- controller bodies 不因 SDK API 變更而修改。

**Rollback**：保持／改回 `BOT_ENGINE=bottender`，restart；不刪 native keys。

### PR 3：Dual-engine contract gate

**檔案**

- `app/jest.bot-contract.config.js`
- `app/test/bot-contract/*`
- `app/jest.config.js`
- `app/package.json`
- 既有 tests 的必要相容更新
- rollout/checklist 文件，例如 `docs/plans/bottender-native-rollout.md`

**Acceptance**

- 同一 shared contract 明確跑兩個 engines。
- 差異案例有獨立 expectations，不被 hidden normalization 掩蓋。
- global mocks 不參與 contract suite。
- Native Redis integration check、本機 LINE smoke checks 有可重跑步驟。
- 當前 `.github/workflows/main.yml:17–42` 是 build/push，不應把 image build success 說成 tests 通過；在 rollout checklist 記錄實際 test/lint 結果。

**Rollback**：不切 production env；修正 tests／implementation，不需要資料回復。

### Step 4：Production env cutover

不是再改 controllers，也不必用 PR 偷改 default：

1. 記錄目前 image SHA、Node version、engine。
2. 確認只有一個 active webhook bot process。
3. 確認目前 image 包含兩個 engines。
4. 在核可的維護操作中，將 bot 與 worker 設為 `BOT_ENGINE=native`。
5. restart/recreate，避免舊／新 bot 同時處理 webhook。
6. 確認 startup log 顯示 native，執行指定 smoke checks。
7. 觀察至少一個完整的 session TTL window 與 worker drain cycle。

production compose 在 repo 外；本計畫不修改 stale `docker-compose.traefik.yml` 當作 deployment。

**Rollback**

- 將 bot、worker 改回 `BOT_ENGINE=bottender` 並 restart/recreate。
- 不雙寫 state，不從 native JSON 轉回 Bottender JSON。
- 回退時 legacy session 可能仍存在或已自然過期；**env rollback 恢復的是 engine，不保證恢復切換期間的 transient state 進度**。
- 不 `FLUSHDB`，不刪所有 `line:*`。
- 若需強制所有 legacy sessions reset，必須另列明確資料清除範圍並核可，非本次預設動作。

### 後續 PR：移除 Bottender

只在 rollback window 結束、明確核可後：

- 刪 legacy engine selection、Bottender dependency 與不再需要的 transitive packages。
- 移除 transitional `bottender` export。
- config 改名為中性 `bot.config.js` 並更新引用。
- 合併 contract suite 為 native regression tests，保留所有已記錄的相容 fixtures。
- 調整 `debug` script 與文件。
- 不在 PR 1／2 提早移除 rollback path。

---

## 14. 可平行工作 lanes

PR 1 合併、介面確認後，可以並行：

| Lane | 負責範圍 | 可獨立驗收 | 依賴 |
|---|---|---|---|
| A：State | `state-store.js`、TTL、serialization、queue、invalidation tests | fake Redis + local Redis integration | key/payload 介面確定 |
| B：Execution | `router.js`、`context.js`、LineEvent、reply batching | 純函式／fake client contracts | 不依赖 HTTP 或真 Redis |
| C：SDK | `client.js`、`util/line.js` transport、SDK shape tests | generated-client stubs、stream fixtures | v11 dependency lock |
| D：Integration | `native/server.js`、facade switch、server wiring、dual harness | signature/ACK/lifecycle tests | A/B/C exported interfaces |

共享檔案由單一整合者處理：

- `app/package.json`、`app/yarn.lock`
- facade `index.js`
- `app/server.js`
- Jest configs/global mocks

避免各 lane 同時修改 dependencies 或 facade exports。

---

## 15. 驗證 commands 與 observable checks

以下是**實作者後續應執行**的 commands，本次未執行。

### 每個 PR

在 `app/`：

```bash
node --version
yarn test --runInBand
yarn lint
```

等價於 repository root：

```bash
yarn --cwd app test --runInBand
yarn --cwd app lint
```

PR 3 後：

```bash
yarn --cwd app test:bot-contract --runInBand
```

分別確認 app-level imports 在兩個 engine 下：

```bash
BOT_ENGINE=bottender yarn --cwd app test --runInBand
BOT_ENGINE=native yarn --cwd app test --runInBand
```

注意：一般 suite 因使用 facade mocks，不足以證明 SDK/runtime 相容；核心 gate 仍是獨立 contract suite。

### 本機 LINE

Repository root：

```bash
make infra
make cf-go
```

在 `app/` 分別啟動，**一次只跑一個 engine**：

```bash
BOT_ENGINE=bottender yarn dev
```

或：

```bash
BOT_ENGINE=native yarn dev
```

`tunnel` 更新後 restart bot，讓 `APP_DOMAIN` 生效。`make cf-go` 會改 LINE webhook/LIFF 設定，應在核可的本機測試時段執行。

### Observable acceptance checklist

- [ ] 同一套指令在兩個 engines 回覆 JSON 一致，超過 5 則例外明確記錄。
- [ ] private mission 能跨多個 webhook 延續。
- [ ] 同群 A/B users 的 `userDatas` 不互相覆蓋。
- [ ] 群組 cooldown 仍是共享；另一群不受影響。
- [ ] `/resetstate` 清除整份 conversation state，且不留動態 keys。
- [ ] 群組設定更新後立即反映，session invalidation 使用正確 namespace。
- [ ] LINE invalid signature 不進 App、不接觸 state。
- [ ] handler 被刻意卡住時，HTTP 200 已可觀察到。
- [ ] 6 則 reply 僅發一次 request，payload 有 6 則；LINE error 有記錄，沒有 push 或重送。
- [ ] quote image upload 拿到 Buffer，upload path 正常。
- [ ] alias 修改 text 後，router match 正確。
- [ ] follow/join/member events 不因缺少 userId 而破壞 context 建立。
- [ ] Socket.IO `/admin/messages` 仍收到原有 enriched event。
- [ ] API JSON routes/auth 不受 webhook raw-body ordering 影響。
- [ ] broadcast drainer 維持 reply-token queue，不增加 LINE Push。
- [ ] native `getClient()` 重複呼叫不增加 Redis session connections。
- [ ] queue wait、state errors、reply errors 有可辨識 log，不輸出 tokens/完整 private state。
- [ ] rollback 至 Bottender 可啟動、驗簽、回覆，並清楚標註 transient state 不同步。

---

## 16. 主要風險與剩餘不確定性

1. **State scope 誤改是最高風險。** 群組必須共用 session；Job postback scope mismatch 是既有缺陷，不可用全面 per-user 化解決。
2. **`session.state:15` 是無效設定。** 若依文件錯誤描述實作 15 分鐘 TTL，會新增未核可行為。
3. **未 await 的 late replies 真實存在。** 單純「flush 後禁止 reply」會破壞現有 battle path；本次保留並測試。
4. **同 source serialization 會增加排隊延遲。** 尤其 Gemini path，必須觀察 queue wait 與 reply-token failure；不以提前 unlock 換取表面吞吐量。
5. **Process-local queue 有明確部署上限。** 多 replica 或 overlapping deployment 前，必須先升級跨 process serialization；本次不宣稱已處理。
6. **ACK-first 不等於 durable delivery。** Process crash、Redis failure 可能在 200 後遺失 event；本次不增加 inbox/replay framework。
7. **SDK v11 尚未在本機安裝。** exports、blob stream、HTTP error status 的最終 source 證據與 contract 執行结果，是 PR 2/3 合併前必要補件。
8. **一般測試的 mocks 可能掩蓋缺口。** `getProfile()` 已是例子；必須有不載 global setup 的 real-engine suite。
9. **production 實際 topology 未核對。** 單 bot process、Node version、bot/worker env 一致性要在切換前確認，不能以 repo 文件代替 runtime 證據。

---

## Sources

本文件主要依據本機 source，完整 `file:line` 已列於各節：

- `app/node_modules/bottender/dist/{bot,context,line,router,session,cache,shared,server}/`
- `app/node_modules/messaging-api-line/dist/{Line.js,LineClient.js}`
- `app/bottender.config.js`
- `app/server.js`
- `app/src/`、`app/bin/` 的實際 callers
- `app/__tests__/setup.js`、`app/jest.config.js`
- `app/package.json`、`package.json`、`app/Dockerfile`

外部搜尋未成功取得結果，因此未列未讀取的 SDK 網頁作為已驗證來源。
