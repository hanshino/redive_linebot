# Coupon 管理後台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓管理員在 Web 後台對 coupon 做完整 CRUD 與查看領取統計,並把聊天指令 `!coupon add` 收斂到同一個 service。

**Architecture:** 後端三層(model query 方法 → `CouponService` 單一事實來源 → handler/router 掛 `/admin`);聊天指令 `adminAdd` 改為委派 `CouponService.create`。前端新增 service + 一頁(列表/篩選/對話框/明細抽屜),接上 `App.jsx` 路由與 `NavDrawer` 選單。

**Tech Stack:** 後端 Bottender + Express + Knex(CommonJS)、AJV、moment、Jest。前端 React 19 + MUI 7 + Recharts(已安裝)、axios。

## Global Constraints

- 不新增/不修改 migration、不改資料表結構。
- 不改既有領取邏輯 `userUse`(每人 1 次、無總量上限)。
- 獎勵只支援 `god_stone`,寫成 `{ type: "god_stone", value: <number> }`。
- 權限:掛在 `/admin`(已 `verifyToken + verifyAdmin + verifyPrivilege(5)`),不另加門檻。
- create/update 共用已註冊的 AJV schema `couponAdd`(`ajv.getSchema("couponAdd")`)。
- 後端 CommonJS、雙引號、prettier(es5 trailing comma、100 寬);前端 ESM。
- 領取數聚合查詢放在 `CouponUsedHistory` model(比照既有 `findByCode`),非 service 內寫裸 knex。
- 不用 LINE Push;前端用原生 `datetime-local`,不加 date 套件。
- Jest `transform:{}` → `jest.mock()` 必須在 mocked 路徑 `require()` 之前。
- 分支 `feat/coupon-admin-backend`(已建);工作區既有的 `AiResponder` 改動不要動。

---

### Task 1: 後端資料邏輯(model 查詢方法 + CouponService + 單元測試)

**Files:**
- Modify: `app/src/model/application/CouponUsedHistory.js`
- Create: `app/src/service/CouponService.js`
- Test: `app/__tests__/service/CouponService.test.js`

**Interfaces:**
- Consumes: `CouponCode`(`findByCode/find/all/create/update/delete`)、`CouponUsedHistory`(新方法)、`ajv.getSchema("couponAdd")`、`moment`。
- Produces:
  - `CouponService.create({ code, startAt, endAt, reward }) -> Promise<number>`(回傳新 id)
  - `CouponService.list() -> Promise<Array<coupon & { redeemedCount:number }>>`
  - `CouponService.find(id) -> Promise<(coupon & { redeemedCount, redemptions:[{user_id,created_at}], dailyRedemptions:[{date,count}] }) | null>`
  - `CouponService.update(id, { code, startAt, endAt, reward }) -> Promise<void>`
  - `CouponService.destroy(id) -> Promise<void>`
  - 失敗丟 `Error` 帶 `err.code`：`COUPON_INVALID`(含 `err.errors`)、`COUPON_DUPLICATED`、`COUPON_NOT_FOUND`、`COUPON_CODE_LOCKED`、`COUPON_HAS_REDEMPTIONS`。
  - `CouponUsedHistory.countGroupedByCoupon() -> Promise<[{coupon_code_id,count}]>`
  - `CouponUsedHistory.countByCoupon(id) -> Promise<number>`
  - `CouponUsedHistory.recentByCoupon(id, limit) -> Promise<[{user_id,created_at}]>`
  - `CouponUsedHistory.dailyByCoupon(id) -> Promise<[{date,count}]>`

- [ ] **Step 1: 寫測試(red)** — `app/__tests__/service/CouponService.test.js`

