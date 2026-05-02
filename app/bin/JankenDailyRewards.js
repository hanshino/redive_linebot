// Standalone-CLI dotenv preload (worker entry already calls dotenv).
if (require.main === module && process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
}

const JankenRewardService = require("../src/service/JankenRewardService");
const { DefaultLogger } = require("../src/util/Logger");

function computeRewardDate(now = new Date()) {
  // Shift to Asia/Taipei (UTC+8), then subtract one day to get "yesterday in TPE".
  // Uses UTC arithmetic only — independent of the runner's local TZ.
  const tpeMs = now.getTime() + 8 * 60 * 60 * 1000;
  const tpe = new Date(tpeMs);
  tpe.setUTCDate(tpe.getUTCDate() - 1);
  return tpe.toISOString().slice(0, 10);
}
exports.computeRewardDate = computeRewardDate;

async function main() {
  const date = computeRewardDate();
  DefaultLogger.info(`[JankenDailyRewards] running for ${date}`);
  const result = await JankenRewardService.payoutDaily(date);
  DefaultLogger.info(`[JankenDailyRewards] done: ${JSON.stringify(result)}`);
}

module.exports = main;
module.exports.computeRewardDate = computeRewardDate;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      DefaultLogger.error("[JankenDailyRewards] failed", err);
      process.exit(1);
    });
}
