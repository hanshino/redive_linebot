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
      .where("updated_at", "<=", mysql.raw("NOW() - INTERVAL ? MINUTE", [intervalMinutes]));
  }

  /** Get races where betting period has ended but status is still betting */
  getReadyToStart() {
    return this.knex.where("status", "betting").where("betting_end_at", "<=", mysql.raw("NOW()"));
  }

  /** Get recent finished races with winner info */
  getRecentFinished(limit = 5) {
    return mysql("race")
      .where("race.status", "finished")
      .whereNotNull("race.winner_runner_id")
      .join("race_runner", "race.winner_runner_id", "race_runner.id")
      .join("race_character", "race_runner.character_id", "race_character.id")
      .select(
        "race.id",
        "race.round",
        "race.finished_at",
        "race_character.name as winner_name",
        "race_character.avatar_url as winner_avatar"
      )
      .orderBy("race.finished_at", "desc")
      .limit(limit);
  }
}

const race = new Race();
module.exports = { Race, race };
