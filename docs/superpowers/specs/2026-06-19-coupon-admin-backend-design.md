# Coupon 管理後台 — 設計規格

- 日期：2026-06-19
- 分支：`feat/coupon-admin-backend`
- 狀態：設計定案，待轉實作計畫

## 目的

把現有「只能用 LINE 聊天指令 `!coupon add` 管理 coupon」的流程,搬到 Web 管理後台,並補上對應的 REST API。管理員可在後台新增、編輯、刪除 coupon、設定起訖日期,並查看每張 coupon 的領取統計。同時把建立邏輯收斂成單一 service,讓聊天指令與 Web 後台共用同一套驗證與寫入。

## 目標與非目標

目標:
- 後台完整 CRUD(列表、新增、編輯、刪除)。
- 每張 coupon 的領取統計(領取總數、最近領取明細、每日領取趨勢小圖)。
- 聊天指令 `!coupon add` 與 Web API 共用 `CouponService` 作為單一事實來源。

非目標(明確不做):
- 不新增 / 不修改任何 migration 與資料表結構。
- 不修改既有領取邏輯(`userUse`):每人限領 1 次、無全域總量上限,維持寫死。
- 獎勵只支援現有的女神石(`god_stone`),表單只填數量;不做獎勵類型選單。
- 不動 LINE 推播(本專案僅 reply-only)。

## 設計決策(來自需求釐清)

1. 範圍:完整 CRUD + 領取統計。
2. 獎勵類型:只做女神石(`{ type: "god_stone", value: N }`)。
3. 領取限制:維持現狀(每人 1 次、無總量上限),不動 schema 與領取邏輯。
4. 編輯/刪除守則:coupon 一旦有領取紀錄,`code` 鎖定不可改、刪除被保護;日期與獎勵仍可改。
5. 權限:全部 `privilege >= 5`(掛在現有 `/admin` 底層即滿足,不額外加 `verifyPrivilege(9)`)。

## 現況事實(已對程式碼驗證)

資料表:
- `coupon_code`：`id`、`code`(VARCHAR、UNIQUE、schema 限 1–50 字)、`reward`(JSON)、`start_at`(TIMESTAMP, nullable)、`end_at`(TIMESTAMP, nullable)、`created_at`、`updated_at`。
- `coupon_used_history`：`id`、`coupon_code_id`、`user_id`、`created_at`、`updated_at`,複合索引 `(coupon_code_id, user_id)`。**無 `used_at` 欄位,領取時間即 `created_at`。**

Model(`app/src/model/application/`):
- `CouponCode`：`table: "coupon_code"`,`fillable: ["code", "start_at", "end_at", "reward"]`,自有 `findByCode(code)`。
- `CouponUsedHistory`：`table: "coupon_used_history"`,`fillable: ["coupon_code_id", "user_id"]`,無自有方法。
- `base.js` 提供:`all({ filter, order, select, limit, pagination })`(回傳 knex QueryBuilder,需 await)、`first(...)`、`find(id)`、`create(attributes)`(回傳 insert id,依 fillable 過濾)、`update(id, attributes)`、`delete(id)`、`get knex`(回傳 `mysql(table)` query builder,尊重 trx)、`get connection`(raw knex,供 `.raw()`)。
  - `order` 格式為 `[{ column, direction }]`。
  - `EquipmentService.all({ sort })` / `.destroy()` 是 service 層自訂方法,不是 base;本設計的 service 方法名自訂。

驗證:
- `app/src/schema/application/commands/coupon.js` 匯出 `{ add: {...} }`;`add` 要求 `code`(1–50)、`startAt`(date-time)、`endAt`(date-time)、`reward`(number ≥ 1),四者皆 required。
- `app/src/util/ajv.js` 以 `ajv.addSchema(couponSchema.add, "couponAdd")` 註冊。取用:`const validate = ajv.getSchema("couponAdd"); validate(data)`;失敗時 `validate.errors` 為 AJV error 陣列。

控制器:
- `app/src/controller/application/CouponController.js`：
  - `exports.adminRouter = [text(/^[!]coupon add/, adminAdd)]`
  - `exports.router = [text(/^[/.#]兌換 (?<code>\S+)$/, userUse)]`
  - `adminAdd` 以 `minimist(context.event.text.split(" "))` 解析,取 `args._[2]`(code)、`--start/-s`、`--end/-e`、`--reward/-r`,驗證後 `moment(startAt).toDate()`、包 `{ type: "god_stone", value: reward }`,呼叫 `couponCode.create(...)`。
  - `app/src/app.js`：`...CouponController.router` 併入 `OrderBased`、`...CouponController.adminRouter` 併入 admin 指令鏈。這兩個 export 維持不變。

