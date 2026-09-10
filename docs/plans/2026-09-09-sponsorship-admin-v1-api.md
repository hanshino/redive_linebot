# 贊助管理與發卡後台 V1 API 契約

- 建立日期：2026-09-09
- 狀態：**契約已實作完成，供前端／`@designer` 讀取。**
- 依附文件：[`2026-09-09-sponsorship-admin-v1-plan.md`](./2026-09-09-sponsorship-admin-v1-plan.md)（規則與資料模型的權威來源，本文件只列 API 的 request/response 形狀，行為規則衝突時以規格文件為準）。
- 對應實作：`app/src/router/Sponsorship.js`、`app/src/service/SponsorshipService.js`、`app/src/middleware/validation.js`（`verifySponsorshipOwner`／`isSponsorshipOwner`）。

## 0. 通用規則

- Base path：`/api/owner/sponsorships`（掛在 `/api` 之下，見 `app/src/router/api.js`）。
- 認證：cookie session（`verifyToken`），不用 `Authorization` header。
- 授權：所有端點皆掛 `verifySponsorshipOwner`——單一 LINE userId（`SPONSORSHIP_OWNER_LINE_USER_ID`），非等級制。
  - Owner 未設定或格式錯誤 → **503**（fail closed，連本人都不放行）。
  - 已設定但呼叫者不是該 userId → **403**。
  - 未登入（無 session cookie）→ **401**。
  - 非同源 Origin 的寫入請求（POST）→ **403**（既有 CSRF 檢查，見 `AuthSessionService.isAllowedOrigin`）。
- 回應一律帶 `Cache-Control: no-store`。
- 金額欄位一律是十進位字串（例："1500.00"），不是 number。
- 錯誤回應形狀：`{ message: string, code: string, ...extra }`；`code` 是給前端判斷分支用的穩定值，`message` 是中文提示文字（可直接顯示但不保證文案不變）。
- `GET /api/me` 新增布林欄位 `canManageSponsorship`：僅供前端顯示/導覽用，不可作為授權依據（後端所有端點仍各自檢查）。

### 錯誤碼 → HTTP 狀態對照

| HTTP | 何時發生 |
| --- | --- |
| 400 | 輸入驗證失敗（見下方各端點 `code` 清單）、或 `USER_NOT_FOUND` |
| 401 | 未登入 |
| 403 | 非 owner；或寫入請求 Origin 不合法 |
| 404 | 資源不存在（`SPONSORSHIP_NOT_FOUND` 或路徑 id 格式不對） |
| 409 | 狀態衝突：`CONFLICT`（冪等鍵內容不同）、`ALREADY_BOUND_OTHER`、`NOT_HISTORY_TYPE` |
| 500 | 未預期例外（伺服端已記精簡摘要，不含 SQL/bindings） |
| 503 | owner 未配置 / 格式無效 |

## 1. `GET /owner/sponsorships/players?q=`

玩家搜尋（登記時選人用）。

**Query**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `q` | string, optional | 比對 `user.platform_id`（精確）或 `user.display_name`（模糊，`%q%`，自動跳脫 `%`/`_`）。空字串回傳空陣列。 |

**Response 200**

```json
{
  "items": [
    { "id": 42, "userId": "U0123...", "displayName": "罕罕", "pictureUrl": null }
  ]
}
```

- `id`：`user.id`（sponsorship 的 `user_id` 就是這個值，不是 LINE userId）。
- `userId`：LINE userId（`user.platform_id`）。
- `displayName`：可能為 `null`。
- `pictureUrl`：可能為 `null`；與搜尋同一次查詢帶出，前端不必再逐筆呼叫 `/api/profile/:userId` 補頭像。

## 2. `GET /owner/sponsorships/players/:id/summary`

該玩家累積登記贊助金額（TWD）＋贊助/序號清單。`:id` 是 `user.id`（整數）。

**Response 200**

```json
{
  "userId": 42,
  "totalAmount": "4500.00",
  "currency": "TWD",
  "sponsorships": [
    {
      "id": 1,
      "requestId": "req-abc",
      "type": "new",
      "userId": 42,
      "currency": "TWD",
      "amount": "1500.00",
      "receivedAt": "2026-09-09T02:00:00Z",
      "paymentMethod": "bank_transfer",
      "externalRef": null,
      "note": null,
      "cardKey": "month",
      "cardCount": 1,
      "operatorUserId": "Uowner...",
      "boundAt": null,
      "createdAt": "2026-09-09T02:00:01.000Z",
      "updatedAt": "2026-09-09T02:00:01.000Z",
      "coupons": [
        { "serialNumber": "uuid-...", "status": 0, "usedAt": null }
      ]
    }
  ]
}
```

