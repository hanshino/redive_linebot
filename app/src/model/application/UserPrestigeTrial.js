const Base = require("../base");

const TABLE = "user_prestige_trials";
const fillable = ["user_id", "trial_id", "started_at", "ended_at", "status", "final_exp_progress"];

class UserPrestigeTrial extends Base {}

const model = new UserPrestigeTrial({ table: TABLE, fillable });

exports.model = model;

exports.findActiveByUserId = userId =>
  model.first({ filter: { user_id: userId, status: "active" } });

exports.listPassedByUserId = userId =>
  model.all({
    filter: { user_id: userId, status: "passed" },
    order: [{ column: "ended_at", direction: "asc" }],
  });

exports.listByUserId = userId =>
  model.all({
    filter: { user_id: userId },
    order: [{ column: "started_at", direction: "asc" }],
  });
