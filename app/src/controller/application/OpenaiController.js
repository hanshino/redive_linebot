const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.CHATGPT_API_KEY,
});
const openai = new OpenAIApi(configuration);
const { get } = require("lodash");
const redis = require("../../util/redis");

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

  const isQAText = isAskingQuestion(text);
  const isFriendChatText = isTalkingToFriendChat(text);
  if (!isQAText && !isFriendChatText) {
    return next;
  }

  // 檢查是否可以使用 AI 功能, 這是避免被濫用
  const isAbleToUse = await isAbleToUseAIFeature();
  if (!isAbleToUse) {
    return next;
  }

  let result;
  let option;
  if (isQAText) {
    const question = text.replace("布丁大神", "").replace("?", "");
    option = makeQAOption(question);
  } else if (isFriendChatText) {
    const question = text.replace("布丁", "");
    option = makeFriendChatOption(question);
  }

  const { choices } = await fetchFromOpenAI(option);
  result = choices;

  const { finish_reason } = get(result, "0", {});
  result = finish_reason === "stop" ? result[0].text.trim() : "窩不知道( ˘•ω•˘ )◞";
  await context.replyText(result);
};

/**
 * 檢查是否在詢問問題
 * @param {String} text
 * @returns {Boolean}
 */
function isAskingQuestion(text) {
  const isEndWithQuestionMark = text.endsWith("?") || text.endsWith("？");
  const isContainAskingToBot = text.includes("布丁大神");
  return isEndWithQuestionMark && isContainAskingToBot;
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
  prompt: `${context}\n用戶:${question}`,
  temperature: 0,
});

const makeFriendChatOption = (question, context = "") => ({
  ...defaultOption,
  prompt: `${context}\n用戶:${question}\n小助理:`,
  temperature: 0.5,
  max_tokens: 500,
  frequency_penalty: 0.5,
});

async function fetchFromOpenAI(option) {
  const { data } = await openai.createCompletion(option);
  return data;
}
