const mysql = require("../src/util/mysql");
const redis = require("../src/util/redis");
const { CustomLogger } = require("../src/util/Logger");

module.exports = main;

async function main() {
  await provideCleanUpMembers();
}

async function provideCleanUpMembers() {
  let memberDatas = await mysql
    .select(["id", { groupId: "GuildId" }, { userId: "UserId" }])
    .from("GuildMembers")
    .where({ status: 1 });

  CustomLogger.info(`七天固定盤點會員資料，此次處理筆數 ${memberDatas.length}`);

  for (const data of memberDatas) {
    await redis.lPush("CleanUpMembers", JSON.stringify(data));
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
