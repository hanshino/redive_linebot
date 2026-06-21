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
  getSupportRatio: jest.fn().mockResolvedValue(0),
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
const EquipmentService = require("../EquipmentService");
const combat = require("../WorldBossCombatService");

describe("WorldBossCombatService.dpsAttack — enrage trigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wbRedis.poolScore.mockResolvedValue(null);
    wbRedis.blockOwner.mockResolvedValue(null);
    wbRedis.shieldConsume.mockResolvedValue(null);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
    WorldBossEvent.casStatus.mockResolvedValue(true);
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    // owner platform_id -> numeric user.id
    UserModel.getId.mockImplementation(async pid => ({ Utank: 900, Uhealer: 901 })[pid] || null);
    combat._setRng(() => 0.99); // counter disabled by default in these cases
  });

  function crossing() {
    // hp 100000, threshold 35000. The crossing hit is computed in CALM (remainBefore > threshold)
    // so NO x2 this hit; damage=3000. remainBefore=36000 (>35000), remainAfter=33000 (<=35000).
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 64000 });
  }

  test("crossing hit pools the recent-N attackers (by platform_id) and sets didEnrageTrigger", async () => {
    crossing();
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { user_id: 10, platform_id: "Ua" },
      { user_id: 11, platform_id: "Ub" },
    ]);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.didEnrageTrigger).toBe(true);
    expect(result.enraged).toBe(false); // crossing hit started in calm -> not doubled
    expect(result.damage).toBe(3000);
    expect(WorldBossLog.getRecentAttackers).toHaveBeenCalledWith({
      eventId: 7,
      minutes: 10,
      limit: 20,
    });
    expect(wbRedis.poolAdd).toHaveBeenCalledWith(7, "Ua", expect.any(Number));
    expect(wbRedis.poolAdd).toHaveBeenCalledWith(7, "Ub", expect.any(Number));
    expect(result.knockedBatch).toEqual(["Ua", "Ub"]);
  });

  test("tank block absorbs first candidate and credits the block owner (numeric user_id)", async () => {
    crossing();
    wbRedis.blockOwner.mockResolvedValue("Utank");
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { user_id: 10, platform_id: "Ua" },
      { user_id: 11, platform_id: "Ub" },
    ]);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // Ua absorbed by the wall (not pooled), Ub pooled
    expect(result.knockedBatch).toEqual(["Ub"]);
    expect(wbRedis.poolAdd).not.toHaveBeenCalledWith(7, "Ua", expect.any(Number));
    // tank contribution writeback: a tank log row crediting Utank, resolved to numeric user_id 900
    const tankLog = WorldBossLog.createWithRole.mock.calls.find(c => c[0].role === "tank");
    expect(tankLog).toBeDefined();
    expect(tankLog[0]).toMatchObject({
      user_id: 900,
      world_boss_event_id: 7,
      role: "tank",
      contribution: 1,
      cost: 0,
    });
  });

  test("shield absorbs a candidate and credits the shield owner (healer writeback, numeric)", async () => {
    crossing();
    wbRedis.shieldConsume.mockImplementation(async (eventId, target) =>
      target === "Ua" ? "Uhealer" : null
    );
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { user_id: 10, platform_id: "Ua" },
      { user_id: 11, platform_id: "Ub" },
    ]);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.knockedBatch).toEqual(["Ub"]);
    const healerLog = WorldBossLog.createWithRole.mock.calls.find(c => c[0].role === "healer");
    expect(healerLog).toBeDefined();
    expect(healerLog[0]).toMatchObject({
      user_id: 901,
      world_boss_event_id: 7,
      role: "healer",
      contribution: 1,
      cost: 0,
    });
  });

  test("skips writeback when the credited owner has no user row", async () => {
    crossing();
    UserModel.getId.mockResolvedValue(null); // Utank resolves to null
    wbRedis.blockOwner.mockResolvedValue("Utank");
    WorldBossLog.getRecentAttackers.mockResolvedValue([{ user_id: 10, platform_id: "Ua" }]);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // Ua still absorbed (not pooled), but no tank writeback row written
    expect(result.knockedBatch).toEqual([]);
    const tankLog = WorldBossLog.createWithRole.mock.calls.find(c => c[0].role === "tank");
    expect(tankLog).toBeUndefined();
  });

  test("counter knockdown pools the attacker (by platformId) when rng < counter_rate (enraged hit)", async () => {
    // already enraged (started in band), not a crossing hit
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 70000 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    combat._setRng(() => 0.05); // < 0.15 -> counter fires
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.enraged).toBe(true);
    expect(result.didEnrageTrigger).toBe(false); // not a crossing hit
    expect(result.selfKnocked).toBe(true);
    expect(wbRedis.poolAdd).toHaveBeenCalledWith(7, "U1", expect.any(Number));
  });

  test("no counter when rng >= counter_rate", async () => {
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 70000 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    combat._setRng(() => 0.5);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.selfKnocked).toBe(false);
  });

  test("does NOT fetch getRecentAttackers on a non-crossing calm hit (hot-path guard)", async () => {
    // total_damage 1000 -> remainBefore 99000, calm, non-crossing, non-lethal
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 1000 });
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.didEnrageTrigger).toBe(false);
    expect(result.selfKnocked).toBe(false);
    expect(WorldBossLog.getRecentAttackers).not.toHaveBeenCalled();
  });

  test("does NOT fetch getRecentAttackers on an enraged (non-crossing) hit", async () => {
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 70000 });
    await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(WorldBossLog.getRecentAttackers).not.toHaveBeenCalled();
  });
});
