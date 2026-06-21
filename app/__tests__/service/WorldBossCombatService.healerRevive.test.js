// jest.mock NOT hoisted — declare BEFORE requiring the service.
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

describe("WorldBossCombatService.healerRevive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active" });
    WorldBossConfig.getReviveCountK.mockReturnValue(2);
    WorldBossConfig.getNormalAttackCost.mockReturnValue(10);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 0 });
    WorldBossLog.createWithRole.mockResolvedValue(1);
  });

  it("revives up to K (base + support_power) platform_ids; contribution = actual popped", async () => {
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 1 }); // K = 2 + 1 = 3
    wbRedis.poolPopMin.mockResolvedValue(["Uv1", "Uv2"]); // only 2 in pool
    const res = await combat.healerRevive({ platformId: "Uheal", numericUserId: 9, eventId: 7 });
    expect(wbRedis.poolPopMin).toHaveBeenCalledWith(7, 3);
    expect(res.revived).toEqual(["Uv1", "Uv2"]);
    expect(res.contribution).toBe(2); // actual popped count, not K
    expect(res.rejected).toBe(false);
    expect(res.reason).toBeNull();
    expect(WorldBossLog.createWithRole).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 9,
        world_boss_event_id: 7,
        role: "healer",
        action_type: "revive",
        damage: 0,
        contribution: 2,
        cost: 10,
      })
    );
  });

  it("writes a contribution=0 participation row (still charges cost) when pool empty (D22)", async () => {
    wbRedis.poolPopMin.mockResolvedValue([]);
    const res = await combat.healerRevive({ platformId: "Uheal", numericUserId: 9, eventId: 7 });
    expect(res.revived).toEqual([]);
    expect(res.contribution).toBe(0);
    expect(res.rejected).toBe(false);
    expect(WorldBossLog.createWithRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: "healer", action_type: "revive", contribution: 0, cost: 10 })
    );
  });

  it("rejects with reason 'not_active' (no row, no cost) when no active event", async () => {
    WorldBossEvent.getActive.mockResolvedValue(null);
    const res = await combat.healerRevive({ platformId: "Uheal", numericUserId: 9, eventId: 7 });
    expect(res.rejected).toBe(true);
    expect(res.reason).toBe("not_active");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  it("rejects with 'not_active' when the active event id mismatches the requested eventId", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 8, status: "active" });
    const res = await combat.healerRevive({ platformId: "Uheal", numericUserId: 9, eventId: 7 });
    expect(res.rejected).toBe(true);
    expect(res.reason).toBe("not_active");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });
});