- `totalAmount`：`SUM(amount)`，十進位字串；無資料時為 `"0.00"`。
- `sponsorships[].coupons`：`status` 0=未使用／1=已使用（對齊 `SubscribeCardCoupon.status`）。純贊助/歷史紀錄的 `coupons` 為空陣列。
- 錯誤：`:id` 非正整數 → 400。

## 3. `GET /owner/sponsorships/cards`

可用卡種清單（發卡表單選卡種/張數用）。讀既有 `subscribe_card`，不新增卡種管理。

**Response 200**

```json
{
  "items": [
    { "key": "month", "name": "月卡", "price": 500000, "duration": 30 }
  ]
}
```

## 4. `GET /owner/sponsorships`

贊助列表（分頁、篩選）。

**Query**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `type` | `"new"` \| `"history"`, optional | 不合法值視為不過濾 |
| `bound` | `"true"` \| `"false"`, optional | `true`=已綁定（`user_id IS NOT NULL`）、`false`=未綁定；缺省不過濾 |
| `page` | integer, optional, default 1 | 最小 1 |
| `perPage` | integer, optional, default 20 | 1~100 |

**Response 200**

```json
{
  "items": [ /* 同 §2 sponsorships[] 元素形狀，但不含 coupons 欄位 */ ],
  "page": 1,
  "perPage": 20,
  "total": 37
}
```

## 5. `GET /owner/sponsorships/:id`

單筆詳情。

**Response 200**：同 §2 單筆 sponsorship 形狀（含 `coupons`，額外帶 `usedBy`）。

```json
{
  "id": 1,
  "...": "...",
  "coupons": [
    { "serialNumber": "uuid-...", "status": 1, "usedAt": "2026-09-10T00:00:00.000Z", "usedBy": "U..." }
  ]
}
```

**404**：`id` 非正整數，或查無此紀錄（`message: "找不到此贊助紀錄"`，無 `code` 欄位）。

## 6. `POST /owner/sponsorships`

建立一筆贊助（新贊助或歷史補登）。

**Headers**

| Header | 必填 | 說明 |
| --- | --- | --- |
| `Idempotency-Key` | 是 | 必須與 body 的 `requestId` 完全一致，否則 400 |

**Request body**

```json
{
  "requestId": "前端產生的冪等鍵（string，任意格式，建議 UUID）",
  "type": "new",
  "user_id": 42,
  "currency": "TWD",
  "amount": "1500.00",
  "received_at": "2026-09-09T10:00:00+08:00",
  "payment_method": "bank_transfer",
  "external_ref": null,
  "note": null,
  "card_key": "month",
  "card_count": 1
}
```

只接受上述固定欄位（`type`/`user_id`/`currency`/`amount`/`received_at`/`payment_method`/`external_ref`/`note`/`card_key`/`card_count`，外加最外層的 `requestId`），任何其餘欄位一律拒絕（`UNKNOWN_FIELD`）。

| 欄位 | 規則 |
| --- | --- |
| `type` | 必填，`"new"` 或 `"history"` |
| `user_id` | `type=new` 必填且必須是既有 `user.id`；`type=history` 可為 `null`（未綁定） |
| `currency` | 必填，固定 `"TWD"`，其餘值拒絕 |
| `amount` | 必填，十進位字串，格式 `^\d{1,10}(\.\d{1,2})?$`，且數值 > 0（拒絕 0、負數、超過兩位小數、非數字字串、number 型別） |
| `received_at` | 必填，任何 moment 可解析格式；後端 normalize 為 UTC 秒精度 ISO 字串存入/回傳 |
| `payment_method` / `external_ref` / `note` | 選填，缺省/`null`/空字串一律視為 `null` |
| `card_key` | `card_count > 0` 時必填，且必須是 `"month"` 或 `"season"`；純贊助/歷史型必須是 `null` |
| `card_count` | `type=history` 固定 `0`；`type=new` 為 0（純贊助）或正整數（發卡張數），上限見下方常數 |

