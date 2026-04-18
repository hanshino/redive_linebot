const base = require("../base");

class AutoGachaJobLog extends base {}

module.exports = new AutoGachaJobLog({
  table: "auto_gacha_job_log",
  fillable: ["user_id", "run_date", "pulls_made", "status", "error"],
});
