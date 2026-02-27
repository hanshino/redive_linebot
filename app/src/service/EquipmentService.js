const EquipmentModel = require("../model/application/Equipment");
const PlayerEquipmentModel = require("../model/application/PlayerEquipment");
const redis = require("../util/redis");

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

/**
 * Calculate total equipment bonuses for a user.
 * Returns: { atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus }
 */
exports.getEquipmentBonuses = async userId => {
  const equipped = await exports.getPlayerEquipment(userId);

  const bonuses = {
    atk_percent: 0,
    crit_rate: 0,
    cost_reduction: 0,
    exp_bonus: 0,
    gold_bonus: 0,
  };

  for (const slot of VALID_SLOTS) {
    const item = equipped[slot];
    if (!item || !item.attributes) continue;
    const attrs = item.attributes;

    for (const key of Object.keys(bonuses)) {
      if (attrs[key]) {
        bonuses[key] += attrs[key];
      }
    }
  }

  return bonuses;
};
