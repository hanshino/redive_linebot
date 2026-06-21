const EquipmentModel = require("../model/application/Equipment");
const PlayerEquipmentModel = require("../model/application/PlayerEquipment");
const redis = require("../util/redis");
const WorldBossConfig = require("./WorldBossConfig");
const Inventory = require("../model/application/Inventory");
const mysql = require("../util/mysql");

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

/**
 * Deterministically enhance one owned equipment by +1.
 * cost(target) = getEnhanceCost(target) materials (item 1001); cap at max level; no RNG, no downgrade.
 * Material decrement (NEGATIVE ledger insert), the in-trx negative-balance guard, and the level bump
 * all run in one transaction. A concurrent double-enhance is caught by the in-trx re-sum guard.
 * @param {String} userId platform_id
 * @param {Number} equipmentId
 * @returns {Promise<{equipmentId, fromLevel, toLevel, cost, remainingMaterials}>}
 */
exports.enhanceEquipment = async (userId, equipmentId) => {
  const owned = await PlayerEquipmentModel.getWithEnhance(userId, equipmentId);
  if (!owned) throw new Error("裝備不存在");

  const fromLevel = owned.enhance_level || 0;
  const maxLevel = WorldBossConfig.getEnhanceMaxLevel();
  if (fromLevel >= maxLevel) throw new Error("已達強化上限");

  const toLevel = fromLevel + 1;
  const cost = WorldBossConfig.getEnhanceCost(toLevel);
  const materialId = WorldBossConfig.ENHANCEMENT_MATERIAL_ITEM_ID;

  // Fast pre-check (no trx) for a friendly early rejection in the common case.
  const preRow = await Inventory.inventory.getUserOwnCountByItemId(userId, materialId);
  const preBalance = (preRow && preRow.amount) || 0;
  if (preBalance < cost) throw new Error("強化素材不足");

  let remainingMaterials;
  await mysql.transaction(async trx => {
    // 1. NEGATIVE ledger insert (spend; string form mirrors Inventory.decreaseGodStone).
    await trx("Inventory").insert([
      {
        userId,
        itemId: materialId,
        itemAmount: `${-cost}`,
        note: "world_boss_enhance",
      },
    ]);

    // 2. Authoritative double-spend guard: re-sum the balance INSIDE the trx (sees the negative row
    //    plus any concurrent uncommitted decrement under the engine's isolation).
    const postRow = await trx("Inventory")
      .sum({ amount: "itemAmount" })
      .where({ userId, itemId: materialId })
      .first();
    remainingMaterials = (postRow && postRow.amount) || 0;
    if (remainingMaterials < 0) throw new Error("強化素材不足");

    // 3. Bump level in the same trx; a thrown guard above already rolled the insert back.
    await PlayerEquipmentModel.setEnhanceLevel(userId, equipmentId, toLevel, trx);
  });

  // Invalidate the cached equipment so combat reads the new enhance_level (addendum §3).
  await redis.del(`playerEquipment:${userId}`);

  return { equipmentId, fromLevel, toLevel, cost, remainingMaterials };
};
