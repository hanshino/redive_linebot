// 支持榜聚合 SQL 的真實 MySQL 證據：GROUP BY + CASE 月數換算、隱藏排除、排序 tie-break。
// DB 只使用隨機 Princess_wbtest_support_ranking_*；不碰 Princess。
const { execFileSync } = require("child_process");

process.env.DOTENV_CONFIG_QUIET = "true";
process.env.SUPPRESS_NO_CONFIG_WARNING = "true";

const {
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../__tests__/helpers/worldBossFixture");

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

const testDatabase = createWorldBossTestDatabase("support_ranking");
if (!/^Princess_wbtest_support_ranking_/.test(testDatabase.databaseName)) {
  throw new Error(`refuse: unsafe test database name (${testDatabase.databaseName})`);
}
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);

// Runtime module loads only after the local guard and mysql mock above.
const Service = require("../SupportRankingService");

jest.setTimeout(90000);

const users = {};

async function seedUser(key, { displayName = null, pictureUrl = null, hidden = false } = {}) {
  const [id] = await mysql("user").insert({
    platform: "line",
    platform_id: `__sr_${key}_${process.pid}_${Date.now()}`,
    display_name: displayName,
    picture_url: pictureUrl,
    hide_support_ranking: hidden,
  });
  users[key] = id;
  return id;
}

