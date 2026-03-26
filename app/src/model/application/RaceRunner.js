const Base = require("../base");

class RaceRunner extends Base {
  constructor() {
    super({
      table: "race_runner",
      fillable: ["race_id", "character_id", "lane", "position", "stamina", "status"],
    });
  }

  /** Get all runners for a race, joined with character info */
  getByRace(raceId) {
    return this.knex
      .where("race_runner.race_id", raceId)
      .join("race_character", "race_runner.character_id", "race_character.id")
      .select(
        "race_runner.*",
        "race_character.name as character_name",
        "race_character.personality",
        "race_character.avatar_url"
      )
      .orderBy("race_runner.lane");
  }
}

const raceRunner = new RaceRunner();
module.exports = { RaceRunner, raceRunner };
