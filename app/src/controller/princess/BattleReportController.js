const { getClient } = require("bottender");
const line = getClient("line");
const CharacterModel = require("../../model/princess/character");
const OpencvModel = require("../../model/application/OpencvModel");
const BattleModel = require("../../model/princess/guild/battle");
const LineUtil = require("../../util/line");
const BattleTemplate = require("../../templates/princess/guild/battle");
const Notify = require("../../util/LineNotify");

exports.resetGuild = context => {
  context.setState({ formId: null });
  this.reportDamage(context, { match: { groups: {} } });
};

/**
 * 我要回報的觸發，將為使用者準備要回報的紀錄
 * @param {Context} context
 * @param {Object} params
 */
exports.reportDamage = async (context, params) => {
  let { userId } = context.event.source;
  let forms = await BattleModel.getUserGuildFroms(userId);
  let { formId: paramFormId } = params.match.groups;
  let { formId: stateFormId } = context.state;
  let formId = null;

  // 優先取用參數報名表，次取state內報名表
  if (paramFormId) {
    formId = paramFormId;
    // 指定參數強制寫入state
    context.setState({ formId });
  } else if (stateFormId) {
    formId = stateFormId;
  } else {
    // 沒參數 也沒state
    forms = await Promise.all(
      forms.map(async form => {
        let summary = await LineUtil.getGroupSummary(form.groupId);
        let count = await LineUtil.getGroupCount(form.groupId);
        let week = form.week || 1;
        return { ...form, ...summary, ...count, week };
      })
    );

    if (forms.length > 1 && !formId) {
      BattleTemplate.showGuildList(context, forms);
      return;
    } else {
      // 只有一個報名表，直接塞進state下次使用
      formId = forms[0].formId;
      context.setState({ formId });
    }
  }

  if (!formId) return context.sendText("取報名表異常，請通知作者");

  let ianUserData = await BattleModel.getIanUserData("2", userId);
  let { ianUserId } = ianUserData[0];
  let records = await BattleModel.Ian.getUserFormRecords(formId, ianUserId);

  if (records.length === 0) {
    context.sendText("尚未在戰隊群組內部報名過！因此找無任何紀錄！");
    return;
  }

  context.setState({ ianUserId });

  context.sendText("請選擇要回報的紀錄");
  BattleTemplate.showReportList(
    context,
    records.map(record => ({
      ...record,
      type: getStatusText(record.status),
      color: getStatusColor(record.status),
    }))
  );
};

exports.setAllowReport = (context, params) => {
  let { recordId, week, boss } = params.match.groups;
  context.setState({ report: { recordId, week, boss } });
  context.sendText(`請上傳 ${week}周 ${boss}王\n戰隊傷害報告圖片`);
};

exports.personalReport = async context => {
  let { recordId, week, boss } = context.state.report;
  let { formId, ianUserId } = context.state;
  let imageId = context.event.image.id;
  let imageBase = await getImageBase(imageId);
  let res = await OpencvModel.analyzeGuildBattle(imageBase);

  if (res === false) {
    Notify.pushMessage({
      message: `圖片分析系統分析失敗，訊息ID：${imageId}`,
      token: process.env.LINE_NOTIFY_TOKEN,
    });
    return context.sendText("圖片分析失敗，請確認！\n歡迎至Discord回報 https://discord.gg/Fy82rTb");
  }

  let ids = res.map(d => d.unit_id.toString().substr(0, 4));

  let characterDatas = CharacterModel.getDatas();
  let team = characterDatas
    .filter(character => ids.indexOf(character.unitId.substr(0, 4)) !== -1)
    .map(character => {
      let target = res.find(
        d => d.unit_id.toString().substr(0, 4) === character.unitId.substr(0, 4)
      );
      return { ...character, ...target };
    });

  team.sort((a, b) => a.Stand - b.Stand);
  let totalDamage = res.map(d => d.damage).reduce((pre, curr) => pre + curr);
  let option = {
    id: recordId,
    status: 21,
    damage: totalDamage,
    team: res.map(d => ({
      id: d.unit_id,
      star: d.rarity,
    })),
  };

  await BattleModel.Ian.setRecord(formId, week, boss, ianUserId, option);
  let flexMessage = BattleTemplate.genReportInformation({ totalDamage, team });

  context.sendText(`已將 ${week}周 ${boss}王\n傷害紀錄上傳`);
  context.sendFlex("隊伍詳細資訊", flexMessage);

  // 清除state 避免重複收到圖片
  context.setState({ report: {} });
};

/**
 * 提供router判斷是否為個人回報
 * @param {Context} context
 */
exports.isAllowPersonalReport = context => {
  return Object.keys(context.state.report || {}).length === 3 && context.event.isImage;
};

function getImageBase(messageId) {
  return line.getMessageContent(messageId).then(buffer => {
    return buffer.toString("base64");
  });
}

function getStatusText(status) {
  switch (status) {
    case 1:
      return "完整";
    case 2:
      return "補償";
    case 3:
      return "凱留";
    case 21:
      return "完成";
    default:
      return "其他";
  }
}

function getStatusColor(status) {
  let color;
  switch (status) {
    case 11:
      color = "#7cb6ff";
      break;
    case 21:
    case 22:
      color = "#99e699";
      break;
    case 23:
      color = "#FFD9D7";
      break;
    case 24:
      color = "#ffe066";
      break;
    default:
      color = "#000000";
  }
  return color;
}
