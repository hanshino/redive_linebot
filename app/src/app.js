const { router, text, route, line } = require("bottender/router");
const { chain, withProps } = require("bottender");
const character = require("./controller/princess/character");
const gacha = require("./controller/princess/gacha");
const battle = require("./controller/princess/battle");
const customerOrder = require("./controller/application/CustomerOrder");
const guildConfig = require("./controller/application/GroupConfig");
const setProfile = require("./middleware/profile");
const statistics = require("./middleware/statistics");
const lineEvent = require("./controller/lineEvent");
const welcome = require("./templates/common/welcome");
const config = require("./middleware/config");
const groupTemplate = require("./templates/application/Group/line");
const { GlobalOrderBase } = require("./controller/application/GlobalOrders");
const { showAnnounce } = require("./controller/princess/announce");
const { showOrderManager } = require("./templates/application/CustomerOrder/line");
const { showSchedule } = require("./controller/princess/schedule");
const FriendCardController = require("./controller/princess/FriendCard");
const ChatLevelController = require("./controller/application/ChatLevelController");
const BattleReportController = require("./controller/princess/BattleReportController");
const { transfer } = require("./middleware/dcWebhook");
const redis = require("./util/redis");
const traffic = require("./util/traffic");
const { showManagePlace } = require("./templates/application/Admin");
const { sendPreWorkMessage } = require("./templates/princess/other");
const { pushMessage } = require("./util/LineNotify");

function showState(context) {
  context.sendText(JSON.stringify(context.state));
}

async function HandlePostback(context, { next }) {
  if (!context.event.isPayload) return next;

  try {
    let payload = JSON.parse(context.event.payload);
    let { action } = payload;
    const { userId } = context.event.source;

    let memkey = `Postback_${userId}_${action}`;

    if ((await redis.get(memkey)) === null) {
      // 每位使用者 限制5秒內 不能連續重複動作
      redis.set(memkey, 1, 5);
    } else return;

    return router([
      route(
        () => action === "battleSignUp",
        withProps(battle.BattlePostSignUp, { payload: payload })
      ),
      route(
        () => action === "battleCancel",
        withProps(battle.BattlePostCancel, { payload: payload })
      ),
      route("*", next),
    ]);
  } catch (e) {
    console.error(e);
    return next;
  }
}

/**
 * 基於功能指令優先辨識
 */
