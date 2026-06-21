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
}));

const wbRedis = require("../../src/util/worldBossRedis");
const WorldBossLog = require("../../src/model/application/WorldBossLog");
const WorldBossEvent = require("../../src/model/application/WorldBossEvent");
const EquipmentService = require("../../src/service/EquipmentService");
const WorldBossConfig = require("../../src/service/WorldBossConfig");
const combat = require("../../src/service/WorldBossCombatService");

describe("WorldBossCombatService.healerShield", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active" });
    WorldBossConfig.getShieldCountK.mockReturnValue(2);
    WorldBossConfig.getNormalAttackCost.mockReturnValue(10);
    WorldBossConfig.getNaturalRecoveryMinutes.mockReturnValue(15);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 0 });
    WorldBossLog.createWithRole.mockResolvedValue(1);
  });

  it("opens shields on up to K recent attackers (owner=platformId, TTL=recovery*60); contribution=0", async () => {
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { user_id: 11, platform_id: "U11" },
      { user_id: 12, platform_id: "U12" },
      { user_id: 13, platform_id: "U13" },
    ]);
    const res = await combat.healerShield({ platformId: "Ushield", numericUserId: 8, eventId: 7 });
    expect(res.shielded).toEqual(["U11", "U12"]); // K = 2
    expect(res.contribution).toBe(0); // own immediate contribution is 0; absorb credit lands later
    expect(res.rejected).toBe(false);
    expect(wbRedis.shieldSet).toHaveBeenCalledTimes(2);
    expect(wbRedis.shieldSet).toHaveBeenCalledWith(7, "U11", "Ushield", 900); // 15*60
    expect(wbRedis.shieldSet).toHaveBeenCalledWith(7, "U12", "Ushield", 900);
    expect(WorldBossLog.createWithRole).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 8,
        role: "healer",
        action_type: "shield",
        damage: 0,
        contribution: 0,
        cost: 10,
      })
    );
  });

  it("K scales with support_power; shields fewer when fewer recent attackers exist", async () => {
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 2 }); // K = 2 + 2 = 4
    WorldBossLog.getRecentAttackers.mockResolvedValue([{ user_id: 11, platform_id: "U11" }]);
    const res = await combat.healerShield({ platformId: "Ushield", numericUserId: 8, eventId: 7 });
    expect(res.shielded).toEqual(["U11"]);
    expect(wbRedis.shieldSet).toHaveBeenCalledTimes(1);
  });

  it("writes a D22 participation row even when there are no recent attackers to shield", async () => {
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    const res = await combat.healerShield({ platformId: "Ushield", numericUserId: 8, eventId: 7 });
    expect(res.shielded).toEqual([]);
    expect(res.contribution).toBe(0);
    expect(wbRedis.shieldSet).not.toHaveBeenCalled();
    expect(WorldBossLog.createWithRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: "healer", action_type: "shield", contribution: 0, cost: 10 })
    );
  });

  it("rejects with 'not_active' when no active event (no token, no row)", async () => {
    WorldBossEvent.getActive.mockResolvedValue(null);
    const res = await combat.healerShield({ platformId: "Ushield", numericUserId: 8, eventId: 7 });
    expect(res.rejected).toBe(true);
    expect(res.reason).toBe("not_active");
    expect(wbRedis.shieldSet).not.toHaveBeenCalled();
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });
});
