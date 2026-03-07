const mysql = require("../src/util/mysql");
const redis = require("../src/util/redis");
const moment = require("moment");
const config = require("config");
const { DefaultLogger } = require("../src/util/Logger");

module.exports = main;

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    await run();
  } catch (err) {
    console.error(err);
  }
  running = false;
}

async function run() {
  const handleCount = { value: 0 };
  const handleUsers = [];

  DefaultLogger.info(`[DailyQuest] Start`);

  while (handleCount.value < 1000) {
    const strPayload = await redis.rPop(config.get("event_center.daily_quest"));
    if (!strPayload) break;
    try {
      const payload = JSON.parse(strPayload);
      if (!payload.userId) continue;
      if (handleUsers.includes(payload.userId)) continue;
      handleUsers.push(payload.userId);

      await handle(payload);
      handleCount.value++;
    } catch (e) {
      DefaultLogger.error(e);
      continue;
    }
  }

  DefaultLogger.info(`[DailyQuest] handle ${handleCount.value}`);
  DefaultLogger.info(`[DailyQuest] End`);
}

async function handle(payload) {
  const { userId } = payload;
  const { gacha, janken } = await getTodayRecord(userId);

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
    return;
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
  } catch (e) {
    DefaultLogger.error(e);
    await trx.rollback();
    return;
  }
  await trx.commit();

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
  }
}

async function getTodayRecord(userId) {
  const start = moment().startOf("day").toDate();
  const end = moment().endOf("day").toDate();

  const [gacha, janken] = await Promise.all([
    mysql("signin_days")
      .where("user_id", userId)
      .where("last_signin_at", ">=", start)
      .where("last_signin_at", "<=", end)
      .first(),
    mysql("janken_result")
      .where("user_id", userId)
      .where("created_at", ">=", start)
      .where("created_at", "<=", end)
      .first(),
  ]);

  return { gacha: !!gacha, janken: !!janken };
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
