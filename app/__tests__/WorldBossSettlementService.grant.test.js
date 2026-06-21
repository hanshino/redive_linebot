"use strict";

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
const Settlement = require("../src/service/WorldBossSettlementService");

function makeTrx() {
  const insert = jest.fn().mockResolvedValue([1]);
  const trx = jest.fn(() => ({ insert }));
  trx.__insert = insert;
  return trx;
}

let lastTrx;

beforeEach(() => {
  jest.clearAllMocks();
  lastTrx = makeTrx();
  mysql.transaction = jest.fn(async cb => cb(lastTrx));
  WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
    id: 7,
    status: "killed",
    settled_at: null,
  });
  WorldBossEvent.markSettled = jest.fn().mockResolvedValue(true);
  WorldBossEvent.casStatus = jest.fn().mockResolvedValue(true);
  WorldBossLog.getDamageRank = jest
    .fn()
    .mockResolvedValue([{ user_id: 1, total_damage: 5000, platform_id: "U1" }]);
  WorldBossLog.getContributionRank = jest.fn().mockResolvedValue([]);
  WorldBossLog.getParticipants = jest.fn().mockResolvedValue([{ user_id: 1, platform_id: "U1" }]);
  WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());
  WorldBossLog.getSupportRatio = jest.fn().mockResolvedValue(0.3);
  WorldBossRewardLog.tryInsert = jest.fn().mockResolvedValue(true);
  inventory.increaseGodStone = jest.fn().mockResolvedValue([1]);
  AchievementEngine.evaluate = jest.fn().mockResolvedValue({ unlocked: [] });
  WorldBossReportService.setUnread = jest.fn().mockResolvedValue(undefined);
});

describe("settleEvent - per-user grant trx + achievement + unread flag", () => {
  test("dps mvp: reward-log first, then material ledger (number itemAmount), then stones, in one trx", async () => {
    await Settlement.settleEvent(7);

    expect(WorldBossRewardLog.tryInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "U1",
        world_boss_event_id: 7,
        is_mvp: true,
        board: "dps",
        rank: 1,
      }),
      lastTrx
    );
    // material ledger via trx-bound builder; item 1001; positive NUMBER amount.
    expect(lastTrx).toHaveBeenCalledWith("Inventory");
    const insertedRows = lastTrx.__insert.mock.calls[0][0];
    expect(insertedRows[0]).toEqual(
      expect.objectContaining({
        userId: "U1",
        itemId: 1001,
        note: "world_boss_reward",
      })
    );
    expect(typeof insertedRows[0].itemAmount).toBe("number");
    expect(insertedRows[0].itemAmount).toBeGreaterThan(0);
    // mvp stones via increaseGodStone with trx (positive grant).
    expect(inventory.increaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "U1", amount: 30, note: "world_boss_mvp", trx: lastTrx })
    );
  });

  test("duplicate reward-log (tryInsert=false) skips all ledger writes for that user", async () => {
    WorldBossRewardLog.tryInsert.mockResolvedValue(false);
    await Settlement.settleEvent(7);
    expect(lastTrx).not.toHaveBeenCalled(); // no Inventory insert
    expect(inventory.increaseGodStone).not.toHaveBeenCalled();
  });

  test("settlement is claimed via markSettled; D26 achievement fires with isTopDamage; report flag set", async () => {
    await Settlement.settleEvent(7);
    expect(WorldBossEvent.markSettled).toHaveBeenCalledWith(7);
    expect(AchievementEngine.evaluate).toHaveBeenCalledWith(
      "U1",
      "boss_attack",
      expect.objectContaining({ feature: "world_boss", isTopDamage: true })
    );
    expect(WorldBossReportService.setUnread).toHaveBeenCalledWith("U1");
  });
});