```js
// jest.mock MUST precede requires (jest.config transform:{} = no hoist)
jest.mock("../../src/model/application/CouponCode", () => ({
  findByCode: jest.fn(),
  find: jest.fn(),
  all: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}));
jest.mock("../../src/model/application/CouponUsedHistory", () => ({
  countGroupedByCoupon: jest.fn(),
  countByCoupon: jest.fn(),
  recentByCoupon: jest.fn(),
  dailyByCoupon: jest.fn(),
}));

const CouponCode = require("../../src/model/application/CouponCode");
const CouponUsedHistory = require("../../src/model/application/CouponUsedHistory");
const CouponService = require("../../src/service/CouponService");

const valid = {
  code: "XMAS",
  startAt: "2026-12-01T00:00:00Z",
  endAt: "2026-12-31T00:00:00Z",
  reward: 500,
};

beforeEach(() => jest.clearAllMocks());

describe("CouponService.create", () => {
  it("creates with wrapped reward + Date fields, returns id", async () => {
    CouponCode.findByCode.mockResolvedValue(undefined);
    CouponCode.create.mockResolvedValue(7);

    const id = await CouponService.create(valid);

    expect(id).toBe(7);
    const row = CouponCode.create.mock.calls[0][0];
    expect(row.code).toBe("XMAS");
    expect(row.reward).toEqual({ type: "god_stone", value: 500 });
    expect(row.start_at).toBeInstanceOf(Date);
    expect(row.end_at).toBeInstanceOf(Date);
  });

  it("throws COUPON_INVALID on bad payload", async () => {
    await expect(CouponService.create({ ...valid, reward: 0 })).rejects.toMatchObject({
      code: "COUPON_INVALID",
    });
  });

  it("throws COUPON_INVALID when endAt <= startAt", async () => {
    CouponCode.findByCode.mockResolvedValue(undefined);
    await expect(
      CouponService.create({ ...valid, endAt: valid.startAt })
    ).rejects.toMatchObject({ code: "COUPON_INVALID" });
  });

  it("throws COUPON_DUPLICATED when code exists", async () => {
    CouponCode.findByCode.mockResolvedValue({ id: 1, code: "XMAS" });
    await expect(CouponService.create(valid)).rejects.toMatchObject({
      code: "COUPON_DUPLICATED",
    });
  });
});

describe("CouponService.list", () => {
  it("merges redeemedCount (0 when none)", async () => {
    CouponCode.all.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    CouponUsedHistory.countGroupedByCoupon.mockResolvedValue([
      { coupon_code_id: 1, count: "3" },
    ]);

    const rows = await CouponService.list();

    expect(rows).toEqual([
      { id: 1, redeemedCount: 3 },
      { id: 2, redeemedCount: 0 },
    ]);
  });
});

describe("CouponService.find", () => {
  it("returns null when missing", async () => {
    CouponCode.find.mockResolvedValue(undefined);
    expect(await CouponService.find(9)).toBeNull();
  });

  it("returns coupon + stats", async () => {
    CouponCode.find.mockResolvedValue({ id: 1, code: "X" });
    CouponUsedHistory.countByCoupon.mockResolvedValue(2);
    CouponUsedHistory.recentByCoupon.mockResolvedValue([
      { user_id: "U1", created_at: "2026-12-02T00:00:00Z" },
    ]);
    CouponUsedHistory.dailyByCoupon.mockResolvedValue([
      { date: "2026-12-02", count: "2" },
    ]);

    const out = await CouponService.find(1);

    expect(out.redeemedCount).toBe(2);
    expect(out.redemptions).toHaveLength(1);
    expect(out.dailyRedemptions).toEqual([{ date: "2026-12-02", count: 2 }]);
  });
});

describe("CouponService.update", () => {
  it("throws COUPON_NOT_FOUND when missing", async () => {
    CouponCode.find.mockResolvedValue(undefined);
    await expect(CouponService.update(9, valid)).rejects.toMatchObject({
      code: "COUPON_NOT_FOUND",
    });
  });

  it("locks code change when redeemed", async () => {
    CouponCode.find.mockResolvedValue({ id: 1, code: "OLD" });
    CouponUsedHistory.countByCoupon.mockResolvedValue(1);
    await expect(CouponService.update(1, valid)).rejects.toMatchObject({
      code: "COUPON_CODE_LOCKED",
    });
  });

  it("rejects duplicate new code", async () => {
    CouponCode.find.mockResolvedValue({ id: 1, code: "OLD" });
    CouponUsedHistory.countByCoupon.mockResolvedValue(0);
    CouponCode.findByCode.mockResolvedValue({ id: 2, code: "XMAS" });
    await expect(CouponService.update(1, valid)).rejects.toMatchObject({
      code: "COUPON_DUPLICATED",
    });
  });

  it("updates dates/reward when code unchanged", async () => {
    CouponCode.find.mockResolvedValue({ id: 1, code: "XMAS" });
    CouponCode.update.mockResolvedValue(1);
    await CouponService.update(1, valid);
    expect(CouponCode.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ reward: { type: "god_stone", value: 500 } })
    );
    expect(CouponUsedHistory.countByCoupon).not.toHaveBeenCalled();
  });
});

describe("CouponService.destroy", () => {
  it("throws COUPON_NOT_FOUND when missing", async () => {
    CouponCode.find.mockResolvedValue(undefined);
    await expect(CouponService.destroy(9)).rejects.toMatchObject({
      code: "COUPON_NOT_FOUND",
    });
  });

  it("throws COUPON_HAS_REDEMPTIONS when used", async () => {
    CouponCode.find.mockResolvedValue({ id: 1 });
    CouponUsedHistory.countByCoupon.mockResolvedValue(1);
    await expect(CouponService.destroy(1)).rejects.toMatchObject({
      code: "COUPON_HAS_REDEMPTIONS",
    });
  });

  it("deletes when unused", async () => {
    CouponCode.find.mockResolvedValue({ id: 1 });
    CouponUsedHistory.countByCoupon.mockResolvedValue(0);
    CouponCode.delete.mockResolvedValue(1);
    await CouponService.destroy(1);
    expect(CouponCode.delete).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd app && yarn test -- __tests__/service/CouponService.test.js`
