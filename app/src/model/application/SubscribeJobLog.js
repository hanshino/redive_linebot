const base = require("../base");

class SubscribeJobLog extends base {
  constructor(props) {
    super(props);

    this.type = {
      month_daily_ration: "month_daily_ration",
      season_daily_ration: "season_daily_ration",
    };
  }
}

module.exports = new SubscribeJobLog({
  table: "subscribe_job_log",
  fillable: ["user_id", "type"],
});
