const EquipmentModel = require("../model/application/Equipment");
const PlayerEquipmentModel = require("../model/application/PlayerEquipment");
const redis = require("../util/redis");
const WorldBossConfig = require("./WorldBossConfig");

const VALID_SLOTS = ["weapon", "armor", "accessory"];
const CACHE_TTL = 60 * 60; // 1 hour

// --- Admin CRUD ---
exports.all = options => EquipmentModel.all(options);
exports.find = id => EquipmentModel.find(id);
exports.findAvailableForJob = jobId => EquipmentModel.findAvailableForJob(jobId);
exports.create = attributes => EquipmentModel.create(attributes);

exports.update = async (id, attributes) => {
  await redis.del(`equipment:${id}`);
  return EquipmentModel.update(id, attributes);
};

exports.destroy = async id => {
  await redis.del(`equipment:${id}`);
  return EquipmentModel.destroy(id);
};

// --- Player Equipment ---

/**
 * Get all equipped items for a user (3 slots), with caching.
 * Returns object: { weapon: {...} | null, armor: {...} | null, accessory: {...} | null }
 */
exports.getPlayerEquipment = async userId => {
  const cacheKey = `playerEquipment:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const rows = await PlayerEquipmentModel.getByUserId(userId);

  const result = { weapon: null, armor: null, accessory: null };
  for (const row of rows) {
    const attrs = typeof row.attributes === "string" ? JSON.parse(row.attributes) : row.attributes;
    result[row.slot] = {
      id: row.equipment_id,
      name: row.name,
      rarity: row.rarity,
      image_url: row.image_url,
      enhance_level: row.enhance_level || 0,
      attributes: attrs,
    };
  }

  await redis.set(cacheKey, JSON.stringify(result), { EX: CACHE_TTL });
  return result;
};

/**
 * Equip an item from player's inventory. Validates ownership.
 */
exports.equip = async (userId, equipmentId) => {
  const equipment = await EquipmentModel.find(equipmentId);
  if (!equipment) throw new Error("裝備不存在");

  const slot = equipment.slot;
  if (!VALID_SLOTS.includes(slot)) throw new Error("無效的裝備欄位");

  // Unequip current item in the same slot first
  await PlayerEquipmentModel.unequipSlot(userId, slot);

  await PlayerEquipmentModel.equipItem(userId, equipmentId, slot);
  await redis.del(`playerEquipment:${userId}`);

  return { slot, equipment };
};

/**
 * Unequip a slot. Item goes back to inventory.
 */
exports.unequip = async (userId, slot) => {
  if (!VALID_SLOTS.includes(slot)) throw new Error("無效的裝備欄位");

  await PlayerEquipmentModel.unequipSlot(userId, slot);
  await redis.del(`playerEquipment:${userId}`);
};

/**
 * Get player's unequipped inventory items.
 */
exports.getInventory = async userId => {
  return await PlayerEquipmentModel.getInventory(userId);
};

/**
 * Add an equipment item to player's inventory.
 */
exports.addToInventory = async (userId, equipmentId) => {
  const equipment = await EquipmentModel.find(equipmentId);
  if (!equipment) throw new Error("裝備不存在");

  const hasItem = await PlayerEquipmentModel.hasItem(userId, equipmentId);
  if (hasItem) throw new Error("已擁有此裝備");

  await PlayerEquipmentModel.addToInventory(userId, equipmentId);
  return equipment;
};

// Only these role-combat attributes are scaled by enhance_level (D9/D20).
// Non-combat utility attrs (crit_rate, cost_reduction, exp_bonus, gold_bonus) are summed at face value.
const SCALABLE_KEYS = ["atk_percent", "support_power", "block_power"];
// These role attributes are INTEGER people-counts (addendum §2): floor after the enhance multiplier.
const INTEGER_KEYS = ["support_power", "block_power"];

/**
 * Calculate total equipment bonuses for a user.
 * atk_percent is a FRACTION (0.05 => +5%); combat applies base*(1+atk_percent).
 * support_power / block_power are INTEGER people-counts (floored after scaling).
 * Role attributes (atk_percent/support_power/block_power) are scaled by enhance_level:
 *   effective = base * (1 + per_level_pct * enhance_level), per piece.
 * Returns 7-key superset: { atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus,
 *   support_power, block_power }. The extra keys default to 0 so existing 5-key callers are safe.
 */
exports.getEquipmentBonuses = async userId => {
  const equipped = await exports.getPlayerEquipment(userId);
  const perLevelPct = WorldBossConfig.getEnhancePerLevelPct();

  const bonuses = {
    atk_percent: 0,
    crit_rate: 0,
    cost_reduction: 0,
    exp_bonus: 0,
    gold_bonus: 0,
    support_power: 0,
    block_power: 0,
  };

  for (const slot of VALID_SLOTS) {
    const item = equipped[slot];
    if (!item || !item.attributes) continue;
    const attrs = item.attributes;
    const level = Math.min(item.enhance_level || 0, WorldBossConfig.getEnhanceMaxLevel());
    const multiplier = 1 + perLevelPct * level;

    for (const key of Object.keys(bonuses)) {
      if (!attrs[key]) continue;
      let value = SCALABLE_KEYS.includes(key) ? attrs[key] * multiplier : attrs[key];
      if (INTEGER_KEYS.includes(key)) value = Math.floor(value);
      bonuses[key] += value;
    }
  }

  return bonuses;
};
