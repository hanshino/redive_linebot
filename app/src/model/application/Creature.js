const base = require("../base");
const reltaionTable = "user_has_creatures";

class Creature extends base {
  /**
   * 查詢使用者的角色
   * @param {Number} userId User.No
   * @returns {Promise}
   */
  async findUserCreature(userId) {
    const query = this.knex
      .from(reltaionTable)
      .where({ user_id: userId })
      .join(this.table, `${reltaionTable}.creature_id`, `${this.table}.id`)
      .first();

    return await query;
  }
}

module.exports = new Creature({
  table: "creatures",
  fillable: [
    "name",
    "description",
    "image_url",
    "max_level",
    "max_favorability",
    "max_stamina",
    "max_satiety",
  ],
});
