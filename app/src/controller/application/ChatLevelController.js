const ChatLevelModel = require("../../model/application/ChatLevelModel");
const ChatLevelTemplate = require("../../templates/application/ChatLevel");
const { DefaultLogger } = require("../../util/Logger");

/**
 * 顯示個人狀態
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

    let messages = [`LINE名稱: ${displayName}`, `稱號: ${range} 的 ${rank}`, `等級: ${level}`];
    context.sendText(messages.join("\n"));

    if (!level) {
      context.sendText("尚未有任何數據，經驗開始累積後即可投胎！");
    }
  } catch (e) {
    DefaultLogger.error(e);
  }
};

/**
 * 管理員密技，直接設定經驗值
 * @param {Context} context
 * @param {Object} param1
 * @param {Object} param1.match
 */
exports.setEXP = (context, { match }) => {
  let { userId, exp } = match.groups;
  console.log(userId, exp, "修改經驗");
  ChatLevelModel.setExperience(userId, exp).then(result => {
    let msg = result ? "修改成功" : "修改失敗";
    context.sendText(msg, { sender: { name: "管理員指令" } });
  });
};

exports.showRank = async context => {
  let { lastSendRank } = context.state;
  let now = new Date().getTime();
  if (now - lastSendRank < 60 * 1000) return;

  let list = await ChatLevelModel.getRankList(1);
  list = await Promise.all(list.slice(0, 5).map(appendLevelTitle));

  context.setState({ ...context.state, lastSendRank: now });
  ChatLevelTemplate.showTopRank(context, { rankData: list, sendType: "text" });
};

/**
 * 根據經驗查出等級稱號並回傳
 * @param {Object} data
 * @param {Number} data.id
 * @param {Number} data.experience
 * @returns {Object<{id: Number, experience: Number, range: String, rank: String, level: Number}>}
 */
function appendLevelTitle(data) {
  return ChatLevelModel.getLevel(data.experience)
    .then(level => {
      data = { ...data, level };
      return ChatLevelModel.getTitleData(level);
    })
    .then(({ rank, range }) => {
      data = { ...data, rank, range };
      return data;
    });
}
