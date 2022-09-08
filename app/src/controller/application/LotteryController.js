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
const { generateRuleBubble } = require("../../templates/common");

exports.router = [
  text(/^[.#/](我的樂透|my[-_]?lottery)$/, boughtList),
  text(/^[.#/](買樂透)(?<numbers>(\s\d+)+)$/, buy),
  text(/^[.#/](樂透|lottery)$/, lottery),
  text(/^[.#/](電腦選號)$/, autoBuy),
];

exports.autoBuy = autoBuy;

/**
 * 顯示買樂透資訊
 * @param {import("bottender").LineContext} context
 */
async function boughtList(context) {
  const { userId, displayName, type } = context.event.source;

  if (type !== "user") {
    await context.replyText(i18n.__("message.lottery.bought_list_user_only"));
    return;
  }

  const lottery = await findLatestLottery();

  if (!lottery) {
    await context.replyText(i18n.__("message.lottery.no_holding_event"));
    return;
  }

  const lotteryId = lottery.id;
  const { created_at } = lottery;
  const orders = await lotteryOrderModel.all({
    filter: {
      user_id: userId,
      lottery_main_id: lotteryId,
    },
    limit: 20,
  });

  if (orders.length === 0) {
    await context.replyText(
      i18n.__("message.lottery.no_bought_lottery", {
        displayName,
      })
    );
    return;
  }

  const perPrice = config.get("lottery.price");
  const ticketRows = orders.map((order, index) => {
    const buyType =
      order.buy_type === lotteryOrderModel.buyType.auto
        ? i18n.__("template.lottery_ticket_auto_buy")
        : i18n.__("template.lottery_ticket_manual_buy");
    return lotteryTemplate.generateTicketRow({
      idx: index + 1,
      buyType,
      numbers: order.content.split(","),
      perPrice,
    });
  });

  const bubble = lotteryTemplate.generateTicketBubble({
    id: lotteryId,
    total: orders.length * perPrice,
    rows: ticketRows,
    created_at,
  });

  if (orders.length >= 15) {
    context.replyText(i18n.__("message.lottery.bought_probably_over_limit"));
  }

  await context.replyFlex("布丁大樂透購買記錄", bubble);
}

/**
 * 顯示樂透資訊
 * @param {import("bottender").LineContext} context
 */
async function lottery(context) {
  const lottery = await findLatestLottery();
  const isPublic = get(context, "event.source.type", "group") !== "user";
  const perPrice = config.get("lottery.price");
  const lotteryRate = 1 - config.get("lottery.maintain_tax");

  console.log("isPublic", isPublic);

  if (!lottery) {
    await context.replyText(i18n.__("message.lottery.no_holding_event"));
    return;
  }

  const { id, carryover_money, status, created_at } = lottery;
  const { count = 0 } = await lotteryOrderModel.countByLottery(id);
  // 累計獎金為：購買人數 * 單價 * 營業用途稅率 + 前期累計獎金
  const totalCarryOver = count * perPrice * lotteryRate + carryover_money;

  let result = [];
  if (lottery.result) {
    result = lottery.result.split(",");
  }

  const bubble = lotteryTemplate.generateBoardBubble({
    id,
    result,
    carryOver: totalCarryOver,
    status,
    created_at,
    isPublic,
  });
  const ruleBubble = generateRuleBubble(config.get("lottery.manual"));

  await context.replyFlex("布丁大樂透面板", {
    type: "carousel",
    contents: [bubble, ruleBubble],
  });
}

/**
 * 自動買樂透
 * @param {import("bottender").LineContext} context
 */
async function autoBuy(context) {
  const { type } = context.event.source;

  if (type !== "user") {
    await context.replyText(i18n.__("message.lottery.buy_user_only"));
    return;
  }

  const max = config.get("lottery.max_number");
  const min = config.get("lottery.min_number");
  const allNumbers = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const chosenNumbers = sampleSize(allNumbers, config.get("lottery.max_count")).sort(
    (a, b) => a - b
  );

  if (!context.event.isText) {
    context.replyText(i18n.__("message.lottery.auto_buy_notify"));
  }

  return await buy(context, {
    numbers: chosenNumbers,
    buyType: lotteryOrderModel.buyType.auto,
  });
}

/**
 * 購買選號
 * @param { import("bottender").LineContext } context
 */
async function buy(context, props) {
  const { userId, displayName, type } = context.event.source;

  if (type !== "user") {
    await context.replyText(i18n.__("message.lottery.buy_user_only"));
    return;
  }

  const strNumbers = get(props, "match.groups.numbers", "");
  const buyType = get(props, "buyType", lotteryOrderModel.buyType.manual);

  console.log("buy type: ", buyType);
  console.log(props);

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
      buy_type: buyType,
    });

    await inventoryModel.decreaseGodStone({
      userId,
      amount: price,
      note: "lottery-buy",
    });

    await trx.commit();

    await context.replyText(
      i18n.__("message.lottery.manual_buy.success", {
        displayName,
        numbers: numbers.join(","),
      })
    );
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
