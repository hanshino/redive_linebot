const Base = require("../base");

class RaceCharacter extends Base {
  constructor() {
    super({
      table: "race_character",
      fillable: ["name", "personality", "avatar_url", "custom_events"],
    });
  }

  /**
   * Get N random characters from the pool
   * @param {number} count
   * @returns {Promise<Array>}
   */
  getRandomCharacters(count = 5) {
    return this.knex.orderByRaw("RAND()").limit(count);
  }
}

const raceCharacter = new RaceCharacter();
module.exports = { RaceCharacter, raceCharacter };
