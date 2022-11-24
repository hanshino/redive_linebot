const base = require("../base");
class SigninDays extends base {}

module.exports = new SigninDays({
  table: "signin_days",
  fillable: ["user_id", "sum_days", "last_signin_at"],
});
