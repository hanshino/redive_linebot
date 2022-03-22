const { text, route } = require("bottender/router");
const { getClient } = require("bottender");
const { get, uniq } = require("lodash");
const i18n = require("../../util/i18n");
const LineClient = getClient("line");
const imgur = require("../../util/imgur");

exports.router = [text(/^[./#]圖片上傳$/, handleStartUpload), isUploading(handleUpload)];

function isUploading(action) {
  return route(context => {
    if (!context.event.isImage) {
      return false;
    }

    const { userId } = context.event.source;
    const imageUpload = get(context.state, "imageUpload", []);
    return imageUpload.includes(userId);
  }, action);
}

/**
 * 處理圖片上傳的前置作業
 * @param {import ("bottender").LineContext} context
 */
async function handleStartUpload(context) {
  const { userId } = context.event.source;

  if (!userId) {
    return context.replyText(i18n.__("message.user_unreconized"));
  }

  const imageUpload = get(context.state, "imageUpload", []);
  imageUpload.push(userId);

  context.setState({
    imageUpload: uniq(imageUpload),
  });

  return await context.replyText(i18n.__("message.image.upload_start"));
}

/**
 * 處理圖片上傳
 * @param {import ("bottender").LineContext} context
 */
async function handleUpload(context) {
  const { id } = context.event.image;
  const buf = await LineClient.getMessageContent(id);

  const result = await imgur.upload({
    type: "buffer",
    image: buf,
  });

  const url = get(result, "data.link");

  if (!url) {
    return context.replyText(i18n.__("message.image.upload_failed"));
  }

  const imageUpload = get(context.state, "imageUpload", []);
  imageUpload.splice(imageUpload.indexOf(context.event.source.userId), 1);

  context.setState({
    imageUpload: uniq(imageUpload),
  });

  return context.replyText(
    i18n.__("message.image.upload_success", {
      id: get(result, "data.id"),
      url,
    })
  );
}
