const mysql = require("../lib/mysql");
const config = require("config");
const { DefaultLogger } = require("../lib/Logger");

exports.delivery = async () => {
  DefaultLogger.info("Start delivery advancement");
  await deliveryChatSystem();
  DefaultLogger.info("Delivery advancement chat system");
  await deliveryGachaSystem();
  DefaultLogger.info("Delivery advancement gacha system");
  // await deliveryJankenSystem();
  // DefaultLogger.info("Delivery advancement janken system");
  await deliveryWorldbossSystem();
  DefaultLogger.info("Delivery advancement worldboss system");
  DefaultLogger.info("End delivery advancement");
};

/**
 * 派送聊天系統稱號
 */
async function deliveryChatSystem() {
  const chatKing = config.get("advancement.chat_king") || [];

  if (chatKing.length === 0) {
    return;
  }

  // 取得前三名的玩家
  const users = await mysql
    .select("id")
    .from("chat_user_data")
    .where("rank", ">=", 1)
    .where("rank", "<=", 3)
    .orderBy("rank", "asc")
    .limit(3);

  // 取得設定的稱號
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

/**
 * 派發轉蛋系統稱號
 * @returns {Promise<void>}
 */
async function deliveryGachaSystem() {
  const gachaKing = config.get("advancement.gacha_king") || [];
  const gachaRich = config.get("advancement.gacha_rich") || [];

  if (gachaKing.length === 0 && gachaRich.length === 0) {
    return;
  }

  // 取得蒐集前三名的玩家
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

  // 將會員編號轉換成資料庫編號
  const userIdMap = {};
  const ids = [...collectUsers, ...richUsers].map(user => user.userId);
  const users = await mysql
    .select([{ id: "No" }, "platformId"])
    .from("User")
    .whereIn("platformId", ids);

  users.forEach(user => {
    userIdMap[user.platformId] = user.id;
  });

  const trx = await mysql.transaction();
  try {
    await deleteExistAdvancement(trx, [...gachaKing, ...gachaRich]);

    await Promise.all(
      collectUsers.map(async (user, index) =>
        insertAdvancement(trx, userIdMap[user.userId], gachaKing[index])
      )
    );

    await Promise.all(
      richUsers.map((user, index) =>
        insertAdvancement(trx, userIdMap[user.userId], gachaRich[index])
      )
    );
  } catch (e) {
    await trx.rollback();
    DefaultLogger.error(e);
    throw e;
  }

  await trx.commit();
}

async function deliveryJankenSystem() {
  const jankenKing = config.get("advancement.janken_king") || [];
  const jankenLoser = config.get("advancement.janken_loser") || [];
  const jankenDrawer = config.get("advancement.janken_drawer") || [];

  if (jankenKing.length === 0) {
    return;
  }

  const findJakenKing = function (type) {
    return mysql
      .select("user_id")
      .count({ count: "result" })
      .from("janken_result")
      .where("result", type)
      .orderBy("count", "desc")
      .groupBy("user_id")
      .limit(1);
  };

  // 取得勝場最多的玩家
  const winKing = await findJakenKing(1);
  // 取得敗場最多的玩家
  const loseKing = await findJakenKing(2);
  // 取得平手最多的玩家
  const drawKing = await findJakenKing(0);

  // 將會員編號轉換成資料庫編號
  const userIdMap = {};
  const ids = [...winKing, ...loseKing, ...drawKing].map(user => user.user_id);
  const users = await mysql
    .select([{ id: "No" }, "platformId"])
    .from("User")
    .whereIn("platformId", ids);

  users.forEach(user => {
    userIdMap[user.platformId] = user.id;
  });

  // 取得設定的稱號
  const trx = await mysql.transaction();

  try {
    await deleteExistAdvancement(trx, [...jankenKing, ...jankenLoser, ...jankenDrawer]);

    await Promise.all([
      insertAdvancement(trx, userIdMap[winKing[0].user_id], jankenKing[0]),
      insertAdvancement(trx, userIdMap[loseKing[0].user_id], jankenLoser[0]),
      insertAdvancement(trx, userIdMap[drawKing[0].user_id], jankenDrawer[0]),
    ]);
  } catch (e) {
    await trx.rollback();
    throw e;
  }

  await trx.commit();
}

async function deliveryWorldbossSystem() {
  // 取得世界王系統的所有玩家數量
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
      if (!target) {
        return;
      }
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

/**
 * 刪除過期的稱號
 * @param {*} trx Passing trx for transaction
 * @returns {Promise<void>}
 */
function deleteExistAdvancement(trx, names) {
  return trx
    .delete()
    .from("user_has_advancements")
    .whereIn("advancement_id", trx.select("id").from("advancement").whereIn("name", names));
}

/**
 * 新增稱號
 * @param {*} trx Passing trx for transaction
 * @param {Number} userId 玩家編號
 * @param {String} name 稱號名稱
 * @returns {Promise<void>}
 */
function insertAdvancement(trx, userId, name) {
  return trx
    .insert(function () {
      this.select([trx.raw(userId), "id"])
        .from("advancement")
        .where("name", name);
    })
    .into(trx.raw("?? (??, ??)", ["user_has_advancements", "user_id", "advancement_id"]));
}
