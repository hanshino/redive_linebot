// U8 / KTD12：新 match/match-bet API 的真 verifyToken + 隔離 MySQL 證據。
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

const testDatabase = createWorldBossTestDatabase("match_prefs");
if (!/^Princess_wbtest_match_prefs_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);
jest.unmock("../../../middleware/validation");
jest.mock("../../../service/AuthSessionService", () => {
  const actual = jest.requireActual("../../../service/AuthSessionService");
  return { ...actual, getSession: jest.fn() };
});

// Runtime router loads only after guard and isolated mysql mock.
const express = require("express");
const request = require("supertest");
const AuthSessionService = require("../../../service/AuthSessionService");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const A = U("a");
const B = U("b");
const DAY = 24 * 60 * 60 * 1000;
const OLD_ENV = process.env;
let app;

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

async function seedUser(userId, { active = true, pref = {} } = {}) {
  await mysql("user").insert({ platform: "line", platform_id: userId });
  if (active) {
    await mysql("subscribe_user").insert({
      user_id: userId,
      subscribe_card_key: "month_plus",
      start_at: new Date(Date.now() - DAY),
      end_at: new Date(Date.now() + DAY),
    });
  }
  await mysql("user_auto_preference").insert({
    user_id: userId,
    auto_daily_gacha: 1,
    auto_janken_fate: 1,
    auto_janken_fate_with_bet: 0,
    auto_match_enabled: 0,
    auto_match_generation: 3,
    auto_match_bet_enabled: 0,
    auto_match_bet_generation: 8,
    auto_match_bet_cap: 100,
    ...pref,
  });
}

function preference(userId) {
  return mysql("user_auto_preference").where({ user_id: userId }).first();
}

