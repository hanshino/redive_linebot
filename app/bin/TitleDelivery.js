const mysql = require("../src/util/mysql");
const config = require("config");
const { DefaultLogger } = require("../src/util/Logger");
const UserTitleModel = require("../src/model/application/UserTitle");

module.exports = main;

async function main() {
  DefaultLogger.info("Start title delivery");
  const trx = await mysql.transaction();

  try {
    await UserTitleModel.clearAll(trx);

    await deliveryGachaTitles(trx);
    await deliveryJankenTitles(trx);
    await deliveryWorldBossTitles(trx);

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
    .from("Inventory")
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
    .from("Inventory")
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

async function deliveryWorldBossTitles(trx) {
  const progressorsConfig = config.get("title_delivery.world_boss.progressors");
  const leechersConfig = config.get("title_delivery.world_boss.leechers");

  const { count: userCount } = await trx.count({ count: "*" }).from("minigame_level").first();
  if (userCount === 0) return;

  const progressorsCount = Math.max(1, Math.ceil((userCount * progressorsConfig.limit) / 100));
  const leechersCount = Math.max(1, Math.ceil((userCount * leechersConfig.limit) / 100));

  // NOTE: minigame_level.user_id is an internal int ID, NOT a LINE platform_id.
  // Must join the user table to get platform_id.
  const progressorsTitle = await trx("titles").where("key", "progressors").first();
  if (progressorsTitle) {
    const topUsers = await trx("minigame_level")
      .join("user", "minigame_level.user_id", "user.id")
      .select("user.platform_id")
      .orderBy([
        { column: "minigame_level.level", order: "desc" },
        { column: "minigame_level.exp", order: "desc" },
      ])
      .limit(progressorsCount);
    for (const user of topUsers) {
      await UserTitleModel.grantByPlatformId(user.platform_id, progressorsTitle.id, trx);
    }
  }

  const leechersTitle = await trx("titles").where("key", "leechers").first();
  if (leechersTitle) {
    const bottomUsers = await trx("minigame_level")
      .join("user", "minigame_level.user_id", "user.id")
      .select("user.platform_id")
      .orderBy([
        { column: "minigame_level.level", order: "asc" },
        { column: "minigame_level.exp", order: "asc" },
      ])
      .limit(leechersCount);
    for (const user of bottomUsers) {
      await UserTitleModel.grantByPlatformId(user.platform_id, leechersTitle.id, trx);
    }
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
