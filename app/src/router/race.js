const express = require("express");
const router = express.Router();
const { race } = require("../model/application/Race");
const { raceRunner } = require("../model/application/RaceRunner");
const { raceBet } = require("../model/application/RaceBet");
const { raceEvent } = require("../model/application/RaceEvent");
const RaceService = require("../service/RaceService");
const { verifyToken } = require("../middleware/validation");

// Public: get current race status
router.get("/current", async (req, res) => {
  let targetRace = await race.getActive();

  // No active race — show the most recently finished one
  if (!targetRace) {
    targetRace = await race.knex.where("status", "finished").orderBy("finished_at", "desc").first();
  }

  if (!targetRace) {
    return res.json({ race: null });
  }

  const runners = await raceRunner.getByRace(targetRace.id);
  const events = await raceEvent.getByRace(targetRace.id);
  const odds = await RaceService.getOdds(targetRace.id);

  res.json({ race: targetRace, runners, events, odds });
});

// Auth: get my bets for current race (must be before /:raceId)
router.get("/current/my-bets", verifyToken, async (req, res) => {
  const { userId } = req.profile;
  const activeRace = await race.getActive();
  if (!activeRace) return res.json({ bets: [] });

  const bets = await raceBet.getUserBets(activeRace.id, userId);
  res.json({ bets });
});

// Auth: place bet
router.post("/bet", verifyToken, async (req, res) => {
  const { userId } = req.profile;
  const { raceId, runnerId, amount } = req.body;

  if (!raceId || !runnerId || !amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const result = await RaceService.placeBet(userId, raceId, runnerId, parseInt(amount, 10));
  res.json(result);
});

// Public: get most recently finished race
router.get("/recent-finished", async (req, res) => {
  const lastFinished = await race.knex
    .where("status", "finished")
    .orderBy("finished_at", "desc")
    .first();

  if (!lastFinished) return res.json({ race: null });

  const runners = await raceRunner.getByRace(lastFinished.id);
  const events = await raceEvent.getByRace(lastFinished.id);
  const odds = await RaceService.getOdds(lastFinished.id);

  res.json({ race: lastFinished, runners, events, odds });
});

// Public: get finished race result (must be last — catches /:raceId)
router.get("/:raceId", async (req, res) => {
  const { raceId } = req.params;
  const raceData = await race.find(raceId);
  if (!raceData) return res.status(404).json({ error: "Race not found" });

  const runners = await raceRunner.getByRace(raceId);
  const events = await raceEvent.getByRace(raceId);

  res.json({ race: raceData, runners, events });
});

module.exports = router;
