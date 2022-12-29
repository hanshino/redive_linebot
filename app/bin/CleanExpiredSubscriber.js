const moment = require("moment");
const SubscribeUser = require("../src/model/application/SubscribeUser");
const { pushMessage } = require("../src/util/LineNotify");
const { DefaultLogger } = require("../src/util/Logger");

async function main() {
  const now = moment();
  const query = SubscribeUser.connection
    .from(SubscribeUser.table)
    .delete()
    .where("end_at", "<", now.toDate());

  const affectedRows = await query;

  DefaultLogger.info(`[CleanExpiredSubscriber] affectedRows: ${affectedRows}`);

  if (affectedRows > 0) {
    await pushMessage({
      message: `已清除${affectedRows}筆已過期的訂閱者`,
      token: process.env.LINE_NOTIFY_TOKEN,
    });
  }
}

module.exports = main;

if (require.main === module) {
  main().then(() => process.exit(0));
}
