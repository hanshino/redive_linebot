// DailyRation.js — 覆蓋規則單元測試：持有有效 month_plus 的玩家不應出現在 month 的每日配給名單中。
// 全部走 model 層 mock，不連真實 DB；驗證的是 SubscribeUser.getDailyRation 產生的 query 有沒有
// 疊上正確的 whereNotIn 子查詢條件（見 src/model/application/SubscribeUser.js#getDailyRation）。

// 全域 __tests__/setup.js 的 Logger mock 沒有 CustomLogger（只有 getLogger/DefaultLogger），
// DailyRation.js 用的是 CustomLogger，這裡補上。
jest.mock("../../src/util/Logger", () => ({
  getLogger: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }),
  DefaultLogger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  CustomLogger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("../../src/model/application/SubscribeJobLog", () => ({
  table: "subscribe_job_log",
  type: {
    month_daily_ration: "month_daily_ration",
    season_daily_ration: "season_daily_ration",
    month_plus_daily_ration: "month_plus_daily_ration",
  },
  knex: { insert: jest.fn() },
  connection: { transaction: jest.fn(cb => cb({})) },
}));

const moment = require("moment");
const SubscribeCard = require("../../src/model/application/SubscribeCard");
const SubscribeUser = require("../../src/model/application/SubscribeUser");
const SubscribeJobLog = require("../../src/model/application/SubscribeJobLog");
const { inventory: Inventory } = require("../../src/model/application/Inventory");
const main = require("../DailyRation");

describe("SubscribeCard whitelist / SUPERSEDED_BY constants", () => {
  it("SubscribeCard.key includes month_plus", () => {
    expect(SubscribeCard.key.month_plus).toBe("month_plus");
  });

  it("SUPERSEDED_BY declares month is overridden by month_plus, season is untouched", () => {
    expect(SubscribeCard.SUPERSEDED_BY.month).toEqual(["month_plus"]);
    expect(SubscribeCard.SUPERSEDED_BY.season).toBeUndefined();
  });
});

describe("SubscribeUser.getDailyRation — Plus supersedes month", () => {
  const now = moment("2026-09-16T12:00:00Z");

  function makeChainableQuery() {
    const calls = [];
    const query = {};
    const record = method => {
      query[method] = jest.fn((...args) => {
        calls.push({ method, args });
        return query;
      });
    };
    ["where", "andWhere"].forEach(record);
    query.whereNotIn = jest.fn((...args) => {
      calls.push({ method: "whereNotIn", args });
      return query;
    });
    query.select = jest.fn(() => Promise.resolve([]));
    query.__calls = calls;
    return query;
  }

  it("month query adds an extra whereNotIn subquery filtering active month_plus holders", () => {
    const query = makeChainableQuery();
    jest.spyOn(SubscribeUser, "knex", "get").mockReturnValue(query);

    SubscribeUser.getDailyRation({ key: "month", now: now.clone() });

    // whereNotIn 被呼叫兩次：一次是既有的 job_log 排重複發放，一次是新加的覆蓋排除。
    const whereNotInCalls = query.__calls.filter(c => c.method === "whereNotIn");
    expect(whereNotInCalls.length).toBe(2);

    // 驗證第二個 whereNotIn 的子查詢確實鎖定 month_plus（不是寫死字串，而是查 SUPERSEDED_BY）。
    const supersededSubqueryBuilder = whereNotInCalls[1].args[1];
    const subBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
    };
    supersededSubqueryBuilder(subBuilder);
    expect(subBuilder.whereIn).toHaveBeenCalledWith(
      "subscribe_card_key",
      SubscribeCard.SUPERSEDED_BY.month
    );

    SubscribeUser.knex.mockRestore && SubscribeUser.knex.mockRestore();
  });

  it("season query does NOT add the extra whereNotIn (season is never superseded)", () => {
    const query = makeChainableQuery();
    jest.spyOn(SubscribeUser, "knex", "get").mockReturnValue(query);

    SubscribeUser.getDailyRation({ key: "season", now: now.clone() });

    const whereNotInCalls = query.__calls.filter(c => c.method === "whereNotIn");
    expect(whereNotInCalls.length).toBe(1); // 只有既有的 job_log 排重複發放
  });
});

describe("DailyRation.main — processes month_plus alongside month/season", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(SubscribeUser, "getDailyRation").mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    });
    jest.spyOn(SubscribeCard, "first").mockResolvedValue(null);
  });
  afterEach(() => jest.restoreAllMocks());

  it("iterates month, season, and month_plus (in that order)", async () => {
    await main();

    const keysProcessed = SubscribeUser.getDailyRation.mock.calls.map(c => c[0].key);
    expect(keysProcessed).toEqual(["month", "season", "month_plus"]);
  });

  it("month_plus resolves SubscribeJobLog.type via the `${key}_daily_ration` convention", async () => {
    SubscribeUser.getDailyRation.mockReturnValue({
      select: jest.fn().mockResolvedValue([{ userId: "Uplus" }]),
    });
    SubscribeCard.first.mockResolvedValue({
      key: "month_plus",
      effects: [{ type: "daily_ration", value: 999 }],
    });
    jest.spyOn(Inventory.knex, "insert").mockResolvedValue([0]);
    jest.spyOn(SubscribeJobLog.knex, "insert").mockResolvedValue([0]);

    await main();

    const insertedTypes = SubscribeJobLog.knex.insert.mock.calls.map(c => c[0].type);
    expect(insertedTypes).toContain("month_plus_daily_ration");
  });
});
