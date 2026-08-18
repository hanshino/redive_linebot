const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");
const UserTitleModel = require("../src/model/application/UserTitle");

module.exports = main;

async function main() {
  DefaultLogger.info("Start title delivery");
  const trx = await mysql.transaction();

  try {
    await UserTitleModel.clearAllExcept("worldboss_", trx);

    await deliveryGachaTitles(trx);
    await deliveryJankenTitles(trx);

    await trx.commit();
    DefaultLogger.info("Title delivery complete");
  } catch (err) {
    await trx.rollback();
    DefaultLogger.error("Title delivery failed:", err);
    throw err;
  }
}

async function deliveryGachaTitles(trx) {
  const collectKeys = ["gacha_king_1", "gacha_king_2", "gacha_king_3"];
  const collectUsers = await trx
    .select("userId")
    .from("inventory")
    .count({ count: "itemId" })
    .whereNot("itemId", 999)
    .orderBy("count", "desc")
    .groupBy("userId")
    .limit(3);

  for (let i = 0; i < collectUsers.length; i++) {
    const title = await trx("titles").where("key", collectKeys[i]).first();
    const user = await trx("user").where("platform_id", collectUsers[i].userId).first();
    if (title && user) {
      await UserTitleModel.grantByPlatformId(user.platform_id, title.id, trx);
    }
  }

  const richKeys = ["gacha_rich_1", "gacha_rich_2", "gacha_rich_3"];
  const richUsers = await trx
    .select("userId")
    .from("inventory")
    .sum({ sum: "itemAmount" })
    .where("itemId", 999)
    .orderBy("sum", "desc")
    .groupBy("userId")
    .limit(3);

  for (let i = 0; i < richUsers.length; i++) {
    const title = await trx("titles").where("key", richKeys[i]).first();
    const user = await trx("user").where("platform_id", richUsers[i].userId).first();
    if (title && user) {
      await UserTitleModel.grantByPlatformId(user.platform_id, title.id, trx);
    }
  }
}

async function deliveryJankenTitles(trx) {
  const titleMap = {
    janken_king: { column: "rating", order: "desc" },
    janken_loser: { column: "lose", order: "desc" },
    janken_drawer: { column: "draw", order: "desc" },
    janken_ruki: { column: "rating", order: "asc" },
  };

  for (const [titleKey, query] of Object.entries(titleMap)) {
    const title = await trx("titles").where("key", titleKey).first();
    if (!title) continue;

    const topUser = await trx("janken_rating")
      .select("user_id")
      .orderBy(query.column, query.order)
      .first();

    if (topUser) {
      await UserTitleModel.grantByPlatformId(topUser.user_id, title.id, trx);
    }
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
