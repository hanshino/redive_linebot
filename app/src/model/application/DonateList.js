const Base = require("../base");

class DonateList extends Base {
  async getUserTotalAmount(userId) {
    const query = this.knex
      .sum({
        amount: "amount",
      })
      .where({ user_id: userId });

    const result = await query;
    return result[0].amount;
  }
}

module.exports = new DonateList({
  table: "donate_list",
  fillable: ["user_id", "amount"],
});
