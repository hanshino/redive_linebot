// GachaService.runDailyDraw — unit tests targeting the side-effect ledger
// contract documented in .omc/plans/2026-04-18-subscriber-auto-actions.md §13.

jest.mock("../../src/model/princess/gacha", () => ({
  getDatabasePool: jest.fn(),
  getUserGodStoneCount: jest.fn(),
  getPrincessCharacterCount: jest.fn(),
}));

jest.mock("../../src/model/princess/GachaBanner", () => ({
  getActiveBannersWithCharacters: jest.fn().mockResolvedValue([]),
}));

// Transaction builder — records inserts per-table for post-hoc assertions.
const txInserts = [];
function makeTrxBuilder() {
  const trx = tableName => ({
    insert: jest.fn(async rows => {
      txInserts.push({ table: tableName, rows });
      // Simulate AUTO_INCREMENT: return [1] for gacha_record, [0] for others.
      return tableName === "gacha_record" ? [42] : [0];
    }),
  });
  trx.commit = jest.fn().mockResolvedValue(undefined);
  trx.rollback = jest.fn().mockResolvedValue(undefined);
  return trx;
}
let currentTrx;

jest.mock("../../src/model/application/Inventory", () => {
  const inventory = {
    table: "Inventory",
    transaction: jest.fn(async () => {
      currentTrx = makeTrxBuilder();
      return currentTrx;
    }),
    // `inventory.knex` is used to read own-items before the trx. We stub it
    // via a getter so the query-chain returns the staged array.
  };
  Object.defineProperty(inventory, "knex", {
    get: () => {
      const chain = {};
      chain.where = jest.fn(() => chain);
      chain.select = jest.fn(() => chain);
      chain.andWhereNot = jest.fn(() => chain);
      chain.orderBy = jest.fn(() => Promise.resolve([]));
      return chain;
    },
  });
  return { inventory };
});

jest.mock("../../src/model/princess/GachaRecord", () => ({
  table: "gacha_record",
}));
jest.mock("../../src/model/princess/GachaRecordDetail", () => ({
  table: "gacha_record_detail",
}));
jest.mock("../../src/model/application/SigninDays", () => ({
  first: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/service/EventCenterService", () => ({
  add: jest.fn().mockResolvedValue(undefined),
  getEventName: jest.fn(name => `event_center:${name}`),
}));
jest.mock("../../src/service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));

const GachaModel = require("../../src/model/princess/gacha");
const GachaService = require("../../src/service/GachaService");
const EventCenterService = require("../../src/service/EventCenterService");
const AchievementEngine = require("../../src/service/AchievementEngine");
const signModel = require("../../src/model/application/SigninDays");

function makePool() {
  return [
    { id: 1, name: "silver-1", rate: "70%", star: "1", isPrincess: "1" },
    { id: 2, name: "gold-2", rate: "25%", star: "2", isPrincess: "1" },
    { id: 3, name: "rainbow-3", rate: "5%", star: "3", isPrincess: "1" },
  ];
}

describe("GachaService.runDailyDraw", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    txInserts.length = 0;
    GachaModel.getDatabasePool.mockResolvedValue(makePool());
  });

  it("returns plain-data shape with exactly the seven documented keys", async () => {
    const result = await GachaService.runDailyDraw("Utest_user_1");

    expect(result).toBeDefined();
    expect(Object.keys(result).sort()).toEqual(
      [
        "godStoneCost",
        "newCharacters",
        "ownCharactersCount",
        "rareCount",
        "repeatReward",
        "rewards",
        "unlocks",
      ].sort()
    );
    expect(Array.isArray(result.rewards)).toBe(true);
    expect(result.rewards.length).toBe(10);
    expect(typeof result.rareCount).toBe("object");
    expect(Array.isArray(result.newCharacters)).toBe(true);
    expect(typeof result.ownCharactersCount).toBe("number");
    expect(typeof result.repeatReward).toBe("number");
    expect(typeof result.godStoneCost).toBe("number");
    expect(Array.isArray(result.unlocks)).toBe(true);
  });

  it("does not return any context/reply-flavoured keys", async () => {
    const result = await GachaService.runDailyDraw("Utest_user_2");
    expect(result).not.toHaveProperty("context");
    expect(result).not.toHaveProperty("reply");
    expect(result).not.toHaveProperty("bubble");
    expect(result).not.toHaveProperty("message");
  });

  it("invokes handleSignin, EventCenterService.add, AchievementEngine.evaluate with the contract args", async () => {
    await GachaService.runDailyDraw("Uabc");

    expect(signModel.first).toHaveBeenCalledWith({ filter: { user_id: "Uabc" } });

    expect(EventCenterService.add).toHaveBeenCalledTimes(1);
    expect(EventCenterService.add).toHaveBeenCalledWith("event_center:daily_quest", {
      userId: "Uabc",
    });

    expect(AchievementEngine.evaluate).toHaveBeenCalledTimes(1);
    const [userIdArg, eventArg, metaArg] = AchievementEngine.evaluate.mock.calls[0];
    expect(userIdArg).toBe("Uabc");
    expect(eventArg).toBe("gacha_pull");
    expect(metaArg).toHaveProperty("threeStarCount");
    expect(metaArg).toHaveProperty("uniqueCount");
    expect(metaArg).toHaveProperty("pullType");
  });

  it("writes one GachaRecord row and one GachaRecordDetail row per pulled character", async () => {
    await GachaService.runDailyDraw("Uledger");

    const gachaRecordInserts = txInserts.filter(t => t.table === "gacha_record");
    const detailInserts = txInserts.filter(t => t.table === "gacha_record_detail");
    expect(gachaRecordInserts.length).toBe(1);
    expect(detailInserts.length).toBe(1);
    expect(Array.isArray(detailInserts[0].rows)).toBe(true);
    expect(detailInserts[0].rows.length).toBe(10);
    for (const row of detailInserts[0].rows) {
      expect(row.gacha_record_id).toBe(42);
      expect(row.user_id).toBe("Uledger");
      expect(typeof row.character_id).toBe("number");
      expect(typeof row.star).toBe("number");
      expect(row.is_new === 1 || row.is_new === 0).toBe(true);
    }
  });

  it("commits the transaction on success and does not rollback", async () => {
    await GachaService.runDailyDraw("Ucommit");
    expect(currentTrx.commit).toHaveBeenCalledTimes(1);
    expect(currentTrx.rollback).not.toHaveBeenCalled();
  });

  it("accepts only a userId (no bottender context) without throwing", async () => {
    await expect(GachaService.runDailyDraw("Uonly")).resolves.toBeDefined();
  });

  it("sets godStoneCost=0 when no special draw flags are passed", async () => {
    const result = await GachaService.runDailyDraw("Ufree");
    expect(result.godStoneCost).toBe(0);
    const costInserts = txInserts.filter(
      t => t.table === "Inventory" && t.rows.itemId === 999 && t.rows.itemAmount < 0
    );
    expect(costInserts.length).toBe(0);
  });
});
