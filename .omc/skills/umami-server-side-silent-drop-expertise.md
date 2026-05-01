# Umami Server-Side Event Silent Drop

## The Insight
Umami Collect API (`POST /api/send`) 對 server-side 呼叫會「靜默丟棄」不符合瀏覽器格式的事件。它回 `200 OK` 但不寫入資料庫，回應內容是 `{ beep: 'boop' }` 而非含有 `sessionId`/`visitId` 的 JWT。這不是錯誤，是 Umami 的正常行為 — 它把不像瀏覽器的請求當作無效。

## Why This Matters
你會看到 200 回應以為成功了，但 Umami dashboard 永遠不會出現事件。沒有任何錯誤訊息告訴你哪裡錯了。唯一的線索是回應內容的差異：
- `{ beep: 'boop' }` = 被丟棄，沒寫入
- `{ cache: "eyJ...", sessionId: "...", visitId: "..." }` = 成功寫入

## Recognition Pattern
- Umami `/api/send` 回 200 但 dashboard 沒事件
- 回應是 `{ beep: 'boop' }` 而非含 sessionId 的 JWT
- 從 Node.js / server-side 而非瀏覽器打 Umami API

## The Approach
Server-side 打 Umami 時，必須模擬瀏覽器端 tracking script 的完整 payload 格式。關鍵欄位：

1. **`hostname`** — 必須是你 Umami website 設定的 domain（如 `pudding.hanshino.dev`），不能自訂
2. **`url`** — 必須是完整 URL（`https://domain.com/path`），不能只是路徑（`/path`）
3. **`screen`** — 需要一個解析度字串如 `"1920x1080"`
4. **`title`** — 頁面標題
5. **`referrer`** — 可以是空字串但必須存在
6. **`User-Agent` header** — 必須是瀏覽器格式（`Mozilla/5.0 ...`），自訂 UA 會被拒

判斷標準：**比對前端 tracking script 實際送出的 request**（用 DevTools Network tab 抓），server-side 的格式要跟它一致。

## Files
- `app/src/util/umami.js` — 本專案的 Umami API wrapper