API 慣例:
- `app/src/router/api.js`：`router.use("/admin", verifyToken, verifyAdmin, verifyPrivilege(5))` 後掛各 admin 子 router,如 `router.use("/admin", AdminEquipmentRouter)`。
- `createRouter = require("express").Router`。
- handler 錯誤慣例:驗證錯誤 `res.status(400).json({ message: i18n.t("api.error.bad_request"), error: validate.errors })`;伺服器錯誤 `res.status(500).json({ message: i18n.t("api.error.unknown") })`。i18n:`const i18n = require("../../util/i18n")`。

前端:
- 後台選單:`frontend/src/components/NavDrawer.jsx` 的 `adminItems` 陣列(`{ label, path, icon }`)。
- 路由:`frontend/src/App.jsx` 的 `<Route element={<RequireAdmin />}>` 區塊。
- API client:`frontend/src/services/api.js`(axios 實例,401→登出導回、403→事件導回);service 模組如 `frontend/src/services/globalOrder.js`(每個動作一個 `api.get/post/put/delete(...).then(r => r.data)`)。
- 回饋 hooks:`frontend/src/hooks/useHintBar.js`(`[state,{handleOpen:showHint,handleClose}]`)、`frontend/src/hooks/useAlertDialog.js`(`[state,{handleOpen:showAlert,handleClose}]`),搭配 `components/HintSnackBar`、`components/AlertDialog`。
- 圖表:Recharts 已安裝(範例 `frontend/src/pages/XpHistory/DailyTrend.jsx`,`ResponsiveContainer` + `BarChart`)。
- 設計系統:`MEMORY/frontend-design.md` — 漸層 banner(`primary.dark→primary.main`)、`Paper borderRadius:3` + `Divider` 列、`Chip` 狀態(success/warning/default)、`Skeleton variant="rounded"` loading、空狀態置中 icon、`ToggleButtonGroup` 篩選。沿用 MUI 主題,不引入新配色/字型。

測試:
- `app/jest.config.js`：`transform: {}` → **`jest.mock()` 不會被 hoist,必須擺在 mocked 路徑的 `require()` 之前**。
- `app/__tests__/setup.js` 已 mock Redis、Knex、Bottender、i18n、Logger,並讓 validation middleware 注入 `req.profile`(含 `privilege: 9`)。
- 現有 coupon 測試僅 `app/__tests__/schema/coupon.test.js`(50 字界線),無 service/controller 測試。
- 前端無測試框架。

## 架構

三層,完全比照 Equipment 慣例:

```
聊天指令  CouponController.adminAdd ─┐
                                    ├─► CouponService ─► CouponCode / CouponUsedHistory (models) ─► MySQL
Web API   handler/Coupon/admin.js ──┘
```

### CouponService(`app/src/service/CouponService.js`,新)

單一事實來源。對外方法:

- `create({ code, startAt, endAt, reward })`
  - 以 `ajv.getSchema("couponAdd")` 驗證;失敗丟 `err`(`err.code = "COUPON_INVALID"`、`err.errors = validate.errors`)。
  - 時間順序:`endAt` 必須晚於 `startAt`,否則丟 `err.code = "COUPON_INVALID"`(schema 只驗格式不驗順序;聊天指令與直接呼叫 API 會繞過前端檢查,故在 service 層補一道)。
  - 唯一性:若 `code` 已存在(`CouponCode.findByCode`)丟 `err.code = "COUPON_DUPLICATED"`。
  - 寫入:`CouponCode.create({ code, start_at: moment(startAt).toDate(), end_at: moment(endAt).toDate(), reward: { type: "god_stone", value: reward } })`,回傳新 id。
- `list()`
  - `CouponCode.all({ order: [{ column: "created_at", direction: "desc" }] })`。
  - 一次聚合領取數:`CouponUsedHistory.knex.select("coupon_code_id").count("* as count").groupBy("coupon_code_id")`,組成 `Map`,merge 進每筆為 `redeemedCount`(無紀錄為 0)。MySQL `count` 回傳字串,需 `Number(...)` 轉型(`redeemedCount`、`dailyRedemptions[].count` 皆同)。
  - 回傳陣列,每筆含原欄位 + `redeemedCount`。
