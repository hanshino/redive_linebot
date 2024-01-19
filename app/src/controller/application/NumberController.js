const { text } = require("bottender/router");
const { sample, get } = require("lodash");
const NumberTemplate = require("../../templates/application/Number");
const i18n = require("../../util/i18n");

exports.router = [
  text(/^[.#/](猜大小) (?<chips>\d{1,7})$/, privateSicBoHolding),
  text(/^[.#/](猜) (?<option>\S+) (?<chips>\d{1,7})$/, userDecide),
];

const optionMapping = {
  big: ["大"],
  small: ["小"],
  double: ["兩顆"],
  triple: ["三顆"],
};

exports.postbackDecide = async (context, { payload }) => {
  const { option, chips } = payload;
  await userDecide(context, { match: { groups: { option: optionMapping[option][0], chips } } });
};

/**
 * Searches for an option in the optionMapping object and returns the corresponding key.
 * @param {string} option - The option to search for.
 * @returns {string} - The corresponding key for the option, or null if not found.
 */
function searchOption(option) {
  return Object.keys(optionMapping).find(key => optionMapping[key].includes(option));
}

/**
 * Handles the user's decision in a game.
 * @param {Object} context - The context object.
 * @param {Object} props - The props object containing the user's decision.
 * @param {string} props.option - The user's selected option.
 * @param {string} props.chips - The amount of chips the user has bet.
 * @returns {Promise<void>} - A promise that resolves when the function is done.
 */
async function userDecide(context, props) {
  const { option, chips } = props.match.groups;
  const quoteToken = get(context, "event.message.quoteToken");

  const key = searchOption(option);
  if (!key) {
    await context.replyText("請選擇正確的選項，例如：大、小、雙、三", { quoteToken });
    return;
  }

  if (!chips) {
    await context.replyText("請先下注", { quoteToken });
    return;
  }

  const dice = rollDice(3);
  const sum = dice.reduce((acc, cur) => acc + cur, 0);
  const isSmall = sum >= 3 && sum <= 10;
  const isBig = sum >= 11 && sum <= 18;
  const isDouble = dice[0] === dice[1] || dice[0] === dice[2] || dice[1] === dice[2];
  const isTriple = dice[0] === dice[1] && dice[0] === dice[2];

  let result = false;
  switch (key) {
    case "big":
      result = isBig;
      break;
    case "small":
      result = isSmall;
      break;
    case "double":
      result = isDouble;
      break;
    case "triple":
      result = isTriple;
      break;
  }

  let payout = 1;
  if (result) {
    switch (key) {
      case "big":
      case "small":
        payout += 1;
        break;
      case "double":
        payout += 8;
        break;
      case "triple":
        payout += 180;
        break;
    }
  }

  const messages = [
    i18n.__("message.gamble.sic_bo_rolled", {
      dice1: dice[0],
      dice2: dice[1],
      dice3: dice[2],
      sum,
    }),
  ];

  const total = parseInt(chips) * payout;
  if (result) {
    messages.push(i18n.__("message.gamble.sic_bo_win", { option, chips, payout, total }));
  } else {
    messages.push(i18n.__("message.gamble.sic_bo_lose", { option, chips }));
  }

  const replyOption = {};
  if (quoteToken) {
    replyOption.quoteToken = quoteToken;
  }
  await context.replyText(messages.join("\n"), replyOption);
}

/**
 * Handles the private Sic Bo holding logic.
 *
 * @param {import("bottender").LineContext} context - The context object.
 * @param {import("bottender").Props} props - The props object.
 * @returns {Promise<void>} - A promise that resolves when the logic is handled.
 */
async function privateSicBoHolding(context, props) {
  const { chips } = props.match.groups;
  await context.replyFlex("猜大小", NumberTemplate.generatePanel({ chips }));
}

/**
 * Rolls a dice a specified number of times.
 * @param {number} times - The number of times to roll the dice.
 * @returns {number[]} - An array containing the results of each dice roll.
 */
function rollDice(times) {
  const dice = [1, 2, 3, 4, 5, 6];
  const result = [];
  for (let i = 0; i < times; i++) {
    result.push(sample(dice));
  }
  return result;
}
