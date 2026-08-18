if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
}

const service = require("../src/service/WorldBossSeasonService");
const { DefaultLogger } = require("../src/util/Logger");

async function main() {
  const results = await service.settleExpiredSeasons();
  if (results.length) DefaultLogger.info(`World boss season settle: ${JSON.stringify(results)}`);
  return results;
}

function runCli(mainFn = main) {
  return Promise.resolve()
    .then(mainFn)
    .catch(err => {
      DefaultLogger.error("World boss season settle failed:", err);
      process.exitCode = 1;
    });
}

module.exports = main;
module.exports.main = main;
module.exports.runCli = runCli;
if (require.main === module) runCli();
