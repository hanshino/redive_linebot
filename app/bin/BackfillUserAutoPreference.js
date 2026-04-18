if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: require("path").resolve(__dirname, "../../.env"),
  });
}

const moment = require("moment");
const UserAutoPreference = require("../src/model/application/UserAutoPreference");
const SubscribeUser = require("../src/model/application/SubscribeUser");
const SubscribeCard = require("../src/model/application/SubscribeCard");
const { CustomLogger } = require("../src/util/Logger");

const BATCH_SIZE = 500;

async function main() {
  const startedAt = Date.now();
  let totalProcessed = 0;
  let totalErrors = 0;

  const now = moment();

  const userRows = await SubscribeUser.knex
    .whereIn("subscribe_card_key", [SubscribeCard.key.month, SubscribeCard.key.season])
    .andWhere("end_at", ">=", now.toDate())
    .distinct("user_id");

  const userIds = userRows.map(r => r.user_id).filter(Boolean);
  const total = userIds.length;

  CustomLogger.info(`[BackfillUserAutoPreference] Target: ${total} active subscribers`);

  const batches = [];
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    batches.push(userIds.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const rows = batch.map(userId => ({ user_id: userId, auto_daily_gacha: 1 }));
    try {
      await UserAutoPreference.connection(UserAutoPreference.table)
        .insert(rows)
        .onConflict("user_id")
        .merge(["auto_daily_gacha"]);
      totalProcessed += batch.length;
      CustomLogger.info(
        `[BackfillUserAutoPreference] Batch ${i + 1}/${batches.length}: inserted/updated ${batch.length} rows (total ${totalProcessed}/${total})`
      );
    } catch (err) {
      totalErrors += batch.length;
      CustomLogger.error(
        `[BackfillUserAutoPreference] Batch ${i + 1}/${batches.length} FAILED: ${err.message}`
      );
    }
  }

  const durationMs = Date.now() - startedAt;
  CustomLogger.info(
    `[BackfillUserAutoPreference] Done. totalProcessed=${totalProcessed} totalErrors=${totalErrors} duration=${durationMs}ms`
  );

  return { totalProcessed, totalErrors, durationMs };
}

module.exports = main;

if (require.main === module) {
  main()
    .then(({ totalErrors }) => process.exit(totalErrors > 0 ? 1 : 0))
    .catch(err => {
      CustomLogger.error(`[BackfillUserAutoPreference] Fatal error: ${err.message}`);

      console.error(err);
      process.exit(1);
    });
}
