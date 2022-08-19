const base = require("../base");

class LotteryOrder extends base {
  countByLottery(lotteryId) {
    return this.knex
      .count({
        count: "*",
      })
      .where({ lottery_main_id: lotteryId })
      .first();
  }
}

module.exports = new LotteryOrder({
  table: "lottery_user_order",
  fillable: ["lottery_main_id", "user_id", "content", "status"],
});
