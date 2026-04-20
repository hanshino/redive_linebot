const { battle: BattleModel } = require("../../model/princess/guild");
const GuildModel = require("../../model/application/Guild");
const GuildBattleConfigRepo = require("../../repositories/princess/guild/ConfigRepository");
const line = require("../../util/line");
const BattleTemplate = require("../../templates/princess/guild/battle");
const BattleSender = { name: "戰隊秘書", iconUrl: "https://i.imgur.com/NuZZR7Q.jpg" };
const redis = require("../../util/redis");
// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");

function BattleException(message, code) {
  this.message = message;
  this.name = "GuildBattle";
  this.code = code;
}

/**
 * 回報戰隊出完三刀，並寫進資料庫
 * @param {Context} context
 */
exports.reportFinish = context => {
  const { groupId, userId } = context.event.source;
  let userName = context.state.userDatas[userId].displayName || "路人甲";

  BattleModel.setFinishBattle(groupId, userId).then(() =>
    context.replyText(`恭喜${userName}今日已成為成功人士(出完三刀)！`, { sender: BattleSender })
  );
};

/**
 * 將當天回報紀錄刪除
 * @param {Context} context
 */
exports.reportReset = async context => {
  const { groupId, userId } = context.event.source;
  await BattleModel.resetFinishBattle(groupId, userId);

  context.replyText("吶吶，那你剛剛回報是不是騙我，嘖！\n幫你清除了啦！", { sender: BattleSender });
};

/**
 * 顯示今日的簽到列表
 * @param {Context} context
 */
exports.showSigninList = async (context, { match }) => {
  const { groupId } = context.event.source;
  var { date } = match.groups;
  date = date || new Date().getDate();
  let objDate = new Date();
  let currMonth = objDate.getMonth();
  objDate.setDate(parseInt(date));
  objDate.setMonth(currMonth);
  let FinishDatas = await BattleModel.getFinishList(groupId, objDate);

  if (FinishDatas.length > 50) {
    context.replyText("此指令不適用於非戰隊群組（人數超過50人）", { sender: BattleSender });
    return;
  }

  if (FinishDatas.find(data => data.isSignin) === undefined) {
    context.replyText(`${date}號查無任何出刀紀錄！`, { sender: BattleSender });
    return;
  }

  if (FinishDatas.filter(data => data.isSignin).length === FinishDatas.length) {
    context.replyText(`${date}號全群皆已完成出刀！`, { sender: BattleSender });
    return;
  }

  let sentKey = `FinishList_${groupId}`;

  if ((await redis.get(sentKey)) !== null) {
    context.replyText("此指令限制30秒呼叫一次", { sender: BattleSender });
    return;
  }

  redis.set(sentKey, 1, {
    EX: 30,
  });

  let result = await Promise.all(
    FinishDatas.map(async data => ({
      ...data,
      ...(await line.getGroupMemberProfile(groupId, data.userId).catch(() => ({
        displayName: "路人甲",
        userId: date.userId,
      }))),
    }))
  );

  BattleTemplate.showFinishList(context, result);
};

exports.api = {};

exports.api.showSigninList = async (req, res) => {
  let { month, guildId } = req.params;
  month = parseInt(month) || new Date().getMonth() + 1;

  let [memberDatas, signinList] = await Promise.all([
    GuildModel.fetchGuildMembers(guildId),
    BattleModel.getMonthFinishList(guildId, month),
  ]);

  let result = arrangeMonthFinishList(memberDatas, signinList);

  result = await Promise.all(
    result.map(async data => {
      let profile = await line
        .getGroupMemberProfile(data.guildId, data.userId)
        .catch(() => ({ displayName: "路人甲", userId: data.userId }));
      return { ...profile, ...data };
    })
  );

  res.json(result);
};

/**
 * 整理出可用的簽到資料
 * @param {Array<{guildId: String, userId: String}>} memberDatas 群組會員資料
 * @param {Array<{createDTM: Date, userId: String}>} signinList 簽到資料
 */
function arrangeMonthFinishList(memberDatas, signinList) {
  let result = memberDatas.map(member => ({
    ...member,
    signDates: [],
  }));

  let memberIds = memberDatas.map(data => data.userId);

  signinList.forEach(list => {
    let idx = memberIds.indexOf(list.userId);
    list.createDTM.setHours(list.createDTM.getHours() - 5);
    result[idx].signDates.push(list.createDTM.getDate());
  });

  return result;
}

/**
 * 取得戰隊系統設定資訊
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.api.getGuildBattleConfig = async (req, res) => {
  let { guildId: groupId } = req.params;
  let { signMessage } = await GuildBattleConfigRepo.getConfig(groupId);

  res.json({ signMessage });
};

/**
 * 修改戰隊系統設定檔
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.api.updateGuildBattleConfig = async (req, res) => {
  let code = 200;
  let result = {};

  try {
    let { guildId: groupId } = req.params;
    let { signMessage, notifyToken } = req.body;

    if (!signMessage && !notifyToken) throw new BattleException("Bad Request", 400);

    let affected = await GuildBattleConfigRepo.writeConfig(groupId, {
      signMessage,
      notifyToken,
    });

    if (affected !== 1) throw new BattleException("Update Failed", 403);
  } catch (e) {
    if (!(e instanceof BattleException)) throw e;
    result = e;
    code = e.code;
  }

  res.status(code).json(result);
};