function sponsorship({ userId, cardKey = null, cardCount = 0, amount = "0.00", receivedAt }) {
  return mysql("sponsorship").insert({
    request_id: `sr-${userId}-${cardKey || "none"}-${cardCount}-${amount}-${Math.random()}`,
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

beforeAll(async () => {
  const databaseName = await testDatabase.setup();
  expect(databaseName).toMatch(/^Princess_wbtest_support_ranking_/);
  expect(databaseName).not.toBe("Princess");
}, SETUP_TIMEOUT_MS);

afterAll(() => testDatabase.teardown());

beforeEach(async () => {
  await mysql("subscribe_card_coupon").del();
  await mysql("sponsorship_audit").del();
  await mysql("sponsorship").del();
  await mysql("user").del();
});

describe("computeMonthsByUser", () => {
  test("weights card rows by CARD_MONTH_WEIGHT and sums cardless amounts / 30 (floor)", async () => {
    const a = await seedUser("a");

    await sponsorship({ userId: a, cardKey: "month", cardCount: 3, receivedAt: "2026-01-01" }); // 3
    await sponsorship({ userId: a, cardKey: "month_plus", cardCount: 2, receivedAt: "2026-01-02" }); // 4
    await sponsorship({ userId: a, cardKey: "season", cardCount: 1, receivedAt: "2026-01-03" }); // 3
    // cardless: 20 + 25 = 45 -> floor(45/30) = 1
    await sponsorship({ userId: a, amount: "20.00", receivedAt: "2026-01-04" });
    await sponsorship({ userId: a, amount: "25.00", receivedAt: "2026-01-05" });

    const rows = await Service.computeMonthsByUser();
    const row = rows.find(r => r.userId === a);
    expect(row.months).toBe(3 + 4 + 3 + 1);
  });

  test("unknown card_key contributes 0 months for that row", async () => {
    const a = await seedUser("unknown_card");
    await sponsorship({
      userId: a,
      cardKey: "mystery_card",
      cardCount: 5,
      receivedAt: "2026-01-01",
    });

    const rows = await Service.computeMonthsByUser();
    expect(rows.find(r => r.userId === a)).toBeUndefined(); // months=0 -> excluded
  });

  test("unbound history rows (user_id NULL) are excluded entirely", async () => {
    await sponsorship({ userId: null, cardKey: "season", cardCount: 5, receivedAt: "2026-01-01" });

    const rows = await Service.computeMonthsByUser();
    expect(rows).toHaveLength(0);
  });

  test("users with months<=0 are excluded (cardless amount below 30)", async () => {
    const a = await seedUser("below_threshold");
    await sponsorship({ userId: a, amount: "29.99", receivedAt: "2026-01-01" });

    const rows = await Service.computeMonthsByUser();
    expect(rows.find(r => r.userId === a)).toBeUndefined();
  });

  test("firstReceivedAt is the MIN(received_at) across all rows for the user", async () => {
    const a = await seedUser("first_received");
    const earliest = new Date("2026-01-05T00:00:00.000Z");
    await sponsorship({
      userId: a,
      cardKey: "month",
      cardCount: 1,
      receivedAt: new Date("2026-03-10T00:00:00.000Z"),
    });
    await sponsorship({ userId: a, cardKey: "month", cardCount: 1, receivedAt: earliest });
    await sponsorship({
      userId: a,
      cardKey: "month",
      cardCount: 1,
      receivedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const rows = await Service.computeMonthsByUser();
    const row = rows.find(r => r.userId === a);
    expect(new Date(row.firstReceivedAt).getTime()).toBe(earliest.getTime());
  });
});

describe("rankRows ordering", () => {
  test("orders by months desc, then firstReceivedAt asc, then userId asc", () => {
    const rows = [
      { userId: 30, months: 5, firstReceivedAt: "2026-01-01" },
      { userId: 10, months: 10, firstReceivedAt: "2026-02-01" },
      { userId: 20, months: 10, firstReceivedAt: "2026-01-01" }, // ties months w/ id10, earlier date wins
      { userId: 5, months: 10, firstReceivedAt: "2026-01-01" }, // ties months+date w/ id20, lower id wins
    ];
    const ranked = Service.rankRows(rows);
    expect(ranked.map(r => r.userId)).toEqual([5, 20, 10, 30]);
    expect(ranked.map(r => r.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe("getPublicRanking", () => {
  test("never includes amount/card fields; hidden users are excluded and ranks shift up", async () => {
    const a = await seedUser("pub_a", { displayName: "Alice" });
    const b = await seedUser("pub_b", { displayName: "Bob", hidden: true });
    const c = await seedUser("pub_c", { displayName: "Carol" });

    await sponsorship({ userId: a, cardKey: "month", cardCount: 5, receivedAt: "2026-01-01" }); // 5
    await sponsorship({ userId: b, cardKey: "season", cardCount: 5, receivedAt: "2026-01-01" }); // 15, hidden
    await sponsorship({ userId: c, cardKey: "month", cardCount: 2, receivedAt: "2026-01-01" }); // 2

    const result = await Service.getPublicRanking();
    const names = result.items.map(i => i.display_name);
    expect(names).not.toContain("Bob"); // hidden excluded
    expect(names).toEqual(["Alice", "Carol"]);
    // rank shifts up: Alice would be #2 if Bob (15 months) were visible, but is #1 since Bob is hidden
    expect(result.items.map(i => i.rank)).toEqual([1, 2]);
    expect(result.total).toBe(2);

    const json = JSON.stringify(result);
    expect(json).not.toMatch(/amount/i);
    expect(json).not.toMatch(/card_key/i);
    expect(json).not.toMatch(/cardKey/i);
    expect(json).not.toMatch(/cardCount/i);
  });

  test("display_name falls back to 玩家 when null; picture_url may be null", async () => {
    const a = await seedUser("no_name", { displayName: null, pictureUrl: null });
    await sponsorship({ userId: a, cardKey: "month", cardCount: 1, receivedAt: "2026-01-01" });

    const result = await Service.getPublicRanking();
    const row = result.items.find(i => i.rank === result.items.length || true);
    const item = result.items.find(i => i.months === 1);
    expect(item.display_name).toBe("玩家");
    expect(item.picture_url).toBeNull();
    void row;
  });
});

describe("getMyStatus", () => {
  test("unknown user_id (no sponsorship rows) -> has_support false, hidden false, months 0, rank null", async () => {
    const a = await seedUser("no_support");
    const status = await Service.getMyStatus(a);
    expect(status).toEqual({ has_support: false, hidden: false, months: 0, rank: null });
  });

  test("supporter with hide_support_ranking=true -> rank null even though has_support true", async () => {
    const a = await seedUser("hidden_self", { hidden: true });
    await sponsorship({ userId: a, cardKey: "season", cardCount: 1, receivedAt: "2026-01-01" });

    const status = await Service.getMyStatus(a);
    expect(status).toEqual({ has_support: true, hidden: true, months: 3, rank: null });
  });

  test("visible supporter gets a rank consistent with getPublicRanking", async () => {
    const a = await seedUser("rank_a");
    const b = await seedUser("rank_b");
    await sponsorship({ userId: a, cardKey: "season", cardCount: 2, receivedAt: "2026-01-01" }); // 6
    await sponsorship({ userId: b, cardKey: "month", cardCount: 1, receivedAt: "2026-01-01" }); // 1

    const statusA = await Service.getMyStatus(a);
    const statusB = await Service.getMyStatus(b);
    expect(statusA).toEqual({ has_support: true, hidden: false, months: 6, rank: 1 });
    expect(statusB).toEqual({ has_support: true, hidden: false, months: 1, rank: 2 });
  });
});

describe("setHidden", () => {
  test("toggling hidden flips rank between null and a real rank", async () => {
    const a = await seedUser("toggle");
    await sponsorship({ userId: a, cardKey: "month", cardCount: 1, receivedAt: "2026-01-01" });

    expect((await Service.getMyStatus(a)).rank).toBe(1);
    await Service.setHidden(a, true);
    expect((await Service.getMyStatus(a)).rank).toBeNull();
    await Service.setHidden(a, false);
    expect((await Service.getMyStatus(a)).rank).toBe(1);
  });
});
