const { text } = require("bottender/router");
const { getClient } = require("bottender");
const { get } = require("lodash");
const i18n = require("../../util/i18n");
const LineClient = getClient("line");
const pictshare = require("../../util/pictshare");

exports.router = [text(/^[./#]圖片上傳$/, handleUpload)];

/**
 * 處理圖片上傳
 * @param {import ("bottender").LineContext} context
 */
async function handleUpload(context) {
  const { quotedMessageId: id } = context.event.message;

  if (!id) {
    return context.replyText(i18n.__("message.image.upload_without_quote"));
  }

  try {
    const buf = await LineClient.getMessageContent(id);
    const result = await pictshare.uploadBuffer(buf);

    return context.replyText(
      i18n.__("message.image.upload_success", {
        id: result.hash,
        url: result.url,
      })
    );
  } catch (e) {
    console.log("[ImageUpload] error:", e.message);
    return context.replyText(i18n.__("message.image.upload_failed"));
  }
}
