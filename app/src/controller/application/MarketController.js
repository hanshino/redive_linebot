const { text } = require("../../lib/bot");
const { get } = require("lodash");
const i18n = require("../../util/i18n");
const { trimMentionees, getMentionName } = require("../../util/line");
const { removeOrder, isLineUserId } = require("../../util/string");
const { inventory: inventoryModel } = require("../../model/application/Inventory");
const marketTemplate = require("../../templates/application/Market");
const uuid = require("uuid-random");
const humanNumber = require("human-number");
const redis = require("../../util/redis");
const config = require("config");
const { DefaultLogger } = require("../../util/Logger");
const AchievementEngine = require("../../service/AchievementEngine");
const { notifyUnlocks } = require("../../service/achievementNotifier");

exports.router = [
  text(/^[./#](轉帳|atm)/i, transferMoney),
  text(/^[./#](快速轉帳|fastatm)/i, doFastTransfer),
];

async function transferMoney(context) {
  const { text: rawText } = context.event.message;
  const { userId, displayName } = context.event.source;
  const mentionees = get(context.event.message, "mention.mentionees", []);
  const trimText = trimMentionees(rawText, mentionees);
  const param = removeOrder(trimText);

  if (mentionees.length !== 1) {
    return context.replyText(i18n.__("message.trade.mention_invalid"));
  }

  const targetId = get(mentionees, "0.userId");
  if (param.length === 0 || !isMoneyParam(param)) {
    return context.replyText(i18n.__("message.trade.transfer_money_invalid"));
  }

  if (!isLineUserId(targetId)) {
    return context.replyText(i18n.__("message.trade.mention_invalid"));
  }

  const { amount } = await inventoryModel.getUserMoney(userId);
  const ownMoney = parseInt(amount);
  const transferMoney = parseInt(param);

  if (transferMoney > ownMoney) {
    return context.replyText(i18n.__("message.trade.transfer_money_not_enough"));
  }

  const targetUserName = getMentionName(rawText, get(mentionees, "0"));
  const transferId = uuid();
  const orderBubble = marketTemplate.generateTransferOrderBubble({
    sourceName: displayName,
    sourceId: userId,
    targetName: targetUserName,
    targetId,
    amount: humanNumber(transferMoney),
    transferId,
  });

  await setTransfer({
    sourceId: userId,
    targetId,
    amount: transferMoney,
    transferId,
    targetName: targetUserName,
  });
  context.replyText(
    i18n.__("message.trade.transfer_money_established", {
      time: config.get("trade.transfer_countdown") + "秒",
      displayName,
    })
  );
  context.replyFlex(
    `轉帳申請：${displayName} → ${targetUserName} ${humanNumber(transferMoney)} 女神石`,
    orderBubble
  );
}

/**
 * 檢查是否為金額參數，目前限定為整數並且最小值為1，最大單位為百萬
 * @param {String} param
 * @returns {Boolean}
 */
function isMoneyParam(param) {
  return /^[1-9]\d{0,6}$/.test(param);
}

/**
 * 進行快速轉帳
 * @param {import("../../lib/bot").LineContext} context
 */
function doFastTransfer(context) {
  const { userId } = context.event.source;
  const { text: rawText } = context.event.message;
  const mentionees = get(context.event.message, "mention.mentionees", []);
  const trimText = trimMentionees(rawText, mentionees);

  if (mentionees.length !== 1) {
    return context.replyText(i18n.__("message.trade.mention_invalid"));
  }

  const targetId = get(mentionees, "0.userId");
  const targetUserName = getMentionName(rawText, get(mentionees, "0"));
  const param = removeOrder(trimText);

  if (param.length === 0 || !isMoneyParam(param)) {
    return context.replyText(i18n.__("message.trade.transfer_money_invalid"));
  }

  if (!isLineUserId(targetId)) {
    return context.replyText(i18n.__("message.trade.mention_invalid"));
  }

  const transferMoney = parseInt(param);

  const transferId = uuid();
  setTransfer({
    sourceId: userId,
    targetId,
    amount: transferMoney,
    transferId,
    targetName: targetUserName,
  });

  const payload = {
    transferId,
  };
  doTransfer(context, {
    payload,
  });
}

/**
 * 確定交易
 * @param {import ("../../lib/bot").LineContext} context
 */
const doTransfer = async (context, { payload }) => {
  const { transferId } = payload;
  const data = await getTransfer(transferId);

  if (!data) {
    DefaultLogger.warn(`Transfer ${transferId} not found`);
    return;
  }

  const { sourceId, targetId, amount, targetName } = data;
  const { userId, displayName } = context.event.source;

  // 非本人進行轉帳確認
  if (userId !== sourceId) {
    return;
  }

  const { amount: ownMoney } = await inventoryModel.getUserMoney(userId);
  if (amount > parseInt(ownMoney)) {
    // 餘額不足，刪除此次轉帳交易
    removeTransfer(transferId);
    return context.replyText(i18n.__("message.trade.transfer_money_not_enough"));
  }

  const result = await inventoryModel.transferGodStone({
    sourceId,
    targetId,
    amount,
  });

  if (!result) {
    return context.replyText(i18n.__("message.trade.transfer_money_failed"));
  }

  removeTransfer(transferId);
  const { unlocked } = await AchievementEngine.evaluate(sourceId, "atm_transfer", { amount }).catch(
    () => ({ unlocked: [] })
  );
  await notifyUnlocks(context, sourceId, unlocked);
  context.replyText(
    i18n.__("message.trade.transfer_money_success", {
      displayName,
      targetDisplayName: targetName,
      amount: humanNumber(amount),
    })
  );
  DefaultLogger.info(
    `Transfer ${transferId} success. Source: ${sourceId}, Target: ${targetId}, Amount: ${amount}`
  );
};

exports.doTransfer = doTransfer;

function setTransfer({ sourceId, targetId, amount, transferId, targetName }) {
  return redis.set(
    getTransferRedisKey(transferId),
    JSON.stringify({ sourceId, targetId, amount, targetName }),
    {
      EX: config.get("trade.transfer_countdown"),
    }
  );
}

async function getTransfer(transferId) {
  const result = await redis.get(getTransferRedisKey(transferId));
  return result ? JSON.parse(result) : null;
}

function removeTransfer(transferId) {
  return redis.del(getTransferRedisKey(transferId));
}

function getTransferRedisKey(transferId) {
  return `${config.get("redis.prefix.atm")}:${transferId}`;
}
