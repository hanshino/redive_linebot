const base = require("../base");

class Vote extends base {
  getAllById(ids) {
    return this.knex.whereIn("id", ids).select();
  }
}

module.exports = new Vote({
  table: "vote",
  fillable: [
    "host_user_id",
    "title",
    "description",
    "banner_url",
    "options",
    "start_time",
    "end_time",
  ],
});