async function OrderBased(context, { next }) {
  return router([
    ...BattleOrder(context),
    ...AdminOrder(context),
    ...CharacterOrder(context),
    ...CustomerOrder(context),
    ...GroupOrder(context),
    ...PrincessInformation(context),
    ...PersonOrder(context),
    text(/^#?使用說明$/, welcome),
    text(/^[#.]抽(\*(?<times>\d+))?(\s*(?<tag>[\s\S]+))?$/, gacha.play),
    text("/state", showState),
    text("/traffic", function () {
      traffic.getSignData().then(console.table);
    }),
    text("/people", function () {
      traffic.getPeopleData().then(console.table);
    }),
    text(/^[.#]自訂頭像( (?<param1>\S+))?( (?<param2>\S+))?/, guildConfig.setSender),
    text(/^(#我的狀態|\/me)$/, ChatLevelController.showStatus),
    text(/^#狀態\s/, ChatLevelController.showFriendStatus),
    text("#等級排行", ChatLevelController.showRank),
    text(".test", () => pushMessage({ message: "test", token: process.env.LINE_NOTIFY_TOKEN })),
    route("*", next),
  ]);
}

function PersonOrder(context) {
  if (context.event.source.type !== "user") return [];
  return [
    text(/^[#.](重選報名表|formreset)$/, BattleReportController.resetGuild),
    text(/^[#.](我要回報|formreport)(\s(?<formId>\S+))?/, BattleReportController.reportDamage),
    text(/^[#.](傷害回報|回報傷害)\s(?<recordId>\d+)\s(?<week>\d+)\s(?<boss>[1-5])$/, BattleReportController.setAllowReport),
    route(BattleReportController.isAllowPersonalReport, BattleReportController.personalReport),
  ];
}

function AdminOrder(context) {
  if (context.event.source.type !== "user") return [];
  if (!context.state.isAdmin) return [];
  return [
    text(/^[.#/](後台管理|system(call)?)/i, showManagePlace),
    text(/^[.#]setexp\s(?<userId>(U[a-f0-9]{32}))\s(?<exp>\d+)/, ChatLevelController.setEXP),
    text(/^[.#]setrate\s(?<expRate>\d+)/, ChatLevelController.setEXPRate),
  ];
}

function GroupOrder(context) {
  if (context.platform !== "line") return [];
  if (context.event.source.type !== "group") return [];

  return [
    text(/^[#.]?(群組(設定|狀態|管理)|groupconfig)$/, groupTemplate.showGroupStatus),
    text(/^[#./]group$/, groupTemplate.showGroupConfig),
  ];
}

function CustomerOrder(context) {
  if (context.state.guildConfig.CustomerOrder === "N") return [];

  return [
    text(/^[#.]?(指令列表|orderlist)$/, showOrderManager),
    text(/^[#.]?新增指令/, (context, props) =>
      customerOrder.insertCustomerOrder(context, props, 1)
    ),
    text(/^[#.]?新增關鍵字指令/, (context, props) =>
      customerOrder.insertCustomerOrder(context, props, 2)
    ),
    text(
      /^[#.]?[移刪]除指令(\s*(?<order>\S+))?(\s*(?<orderKey>\S+))?$/,
      customerOrder.deleteCustomerOrder
    ),
  ];
}

function BattleOrder(context) {
  if (context.platform !== "line") return [];
  if (context.event.source.type !== "group") return [];
  if (context.state.guildConfig.Battle === "N") return [];

  return [
    text(/^[#.]gbs/, battle.BattleSignUp),
    text(/^[#.]gbc(\s(?<week>[1-9]{1}(\d{0,2})?))?(\s(?<boss>[1-5]{1}))?$/, battle.BattleCancel),
    text(
      /^[#.](gb|刀表)(\s(?<week>[1-9]{1}(\d{0,2})?))?(\s(?<boss>[1-5]{1}))?$/,
      battle.BattleList
    ),
    text(/^[#.](檢視下一?[周週][回次]|shownextweek)$/, battle.NextBattleList),
    text(/^[#.](檢視上一?[周週][回次]|showlastweek)$/, battle.PreBattleList),
    text(/^[#.]((前往)(?下一?[周週][回次])|nextweek)$/, battle.IncWeek),
    text(/^[#.]((回去)(?上一?[周週][回次])|lastweek)$/, battle.DecWeek),
    text(/^[#.]([五5]王倒了|finishweek)$/, battle.FinishWeek),
    text(/^[#.](設定[周週][回次]|setweek)(\s(?<week>\d+))?$/, battle.SetWeek),
    text(/^[#.](當[周週][回次]報名表|nowweek)$/, battle.CurrentBattle),
    text(/^[#.](三刀出完|出完三刀|done)/, battle.reportFinish),
    text(/^[#.](三刀重置|重置三刀|reset)/, battle.reportReset),
    text(/^[#.](出完沒|趕快出|gblist)(\s(?<date>\d{1,2}))?$/, battle.showSigninList),
  ];
}

function CharacterOrder(context) {
  if (context.state.guildConfig.PrincessCharacter === "N") return [];

  return [
    text(/^[#.]角色資訊(\s(?<character>[\s\S]+))?$/, character.getInfo),
    text(/^[#.]角色技能(\s(?<character>[\s\S]+))?$/, character.getSkill),
    text(/^[#.](角色)?行動(模式)?(\s(?<character>[\s\S]+))?$/, character.getAction),
    text(/^[#.](角色)?專武(資訊)?(\s(?<character>[\s\S]+))?$/, character.getUniqueEquip),
    text(/^[#.](角色)?裝備(需求)?(\s(?<character>[\s\S]+))?$/, character.getEquipRequire),
    text(/^[#.](公主|角色)(\s(?<character>[\s\S]+))?$/, character.getCharacter),
    text(/^[#.](角色)?rank(推薦)?(\s(?<character>[\s\S]+))?$/, character.getRecommend),
  ];
}

function PrincessInformation(context) {
  if (context.state.guildConfig.PrincessInformation === "N") return [];

  return [
    text(/^[#.](好友小卡|加我好友)$/, FriendCardController.showCard),
    text(/^[#.]官方公告$/, showAnnounce),
    text(/^[#.]?(官方活動|公主活動|公主行事曆)/, showSchedule),
    text(/^#(前作|前作劇情|公連歌曲|前作個人劇情)/, sendPreWorkMessage),
  ];
}

async function CustomerOrderBased(context, { next }) {
  if (!context.event.isText) return next;
  if (context.state.guildConfig.CustomerOrder === "N") return next;

  var detectResult = await customerOrder.CustomerOrderDetect(context);

  if (detectResult === false) return next;
}

function Nothing(context) {
  switch (context.platform) {
    case "line":
      if (context.event.source.type === "user") {
        context.sendText("沒有任何符合的指令");
      }
      break;
    case "telegram":
      if (context.event.message.chat.type === "private") {
        context.sendText("沒有任何符合的指令");
      }
      break;
  }
}

async function App(context) {
  traffic.recordPeople(context);
  return chain([
    setProfile, // 設置各式用戶資料
    statistics, // 數據蒐集
    lineEvent, // 事件處理
    config, // 設置群組設定檔
    transfer, // Discord Webhook轉發
    HandlePostback, // 處理postback事件
    GlobalOrderBase, // 全群指令分析
    OrderBased, // 指令分析
    CustomerOrderBased, // 自訂指令分析
    Nothing, // 無符合事件
  ]);
}

module.exports = App;
