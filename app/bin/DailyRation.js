const moment = require("moment");
const now = moment();
const SubscribeCard = require("../src/model/application/SubscribeCard");
const SubscribeUser = require("../src/model/application/SubscribeUser");
const SubscribeJobLog = require("../src/model/application/SubscribeJobLog");
const { inventory: Inventory } = require("../src/model/application/Inventory");
const { get } = require("lodash");
const { CustomLogger } = require("../src/util/Logger");
const processKeys = [SubscribeCard.key.month, SubscribeCard.key.season];

async function main() {
  for (const key of processKeys) {
    await handleUser(key);
  }
}

async function handleUser(key) {
  if (![SubscribeCard.key.month, SubscribeCard.key.season].includes(key)) {
    throw new Error("key is not valid");
  }
  const users = await SubscribeUser.getDailyRation({
    key,
    now,
  }).select({ userId: "user_id" });

  if (users.length === 0) {
    CustomLogger.info("No user to handle");
  }

  const userIds = users.map(user => get(user, "userId"));

  const card = await SubscribeCard.first({
    filter: { key },
  });

  if (!card) {
    CustomLogger.error(`No card found for key: ${key}`);
    return;
  }

  const effects = get(card, "effects", []);
  const effect = effects.find(item => item.type === "daily_ration");

  if (!effect) {
    CustomLogger.error("No daily ration effect found");
    return;
  }

  const rewardCount = get(effect, "value", 0);

  if (rewardCount === 0) {
    CustomLogger.error("No reward count found");
    return;
  }

  let type;
  if (key === SubscribeCard.key.month) {
    type = SubscribeJobLog.type.month_daily_ration;
  } else if (key === SubscribeCard.key.season) {
    type = SubscribeJobLog.type.season_daily_ration;
  }

  const usersContext = userIds.map(userId => ({
    userId,
    queries: [
      SubscribeJobLog.knex.insert({
        user_id: userId,
        type,
      }),
      Inventory.knex.insert({
        userId,
        itemId: 999,
        itemAmount: rewardCount,
        note: `${key} daily ration`,
      }),
    ],
  }));

  for (const userContext of usersContext) {
    const { userId, queries } = userContext;

    try {
      await SubscribeJobLog.connection.transaction(async trx => {
        for (const query of queries) {
          await query.transacting(trx);
        }
      });

      CustomLogger.info(`User ${userId} handled`);
    } catch (error) {
      CustomLogger.error(`User ${userId} handle failed`);
      CustomLogger.error(error);
    }
  }
}

module.exports = main;

if (require.main === module) {
  main().then(() => process.exit(0));
}
