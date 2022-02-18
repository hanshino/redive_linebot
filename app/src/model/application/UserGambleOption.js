const base = require("../base");
const { get } = require("lodash");

class UserGambleOption extends base {
  async getAllUserInfo(id, options = {}) {
    const query = this.knex
      .where("gamble_game_id", id)
      .groupBy("option")
      .count({ count: "*" })
      .sum({ total_amount: "amount" })
      .select("option");

    const [start, end] = [get(options, "start"), get(options, "end")];
    if (start && end) {
      query.whereBetween("created_at", [start, end]);
    }

    return await query;
  }

  async dispatchReward({ id, options, rate = 2 }) {
    const knex = this.connection;
    const table = this.table;
    const query = this.knex
      .insert(function () {
        this.select(["user_id", knex.raw("999"), knex.raw("round(amount * ?)", rate)])
          .from(table)
          .where("gamble_game_id", id)
          .whereIn("option", options);
      })
      .into(knex.raw("?? (??, ??, ??)", ["Inventory", "userId", "itemId", "itemAmount"]));

    return await query;
  }
}

module.exports = new UserGambleOption({
  table: "user_gamble_option",
  fillable: ["user_id", "gamble_game_id", "option", "amount"],
});
