const express = require("express");
const router = express.Router();
const { race } = require("../model/application/Race");
const { raceBet } = require("../model/application/RaceBet");
const RaceService = require("../service/RaceService");
const { verifyToken } = require("../middleware/validation");
const config = require("config");

const trackLength = config.get("minigame.race.trackLength");

function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// Public: get current race status
router.get(
  "/current",
  asyncHandler(async (req, res) => {
    let targetRace = await race.getActive();

    if (!targetRace) {
      targetRace = await race.knex.where("status", "finished").orderBy("finished_at", "desc").first();
    }

    if (!targetRace) {
      return res.json({ race: null });
    }

    const details = await RaceService.getRaceDetails(targetRace.id);
    res.json({ race: targetRace, trackLength, ...details });
  })
);

// Auth: get my bets for current race (must be before /:raceId)
router.get(
  "/current/my-bets",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { userId } = req.profile;
    const activeRace = await race.getActive();
    if (!activeRace) return res.json({ bets: [] });

    const bets = await raceBet.getUserBets(activeRace.id, userId);
    res.json({ bets });
  })
);

// Auth: get user's bet history with settlement details
router.get(
  "/my-history",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { userId } = req.profile;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const result = await raceBet.getUserBetHistory(userId, limit);
    res.json(result);
  })
);

// Auth: place bet
router.post(
  "/bet",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { userId } = req.profile;
    const { raceId, runnerId, amount } = req.body;

    if (!raceId || !runnerId || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await RaceService.placeBet(userId, raceId, runnerId, parseInt(amount, 10));
    res.json(result);
  })
);

// Public: get most recently finished race
router.get(
  "/recent-finished",
  asyncHandler(async (req, res) => {
    const lastFinished = await race.knex
      .where("status", "finished")
      .orderBy("finished_at", "desc")
      .first();

    if (!lastFinished) return res.json({ race: null });

    const details = await RaceService.getRaceDetails(lastFinished.id);
    res.json({ race: lastFinished, ...details });
  })
);

// Public: get recent finished races history (winner summary)
router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
    const history = await race.getRecentFinished(limit);
    res.json({ history });
  })
);

// Public: get finished race result (must be last — catches /:raceId)
router.get(
  "/:raceId",
  asyncHandler(async (req, res) => {
    const { raceId } = req.params;
    const raceData = await race.find(raceId);
    if (!raceData) return res.status(404).json({ error: "Race not found" });

    const details = await RaceService.getRaceDetails(raceId);
    const result = { race: raceData, trackLength, ...details };

    // Add settlement summary for finished races
    if (raceData.status === "finished" && raceData.winner_runner_id) {
      const allBets = await raceBet.knex.where("race_id", raceId);
      const totalPool = allBets.reduce((sum, b) => sum + Number(b.amount), 0);
      const winnerBets = allBets.filter(b => b.runner_id === raceData.winner_runner_id);
      const winnerPool = winnerBets.reduce((sum, b) => sum + Number(b.amount), 0);
      const feeRate = config.get("minigame.race.bet.feeRate");
      const prizePool = Math.floor(totalPool * (1 - feeRate));

      result.settlement = {
        totalPool,
        prizePool,
        winnerPool,
        feeRate,
        multiplier: winnerPool > 0 ? (prizePool / winnerPool).toFixed(2) : null,
      };
      result.betStats = {
        totalBets: allBets.length,
        totalBettors: new Set(allBets.map(b => b.user_id)).size,
        winnerBets: winnerBets.length,
      };
    }

    res.json(result);
  })
);

module.exports = router;