Expected: FAIL(`Cannot find module .../service/CouponService`)。

- [ ] **Step 3: 加 model 查詢方法** — `app/src/model/application/CouponUsedHistory.js`

```js
const base = require("../base");

class CouponUsedHistory extends base {
  countGroupedByCoupon() {
    return this.knex.select("coupon_code_id").count("* as count").groupBy("coupon_code_id");
  }

  async countByCoupon(couponCodeId) {
    const [row] = await this.knex.where({ coupon_code_id: couponCodeId }).count("* as count");
    return Number(row ? row.count : 0);
  }

  recentByCoupon(couponCodeId, limit = 100) {
    return this.knex
      .where({ coupon_code_id: couponCodeId })
      .select("user_id", "created_at")
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  dailyByCoupon(couponCodeId) {
    return this.knex
      .where({ coupon_code_id: couponCodeId })
      .select(this.connection.raw("DATE(created_at) as date"))
      .count("* as count")
      .groupBy("date")
      .orderBy("date", "asc");
  }
}

module.exports = new CouponUsedHistory({
  table: "coupon_used_history",
  fillable: ["coupon_code_id", "user_id"],
});
```

- [ ] **Step 4: 寫 CouponService** — `app/src/service/CouponService.js`

```js
const ajv = require("../util/ajv");
const moment = require("moment");
const couponCode = require("../model/application/CouponCode");
const couponUsedHistory = require("../model/application/CouponUsedHistory");

function fail(code, extra) {
  const err = new Error(code);
  err.code = code;
  if (extra) Object.assign(err, extra);
  return err;
}

function assertValid({ code, startAt, endAt, reward }) {
  const validate = ajv.getSchema("couponAdd");
  if (!validate({ code, startAt, endAt, reward })) {
    throw fail("COUPON_INVALID", { errors: validate.errors });
  }
  if (moment(endAt).isSameOrBefore(moment(startAt))) {
    throw fail("COUPON_INVALID");
  }
}

function toRow({ code, startAt, endAt, reward }) {
  return {
    code,
    start_at: moment(startAt).toDate(),
    end_at: moment(endAt).toDate(),
    reward: { type: "god_stone", value: reward },
  };
}

async function create(payload) {
  assertValid(payload);
  if (await couponCode.findByCode(payload.code)) throw fail("COUPON_DUPLICATED");
  return couponCode.create(toRow(payload));
}

async function list() {
  const coupons = await couponCode.all({ order: [{ column: "created_at", direction: "desc" }] });
  const counts = await couponUsedHistory.countGroupedByCoupon();
  const countMap = new Map(counts.map(r => [r.coupon_code_id, Number(r.count)]));
  return coupons.map(c => ({ ...c, redeemedCount: countMap.get(c.id) || 0 }));
}

async function find(id) {
  const coupon = await couponCode.find(id);
  if (!coupon) return null;
  const [redeemedCount, redemptions, daily] = await Promise.all([
    couponUsedHistory.countByCoupon(id),
    couponUsedHistory.recentByCoupon(id, 100),
    couponUsedHistory.dailyByCoupon(id),
  ]);
  return {
    ...coupon,
    redeemedCount,
    redemptions,
    dailyRedemptions: daily.map(r => ({
      date: moment(r.date).format("YYYY-MM-DD"),
      count: Number(r.count),
    })),
  };
}

async function update(id, payload) {
  const coupon = await couponCode.find(id);
  if (!coupon) throw fail("COUPON_NOT_FOUND");
  assertValid(payload);
  if (payload.code !== coupon.code) {
    if ((await couponUsedHistory.countByCoupon(id)) > 0) throw fail("COUPON_CODE_LOCKED");
    if (await couponCode.findByCode(payload.code)) throw fail("COUPON_DUPLICATED");
  }
  await couponCode.update(id, toRow(payload));
}

async function destroy(id) {
  const coupon = await couponCode.find(id);
  if (!coupon) throw fail("COUPON_NOT_FOUND");
  if ((await couponUsedHistory.countByCoupon(id)) > 0) throw fail("COUPON_HAS_REDEMPTIONS");
  await couponCode.delete(id);
}

module.exports = { create, list, find, update, destroy };
```

- [ ] **Step 5: 跑測試確認通過 + lint**

Run: `cd app && yarn test -- __tests__/service/CouponService.test.js && yarn lint`
Expected: PASS;lint 無錯。

- [ ] **Step 6: Commit**

```bash
git add app/src/model/application/CouponUsedHistory.js app/src/service/CouponService.js app/__tests__/service/CouponService.test.js
git commit -m "feat(coupon): add CouponService + redemption query methods"
```

---

### Task 2: HTTP 層(handler + router + 掛載 + handler 測試)

**Files:**
- Create: `app/src/handler/Coupon/admin.js`
- Create: `app/src/handler/Coupon/index.js`
- Create: `app/src/router/Coupon/index.js`
- Modify: `app/src/router/api.js`(import + mount)
- Test: `app/__tests__/handler/Coupon/admin.test.js`

