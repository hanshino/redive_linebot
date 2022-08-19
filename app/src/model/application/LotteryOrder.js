const base = require("../base");

class LotteryOrder extends base {}

module.exports = new LotteryOrder({
  table: "lottery_user_order",
  fillable: ["lottery_main_id", "user_id", "content", "status"],
});
