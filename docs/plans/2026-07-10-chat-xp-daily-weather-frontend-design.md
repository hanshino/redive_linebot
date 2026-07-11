# 說話 XP 每日奇異天氣：前端 & Flex Follow-up 設計

> Follow-up to `2026-07-09-chat-xp-daily-weather-design.md`（後端 + 唯讀 API 已隨 PR #755 上線，flags off）。
> 這份補完當初刻意延後的「前端 follow-up plan」＋將 bot 回應升級為 Flex。
> UI 已出 mockup 並定稿（`scratchpad/weather-mockup.html`）。

## 0. Scope

四塊，全做：

- **A. 後端** — `XpHistoryService` 讓 XP 歷程 API 吐出天氣資料（每日 + 逐筆）。
- **B. Flex** — `#今天天氣` 從純文字改成 Flex 卡，減益日附「前往購買防護」LIFF 按鈕。
- **C. LIFF 今日天氣卡** — 經驗歷程頁頂新元件，含購買動線。
- **D. XP 歷程天氣標記** — 每日趨勢徽章 + 逐筆事件 chip。

對應 parent design §11.1（bot command）、§11.2（購買只走 LIFF）、§12（XP history）。

不新增路由、不新增 npm 依賴。

## 1. 後端（`app/src/service/XpHistoryService.js`）

### 1.1 `shapeEvent` — 多吐 `weather_protected`

- `ChatExpEvent.findInRange` 是 `SELECT *`，`weather_protected` 欄位本來就撈得到 → 只要在 `shapeEvent` 回傳物件加一個 `weather_protected: Boolean(row.weather_protected)`。
- 事件的天氣名稱／類別／效果／防護道具名已在 `modifiers.weather`（pipeline 已寫入），前端逐筆 chip 直接讀 `event.modifiers.weather` + `event.weather_protected`。**不需要**改 pipeline。

### 1.2 `buildDaily` — join 天氣 + 當日防護

現況只查 `chat_exp_daily`。改為：

- `LEFT JOIN chat_daily_weather` on `date`（全服共用，一天一列）。
- `LEFT JOIN user_weather_protections` on `user_id + weather_date = date`（判斷該玩家當日是否買了防護）。

每個 `day` 物件新增：

```js
weather: row.weather_key
  ? { key: row.weather_key, name, category, effects: <parsed> }
  : null,
weather_protected: Boolean(<有防護列 && category === "debuff">),
```

舊日期（沒有 `chat_daily_weather` 列）→ `weather: null`，前端不渲染徽章。

## 2. Flex 卡（`#今天天氣`）

- 新 template：`app/src/templates/application/Weather.js`，`generateWeatherBubble(status)` → `{ type: "bubble", ... }`。`status` = `WeatherService.getTodayStatus(userId)`。
- `WeatherController.showToday`：改為 `context.replyFlex("今日天氣", bubble)`；`enabled=false` 時仍回純文字「今日天氣觀測暫停」。
- 三段結構（mockup 定稿）：
  1. Hero band：`今日天氣` + 日期，底色依 category（減益暖橘 / 增益薄荷）。
  2. Body：天氣名 → flavor → 效果（`describeEffects` 產生的人話 + 百分比）。
  3. 減益日：防護道具名 + cost + 狀態（已防護／尚未防護＋女神石餘額）；footer 一顆按鈕。
- 按鈕（`templates/common` 的 `getLiffUri`）：
  - 減益未防護 → 「前往購買防護」→ LIFF XP 歷程頁（購買一律走 LIFF）。
  - 其他 → 「查看經驗歷程」ghost 按鈕（同連結）。

## 3. LIFF 今日天氣卡（`frontend/src/pages/XpHistory/TodayWeather.jsx`）

- 放 `XpHistory/index.jsx` 頁頂（Tabs 之上，兩 tab 都看得到）。
- **自持** fetch + 購買 mutation（不拉到父層）：
  - mount 時 `api.get("/api/me/chat-weather/today")`。
  - 回傳 `weather === null`（flag off 或觀測暫停）→ 不渲染，不佔版面。
- **API `weather` 是 DB 原始欄位**（重要，非 design doc 理想化的 `key`）：
  ```
  { date, weather_key, category, name, flavor_text,
    effects:{...}, protection_type, protection_name, protection_cost }
  ```
  另有 `protection`（`user_weather_protections` 列或 null）、`god_stone_balance`（number）。
- 狀態：
  - 增益 → 天氣名 + flavor + 效果 chip，無購買。
  - 減益未防護 → 效果 chip + 防護列（道具名/cost）+「購買防護」鈕 + 女神石餘額。
  - 減益已防護 → 效果 chip 加刪除線 + 「已抵銷 · <道具>」protect chip。
- 購買動線：點鈕 → MUI confirm dialog（顯示 cost + 道具 + 「僅對購買後發言生效」）→ `api.post("/api/me/chat-weather/protection/purchase")` → 成功就地 refetch。
- 錯誤碼（400 + `code`）對應人話 toast/inline：`INSUFFICIENT_STONE`→女神石不足、`ALREADY_PROTECTED`→已防護（refetch）、`NO_PROTECTION`/`DISABLED`→不顯示按鈕。

## 4. XP 歷程天氣標記

- `DailyTrend.jsx`：長條下方加天氣徽章（天氣名 + 效果簡寫，如 `魔力順風 · 最終 +10%`）；`day.weather_protected` 時加「已防護」標記。`day.weather === null` → 不加。
- `EventList.jsx`：每則事件加天氣 chip：`天氣：<name>`＋效果簡寫；`event.weather_protected` → 效果加刪除線 + `已防護：<道具> · 已抵銷`。`event.modifiers.weather` 不存在（舊事件）→ 不加 chip。

## 5. 測試

- 後端單元（`XpHistoryService`）：
  - `buildDaily` 正確 join 天氣與當日防護；無天氣列的舊日期 → `weather:null`。
  - `shapeEvent` 帶 `weather_protected`；舊事件（欄位 null）→ `false`，可正常渲染。
- Flex：`generateWeatherBubble` 三態（增益／減益未防護／減益已防護）快照測試或結構斷言。
- 前端無 test runner → 手動驗（本機 flags 開/關兩種、三種天氣狀態）。

## 6. Rollout / flags

- 本 follow-up 純加顯示與購買 UI，不動 XP 計算。
- 上線後：`enabled=true` 可先開讓玩家看得到天氣、體驗 debuff；`purchaseEnabled=true` 待前端卡片上線後再開，玩家才有地方買防護。
- Rollback 同 parent §15（關 flag 即中性化，不刪歷史列）。

## 7. Out of scope

- 正式天氣圖示（mockup 用 emoji 佔位）；之後可換。
- postback 版購買（維持 LIFF-only）。
- 天氣的推播通知（本專案無 LINE Push；維持 reply-only）。
