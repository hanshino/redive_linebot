const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.CHATGPT_API_KEY,
});
const openai = new OpenAIApi(configuration);
const { get, concat } = require("lodash");
const redis = require("../../util/redis");
const { format } = require("util");
const config = require("config");
const groupSessionKeyTemplate = config.get("redis.keys.groupSession");

/**
 * 自然言語理解
 * @param {import("bottender").LineContext} context
 */
exports.naturalLanguageUnderstanding = async function (context, { next }) {
  // 只處理文字訊息
  if (!context.event.isText) {
    return next;
  }
  const { text } = context.event.message;

  // 不處理太長的文字訊息
  if (text.length > 1000) {
    return next;
  }

  const sourceType = get(context, "event.source.type");
  const sourceId = get(context, `event.source.${sourceType}Id`);
  const displayName = get(context, "event.source.displayName");

  const isNotDev = process.env.NODE_ENV !== "development";
  const isNotPuddingGroup =
    sourceType !== "group" || sourceId !== "C686ad6e801927000dc06a074224ca3c0";
  if (isNotDev && isNotPuddingGroup) {
    // 暫時只服務於布丁大神的群組
    return next;
  }

  const question = text.replace(/(布丁大神|布丁)/, "").trim();
  await recordSession(sourceId, `${displayName}:${question}`);
  const chatSession = await getSession(sourceId);

  const isQAText = isAskingQuestion(text);
  const isFriendChatText = isTalkingToFriendChat(text);
  if (!isQAText && !isFriendChatText) {
    return next;
  }

  // 檢查是否可以使用 AI 功能, 這是避免被濫用
  const isAbleToUse = await isAbleToUseAIFeature();
  if (!isAbleToUse) {
    await context.quoteReply("窩太累了，等等再問我吧( ˘•ω•˘ )◞");
    return;
  }

  let result;
  let option;
  if (isQAText) {
    option = makeQAOption(`${displayName}: ${question}`, chatSession.join("\n"));
  } else if (isFriendChatText) {
    option = makeFriendChatOption(`${displayName}: ${question}`, chatSession.join("\n"));
  }

  const { choices } = await fetchFromOpenAI(option);
  result = choices;

  const { finish_reason } = get(result, "0", {});
  result = finish_reason === "stop" ? result[0].text.trim() : "窩不知道( ˘•ω•˘ )◞";
  await recordSession(sourceId, `小助理:${result}`);
  await context.quoteReply(result);
};

/**
 * 檢查是否在詢問問題
 * @param {String} text
 * @returns {Boolean}
 */
function isAskingQuestion(text) {
  const isContainAskingToBot = /^布丁大神[,，\s]/.test(text);
  return isContainAskingToBot;
}

/**
 * 檢查是否在跟好友聊天
 * @param {String} text
 * @returns {Boolean}
 */
function isTalkingToFriendChat(text) {
  const isContainAskingToBot = /^布丁[,，\s]/.test(text);
  return isContainAskingToBot;
}

/**
 * 紀錄對話
 * @param {String} groupId
 * @param {String|Array} text
 */
async function recordSession(groupId, text) {
  const sessionKey = format(groupSessionKeyTemplate, groupId);
  await redis.rPush(sessionKey, concat([], text));
  // 保留最近 40 則訊息
  await redis.lTrim(sessionKey, -40, -1);
}

async function getSession(groupId) {
  const sessionKey = format(groupSessionKeyTemplate, groupId);
  const session = await redis.lRange(sessionKey, 0, 20);
  return session;
}

async function isAbleToUseAIFeature() {
  const key = "openai:cooldown";
  const cooldown = 10;

  const isSet = await redis.set(key, 1, {
    EX: cooldown,
    NX: true,
  });

  return isSet;
}

const defaultOption = {
  model: "text-davinci-003",
  temperature: 0.9,
  max_tokens: 2000,
  top_p: 1,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  stop: ["用戶:"],
};

const makeQAOption = (question, context = "") => ({
  ...defaultOption,
  prompt: `${context}\n${question}\n小助理:`,
  temperature: 0,
});

const makeFriendChatOption = (question, context = "") => ({
  ...defaultOption,
  prompt: `${context}\n${question}\n小助理:`,
  temperature: 0.5,
  max_tokens: 500,
  frequency_penalty: 0.5,
});

async function fetchFromOpenAI(option) {
  const { data } = await openai.createCompletion(option);
  return data;
}
