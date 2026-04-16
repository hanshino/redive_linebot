const AchievementEngine = require("../src/service/AchievementEngine");
const { DefaultLogger } = require("../src/util/Logger");

module.exports = main;

async function main() {
  DefaultLogger.info("Start achievement batch evaluation");
  try {
    await AchievementEngine.batchEvaluate();
    DefaultLogger.info("Achievement batch evaluation complete");
  } catch (err) {
    DefaultLogger.error("Achievement batch evaluation failed:", err);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
