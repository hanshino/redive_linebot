// POST /api/owner/sponsorships 的「真實」regression test。
//
// app/src/router/__tests__/ownerSponsorships.test.js 把整個 SponsorshipService mock 掉，
// 只測授權層——這掩蓋了一個真實 bug：router 曾經把整個 req.body（含最外層的
// requestId）原封不動丟給 SponsorshipService.create()，而 service 的
// normalizeCreateInput() 用固定欄位白名單拒絕未知欄位，於是每一筆合法的真實 POST
// 都會撞上 UNKNOWN_FIELD。整個 service 被 mock 掉時這條路徑永遠測不到。
//
// 這裡走真實 router + 真實 SponsorshipService + 真實 verifyToken/verifySponsorshipOwner，
// 只 mock 資料層（Sponsorship / SponsorshipAudit / UserModel model，以及
// SubscribeCardCoupon model 供 SubscribeCardCouponService 使用）。
jest.unmock("../../middleware/validation");
jest.mock("../../service/AuthSessionService", () => {
  const actual = jest.requireActual("../../service/AuthSessionService");
  return { ...actual, getSession: jest.fn() };
});
jest.mock("../../model/application/Admin", () => ({ getList: jest.fn().mockResolvedValue([]) }));

jest.mock("../../model/application/Sponsorship", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findByRequestId: jest.fn(),
}));
jest.mock("../../model/application/SponsorshipAudit", () => ({ create: jest.fn() }));
jest.mock("../../model/application/UserModel", () => ({
  findById: jest.fn(),
  search: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../model/application/SubscribeCardCoupon", () => ({
  status: { unused: 0, used: 1 },
  insert: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const AuthSessionService = require("../../service/AuthSessionService");
const Sponsorship = require("../../model/application/Sponsorship");
const SponsorshipAudit = require("../../model/application/SponsorshipAudit");
const UserModel = require("../../model/application/UserModel");
const SubscribeCardCoupon = require("../../model/application/SubscribeCardCoupon");

const OWNER_ID = "U" + "a".repeat(32);
const PLAYER_LINE_ID = "U" + "9".repeat(32);
const OLD_ENV = process.env;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", require("../api"));
  return app;
}

let app;

const NOW_ROW = () => ({
  id: 1,
  request_id: "req-real-1",
  fingerprint: "deadbeef",
  type: "new",
  user_id: 42,
  currency: "TWD",
  amount: "1500.00",
  received_at: "2026-09-09T02:00:00Z",
  payment_method: "bank_transfer",
  external_ref: null,
  note: null,
  card_key: null,
  card_count: 0,
  operator_user_id: OWNER_ID,
  bound_at: null,
  created_at: new Date("2026-09-09T02:00:01.000Z"),
  updated_at: new Date("2026-09-09T02:00:01.000Z"),
});

const VALID_BODY = {
  type: "new",
  user_id: 42,
  currency: "TWD",
  amount: "1500.00",
  received_at: "2026-09-09T10:00:00+08:00",
  payment_method: "bank_transfer",
  external_ref: null,
  note: null,
  card_key: null,
  card_count: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...OLD_ENV,
    NODE_ENV: "production",
    APP_DOMAIN: "pudding.example",
    SPONSORSHIP_OWNER_LINE_USER_ID: OWNER_ID,
  };
  jest.spyOn(console, "error").mockImplementation(() => {});
  AuthSessionService.getSession.mockResolvedValue({ userId: OWNER_ID });
  UserModel.findById.mockResolvedValue({ id: 42, platform_id: PLAYER_LINE_ID });
  Sponsorship.create.mockResolvedValue(1);
  Sponsorship.find.mockResolvedValue(NOW_ROW());
  SponsorshipAudit.create.mockResolvedValue(1);
  SubscribeCardCoupon.insert.mockResolvedValue([0]);
  app = createApp();
});

