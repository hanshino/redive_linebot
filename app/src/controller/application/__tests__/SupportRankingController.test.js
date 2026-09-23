// 支持榜 API 的真實 MySQL + 真 verifyToken 證據：/api/support-rankings 三支端點。
const { execFileSync } = require("child_process");

process.env.DOTENV_CONFIG_QUIET = "true";
process.env.SUPPRESS_NO_CONFIG_WARNING = "true";

const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../../__tests__/helpers/worldBossFixture");

function assertIsolatedLocalMysql() {
  if (!["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
    throw new Error(`refuse: DB_HOST is not local (${process.env.DB_HOST})`);
  }
  const port = process.env.DB_PORT || "3306";
  const names = execFileSync(
    "docker",
    ["ps", "--filter", `publish=${port}`, "--format", "{{.Names}}"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  ).trim();
  if (!names) throw new Error(`refuse: no local Docker MySQL publishes port ${port}`);
}
assertIsolatedLocalMysql();

const testDatabase = createWorldBossTestDatabase("support_rank_api");
if (!/^Princess_wbtest_support_rank_api_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);
jest.unmock("../../../middleware/validation");
jest.mock("../../../service/AuthSessionService", () => {
  const actual = jest.requireActual("../../../service/AuthSessionService");
  return { ...actual, getSession: jest.fn() };
});

// Runtime router loads only after the local guard and isolated mysql mock above.
const express = require("express");
const request = require("supertest");
const AuthSessionService = require("../../../service/AuthSessionService");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const A = U("a");
const B = U("b");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", require("../../../router/api"));
  return app;
}

function auth(userId = A) {
  AuthSessionService.getSession.mockResolvedValue({ userId, displayName: "fixture" });
}

function api(method, path) {
  return request(app)
    [method](path)
    .set("Cookie", "redive_session=fixture-token")
    .set("Origin", "https://pudding.example");
}

async function seedUser(
  platformId,
  { displayName = null, pictureUrl = null, hidden = false } = {}
) {
  const [id] = await mysql("user").insert({
    platform: "line",
    platform_id: platformId,
    display_name: displayName,
    picture_url: pictureUrl,
    hide_support_ranking: hidden,
  });
  return id;
}

function sponsorship({ userId, cardKey = null, cardCount = 0, amount = "0.00", receivedAt }) {
  return mysql("sponsorship").insert({
    request_id: `sr-api-${userId}-${cardKey || "none"}-${Math.random()}`,
    fingerprint: "test",
    type: userId ? "new" : "history",
    user_id: userId,
    currency: "TWD",
    amount,
    received_at: receivedAt,
    card_key: cardKey,
    card_count: cardCount,
    operator_user_id: "Utest_operator_00000000000000000",
  });
}

let app;
const OLD_ENV = process.env;

describe("support-rankings API (isolated DB + real verifyToken)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_support_rank_api_/);
    expect(databaseName).not.toBe("Princess");
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    process.env = OLD_ENV;
    await testDatabase.teardown();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // PUT is an unsafe verb: verifyToken's CSRF gate requires Origin to match
    // APP_DOMAIN (see AuthSessionService.isAllowedOrigin). Same fixture value
    // as the Origin header set by api().
    process.env = { ...OLD_ENV, APP_DOMAIN: "pudding.example" };
    await mysql("subscribe_card_coupon").del();
    await mysql("sponsorship_audit").del();
    await mysql("sponsorship").del();
    await mysql("user").del();
    app = createApp();
  });

  describe("GET /api/support-rankings", () => {
    test("public, no auth required; shape is rank/display_name/picture_url/months only", async () => {
      const a = await seedUser(A, { displayName: "Alice", pictureUrl: "https://x/a.png" });
      await sponsorship({ userId: a, cardKey: "month", cardCount: 3, receivedAt: "2026-01-01" });

      const response = await request(app).get("/api/support-rankings");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        items: [{ rank: 1, display_name: "Alice", picture_url: "https://x/a.png", months: 3 }],
        total: 1,
      });
      const json = JSON.stringify(response.body);
      expect(json).not.toMatch(/amount/i);
      expect(json).not.toMatch(/card/i);
    });

    test("returns empty when nobody qualifies", async () => {
      const response = await request(app).get("/api/support-rankings");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [], total: 0 });
    });
  });

  describe("GET /api/support-rankings/me", () => {
    test("401 when not authenticated", async () => {
      const response = await request(app).get("/api/support-rankings/me");
      expect(response.status).toBe(401);
    });

    test("unknown user (no user row / no sponsorship) -> default shape", async () => {
      auth(A);
      const response = await api("get", "/api/support-rankings/me");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        has_support: false,
        hidden: false,
        months: 0,
        rank: null,
      });
    });

    test("supporter sees months + rank; hidden supporter sees rank null", async () => {
      const a = await seedUser(A);
      const b = await seedUser(B, { hidden: true });
      await sponsorship({ userId: a, cardKey: "month", cardCount: 1, receivedAt: "2026-01-01" });
      await sponsorship({ userId: b, cardKey: "season", cardCount: 5, receivedAt: "2026-01-01" });

      auth(A);
      const respA = await api("get", "/api/support-rankings/me");
      expect(respA.body).toEqual({ has_support: true, hidden: false, months: 1, rank: 1 });

      auth(B);
      const respB = await api("get", "/api/support-rankings/me");
      expect(respB.body).toEqual({ has_support: true, hidden: true, months: 15, rank: null });
    });
  });

  describe("PUT /api/support-rankings/me", () => {
    test("401 when not authenticated", async () => {
      const response = await request(app).put("/api/support-rankings/me").send({ hidden: true });
      expect(response.status).toBe(401);
    });

    test("400 invalid_hidden when body.hidden is not a strict boolean", async () => {
      const a = await seedUser(A);
      await sponsorship({ userId: a, cardKey: "month", cardCount: 1, receivedAt: "2026-01-01" });
      auth(A);

      for (const bad of ["true", 1, null, undefined, {}]) {
        const response = await api("put", "/api/support-rankings/me").send({ hidden: bad });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "invalid_hidden" });
      }
    });

    test("403 no_support when the user has no qualifying sponsorship", async () => {
      await seedUser(A);
      auth(A);

      const response = await api("put", "/api/support-rankings/me").send({ hidden: true });
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "no_support" });
    });

    test("403 no_support for a completely unknown user (no user row at all)", async () => {
      auth(A);
      const response = await api("put", "/api/support-rankings/me").send({ hidden: true });
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "no_support" });
    });

    test("updates hide_support_ranking and returns the refreshed /me shape", async () => {
      const a = await seedUser(A);
      await sponsorship({ userId: a, cardKey: "season", cardCount: 1, receivedAt: "2026-01-01" });
      auth(A);

      const hideResponse = await api("put", "/api/support-rankings/me").send({ hidden: true });
      expect(hideResponse.status).toBe(200);
      expect(hideResponse.body).toEqual({ has_support: true, hidden: true, months: 3, rank: null });
      expect(await mysql("user").where({ id: a }).first()).toMatchObject({
        hide_support_ranking: 1,
      });

      const unhideResponse = await api("put", "/api/support-rankings/me").send({ hidden: false });
      expect(unhideResponse.status).toBe(200);
      expect(unhideResponse.body).toEqual({
        has_support: true,
        hidden: false,
        months: 3,
        rank: 1,
      });
    });
  });
});
