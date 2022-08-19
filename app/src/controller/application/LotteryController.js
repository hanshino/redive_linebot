const { text } = require("bottender/router");
const i18n = require("../../util/i18n");
const { inventory: inventoryModel } = require("../../model/application/Inventory");
const lotteryOrderModel = require("../../model/application/LotteryOrder");
const lotteryModel = require("../../model/application/Lottery");
const lotteryTemplate = require("../../templates/application/Lottery");
const { get, sampleSize } = require("lodash");
const config = require("config");
const redis = require("../../util/redis");
const moment = require("moment");

exports.router = [
  text(/^[.#/](買樂透)(?<numbers>(\s\d+)+)$/, buy),
  text(/^[.#/](樂透|lottery)$/, lottery),
];

/**
 * 顯示樂透資訊
 * @param {import("bottender").LineContext} context
 */
async function lottery(context) {
  const lottery = await findLatestLottery();
  const perPrice = config.get("lottery.price");

  if (!lottery) {
    await context.replyText(i18n.__("message.lottery.no_holding_event"));
    return;
  }

  const { id, carryover_money, status } = lottery;
  const { count = 0 } = await lotteryOrderModel.countByLottery(id);
  const totalCarryOver = count * perPrice + carryover_money;

  let result = [];
  if (lottery.result) {
    result = lottery.result.split(",");
  }

  const bubble = lotteryTemplate.generateBoardBubble({
    id,
    result,
    carryOver: totalCarryOver,
    status,
  });

  await context.replyFlex("布丁大樂透面板", bubble);
}

/**
 * 自動買樂透
 * @param {import("bottender").LineContext} context
 */
exports.autoBuy = async context => {
  const max = config.get("lottery.max_number");
  const min = config.get("lottery.min_number");
  const allNumbers = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const chosenNumbers = sampleSize(allNumbers, config.get("lottery.max_count")).sort(
    (a, b) => a - b
  );

  return await buy(context, {
    numbers: chosenNumbers,
  });
};

/**
 * 購買選號
 * @param { import("bottender").LineContext } context
 */
async function buy(context, props) {
  const { userId } = context.event.source;
  const strNumbers = get(props, "match.groups.numbers", "");
  // 選擇使用 props 內的 numbers 或者是 context.event.message.text
  const numbers =
    get(props, "numbers") ||
    strNumbers
      .trim()
      .split(/\s+/)
      .map(strNum => parseInt(strNum))
      .sort((a, b) => a - b);
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

  const latestLottery = await findLatestLottery();
  if (!latestLottery || latestLottery.status !== lotteryModel.status.selling) {
    await context.replyText(i18n.__("message.lottery.manual_buy.error_no_lottery"));
    return;
  }

  const trx = await lotteryOrderModel.trxProvider();
  try {
    lotteryOrderModel.setTransaction(trx);
    inventoryModel.setTransaction(trx);

    await lotteryOrderModel.create({
      lottery_main_id: latestLottery.id,
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

async function findLatestLottery() {
  // 確保每一分鐘都是及時的資料
  const redisKey = [config.get("redis.keys.holding_lottery"), ":", moment().format("Hm")].join("");
  console.log("use redis key: ", redisKey);
  const holdingLottery = await redis.get(redisKey);
  if (holdingLottery) {
    console.log("data in cache");
    return JSON.parse(holdingLottery);
  }

  const lottery = await lotteryModel.first({
    order: [
      {
        column: "created_at",
        direction: "desc",
      },
    ],
  });

  if (lottery) {
    await redis.set(redisKey, JSON.stringify(lottery), {
      ex: 60,
    });
    return lottery;
  }

  return null;
}
