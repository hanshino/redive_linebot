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

const UserModel = require("../../model/application/UserModel");
const WorldBossEvent = require("../../model/application/WorldBossEvent");
const WorldBossLog = require("../../model/application/WorldBossLog");
const wbRedis = require("../../util/worldBossRedis");
const combat = require("../WorldBossCombatService");

describe("WorldBossCombatService.dpsAttack — reject paths", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wbRedis.poolScore.mockResolvedValue(null);
  });

  test("rejects with not_active when there is no active event", async () => {
    WorldBossEvent.getActive.mockResolvedValue(null);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("not_active");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  test("rejects with not_active when the active event id differs", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 99, status: "active", hp: 1000 });
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("not_active");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  test("rejects with not_active when status is not active", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "killed", hp: 1000 });
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("not_active");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  test("rejects with knocked_down (still inside recovery window) without spending energy", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 1000, luck: 0 });
    // knocked at now-5min, recovery 15min -> still knocked
    wbRedis.poolScore.mockResolvedValue(Date.now() - 5 * 60000);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(wbRedis.poolScore).toHaveBeenCalledWith(7, "U1");
    expect(wbRedis.poolRemove).not.toHaveBeenCalled();
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("knocked_down");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  test("lazy natural recovery: past the window the player is removed from the pool and NOT rejected", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 1000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 0 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    require("../EquipmentService").getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
    // knocked 16min ago, recovery 15min -> recovered
    wbRedis.poolScore.mockResolvedValue(Date.now() - 16 * 60000);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(wbRedis.poolRemove).toHaveBeenCalledWith(7, "U1");
    expect(result.rejected).toBe(false);
  });

  test("self-resolves numericUserId via UserModel.getId when the caller omits it", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 0 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    require("../EquipmentService").getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
    UserModel.getId.mockResolvedValue(4242);
    await combat.dpsAttack({
      platformId: "Uabc",
      numericUserId: undefined,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(UserModel.getId).toHaveBeenCalledWith("Uabc");
    expect(WorldBossLog.createWithRole.mock.calls[0][0].user_id).toBe(4242);
  });
});
