// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const minimist = require("minimist");
const i18n = require("../../util/i18n");
const adModel = require("../../model/application/Advertisement");

exports.router = [text(/^\/addad/, addAdvertisement)];

/**
 * 為特定群組建立服務權限
 * @param {Context} context
 * @param {import("bottender").Props} props
 */
async function addAdvertisement(context) {
  // 僅限於管理員
  if (context.state.isAdmin === false && context.event.source.type === "user") {
    return;
  }

  const { text } = context.event.message;
  const { senderName, senderIcon, title = "未指定" } = minimist(text.split(" "));
  const match = text.match(/{.*?}/s);
  const strMessage = match ? match[0] : "";

  if (!strMessage) {
    await context.replyText(i18n.__("message.advertisement.add_usage"));
    return;
  }

  const message = parseMessage(strMessage);
  const attributes = {
    message: JSON.stringify(message),
    title,
    sender_name: senderName,
    sender_iconUrl: senderIcon,
  };

  await adModel.create(attributes);

  const ad = await adModel.findLatestByTitle(title);

  await context.replyText(
    i18n.__("message.advertisement.add_success", {
      title: ad.title,
      id: ad.id,
      senderName: ad.sender_name || "未指定",
      senderIcon: ad.sender_iconUrl || "未更換",
    })
  );
}

function parseMessage(rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch (e) {
    console.log(e);
    message = { type: "text", text: rawMessage };
  }

  return Array.isArray(message) ? message : [message];
}
