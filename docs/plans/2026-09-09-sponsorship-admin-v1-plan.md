# 贊助管理與發卡後台 V1 規格

- 建立日期：2026-09-09
- 狀態：規則已定案，規格已完成審查並進入階段 1 實作。後端已有程式與 unit/mock 測試，前端已有 mock API 瀏覽器驗證；真實隔離 DB 整合測試尚未建立或執行，正常前端建置尚未通過。依使用者決定暫不變更環境，階段 1 尚未驗收完成；日期存取、交易與併發的正確性仍待證實，不能排除尚未發現的程式問題。詳見 roadmap §4 進度記錄及本文件 §11–12。**（2026-09-10 當下狀態，僅供歷史脈絡——2026-09-12 已獲授權執行隔離測試 DB 並取得實測證據，見 §11 新增「2026-09-12 驗證結果」小節；階段 1 仍未達完整驗收門檻，該小節列出明確剩餘缺口，不可誤讀本段舊敘述為目前現況。）**
- 依附文件：[`2026-09-09-sponsorship-subscription-roadmap.md`](./2026-09-09-sponsorship-subscription-roadmap.md) 階段 0／階段 1。
- 本文件只涵蓋 V1 最小範圍；階段 2（福利升級）、階段 3（金流自動化）不在此列，先後順序不變。

## 1. 已定案規則（V1 不可再當待決）

- 幣別僅 TWD；不支援其他幣別、不換算。
- 新贊助必須綁定既有 LINE 玩家；**禁止**用 `UserModel.ensureUser` 之類的自動建號流程幫贊助建立玩家。
- 歷史贊助可先不綁玩家；由本人核對後補綁才計入該玩家金額。禁止由兌換序號者反推贊助對象。
- 僅本人（單一 LINE userId）可查詢與操作贊助後台；不是「全部 admin」，不用既有 `verifyAdmin` / `verifyPrivilege` 等級制。
- V1 不提供：退款、一般更正、刪除、序號作廢。僅允許「未綁定的歷史紀錄」補綁玩家；已綁定的紀錄不得換人。
- 歷史類型紀錄只做記帳與補綁，不發卡、不與舊序號建立關聯。
- 新贊助支援兩種：純贊助（不發卡）／發卡贊助（產生序號，序號進入既有兌換流程，**不直接啟用訂閱**）。
- 資料一旦提交即不可修改（僅例外：歷史紀錄補綁玩家）。前端在送出前必須有明確確認畫面。
- 列表／統計只顯示「累積登記贊助金額（TWD）」單一數字；不顯示淨貢獻、不顯示退款合計欄位。日後若真的要支援退款，須先補上退款能力，才能正確計算淨額——V1 不假裝有這個數字。
- 沒有可靠的外部金流識別碼，無法防止「同一筆錢在另一張表單重複登記」。V1 的防重送只保證「同一次前端操作不會因重試/雙擊而重複入帳」，不宣稱、不在 UI 上暗示能防止跨表單重複記帳。不新增模糊比對／相似度偵測之類的複雜重複偵測邏輯。

## 2. 資料模型

### 2.1 `sponsorship`（新表，migration 待下一輪用 `yarn knex migrate:make` 產生，本規格不生成 migration 檔）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | int unsigned, PK | |
| `request_id` | varchar(64), **unique** | 冪等鍵；前端每次「開始一筆新登記」產生一個，Idempotency-Key 帶同值。 |
| `fingerprint` | varchar(64) | 建立當下的原始請求指紋：對固定順序陣列 `[type, user_id, currency, amount, received_at, payment_method, external_ref, note, card_key, card_count]` 做 `JSON.stringify`（UTF-8），取 SHA-256 hex；**禁止**用字串 `+` 串接。陣列元素固定 10 個皆存在，多餘欄位一律拒絕該次請求（reject unknown fields），不得靜默忽略。取值前先 normalize：`user_id` 為整數或 `null`；`amount` 為固定 2 位小數、無前導零的十進位字串（與入庫值同一 normalize 結果）；`received_at` 轉為 UTC、秒精度的 ISO 字串（與入庫時間精度一致）；`payment_method`/`external_ref`/`note`/`card_key` 缺省、`null`、空字串一律 normalize 為 `null`，其餘保留原字串；`card_count` 為整數。同一份 normalize 後的值同時用於入庫欄位與指紋計算，不得指紋用一份、入庫用另一份未 normalize 的原始輸入。**入帳後不因後續補綁而改變**，補綁流程不得讀取或重算此欄位。 |
| `type` | enum(`new`,`history`) | 新贊助 / 歷史補登。 |
| `user_id` | int, nullable, FK → `user.id`（signed，對齊 `user.id` 型別，見 §2.4） | `new` 必填且必須是既有玩家；`history` 可為 null（未綁定）。 |
| `currency` | char(3) | 固定寫入 `TWD`。這是已定案規則（見 §1），不是「先留欄位、以後再擴充其他幣別」——本規格範圍內只會有 TWD 這一種值，後端也不接受其他值。 |
| `amount` | decimal(12,2) unsigned | 精確金額，正數；API 一律用十進位字串傳輸與比較，不用 float、不做浮點 SUM。 |
| `received_at` | datetime | 入帳時間，站務填寫。 |
| `payment_method` | varchar(50), nullable | 選填。 |
| `external_ref` | varchar(100), nullable | 選填，外部對帳識別碼，非唯一鍵（見 §1 防重送段落）。 |
| `note` | text, nullable | 備註。 |
| `card_key` | varchar(20), nullable | 發卡贊助填；純贊助/歷史為 null。 |
| `card_count` | tinyint unsigned, **NOT NULL** default `0` | `history` 固定 `0`；`new` 純贊助為 `0`，發卡為實際張數。後端驗證需有合理正整數上限（例如與 `app/bin/IssueSubscribeCard.js` 現行 CLI 的 `count > 100` 門檻對齊，具體常數由實作階段訂出並回報，本規格不預先鎖死數字），超過上限一律拒絕，不做無上限輸入。 |
| `operator_user_id` | varchar(33) | 執行登記/補綁的站務 LINE userId（即本人）。 |
| `bound_at` | datetime, nullable | 補綁完成時間，僅 `history` 且補綁後有值。 |
| `created_at` / `updated_at` | timestamp | |

