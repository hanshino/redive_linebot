// Standalone CLI preload. Worker/test require paths do not execute this branch.
if (require.main === module && process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
}

const moment = require("moment");
const { DefaultLogger } = require("../src/util/Logger");
const { toUtc8Date } = require("../src/util/date");
const JankenAutoMatchmakingService = require("../src/service/JankenAutoMatchmakingService");

const TPE_OFFSET_MINUTES = 8 * 60;
const SCHEDULE_HOUR = 21;
const SCHEDULE_MINUTE = 0;

function isScheduleWindow(now) {
  const taipeiNow = moment(now).utcOffset(TPE_OFFSET_MINUTES);
  return taipeiNow.hour() === SCHEDULE_HOUR && taipeiNow.minute() === SCHEDULE_MINUTE;
}

async function main({ now = new Date(), clock = () => new Date(), rng = Math.random } = {}) {
  const eventNow = new Date(now);
  if (Number.isNaN(eventNow.getTime())) throw new Error("Invalid auto-janken run time");
  if (typeof clock !== "function") throw new Error("clock must be a function");
  if (typeof rng !== "function") throw new Error("rng must be a function");

  const runDate = toUtc8Date(eventNow);
  // The durable run_date claim prevents duplicates, while this minute-sized gate prevents an
  // operator/restarted worker from compensating a missed 21:00 tick later in the day.
  if (!isScheduleWindow(eventNow)) {
    return {
      claimed: false,
      skipped: true,
      reason: "outside_schedule_window",
      runDate,
      matches: [],
      byeUserIds: [],
      results: [],
    };
  }

  const result = await JankenAutoMatchmakingService.runDailyAutoMatch({
    runDate,
    now: eventNow,
    clock,
    rng,
  });
  DefaultLogger.info(
    `[AutoJanken] run_date=${runDate} claimed=${result.claimed} ` +
      `matches=${result.matches.length} byes=${result.byeUserIds.length}`
  );
  return result;
}

module.exports = main;
module.exports.main = main;
module.exports.isScheduleWindow = isScheduleWindow;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      DefaultLogger.error(`[AutoJanken] fatal code=${error.code || "UNKNOWN"}`);
      process.exit(1);
    });
}
