const Base = require("../base");

class RaceBet extends Base {
  constructor() {
    super({
      table: "race_bet",
      fillable: ["race_id", "user_id", "runner_id", "amount", "payout"],
    });
  }

  /** Get total pool amount for a race */
  async getTotalPool(raceId) {
    const result = await this.knex.where("race_id", raceId).sum({ total: "amount" }).first();
    return Number(result.total) || 0;
  }

  /** Get pool amount per runner */
  getPoolByRunner(raceId) {
    return this.knex.where("race_id", raceId).groupBy("runner_id").select("runner_id").sum({
      total: "amount",
    });
  }

  /** Get all bets for a specific runner */
  getBetsByRunner(raceId, runnerId) {
    return this.knex.where({ race_id: raceId, runner_id: runnerId });
  }

  /** Get a user's bets for a race */
  getUserBets(raceId, userId) {
    return this.knex.where({ race_id: raceId, user_id: userId });
  }
}

const raceBet = new RaceBet();
module.exports = { RaceBet, raceBet };
