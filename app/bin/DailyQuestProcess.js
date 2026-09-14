const { DefaultLogger } = require("../src/util/Logger");
const DailyQuestService = require("../src/service/DailyQuestService");

module.exports = main;

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    DefaultLogger.info("[DailyQuest] Start");
    const result = await DailyQuestService.run();
    DefaultLogger.info(
      `[DailyQuest] End activated=${result.activated} processed=${result.processed} ` +
        `rewarded=${result.rewarded} weekly=${result.weeklyRewarded} failed=${result.failed}`
    );
    return result;
  } finally {
    running = false;
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      DefaultLogger.error(`[DailyQuest] fatal code=${error.code || "UNKNOWN"}`);
      process.exit(1);
    });
}
