// eslint-disable-next-line no-unused-vars
const { Context, getClient } = require("bottender");
const { text } = require("bottender/router");
const get = require("lodash/get");
const i18n = require("../../util/i18n");
const LineClient = getClient("line");
const minigameTemplate = require("../../templates/application/Minigame");
const JankenRecords = require("../../model/application/JankenRecords");
const JankenResult = require("../../model/application/JankenResult");
const uuid = require("uuid-random");
const redis = require("../../util/redis");
const config = require("config");
const { DefaultLogger } = require("../../util/Logger");

exports.router = [text(/^[.#/](決鬥|duel)/, duel)];

/**
 * 實現決鬥功能，可以與其他人決鬥
 * @param {Context} context
 */
async function duel(context) {
  const { mention } = context.event.message;
  const mentionees = get(mention, "mentionees", []);
  const { groupId, type, displayName, pictureUrl, userId } = context.event.source;

  if (type !== "group") {
    context.replyText(i18n.__("message.duel.only_in_group"));
    return;
  } else if (mentionees.length === 0) {
    await context.replyText(i18n.__("message.duel.usage"));
    return;
  } else if (mentionees.length > 1) {
    await context.replyText(i18n.__("message.duel.too_many_mentions"));
    return;
  }

  const { userId: targetUserId, index, length } = mentionees[0];
  const targetProfile = await LineClient.getGroupMemberProfile(groupId, targetUserId);

  const jankenTitle = (function () {
    // 利用 index, length 將目標使用者的名稱從 message 中移除
    let { text } = context.event.message;
    text = text.substr(0, index) + text.substr(index + length);
    // 再將指令移除
    text = text.replace(/[.#/](決鬥|duel)/g, "").trim();
    return text;
  })();

  const pkBubble = minigameTemplate.generateJanken({
    p1IconUrl: pictureUrl || "https://i.imgur.com/469kcyB.png",
    p2IconUrl: get(targetProfile, "pictureUrl", "https://i.imgur.com/469kcyB.png"),
    p1Uid: userId,
    p2Uid: targetUserId,
    uuid: uuid(),
    title: jankenTitle,
  });

  context.replyText(
    i18n.__("message.duel.start", {
      displayName,
      targetDisplayName: targetProfile.displayName,
    })
  );
  context.replyFlex("猜拳", pkBubble);
}

/**
 * 決定出拳
 * @param {Context} context
 * @param {import("bottender").Props} props
 * @param {Object} props.payload
 */
exports.decide = async (context, { payload }) => {
  const redisPrefix = config.get("redis.keys.jankenDecide");
  const { uuid: recordId, userId, targetUserId } = payload;
  let type = get(payload, "type", "random");
  if (!recordId) {
    return;
  }

  if (![userId, targetUserId].includes(context.event.source.userId)) {
    return;
  }

  const record = await JankenRecords.find(recordId);
  if (record) {
    DefaultLogger.warn(`Janken record ${recordId} already exists`);
    return;
  }

  // 這邊要將選擇『交給命運』的狀況處理
  if (type === "random") {
    type = (function () {
      let types = ["rock", "paper", "scissors"];
      return types[Math.floor(Math.random() * types.length)];
    })();
  }

  DefaultLogger.info(`[Janken] ${context.event.source.userId} decide ${type}`);
  await redis.set(`${redisPrefix}:${recordId}:${context.event.source.userId}`, type, 60 * 60);

  const [p1Decide, p2Decide] = await Promise.all([
    redis.get(`${redisPrefix}:${recordId}:${userId}`),
    redis.get(`${redisPrefix}:${recordId}:${targetUserId}`),
  ]);

  if (!p1Decide || !p2Decide) {
    // 等待雙方出拳
    return;
  }

  const [profile, targetProfile] = await Promise.all([
    LineClient.getGroupMemberProfile(context.event.source.groupId, userId),
    LineClient.getGroupMemberProfile(context.event.source.groupId, targetUserId),
  ]);

  const [p1Result, p2Result] = jankenPlay(p1Decide, p2Decide);
  context.replyText(
    i18n.__("message.duel.result", {
      displayName: get(profile, "displayName", "未知玩家"),
      targetDisplayName: get(targetProfile, "displayName", "未知挑戰者"),
      p1Type: i18n.__(`message.duel.${p1Decide}`),
      p2Type: i18n.__(`message.duel.${p2Decide}`),
    })
  );
  if (p1Result !== "draw") {
    context.replyText(
      i18n.__("message.duel.win_lose", {
        winner: get(p1Result === "win" ? profile : targetProfile, "displayName", "未知玩家"),
      })
    );
  } else {
    context.replyText(i18n.__("message.duel.draw"));
  }

  await JankenRecords.create({
    id: recordId,
    user_id: userId,
    target_user_id: targetUserId,
  });
  await JankenResult.insert([
    {
      record_id: recordId,
      user_id: userId,
      result: get(JankenResult.resultMap, p1Result),
    },
    {
      record_id: recordId,
      user_id: targetUserId,
      result: get(JankenResult.resultMap, p2Result),
    },
  ]);

  await Promise.all([
    redis.del(`${redisPrefix}:${recordId}:${userId}`),
    redis.del(`${redisPrefix}:${recordId}:${targetUserId}`),
  ]);
};

function jankenPlay(p1Decide, p2Decide) {
  const resultMapping = {
    rock: {
      rock: "draw",
      paper: "lose",
      scissors: "win",
    },
    paper: {
      rock: "win",
      paper: "draw",
      scissors: "lose",
    },
    scissors: {
      rock: "lose",
      paper: "win",
      scissors: "draw",
    },
  };

  let p1Result = resultMapping[p1Decide][p2Decide];
  let p2Result = resultMapping[p2Decide][p1Decide];

  return [p1Result, p2Result];
}