- `find(id)`
  - `coupon = CouponCode.find(id)`;不存在回 `null`。
  - `redeemedCount`:`CouponUsedHistory.knex.where({ coupon_code_id: id }).count(...)`。
  - `redemptions`:最近 100 筆 `CouponUsedHistory.all({ filter: { coupon_code_id: id }, order: [{ column: "created_at", direction: "desc" }], limit: 100 })`,回 `[{ user_id, created_at }]`。
  - `dailyRedemptions`:`CouponUsedHistory.knex.where({ coupon_code_id: id }).select(connection.raw("DATE(created_at) as date")).count("* as count").groupBy("date")` → `[{ date, count }]`(全量,不受 100 筆上限影響)。
  - 回傳 `{ ...coupon, redeemedCount, redemptions, dailyRedemptions }`。
- `update(id, { code, startAt, endAt, reward })`
  - 載入現有 coupon;不存在丟 `err.code = "COUPON_NOT_FOUND"`。
  - 以 `couponAdd` 驗證 payload,並同樣檢查 `endAt > startAt`(同 create)。
  - 計算 `redeemedCount`。守則:
    - 若 `redeemedCount > 0` 且 `code !== coupon.code` → 丟 `err.code = "COUPON_CODE_LOCKED"`。
    - 若 `code !== coupon.code` 且新 `code` 已被其他 coupon 使用 → 丟 `err.code = "COUPON_DUPLICATED"`。
  - `CouponCode.update(id, { code, start_at: moment(startAt).toDate(), end_at: moment(endAt).toDate(), reward: { type: "god_stone", value: reward } })`。
- `destroy(id)`
  - 載入;不存在丟 `COUPON_NOT_FOUND`。
  - 若 `redeemedCount > 0` → 丟 `err.code = "COUPON_HAS_REDEMPTIONS"`。
  - 否則 `CouponCode.delete(id)`。

錯誤模型:service 一律丟帶 `err.code`(字串列舉)的 Error;HTTP handler 與聊天指令各自把 `err.code` 對應成 status/回覆訊息。

### HTTP 層

router:`app/src/router/Coupon/index.js`(新)

```js
const createRouter = require("express").Router;
const AdminRouter = createRouter();
const { admin: adminHandler } = require("../../handler/Coupon");

AdminRouter.get("/coupons", adminHandler.list);
AdminRouter.get("/coupons/:id", adminHandler.detail);
AdminRouter.post("/coupons", adminHandler.store);
AdminRouter.put("/coupons/:id", adminHandler.update);
AdminRouter.delete("/coupons/:id", adminHandler.destroy);

exports.admin = AdminRouter;
```

handler index:`app/src/handler/Coupon/index.js`(新)`exports.admin = require("./admin");`

handler:`app/src/handler/Coupon/admin.js`(新),呼叫 `CouponService`,把 `err.code` 對應 status:

| 情境 | status | body |
| --- | --- | --- |
| 成功(list/detail) | 200 | 資料 |
| 成功(create) | 201 | `{ id }` |
| 成功(update/delete) | 200 | `{}` |
| `COUPON_INVALID` | 400 | `{ message: i18n.t("api.error.bad_request"), error }` |
| `COUPON_DUPLICATED` | 409 | `{ message: "兌換碼已存在" }` |
| `COUPON_CODE_LOCKED` | 409 | `{ message: "已有領取紀錄,無法修改兌換碼" }` |
| `COUPON_HAS_REDEMPTIONS` | 409 | `{ message: "已有領取紀錄,無法刪除" }` |
| `COUPON_NOT_FOUND` | 404 | `{ message: "找不到此兌換券" }` |
| 其他 | 500 | `{ message: i18n.t("api.error.unknown") }` |

(409/404 訊息可改走 i18n key;若採 i18n,於 `app/locales` 新增對應鍵。)

`app/src/router/api.js` 變更:
- import:`const { admin: AdminCouponRouter } = require("./Coupon");`
- 掛載:`router.use("/admin", AdminCouponRouter);`(在既有 admin 子 router 之後)

### REST 契約

請求 body(create / update 共用,沿用 `couponAdd`):

```json
{ "code": "XMAS2026", "startAt": "2026-12-01T00:00:00Z", "endAt": "2026-12-31T23:59:59Z", "reward": 500 }
```

- `startAt` / `endAt`:ISO 8601 字串;service 以 `moment(...).toDate()` 寫入。
- `reward`:女神石數量(number ≥ 1);service 包成 `{ type: "god_stone", value: reward }`。
- 編輯時 `code` 即使在前端鎖定,仍帶現值送出(讓單一 schema 可重用)。

