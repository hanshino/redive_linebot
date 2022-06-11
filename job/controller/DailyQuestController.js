const redis = require("../lib/redis");
const mysql = require("../lib/mysql");
const notify = require("../lib/notify");
const moment = require("moment");
const config = require("config");
const redis_key = config.get("event_center.daily_quest");
const { DefaultLogger } = require("../lib/Logger");

exports.run = async () => {
  const handleCount = 0;
  const handleUsers = [];
  const handleResult = [];

  DefaultLogger.info(`[DailyQuest] Start`);

  while (handleCount < 1000) {
    const strPayload = await redis.dequeue(redis_key);
    if (!strPayload) {
      break;
    }
    try {
      const payload = JSON.parse(strPayload);
      if (!payload.userId) continue;

      if (handleUsers.includes(payload.userId)) continue;
      handleUsers.push(payload.userId);

      let result = await handle(payload);
      if (result) {
        handleResult.push(result);
      }
    } catch (e) {
      DefaultLogger.error(e);
      continue;
    }
  }

  DefaultLogger.info(`[DailyQuest] handle ${handleCount}`);
  DefaultLogger.info(`[DailyQuest] End`);
};

/**
 * 處理每日任務
 * @param {Object} payload 內容
 * @param {String} payload.userId 用戶ID
 */
async function handle(payload) {
  const { userId } = payload;
  const { gacha, janken } = await getTodayRecord(userId);
  const result = {
    // 是否派發了每日任務完成獎勵
    daily_reward: false,
    // 是否派發了每週任務完成獎勵
    weekly_reward: false,
  };

  if (!gacha || !janken) {
    DefaultLogger.info(`[DailyQuest] ${userId} not complete`);
    return;
  }

  const dailyRecord = await mysql("daily_quest")
    .first()
    .where("created_at", ">=", moment().startOf("day").toDate())
    .where("created_at", "<=", moment().endOf("day").toDate())
    .where("user_id", userId);

  if (dailyRecord) {
    DefaultLogger.info(`[DailyQuest] ${userId} already complete. Gaven Reward`);
    return result;
  }

  const trx = await mysql.transaction();

  try {
    DefaultLogger.info(`[DailyQuest] ${userId} complete. Give reward`);
    await trx("daily_quest").insert({ user_id: userId });
    await trx("Inventory").insert({
      userId,
      itemId: config.get("daily_quest.reward.itemId"),
      itemAmount: config.get("daily_quest.reward.itemAmount"),
    });

    result.daily_reward = true;
  } catch (e) {
    DefaultLogger.error(e);
    await trx.rollback();
    return;
  }

  await trx.commit();

  if (!result.daily_reward) {
    return result;
  }

  const weeklyRecords = await mysql("daily_quest")
    .where("created_at", ">=", moment().startOf("week").toDate())
    .where("created_at", "<=", moment().endOf("week").toDate())
    .where("user_id", userId);

  if (weeklyRecords.length === 7) {
    await mysql("Inventory").insert({
      userId,
      itemId: config.get("daily_quest.weekly_reward.itemId"),
      itemAmount: config.get("daily_quest.weekly_reward.itemAmount"),
    });

    result.weekly_reward = true;
  }

  return result;
}

async function getTodayRecord(userId) {
  const start = moment().startOf("day").toDate();
  const end = moment().endOf("day").toDate();

  const [gacha, janken] = await Promise.all([
    mysql("GachaSignin")
      .where("userId", userId)
      .where("signinDate", ">=", start)
      .where("signinDate", "<=", end)
      .first(),
    mysql("janken_result")
      .where("user_id", userId)
      .where("created_at", ">=", start)
      .where("created_at", "<=", end)
      .first(),
  ]);

  return {
    gacha: !!gacha,
    janken: !!janken,
  };
}
