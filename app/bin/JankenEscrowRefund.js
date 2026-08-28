// Standalone-CLI dotenv preload — must run before the requires below, since
// knex/config read process.env at import time. Gated so worker re-loads skip.
if (require.main === module && process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
}

const JankenService = require("../src/service/JankenService");
const { DefaultLogger } = require("../src/util/Logger");

async function main() {
  DefaultLogger.info("[JankenEscrowRefund] running");
  const result = await JankenService.refundStaleEscrows();
  DefaultLogger.info(`[JankenEscrowRefund] done: ${JSON.stringify(result)}`);
}

module.exports = main;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      DefaultLogger.error("[JankenEscrowRefund] failed", err);
      process.exit(1);
    });
}
