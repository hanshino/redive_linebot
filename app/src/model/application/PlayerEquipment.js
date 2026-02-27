const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "player_equipment";

class PlayerEquipment extends Base {
  async getByUserId(userId) {
    return await mysql(TABLE)
      .select(
        "player_equipment.*",
        "equipment.name",
        "equipment.rarity",
        "equipment.attributes",
        "equipment.image_url",
        "equipment.job_id",
        "equipment.description"
      )
      .leftJoin("equipment", "player_equipment.equipment_id", "equipment.id")
      .where("player_equipment.user_id", userId);
  }

  async getByUserIdAndSlot(userId, slot) {
    return await mysql(TABLE)
      .select(
        "player_equipment.*",
        "equipment.name",
        "equipment.rarity",
        "equipment.attributes",
        "equipment.image_url",
        "equipment.job_id",
        "equipment.description"
      )
      .leftJoin("equipment", "player_equipment.equipment_id", "equipment.id")
      .where({ "player_equipment.user_id": userId, "player_equipment.slot": slot })
      .first();
  }

  async equipItem(userId, equipmentId, slot) {
    const existing = await this.knex.where({ user_id: userId, slot }).first();

    if (existing) {
      return await this.knex
        .where({ user_id: userId, slot })
        .update({ equipment_id: equipmentId, updated_at: mysql.fn.now() });
    }

    return await this.knex.insert({
      user_id: userId,
      equipment_id: equipmentId,
      slot,
    });
  }

  async unequipSlot(userId, slot) {
    return await this.knex.where({ user_id: userId, slot }).del();
  }
}

const model = new PlayerEquipment({
  table: TABLE,
  fillable: ["user_id", "equipment_id", "slot"],
});

exports.table = TABLE;
exports.model = model;
exports.getByUserId = userId => model.getByUserId(userId);
exports.getByUserIdAndSlot = (userId, slot) => model.getByUserIdAndSlot(userId, slot);
exports.equipItem = (userId, equipmentId, slot) => model.equipItem(userId, equipmentId, slot);
exports.unequipSlot = (userId, slot) => model.unequipSlot(userId, slot);
