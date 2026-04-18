const base = require("../base");

class UserAutoPreference extends base {}

module.exports = new UserAutoPreference({
  table: "user_auto_preference",
  fillable: ["user_id", "auto_daily_gacha", "auto_janken_fate", "auto_janken_fate_with_bet"],
});