回應:
- list 每筆:`{ id, code, reward, start_at, end_at, created_at, updated_at, redeemedCount }`。
- detail:上述 + `redemptions: [{ user_id, created_at }]`(最近 100)+ `dailyRedemptions: [{ date, count }]`。

## 聊天指令收斂

`CouponController.adminAdd` 重構:
- 保留:`minimist` 解析、`-h/--help` 用法回覆、取參數、成功/失敗的 `context.replyText`。
- 改為呼叫:`const id = await CouponService.create({ code, startAt, endAt, reward })`。
- 例外對應:`err.code === "COUPON_INVALID"` → 回 `message.coupon.admin_add_invalid_param`;`err.code === "COUPON_DUPLICATED"` → 回適當訊息(可沿用既有失敗訊息或新增鍵);其他 → `DefaultLogger.error` + `message.coupon.admin_add_failed`。
- 驗證、moment 轉換、reward 包裝、`couponCode.create` 全移入 service。`exports.router` / `exports.adminRouter` 與 `app.js` 併入點不變。
- `userUse` 完全不動。

## 前端

新增檔案:
- `frontend/src/services/coupon.js`
  ```js
  import api from "./api";
  export const fetchCoupons = () => api.get("/api/admin/coupons").then(r => r.data);
  export const fetchCoupon = id => api.get(`/api/admin/coupons/${id}`).then(r => r.data);
  export const createCoupon = payload => api.post("/api/admin/coupons", payload).then(r => r.data);
  export const updateCoupon = (id, payload) => api.put(`/api/admin/coupons/${id}`, payload).then(r => r.data);
  export const deleteCoupon = id => api.delete(`/api/admin/coupons/${id}`).then(r => r.data);
  ```
- `frontend/src/pages/Admin/Coupon.jsx`(default export,App.jsx 以 `AdminCoupons` 匯入)。

變更檔案:
- `frontend/src/App.jsx`:`RequireAdmin` 區塊加 `<Route path="admin/coupons" element={<AdminCoupons />} />` 並 import 頁面。
- `frontend/src/components/NavDrawer.jsx`:`adminItems` 加 `{ label: "優惠券管理", path: "/admin/coupons", icon: ConfirmationNumberIcon }`(import 該 icon)。

頁面結構(照 frontend-design.md):
1. 漸層 Banner:`primary.dark→primary.main`、48px `ConfirmationNumberIcon`(白 0.8)、標題「Coupon 管理」、副標、Chip(`共 N 張`、`進行中 N`)、「新增 coupon」按鈕(`rgba(255,255,255,0.2)` 風格)。
2. 篩選列:code 搜尋 `TextField` + `ToggleButtonGroup`(全部 / 進行中 / 尚未啟用 / 已過期),前端對已抓回清單過濾。
3. 清單:`Paper`(`borderRadius:3`),`Divider` 分隔。每列:`ConfirmationNumberIcon` + `code`(等寬)+ 獎勵 Chip(`女神石 ×N`,`RedeemIcon`)+ 起訖時間(`caption`)+ 狀態 Chip + 領取數 Chip + 動作 icon(查看領取 / 編輯 / 刪除);hover 列輕微 highlight。
4. Loading:`Skeleton variant="rounded"` 仿列;空清單置中 icon + 說明;錯誤 `Alert severity="error"`。

狀態 Chip(色 + icon + 文字三重區分):
- 進行中(`start_at ≤ now ≤ end_at`)→ `color="success"` + `CheckCircleIcon`
- 尚未啟用(`now < start_at`)→ `color="warning"` + `ScheduleIcon`
- 已過期(`now > end_at`)→ `color="default"` + `BlockIcon`
- 邊界:`start_at` 為 null 視為已啟用;`end_at` 為 null 視為永不過期。

新增/編輯對話框(MUI `Dialog`,受控輸入):
- `code`:必填,`maxLength 50`,`helperText` 顯示規則;**編輯且 `redeemedCount > 0` 時 `disabled`** + helper「已有人領取,無法修改」。
- 起始 / 結束:`type="datetime-local"`,`slotProps={{ inputLabel: { shrink: true } }}`;以 `toLocalDateTimeString`(GachaBanner 既有寫法)在地化顯示,送出前 `new Date(v).toISOString()`。
- 獎勵:`type="number"`,min 1。
- 前端先驗:必填、結束晚於開始;失敗以 `helperText` + `error` 就地提示。
- 送出鈕 `disabled={saving}` + spinner,防重複送出;成功/失敗以 `showHint`;刪除走 `showAlert` 二次確認。
- icon-only 按鈕掛 `aria-label` + `Tooltip`;尊重 `prefers-reduced-motion`;375/768/1024/1440 響應式。

