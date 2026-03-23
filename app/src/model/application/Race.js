const mysql = require("../../util/mysql");
const Base = require("../base");

class Race extends Base {
  constructor() {
    super({
      table: "race",
      fillable: [
        "status",
        "round",
        "terrain",
        "winner_runner_id",
        "betting_end_at",
        "started_at",
        "finished_at",
      ],
    });
  }

  /** Get the current active race (betting or running) */
  getActive() {
    return this.knex.whereIn("status", ["betting", "running"]).first();
  }

  /** Get running races that need round advancement */
  getNeedAdvance(intervalMinutes = 10) {
    return this.knex
      .where("status", "running")
      .where("updated_at", "<=", mysql.raw(`NOW() - INTERVAL ${intervalMinutes} MINUTE`));
  }

  /** Get races where betting period has ended but status is still betting */
  getReadyToStart() {
    return this.knex.where("status", "betting").where("betting_end_at", "<=", mysql.raw("NOW()"));
  }
}

const race = new Race();
module.exports = { Race, race };
