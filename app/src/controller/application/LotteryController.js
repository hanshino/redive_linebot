const { text } = require("bottender/router");
const i18n = require("../../util/i18n");
const { inventory: inventoryModel } = require("../../model/application/Inventory");
const lotteryOrderModel = require("../../model/application/LotteryOrder");
const lotteryModel = require("../../model/application/Lottery");
const { get } = require("lodash");
const config = require("config");
const redis = require("../../util/redis");
const moment = require("moment");

exports.router = [text(/^[.#/](買樂透)(?<numbers>(\s\d+)+)$/, manualBuy)];

/**
 * 人工選號
 * @param { import("bottender").LineContext } context
 */
async function manualBuy(context, props) {
  const { userId } = context.event.source;
  const { numbers: strNumbers = "" } = get(props, "match.groups");
  const numbers = strNumbers
    .trim()
    .split(/\s+/)
    .map(strNum => parseInt(strNum));
  const limitCount = config.get("lottery.max_count");

  // 個數檢查
  if (isValidLength(numbers) === false) {
    await context.replyText(
      i18n.__("message.lottery.manual_buy.error_count", {
        max_count: limitCount,
      })
    );
    return;
  }

  // 重複檢查
  if (isRepeat(numbers) === true) {
    await context.replyText(i18n.__("message.lottery.manual_buy.error_repeat_number"));
    return;
  }

  // 數字檢查
  if (isAllValidNumber(numbers) === false) {
    await context.replyText(i18n.__("message.lottery.manual_buy.error_number_range"));
    return;
  }

  const { amount = 0 } = await inventoryModel.getUserMoney(userId);
  const price = config.get("lottery.price");
  const ownMoney = parseInt(amount);

  if (ownMoney < price) {
    await context.replyText(i18n.__("message.lottery.manual_buy.error_not_enough_money"));
    return;
  }

  const holdingLottery = await findHoldingLottery();
  if (!holdingLottery) {
    await context.replyText(i18n.__("message.lottery.manual_buy.error_no_lottery"));
    return;
  }

  const trx = await lotteryOrderModel.trxProvider();
  try {
    lotteryOrderModel.setTransaction(trx);
    inventoryModel.setTransaction(trx);

    await lotteryOrderModel.create({
      lottery_main_id: holdingLottery.id,
      user_id: userId,
      content: numbers.join(","),
    });

    await inventoryModel.decreaseGodStone({
      userId,
      amount: price,
    });

    await trx.commit();

    await context.replyText(i18n.__("message.lottery.manual_buy.success"));
  } catch (e) {
    await trx.rollback();
    console.error(e);
    await context.replyText(
      i18n.__("message.lottery.manual_buy.error", {
        userId,
      })
    );
  }
}

function isValidLength(numbers) {
  const limitCount = config.get("lottery.max_count");
  return numbers.length === limitCount;
}

function isRepeat(numbers) {
  const unique = new Set(numbers);
  return unique.size !== numbers.length;
}

function isAllValidNumber(numbers) {
  const maxNumber = config.get("lottery.max_number");
  const minNumber = config.get("lottery.min_number");
  return numbers.every(num => num >= minNumber && num <= maxNumber);
}

async function findHoldingLottery() {
  // 確保每一分鐘都是及時的資料
  const redisKey = [config.get("redis.keys.holding_lottery"), ":", moment().format("Hm")].join("");
  console.log("use redis key: ", redisKey);
  const holdingLottery = await redis.get(redisKey);
  if (holdingLottery) {
    console.log("data in cache");
    return JSON.parse(holdingLottery);
  }

  const lottery = await lotteryModel.first({
    filter: {
      status: lotteryModel.status.selling,
    },
  });

  if (lottery) {
    await redis.set(redisKey, JSON.stringify(lottery), {
      ex: 60,
    });
    return lottery;
  }

  return null;
}
