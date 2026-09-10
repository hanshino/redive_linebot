// /api/owner/sponsorships/* 全端點的授權 regression test —— 走真實
// verifyToken + verifySponsorshipOwner，不使用 app/__tests__/setup.js 的全域 auth mock
// （那個 mock 直接放行一切，用它測授權等於沒測）。
jest.unmock("../../middleware/validation");
jest.mock("../../service/AuthSessionService", () => {
  const actual = jest.requireActual("../../service/AuthSessionService");
  return { ...actual, getSession: jest.fn() };
});
jest.mock("../../model/application/Admin", () => ({ getList: jest.fn().mockResolvedValue([]) }));
jest.mock("../../service/SponsorshipService", () => ({
  list: jest.fn().mockResolvedValue({ items: [], page: 1, perPage: 20, total: 0 }),
  detail: jest.fn().mockResolvedValue(null),
  create: jest.fn(),
  bind: jest.fn(),
  getPlayerSummary: jest.fn(),
  listCards: jest.fn().mockResolvedValue([]),
  shapeSponsorship: jest.fn(row => row),
}));
jest.mock("../../model/application/UserModel", () => ({ search: jest.fn().mockResolvedValue([]) }));

const request = require("supertest");
const express = require("express");
const AuthSessionService = require("../../service/AuthSessionService");

const OWNER_ID = "U" + "a".repeat(32);
const OTHER_ADMIN_ID = "U" + "b".repeat(32);
const OLD_ENV = process.env;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", require("../api"));
  return app;
}

let app;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...OLD_ENV,
    NODE_ENV: "production",
    APP_DOMAIN: "pudding.example",
    SPONSORSHIP_OWNER_LINE_USER_ID: OWNER_ID,
  };
  jest.spyOn(console, "error").mockImplementation(() => {});
  app = createApp();
});

afterEach(() => {
  console.error.mockRestore();
});

afterAll(() => {
  process.env = OLD_ENV;
});

const ENDPOINTS = [
  { method: "get", path: "/api/owner/sponsorships/players" },
  { method: "get", path: "/api/owner/sponsorships/players/42/summary" },
  { method: "get", path: "/api/owner/sponsorships/cards" },
  { method: "get", path: "/api/owner/sponsorships" },
  { method: "get", path: "/api/owner/sponsorships/1" },
];

describe("非本人（含其他 admin，privilege 9）一律 403", () => {
  it.each(ENDPOINTS)(
    "$method $path -> 403 for a non-owner authenticated user",
    async ({ method, path }) => {
      AuthSessionService.getSession.mockResolvedValue({
        userId: OTHER_ADMIN_ID,
        displayName: "Other Admin",
        pictureUrl: null,
      });

      const res = await request(app)[method](path).set("Cookie", "redive_session=tok");

      expect(res.status).toBe(403);
      // no-store 必須掛在授權 middleware 之前，403 這種被 verifySponsorshipOwner
      // 提早 return 的錯誤回應也要帶這個 header（見規格 §0）。
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  );

  it("POST / (create) -> 403 for a non-owner even from the canonical origin", async () => {
    AuthSessionService.getSession.mockResolvedValue({ userId: OTHER_ADMIN_ID });

    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .set("Idempotency-Key", "req-1")
      .send({ requestId: "req-1", type: "new", user_id: 1, currency: "TWD", amount: "100.00" });

    expect(res.status).toBe(403);
  });

  it("POST /:id/bind -> 403 for a non-owner", async () => {
    AuthSessionService.getSession.mockResolvedValue({ userId: OTHER_ADMIN_ID });

    const res = await request(app)
      .post("/api/owner/sponsorships/1/bind")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://pudding.example")
      .send({ userId: 5 });

    expect(res.status).toBe(403);
  });
});

describe("未登入 -> 401（沿用既有 verifyToken 行為）", () => {
  it.each(ENDPOINTS)("$method $path -> 401 with no session cookie", async ({ method, path }) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    // 同上：401 也要帶 no-store，不因為在授權失敗前被擋下就漏掉這個 header。
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("owner 未配置 / 格式無效 -> 503 fail closed（連本人都不放行）", () => {
  it("missing env -> 503 even for what would be the owner", async () => {
    delete process.env.SPONSORSHIP_OWNER_LINE_USER_ID;
    app = createApp();
    AuthSessionService.getSession.mockResolvedValue({ userId: OWNER_ID });

    const res = await request(app)
      .get("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok");

    expect(res.status).toBe(503);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("malformed env -> 503", async () => {
    process.env.SPONSORSHIP_OWNER_LINE_USER_ID = "not-valid";
    app = createApp();
    AuthSessionService.getSession.mockResolvedValue({ userId: "not-valid" });

    const res = await request(app)
      .get("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok");

    expect(res.status).toBe(503);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("本人放行", () => {
  it("GET /api/owner/sponsorships succeeds for the exact owner", async () => {
    AuthSessionService.getSession.mockResolvedValue({ userId: OWNER_ID });

    const res = await request(app)
      .get("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok");

    expect(res.status).toBe(200);
  });

  it("responses carry Cache-Control: no-store", async () => {
    AuthSessionService.getSession.mockResolvedValue({ userId: OWNER_ID });

    const res = await request(app)
      .get("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok");

    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("CSRF：非同源 Origin 的寫入請求被既有 isAllowedOrigin 檢查擋下", () => {
  it("POST / from a foreign origin is 403 even for the owner (blocked before auth even runs)", async () => {
    AuthSessionService.getSession.mockResolvedValue({ userId: OWNER_ID });

    const res = await request(app)
      .post("/api/owner/sponsorships")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://evil.example")
      .set("Idempotency-Key", "req-1")
      .send({ requestId: "req-1", type: "new", user_id: 1, currency: "TWD", amount: "100.00" });

    expect(res.status).toBe(403);
    expect(AuthSessionService.getSession).not.toHaveBeenCalled();
  });

  it("POST /:id/bind from a foreign origin is 403", async () => {
    AuthSessionService.getSession.mockResolvedValue({ userId: OWNER_ID });

    const res = await request(app)
      .post("/api/owner/sponsorships/1/bind")
      .set("Cookie", "redive_session=tok")
      .set("Origin", "https://evil.example")
      .send({ userId: 5 });

    expect(res.status).toBe(403);
    expect(AuthSessionService.getSession).not.toHaveBeenCalled();
  });
});
