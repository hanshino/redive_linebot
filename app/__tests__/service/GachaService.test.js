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

jest.mock("config", () => ({
  get: jest.fn(key => {
    const values = {
      "gacha.pick_up_cost": 1500,
      "gacha.ensure_cost": 3000,
      "gacha.europe_cost": 5000,
      "gacha.silver_repeat_reward": 1,
      "gacha.gold_repeat_reward": 10,
      "gacha.rainbow_repeat_reward": 50,
    };
    return values[key];
  }),
}));

const GachaModel = require("../../src/model/princess/gacha");
const GachaBanner = require("../../src/model/princess/GachaBanner");
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
    GachaBanner.getActiveBannersWithCharacters.mockResolvedValue([]);
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

  describe("Mode specific tests", () => {
    it("europe: costs 5000 and all rewards are 3-star", async () => {
      const result = await GachaService.runDailyDraw("Ueuro", { europe: true });
      expect(result.godStoneCost).toBe(5000);
      expect(result.rewards.every(r => r.star == "3")).toBe(true);
      expect(result.rareCount["3"]).toBe(10);

      const costInsert = txInserts.find(
        t => t.table === "Inventory" && t.rows.itemId === 999 && t.rows.itemAmount === -5000
      );
      expect(costInsert).toBeDefined();
    });

    it("europe: uses banner cost if active", async () => {
      GachaBanner.getActiveBannersWithCharacters.mockResolvedValue([
        { type: "europe", cost: 4444 },
      ]);
      const result = await GachaService.runDailyDraw("Ubanner", { europe: true });
      expect(result.godStoneCost).toBe(4444);
    });

    it("pickup: costs 1500 and invokes pickup logic (verified via godStoneCost)", async () => {
      const result = await GachaService.runDailyDraw("Upick", { pickup: true });
      expect(result.godStoneCost).toBe(1500);
    });

    it("ensure: costs 3000 and the last reward is guaranteed 3-star", async () => {
      // Force the pool so that 1-star dominates natural draws (rate so high that 3-star's
      // 1% is statistically negligible over 10 pulls), while keeping rainbow rate > 0 so
      // the ensure-mode rainbow pool can still produce a reward via play().
      GachaModel.getDatabasePool.mockResolvedValue([
        { id: 1, name: "silver-1", rate: "10000%", star: "1", isPrincess: "1" },
        { id: 3, name: "rainbow-3", rate: "1%", star: "3", isPrincess: "1" },
      ]);

      const result = await GachaService.runDailyDraw("Uensure", { ensure: true });
      expect(result.godStoneCost).toBe(3000);
      expect(result.rewards.length).toBe(10);
      expect(result.rewards[9].star).toBe("3");
      // The other 9 should be 1-star based on our forced pool (natural rainbow chance ≈ 0.01%).
      const oneStars = result.rewards.slice(0, 9);
      expect(oneStars.every(r => r.star == "1")).toBe(true);
    });
  });
});
