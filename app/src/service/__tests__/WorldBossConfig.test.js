const WorldBossConfig = require("../WorldBossConfig");

describe("WorldBossConfig", () => {
  it("exposes the canonical item ids", () => {
    expect(WorldBossConfig.GODDESS_STONE_ITEM_ID).toBe(999);
    expect(WorldBossConfig.ENHANCEMENT_MATERIAL_ITEM_ID).toBe(1001);
  });

  it("reads enhance tunables from config with the documented defaults", () => {
    expect(WorldBossConfig.getEnhanceMaxLevel()).toBe(10);
    expect(WorldBossConfig.getEnhancePerLevelPct()).toBeCloseTo(0.05, 5);
  });

  it("computes deterministic per-level cost = targetLevel * cost_base (8)", () => {
    expect(WorldBossConfig.getEnhanceCost(1)).toBe(8); // +0 -> +1
    expect(WorldBossConfig.getEnhanceCost(2)).toBe(16); // +1 -> +2
    expect(WorldBossConfig.getEnhanceCost(10)).toBe(80); // +9 -> +10
  });

  it("exposes the global combat/lifecycle getters with documented defaults", () => {
    expect(WorldBossConfig.getNormalAttackCost()).toBe(10);
    expect(WorldBossConfig.getEnrageDamageMultiplier()).toBe(2);
    expect(WorldBossConfig.getEnrageContributionMultiplier()).toBe(2);
    expect(WorldBossConfig.getReviveCountK()).toBe(2);
    expect(WorldBossConfig.getShieldCountK()).toBe(2);
    expect(WorldBossConfig.getBlockWindowMinutes()).toBe(5);
    expect(WorldBossConfig.getReselectStoneCost()).toBe(5000);
    expect(WorldBossConfig.getOpenHour()).toBe(4);
    expect(WorldBossConfig.getColdStartMaxHp()).toBe(1500000);
    expect(Array.isArray(WorldBossConfig.getBossPool())).toBe(true);
    expect(WorldBossConfig.getReward().participation).toBe(15);
    expect(WorldBossConfig.getReward().mvp_stones).toBe(30);
  });

  it("read*(boss) prefers the boss dead-column when truthy, else config fallback", () => {
    // pure config (no boss)
    expect(WorldBossConfig.readEnrageThresholdPct()).toBe(35);
    expect(WorldBossConfig.readEnrageBatchSize()).toBe(20);
    expect(WorldBossConfig.readEnrageCounterRate()).toBeCloseTo(0.15, 5);
    expect(WorldBossConfig.readNaturalRecoveryMinutes()).toBe(15);
    expect(WorldBossConfig.readEnrageRecentMinutes()).toBe(10);
    // boss dead-columns override
    const boss = { attack: 25, defense: 30, speed: 40, luck: 5 };
    expect(WorldBossConfig.readEnrageCounterRate(boss)).toBe(25);
    expect(WorldBossConfig.readEnrageBatchSize(boss)).toBe(30);
    expect(WorldBossConfig.readEnrageThresholdPct(boss)).toBe(40);
    expect(WorldBossConfig.readNaturalRecoveryMinutes(boss)).toBe(5);
    // zero/falsy dead-column falls back to config
    expect(WorldBossConfig.readEnrageBatchSize({ defense: 0 })).toBe(20);
  });
});
