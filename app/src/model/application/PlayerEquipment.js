const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "player_equipment";

const EQUIPMENT_COLUMNS = [
  "player_equipment.*",
  "equipment.name",
  "equipment.rarity",
  "equipment.attributes",
  "equipment.image_url",
  "equipment.job_id",
  "equipment.description",
];

class PlayerEquipment extends Base {
  async getByUserId(userId) {
    return await mysql(TABLE)
      .select(...EQUIPMENT_COLUMNS)
      .leftJoin("equipment", "player_equipment.equipment_id", "equipment.id")
      .where({ "player_equipment.user_id": userId, "player_equipment.is_equipped": true });
  }

  async getByUserIdAndSlot(userId, slot) {
    return await mysql(TABLE)
      .select(...EQUIPMENT_COLUMNS)
      .leftJoin("equipment", "player_equipment.equipment_id", "equipment.id")
      .where({
        "player_equipment.user_id": userId,
        "player_equipment.slot": slot,
        "player_equipment.is_equipped": true,
      })
      .first();
  }

  async equipItem(userId, equipmentId, slot) {
    const updated = await this.knex
      .where({ user_id: userId, equipment_id: equipmentId, is_equipped: false })
      .update({ is_equipped: true, slot, updated_at: mysql.fn.now() });

    if (!updated) {
      throw new Error("背包中找不到該裝備");
    }

    return updated;
  }

  async unequipSlot(userId, slot) {
    return await this.knex
      .where({ user_id: userId, slot, is_equipped: true })
      .update({ is_equipped: false, updated_at: mysql.fn.now() });
  }

  async getInventory(userId) {
    return await mysql(TABLE)
      .select(...EQUIPMENT_COLUMNS, "equipment.slot as slot")
      .leftJoin("equipment", "player_equipment.equipment_id", "equipment.id")
      .where({ "player_equipment.user_id": userId, "player_equipment.is_equipped": false });
  }

  async addToInventory(userId, equipmentId) {
    return await this.knex.insert({
      user_id: userId,
      equipment_id: equipmentId,
      slot: "weapon",
      is_equipped: false,
    });
  }

  async hasItem(userId, equipmentId) {
    const row = await this.knex.where({ user_id: userId, equipment_id: equipmentId }).first();
    return !!row;
  }
}

const model = new PlayerEquipment({
  table: TABLE,
  fillable: ["user_id", "equipment_id", "slot", "is_equipped"],
});

exports.table = TABLE;
exports.model = model;
exports.getByUserId = userId => model.getByUserId(userId);
exports.getByUserIdAndSlot = (userId, slot) => model.getByUserIdAndSlot(userId, slot);
exports.equipItem = (userId, equipmentId, slot) => model.equipItem(userId, equipmentId, slot);
exports.unequipSlot = (userId, slot) => model.unequipSlot(userId, slot);
exports.getInventory = userId => model.getInventory(userId);
exports.addToInventory = (userId, equipmentId) => model.addToInventory(userId, equipmentId);
exports.hasItem = (userId, equipmentId) => model.hasItem(userId, equipmentId);