**Interfaces:**
- Consumes: `CouponService`(Task 1)、`i18n`。
- Produces: `exports.list/detail/store/update/destroy`(Express handlers);router `exports.admin`;status 對應:200/201、400(`COUPON_INVALID`)、404(`COUPON_NOT_FOUND`)、409(`COUPON_DUPLICATED|COUPON_CODE_LOCKED|COUPON_HAS_REDEMPTIONS`)、500(其他)。

- [ ] **Step 1: 寫測試(red)** — `app/__tests__/handler/Coupon/admin.test.js`

```js
jest.mock("../../../src/service/CouponService", () => ({
  list: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
}));
jest.mock("../../../src/util/i18n", () => ({ t: jest.fn(k => k) }));

const CouponService = require("../../../src/service/CouponService");
const handler = require("../../../src/handler/Coupon/admin");

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}
const req = (over = {}) => ({ params: {}, body: {}, ...over });

beforeEach(() => jest.clearAllMocks());

it("list -> 200 with data", async () => {
  CouponService.list.mockResolvedValue([{ id: 1 }]);
  const res = mockRes();
  await handler.list(req(), res);
  expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
});

it("detail -> 404 when null", async () => {
  CouponService.find.mockResolvedValue(null);
  const res = mockRes();
  await handler.detail(req({ params: { id: "9" } }), res);
  expect(res.status).toHaveBeenCalledWith(404);
});

it("store -> 201 with id", async () => {
  CouponService.create.mockResolvedValue(5);
  const res = mockRes();
  await handler.store(req({ body: { code: "X" } }), res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ id: 5 });
});

it("store -> 400 on COUPON_INVALID", async () => {
  CouponService.create.mockRejectedValue(Object.assign(new Error(), { code: "COUPON_INVALID", errors: [] }));
  const res = mockRes();
  await handler.store(req(), res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it("update -> 409 on COUPON_CODE_LOCKED", async () => {
  CouponService.update.mockRejectedValue(Object.assign(new Error(), { code: "COUPON_CODE_LOCKED" }));
  const res = mockRes();
  await handler.update(req({ params: { id: "1" }, body: {} }), res);
  expect(res.status).toHaveBeenCalledWith(409);
});

it("destroy -> 409 on COUPON_HAS_REDEMPTIONS", async () => {
  CouponService.destroy.mockRejectedValue(Object.assign(new Error(), { code: "COUPON_HAS_REDEMPTIONS" }));
  const res = mockRes();
  await handler.destroy(req({ params: { id: "1" } }), res);
  expect(res.status).toHaveBeenCalledWith(409);
});

it("destroy -> 500 on unknown", async () => {
  CouponService.destroy.mockRejectedValue(new Error("boom"));
  const res = mockRes();
  await handler.destroy(req({ params: { id: "1" } }), res);
  expect(res.status).toHaveBeenCalledWith(500);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd app && yarn test -- __tests__/handler/Coupon/admin.test.js`
Expected: FAIL(找不到 handler 模組)。

- [ ] **Step 3: 寫 handler** — `app/src/handler/Coupon/admin.js`

```js
const CouponService = require("../../service/CouponService");
const i18n = require("../../util/i18n");

const CONFLICT = {
  COUPON_DUPLICATED: "兌換碼已存在",
  COUPON_CODE_LOCKED: "已有領取紀錄，無法修改兌換碼",
  COUPON_HAS_REDEMPTIONS: "已有領取紀錄，無法刪除",
};

function respondError(res, e) {
  if (e.code === "COUPON_INVALID") {
    return res.status(400).json({ message: i18n.t("api.error.bad_request"), error: e.errors });
  }
  if (e.code === "COUPON_NOT_FOUND") {
    return res.status(404).json({ message: "找不到此兌換券" });
  }
  if (CONFLICT[e.code]) {
    return res.status(409).json({ message: CONFLICT[e.code] });
  }
  return res.status(500).json({ message: i18n.t("api.error.unknown") });
}

exports.list = async (req, res) => {
  try {
    res.json(await CouponService.list());
  } catch (e) {
    respondError(res, e);
  }
};

exports.detail = async (req, res) => {
  try {
    const coupon = await CouponService.find(req.params.id);
    if (!coupon) return res.status(404).json({ message: "找不到此兌換券" });
    res.json(coupon);
  } catch (e) {
    respondError(res, e);
  }
};

exports.store = async (req, res) => {
  try {
    const id = await CouponService.create(req.body);
    res.status(201).json({ id });
  } catch (e) {
    respondError(res, e);
  }
};

exports.update = async (req, res) => {
  try {
    await CouponService.update(req.params.id, req.body);
    res.json({});
  } catch (e) {
    respondError(res, e);
  }
};

exports.destroy = async (req, res) => {
  try {
    await CouponService.destroy(req.params.id);
    res.json({});
  } catch (e) {
    respondError(res, e);
  }
};
```

