// eslint-disable-next-line no-unused-vars
const { LineContext } = require("bottender");
const { text } = require("bottender/router");
const GambleGameModel = require("../../model/application/GambleGame");
const UserGambleOptionModel = require("../../model/application/UserGambleOption");
const redis = require("../../util/redis");
const config = require("config");
const moment = require("moment");
const i18n = require("../../util/i18n");

exports.router = [text(/[./#]下注 (?<option>\d+) (?<amount>\d+)/, bet)];

/**
 * 下注
 * @param {LineContext} context
 */
async function bet(context, props) {
  const game = await getHoldingGame();

  if (!game) {
    await context.replyText(i18n.t("message.gamble.no_game"));
    return;
  }

  const { option, amount } = props.match.groups;
  console.log(option, amount);
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
