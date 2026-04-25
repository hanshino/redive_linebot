const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");

module.exports = main;

// Spec line 545 — chat_exp_events is a 30-day rolling event log. The retention
// cap keeps the table sized for hot-path queries (per-user audits, anomaly
// scans) while older rows that only matter for analytics get dropped.
const RETENTION_DAYS = 30;

async function main() {
  try {
    const deleted = await mysql("chat_exp_events")
      .where("ts", "<", mysql.raw(`NOW() - INTERVAL ${RETENTION_DAYS} DAY`))
      .del();
    if (DefaultLogger && DefaultLogger.info) {
      DefaultLogger.info(
        `[ChatExpEventsPrune] deleted ${deleted} rows older than ${RETENTION_DAYS}d`
      );
    }
  } catch (err) {
    console.error("[ChatExpEventsPrune]", err);
    if (DefaultLogger && DefaultLogger.error) DefaultLogger.error(err);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
