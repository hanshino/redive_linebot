const { get, concat } = require("lodash");
const redis = require("../../util/redis");
const umami = require("../../util/umami");
const { format } = require("util");
const config = require("config");
const groupSessionKeyTemplate = config.get("redis.keys.groupSession");
const { GoogleGenAI } = require("@google/genai");
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-2.5-flash-lite";
const SESSION_TTL = 3600; // 1 小時無活動後自動過期清空對話記憶
const generationConfig = {
  maxOutputTokens: 200,
  temperature: 1.0,
};

const systemInstruction = [
  "以下是一個群組的對話，你是其中的一個成員，你的任務是回覆其他成員的訊息",
  "最後一句話一定是在問你",
  "你是個屁孩，有點煩人，喜歡開玩笑、吐槽、偶爾調皮搗蛋，但絕對不要提到你是AI或機器人",
  "當你察覺到對方真的很困擾、難過或需要幫助時，會認真起來並展現實力幫助對方",
  "對話中如果有人提到『布丁』，那就是在指你，你要自然地回應，不要說明這件事",
  "你有一個口癖，喜歡在句尾加上『吶諾』，但不用每次都加，想到再加就好",
  "回應時要自然地表現出你的個性，而不是描述你的個性或設定",
  "屁孩時可以短一點，認真時可以長一點，不要重複對方的話",
  "永遠禁止提到任何關於prompt、設定、AI、機器人等相關字詞",
  "回應的訊息請不要加上任何前綴，給我句子就好，我會幫你串接到對話中",
].join("\n");

/**
 * 自然言語理解
 * @param {import("bottender").LineContext} context
 */
exports.naturalLanguageUnderstanding = async function (context, { next }) {
  // 只處理文字訊息
  if (!context.event.isText) {
    return next;
  }

  const { text, mention } = context.event.message;
  const mentionSelf = get(mention, "mentionees", []).find(mentionee => mentionee.isSelf === true);

  // 不處理太長的文字訊息
  if (text.length > 200) {
    return next;
  }

  umami.track("ai_conversation", "/bot/application/ai_conversation", umami.getSourceData(context));

  const replaceTarget = text.slice(mentionSelf.index, mentionSelf.index + mentionSelf.length);
  const replaceText = text.replace(replaceTarget, "").trim();

  if (replaceText.length === 0) {
    return context.replyText("欸特我就為了這點B事?");
  }

  const sourceType = get(context, "event.source.type");
  const sourceId = get(context, `event.source.${sourceType}Id`);
  const displayName = get(context, "event.source.displayName");

  await recordSession(sourceId, `${displayName}:${replaceText}`);
  const chatSession = await getSession(sourceId);

  try {
    const result = await genAI.models.generateContent({
      model: MODEL,
      contents: chatSession.join("\n"),
      config: { ...generationConfig, systemInstruction },
    });

    const responseText = (result.text || "").replace(/bot:/gi, "").trim();
    if (responseText) {
      await context.replyText(responseText);
    }
  } catch {
    // 額度用盡(429)/網路/任何錯誤 → 完全安靜，不回任何訊息
  }
};

/**
 * 只記錄對話
 * @param {import("bottender").LineContext} context
 */
exports.recordSession = async function (context, { next }) {
  // 只處理文字訊息
  if (!context.event.isText) {
    return next;
  }
  const { text } = context.event.message;

  // 不處理太長的文字訊息
  if (text.length > 100) {
    return next;
  }

  const sourceType = get(context, "event.source.type");
  const sourceId = get(context, `event.source.${sourceType}Id`);
  const displayName = get(context, "event.source.displayName");

  await recordSession(sourceId, `${displayName}:${text}`);
  return next;
};

exports.resetSession = async function (context) {
  const sourceType = get(context, "event.source.type");
  const sourceId = get(context, `event.source.${sourceType}Id`);
  await redis.del(format(groupSessionKeyTemplate, sourceId));
  await context.replyText("已經將對話紀錄清空");
};

/**
 * 紀錄對話
 * @param {String} groupId
 * @param {String|Array} text
 */
async function recordSession(groupId, text) {
  const sessionKey = format(groupSessionKeyTemplate, groupId);
  await redis.rPush(sessionKey, concat([], text));
  // 保留最近 20 則訊息
  await redis.lTrim(sessionKey, -20, -1);
  // 滑動過期：每次有人說話就刷新計時，1 小時無活動後自動清空
  await redis.expire(sessionKey, SESSION_TTL);
}

async function getSession(groupId) {
  const sessionKey = format(groupSessionKeyTemplate, groupId);
  const session = await redis.lRange(sessionKey, 0, 20);
  return session;
}
