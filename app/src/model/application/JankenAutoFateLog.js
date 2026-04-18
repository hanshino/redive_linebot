const base = require("../base");

class JankenAutoFateLog extends base {}

module.exports = new JankenAutoFateLog({
  table: "janken_auto_fate_log",
  fillable: ["match_id", "user_id", "role", "choice"],
});
