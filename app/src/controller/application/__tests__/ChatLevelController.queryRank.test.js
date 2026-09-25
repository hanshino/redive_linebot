// Regression coverage for ChatLevelController.api.queryRank.
//
// Ordering contract (after unchanged primary prestige_count DESC,
// current_exp DESC): final_max_level_reached_at ASC (NULL first — legacy
// cohort ranks ahead of every timestamped finisher; timestamped finishers
// order by actual time), then two CASE clauses scoped to the legacy (NULL
// timestamp) rows only — explicit final_max_level_legacy_order ASC (1 =
// earliest, adopted from historical evidence, never inferred) ranks a
// known legacy order ahead of an unspecified one — then user_id ASC as the
// final stable fallback.
//
// This suite has two kinds of evidence, not one:
//   1. `queryRank builds the documented ORDER BY clause` compiles the exact
//      SQL via a real, unconnected `knex({ client: "mysql2" })` instance and
//      asserts the literal generated SQL string/bindings — this is the
//      actual DB contract, not an assumption about what the code intends.
//   2. `mirrors the SQL semantics over a representative dataset` re-implements
//      that same multi-key ORDER BY as a pure JS comparator and sorts a
//      mixed dataset (legacy order 1/2, legacy unknown NULL, two timestamped
//      rows, all with deliberately reversed/adversarial user_id lexical
//      order, plus a lower-exp and a lower-prestige row) — this is the
//      strongest check runnable without a live MySQL connection. It is a
//      model of the SQL, not a live DB execution; no MySQL server is started
//      or written to here (none is available in this environment).
// The remaining "pass-through" tests below intentionally do NOT claim that
// pre-ordered mock rows prove DB sorting — they only prove the controller
// trusts whatever order the DB query already returned and never re-sorts
// client-side (name resolution, rank numbering, JSON shape).
jest.mock("../../../model/application/UserModel", () => ({
  getDisplayNames: jest.fn(),
}));

const realKnex = require("knex")({ client: "mysql2" }); // unconnected; SQL compile only
const mysql = require("../../../util/mysql");
const UserModel = require("../../../model/application/UserModel");
const ChatLevelController = require("../ChatLevelController");

afterAll(() => realKnex.destroy());

function makeRankQuery(rows) {
  const q = {};
  q.select = jest.fn(() => q);
  q.where = jest.fn(() => q);
  q.orderBy = jest.fn(() => q);
  q.orderByRaw = jest.fn(() => q);
  q.limit = jest.fn().mockResolvedValue(rows);
  return q;
}

function makeBlessingQuery(rows) {
  const q = {};
  q.select = jest.fn(() => q);
  q.whereIn = jest.fn().mockResolvedValue(rows);
  return q;
}

function stubMysql({ rankRows, blessingRows = [] }) {
  const rankQuery = makeRankQuery(rankRows);
  const blessingQuery = makeBlessingQuery(blessingRows);
  mysql.mockImplementation(table => {
    if (table === "chat_user_data") return rankQuery;
    if (table === "user_blessings") return blessingQuery;
    throw new Error(`unexpected table: ${table}`);
  });
  return { rankQuery, blessingQuery };
}

