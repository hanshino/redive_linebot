// eslint-disable-next-line no-unused-vars
const { LineContext } = require("bottender");
const { text } = require("bottender/router");
const GambleGameModel = require("../../model/application/GambleGame");
const UserGambleOptionModel = require("../../model/application/UserGambleOption");
const redis = require("../../util/redis");
const config = require("config");
const moment = require("moment");
const i18n = require("../../util/i18n");
const { inventory: InventoryModel } = require("../../model/application/Inventory");
const { get, chunk, sampleSize } = require("lodash");
const { DefaultLogger } = require("../../util/Logger");
const CharacterService = require("../../service/CharacterService");
const GambleTemplate = require("../../templates/application/Gamble");
const GameSqlite = require("../../model/princess/GameSqlite");
const minimist = require("minimist");
const Ajv = require("ajv");
const humanNumber = require("human-number");

exports.router = [
  text(/^[./#]下注 (?<option>\d+) (?<amount>\d+)$/, bet),
  text(/^[./#]下注$/, show),
];
exports.adminRouter = [
  text(/^[./#]gamble result/, result),
  text(/^[./]gamble add/, adminAdd),
  text(/^[./]gamble now$/, adminNow),
];

/**
 * 管理員指令 - 正在舉辦的遊戲
 * @example /gamble now
 * @param {LineContext} context
 */
async function adminNow(context) {
  const game = await getHoldingGame();
  context.replyText(i18n.__("message.gamble.admin_now", game));
}

/**
 * 管理員指令 - 新增遊戲
 * @example /gamble add 測試 -r --end 2022-02-20,23:59:59
 * @param {LineContext} context
 */
async function adminAdd(context) {
  const args = minimist(context.event.message.text.split(" "));
  const messageLines = [];

  if (args.help || args.h) {
    await context.replyText(i18n.__("message.gamble.add_help"));
    return;
  }

  const data = {
    name: get(args, "_[2]"),
    start: get(args, "start", get(args, "s")),
    end: get(args, "end", get(args, "e")),
    prize: get(args, "prize", get(args, "p")),
  };

  const ajv = new Ajv();
  ajv.addFormat("datetime", /^\d{4}-\d{2}-\d{2},\d{2}:\d{2}:\d{2}$/);
  // unitId: 100101,100101,100101
  ajv.addFormat("unitIds", /^\d{6}(,\d{6})*$/);

  const schema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 20,
      },
      start: {
        type: "string",
        format: "datetime",
      },
      end: {
        type: "string",
        format: "datetime",
      },
      prize: {
        type: "string",
        format: "unitIds",
      },
    },
    required: ["name"],
  };

  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (!valid) {
    await context.replyText(i18n.__("message.gamble.add_help"));
    DefaultLogger.error(validate.errors);
    return;
  }

  if (!data.prize && !args.random && !args.r) {
    return await context.replyText(i18n.__("message.gamble.add_prize_required"));
  }

  messageLines.push(i18n.__("message.gamble.add_name_analyze_success", { name: data.name }));

  if (data.prize && data.prize.length === 10) {
    data.prize = data.prize.split(",").map(unitId => ({ unitId: parseInt(unitId) }));
    messageLines.push(i18n.__("message.gamble.add_prize_analyze_success"));
  } else {
    let unitIds = (await GameSqlite("unit_profile").select("unit_id")).map(unit => unit.unit_id);
    data.prize = sampleSize(unitIds, 10).map(unitId => ({ unitId: parseInt(unitId) }));
    messageLines.push(i18n.__("message.gamble.add_prize_analyze_failed"));
  }

  if (!data.start) {
    data.start = moment().add(1, "minute").toDate();
    messageLines.push(i18n.__("message.gamble.add_start_now"));
  } else {
    data.start = moment(data.start, "YYYY-MM-DD,HH:mm:ss").toDate();
    messageLines.push(i18n.__("message.gamble.add_start_analyze_success"));
  }

  if (!data.end) {
    data.end = moment(data.start).add(1, "hour").toDate();
    messageLines.push(i18n.__("message.gamble.add_end_now"));
  } else {
    data.end = moment(data.end, "YYYY-MM-DD,HH:mm:ss").toDate();
    messageLines.push(i18n.__("message.gamble.add_end_analyze_success"));
  }

  await GambleGameModel.create({
    ...data,
    type: "gamble",
    options: JSON.stringify(data.prize),
    start_at: data.start,
    end_at: data.end,
  });

  await context.replyText(messageLines.join("\n"));
}

/**
 * 管理員開獎
 * @example /gamble result -i 5 --number 3 --dispatch --rate 1.5
 * @param {LineContext} context
 */
async function result(context) {
  const args = minimist(context.event.message.text.split(" "));

  if (args.help || args.h) {
    await context.replyText(i18n.__("message.gamble.result_usage"));
    return;
  }

  const data = {
    id: get(args, "id", get(args, "i", null)),
    date: get(args, "date", get(args, "d", null)),
    start: get(args, "start", get(args, "s", null)),
    end: get(args, "end", get(args, "e", null)),
    number: get(args, "number", get(args, "n", null)),
  };

  const ajv = new Ajv();

  const schema = {
    type: "object",
    properties: {
      id: {
        type: "integer",
        minimum: 1,
      },
      number: {
        type: "integer",
        minimum: 1,
      },
      rate: {
        type: "integer",
        minimum: 1,
      },
    },
    required: ["id", "date", "start", "end", "number"],
  };

  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (!valid) {
    await context.replyText(i18n.__("message.gamble.result_usage"));
    DefaultLogger.error(validate.errors);
    return;
  }

  const game = await GambleGameModel.find(data.id);

  if (!game) {
    await context.replyText(i18n.__("message.gamble.no_game"));
    return;
  }

  const options = get(game, "options", []);

  const pickOption = sampleSize(options, get(data, "number")).map(option => option.unitId);
  const indexResult = [];

  options.forEach((option, index) => {
    if (pickOption.includes(option.unitId)) {
      indexResult.push(index + 1);
    }
  });

  const names = (
    await GameSqlite("unit_profile").select("unit_name").whereIn("unit_id", pickOption)
  ).map(item => item.unit_name);

  if (args.dispatch || args.d) {
    let rate = get(args, "rate", get(args, "r", 1));
    rate = parseFloat(rate);
    await UserGambleOptionModel.dispatchReward({
      id: game.id,
      options: indexResult,
      rate: rate + 1,
    });

    await GambleGameModel.update(data.id, {
      end_at: moment().subtract(1, "minute").toDate(),
    });
    purgeGame();
  } else {
    context.replyText(i18n.__("message.gamble.simulate_result"));
  }

  context.replyText(
    i18n.__("message.gamble.result", {
      time: moment().format("YYYY-MM-DD HH:mm:ss"),
      start: get(data, "start"),
      end: get(data, "end"),
      prize: names.join(", "),
    })
  );

  context.replyText(JSON.stringify(indexResult));
}

/**
 * 顯示下注選項
 * @param {LineContext} context
 */
async function show(context) {
  const game = await getHoldingGame();

  if (!game) {
    await context.replyText(i18n.__("message.gamble.no_game"));
    return;
  }

  const allUserInfo = await getAllUserInfo();
  const allAmount = allUserInfo.reduce(
    (acc, cur) => acc + parseInt(get(cur, "total_amount", 0)),
    0
  );

  const options = get(game, "options", []);
  const optionBoxes = options.map((option, index) => {
    const targetUserInfo = allUserInfo.find(userInfo => parseInt(userInfo.option) === index + 1);
    const amountPercentage =
      Math.round((parseInt(get(targetUserInfo, "total_amount", 0)) / allAmount) * 100) || 0;

    return GambleTemplate.generateOptionBox(
      index + 1,
      i18n.__("princess.wiki.unit", {
        unitId: CharacterService.changeRarity(option.unitId, 3),
      }),
      amountPercentage,
      humanNumber(get(targetUserInfo, "total_amount", 0))
    );
  });

  const rows = chunk(optionBoxes, 5).map(chunk => GambleTemplate.generateOptionsRow(chunk));
  const bubble = GambleTemplate.generateGambleGame(game.name, rows);

  await context.replyFlex("下注盤", bubble);
}

/**
 * 下注
 * @param {LineContext} context
 */
async function bet(context, props) {
  const game = await getHoldingGame();
  const { userId } = context.event.source;

  if (!game) {
    await context.replyText(i18n.__("message.gamble.no_game"));
    return;
  }

  const { option, amount } = props.match.groups;

  const availableOptions = get(game, "options", []);

  if (parseInt(option) > availableOptions.length) {
    await context.replyText(i18n.__("message.gamble.invalid_option"));
    return;
  }

  const usedCoins = parseInt(amount);
  const sumResult = await InventoryModel.getUserOwnCountByItemId(userId, 999);
  const ownStones = parseInt(get(sumResult, "amount", 0));

  if (usedCoins > ownStones) {
    await context.replyText(i18n.__("message.gamble.not_enough_coins"));
    return;
  }

  const trx = await InventoryModel.transaction();
  try {
    UserGambleOptionModel.setTransaction(trx);

    await UserGambleOptionModel.create({
      user_id: userId,
      gamble_game_id: game.id,
      option,
      amount: usedCoins,
    });

    await InventoryModel.create({
      userId,
      itemId: 999,
      itemAmount: -usedCoins,
    });
  } catch (e) {
    trx.rollback();
    DefaultLogger.error(e);
    await context.replyText(i18n.__("message.gamble.bet_failed"));
    return;
  }

  trx.commit();

  await context.replyText(
    i18n.__("message.gamble.bet_success", {
      displayName: context.event.source.displayName,
      amount: usedCoins,
    })
  );
}

async function getHoldingGame() {
  const key = config.get("redis.keys.gamebleGame");
  const data = await redis.get(key);
  if (data) {
    return data;
  }

  // 獲取正在進行的遊戲
  const game = await GambleGameModel.first({
    filter: {
      start_at: {
        operator: "<",
        value: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      end_at: {
        operator: ">",
        value: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
    },
  });

  if (!game) {
    return;
  }

  await redis.set(key, game, 60);
  return game;
}

function purgeGame() {
  const key = config.get("redis.keys.gamebleGame");
  return redis.del(key);
}

/**
 * 取得遊戲使用者的下注資訊
 */
async function getAllUserInfo() {
  const game = await getHoldingGame();
  const allUserInfo = await UserGambleOptionModel.getAllUserInfo(game.id);

  return allUserInfo;
}
