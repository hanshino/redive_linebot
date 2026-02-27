const moment = require("moment");
const SubscribeUser = require("../src/model/application/SubscribeUser");
const { DefaultLogger } = require("../src/util/Logger");

async function main() {
  const now = moment();
  const query = SubscribeUser.connection
    .from(SubscribeUser.table)
    .delete()
    .where("end_at", "<", now.toDate());

  const affectedRows = await query;

  DefaultLogger.info(`[CleanExpiredSubscriber] affectedRows: ${affectedRows}`);
}

module.exports = main;

if (require.main === module) {
  main().then(() => process.exit(0));
}