- [ ] **Step 4: 寫 handler index** — `app/src/handler/Coupon/index.js`

```js
exports.admin = require("./admin");
```

- [ ] **Step 5: 寫 router** — `app/src/router/Coupon/index.js`

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

- [ ] **Step 6: 掛載到 api.js** — `app/src/router/api.js`

在既有 Equipment import 旁(約 line 30)加:
```js
const { admin: AdminCouponRouter } = require("./Coupon");
```
在 `router.use("/admin", AdminEquipmentRouter);` 之後(約 line 47)加:
```js
router.use("/admin", AdminCouponRouter);
```

- [ ] **Step 7: 跑測試 + lint**

Run: `cd app && yarn test -- __tests__/handler/Coupon/admin.test.js && yarn lint`
Expected: PASS;lint 無錯。

- [ ] **Step 8: Commit**

```bash
git add app/src/handler/Coupon app/src/router/Coupon app/src/router/api.js app/__tests__/handler/Coupon
git commit -m "feat(coupon): add admin coupon REST API"
```

---

### Task 3: 收斂聊天指令(adminAdd 委派 CouponService.create)

**Files:**
- Modify: `app/src/controller/application/CouponController.js`

**Interfaces:**
- Consumes: `CouponService.create`(Task 1)。
- Produces: 行為不變的 `adminAdd`;`exports.router/adminRouter` 與 `app.js` 併入點不變;`userUse` 不動。

- [ ] **Step 1: 移除 controller 內的建立邏輯,改委派**

把檔頭 `const ajv = require("../../util/ajv");` 移除(`userUse` 不用 ajv),加入:
```js
const CouponService = require("../../service/CouponService");
```
將 `adminAdd` 函式整段替換為:
```js
async function adminAdd(context) {
  const args = minimist(context.event.text.split(" "));

  if (args.h || args.help) {
    return context.replyText(i18n.__("message.coupon.admin_add_usage"));
  }

  const [code, startAt, endAt, reward] = [
    get(args, "_.2"),
    get(args, "start", get(args, "s")),
    get(args, "end", get(args, "e")),
    get(args, "reward", get(args, "r")),
  ];

  try {
    const id = await CouponService.create({ code, startAt, endAt, reward });
    return context.replyText(i18n.__("message.coupon.admin_add_success", { id, code }));
  } catch (e) {
    if (e.code === "COUPON_INVALID") {
      DefaultLogger.warn(
        `[CouponController.adminAdd] Validation failed: ${JSON.stringify(e.errors)}`
      );
      return context.replyText(i18n.__("message.coupon.admin_add_invalid_param"));
    }
    DefaultLogger.error(e);
    return context.replyText(i18n.__("message.coupon.admin_add_failed"));
  }
}
```
保留 `couponCode`、`couponUsedHistory`、`moment`、`get`、`minimist`、`inventory`、`DefaultLogger` 等其餘 require(`userUse`/`dispatch` 仍用)。

- [ ] **Step 2: 確認既有 schema 測試與服務測試綠燈 + lint**

Run: `cd app && yarn test -- __tests__/schema/coupon.test.js __tests__/service/CouponService.test.js && yarn lint`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add app/src/controller/application/CouponController.js
git commit -m "refactor(coupon): delegate chat adminAdd to CouponService"
```

---

### Task 4: 前端 service + 列表頁(banner/篩選/列/狀態)+ 路由 + 選單

**Files:**
- Create: `frontend/src/services/coupon.js`
- Create: `frontend/src/pages/Admin/Coupon/status.js`
- Create: `frontend/src/pages/Admin/Coupon/index.jsx`
- Modify: `frontend/src/App.jsx`(import + route)
- Modify: `frontend/src/components/NavDrawer.jsx`(選單項目 + icon import)

**Interfaces:**
- Consumes:後端 `/api/admin/coupons*`;`useHintBar`、`useAlertDialog`、`HintSnackBar`、`AlertDialog`。
- Produces:`couponService.{fetchCoupons,fetchCoupon,createCoupon,updateCoupon,deleteCoupon}`;`deriveStatus(coupon)->"active"|"upcoming"|"expired"`、`STATUS_META`;default export `Coupon` 頁面,依賴 `./CouponFormDialog`(Task 5)、`./CouponStatsDrawer`(Task 6)。

- [ ] **Step 1: service** — `frontend/src/services/coupon.js`

```js
import api from "./api";

export const fetchCoupons = () => api.get("/api/admin/coupons").then(r => r.data);
export const fetchCoupon = id => api.get(`/api/admin/coupons/${id}`).then(r => r.data);
export const createCoupon = payload => api.post("/api/admin/coupons", payload).then(r => r.data);
export const updateCoupon = (id, payload) =>
  api.put(`/api/admin/coupons/${id}`, payload).then(r => r.data);
