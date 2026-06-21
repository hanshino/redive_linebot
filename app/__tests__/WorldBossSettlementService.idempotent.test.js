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

// Simulate the unique-key behaviour of world_boss_reward_log across runs.
const granted = new Set();

function makeTrx() {
  return jest.fn(() => ({ insert: jest.fn().mockResolvedValue([1]) }));
}

beforeEach(() => {
  jest.clearAllMocks();
  granted.clear();
  mysql.transaction = jest.fn(async cb => cb(makeTrx()));
  WorldBossLog.getContributionRank = jest.fn().mockResolvedValue([]);
  WorldBossLog.getSupportRatio = jest.fn().mockResolvedValue(0.3);
  WorldBossRewardLog.tryInsert = jest.fn(async ({ user_id }) => {
    const key = `${user_id}:7`;
    if (granted.has(key)) return false;
    granted.add(key);
    return true;
  });
  inventory.increaseGodStone = jest.fn().mockResolvedValue([1]);
  AchievementEngine.evaluate = jest.fn().mockResolvedValue({ unlocked: [] });
  WorldBossReportService.setUnread = jest.fn().mockResolvedValue(undefined);
});

describe("settleEvent idempotency under retry", () => {
  test("two consecutive settleEvent runs grant each user exactly once", async () => {
    // markSettled returns true only the FIRST time (real atomic-claim behaviour).
    let claimed = false;
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    WorldBossEvent.markSettled = jest.fn(async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    });
    WorldBossLog.getDamageRank = jest.fn().mockResolvedValue([
      { user_id: 1, total_damage: 5000, platform_id: "U1" },
      { user_id: 2, total_damage: 3000, platform_id: "U2" },
    ]);
    WorldBossLog.getParticipants = jest.fn().mockResolvedValue([
      { user_id: 1, platform_id: "U1" },
      { user_id: 2, platform_id: "U2" },
    ]);
    WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());

    await Settlement.settleEvent(7);
    await Settlement.settleEvent(7); // second run blocked at the markSettled claim.

    // U1 (dps mvp) gets stones exactly once; U2 (non-mvp) never.
    const u1Stones = inventory.increaseGodStone.mock.calls.filter(c => c[0].userId === "U1");
    expect(u1Stones.length).toBe(1);
    const u2Stones = inventory.increaseGodStone.mock.calls.filter(c => c[0].userId === "U2");
    expect(u2Stones.length).toBe(0);
    // second run did not re-enter the grant loop at all.
    expect(WorldBossEvent.markSettled).toHaveBeenCalledTimes(2);
    expect(WorldBossLog.getDamageRank).toHaveBeenCalledTimes(1); // only the first (claimed) run
  });

  test("NON-tautological GATE: a participation-only numeric id that fails to resolve never reaches the ledger", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    WorldBossEvent.markSettled = jest.fn().mockResolvedValue(true);
    // Ranked row carries platform_id directly - resolves trivially (by design).
    WorldBossLog.getDamageRank = jest
      .fn()
      .mockResolvedValue([{ user_id: 1, total_damage: 5000, platform_id: "U1" }]);
    // A participation-only id 99 with NO platform_id (deleted account). It is not on
    // any ranked board, so the service must resolve it via resolveUserIds - which
    // returns an EMPTY Map (skipped per lock §B / addendum §4) -> 99 stays unmapped.
    WorldBossLog.getParticipants = jest.fn().mockResolvedValue([
      { user_id: 1, platform_id: "U1" },
      { user_id: 99, platform_id: null },
    ]);
    WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());

    await Settlement.settleEvent(7);

    // resolveUserIds was called for the participation-only remainder (id 99).
    expect(WorldBossLog.resolveUserIds).toHaveBeenCalledWith(expect.arrayContaining([99]));
    const inserted = WorldBossRewardLog.tryInsert.mock.calls.map(c => c[0].user_id);
    // ranked U1 granted; unresolved 99 skipped - NOT keyed on the raw numeric id.
    expect(inserted).toContain("U1");
    expect(inserted).not.toContain(99);
    expect(inserted).not.toContain("99");
    expect(inserted).not.toContain(null);
    expect(inserted).not.toContain(undefined);
  });
});
