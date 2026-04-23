const Base = require("../base");

const TABLE = "user_prestige_history";
// cycle_days is a generated column — excluded from fillable
const fillable = [
  "user_id",
  "prestige_count_after",
  "trial_id",
  "blessing_id",
  "cycle_started_at",
  "prestiged_at",
];

class UserPrestigeHistory extends Base {}

const model = new UserPrestigeHistory({ table: TABLE, fillable });

exports.model = model;

exports.listByUserId = userId =>
  model.all({
    filter: { user_id: userId },
    order: [{ column: "prestige_count_after", direction: "asc" }],
  });

exports.latestByUserId = userId =>
  model.first({
    filter: { user_id: userId },
    order: [{ column: "prestige_count_after", direction: "desc" }],
  });
