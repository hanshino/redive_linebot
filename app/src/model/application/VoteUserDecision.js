const base = require("../base");

class VoteUserDecision extends base {}

module.exports = new VoteUserDecision({
  table: "vote_user_decision",
  fillable: ["user_id", "vote_id", "decision"],
});
