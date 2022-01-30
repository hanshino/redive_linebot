const base = require("../base");

class UserGambleOption extends base {
  async getAllUserInfo({ id, start, end }) {
    const query = this.knex
      .where("gamble_game_id", id)
      .whereBetween("created_at", [start, end])
      .groupBy("option")
      .count({ count: "*" })
      .sum({ total_amount: "amount" })
      .select("option");

    return await query;
  }

  async dispatchReward({ id, start, end, options }) {
    const knex = this.connection;
    const table = this.table;
    const query = this.knex
      .insert(function () {
        this.select(["user_id", knex.raw("999"), knex.raw("amount * 2")])
          .from(table)
          .where("gamble_game_id", id)
          .whereBetween("created_at", [start, end])
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
