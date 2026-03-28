const Base = require("../base");
const config = require("config");

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

  /**
   * Get user's bet history across races with settlement details.
   * Returns bets joined with runner/character/race info + per-race settlement summary.
   */
  async getUserBetHistory(userId, limit = 20) {
    const bets = await this.knex
      .where("race_bet.user_id", userId)
      .join("race_runner", "race_bet.runner_id", "race_runner.id")
      .join("race_character", "race_runner.character_id", "race_character.id")
      .join("race", "race_bet.race_id", "race.id")
      .select(
        "race_bet.id",
        "race_bet.race_id",
        "race_bet.runner_id",
        "race_bet.amount",
        "race_bet.payout",
        "race_bet.created_at",
        "race_character.name as character_name",
        "race_character.avatar_url",
        "race_runner.lane",
        "race.status as race_status",
        "race.round as race_round",
        "race.winner_runner_id",
        "race.finished_at"
      )
      .orderBy("race_bet.created_at", "desc")
      .limit(limit);

    if (bets.length === 0) return { bets: [], settlements: {} };

    // Collect finished race IDs that need settlement summaries
    const finishedRaceIds = [
      ...new Set(bets.filter(b => b.race_status === "finished").map(b => b.race_id)),
    ];

    if (finishedRaceIds.length === 0) return { bets, settlements: {} };

    // Single grouped query: total pool + winner pool per race
    const poolRows = await this.knex
      .where("race_id", "in", finishedRaceIds)
      .groupBy("race_id", "runner_id")
      .select("race_id", "runner_id")
      .sum({ total: "amount" });

    const feeRate = config.get("minigame.race.bet.feeRate");
    const settlements = {};

    for (const raceId of finishedRaceIds) {
      const bet = bets.find(b => b.race_id === raceId);
      const raceRows = poolRows.filter(r => r.race_id === raceId);
      const totalPool = raceRows.reduce((sum, r) => sum + Number(r.total), 0);
      const winnerPool = Number(
        raceRows.find(r => r.runner_id === bet.winner_runner_id)?.total ?? 0
      );
      const prizePool = Math.floor(totalPool * (1 - feeRate));

      settlements[raceId] = {
        totalPool,
        prizePool,
        winnerPool,
        feeRate,
        multiplier: winnerPool > 0 ? (prizePool / winnerPool).toFixed(2) : null,
      };
    }

    return { bets, settlements };
  }
}

const raceBet = new RaceBet();
module.exports = { RaceBet, raceBet };
