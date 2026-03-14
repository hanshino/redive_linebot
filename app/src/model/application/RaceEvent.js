const Base = require("../base");

class RaceEvent extends Base {
  constructor() {
    super({
      table: "race_event",
      fillable: ["race_id", "round", "event_type", "target_runners", "description"],
    });
  }

  /** Get all events for a race, ordered by round */
  getByRace(raceId) {
    return this.knex.where("race_id", raceId).orderBy("round").orderBy("id");
  }
}

const raceEvent = new RaceEvent();
module.exports = { RaceEvent, raceEvent };
