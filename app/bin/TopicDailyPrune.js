const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");
const moment = require("moment");

module.exports = main;

// 90 days: covers the 30-day word-cloud window plus a ~60-day buffer for the
// future 飆升 (trending) baseline which needs 14–30 days of history beyond the
// display window.
const RETENTION_DAYS = 90;

const TPE_OFFSET_MIN = 480; // UTC+8

async function main() {
  try {
    const cutoff = moment()
      .utcOffset(TPE_OFFSET_MIN)
      .subtract(RETENTION_DAYS, "days")
      .format("YYYY-MM-DD");
    const deleted = await mysql("topic_daily").where("stat_date", "<", cutoff).del();
    if (DefaultLogger && DefaultLogger.info) {
      DefaultLogger.info(
        `[TopicDailyPrune] deleted ${deleted} rows with stat_date < ${cutoff} (retention ${RETENTION_DAYS}d)`
      );
    }
  } catch (err) {
    console.error("[TopicDailyPrune]", err);
    if (DefaultLogger && DefaultLogger.error) DefaultLogger.error(err);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