**卡數上限**：與 CLI 既有門檻對齊，`SubscribeCardCouponService.MAX_ISSUE_COUNT = 100`（超過拒絕，`INVALID_CARD_COUNT`）。

**Response 201**（新建立）／**200**（同 `requestId` 重送、內容相同的冪等回應）

```json
{
  "created": true,
  "sponsorship": { /* 同 §2 單筆形狀，不含 coupons */ },
  "serialNumbers": ["uuid-1", "uuid-2"]
}
```

- 純贊助（`card_count=0`）：`serialNumbers` 為空陣列。
- 歷史型：`serialNumbers` 恆為空陣列（歷史紀錄不發卡）。
- 重送同 `requestId` 且內容相同：`created: false`，`sponsorship`/`serialNumbers` 為原本建立時的結果。

**錯誤**

| `code` | HTTP | 說明 |
| --- | --- | --- |
| `UNKNOWN_FIELD` | 400 | 帶有未定義欄位；回應含 `fields: string[]` |
| `INVALID_TYPE` / `INVALID_CURRENCY` / `USER_REQUIRED` / `INVALID_USER_ID` / `INVALID_AMOUNT` / `INVALID_RECEIVED_AT` / `INVALID_CARD_COUNT` / `INVALID_CARD_KEY` / `CARD_KEY_REQUIRED` / `HISTORY_CANNOT_ISSUE_CARD` | 400 | 對應欄位驗證失敗 |
| `INVALID_REQUEST_ID` / `INVALID_OPERATOR` | 400 | 內部保護性錯誤（正常流程不會觸發：`requestId`/`operatorUserId` 缺失） |
| `USER_NOT_FOUND` | 400 | `user_id` 指定的玩家不存在（`type=new` 必查；`type=history` 若有填也會查） |
| `CONFLICT` | 409 | 同 `requestId` 重送但內容（fingerprint）不同 |

**Idempotency-Key 與 requestId 不一致或缺其一** → 400（`message: "Idempotency-Key 與 requestId 必須一致且皆為必填"`，無 `code`）。

## 7. `POST /owner/sponsorships/:id/bind`

歷史紀錄補綁玩家。`:id` 是 `sponsorship.id`。

**Request body**

```json
{ "userId": 42 }
```

`userId` 是 `user.id`（整數），必須是既有玩家。

**Response 200**

```json
{
  "bound": true,
  "sponsorship": { /* 同 §2 單筆形狀，不含 coupons */ }
}
```

- 未綁定 → 綁定成功：`bound: true`。
- 已綁定同一 target 重送：`bound: false`（不產生第二筆 audit，回傳現況，仍是 200 非錯誤）。

**錯誤**

| `code` | HTTP | 說明 |
| --- | --- | --- |
| `INVALID_USER_ID` | 400 | `userId` 非正整數 |
| `USER_NOT_FOUND` | 400 | `userId` 指定的玩家不存在 |
| `SPONSORSHIP_NOT_FOUND` | 404 | `:id` 查無此贊助紀錄 |
| `NOT_HISTORY_TYPE` | 409 | 該筆是 `type=new`，不可補綁 |
| `ALREADY_BOUND_OTHER` | 409 | 已綁定給別的玩家，不可換人 |

## 8. `GET /me` 新增欄位

```json
{
  "userId": "U...",
  "displayName": "...",
  "pictureUrl": null,
  "canManageSponsorship": true
}
```

`canManageSponsorship` 與 `verifySponsorshipOwner` 共用同一段 `isSponsorshipOwner(userId)` 判斷邏輯（見 `app/src/middleware/validation.js`），不會出現「`/me` 顯示能操作但實際端點 403」的分岔。

## 9. 前端注意事項（摘要，完整規則見主規格 §9）

- 金額欄位與任何序號只能存在 React state（記憶體），不得寫入 `localStorage`/`sessionStorage`。
- 同一元件生命週期內逾時重試沿用同一個 `requestId` 呼叫 `POST /`；頁面重新整理/重新掛載後不自動重送，需重新走表單並產生新的 `requestId`。
- 提交前應先呼叫列表/詳情核對是否已有相符紀錄，降低同一次操作重複建立的機率（不宣稱能防止跨表單重複記帳）。
