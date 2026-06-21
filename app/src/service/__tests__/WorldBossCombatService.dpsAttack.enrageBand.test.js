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
  readEnrageCounterRate: jest.fn(() => 0), // disable counter so this suite is deterministic
  readNaturalRecoveryMinutes: jest.fn(() => 15),
}));

const WorldBossEvent = require("../../model/application/WorldBossEvent");
const WorldBossLog = require("../../model/application/WorldBossLog");
const wbRedis = require("../../util/worldBossRedis");
const EquipmentService = require("../EquipmentService");
const combat = require("../WorldBossCombatService");

describe("WorldBossCombatService.dpsAttack — enrage band", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wbRedis.poolScore.mockResolvedValue(null);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
    WorldBossEvent.casStatus.mockResolvedValue(true);
    combat._setRng(() => 0.99); // counter disabled
  });

  test("a hit that STARTS in the enrage band has damage and contribution doubled", async () => {
    // hp 100000, threshold 35% = 35000. Already 70000 done -> remainBefore 30000 <= 35000 -> enraged
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 70000 });

    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // base 3000, enrage x2 -> 6000
    expect(result.enraged).toBe(true);
    expect(result.didEnrageTrigger).toBe(false); // not a crossing hit; started in band
    expect(result.damage).toBe(6000);
    expect(result.contribution).toBe(6000);
    const logArg = WorldBossLog.createWithRole.mock.calls[0][0];
    expect(logArg.damage).toBe(6000);
    expect(logArg.contribution).toBe(6000);
  });

  test("lethal hit triggers casStatus active->killed after the log write", async () => {
    // remainBefore 5000, enraged; base 3000 x2 = 6000 >= 5000 -> lethal
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 95000 });

    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.damage).toBe(6000);
    expect(WorldBossLog.createWithRole).toHaveBeenCalledTimes(1);
    expect(WorldBossEvent.casStatus).toHaveBeenCalledWith(
      7,
      "active",
      "killed",
      expect.objectContaining({ killed_at: expect.any(Date) })
    );
  });

  test("non-lethal calm hit does NOT call casStatus and is not doubled", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 1000 });

    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.damage).toBe(3000);
    expect(WorldBossEvent.casStatus).not.toHaveBeenCalled();
  });

  test("crossing hit (starts calm, ends in enrage band) is NOT doubled and enraged is false", async () => {
    // hp 100000, threshold 35% = 35000.
    // total_damage = 64000 -> remainBefore = 36000 > 35000 -> starts CALM (enraged=false)
    // after damage 3000: 36000 - 3000 = 33000 <= 35000 -> crosses into band, but started calm -> NOT doubled
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 64000 });

    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // Started calm -> no doubling, no casStatus
    expect(result.enraged).toBe(false);
    expect(result.damage).toBe(3000);
    expect(WorldBossEvent.casStatus).not.toHaveBeenCalled();
  });
});
