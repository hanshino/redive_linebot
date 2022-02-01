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

exports.router = [
  text(/^[./#]下注 (?<option>\d+) (?<amount>\d+)$/, bet),
  text(/^[./#]下注$/, show),
];
exports.adminRouter = [text(/^[./#]gamble result/, result)];

/**
 * 管理員開獎
 * @param {LineContext} context
 */
async function result(context) {
  const args = minimist(context.event.message.text.split(" "));

  if (args.help || args.h) {
    await context.replyText(i18n.__("message.gamble.result_help"));
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
  ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/);
  ajv.addFormat("time", /^\d{2}:\d{2}$/);

  const schema = {
    type: "object",
    properties: {
      id: {
        type: "integer",
        minimum: 1,
      },
      date: {
        type: "string",
        format: "date",
      },
      start: {
        type: "string",
        format: "time",
      },
      end: {
        type: "string",
        format: "time",
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

  if (args.dispatch) {
    let rate = get(args, "rate", get(args, "r", 1));
    rate = parseFloat(rate);
    await UserGambleOptionModel.dispatchReward({
      id: game.id,
      start: moment(`${data.date} ${data.start}`).toDate(),
      end: moment(`${data.date} ${data.end}`).toDate(),
      options: indexResult,
      rate: rate + 1,
    });
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
      get(targetUserInfo, "total_amount", 0)
    );
  });

  const rows = chunk(optionBoxes, 5).map(chunk => GambleTemplate.generateOptionsRow(chunk));
  const bubble = GambleTemplate.generateGambleGame(rows);

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

  await redis.set(key, game);
  return game;
}

/**
 * 取得遊戲使用者的下注資訊
 */
async function getAllUserInfo() {
  const game = await getHoldingGame();

  const allUserInfo = await UserGambleOptionModel.getAllUserInfo({
    id: game.id,
    start: moment().subtract(1, "hour").toDate(),
    end: moment().toDate(),
  });

  return allUserInfo;
}
