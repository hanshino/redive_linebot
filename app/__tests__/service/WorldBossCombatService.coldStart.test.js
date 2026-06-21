// jest.mock is NOT hoisted in this repo (jest.config transform:{}) — declare BEFORE requires.
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
jest.mock("../../src/model/application/RPGCharacter", () => ({
  make: jest.fn(() => ({ getStandardDamage: () => 3000 })),
}));
jest.mock("../../src/service/EquipmentService", () => ({ getEquipmentBonuses: jest.fn() }));
jest.mock("../../src/service/WorldBossConfig", () => ({
  getReviveCountK: jest.fn(),
  getShieldCountK: jest.fn(),
  getBlockWindowMinutes: jest.fn(),
  getNormalAttackCost: jest.fn(() => 10),
  getNaturalRecoveryMinutes: jest.fn(),
  readNaturalRecoveryMinutes: jest.fn(() => 15),
  readEnrageBatchSize: jest.fn(() => 20),
  readEnrageCounterRate: jest.fn(() => 0.15),
  readEnrageThresholdPct: jest.fn(() => 35),
  readEnrageRecentMinutes: jest.fn(() => 10),
  getEnrageDamageMultiplier: jest.fn(() => 2),
  getEnrageContributionMultiplier: jest.fn(() => 2),
}));

const WorldBossLog = require("../../src/model/application/WorldBossLog");
const wbRedis = require("../../src/util/worldBossRedis");
const WorldBossEvent = require("../../src/model/application/WorldBossEvent");
const EquipmentService = require("../../src/service/EquipmentService");
const combat = require("../../src/service/WorldBossCombatService");

describe("WorldBossCombatService.getEnrageScaling (D30 cold-start)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns full batch + counter when support ratio is 0 (all-DPS cold start)", async () => {
    WorldBossLog.getSupportRatio.mockResolvedValue(0);
    const out = await combat.getEnrageScaling(7, { baseBatch: 20, baseCounterRate: 0.15 });
    expect(out.supportRatio).toBe(0);
    expect(out.scaledBatch).toBe(20); // round(20 * (1 - 0)) = 20
    expect(out.scaledCounterRate).toBe(0.15); // 0.15 * (1 - 0)
    expect(WorldBossLog.getSupportRatio).toHaveBeenCalledWith(7);
  });

  it("scales batch + counter DOWN as the support ratio rises", async () => {
    WorldBossLog.getSupportRatio.mockResolvedValue(0.5);
    const out = await combat.getEnrageScaling(7, { baseBatch: 20, baseCounterRate: 0.15 });
    expect(out.supportRatio).toBe(0.5);
    expect(out.scaledBatch).toBe(10); // round(20 * 0.5)
    expect(out.scaledCounterRate).toBeCloseTo(0.075, 6); // 0.15 * 0.5
  });

  it("never lets the batch fall below 1 even at a near-total support ratio", async () => {
    WorldBossLog.getSupportRatio.mockResolvedValue(0.99);
    const out = await combat.getEnrageScaling(7, { baseBatch: 20, baseCounterRate: 0.15 });
    expect(out.scaledBatch).toBe(1); // max(1, round(20 * 0.01)=0) -> 1
    expect(out.scaledCounterRate).toBeCloseTo(0.0015, 6);
  });
});

describe("WorldBossCombatService — enrage wiring (getEnrageScaling applied to handler)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wbRedis.poolScore.mockResolvedValue(null);
    wbRedis.blockOwner.mockResolvedValue(null);
    wbRedis.shieldConsume.mockResolvedValue(null);
    wbRedis.poolAdd.mockResolvedValue(undefined);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    WorldBossLog.getSupportRatio.mockResolvedValue(0.5);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
    WorldBossEvent.casStatus.mockResolvedValue(true);
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    combat._setRng(() => 0.99); // counter disabled
  });

  it("passes SCALED limit to getRecentAttackers when supportRatio=0.5 (wiring live)", async () => {
    // crossing hit: total_damage 64000 -> remainBefore 36000, remainAfter 33000 (crosses threshold)
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 64000 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    // supportRatio=0.5, baseBatch=20 -> scaledBatch=10
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.didEnrageTrigger).toBe(true);
    // baseBatch=20, supportRatio=0.5 -> scaledBatch = round(20*0.5) = 10
    expect(WorldBossLog.getRecentAttackers).toHaveBeenCalledWith({
      eventId: 7,
      minutes: 10,
      limit: 10,
    });
  });
});
