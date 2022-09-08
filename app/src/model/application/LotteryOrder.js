const base = require("../base");

class LotteryOrder extends base {
  constructor(props) {
    super(props);
    this.buyType = {
      manual: "manual",
      auto: "auto",
    };

    this.status = {
      initial: "initial",
      exchanged: "exchanged",
      canceled: "canceled",
      expired: "expired",
    };

    this.result = {
      first: "first",
      second: "second",
      third: "third",
      fourth: "fourth",
      fifth: "fifth",
    };
  }

  countByLottery(lotteryId) {
    return this.knex
      .count({
        count: "*",
      })
      .where({ lottery_main_id: lotteryId })
      .first();
  }

  makeItExchanged(ids) {
    return this.knex
      .update({
        status: this.status.exchanged,
      })
      .whereIn("id", ids);
  }
}

module.exports = new LotteryOrder({
  table: "lottery_user_order",
  fillable: ["lottery_main_id", "user_id", "content", "status", "buy_type", "result"],
});
