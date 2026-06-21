"use strict";

// --- mocks MUST precede requires (jest.config transform:{} -> no hoisting) ---
jest.mock("../src/model/application/WorldBossEvent");
jest.mock("../src/model/application/WorldBossLog");
jest.mock("../src/model/application/WorldBossRewardLog");
jest.mock("../src/model/application/Inventory");
jest.mock("../src/service/AchievementEngine");
jest.mock("../src/service/WorldBossReportService");
jest.mock("../src/util/mysql");

const WorldBossEvent = require("../src/model/application/WorldBossEvent");
const WorldBossLog = require("../src/model/application/WorldBossLog");
const WorldBossRewardLog = require("../src/model/application/WorldBossRewardLog");
const { inventory } = require("../src/model/application/Inventory");
const AchievementEngine = require("../src/service/AchievementEngine");
const WorldBossReportService = require("../src/service/WorldBossReportService");
const mysql = require("../src/util/mysql");
const SettlementService = require("../src/service/WorldBossSettlementService");

// mysql.transaction(cb) runs the callback with a fake trx (a function that
// returns a thenable query builder). We only need .insert() to resolve.
function makeTrx() {
  return jest.fn(() => ({ insert: jest.fn().mockResolvedValue([1]) }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mysql.transaction = jest.fn(async cb => cb(makeTrx()));
  WorldBossEvent.markSettled = jest.fn().mockResolvedValue(true);
  WorldBossLog.getContributionRank = jest.fn().mockResolvedValue([]);
  WorldBossLog.getParticipants = jest.fn().mockResolvedValue([]);
  WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());
  WorldBossLog.getSupportRatio = jest.fn().mockResolvedValue(0.3);
  WorldBossRewardLog.tryInsert = jest.fn().mockResolvedValue(true);
  inventory.increaseGodStone = jest.fn().mockResolvedValue([1]);
  AchievementEngine.evaluate = jest.fn().mockResolvedValue({ unlocked: [] });
  WorldBossReportService.setUnread = jest.fn().mockResolvedValue(undefined);
});

describe("WorldBossSettlementService.settleEvent - claim + aggregation + GATE", () => {
  test("missing event short-circuits with no throw, no claim, no aggregation", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue(undefined);
    WorldBossEvent.markSettled = jest.fn();
    WorldBossLog.getDamageRank = jest.fn();
    await expect(SettlementService.settleEvent(999)).resolves.toBeUndefined();
    expect(WorldBossEvent.markSettled).not.toHaveBeenCalled();
    expect(WorldBossLog.getDamageRank).not.toHaveBeenCalled();
  });

  test("lost the settlement claim (markSettled=false) -> no aggregation, no grant", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    WorldBossEvent.markSettled = jest.fn().mockResolvedValue(false); // another worker won
    WorldBossLog.getDamageRank = jest.fn();
    WorldBossLog.resolveUserIds = jest.fn();

    await SettlementService.settleEvent(7);

    expect(WorldBossEvent.markSettled).toHaveBeenCalledWith(7);
    expect(WorldBossLog.getDamageRank).not.toHaveBeenCalled();
    expect(WorldBossRewardLog.tryInsert).not.toHaveBeenCalled();
  });

  test("claim is the FIRST mutation, BEFORE any aggregation or grant", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    const order = [];
    WorldBossEvent.markSettled = jest.fn(async () => {
      order.push("claim");
      return true;
    });
    WorldBossLog.getDamageRank = jest.fn(async () => {
      order.push("aggregate");
      return [{ total_damage: 5000, user_id: 1, platform_id: "U1" }];
    });
    WorldBossRewardLog.tryInsert = jest.fn(async () => {
      order.push("grant");
      return true;
    });

    await SettlementService.settleEvent(7);

    expect(order[0]).toBe("claim");
    expect(order.indexOf("aggregate")).toBeLessThan(order.indexOf("grant"));
  });

  test("ranked players read platform_id off the row; resolveUserIds runs only for participation-only ids and skips unmapped", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    // numeric 1 & 2 landed damage and carry their own platform_id on the row.
    WorldBossLog.getDamageRank = jest.fn().mockResolvedValue([
      { total_damage: 5000, user_id: 1, platform_id: "U1" },
      { total_damage: 3000, user_id: 2, platform_id: "U2" },
    ]);
    // participants exactly match the ranked ids -> no participation-only remainder.
    WorldBossLog.getParticipants = jest.fn().mockResolvedValue([
      { user_id: 1, platform_id: "U1" },
      { user_id: 2, platform_id: "U2" },
    ]);
    WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());

    await SettlementService.settleEvent(7);

    // ranked players never need resolveUserIds for their grant identity.
    const inserted = WorldBossRewardLog.tryInsert.mock.calls.map(c => c[0].user_id);
    expect(inserted).toContain("U1");
    expect(inserted).toContain("U2");
    // unmapped ids never reach the ledger.
    expect(inserted).not.toContain(null);
    expect(inserted).not.toContain(undefined);
  });
});
