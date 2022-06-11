const base = require("../base");
const reltaionTable = "user_has_creatures";

class Creature extends base {
  /**
   * 查詢使用者的角色
   * @param {Number} userId User.No
   * @returns {Promise<?Object>}
   */
  async findUserCreature(userId) {
    const query = this.knex
      .select({
        user_has_creature_id: "user_has_creatures.id",
        user_id: "user_has_creatures.user_id",
        creature_id: "creatures.id",
        name: "creatures.name",
        image_url: "creatures.image_url",
        nickname: "user_has_creatures.nickname",
        level: "user_has_creatures.level",
        stamina: "user_has_creatures.stamina",
        satiety: "user_has_creatures.satiety",
        favorability: "user_has_creatures.favorability",
        exp: "user_has_creatures.exp",
      })
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
