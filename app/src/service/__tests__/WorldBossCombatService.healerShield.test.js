jest.mock("../../model/application/UserModel", () => ({
  getId: jest.fn(),
}));
jest.mock("../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
  casStatus: jest.fn(),
}));
jest.mock("../../model/application/WorldBossLog", () => ({
  createWithRole: jest.fn(),
  getRecentAttackers: jest.fn(),
  getTotalDamageByEventId: jest.fn(),
}));
jest.mock("../../util/worldBossRedis", () => ({
  poolAdd: jest.fn(),
  poolPopMin: jest.fn(),
  poolScore: jest.fn(),
  poolRemove: jest.fn(),
  shieldSet: jest.fn(),
  shieldConsume: jest.fn(),
  blockSet: jest.fn(),
  blockOwner: jest.fn(),
}));
jest.mock("../EquipmentService", () => ({
  getEquipmentBonuses: jest.fn(),
}));
jest.mock("../WorldBossConfig", () => ({
  getNormalAttackCost: jest.fn(() => 10),
  getShieldCountK: jest.fn(() => 2),
  readNaturalRecoveryMinutes: jest.fn(() => 15),
  readEnrageRecentMinutes: jest.fn(() => 10),
}));

const WorldBossEvent = require("../../model/application/WorldBossEvent");
const WorldBossLog = require("../../model/application/WorldBossLog");
const wbRedis = require("../../util/worldBossRedis");
const EquipmentService = require("../EquipmentService");
const WorldBossConfig = require("../WorldBossConfig");
const combat = require("../WorldBossCombatService");

describe("WorldBossCombatService.healerShield", () => {
  const EVENT_ID = 7;
  const HEALER_PLATFORM_ID = "Uhealer1";
  const HEALER_NUMERIC_ID = 99;

  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossEvent.getActive.mockResolvedValue({
      id: EVENT_ID,
      status: "active",
      hp: 100000,
      luck: 0,
    });
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 0 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { platform_id: "Udps1" },
      { platform_id: "Udps2" },
    ]);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    wbRedis.shieldSet.mockResolvedValue("OK");
  });

  test("rejects when no active event", async () => {
    WorldBossEvent.getActive.mockResolvedValue(null);
    const result = await combat.healerShield({
      platformId: HEALER_PLATFORM_ID,
      numericUserId: HEALER_NUMERIC_ID,
      eventId: EVENT_ID,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("not_active");
  });

  test("rejects when active event id does not match", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 999, status: "active", hp: 100000, luck: 0 });
    const result = await combat.healerShield({
      platformId: HEALER_PLATFORM_ID,
      numericUserId: HEALER_NUMERIC_ID,
      eventId: EVENT_ID,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("not_active");
  });

  test("shieldSet called with ttlSec = readNaturalRecoveryMinutes * 60 = 900", async () => {
    // readNaturalRecoveryMinutes returns 15 min => ttlSec must be 900
    await combat.healerShield({
      platformId: HEALER_PLATFORM_ID,
      numericUserId: HEALER_NUMERIC_ID,
      eventId: EVENT_ID,
    });
    expect(wbRedis.shieldSet).toHaveBeenCalledTimes(2);
    // Each call: shieldSet(eventId, target, ownerHealerPlatformId, 900)
    expect(wbRedis.shieldSet).toHaveBeenCalledWith(EVENT_ID, "Udps1", HEALER_PLATFORM_ID, 900);
    expect(wbRedis.shieldSet).toHaveBeenCalledWith(EVENT_ID, "Udps2", HEALER_PLATFORM_ID, 900);
  });

  test("readNaturalRecoveryMinutes is called with the active event row", async () => {
    const activeRow = { id: EVENT_ID, status: "active", hp: 100000, luck: 0 };
    WorldBossEvent.getActive.mockResolvedValue(activeRow);
    await combat.healerShield({
      platformId: HEALER_PLATFORM_ID,
      numericUserId: HEALER_NUMERIC_ID,
      eventId: EVENT_ID,
    });
    expect(WorldBossConfig.readNaturalRecoveryMinutes).toHaveBeenCalledWith(activeRow);
  });

  test("shielded list contains platform_ids of recent attackers", async () => {
    const result = await combat.healerShield({
      platformId: HEALER_PLATFORM_ID,
      numericUserId: HEALER_NUMERIC_ID,
      eventId: EVENT_ID,
    });
    expect(result.rejected).toBe(false);
    expect(result.shielded).toEqual(["Udps1", "Udps2"]);
  });

  test("writes participation log row with contribution=0 and healer role", async () => {
    await combat.healerShield({
      platformId: HEALER_PLATFORM_ID,
      numericUserId: HEALER_NUMERIC_ID,
      eventId: EVENT_ID,
    });
    expect(WorldBossLog.createWithRole).toHaveBeenCalledTimes(1);
    const arg = WorldBossLog.createWithRole.mock.calls[0][0];
    expect(arg).toMatchObject({
      user_id: HEALER_NUMERIC_ID,
      world_boss_event_id: EVENT_ID,
      role: "healer",
      action_type: "shield",
      damage: 0,
      contribution: 0,
    });
  });

  test("support_power equipment bonus increases shield K count", async () => {
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 1 });
    // getShieldCountK()=2 + support_power=1 => k=3; but only 2 attackers → shieldSet called 2x
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { platform_id: "Udps1" },
      { platform_id: "Udps2" },
      { platform_id: "Udps3" },
    ]);
    const result = await combat.healerShield({
      platformId: HEALER_PLATFORM_ID,
      numericUserId: HEALER_NUMERIC_ID,
      eventId: EVENT_ID,
    });
    expect(wbRedis.shieldSet).toHaveBeenCalledTimes(3);
    expect(result.shielded).toHaveLength(3);
  });
});