afterEach(() => {
  console.error.mockRestore();
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe("POST /api/owner/sponsorships：真實 service，僅 mock 資料層", () => {
  it("合法 owner 純贊助登記 -> 201，body 是 camelCase 且不含 fingerprint", async () => {
    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", "req-real-1")
      .send({ ...VALID_BODY, requestId: "req-real-1" });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.serialNumbers).toEqual([]);

    // 拆掉 requestId 後傳給 service 的欄位必須是白名單內的固定欄位，不含 requestId 本身
    // ——這正是先前 bug 的核心斷言：router 曾經連 requestId 一起塞進 normalizeCreateInput()
    // 的輸入，導致每一筆真實 POST 都被 UNKNOWN_FIELD 拒絕。
    expect(Sponsorship.create).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: "req-real-1",
        type: "new",
        user_id: 42,
        amount: "1500.00",
      }),
      expect.anything()
    );

    const sponsorship = res.body.sponsorship;
    expect(sponsorship).toMatchObject({
      id: 1,
      requestId: "req-real-1",
      type: "new",
      userId: 42,
      amount: "1500.00",
      receivedAt: "2026-09-09T02:00:00Z",
    });
    // camelCase 契約 + 不外流 fingerprint（見規格 §2/§6）。
    expect(sponsorship).not.toHaveProperty("fingerprint");
    expect(sponsorship).not.toHaveProperty("request_id");
    expect(sponsorship).not.toHaveProperty("user_id");
  });

  it("requestId 與 Idempotency-Key 一致但 body 內還帶多餘欄位 -> 400 UNKNOWN_FIELD（真實 normalize 仍然生效）", async () => {
    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", "req-real-2")
      .send({ ...VALID_BODY, requestId: "req-real-2", extra_field: "should be rejected" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNKNOWN_FIELD");
    expect(Sponsorship.create).not.toHaveBeenCalled();
  });

  it("同一 requestId 重送、內容相同 -> 200，created:false（真實冪等路徑）", async () => {
    const dupError = Object.assign(new Error("Duplicate entry"), {
      code: "ER_DUP_ENTRY",
      sqlMessage:
        "Duplicate entry 'req-real-3' for key 'sponsorship.sponsorship_request_id_unique'",
    });
    Sponsorship.create.mockRejectedValue(dupError);
    Sponsorship.findByRequestId.mockResolvedValue({
      ...NOW_ROW(),
      request_id: "req-real-3",
      // fingerprint 必須與這次請求 normalize 後計算出的值相同，這裡直接呼叫真實 service
      // 的 computeFingerprint 來產生，避免這條測試因為指紋演算法改變而脆弱失敗。
      fingerprint: require("../../service/SponsorshipService").computeFingerprint(
        require("../../service/SponsorshipService").normalizeCreateInput(VALID_BODY)
      ),
    });

    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", "req-real-3")
      .send({ ...VALID_BODY, requestId: "req-real-3" });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.sponsorship).not.toHaveProperty("fingerprint");
  });

  it("received_at 缺省 -> 400 INVALID_RECEIVED_AT（不得默默吃成『現在時間』）", async () => {
    const withoutReceivedAt = { ...VALID_BODY };
    delete withoutReceivedAt.received_at;
    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", "req-real-4")
      .send({ ...withoutReceivedAt, requestId: "req-real-4" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_RECEIVED_AT");
    expect(Sponsorship.create).not.toHaveBeenCalled();
  });

  it("amount 帶前導零/多位小數 -> 400 INVALID_AMOUNT", async () => {
    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", "req-real-5")
      .send({ ...VALID_BODY, amount: "1500.999", requestId: "req-real-5" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_AMOUNT");
  });

  it("requestId 超過 64 字元 -> 400 INVALID_REQUEST_ID", async () => {
    const longId = "r".repeat(65);
    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", longId)
      .send({ ...VALID_BODY, requestId: longId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST_ID");
  });

  it("payment_method 超過 50 字元 -> 400 INVALID_INPUT", async () => {
    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", "req-real-6")
      .send({ ...VALID_BODY, payment_method: "x".repeat(51), requestId: "req-real-6" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_INPUT");
  });

  // respondError() 的未預期例外分支：error.code 沒有任何型別保證（Knex/mysql2 例外理論上
  // 給短字串，但呼叫端可能塞任意值），且 .message/.sqlMessage 可能夾帶 SQL/bindings。
  // 這裡分別驗證「code 不在 allowlist 的字串」與「code 是物件」兩種情況，兩者都必須：
  //   1. HTTP 回應仍是通用 500 訊息（不外流任何原始值）。
  //   2. no-store header 仍然存在。
  //   3. DefaultLogger.error 記錄的內容不含 sentinel 假金額/序號字串。
  it("sentinel：error.code 是不在 allowlist 的字串，且 message/sqlMessage 帶假金額/序號 -> 仍 500 + no-store，logger 不外流原值", async () => {
    const { DefaultLogger } = require("../../util/Logger");
    const SENTINEL_AMOUNT = "6543210.99";
    const SENTINEL_SERIAL = "12121212-3434-5656-7878-909090909090";
    Sponsorship.create.mockRejectedValue(
      Object.assign(
        new Error(
          `insert into sponsorship (amount, external_ref) values (${SENTINEL_AMOUNT}, '${SENTINEL_SERIAL}')`
        ),
        {
          code: "ER_SOME_UNKNOWN_DRIVER_CODE",
          sqlMessage: `some driver detail amount=${SENTINEL_AMOUNT} ref=${SENTINEL_SERIAL}`,
        }
      )
    );

    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", "req-real-7")
      .send({ ...VALID_BODY, requestId: "req-real-7" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "系統忙碌中，請稍後再試" });
    expect(res.headers["cache-control"]).toBe("no-store");

    const loggedText = DefaultLogger.error.mock.calls
      .map(args => args.map(a => JSON.stringify(a)).join(" "))
      .join("\n");
    expect(loggedText).not.toContain(SENTINEL_AMOUNT);
    expect(loggedText).not.toContain(SENTINEL_SERIAL);
    expect(loggedText).not.toContain("ER_SOME_UNKNOWN_DRIVER_CODE");
    expect(loggedText).toContain("UNEXPECTED");
  });

  it("sentinel：error.code 是物件（非字串），logger 不得原樣記錄該物件或洩漏其內容", async () => {
    const { DefaultLogger } = require("../../util/Logger");
    const SENTINEL_AMOUNT = "1357913.57";
    const SENTINEL_SERIAL = "abcdefab-cdef-abcd-efab-cdefabcdefab";
    Sponsorship.create.mockRejectedValue(
      Object.assign(new Error("driver threw a non-string code"), {
        code: { amount: SENTINEL_AMOUNT, serial: SENTINEL_SERIAL },
      })
    );

    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", "req-real-8")
      .send({ ...VALID_BODY, requestId: "req-real-8" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "系統忙碌中，請稍後再試" });
    expect(res.headers["cache-control"]).toBe("no-store");

    const loggedText = DefaultLogger.error.mock.calls
      .map(args => args.map(a => JSON.stringify(a)).join(" "))
      .join("\n");
    expect(loggedText).not.toContain(SENTINEL_AMOUNT);
    expect(loggedText).not.toContain(SENTINEL_SERIAL);
    expect(loggedText).toContain("UNEXPECTED");
  });
});

describe("POST /api/owner/sponsorships/:id/bind：真實 service，僅 mock 資料層", () => {
  it("合法 owner 補綁 -> 200，body 是 camelCase 且不含 fingerprint", async () => {
    jest.doMock("../../model/application/Sponsorship", () => ({
      create: jest.fn(),
      find: jest.fn(),
      findByRequestId: jest.fn(),
      lockById: jest.fn().mockResolvedValue({ id: 10, type: "history", user_id: null }),
    }));

    // bind 走的是同一個真實 service，這裡改用直接對真實 Sponsorship model mock 補上
    // lockById（上面模組層級 mock 沒有這個方法，因為 create 測試不需要它）。
    const SponsorshipModel = require("../../model/application/Sponsorship");
    SponsorshipModel.lockById = jest.fn().mockResolvedValue({
      id: 10,
      type: "history",
      user_id: null,
    });
    UserModel.findById.mockResolvedValue({ id: 42, platform_id: PLAYER_LINE_ID });

    const res = await request(app)
      .post("/api/owner/sponsorships/10/bind")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .send({ userId: 42 });

    expect(res.status).toBe(200);
    expect(res.body.bound).toBe(true);
    expect(res.body.sponsorship).not.toHaveProperty("fingerprint");
    expect(res.body.sponsorship.userId).toBe(42);
  });
});
