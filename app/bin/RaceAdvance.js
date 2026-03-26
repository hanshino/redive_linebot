const { race } = require("../src/model/application/Race");
const RaceService = require("../src/service/RaceService");
const config = require("config");

const raceConfig = config.get("minigame.race");

module.exports = async function () {
  try {
    // 1. Check if any betting period has ended → start race
    const readyRaces = await race.getReadyToStart();
    for (const r of readyRaces) {
      console.log(`[Race] Starting race #${r.id}`);
      await RaceService.startRace(r.id);
    }

    // 2. Check if any running race needs advancement
    const advanceable = await race.getNeedAdvance(raceConfig.advanceIntervalMinutes);
    for (const r of advanceable) {
      console.log(`[Race] Advancing race #${r.id} round ${r.round + 1}`);
      const result = await RaceService.advanceRound(r.id);
      if (result && result.finished) {
        console.log(`[Race] Race #${r.id} finished! Settling bets...`);
        await RaceService.settleBets(r.id);
      }
    }

    // 3. Check schedule — should we create a new race?
    const active = await race.getActive();
    if (!active) {
      const now = new Date();
      const currentHour = now.getHours();
      if (raceConfig.schedule.startHours.includes(currentHour)) {
        const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentHour);
        const recentRace = await race.knex.where("created_at", ">=", hourStart).first();
        if (!recentRace) {
          const raceId = await RaceService.createRace();
          if (raceId) console.log(`[Race] Created new race #${raceId}`);
        }
      }
    }
  } catch (err) {
    console.error("[Race] Cron error:", err);
  }
};
