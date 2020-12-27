const ChatLevelModel = require("../../model/application/ChatLevelModel");
const { DefaultLogger } = require("../../util/Logger");

/**
 *
 * @param {Context} context
 */
exports.showStatus = async context => {
  try {
    let { userId, displayName } = context.event.source;

    if (!userId || !displayName) {
      context.sendText("獲取失敗，無法辨識用戶");
      throw "userId or displayName is empty";
    }

    let { rank, range, level } = await ChatLevelModel.getUserData(userId);

    let messages = [`LINE名稱: ${displayName}`, `稱號： ${range} 的 ${rank}`, `等級: ${level}`];
    context.sendText(messages.join("\n"));
  } catch (e) {
    DefaultLogger.error(e);
  }
};

exports.setEXP = (context, { match }) => {
  let { userId, exp } = match.groups;
  console.log(userId, exp, "修改經驗");
  ChatLevelModel.setExperience(userId, exp).then(result => {
    let msg = result ? "修改成功" : "修改失敗";
    context.sendText(msg, { sender: { name: "管理員指令" } });
  });
};
