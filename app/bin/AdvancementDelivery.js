const mysql = require("../src/util/mysql");
const config = require("config");
const { DefaultLogger } = require("../src/util/Logger");

module.exports = main;

async function main() {
  DefaultLogger.info("Start delivery advancement");
  await deliveryChatSystem();
  DefaultLogger.info("Delivery advancement chat system");
  await deliveryGachaSystem();
  DefaultLogger.info("Delivery advancement gacha system");
  await deliveryWorldbossSystem();
  DefaultLogger.info("Delivery advancement worldboss system");
  DefaultLogger.info("End delivery advancement");
}

async function deliveryChatSystem() {
  const chatKing = config.get("advancement.chat_king") || [];
  if (chatKing.length === 0) return;

  const users = await mysql
    .select("id")
    .from("chat_user_data")
    .where("rank", ">=", 1)
    .where("rank", "<=", 3)
    .orderBy("rank", "asc")
    .limit(3);

  const trx = await mysql.transaction();
  try {
    await deleteExistAdvancement(trx, chatKing);
    await Promise.all(users.map((user, index) => insertAdvancement(trx, user.id, chatKing[index])));
  } catch (e) {
    await trx.rollback();
    DefaultLogger.error(e);
    throw e;
  }
  await trx.commit();
}

async function deliveryGachaSystem() {
  const gachaKing = config.get("advancement.gacha_king") || [];
  const gachaRich = config.get("advancement.gacha_rich") || [];
  if (gachaKing.length === 0 && gachaRich.length === 0) return;

  const collectUsers = await mysql
    .select("userId")
    .from("Inventory")
    .count({ count: "itemId" })
    .whereNot("itemId", 999)
    .orderBy("count", "desc")
    .groupBy("userId")
    .limit(3);

  const richUsers = await mysql
    .select("userId")
    .from("Inventory")
    .sum({ sum: "itemAmount" })
    .where("itemId", 999)
    .orderBy("sum", "desc")
    .groupBy("userId")
    .limit(3);

  const userIdMap = {};
  const ids = [...collectUsers, ...richUsers].map(user => user.userId);
  const users = await mysql
    .select([{ id: "id" }, "platform_id"])
    .from("user")
    .whereIn("platform_id", ids);

  users.forEach(user => {
    userIdMap[user.platform_id] = user.id;
  });

  const trx = await mysql.transaction();
  try {
    await deleteExistAdvancement(trx, [...gachaKing, ...gachaRich]);
    await Promise.all(
      collectUsers.map((user, index) => insertAdvancement(trx, userIdMap[user.userId], gachaKing[index]))
    );
    await Promise.all(
      richUsers.map((user, index) => insertAdvancement(trx, userIdMap[user.userId], gachaRich[index]))
    );
  } catch (e) {
    await trx.rollback();
    DefaultLogger.error(e);
    throw e;
  }
  await trx.commit();
}

async function deliveryWorldbossSystem() {
  const { count: userCount } = await mysql.count({ count: "*" }).from("minigame_level").first();

  const progressorsLimit = config.get("advancement.world_boss.progressors.limit") || 1;
  const progressorsCount = Math.ceil((userCount * progressorsLimit) / 100);
  const progressorsKey = config.get("advancement.world_boss.progressors.key");

  const leechersLimit = config.get("advancement.world_boss.leechers.limit") || 1;
  const leechersCount = Math.ceil((userCount * leechersLimit) / 100);
  const leechersKey = config.get("advancement.world_boss.leechers.key");

  const trx = await mysql.transaction();
  try {
    await deleteExistAdvancement(trx, [progressorsKey, leechersKey]);

    const advancementIds = await trx
      .select(["id", "name"])
      .from("advancement")
      .whereIn("name", [progressorsKey, leechersKey]);

    const writeAdvancement = async (count, advancement) => {
      let target = advancementIds.find(ad => ad.name === advancement);
      if (!target) return;
      const { id: adId } = target;
      const order = advancement === progressorsKey ? "desc" : "asc";

      return trx
        .insert(function () {
          this.select(["user_id", trx.raw(adId)])
            .from("minigame_level")
            .orderBy([
              { column: "level", order },
              { column: "exp", order },
            ])
            .limit(count);
        })
        .into(trx.raw("?? (??, ??)", ["user_has_advancements", "user_id", "advancement_id"]));
    };

    await Promise.all([
      writeAdvancement(progressorsCount, progressorsKey),
      writeAdvancement(leechersCount, leechersKey),
    ]);
  } catch (e) {
    await trx.rollback();
    DefaultLogger.error(e);
    throw e;
  }
  await trx.commit();
}

function deleteExistAdvancement(trx, names) {
  return trx
    .delete()
    .from("user_has_advancements")
    .whereIn("advancement_id", trx.select("id").from("advancement").whereIn("name", names));
}

function insertAdvancement(trx, userId, name) {
  return trx
    .insert(function () {
      this.select([trx.raw(userId), "id"]).from("advancement").where("name", name);
    })
    .into(trx.raw("?? (??, ??)", ["user_has_advancements", "user_id", "advancement_id"]));
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
