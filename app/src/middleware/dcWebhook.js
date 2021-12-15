const discord = require("../util/discord");
const GroupConfigModel = require("../model/application/GuildConfig");

exports.transfer = async (context, { next }) => {
  const { groupId, type } = context.event.source;
  if (type !== "group") return next;
  if (!context.event.isText) return next;

  const webhook = await GroupConfigModel.getDiscordWebhook(groupId);
  if (webhook === "" || /discord.com\/api\/webhooks\/([^/]+)\/([^/]+)/.test(webhook) === false)
    return next;

  const params = initialEvent(context);

  discord.webhook
    .send(webhook, {
      content: params.message,
      username: params.username,
      avatar_url: params.avatar,
    })
    .then(result => {
      // 發送失敗，清除此群組的Webhook
      if (result === false) GroupConfigModel.removeDicordWebhook(groupId);
    });

  return next;
};

function initialEvent(context) {
  const { event, state } = context;
  const { userId } = context.event.source;
  var message = "",
    avatar = undefined,
    username = undefined;

  switch (event.message.type) {
    case "text":
      message = event.message.text;
      break;
    case "image":
      message = "傳送了一個圖片";
      break;
    case "video":
      message = "傳送了一個影片";
      break;
    case "audio":
      message = "傳送了一個聲音檔";
      break;
    case "file":
      message = "傳送了一個檔案";
      break;
    case "location":
      message = "傳送了一個地址：" + event.message.address;
      break;
    case "sticker":
      message = "傳送了一個貼圖";
      break;
  }

  var currUser = state.userDatas[userId];
  if (currUser !== undefined) {
    username = currUser.displayName + " - From Line";
    avatar = currUser.pictureUrl ? currUser.pictureUrl : "https://i.imgur.com/C9szJ1u.png";
  }

  return {
    message,
    avatar,
    username,
  };
}