領取明細抽屜(`Drawer` 右側,點「查看領取」開啟,呼叫 `fetchCoupon(id)`):
- 頂部 KPI:`總領取數`(`redeemedCount`)。
- 每日領取小圖:Recharts `ResponsiveContainer` + `BarChart`,資料 `dailyRedemptions`。
- 最近 100 筆清單:`user_id`(截斷顯示)+ `created_at`。

## 錯誤處理

- 後端:service 丟帶 `err.code` 的 Error;handler 對應上表 status。所有 handler 包 try/catch,未知錯誤 500 + `i18n.t("api.error.unknown")`,並 `DefaultLogger.error`。
- 驗證沿用 `couponAdd`(前後端規則一致)。
- 前端:axios interceptor 已處理 401/403;頁面層對 4xx/5xx 以 `showHint` 顯示 `err.response?.data?.message`,fallback 通用訊息。

## 測試計畫

後端(Jest,`jest.mock` 一律置於 `require` 之前):
- `app/__tests__/service/CouponService.test.js`(新):mock `CouponCode`、`CouponUsedHistory`。
  - `create`:合法 → 以包好的 reward 與 `Date` 呼叫 `CouponCode.create`、回 id;非法 → 丟 `COUPON_INVALID`;重複 code → 丟 `COUPON_DUPLICATED`。
  - `list`:正確 merge `redeemedCount`(含 0)。
  - `find`:回傳 coupon + count + 最近 100 + dailyRedemptions;不存在回 null。
  - `update`:已領取改 code → `COUPON_CODE_LOCKED`;改成已存在 code → `COUPON_DUPLICATED`;只改日期/獎勵 → 成功;不存在 → `COUPON_NOT_FOUND`。
  - `destroy`:有領取 → `COUPON_HAS_REDEMPTIONS`;無領取 → 成功;不存在 → `COUPON_NOT_FOUND`。
- `app/__tests__/handler/Coupon/admin.test.js`(新):mock `CouponService`,以 `mockReq/mockRes` 驗證各方法把成功與各 `err.code` 對應到正確 status / body。
- `app/__tests__/controller/CouponController.test.js`(新,可選但建議):mock `CouponService.create`,驗證 `adminAdd` 委派與例外→回覆對應。
- `app/__tests__/schema/coupon.test.js`:維持不變、保持綠燈。

前端:無測試框架,以手動驗證(列表、新增、編輯鎖 code、保護刪除、明細抽屜小圖)。

驗收(對照需求):新增並設定起訖 → 列表出現且狀態正確;領取後再編輯 → code 鎖定;有領取的券刪除 → 被擋並提示;明細顯示領取數、最近清單與每日小圖;聊天指令 `!coupon add` 仍可用(走同一 service)。

## 檔案異動清單

新增:
- `app/src/service/CouponService.js`
- `app/src/router/Coupon/index.js`
- `app/src/handler/Coupon/index.js`
- `app/src/handler/Coupon/admin.js`
- `frontend/src/services/coupon.js`
- `frontend/src/pages/Admin/Coupon.jsx`
- `app/__tests__/service/CouponService.test.js`
- `app/__tests__/handler/Coupon/admin.test.js`
- `app/__tests__/controller/CouponController.test.js`(可選)

修改:
- `app/src/router/api.js`(掛 AdminCouponRouter)
- `app/src/controller/application/CouponController.js`(`adminAdd` 委派給 service)
- `frontend/src/App.jsx`(coupons 路由)
- `frontend/src/components/NavDrawer.jsx`(選單項目)
- (若 409/404 走 i18n)`app/locales/*` 對應鍵

不需 migration;不改領取邏輯;不改資料表。

## 建置順序(供實作計畫參考)

1. 後端 `CouponService` + 單元測試(TDD)。
2. handler + router + 掛載 + handler 測試。
3. `CouponController.adminAdd` 重構委派 + 測試;確認既有 schema 測試綠燈。
4. 前端 service + 頁面(列表/篩選/狀態)。
5. 前端 新增/編輯對話框(含 code 鎖定、日期、驗證)。
6. 前端 領取明細抽屜(KPI + 每日小圖 + 清單)。
7. 路由 + 選單接線;手動驗收。
