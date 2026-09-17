// U7 / KTD11：兌換後 re-consent 與 redeem/opt-out 線性化的真實 MySQL 證據。
// DB 只使用隨機 Princess_wbtest_reconsent_*；所有 LINE/Redis/成就副作用皆 mock。
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

const testDatabase = createWorldBossTestDatabase("reconsent");
if (!/^Princess_wbtest_reconsent_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);
jest.unmock("bottender/router");
jest.mock("../../princess/gacha", () => ({ purgeDailyGachaCache: jest.fn().mockResolvedValue() }));
jest.mock("../../../../bin/DailyRation", () => jest.fn().mockResolvedValue());
jest.mock("../../../service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));
jest.mock("../../../service/achievementNotifier", () => ({
  notifyUnlocks: jest.fn().mockResolvedValue(),
}));

// Runtime modules load only after the guard and isolated mysql mock.
const uuid = require("uuid-random");
const SubscribeController = require("../SubscribeController");
const AutoPreferenceController = require("../AutoPreferenceController");
const SubscribeUser = require("../../../model/application/SubscribeUser");

jest.setTimeout(90000);

const U = ch => "U" + ch.repeat(32);
const DAY = 24 * 60 * 60 * 1000;

function ctx(userId) {
  return {
    event: { source: { userId } },
    replyText: jest.fn().mockResolvedValue(),
    sendText: jest.fn().mockResolvedValue(),
  };
}

function callExchange(context, serialNumber) {
  const route = SubscribeController.router.find(
    item => typeof item.predicate === "function" && item.action.name === "subscribeCouponExchange"
  );
  return route.action(context, { match: { groups: { serial_number: serialNumber } } });
}

function apiRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn(code => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn(body => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

async function seedUser(userId) {
  await mysql("user").insert({ platform: "line", platform_id: userId });
}

async function seedCoupon(cardKey = "month_plus") {
  const serial = uuid();
  await mysql("subscribe_card_coupon").insert({
    subscribe_card_key: cardKey,
    serial_number: serial,
    status: 0,
    issued_by: "u7-test",
  });
  return serial;
}

async function seedPreference(userId, overrides = {}) {
  await mysql("user_auto_preference").insert({
    user_id: userId,
    auto_daily_gacha: 1,
    auto_daily_gacha_mode: "ensure",
    auto_janken_fate: 1,
    auto_janken_fate_with_bet: 1,
    auto_match_enabled: 1,
    auto_match_generation: 4,
    auto_match_bet_enabled: 1,
    auto_match_bet_generation: 7,
    auto_match_bet_cap: 500,
    ...overrides,
  });
}

function preference(userId) {
  return mysql("user_auto_preference").where({ user_id: userId }).first();
}

const inflight = new Map();
mysql.on("query", query => query.__knexQueryUid && inflight.set(query.__knexQueryUid, query.sql));
mysql.on("query-response", (_result, query) => inflight.delete(query.__knexQueryUid));
mysql.on("query-error", (_error, query) => inflight.delete(query.__knexQueryUid));

async function waitUntil(predicate, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return false;
}

describe("SubscribeController re-consent (isolated DB)", () => {
  beforeAll(async () => {
    const databaseName = await testDatabase.setup();
    expect(databaseName).toMatch(/^Princess_wbtest_reconsent_/);
    expect(databaseName).not.toBe("Princess");
    await mysql("subscribe_card").insert([
      { key: "month", name: "month", price: 50, duration: 30, effects: "[]" },
      { key: "season", name: "season", price: 150, duration: 90, effects: "[]" },
      { key: "month_plus", name: "Plus fixture", price: 0, duration: 30, effects: "[]" },
    ]);
  }, SETUP_TIMEOUT_MS);

  afterAll(() => testDatabase.teardown());

  beforeEach(async () => {
    jest.clearAllMocks();
    await mysql("user_auto_preference").del();
    await mysql("subscribe_user").del();
    await mysql("subscribe_card_coupon").del();
    await mysql("user").del();
  });

  test("inactive→active：user→coupon→所有卡→prefs 鎖序，兩 consent reset+generation，各舊偏好不動", async () => {
    const userId = U("a");
    await seedUser(userId);
    await seedPreference(userId);
    await mysql("subscribe_user").insert([
      {
        user_id: userId,
        subscribe_card_key: "month_plus",
        start_at: new Date(Date.now() - 20 * DAY),
        end_at: new Date(Date.now() - DAY),
      },
      {
        user_id: userId,
        subscribe_card_key: "season",
        start_at: new Date(Date.now() - 20 * DAY),
        end_at: new Date(Date.now() - DAY),
      },
    ]);
    const serial = await seedCoupon();
    const sql = [];
    const capture = query => query.__knexQueryUid && sql.push(query.sql);
    mysql.on("query", capture);
    try {
      await callExchange(ctx(userId), serial);
    } finally {
      mysql.off("query", capture);
    }

    const pref = await preference(userId);
    expect(pref).toMatchObject({
      auto_match_enabled: 0,
      auto_match_generation: 5,
      auto_match_bet_enabled: 0,
      auto_match_bet_generation: 8,
      auto_match_bet_cap: 500,
      auto_daily_gacha: 1,
      auto_daily_gacha_mode: "ensure",
      auto_janken_fate: 1,
      auto_janken_fate_with_bet: 1,
    });
    const redeemed = await mysql("subscribe_user")
      .where({ user_id: userId, subscribe_card_key: "month_plus" })
      .first();
    const usedCoupon = await mysql("subscribe_card_coupon")
      .where({ serial_number: serial })
      .first();
    expect(new Date(usedCoupon.used_at).getTime()).toBe(new Date(redeemed.start_at).getTime());
    expect(await mysql("subscribe_user").where({ user_id: userId })).toHaveLength(2);
    const lockOrder = [
      sql.findIndex(text => /from `user`.*for update/i.test(text)),
      sql.findIndex(text => /from `subscribe_card_coupon`.*for update/i.test(text)),
      sql.findIndex(text => /from `subscribe_user`.*for update/i.test(text)),
      sql.findIndex(text => /from `user_auto_preference`.*for update/i.test(text)),
    ];
    expect(lockOrder.every(index => index >= 0)).toBe(true);
    expect(lockOrder).toEqual([...lockOrder].sort((a, b) => a - b));
  });

  test("Plus 邊界固定為 start_at <= now < end_at", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    expect(
      SubscribeUser.hasActiveAutoMatchAt(
        [{ subscribe_card_key: "month_plus", start_at: now, end_at: new Date(now.getTime() + 1) }],
        now
      )
    ).toBe(true);
    expect(
      SubscribeUser.hasActiveAutoMatchAt(
        [{ subscribe_card_key: "month_plus", start_at: new Date(now.getTime() - 1), end_at: now }],
        now
      )
    ).toBe(false);
  });

  test("普通 month 兌換不 reset consent/generation（season 不授予 Plus 資格）", async () => {
    const userId = U("b");
    await seedUser(userId);
    await seedPreference(userId);
    await mysql("subscribe_user").insert({
      user_id: userId,
      subscribe_card_key: "season",
      start_at: new Date(Date.now() - DAY),
      end_at: new Date(Date.now() + DAY),
    });
    const serial = await seedCoupon("month");

    await callExchange(ctx(userId), serial);

    expect(await preference(userId)).toMatchObject({
      auto_match_enabled: 1,
      auto_match_generation: 4,
      auto_match_bet_enabled: 1,
      auto_match_bet_generation: 7,
      auto_daily_gacha: 1,
      auto_janken_fate: 1,
    });
  });

  test("有效 month 直接續期：未中斷，不 reset consent/generation", async () => {
    const userId = U("d");
    await seedUser(userId);
    await seedPreference(userId);
    await mysql("subscribe_user").insert({
      user_id: userId,
      subscribe_card_key: "month",
      start_at: new Date(Date.now() - DAY),
      end_at: new Date(Date.now() + DAY),
    });
    const serial = await seedCoupon("month");

    await callExchange(ctx(userId), serial);

    expect(await preference(userId)).toMatchObject({
      auto_match_enabled: 1,
      auto_match_generation: 4,
      auto_match_bet_enabled: 1,
      auto_match_bet_generation: 7,
    });
  });

  test("inactive 且尚無 preference row：兌換建立預設關閉 consent，generation 從 1 開始", async () => {
    const userId = U("e");
    await seedUser(userId);
    const serial = await seedCoupon("month_plus");

    await callExchange(ctx(userId), serial);

    expect(await preference(userId)).toMatchObject({
      auto_match_enabled: 0,
      auto_match_generation: 1,
      auto_match_bet_enabled: 0,
      auto_match_bet_generation: 1,
      auto_match_bet_cap: 0,
      auto_daily_gacha: 0,
      auto_janken_fate: 0,
    });
  });

  test("user row 不存在時 fail closed，不消耗 coupon、不建立訂閱或 preference", async () => {
    const userId = U("f");
    const serial = await seedCoupon("month");

    await callExchange(ctx(userId), serial);

    expect(
      (await mysql("subscribe_card_coupon").where({ serial_number: serial }).first()).status
    ).toBe(0);
    expect(await mysql("subscribe_user").where({ user_id: userId })).toHaveLength(0);
    expect(await mysql("user_auto_preference").where({ user_id: userId })).toHaveLength(0);
  });

  test("redeem inactive→active 與 match opt-out 兩真連線：同 user lock 線性化，最終關閉且只 reset 一代", async () => {
    const userId = U("c");
    await seedUser(userId);
    await seedPreference(userId);
    const serial = await seedCoupon("month_plus");
    const holder = await mysql.transaction();
    let pending;
    try {
      await holder("user").where({ platform_id: userId }).forUpdate().first();
      const res = apiRes();
      pending = Promise.all([
        callExchange(ctx(userId), serial),
        AutoPreferenceController.api.setMatchPreference(
          { profile: { userId }, body: { enabled: false } },
          res
        ),
      ]);
      const overlapped = await waitUntil(
        () =>
          [...inflight.values()].filter(sql => /from `user`.*for update/i.test(sql)).length === 2
      );
      expect(overlapped).toBe(true);
      await holder.rollback();
      await pending;
    } finally {
      if (!holder.isCompleted()) await holder.rollback().catch(() => {});
      if (pending) await pending.catch(() => {});
    }

    expect(await preference(userId)).toMatchObject({
      auto_match_enabled: 0,
      auto_match_generation: 5,
      auto_match_bet_enabled: 0,
      auto_match_bet_generation: 8,
      auto_daily_gacha: 1,
      auto_janken_fate: 1,
    });
    expect(
      (await mysql("subscribe_card_coupon").where({ serial_number: serial }).first()).status
    ).toBe(1);
  });
});
