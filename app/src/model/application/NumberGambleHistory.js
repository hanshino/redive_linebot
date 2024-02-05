const base = require("../base");

class NumberGambleHistory extends base {}

module.exports = new NumberGambleHistory({
  table: "number_gamble_history",
  fillable: ["user_id", "option", "dices", "chips", "payout", "result", "reward"],
});