// Captures the exact SQL the real query-builder chain compiles to, by
// wiring `mysql("chat_user_data")` to a real unconnected knex builder
// instead of a plain jest.fn() chain. `.limit()` (the final chain call in
// queryRank) is intercepted to snapshot `.toSQL().toNative()` before
// resolving with the given fixture rows — no network/DB access happens.
function stubMysqlWithRealSql(rows) {
  const capture = {};
  mysql.mockImplementation(table => {
    const qb = realKnex(table);
    const originalLimit = qb.limit.bind(qb);
    qb.limit = (...args) => {
      const withLimit = originalLimit(...args);
      const native = withLimit.toSQL().toNative();
      capture.sql = native.sql;
      capture.bindings = native.bindings;
      withLimit.then = resolve => resolve(rows);
      return withLimit;
    };
    return qb;
  });
  return capture;
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const A = "U" + "a".repeat(32);
const B = "U" + "b".repeat(32);

describe("ChatLevelController.api.queryRank", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds the documented ORDER BY clause exactly (real, unconnected knex compile — the actual SQL contract)", async () => {
    const capture = stubMysqlWithRealSql([]);
    UserModel.getDisplayNames.mockResolvedValue(new Map());

    await ChatLevelController.api.queryRank({}, createRes());

    expect(capture.sql).toBe(
      "select `user_id`, `current_level`, `current_exp`, `prestige_count` " +
        "from `chat_user_data` where `current_exp` > ? " +
        "order by `prestige_count` desc, `current_exp` desc, " +
        "`final_max_level_reached_at` asc, " +
        "case when `final_max_level_reached_at` is null then " +
        "(`final_max_level_legacy_order` is null) end asc, " +
        "case when `final_max_level_reached_at` is null then " +
        "`final_max_level_legacy_order` end asc, " +
        "`user_id` asc limit ?"
    );
    expect(capture.bindings).toEqual([0, 10]);
  });

  it("mirrors the SQL semantics over a representative dataset: legacy order 1/2, legacy unknown, timestamped, adversarial user_id lexical order, primary prestige/exp dominance (pure JS model — no MySQL server involved)", () => {
    // Faithful re-implementation of the ORDER BY clause asserted above, key
    // by key, so this test can run without any DB connection while still
    // proving the *semantics* the SQL contract test only proves as a string.
    function compareRows(a, b) {
      if (a.prestige_count !== b.prestige_count) return b.prestige_count - a.prestige_count;
      if (a.current_exp !== b.current_exp) return b.current_exp - a.current_exp;

      const aTsNull = a.final_max_level_reached_at == null;
      const bTsNull = b.final_max_level_reached_at == null;
      if (aTsNull !== bTsNull) return aTsNull ? -1 : 1; // ASC: NULL first
      if (!aTsNull) {
        const diff =
          new Date(a.final_max_level_reached_at).getTime() -
          new Date(b.final_max_level_reached_at).getTime();
        if (diff !== 0) return diff;
      }

      // CASE WHEN ts IS NULL THEN (legacy_order IS NULL) END ASC
      const aFlag = aTsNull ? (a.final_max_level_legacy_order == null ? 1 : 0) : null;
      const bFlag = bTsNull ? (b.final_max_level_legacy_order == null ? 1 : 0) : null;
      if ((aFlag === null) !== (bFlag === null)) return aFlag === null ? -1 : 1;
      if (aFlag !== null && aFlag !== bFlag) return aFlag - bFlag;

      // CASE WHEN ts IS NULL THEN legacy_order END ASC
      const aOrder = aTsNull ? a.final_max_level_legacy_order : null;
      const bOrder = bTsNull ? b.final_max_level_legacy_order : null;
      if ((aOrder == null) !== (bOrder == null)) return aOrder == null ? -1 : 1;
      if (aOrder != null && aOrder !== bOrder) return aOrder - bOrder;

      return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
    }

    // Deliberately adversarial user_id assignment: within each tie-break
    // group, the row that MUST rank first is given a lexically LARGER
    // user_id than its sibling, so a naive/accidental user_id-driven sort
    // would produce the wrong order and this test would fail.
    const legacyOrder1 = {
      // Adopted legacy order 1 (earliest of the two known legacy finishers)
      user_id: "U" + "q".repeat(32), // lexically > legacyOrder2's user_id
      current_exp: 999999,
      prestige_count: 5,
      final_max_level_reached_at: null,
      final_max_level_legacy_order: 1,
    };
    const legacyOrder2 = {
      // Adopted legacy order 2 (second of the two known legacy finishers)
      user_id: "U" + "k".repeat(32), // lexically < legacyOrder1's user_id
      current_exp: 999999,
      prestige_count: 5,
      final_max_level_reached_at: null,
      final_max_level_legacy_order: 2,
    };
    const legacyUnknown = {
      user_id: "U" + "u".repeat(32),
      current_exp: 999999,
      prestige_count: 5,
      final_max_level_reached_at: null,
      final_max_level_legacy_order: null,
    };
    const timestampedEarlier = {
      user_id: "U" + "z".repeat(32), // lexically > timestampedLater's user_id
      current_exp: 999999,
      prestige_count: 5,
      final_max_level_reached_at: new Date("2026-01-01T00:00:00Z"),
      final_max_level_legacy_order: null,
    };
    const timestampedLater = {
      user_id: "U" + "b".repeat(32), // lexically < timestampedEarlier's user_id
      current_exp: 999999,
      prestige_count: 5,
      final_max_level_reached_at: new Date("2026-01-02T00:00:00Z"),
      final_max_level_legacy_order: null,
    };
    const lowerExpSamePrestige = {
      // Same prestige_count, lower current_exp, but the earliest possible
      // legacy order and an ancient timestamp — must still rank AFTER every
      // row above because current_exp DESC is primary, not the tie-break.
      user_id: "U" + "0".repeat(32),
      current_exp: 500000,
      prestige_count: 5,
      final_max_level_reached_at: null,
      final_max_level_legacy_order: 1,
    };
    const lowerPrestige = {
      // Highest exp/earliest legacy order of all, but prestige_count=3 <
      // everyone else's 5 — must rank dead last regardless of every other
      // signal, proving primary sort dominates the tie-break entirely.
      user_id: "U" + "1".repeat(32),
      current_exp: 999999999,
      prestige_count: 3,
      final_max_level_reached_at: null,
      final_max_level_legacy_order: 1,
    };

    const expectedOrder = [
      legacyOrder1,
      legacyOrder2,
      legacyUnknown,
      timestampedEarlier,
      timestampedLater,
      lowerExpSamePrestige,
      lowerPrestige,
    ];

    // Shuffle the input away from the expected order so the comparator, not
    // input order, is what produces the result.
    const shuffled = [
      lowerPrestige,
      timestampedLater,
      legacyUnknown,
      lowerExpSamePrestige,
      legacyOrder2,
      timestampedEarlier,
      legacyOrder1,
    ];

    const sorted = [...shuffled].sort(compareRows);

    expect(sorted.map(r => r.user_id)).toEqual(expectedOrder.map(r => r.user_id));
  });

  it("(pass-through, not a sorting proof) preserves whatever row order the DB query returns — rank numbering follows array position, no client-side re-sort", async () => {
    const rowA = { user_id: A, current_level: 100, current_exp: 999999, prestige_count: 5 };
    const rowB = { user_id: B, current_level: 100, current_exp: 999999, prestige_count: 5 };
    stubMysql({ rankRows: [rowA, rowB] });
    UserModel.getDisplayNames.mockResolvedValue(
      new Map([
        [A, "First"],
        [B, "Second"],
      ])
    );

    const res = createRes();
    await ChatLevelController.api.queryRank({}, res);

    // Whatever order the DB returned (rowA, rowB) is preserved verbatim as
    // rank 1/2 — the actual sorting correctness is established by the two
    // tests above, not by this fixture's row order.
    expect(res.body.map(r => r.displayName)).toEqual(["First", "Second"]);
    expect(res.body.map(r => r.rank)).toEqual([1, 2]);
    expect(res.body[0].awakened).toBe(true);
    expect(res.body[1].awakened).toBe(true);
  });

  it("resolves all displayNames via a single UserModel.getDisplayNames call, not per-row LINE lookups", async () => {
    stubMysql({
      rankRows: [
        { user_id: A, current_level: 50, current_exp: 100, prestige_count: 0 },
        { user_id: B, current_level: 40, current_exp: 90, prestige_count: 0 },
      ],
    });
    UserModel.getDisplayNames.mockResolvedValue(
      new Map([
        [A, "Alice"],
        [B, "Bob"],
      ])
    );

    const res = createRes();
    await ChatLevelController.api.queryRank({}, res);

    expect(UserModel.getDisplayNames).toHaveBeenCalledTimes(1);
    expect(UserModel.getDisplayNames).toHaveBeenCalledWith([A, B]);
    expect(res.body.map(r => r.displayName)).toEqual(["Alice", "Bob"]);
  });

  it("falls back to 未知N (1-indexed) when a name is missing or empty; never fails the request", async () => {
    stubMysql({
      rankRows: [
        { user_id: A, current_level: 50, current_exp: 100, prestige_count: 0 },
        { user_id: B, current_level: 40, current_exp: 90, prestige_count: 0 },
      ],
    });
    // A missing entirely, B present but empty string.
    UserModel.getDisplayNames.mockResolvedValue(new Map([[B, ""]]));

    const res = createRes();
    await expect(ChatLevelController.api.queryRank({}, res)).resolves.toBeUndefined();

    expect(res.statusCode).toBe(200);
    expect(res.body.map(r => r.displayName)).toEqual(["未知1", "未知2"]);
  });

  it("returns [] and skips both blessing lookup and getDisplayNames when there are no ranked rows", async () => {
    const { blessingQuery } = stubMysql({ rankRows: [] });

    const res = createRes();
    await ChatLevelController.api.queryRank({}, res);

    expect(res.body).toEqual([]);
    expect(blessingQuery.whereIn).not.toHaveBeenCalled();
    expect(UserModel.getDisplayNames).not.toHaveBeenCalled();
  });
});
