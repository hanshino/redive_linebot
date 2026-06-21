jest.mock("../../src/util/worldBossRedis", () => ({
  poolAdd: jest.fn(),
  poolPopMin: jest.fn(),
  poolScore: jest.fn(),
  poolRemove: jest.fn(),
  shieldSet: jest.fn(),
  shieldConsume: jest.fn(),
  blockSet: jest.fn(),
  blockOwner: jest.fn(),
}));
jest.mock("../../src/model/application/WorldBossLog", () => ({
  createWithRole: jest.fn(),
  getRecentAttackers: jest.fn(),
  getSupportRatio: jest.fn(),
  getTotalDamageByEventId: jest.fn(),
}));
jest.mock("../../src/model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
  casStatus: jest.fn(),
}));
jest.mock("../../src/model/application/UserModel", () => ({ getId: jest.fn() }));
jest.mock("../../src/service/WorldBossEventLogService", () => ({
  getRemainHpByEventId: jest.fn(),
}));
jest.mock("../../src/model/application/RPGCharacter", () => ({ make: jest.fn() }));
jest.mock("../../src/service/EquipmentService", () => ({ getEquipmentBonuses: jest.fn() }));
jest.mock("../../src/service/WorldBossConfig", () => ({
  getReviveCountK: jest.fn(),
  getShieldCountK: jest.fn(),
  getBlockWindowMinutes: jest.fn(),
  getNormalAttackCost: jest.fn(),
  getNaturalRecoveryMinutes: jest.fn(),
  readNaturalRecoveryMinutes: jest.fn(),
}));

const wbRedis = require("../../src/util/worldBossRedis");
const WorldBossLog = require("../../src/model/application/WorldBossLog");
const WorldBossEvent = require("../../src/model/application/WorldBossEvent");
const WorldBossConfig = require("../../src/service/WorldBossConfig");
const combat = require("../../src/service/WorldBossCombatService");

describe("WorldBossCombatService.tankBlock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active" });
    WorldBossConfig.getBlockWindowMinutes.mockReturnValue(5);
  });

  it("opens the block window storing owner=platformId with TTL=window*60; no log row", async () => {
    const res = await combat.tankBlock({ platformId: "Utank", numericUserId: 3, eventId: 7 });
    expect(wbRedis.blockSet).toHaveBeenCalledWith(7, "Utank", 300); // 5 * 60
    expect(res.windowMinutes).toBe(5);
    expect(res.rejected).toBe(false);
    expect(res.reason).toBeNull();
    // absorb credit is M4's enrage handler's job; tankBlock writes NO contribution row.
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  it("rejects with 'not_active' when no active event (no window opened)", async () => {
    WorldBossEvent.getActive.mockResolvedValue(null);
    const res = await combat.tankBlock({ platformId: "Utank", numericUserId: 3, eventId: 7 });
    expect(res.rejected).toBe(true);
    expect(res.reason).toBe("not_active");
    expect(wbRedis.blockSet).not.toHaveBeenCalled();
  });

  it("rejects with 'not_active' when the active event id mismatches", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 8, status: "active" });
    const res = await combat.tankBlock({ platformId: "Utank", numericUserId: 3, eventId: 7 });
    expect(res.rejected).toBe(true);
    expect(res.reason).toBe("not_active");
    expect(wbRedis.blockSet).not.toHaveBeenCalled();
  });
});
