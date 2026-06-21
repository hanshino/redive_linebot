const config = require("config");

const GODDESS_STONE_ITEM_ID = 999;
const ENHANCEMENT_MATERIAL_ITEM_ID = 1001;

exports.GODDESS_STONE_ITEM_ID = GODDESS_STONE_ITEM_ID;
exports.ENHANCEMENT_MATERIAL_ITEM_ID = ENHANCEMENT_MATERIAL_ITEM_ID;

// --- Enhance ---
exports.getEnhanceMaxLevel = () => config.get("worldboss.enhance.max_level");
exports.getEnhancePerLevelPct = () => config.get("worldboss.enhance.per_level_pct");

/**
 * Materials required to enhance from (targetLevel - 1) to targetLevel.
 * Deterministic, no RNG: cost(L) = L * cost_base.
 * @param {Number} targetLevel the level being reached (1..max)
 * @returns {Number} material count
 */
exports.getEnhanceCost = targetLevel => {
  const costBase = config.get("worldboss.enhance.cost_base");
  return targetLevel * costBase;
};

// --- Global combat/lifecycle tunables (plain getters) ---
exports.getDailyLimit = () => config.get("worldboss.daily_limit");
exports.getNormalAttackCost = () => config.get("worldboss.normal_attack_cost");
exports.getEnrageDamageMultiplier = () => config.get("worldboss.enrage_damage_multiplier");
exports.getEnrageContributionMultiplier = () =>
  config.get("worldboss.enrage_contribution_multiplier");
exports.getReviveCountK = () => config.get("worldboss.revive_count_k");
exports.getShieldCountK = () => config.get("worldboss.shield_count_k");
exports.getBlockWindowMinutes = () => config.get("worldboss.block_window_minutes");
exports.getReselectStoneCost = () => config.get("worldboss.reselect_stone_cost");
exports.getOpenHour = () => config.get("worldboss.open_hour");
exports.getColdStartMaxHp = () =>
  config.has("worldboss.cold_start_max_hp") ? config.get("worldboss.cold_start_max_hp") : 0;
exports.getBossPool = () => config.get("worldboss.boss_pool");
exports.getReward = () => config.get("worldboss.reward");

// --- Dead-column-with-fallback readers (D25; addendum §7) ---
// boss may be undefined -> pure config default. A boss column counts only when truthy (> 0).
const deadColumn = (boss, col, configPath) => {
  const v = boss && boss[col];
  return v ? v : config.get(configPath);
};

exports.readEnrageThresholdPct = boss =>
  deadColumn(boss, "speed", "worldboss.enrage_threshold_pct");
exports.readEnrageBatchSize = boss => deadColumn(boss, "defense", "worldboss.enrage_batch_size");
exports.readEnrageCounterRate = boss => deadColumn(boss, "attack", "worldboss.enrage_counter_rate");
exports.readNaturalRecoveryMinutes = boss =>
  deadColumn(boss, "luck", "worldboss.natural_recovery_minutes");
// No dead column for recent-minutes; pure config.
exports.readEnrageRecentMinutes = () => config.get("worldboss.enrage_recent_minutes");
