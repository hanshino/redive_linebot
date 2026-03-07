const mysql = require("../src/util/mysql");
const { CustomLogger } = require("../src/util/Logger");

module.exports = main;

async function main() {
  await Promise.all([removeDeletedOrders(), markUselessOrders(), clearClosed(), clearLeftMembers()]);
}

async function removeDeletedOrders() {
  let expireDates = new Date();
  expireDates.setDate(expireDates.getDate() - 3);
  await mysql.from("CustomerOrder").where("status", 0).where("ModifyDTM", "<", expireDates).delete();
}

async function markUselessOrders() {
  let expireDates = new Date();
  expireDates.setMonth(expireDates.getMonth() - 2);

  let affectedRows = await mysql
    .from("CustomerOrder")
    .where("status", 1)
    .where("touchDTM", "<", expireDates)
    .delete();

  CustomLogger.info({ message: `已將 ${affectedRows} 個不常用指令標記刪除`, alert: true });
}

async function clearClosed() {
  let expireDates = new Date();
  let records = [];
  expireDates.setDate(expireDates.getDate() - 7);

  let delGuilds = await mysql
    .select("guildId")
    .from("Guild")
    .where("status", 0)
    .where("CloseDTM", "<", expireDates)
    .then(res => res.map(data => data.guildId));

  if (delGuilds.length === 0) {
    CustomLogger.info({ message: "沒有關閉的群組需要清除", alert: true });
    return;
  }

  await mysql.transaction(async trx => {
    let r1 = await trx.from("Guild").whereIn("GuildId", delGuilds).delete();
    records.push(`刪除了 ${r1} 個群組`);

    let r2 = await trx.from("GuildMembers").whereIn("GuildId", delGuilds).delete();
    records.push(`刪除了 ${r2} 個群組會員資料`);

    let r3 = await trx.from("GuildConfig").whereIn("GuildId", delGuilds).delete();
    records.push(`刪除了 ${r3} 個群組設定`);

    let r4 = await trx.from("CustomerOrder").whereIn("SourceId", delGuilds).delete();
    records.push(`刪除了 ${r4} 個群組自訂指令`);

  });

  CustomLogger.info({ message: records.join("\n"), alert: true });
}

async function clearLeftMembers() {
  let expireDates = new Date();
  expireDates.setDate(expireDates.getDate() - 7);
  let affectedRows = await mysql("GuildMembers")
    .where("LeftDTM", "<", expireDates)
    .where("status", "=", 0)
    .delete();

  CustomLogger.info({ message: `清除了 ${affectedRows} 退出成員資料` });
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
