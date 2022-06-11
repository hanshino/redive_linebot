const base = require("../base");

class CreatureFood extends base {
  /**
   * 透過 `creatureId` 查詢可以餵食的食物
   * @param {Number} creatureId 養成角色的 ID
   * @returns {Promise<Array<CreatureFoodData>>}
   */
  async findByCreatureId(creatureId) {
    const query = this.knex.from(this.table).where({ creature_id: creatureId });
    return await query;
  }
}

module.exports = new CreatureFood({
  table: "creature_food",
  fillable: ["creature_id", "name", "image_url", "description", "access_way", "effects", "price"],
});

/**
 * @typedef {Object} CreatureFoodData
 * @property {Number} id
 * @property {Number} creature_id
 * @property {String} name
 * @property {String} image_url
 * @property {String} description
 * @property {String} access_way
 * @property {Array<CreatureFoodEffect>} effects
 * @property {Number} price
 *
 * @typedef {Object} CreatureFoodEffect
 * @property {String} type
 * @property {Number} value
 */
