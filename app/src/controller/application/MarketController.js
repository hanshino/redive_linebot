const { text } = require("bottender/router");
const { get } = require("lodash");
const i18n = require("../../util/i18n");
const { genLinkBubble, getLiffUri } = require("../../templates/common");
const { getClient } = require("bottender");
const lineClient = getClient("line");

exports.router = [
  text(/^[./#](交易管理|trade-manage)$/, showManage),
  text(/^[./#](交易|trade)/, trade),
];

function showManage(context) {
  const link = `${getLiffUri("full")}?reactRedirectUri=/Trade/Manage`;
  const bubble = genLinkBubble("交易管理", link, "#e0f7fa");
  return context.replyFlex("交易管理", bubble);
}

/**
 * 申請交易
 * @param {import ("bottender").LineContext} context
 */
async function trade(context) {
  const { mention } = context.event.message;
  const mentionees = get(mention, "mentionees", []);

  if (mentionees.length === 0) {
    return context.replyText(i18n.__("message.trade.no_mention"));
  }

  const targetUserId = get(mentionees, "[0].userId");
  const link = `${getLiffUri("full")}?reactRedirectUri=/Trade/Order?target_id=${targetUserId}`;
  const bubble = genLinkBubble("交易申請", link, "#e0f7fa");

  const { displayName } = await getProfile(context, targetUserId);

  context.replyText(i18n.__("message.trade.apply", { displayName }));
  await context.replyFlex("交易申請", bubble);
}

function getProfile(context, userId) {
  switch (get(context, "event.source.type")) {
    case "room":
      return lineClient.getRoomMemberProfile(get(context, "event.source.roomId"), userId);
    case "group":
      return lineClient.getGroupMemberProfile(get(context, "event.source.groupId"), userId);
    default:
      return lineClient.getProfile(userId);
  }
}
