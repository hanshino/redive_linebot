const { text } = require("bottender/router");
const { getClient } = require("bottender");
const { get } = require("lodash");
const i18n = require("../../util/i18n");
const LineClient = getClient("line");
const imgur = require("../../util/imgur");
const { isImageUrl } = require("../../util/string");

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

    const result = await imgur.upload({
      image: buf,
    });

    const url = get(result, "data.link");

    if (!isImageUrl(url)) {
      return context.replyText(i18n.__("message.image.upload_failed"));
    }

    const imageUpload = get(context.state, "imageUpload", []);
    imageUpload.splice(imageUpload.indexOf(context.event.source.userId), 1);

    return context.replyText(
      i18n.__("message.image.upload_success", {
        id: get(result, "data.id"),
        url,
      })
    );
  } catch (e) {
    console.log(e);
    return context.replyText(i18n.__("message.image.upload_failed"));
  }
}