export const deleteCoupon = id => api.delete(`/api/admin/coupons/${id}`).then(r => r.data);
```

- [ ] **Step 2: status helper** — `frontend/src/pages/Admin/Coupon/status.js`

```js
export function deriveStatus(coupon, now = new Date()) {
  const start = coupon.start_at ? new Date(coupon.start_at) : null;
  const end = coupon.end_at ? new Date(coupon.end_at) : null;
  if (start && now < start) return "upcoming";
  if (end && now > end) return "expired";
  return "active";
}

export const STATUS_META = {
  active: { label: "進行中", color: "success" },
  upcoming: { label: "尚未啟用", color: "warning" },
  expired: { label: "已過期", color: "default" },
};
```

- [ ] **Step 3: 列表頁** — `frontend/src/pages/Admin/Coupon/index.jsx`

```jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box, Paper, Typography, Chip, Button, Divider, Skeleton, Alert,
  TextField, ToggleButton, ToggleButtonGroup, IconButton, Tooltip,
} from "@mui/material";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import RedeemIcon from "@mui/icons-material/Redeem";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import BlockIcon from "@mui/icons-material/Block";
import useHintBar from "../../../hooks/useHintBar";
import useAlertDialog from "../../../hooks/useAlertDialog";
import HintSnackBar from "../../../components/HintSnackBar";
import AlertDialog from "../../../components/AlertDialog";
import * as couponService from "../../../services/coupon";
import { deriveStatus, STATUS_META } from "./status";
import CouponFormDialog from "./CouponFormDialog";
import CouponStatsDrawer from "./CouponStatsDrawer";

const STATUS_ICON = {
  active: <CheckCircleIcon fontSize="small" />,
  upcoming: <ScheduleIcon fontSize="small" />,
  expired: <BlockIcon fontSize="small" />,
};

const fmt = v => (v ? new Date(v).toLocaleString() : "—");

