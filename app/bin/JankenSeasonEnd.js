// Standalone-CLI dotenv preload — must run before the requires below, since
// knex/config read process.env at import time. Gated so worker re-loads skip.
if (require.main === module && process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
}

const JankenSeasonService = require("../src/service/JankenSeasonService");
const { DefaultLogger } = require("../src/util/Logger");

function parseArgv(argv) {
  const out = { note: null, enableRewards: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--enable-rewards") out.enableRewards = true;
    else if (a === "--note" && i + 1 < argv.length) {
      out.note = argv[++i];
    }
  }
  return out;
}
exports.parseArgv = parseArgv;

async function main(argv = process.argv.slice(2)) {
  const args = parseArgv(argv);
  DefaultLogger.info(
    `[JankenSeasonEnd] starting: note=${args.note} enableRewards=${args.enableRewards}`
  );
  const result = await JankenSeasonService.endCurrentAndOpenNext({
    note: args.note,
    payoutEnabled: args.enableRewards,
  });
  DefaultLogger.info(`[JankenSeasonEnd] done: ${JSON.stringify(result)}`);
  return result;
}
exports.main = main;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      DefaultLogger.error("[JankenSeasonEnd] failed", err);
      process.exit(1);
    });
}
