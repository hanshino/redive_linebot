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
  getEnrageDamageMultiplier: jest.fn(() => 2),
  getEnrageContributionMultiplier: jest.fn(() => 2),
  readEnrageThresholdPct: jest.fn(() => 35),
  readEnrageBatchSize: jest.fn(() => 20),
  readEnrageRecentMinutes: jest.fn(() => 10),
  readEnrageCounterRate: jest.fn(() => 0.15),
  readNaturalRecoveryMinutes: jest.fn(() => 15),
}));

const WorldBossEvent = require("../../model/application/WorldBossEvent");
const WorldBossLog = require("../../model/application/WorldBossLog");
const wbRedis = require("../../util/worldBossRedis");
const EquipmentService = require("../EquipmentService");
const combat = require("../WorldBossCombatService");

describe("WorldBossCombatService.dpsAttack — calm phase damage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    wbRedis.poolScore.mockResolvedValue(null);
    // calm: only a small amount of HP gone, well above the 35% threshold
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 1000 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
  });

  test("level-50 swordman standard hit = getStandardDamage (2500+500=3000)", async () => {
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // getStandardDamage(50) = floor(50^2) + 50*10 = 2500 + 500 = 3000
    expect(result.rejected).toBe(false);
    expect(result.enraged).toBe(false);
    expect(result.didEnrageTrigger).toBe(false);
    expect(result.damage).toBe(3000);
    expect(result.contribution).toBe(3000);
  });

  test("atk_percent equip bonus (fraction) multiplies damage", async () => {
    // atk_percent is a FRACTION (addendum §2): 0.5 => x1.5
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ atk_percent: 0.5 });
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // floor(3000 * 1.5) = 4500
    expect(result.damage).toBe(4500);
    expect(result.contribution).toBe(4500);
  });

  test("getEquipmentBonuses is keyed on platformId", async () => {
    await combat.dpsAttack({
      platformId: "Uabc",
      numericUserId: 42,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(EquipmentService.getEquipmentBonuses).toHaveBeenCalledWith("Uabc");
  });

  test("writes one dps log row with NUMERIC user_id and contribution=damage", async () => {
    await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 42,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(WorldBossLog.createWithRole).toHaveBeenCalledTimes(1);
    const arg = WorldBossLog.createWithRole.mock.calls[0][0];
    expect(arg).toMatchObject({
      user_id: 42,
      world_boss_event_id: 7,
      role: "dps",
      action_type: "swordman|standard",
      damage: 3000,
      cost: 10,
      contribution: 3000,
    });
  });
});
