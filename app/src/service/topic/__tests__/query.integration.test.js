// Integration test for service/topic/query against a REAL MySQL (Princess DB).
//
// The local knex migrate runner is broken (unrelated worldboss records), but the
// MySQL container is up and the topic_daily migration FILE is valid. So we build
// the table directly from the migration's up(), seed a handful of rows, assert
// the query behavior, then down() to drop. A unique afterAll guard drops the
// table even on assertion failure.
//
// The global setup.js mocks ../../util/mysql, so we feed the query module a REAL
// knex via jest.isolateModules + doMock — that is the only DB connection here.

require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
const knex = require("knex");
const moment = require("moment");

const TPE_OFFSET_MIN = 480;
const dayAgo = n => moment().utcOffset(TPE_OFFSET_MIN).subtract(n, "day").format("YYYY-MM-DD");

const migration = require("../../../../migrations/20260622163620_create_topic_daily");

const G1 = "C" + "1".repeat(32);
const G2 = "C" + "2".repeat(32);
const U1 = "U" + "1".repeat(32);
const U2 = "U" + "2".repeat(32);

let db;
let query;

// Load query.js with the real knex injected in place of the global mysql mock.
function loadQueryWithRealDb(realDb) {
  let mod;
  jest.isolateModules(() => {
    jest.doMock("../../../util/mysql", () => realDb);
    mod = require("../query");
  });
  return mod;
}

beforeAll(async () => {
  db = knex({
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_USER_PASSWORD,
      port: process.env.DB_PORT,
      database: "Princess",
    },
    pool: { min: 0, max: 2 },
  });

  // Fresh table (drop any stale leftover first for an idempotent start).
  await migration.down(db);
  await migration.up(db);

  // Seed across users / groups / dates.
  //  - today + 3-days-ago are inside the 30d (and 7d) window.
  //  - 40-days-ago is OUTSIDE the 30d window (must be excluded).
  await db("topic_daily").insert([
    // U1 in G1 — 凱留 appears twice in-window (10 + 5 = 15) + once out-of-window (99).
    { group_id: G1, user_id: U1, stat_date: dayAgo(0), keyword: "凱留", message_count: 10 },
    { group_id: G1, user_id: U1, stat_date: dayAgo(3), keyword: "凱留", message_count: 5 },
    { group_id: G1, user_id: U1, stat_date: dayAgo(40), keyword: "凱留", message_count: 99 },
    { group_id: G1, user_id: U1, stat_date: dayAgo(0), keyword: "課金", message_count: 4 },
    // U2 in G1 — also says 凱留 (so group userCount for 凱留 = 2).
    { group_id: G1, user_id: U2, stat_date: dayAgo(1), keyword: "凱留", message_count: 7 },
    { group_id: G1, user_id: U2, stat_date: dayAgo(1), keyword: "笑死", message_count: 20 },
    // U1 in a DIFFERENT group G2 — must be excluded when filtering by G1.
    { group_id: G2, user_id: U1, stat_date: dayAgo(0), keyword: "凱留", message_count: 3 },
  ]);

  query = loadQueryWithRealDb(db);
});

afterAll(async () => {
  if (db) {
    await migration.down(db);
    await db.destroy();
  }
});

describe("topUserKeywords", () => {
  it("sums message_count per keyword within the group, desc by count", async () => {
    const rows = await query.topUserKeywords(U1, { groupId: G1, days: 30 });
    // 凱留 = 10 + 5 (the 40-days-ago 99 is excluded), 課金 = 4.
    expect(rows).toEqual([
      { keyword: "凱留", count: 15 },
      { keyword: "課金", count: 4 },
    ]);
  });

  it("excludes rows outside the days window (7d drops the 3-days-ago? no — 3d is inside 7d)", async () => {
    // Within 7 days, both today (10) and 3-days-ago (5) still count.
    const rows = await query.topUserKeywords(U1, { groupId: G1, days: 7 });
    const kairu = rows.find(r => r.keyword === "凱留");
    expect(kairu.count).toBe(15);
  });

  it("excludes the 40-days-ago row from a 30-day window", async () => {
    const rows = await query.topUserKeywords(U1, { groupId: G1, days: 30 });
    const kairu = rows.find(r => r.keyword === "凱留");
    expect(kairu.count).toBe(15); // not 114 (15 + 99)
  });

  it("aggregates across all groups when no groupId is given", async () => {
    // U1 says 凱留 in G1 (15 in-window) AND in G2 (3) -> 18 across all groups.
    const rows = await query.topUserKeywords(U1, { days: 30 });
    const kairu = rows.find(r => r.keyword === "凱留");
    expect(kairu.count).toBe(18);
  });

  it("filters to the given group (G2 only sees its own 3)", async () => {
    const rows = await query.topUserKeywords(U1, { groupId: G2, days: 30 });
    expect(rows).toEqual([{ keyword: "凱留", count: 3 }]);
  });
});

describe("topGroupKeywords", () => {
  it("sums counts and counts distinct users per keyword, desc by count", async () => {
    const rows = await query.topGroupKeywords(G1, { days: 30 });
    // 凱留: U1(15) + U2(7) = 22, said by 2 distinct users.
    // 笑死: U2(20), 1 user. 課金: U1(4), 1 user.
    const byKeyword = Object.fromEntries(rows.map(r => [r.keyword, r]));
    expect(byKeyword["凱留"]).toEqual({ keyword: "凱留", count: 22, userCount: 2 });
    expect(byKeyword["笑死"]).toEqual({ keyword: "笑死", count: 20, userCount: 1 });
    expect(byKeyword["課金"]).toEqual({ keyword: "課金", count: 4, userCount: 1 });
    // desc by count.
    const counts = rows.map(r => r.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("does not leak keywords from other groups", async () => {
    const rows = await query.topGroupKeywords(G2, { days: 30 });
    expect(rows).toEqual([{ keyword: "凱留", count: 3, userCount: 1 }]);
  });
});