export default function Coupon() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statsId, setStatsId] = useState(null);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      setCoupons((await couponService.fetchCoupons()) || []);
    } catch {
      setError(true);
      showHint("載入失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [showHint]);

  useEffect(() => {
    document.title = "優惠券管理";
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(
    () =>
      coupons.filter(c => {
        const okSearch = c.code.toLowerCase().includes(search.trim().toLowerCase());
        const okStatus = statusFilter === "all" || deriveStatus(c) === statusFilter;
        return okSearch && okStatus;
      }),
    [coupons, search, statusFilter]
  );

  const activeCount = useMemo(
    () => coupons.filter(c => deriveStatus(c) === "active").length,
    [coupons]
  );

  const handleSave = async payload => {
    try {
      setSaving(true);
      if (editing) await couponService.updateCoupon(editing.id, payload);
      else await couponService.createCoupon(payload);
      showHint(editing ? "更新成功" : "新增成功", "success");
      setDialogOpen(false);
      fetchData();
    } catch (e) {
      showHint(e.response?.data?.message || "操作失敗", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = coupon =>
    showAlert({
      title: "確認刪除",
      description: `確定要刪除兌換券「${coupon.code}」嗎？`,
      onSubmit: async () => {
        try {
          await couponService.deleteCoupon(coupon.id);
          showHint("刪除成功", "success");
          fetchData();
        } catch (e) {
          showHint(e.response?.data?.message || "刪除失敗", "error");
        }
      },
    });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Paper sx={{ position: "relative", overflow: "hidden", borderRadius: 3 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: theme =>
              `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
          }}
        />
        <Box
          sx={{
            position: "relative",
            p: { xs: 3, sm: 4 },
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <ConfirmationNumberIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
          <Box sx={{ color: "#fff", flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Coupon 管理
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              <Chip
                label={`共 ${coupons.length} 張`}
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
              />
              <Chip
                label={`進行中 ${activeCount}`}
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
              />
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
            }}
          >
            新增 coupon
          </Button>
        </Box>
      </Paper>

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          label="搜尋兌換碼"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={statusFilter}
          onChange={(e, v) => v && setStatusFilter(v)}
          sx={{ "& .MuiToggleButton-root": { borderRadius: "8px !important" } }}
        >
          <ToggleButton value="all">全部</ToggleButton>
          <ToggleButton value="active">進行中</ToggleButton>
          <ToggleButton value="upcoming">尚未啟用</ToggleButton>
          <ToggleButton value="expired">已過期</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Paper sx={{ borderRadius: 3 }}>
        {loading ? (
          [0, 1, 2].map(i => (
            <Box key={i} sx={{ px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
              <Skeleton variant="rounded" height={48} />
            </Box>
          ))
        ) : error ? (
          <Box sx={{ p: 3 }}>
            <Alert severity="error">載入失敗，請重試</Alert>
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <ConfirmationNumberIcon sx={{ fontSize: 48, opacity: 0.3 }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              沒有符合的兌換券
            </Typography>
          </Box>
        ) : (
          filtered.map((c, idx) => {
            const status = deriveStatus(c);
            const meta = STATUS_META[status];
            return (
              <Box key={c.id}>
                {idx > 0 && <Divider />}
                <Box
                  sx={{
                    px: { xs: 2.5, sm: 3 },
                    py: { xs: 2, sm: 2.5 },
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <ConfirmationNumberIcon color="action" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontFamily: "monospace", fontWeight: 600 }} noWrap>
                      {c.code}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmt(c.start_at)} ~ {fmt(c.end_at)}
                    </Typography>
                  </Box>
                  <Chip
                    icon={<RedeemIcon sx={{ color: "inherit !important" }} />}
                    label={`女神石 ×${c.reward?.value ?? "?"}`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip icon={STATUS_ICON[status]} label={meta.label} size="small" color={meta.color} />
                  <Chip label={`領取 ${c.redeemedCount}`} size="small" variant="outlined" />
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="查看領取">
                      <IconButton size="small" aria-label="查看領取" onClick={() => setStatsId(c.id)}>
                        <QueryStatsIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="編輯">
                      <IconButton
                        size="small"
                        aria-label="編輯"
                        onClick={() => {
                          setEditing(c);
                          setDialogOpen(true);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="刪除">
                      <IconButton
                        size="small"
                        color="error"
                        aria-label="刪除"
                        onClick={() => handleDelete(c)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            );
          })
        )}
      </Paper>

      <CouponFormDialog
        open={dialogOpen}
        editing={editing}
        saving={saving}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSave}
      />
      <CouponStatsDrawer couponId={statsId} onClose={() => setStatsId(null)} />

      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
      <AlertDialog
        open={alertState.open}
        title={alertState.title}
        description={alertState.description}
        onSubmit={alertState.onSubmit}
        onCancel={alertState.onCancel || closeAlert}
      />
    </Box>
  );
}
```

> 註:本任務先建上述頁面。`CouponFormDialog`、`CouponStatsDrawer` 在 Task 5/6 建立;為讓 Task 4 可獨立跑,先放一行 stub 也可——或將 Task 4–6 視為一組連續實作、最後一起手動驗收(推薦,較省事)。

- [ ] **Step 4: 接路由** — `frontend/src/App.jsx`

在其他 admin 頁 import 旁加(對齊既有 import 風格,若 siblings 用 lazy 則改 lazy):
```jsx
import AdminCoupons from "./pages/Admin/Coupon";
```
在 `<Route element={<RequireAdmin />}>` 區塊內加:
```jsx
<Route path="admin/coupons" element={<AdminCoupons />} />
```

- [ ] **Step 5: 接選單** — `frontend/src/components/NavDrawer.jsx`

檔頭 import:
```jsx
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
```
`adminItems` 陣列加一筆:
```js
{ label: "優惠券管理", path: "/admin/coupons", icon: ConfirmationNumberIcon },
```

- [ ] **Step 6: lint**

Run: `cd frontend && yarn lint`
Expected: 無錯(若 Task 5/6 尚未建,先完成它們再 lint,見 Step 3 註)。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/services/coupon.js frontend/src/pages/Admin/Coupon frontend/src/App.jsx frontend/src/components/NavDrawer.jsx
git commit -m "feat(coupon): add admin coupon list page + route + nav"
```

---

### Task 5: 新增/編輯對話框

**Files:**
- Create: `frontend/src/pages/Admin/Coupon/CouponFormDialog.jsx`

**Interfaces:**
- Consumes:props `{ open, editing, saving, onClose, onSubmit(payload) }`,`editing` 為列表中的 coupon(含 `redeemedCount`、`reward.value`、`start_at`、`end_at`)或 null。
- Produces:呼叫 `onSubmit({ code, startAt: ISO, endAt: ISO, reward: number })`。

- [ ] **Step 1: 寫對話框** — `frontend/src/pages/Admin/Coupon/CouponFormDialog.jsx`

```jsx
import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack,
  CircularProgress,
} from "@mui/material";

function toLocal(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const empty = { code: "", start: "", end: "", reward: "" };

export default function CouponFormDialog({ open, editing, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState({});

  useEffect(() => {
    if (!open) return;
    setErr({});
    setForm(
      editing
        ? {
            code: editing.code,
            start: toLocal(editing.start_at),
            end: toLocal(editing.end_at),
            reward: String(editing.reward?.value ?? ""),
          }
        : empty
    );
  }, [open, editing]);

  const codeLocked = !!(editing && editing.redeemedCount > 0);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const next = {};
    if (!form.code.trim()) next.code = "必填";
    if (form.code.length > 50) next.code = "最多 50 字";
    if (!form.start) next.start = "必填";
    if (!form.end) next.end = "必填";
    if (form.start && form.end && new Date(form.end) <= new Date(form.start))
      next.end = "結束須晚於開始";
    if (!form.reward || Number(form.reward) < 1) next.reward = "需 ≥ 1";
    setErr(next);
    if (Object.keys(next).length) return;
    onSubmit({
      code: form.code.trim(),
      startAt: new Date(form.start).toISOString(),
      endAt: new Date(form.end).toISOString(),
      reward: Number(form.reward),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? "編輯 coupon" : "新增 coupon"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="兌換碼"
            value={form.code}
            onChange={set("code")}
            disabled={codeLocked}
            error={!!err.code}
            helperText={err.code || (codeLocked ? "已有人領取，無法修改" : "最多 50 字")}
            inputProps={{ maxLength: 50 }}
            fullWidth
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="開始時間"
              type="datetime-local"
              value={form.start}
              onChange={set("start")}
              error={!!err.start}
              helperText={err.start}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="結束時間"
              type="datetime-local"
              value={form.end}
              onChange={set("end")}
              error={!!err.end}
              helperText={err.end}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>
          <TextField
            label="女神石數量"
            type="number"
            value={form.reward}
            onChange={set("reward")}
            error={!!err.reward}
            helperText={err.reward}
            inputProps={{ min: 1 }}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          {editing ? "儲存" : "新增"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Admin/Coupon/CouponFormDialog.jsx
git commit -m "feat(coupon): add coupon add/edit dialog"
```

---

### Task 6: 領取明細抽屜(KPI + 每日小圖 + 清單)+ 手動驗收

**Files:**
- Create: `frontend/src/pages/Admin/Coupon/CouponStatsDrawer.jsx`

**Interfaces:**
- Consumes:props `{ couponId, onClose }`(`couponId` 非 null 即開啟);`couponService.fetchCoupon`。
- Produces:抽屜 UI(KPI 領取數、`dailyRedemptions` BarChart、最近 100 筆清單)。

- [ ] **Step 1: 寫抽屜** — `frontend/src/pages/Admin/Coupon/CouponStatsDrawer.jsx`

```jsx
import { useState, useEffect } from "react";
import {
  Drawer, Box, Typography, Divider, List, ListItem, ListItemText, Skeleton, Chip,
} from "@mui/material";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import * as couponService from "../../../services/coupon";

export default function CouponStatsDrawer({ couponId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (couponId == null) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    couponService
      .fetchCoupon(couponId)
      .then(d => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [couponId]);

  return (
    <Drawer anchor="right" open={couponId != null} onClose={onClose}>
      <Box sx={{ width: { xs: 320, sm: 420 }, p: 3 }}>
        {loading || !data ? (
          <Skeleton variant="rounded" height={200} />
        ) : (
          <>
            <Typography variant="h6" sx={{ fontFamily: "monospace" }}>
              {data.code}
            </Typography>
            <Chip label={`總領取 ${data.redeemedCount}`} color="primary" sx={{ mt: 1 }} />

            <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>
              每日領取
            </Typography>
            {data.dailyRedemptions.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.dailyRedemptions}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary">尚無領取</Typography>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              最近領取（最多 100）
            </Typography>
            <List dense>
              {data.redemptions.map((r, i) => (
                <ListItem key={i} disableGutters>
                  <ListItemText
                    primary={`${r.user_id.slice(0, 8)}…`}
                    secondary={new Date(r.created_at).toLocaleString()}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 2: lint**

Run: `cd frontend && yarn lint`
Expected: 無錯。

- [ ] **Step 3: 手動驗收(需 `make infra` + `yarn dev`,以 admin 身分登入)**

1. 新增 coupon 設定起訖 → 列表出現、狀態 chip 正確。
2. 用 LINE `/兌換 <code>` 領取後,後台「查看領取」顯示領取數、每日小圖、清單。
3. 已領取的 coupon → 編輯時兌換碼欄位鎖定;刪除被擋並提示「已有領取紀錄」。
4. 搜尋與狀態篩選正常。
5. 聊天指令 `!coupon add <code> --start ... --end ... --reward N` 仍可新增(走同一 service)。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Admin/Coupon/CouponStatsDrawer.jsx
git commit -m "feat(coupon): add redemption stats drawer"
```

---

## Self-Review

- **Spec 覆蓋**:CRUD(Task 1 service + Task 2 API + Task 4–6 UI)、領取統計(find + drawer chart/list)、聊天指令收斂(Task 3)、編輯/刪除守則(service guards + dialog code lock)、權限(掛 /admin)、不動 migration/領取邏輯 — 皆有對應任務。
- **Placeholder**:無 TBD/TODO;Task 4 Step 3 的「stub」註記為實作順序建議,Task 5/6 提供完整元件,故無懸空引用。
- **型別一致**:`CouponService` 方法名、`err.code` 列舉、model 方法名(`countGroupedByCoupon/countByCoupon/recentByCoupon/dailyByCoupon`)、前端 `deriveStatus/STATUS_META`、props(`editing/saving/onSubmit/couponId`)跨任務一致。
- 已知簡化:model 查詢方法是薄 knex wrapper,比照既有未測的 `findByCode`,由 service 測試(mock)+ Task 6 手動驗收覆蓋,不另寫 model 單元測試。