describe("AutoPreference match APIs (isolated DB + real verifyToken)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_match_prefs_/);
    expect(databaseName).not.toBe("Princess");
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    process.env = OLD_ENV;
    await testDatabase.teardown();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      NODE_ENV: "production",
      APP_DOMAIN: "pudding.example",
      SUPPRESS_NO_CONFIG_WARNING: "true",
    };
    await mysql("user_auto_preference").del();
    await mysql("subscribe_user").del();
    await mysql("user").del();
    app = createApp();
  });

  test("未登入 GET/PUT 均由真 verifyToken 拒絕，controller 不寫資料", async () => {
    expect((await request(app).get("/api/auto-preference/match")).status).toBe(401);
    expect(
      (
        await request(app)
          .put("/api/auto-preference/match")
          .set("Origin", "https://pudding.example")
          .send({ enabled: true, acknowledged: true })
      ).status
    ).toBe(401);
    expect(await mysql("user_auto_preference")).toHaveLength(0);
  });

  test("foreign Origin 的 PUT 由真 verifyToken CSRF gate 擋下", async () => {
    await seedUser(A);
    auth(A);

    const response = await request(app)
      .put("/api/auto-preference/match")
      .set("Cookie", "redive_session=fixture-token")
      .set("Origin", "https://evil.example")
      .send({ enabled: true, acknowledged: true });

    expect(response.status).toBe(403);
    expect(AuthSessionService.getSession).not.toHaveBeenCalled();
    expect(await preference(A)).toMatchObject({ auto_match_enabled: 0 });
  });

  test("GET 兩組 shape 使用 token user；忽略 query userId", async () => {
    await seedUser(A, { pref: { auto_match_enabled: 1, auto_match_generation: 4 } });
    await seedUser(B, { pref: { auto_match_bet_enabled: 1, auto_match_bet_cap: 9999 } });
    auth(A);

    const match = await api("get", `/api/auto-preference/match?userId=${B}`);
    const bet = await api("get", `/api/auto-preference/match-bet?userId=${B}`);

    expect(match.status).toBe(200);
    expect(match.body).toEqual({
      preference: "match",
      eligible: true,
      enabled: true,
      effective: true,
      generation: 4,
    });
    expect(bet.status).toBe(200);
    expect(bet.body).toEqual({
      preference: "match_bet",
      eligible: true,
      enabled: false,
      effective: false,
      generation: 8,
      cap: 100,
    });
  });

  test("開啟缺 ack、enabled 非 strict bool、cap 字串/float/負數/unsafe 都拒絕", async () => {
    await seedUser(A);
    auth(A);

    const cases = [
      ["/api/auto-preference/match", { enabled: true }, "acknowledgement_required"],
      ["/api/auto-preference/match", { enabled: "true", acknowledged: true }, "invalid_type"],
      ["/api/auto-preference/match", { enabled: 1, acknowledged: true }, "invalid_type"],
      [
        "/api/auto-preference/match",
        { enabled: true, acknowledged: "true" },
        "acknowledgement_required",
      ],
      [
        "/api/auto-preference/match-bet",
        { enabled: true, acknowledged: true, cap: "10" },
        "invalid_cap",
      ],
      [
        "/api/auto-preference/match-bet",
        { enabled: true, acknowledged: true, cap: 1.5 },
        "invalid_cap",
      ],
      [
        "/api/auto-preference/match-bet",
        { enabled: true, acknowledged: true, cap: -1 },
        "invalid_cap",
      ],
      [
        "/api/auto-preference/match-bet",
        { enabled: true, acknowledged: true, cap: Number.MAX_SAFE_INTEGER + 1 },
        "invalid_cap",
      ],
      [
        "/api/auto-preference/match-bet",
        { enabled: true, acknowledged: true, cap: 0x100000000 },
        "invalid_cap",
      ],
    ];
    for (const [path, payload, error] of cases) {
      const response = await api("put", path).send(payload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(error);
    }
    expect(await preference(A)).toMatchObject({
      auto_match_enabled: 0,
      auto_match_generation: 3,
      auto_match_bet_enabled: 0,
      auto_match_bet_generation: 8,
      auto_match_bet_cap: 100,
    });
  });

  test("無有效 Plus 不能啟用，但可關閉；兩 consent 彼此獨立", async () => {
    await seedUser(A, {
      active: false,
      pref: { auto_match_enabled: 1, auto_match_bet_enabled: 1 },
    });
    auth(A);

    const current = await api("get", "/api/auto-preference/match");
    expect(current.body).toMatchObject({ eligible: false, enabled: true, effective: false });

    const rejected = await api("put", "/api/auto-preference/match").send({
      enabled: true,
      acknowledged: true,
    });
    expect(rejected.status).toBe(403);
    expect(rejected.body.error).toBe("subscription_required");
    expect((await api("put", "/api/auto-preference/match").send({ enabled: false })).status).toBe(
      200
    );
    expect(
      (await api("put", "/api/auto-preference/match-bet").send({ enabled: false, cap: 0 })).status
    ).toBe(200);
    expect(await preference(A)).toMatchObject({
      auto_match_enabled: 0,
      auto_match_bet_enabled: 0,
      auto_match_bet_cap: 0,
    });
  });

  test("off→on 才遞增 generation；關再開使舊 generation 失效；bet 可獨立開啟", async () => {
    await seedUser(A);
    auth(A);

    let response = await api("put", "/api/auto-preference/match-bet").send({
      enabled: true,
      acknowledged: true,
      cap: 300,
    });
    expect(response.body).toMatchObject({ enabled: true, generation: 9, cap: 300 });
    expect(await preference(A)).toMatchObject({ auto_match_enabled: 0 });
    response = await api("put", "/api/auto-preference/match-bet").send({
      enabled: true,
      acknowledged: true,
      cap: 200,
    });
    expect(response.body).toMatchObject({ enabled: true, generation: 9, cap: 200 });

    response = await api("put", "/api/auto-preference/match").send({
      enabled: true,
      acknowledged: true,
      userId: B,
    });
    expect(response.body).toMatchObject({ enabled: true, generation: 4 });
    await api("put", "/api/auto-preference/match").send({ enabled: false });
    response = await api("put", "/api/auto-preference/match").send({
      enabled: true,
      acknowledged: true,
    });
    expect(response.body).toMatchObject({ enabled: true, generation: 5 });
    expect(await mysql("user_auto_preference").where({ user_id: B })).toHaveLength(0);
  });

  test("既有 aggregate PUT 不能用 match 欄位繞過 ack/資格", async () => {
    await seedUser(A, { active: false });
    auth(A);

    const response = await api("put", "/api/auto-preference").send({
      auto_match_enabled: true,
      auto_match_bet_enabled: true,
      acknowledged: true,
    });

    expect(response.status).toBe(200);
    expect(await preference(A)).toMatchObject({
      auto_match_enabled: 0,
      auto_match_bet_enabled: 0,
      auto_match_generation: 3,
      auto_match_bet_generation: 8,
    });
  });
});
