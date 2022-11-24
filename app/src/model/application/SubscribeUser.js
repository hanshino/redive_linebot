const base = require("../base");
const SubscribeJobLog = require("./SubscribeJobLog");

class SubscribeUser extends base {
  /**
   * 取得每日配給的使用者
   * @param {Object} options 選填參數
   * @param {String} options.key 訂閱卡種類
   * @param {import("moment").Moment} options.now 當下時間
   * @returns {import("knex").Knex.QueryBuilder}
   */
  getDailyRation({ key, now }) {
    const query = this.knex
      .where("subscribe_card_key", key)
      .andWhere("start_at", "<=", now.toDate())
      .andWhere("end_at", ">", now.toDate())
      .whereNotIn("user_id", function (builder) {
        builder
          .select("user_id")
          .from(SubscribeJobLog.table)
          .where("type", "=", `${key}_daily_ration`)
          .andWhere("created_at", ">=", now.startOf("day").toDate())
          .andWhere("created_at", "<=", now.endOf("day").toDate());
      });

    // console.log(query.toQuery());

    return query;
  }
}

module.exports = new SubscribeUser({
  table: "subscribe_user",
  fillable: ["user_id", "subscribe_card_key", "start_at", "end_at"],
});