索引：`unique(request_id)`、`index(user_id)`。`fingerprint` 欄位**不建索引**——它只在「同一 `request_id` 重送時比對內容是否相同」這單一路徑上被讀取（見 §3），從未被拿來做查詢條件或反查重複，加索引沒有對應用途，純粹是寫入時多付的成本。

### 2.2 `sponsorship_audit`（新表）

只記錄「建立」與「補綁」兩種必要操作，不做一般異動軌跡。

| 欄位 | 說明 |
| --- | --- |
| `id` | PK |
| `sponsorship_id` | FK → `sponsorship.id` |
| `action` | enum(`create`,`bind`) |
| `operator_user_id` | varchar(33) |
| `payload_snapshot` | json，記錄該動作當下的關鍵欄位（金額/玩家/卡種等），供事後追查 |
| `created_at` | timestamp |

`create` 與對應的 `sponsorship` 寫入在同一交易內完成；`bind` 與對應的 `sponsorship.user_id`/`bound_at` 更新在同一交易內完成。

### 2.3 `subscribe_card_coupon`

新增欄位 `sponsorship_id INT UNSIGNED NULL, FOREIGN KEY → sponsorship.id`。既有資料維持 `NULL`；CLI／遊戲幣購卡路徑不寫入此欄位。

### 2.4 `user.id`

`user.id` 是 signed `int`（見 `app/migrations/20260323161743_rename_user_columns_and_add_profile_fields.js` 第 3 行：`CHANGE \`No\` \`id\` int NOT NULL AUTO_INCREMENT`，`int` 未加 `unsigned` 即為 signed）。`sponsorship.user_id` 的 FK 統一對齊為 signed `int`，**不得**用 `int unsigned`（本文件 §2.1 已同步修正）。實作者不需另外 `DESCRIBE user` 核對——上述 migration 已是型別的唯一依據；若下一輪產生 migration 時發現與此處記載不符，以實際 DB 為準並回報此文件過時，而非自行假設。

## 3. 金額與冪等規則

- 金額 API 層一律用十進位字串（例："1500.00"），後端驗證格式（`^\d{1,10}(\.\d{1,2})?$`）並拒絕超出兩位小數精度的輸入；資料庫用 `decimal(12,2)`，不做任何浮點轉換。列表加總用 SQL `SUM()` 對 decimal 欄位，不在應用層對 float 做加總。
- `request_id` + `Idempotency-Key`（HTTP header）兩者一致，同一 `request_id`：
  - 內容相同 → 回傳原本建立結果（含原序號，若有）。
  - 內容不同 → 回 409，不覆蓋、不新建。
- 建立操作用 `unique(request_id)` + DB 交易；重複請求觸發唯一鍵衝突時，在交易外 catch 後查回既有紀錄比對內容再決定回應（200 冪等 / 409 衝突），不用應用層鎖模擬唯一性。
- 補綁（bind）對同一 `sponsorship_id` 重送相同 target `user_id`：不得產生第二筆 `sponsorship_audit`；直接回傳現況（等同成功）。已綁定為其他玩家時重送新的 target → 409。
- `fingerprint` 只在建立時計算一次並固定寫入，補綁流程不得重算或覆蓋。

## 4. API 路由（`/api/owner/sponsorships`）

固定路徑一律寫在 `:id` 動態路由之前，避免被吃掉。

| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/players?q=` | 玩家搜尋（給登記時選人用）。 |
| GET | `/players/:id/summary` | 該玩家累積登記贊助金額（TWD）＋贊助/序號清單。 |
| GET | `/cards` | 可用卡種清單（供發卡表單選卡種/張數，讀 `SubscribeCard`，不新增卡種管理）。 |
| GET | `/` | 贊助列表（分頁、篩選 type/是否已綁定）。 |
| GET | `/:id` | 單筆詳情。 |
| POST | `/` | 建立（`Idempotency-Key` header 必填）。 |
| POST | `/:id/bind` | 歷史紀錄補綁玩家。 |

- 全部路由掛 `verifyToken` → 新中介層 `verifySponsorshipOwner`（見 §5），不得掛 `verifyAdmin`/`verifyPrivilege` 頂替，因為那是「全部 admin」而非「僅本人」。
- 不提供 PUT / DELETE / 任何 refund 端點。
- 回應一律 `Cache-Control: no-store`；序號欄位不得寫入 `console.log`/一般錯誤訊息。現有 `subscribeCouponExchange` 等既有 controller 出錯時常見 `console.error(e)` 直接輸出整個 error 物件，可能包含 SQL 陳述式與 bindings（含序號、金額等敏感值），**不得**把這個既有寫法當範本沿用。本規格要求：所有 `/api/owner/sponsorships/*` 端點的錯誤處理需做安全分類（例如區分驗證錯誤／衝突／未預期例外，分別回應對應狀態碼與精簡訊息），伺服端 log 也不得整個原樣印出底層 DB error（含其 SQL/bindings），只記錄不含敏感值的錯誤摘要。

## 5. 後端授權

- 新增環境設定 `SPONSORSHIP_OWNER_LINE_USER_ID`（單一 LINE userId 字串）。**本輪不寫入 `.env`／`.env.example` 實際值**，開發時用假 ID 佔位；本人 ID 於啟用前另行提供給部署環境。
- `app/src/middleware/validation.js` 新增 `verifySponsorshipOwner`，行為契約（不預寫程式碼，由實作者依此契約寫出，型式比照檔內既有 middleware 風格）：
  1. 讀取 `process.env.SPONSORSHIP_OWNER_LINE_USER_ID`，用既有 LINE userId 格式 `/^U[a-f0-9]{32}$/` 驗證其**格式有效**（與 [`app/src/middleware/validation.js`](../../app/src/middleware/validation.js) 現有 `verifyLineUserId` 的正則完全一致，不加 `i` flag）。格式無效或未設定，一律視為「owner 未配置」。
  2. Owner 未配置 → 回 503（fail closed，不放行任何人，包含本人）。
  3. Owner 已配置且格式有效 → 精確字串比對 `req.profile?.userId === ownerId`。相符才 `next()`；不符（含 `req.profile` 不存在、`userId` 為 `undefined`）一律 403。**比對前必須先確認 `ownerId` 通過格式驗證**，避免「env 未設定時兩邊都是 `undefined`，`undefined === undefined` 誤判為 true 而放行」這個漏洞——這正是本節要求先做格式驗證、格式無效直接 503 短路的原因，不能只做 `!ownerId` 這種假值檢查就結束。
  4. 不引用 `req.profile.privilege`、不與 `verifyPrivilege` 等級制混用。
- `GET /api/me` 回應新增布林欄位 `canManageSponsorship`，判斷邏輯**必須與 `verifySponsorshipOwner` 使用同一段「owner 格式驗證＋精確比對」邏輯**（例如兩邊呼叫同一個匯出的 helper，如 `isSponsorshipOwner(userId)`，不得各自重寫一份比對規則，避免兩處實作分岔導致 `/me` 顯示能操作但實際端點 403，或反過來）。此欄位**僅供前端顯示/導覽用**，不可作為任何後端授權依據；所有 `/api/owner/sponsorships/*` 端點仍各自掛 `verifySponsorshipOwner`。
- 玩家搜尋、序號查詢等新增查詢一律走同一 guard，不因為「只是查詢」而放寬。

## 6. 發卡共用服務

- 新增 [`app/src/service/SubscribeCardCouponService.js`](../../app/src/service/SubscribeCardCouponService.js)，抽出 `issue({ cardKey, count, issuedBy, sponsorshipId = null }, trx)`：批次產生 UUID 序號並寫入 `subscribe_card_coupon`（含可選 `sponsorship_id`）。行為對齊現有 [`app/bin/IssueSubscribeCard.js`](../../app/bin/IssueSubscribeCard.js) 與 [`app/src/controller/application/SubscribeController.js`](../../app/src/controller/application/SubscribeController.js) 的 `buyMonthCard` 產卡邏輯，**不改動既有價格（50/135/220 萬女神石）與既有呼叫參數**。
- `app/bin/IssueSubscribeCard.js`、`SubscribeController.buyMonthCard` 改為呼叫此共用服務（`sponsorshipId` 皆傳 `null`），行為不變，只是去重複。
- 贊助後台建立「發卡」型贊助時，在同一交易內：寫入 `sponsorship` → 呼叫 `SubscribeCardCouponService.issue(..., trx)` 帶入該筆 `sponsorship.id` → 寫入 `sponsorship_audit`（`create`）。任一步失敗整筆回滾。

## 7. 兌換併發修正（隨此輪一併處理，非新增功能）

現況 `subscribeCouponExchange`（[`app/src/controller/application/SubscribeController.js`](../../app/src/controller/application/SubscribeController.js)）在交易**外**讀 `coupon` 與既有 `SubscribeUser`，交易內才寫入，中間有 race window：

- 同一序號被兩個不同玩家同時兌換 → 可能都通過交易外的「未使用」檢查。
- 同一玩家同時兌換兩張序號 → 可能都通過交易外的「查有無既有訂閱」檢查，導致 `end_at` 疊加錯誤或重複 insert。

修法：把「讀 coupon 狀態＋讀既有 SubscribeUser＋算延長/建立＋寫入」整段搬進同一個 `mysql.transaction`，且必須同時滿足以下兩個鎖定目標，**缺一不可**（只鎖 coupon 不合格，因為同玩家的兩張序號會鎖到兩個不同的 coupon row，彼此互不阻擋，仍然競態）：
- **鎖 coupon**：對 `subscribe_card_coupon` 該序號那一行用 `SELECT ... FOR UPDATE` 鎖住再檢查 `status`，確保同一序號不被兩個玩家同時判定為「未使用」。
- **序列化同一 `(user_id, subscribe_card_key)` 的訂閱更新**：在同一交易內，對 `subscribe_user` 用既有 `unique(user_id, subscribe_card_key)`（[`app/migrations/20221025034215_create_subscribe_user_table.js`](../../app/migrations/20221025034215_create_subscribe_user_table.js) 已建立此複合唯一鍵）搭配 `SELECT ... FOR UPDATE`（若該列已存在）取得列鎖後，**在交易內重新讀取 `end_at`** 才計算延長/建立，不得沿用進交易前讀到的舊值。既有唯一鍵本身**不能替代**這道「先鎖、交易內重讀、再算」的流程——唯一鍵只防得住「兩筆都嘗試 INSERT 同一鍵」的最終衝突，防不住「兩筆都判定要 UPDATE 且都拿舊 `end_at` 疊加」這種邏輯錯誤（兩者都通過各自的 read，最後都 UPDATE 成功，只是其中一筆的延長天數被另一筆覆蓋而不是疊加）。
- 重試統一在整個交易 rollback 完成後、從函式入口重新來過，最多額外重試 2 次（總嘗試 3 次）；只對兩類已確認錯誤重試：MySQL deadlock（`ER_LOCK_DEADLOCK`）／鎖等待逾時（`ER_LOCK_WAIT_TIMEOUT`），以及「首次建立」時 `subscribe_user` 複合唯一鍵 INSERT 競態（`ER_DUP_ENTRY`）；其餘錯誤一律不重試、直接回覆失敗。每次重試都是全新一輪交易：重新對 coupon 下 `SELECT ... FOR UPDATE`、重新對同一 `(user_id, subscribe_card_key)` 取得訂閱列鎖並讀最新 `end_at`，再依當下讀到的狀態決定要 INSERT 還是 UPDATE——不是在交易內途中改走 UPDATE 分支續跑同一筆交易。
- 兌換成功後既有訊息回覆／`GachaController.purgeDailyGachaCache`／`DailyRation`／成就評估等副作用一律排在交易 commit 之後、整個重試迴圈之外執行；這些副作用本身失敗不得觸發重跑兌換交易（序號已標記使用、訂閱已成立，重跑交易會重複發放權益），一律保留現有「副作用失敗不影響已完成兌換」的行為，全部保留不精簡也不新增。

## 8. 過期清理與重新兌換情境

`app/bin/CleanExpiredSubscriber.js` 依 `end_at < now` 直接刪除 `subscribe_user` 紀錄；查過現有測試目錄（`app/bin/__tests__/`）沒有覆蓋這支腳本的檔案。但這支腳本邏輯單純（一行 `delete().where("end_at", "<", now)`），本輪**不為它新開一支獨立測試檔**——那會是超出 V1 範圍的額外腳手架。真正需要驗證的是它與兌換流程的交互：使用者的訂閱過期被清理後，重新兌換序號應該走「不存在記錄」的**首次建立**路徑，而不是誤讀到已刪除前的舊 `end_at` 疊加。

這個情境併入 §11／§7 的 `SubscribeController.redeem` 整合測試裡，作為其中一個案例：先建立一筆已過期的 `subscribe_user`、跑一次 `CleanExpiredSubscriber` 的刪除邏輯（或直接在測試裡等效刪除該列，以真實 DB 交易驗證後續行為，不用 mock）、再兌換一張新序號，斷言走建立路徑且 `start_at`/`end_at` 正確，不是延長一筆不存在的舊紀錄。

## 9. 前端

沿用既有 Admin 頁面慣例（如 [`frontend/src/pages/Admin/Coupon/index.jsx`](../../frontend/src/pages/Admin/Coupon/index.jsx)），視覺與版面由 `@designer` 負責，本規格只定資料流：

- `frontend/src/services/sponsorship.js`：`fetchPlayers(q)` / `fetchPlayerSummary(id)` / `fetchCards()` / `fetchSponsorships(params)` / `fetchSponsorship(id)` / `createSponsorship(payload, requestId)`（帶 `Idempotency-Key` header）/ `bindSponsorship(id, userId)`。命名可依現有 service 檔慣例（如 [`frontend/src/services/coupon.js`](../../frontend/src/services/coupon.js)）調整，不強制一字不改。
- `frontend/src/components/RequireSponsorshipOwner.jsx`：比照 [`frontend/src/components/RequireAdmin.jsx`](../../frontend/src/components/RequireAdmin.jsx) 寫法，改讀 `useLiff()` 或 `/api/me` 回來的 `canManageSponsorship`，非本人一律 `<Navigate to="/" replace />`。實際讀哪個資料來源（context 擴充 vs 直接呼叫 `/api/me`）由實作者依現有 [`frontend/src/context/LiffContext.js`](../../frontend/src/context/LiffContext.js) 結構決定，不在此規格鎖死。
- `frontend/src/pages/Owner/Sponsorship/`：建立表單第一步先選 `type`（新贊助 `new` / 歷史補登 `history`）；選 `new` 才進第二步選純贊助／發卡二擇一（選卡種／張數僅發卡分支顯示，且 `new` 必須選定玩家）；選 `history` 則玩家欄位可留空（未綁定）且不顯示卡種／張數欄位、不發卡。列表頁＋確認畫面（提交前明示「送出後不可修改，僅未綁定歷史可事後補綁」）＋玩家詳情（累積登記贊助金額 + 清單）＋歷史補綁動作。頁面拆分／命名可依現有 [`frontend/src/pages/Admin/Coupon/`](../../frontend/src/pages/Admin/Coupon/) 慣例調整。
- 路由掛載：在 `App.jsx` 比照 `RequireAdmin` 用法新增 `RequireSponsorshipOwner` 包住的路由分支；導覽入口（若要顯示於 `NavDrawer.jsx`）僅在 `canManageSponsorship === true` 時渲染。
- **敏感資料不落地快取**：建立表單的金額欄位與任何序號（新建立回傳的、查詢到的）都不得寫入 `localStorage`／`sessionStorage`／任何瀏覽器持久化存放區，只能存在 React state（記憶體內）。同一個元件生命週期內（未重新整理、未重新掛載）逾時或請求失敗，重試沿用**記憶體中同一個** `request_id` 重新呼叫 `POST /`，讓後端依 §3 的冪等規則回原本結果。**頁面重新整理或元件重新掛載導致 state 遺失後，不自動重送、不自動恢復先前那次未完成的提交**——使用者需重新走一次表單；提交前先呼叫列表／詳情查詢核對是否已有相符紀錄，確認尚未建立成功才產生**新的** `request_id` 送出新的建立請求。此舉不宣稱能防止「同一筆錢在另一張表單重複登記」（見 §1），只降低同一次操作重複建立的機率。

## 10. 實作分工與依賴順序

1. **Migration**（下一輪執行，非本規格範圍）：`sponsorship`、`sponsorship_audit`、`subscribe_card_coupon.sponsorship_id`。
2. **後端資料層**：`Sponsorship` / `SponsorshipAudit` model（繼承 [`app/src/model/base.js`](../../app/src/model/base.js)）、`SubscribeCardCouponService.issue`（先重構既有兩處呼叫點 [`app/bin/IssueSubscribeCard.js`](../../app/bin/IssueSubscribeCard.js)、[`app/src/controller/application/SubscribeController.js`](../../app/src/controller/application/SubscribeController.js) 的 `buyMonthCard`，確保回歸不變）。
3. **後端服務層**：`SponsorshipService`（建立／查詢／補綁／冪等判斷／金額格式驗證）。**範圍邊界明確**：`SponsorshipService` 只呼叫 `SubscribeCardCouponService.issue` 來發卡，**不呼叫、不修改、不依賴**兌換（`redeem`）流程——§7 的兌換併發修正是 `SubscribeController.subscribeCouponExchange` 內部自己的交易邏輯，屬於獨立分工項目，兩者除了共讀 `subscribe_card_coupon` 表之外沒有函式呼叫關係，不得讓 `SponsorshipService` 直接呼叫或內嵌 redeem 邏輯。
4. **後端路由＋授權**：`verifySponsorshipOwner` middleware → `/api/owner/sponsorships` router → 掛進 [`app/src/router/api.js`](../../app/src/router/api.js)；`/api/me` 加 `canManageSponsorship`。
5. **兌換併發修正**（§7）：獨立於贊助後台的既有程式修正，只動 [`app/src/controller/application/SubscribeController.js`](../../app/src/controller/application/SubscribeController.js) 的 `subscribeCouponExchange`。
6. **前端**：`services/sponsorship.js` → `RequireSponsorshipOwner` → 頁面（由 `@designer` 出視覺，前端邏輯由前端負責串接）。
7. **同檔案協調限制**：`buyMonthCard`（步驟 2 的重構對象）與 `subscribeCouponExchange`（步驟 5）同在 `SubscribeController.js` 一個檔案內，**不得由兩條並行分工同時編輯這支檔案**——需由單一實作者依序完成兩處改動，或明確約定交接順序（例如先完成 2 的重構並提交，5 再基於該版本繼續改），避免兩邊改動互相覆蓋。除此檔案外，2～5 涉及的其餘檔案彼此不相交，契約（§2～§6）確定後可平行進行；6 依賴 4 的路由契約確定後才能串接前端，但頁面骨架可先行；端到端驗收依賴 migration（步驟 1）與後端服務層（2、3）皆完成。

## 11. 測試（狀態：2026-09-12 已補齊真實 DB 整合測試並實測通過，見本節末「2026-09-12 驗證結果」小節；仍未達 §12 完整驗收門檻，該小節列出明確剩餘缺口）

| 檔案（擬新增） | 範圍 | 狀態 |
| --- | --- | --- |
| `app/src/middleware/__tests__/verifySponsorshipOwner.test.js` | fail-closed（未設定 env／格式無效 env）／本人放行／非本人 403／未登入沿用 `verifyToken` 既有 401；比照既有 [`app/src/middleware/__tests__/validation.auth.test.js`](../../app/src/middleware/__tests__/validation.auth.test.js) 的 `jest.unmock` + 真實 middleware 手法，**不使用** `app/__tests__/setup.js` 的全域 auth mock（那個 mock 直接放行一切，用它測授權等於沒測）。 | 已建立並通過（計入 §4 進度記錄的 137）。 |
| `app/src/service/__tests__/SponsorshipService.test.js` | 金額格式驗證（含零、負數、超精度、非數字字串一律拒絕）、`card_count` 上限拒絕、冪等判斷（同 key 同內容/不同內容/併發衝突）、`history` 補綁狀態機（未綁→綁成功、已綁重送同 target 不重複 audit、已綁 target 不同 409）。用 mock DB 驗邏輯分支，非交易/併發證據。 | 已建立並通過（unit/mock，非交易/併發證據）。 |
| `app/src/service/__tests__/SponsorshipService.integration.test.js` | **真實本機隔離測試 DB**（非 `Princess`、非遠端），驗證：`unique(request_id)` 併發寫入只成功一筆、補綁併發下不重複 audit；以及三個交易回滾情境（皆在交易外用獨立 query 驗證結果，不接受「mock 斷言呼叫過 rollback」當證據）：①發卡贊助建立時，`subscribe_card_coupon` 已插入部分序號後 `issue` 才失敗（例如插到一半觸發唯一鍵衝突）→ 交易外查無任何一筆該次的 `sponsorship_id`、`sponsorship`、`sponsorship_audit` 殘留；②`subscribe_card_coupon` 全部插入成功、`sponsorship` 也插入成功，但寫 `sponsorship_audit`（`create`）時失敗 → 交易外查無 `sponsorship`、無對應序號、無 audit 殘留；③補綁流程中 `sponsorship.user_id`/`bound_at` 已 UPDATE，但寫 `sponsorship_audit`（`bind`）時失敗 → 交易外查該筆 `sponsorship.user_id` 仍是更新前的值（未綁定或原玩家），不得停留在「已改 user_id 但沒有對應 audit」的中間狀態。比照 [`app/src/service/topic/__tests__/query.integration.test.js`](../../app/src/service/topic/__tests__/query.integration.test.js) 的手法（`jest.isolateModules` + `jest.doMock` 注入真 knex），連線目標必須是獨立的本機測試資料庫（例如另建 `Princess_test` 或用環境變數指定的測試 DB name，禁止指向 `Princess`；禁止指向任何遠端/生產主機）。 | **已於 2026-09-12 建立並實測通過**（11 tests，一次性 Docker `mysql:8` 隔離 DB，見本節末「2026-09-12 驗證結果」小節）。 |
| `app/src/router/__tests__/ownerSponsorships.test.js` | 對 `/api/owner/sponsorships/*` 全部端點（含 `players`、`players/:id/summary`、`cards`、列表、詳情、建立、補綁）逐一驗證非本人／其他 admin（`privilege: 9` 但非 owner）皆 403；驗證非同源 Origin 的寫入請求（POST）被既有 `isAllowedOrigin` CSRF 檢查擋下（走真實 `verifyToken` + `verifySponsorshipOwner`，同樣不用全域 auth mock）。 | 已建立並通過，另有 `ownerSponsorshipsCreate.test.js` 補真實 service regression（計入 §4 進度記錄）。 |
| `app/src/controller/application/__tests__/SubscribeController.redeem.test.js` | **真實本機隔離測試 DB**（同上，非 mock），須真正安排交易重疊（例如用兩個獨立連線各自開始交易、控制執行順序讓兩者的鎖等待時間窗重疊），不能只是「湊巧序列化跑過」當證據。至少涵蓋五個情境：①同一序號被兩個玩家同時兌換，只有一個成功、另一個明確失敗（序號已使用）；②該玩家已有一筆有效 `subscribe_user`，同時兌換兩張不同序號，**兩張都必須成功**、兩張序號皆標記為 used，且 `end_at` 完整依序疊加兩次時長（不是「或只認一次」，兩次成功、期限完整累加是唯一允許結果）；③該玩家尚無 `subscribe_user`，同時兌換兩張不同序號，因交易序列化只有一次會走 INSERT、另一次走「重讀後 UPDATE」，最終結果為兩次兌換都成功、只留一筆 `subscribe_user`、`end_at` 疊加兩次時長；④單一玩家單張序號的首次兌換（無既有 `subscribe_user` 列）建立成功且 `start_at`/`end_at` 正確；⑤§8 情境：舊訂閱過期被清理後重新兌換，走建立路徑而非誤延長。單獨的 mock 版 `app/__tests__/service/SubscriptionService.test.js` 只測效果算法，不是這裡要的 redeem 交易覆蓋，也不能拿來當這五項的測試證據。 | **已於 2026-09-12 建立並實測通過**（18 tests，含真實交易重疊安排，見本節末「2026-09-12 驗證結果」小節）。與 `SubscribeController.redeem.unit.test.js`（mock 版決策分支測試）並存、用途不同，互不取代。 |
| `app/bin/__tests__/IssueSubscribeCard.test.js` | 改用共用 service 後行為不變的回歸（張數/卡種/既有 CLI 輸出）。 | 已建立並通過。 |
| `app/src/controller/application/__tests__/SubscribeController.buyMonthCard.test.js` | 改走共用發卡 service 後，購卡扣款與發卡仍在同一交易；扣款成功但發卡失敗（或反之）需完整回滾，女神石不能被扣走卻沒拿到序號。 | 已建立並通過（unit/mock）。 |

前端無測試 runner；驗收改用「建置成功 + 瀏覽器人工操作」，見 §12。**2026-09-10 當時 `yarn build` 因本機 `node_modules` 缺 `wordcloud` 套件且 integrity 不吻合而無法在本機驗證通過**（`wordcloud` 確實存在於 `frontend/package.json` 與 `frontend/yarn.lock`，非 lock 檔缺漏）；**2026-09-12 已重新執行 `yarn build`（未重裝依賴、未變更任何 lock/package 檔）並成功**，唯有 chunk size 超過 500KB 的建置警告（效能優化建議，非錯誤，不影響建置成功與否，不在本輪驗收範圍）。瀏覽器操作驗收已完成 owner 列表/詳情/新增表單三頁的唯讀真實瀏覽器 QA（見「2026-09-12 驗證結果」小節），但**非完整 e2e**：未執行任何表單 submit／玩家搜尋互動／補綁動作，也未驗證非本人已登入時對真實 API 的拒絕行為（僅驗證了 SPA client-side route guard 的 redirect，未做 API 層 401/403 status code 驗證）。

### 2026-09-12 驗證結果（授權執行隔離測試 DB 後）

本節記錄 2026-09-12 在使用者明確授權下，啟動一次性 Docker MySQL 容器執行真實 DB 整合測試與相關驗證的實測結果。**這是新增的當輪證據，不覆蓋、不否定上方 §11 表格中標註「2026-09-10」的既有 unit/mock 測試證據**，兩者並存。

**測試環境**：一次性 Docker 容器，image `mysql:8`，實際拉取版本為 `8.4.11`；容器 process env 映射 `127.0.0.1:33082`；每個 suite 各自建立獨立的隔離測試資料庫（`Princess_wbtest_*` 前綴），完整跑過 knex migrations 後才執行測試，結束後各自 `DROP` 自己建立的 DB。**全程未連接、未讀取、未寫入任何既有 `Princess` 資料庫**；容器與匿名 volume 於測試結束後已清除。

**測試結果彙總（7 個目標 suite，129 tests，全數通過；此為 targeted 執行結果，非全 repo test suite，未涵蓋的既有 legacy 測試——例如可能牽涉既有 `Princess` 的其他 suite——本輪刻意不跑，避免碰觸正式資料）**：

| Suite | Tests |
| --- | --- |
| `SponsorshipService.integration.test.js` | 11 |
| `SubscribeController.redeem.test.js`（整合） | 18 |
| `Inventory.test.js`（unit，本輪新增） | 6 |
| `SubscribeController.buyMonthCard.test.js`（unit） | 12 |
| `SubscribeController.redeem.unit.test.js`（unit） | 15 |
| `SponsorshipService.test.js`（unit） | 57 |
| `ownerSponsorshipsCreate.test.js` | 10 |
| **合計** | **129** |

上表為單次執行的通過數，未因重跑或分批執行而重複加總。

**本輪新修正並經上述測試驗證的行為**：

- `Inventory.getUserOwnCountByItemId`／`getUserMoney`：`SUM(itemAmount)` 對空集合回傳 `{ amount: null }` 時正規化為 `{ amount: 0 }`；非 `null` 的數值（含 DECIMAL 字串、負數、`0`）原樣保留，不經 `Number()`/`parseInt()` 轉型或吞值。修正前的舊行為會讓從未持有女神石的玩家買到負餘額的月卡，此 regression 已由 `Inventory.test.js`（6 tests，本輪新增）與 `SubscribeController.redeem.test.js` 的真實 DB 案例覆蓋。
- `SubscribeController.buyMonthCard`：購卡流程在對女神石所在列上鎖（row lock）後，於**同一交易內重新讀取**餘額才做扣款判斷，避免鎖前讀到的舊餘額被沿用；已驗證兩名玩家各持 50 萬女神石同時各買 1 張月卡（各自餘額足夠）皆成功、另一情境驗證餘額剛好夠買 1 張但同時發起 2 次購買請求時僅 1 次成功。
- 交易回滾三情境（發卡中途失敗、`sponsorship_audit`(create) 失敗、`sponsorship_audit`(bind) 失敗）：皆在交易外用獨立 query 確認相關列（`sponsorship`／`subscribe_card_coupon`／`sponsorship_audit`／已 debit 的女神石）已完整回滾或未殘留，非 mock 斷言「呼叫過 rollback」。
- 冪等：同 `request_id` 併發重送（含發卡贊助的併發建立、補綁併發、序號兌換併發）已用真實交易重疊驗證只有一個成功路徑落地，其餘走既有衝突/重試分支。
- `DECIMAL` 金額與 `received_at` 的 UTC ↔ `+08:00` 連線時區設定 round-trip：已用真實 DB 寫入/讀回驗證數值與時間點正確對應，不再是 §11 表格舊版所述「尚未經真實 DB 驗證」的狀態。
- migrations 在全新隔離 DB 上從零跑過並成功建表，可支撐上述所有測試情境。

**獨立覆核（另一角色執行的 review）結果**：未發現 production 等級的 P0／P1 問題。原先標記的一項測試基礎設施 P1（缺 Docker 容器 port/image 版本紀錄）已透過本節記載的資訊補齊；一項 rollback 測試的 P2（測試涵蓋不足）已補齊對應案例並通過。另有一個測試斷言方式（spy 未正確 restore）被判定為測試本身的缺陷（非 production 程式問題），已修正。

**本輪明確 defer、未處理的風險（不在本輪修正範圍，留待後續）**：

- 其他消費／轉帳路徑（非本次修正的購卡/兌換）尚未逐一排查是否共用相同的「行鎖 + 交易內重讀」保護，此風險維持已知、明確 defer，不在本輪動作範圍。
- 測試 fixture（`worldBossFixture` 等）在建立隔離測試 DB 時對 MySQL 帳號授予的權限（grants），測試結束 `DROP DATABASE` 後不會一併撤銷該帳號的權限設定；這是既有的 test fixture 維運層級風險（並非本輪新增），本輪未變更、未清理既有 grants 設定，維持原狀。

**唯讀真實瀏覽器 QA（同日執行，非本節 DB 測試的一部分，但同屬 2026-09-12 驗證範圍）**：

已用 `agent-browser` 對 owner 列表頁、詳情頁（`/owner/sponsorships/3`）、新增表單頁三頁執行唯讀瀏覽（未 submit、未搜尋、未補綁），並驗證乾淨匿名 session 對三頁的存取皆被 SPA client-side route guard redirect 回首頁，測試用 `redive_session` cookie 有效。**這不構成完整 e2e 驗收**：

- 未執行任何表單提交、玩家搜尋互動、補綁動作。
- 未驗證非本人但已登入使用者對真實 API 端點的拒絕行為（本次只驗證了前端 route guard 的 redirect，未做 API 層 401/403 status code 的直接驗證）。
- 詳情頁 `id=3` 的資料是既有 curl 測試遺留的紀錄，**不是**本輪整合測試新建立的產物；瀏覽器 QA 只是拿它來驗證 render 正確，不代表這筆資料本身是本輪測試證據鏈的一部分。
- 頁面顯示的入帳時間（如「2026/09/12 11:23」）是前端 `fmtDate` 依**瀏覽器本地時區**格式化的結果；本次 QA 未特別取得或鎖定該瀏覽器 session 的實際時區設定，**不能**以此畫面顯示值反推或宣稱「UTC → 台北時間（+08:00）換算已驗證正確」——時區轉換正確性的證據來自上方本節所述的 DB round-trip 測試，不是這次瀏覽器畫面觀察。
- 本機 owner 後台功能與 migrations 已確認可用，但**正式（production）環境的 owner 配置與部署行為本輪未驗證**。

**本輪未涵蓋、仍待後續的項目（不再等待「是否授權 Docker」——該授權已於本輪取得並執行完畢，下一步不是重新請示環境變更）**：

- 完整 CI / 完整 backend test suite 尚未跑過（本輪為刻意排除既有 legacy／`Princess` 相關 suite 的 targeted 129 tests，非全 repo 測試）。
- 完整真實瀏覽器「寫入類」操作（表單 submit、搜尋、補綁）與正式人工端到端驗收流程尚未執行。
- 正式（production）環境的 `SPONSORSHIP_OWNER_LINE_USER_ID` 配置與實際部署行為尚未驗證。
- 本文件與 §2.1 定義的 API 契約中，`received_at` 等時間欄位在既有規格描述為「秒精度 ISO 字串」，但目前程式實測寫入/序列化路徑上觀察到 `Date` 物件的 `.toISOString()`／JSON 序列化格式帶有毫秒（`.000Z`）——這是**規格文件描述的精度示例與實際觀察到的序列化格式之間尚待確認的差異**，本輪不擅自變更 API 契約或程式行為來「修正」這個差異，僅在此列出待日後確認是否需要調整規格措辭或程式序列化方式。

以上「階段 1 尚未完成」的結論维持不變：全 CI、完整真實瀏覽器寫入流程與正式上線 gate 仍是明確待辦，不是本節記錄的範圍。

## 12. 驗收與 rollout gate

**現況（2026-09-10 原始記錄，見下方 2026-09-12 更新）：以下清單多數項目仍未有可重現證據，暫停於等待使用者授權環境變更（安裝依賴／啟動隔離測試 DB），詳見 §11 表格「狀態」欄與 [`2026-09-09-sponsorship-subscription-roadmap.md`](./2026-09-09-sponsorship-subscription-roadmap.md) §4「進度記錄」小節。前三項（授權、部分金額格式驗證、`card_count` 上限的輸入驗證）已有 unit/mock 測試證據；標註「真實本機測試 DB」或「build/e2e」字樣的項目尚未完成。**

**2026-09-12 更新：** 上述環境授權已取得，§11「2026-09-12 驗證結果」小節記錄了真實隔離測試 DB（Docker `mysql:8`/實測 `8.4.11`）129 tests 全綠的實測證據，涵蓋本清單下方多數「以 §11 整合測試證明」「真實本機測試 DB」字樣的項目（交易回滾三情境、冪等併發、兌換併發、`SUM` decimal 加總、`received_at` UTC/+08:00 round-trip、發卡回歸、A 贊助 B 兌換的資料落點等）。前端 `yarn build` 已成功（未重裝依賴）。**惟本清單逐項勾選仍需由下方「全部以上由非實作者覆核」的角色依實際證據逐項核對後才能打勾**——本次文件更新只記錄「證據已存在於何處」，不代替該覆核角色勾選任何項目；且清單中「本人登入可見並操作完整流程」「歷史補綁 UI 走完整流程」等需要真實寫入操作的人工瀏覽器驗收項目，本輪只完成唯讀 QA（見 §11 小節說明），尚未有對應證據可勾選。全 CI／完整 backend suite、正式環境部署配置亦未驗證，不屬於本次已完成範圍。

- [ ] `verifySponsorshipOwner` 對「本人／非本人／未設定 env／env 格式無效」四態皆有測試證據，非本人（含其他 `privilege: 9` 的既有 admin）呼叫任何 `/api/owner/sponsorships/*` 一律被拒（含 GET 查詢）；非同源 Origin 的寫入請求被 CSRF 檢查擋下，皆為走真實 middleware 的 regression test，非全域 mock 下的假通過。
- [ ] 金額精度：API 拒絕零、負數、超過兩位小數、非數字字串；SUM 加總以 DB decimal 驗證，不用 float 比對測試斷言。
- [ ] `card_count` 上限：超過訂定常數一律拒絕，`history`/純贊助固定 0。
- [ ] 冪等：同 `request_id` 同內容重送回原結果；不同內容 409；併發雙請求只落一筆（以 §11 整合測試證明，不是靠程式碼審閱斷言）。
- [ ] 補綁：未綁定可補綁成功；重送同 target 不新增 audit；已綁其他 target 回 409；`history` 補綁不產生序號、不關聯舊序號。
- [ ] 發卡：新贊助發卡張數／卡種與既有 CLI／購卡邏輯共用同一段程式碼（`SubscribeCardCouponService.issue`），價格 50/135/220 萬女神石購卡路徑行為不變（回歸測試綠燈）；購卡扣款與發卡任一步失敗皆完整回滾（女神石不能被扣走卻沒拿到序號）。
- [ ] 贊助建立流程中發卡步驟失敗、建立流程中寫 audit 失敗、補綁流程中寫 audit 失敗，三種情境皆在真實本機測試 DB 上驗證交易外查無殘留／狀態已還原，不接受 mock 斷言「呼叫過 rollback」當證據。
- [ ] A 贊助、B 兌換：現金貢獻留在 A（`sponsorship.user_id = A`），訂閱只給 B（`subscribe_user.user_id = B`）；發卡本身不啟用月卡；有測試明確驗證這個「贊助人與兌換人分離」的資料落點。
- [ ] 純贊助（無卡種）建立後不產生任何 `subscribe_card_coupon` 列；歷史補登（`type=history`）任何情況下都不產生序號——兩者皆需有測試斷言「查無對應序號」，不只是「沒報錯」。
- [ ] 兌換併發（§7／§11 五情境）：雙玩家搶同一序號只一個成功、已有訂閱時雙序號**兩次都成功且期限完整累加**、無既有訂閱時雙序號競態只留一筆訂閱但兩次兌換皆成功、首次建立正確、過期清理後重新兌換走建立路徑——皆在真實本機測試 DB 上以真正交易重疊驗證，mock 版不算數。
- [ ] 前端：build 成功；本人登入可見並操作完整流程；非本人／未登入被導離；同一元件生命週期內逾時重試沿用同一 `request_id` 不產生新請求、不重複建立；重新整理或重新掛載後不自動重送、不自動恢復先前提交；歷史補綁 UI 走完整流程；金額與序號未寫入任何瀏覽器持久化儲存（可用瀏覽器 DevTools 檢查 `localStorage`/`sessionStorage` 佐證）。以上為人工瀏覽器驗收，非自動化。
- [ ] 全部以上由**非實作者**（主代理或另一位角色）覆核，不得由實作者自行勾選完成。
- [ ] `SPONSORSHIP_OWNER_LINE_USER_ID` 正式值於部署前另行提供並設定，本規格不假設其已存在於任何環境。
- [ ] 本輪僅產出規格文件，不 commit、不建立 migration 檔、不部署；merge 至 `main` 才會經既有 pull-based 流程自動部署，故本規格所有程式改動皆待後續輪次分工實作後才會進入該流程。

## 13. 與 V1 範圍明確排除的項目（避免實作時擴權）

- 退款、金額更正、刪除紀錄、序號作廢 — 全部不做。
- 歷史紀錄與舊序號建立關聯 — 不做。
- 淨貢獻、退款合計、任何「淨額」欄位 — 不做，UI 只顯示累積登記金額。
- 模糊重複偵測（相似金額/時間去重、跨表單比對）— 不做。
- 卡種福利、價格調整 — 屬階段 2，本規格不動。
- 金流串接 — 屬階段 3，本規格不動。
