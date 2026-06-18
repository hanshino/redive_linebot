const { get } = require("lodash");
const umami = require("../../util/umami");
const { defaultAiResponder } = require("../../service/ai/AiResponder");

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

  umami.track("ai_conversation", "/bot/application/ai_conversation", umami.getSourceData(context));

  const replaceTarget = text.slice(mentionSelf.index, mentionSelf.index + mentionSelf.length);
  const replaceText = text.replace(replaceTarget, "").trim();
  const result = await defaultAiResponder.respondToMention(
    buildConversationMessage(context, replaceText)
  );

  if (result.action === "next") return next;
  if (result.action === "reply") {
    return context.replyText(result.text);
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

  await defaultAiResponder.recordPassiveMessage(buildConversationMessage(context, text));
  return next;
};

exports.resetSession = async function (context) {
  await defaultAiResponder.resetConversation(getSourceId(context));
  await context.replyText("已經將對話紀錄清空");
};

function buildConversationMessage(context, text) {
  return {
    groupId: getSourceId(context),
    speakerId: get(context, "event.source.userId"),
    speakerName: getDisplayName(context),
    text,
  };
}

function getSourceId(context) {
  const sourceType = get(context, "event.source.type");
  return get(context, `event.source.${sourceType}Id`);
}

function getDisplayName(context) {
  const userId = get(context, "event.source.userId");
  return (
    get(context, "event.source.displayName") ||
    get(context, ["state", "userDatas", userId, "displayName"])
  );
}
