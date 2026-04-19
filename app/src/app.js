const { router, text, route } = require("bottender/router");
const { chain, withProps } = require("bottender");
const gacha = require("./controller/princess/gacha");
const AutoPreferenceController = require("./controller/application/AutoPreferenceController");
const battle = require("./controller/princess/battle");
const customerOrder = require("./controller/application/CustomerOrder");
const guildConfig = require("./controller/application/GroupConfig");
const setProfile = require("./middleware/profile");
const statistics = require("./middleware/statistics");
const alias = require("./middleware/alias");
const umamiTrack = require("./middleware/umamiTrack");
const rateLimit = require("./middleware/rateLimit");
const lineEvent = require("./controller/lineEvent");
const welcome = require("./templates/common/welcome");
const commonTemplate = require("./templates/common");
const config = require("./middleware/config");
const groupTemplate = require("./templates/application/Group/line");
const { GlobalOrderBase } = require("./controller/application/GlobalOrders");
const { showOrderManager } = require("./templates/application/CustomerOrder/line");
const ChatLevelController = require("./controller/application/ChatLevelController");
const WorldBossController = require("./controller/application/WorldBossController");
const AdvertisementController = require("./controller/application/AdvertisementController");
const GodStoneShopController = require("./controller/princess/GodStoneShop");
const CharacterController = require("./controller/princess/character");
const JankenController = require("./controller/application/JankenController");
const AchievementController = require("./controller/application/AchievementController");
const DonateListController = require("./controller/application/DonateListController");
const AliasController = require("./controller/application/AliasController");
const MarketController = require("./controller/application/MarketController");
const CouponController = require("./controller/application/CouponController");
const ImageController = require("./controller/application/ImageController");
const StatusController = require("./controller/application/StatusController");
const RaceController = require("./controller/application/RaceController");
const SubscribeController = require("./controller/application/SubscribeController");
const OpenaiController = require("./controller/application/OpenaiController");
const JobController = require("./controller/application/JobController");
const { transfer } = require("./middleware/dcWebhook");
const redis = require("./util/redis");
const i18n = require("./util/i18n");
const traffic = require("./util/traffic");
const { showManagePlace } = require("./templates/application/Admin");
const AdminModel = require("./model/application/Admin");
const axios = require("axios");
const pConfig = require("config");
const { get, sample } = require("lodash");

axios.defaults.timeout = 5000;

const askBot = (keyword, action) =>
  route(context => {
    if (context.event.isText === false) return false;
    const mentionees = get(context, "event.message.mention.mentionees", []);
    const isAskingBot = mentionees.some(mentionee => mentionee.isSelf === true);
    if (!isAskingBot) return false;

    if (keyword === undefined) {
      throw new Error("Missing keyword");
    }

    if (typeof keyword === "string") {
      return context.event.text.includes(keyword);
    }

    if (Array.isArray(keyword)) {
      return keyword.some(k => context.event.text.includes(k));
    }

    if (keyword instanceof RegExp) {
      return keyword.test(context.event.text);
    }

    return false;
  }, action);

function showState(context) {
  context.replyText(JSON.stringify(context.state));
}

function showMention(context) {
  const { mention } = context.event.message;
  const userIds = mention.mentionees.map(mentionee => mentionee.userId);
  return context.replyText(`${userIds.join("\n")}`);
}

async function HandlePostback(context, { next }) {
  if (!context.event.isPayload) return next;

  try {
    let payload = JSON.parse(context.event.payload);
    let { action, cooldown = 1 } = payload;
    const { userId } = context.event.source;

    let memkey = `Postback_${userId}_${action}`;

    // 使用 setnx 限制每位使用者 1秒內 不能連續重複動作
    // 如果有特別指定的 cooldown 值，則使用該值
    let isExist = await redis.set(memkey, 1, {
      EX: cooldown,
      NX: true,
    });
    if (!isExist && action !== "adminBossAttack") return;

    return router([
      route(
        () => action === "worldBossAttack",
        withProps(WorldBossController.attackOnBoss, { payload })
      ),
      route(() => action === "janken", withProps(JankenController.decide, { payload })),
      route(() => action === "challenge", withProps(JankenController.challenge, { payload })),
      route(
        () => action === "confirmTransfer",
        withProps(MarketController.doTransfer, { payload })
      ),
      route(
        () => action === "startSwordmanChangeJobMission",
        withProps(JobController.startSwordmanJobMission, { payload })
      ),
      route(
        () => action === "swordmanChangeJobMission",
        withProps(JobController.swordmanAttackTarget, { payload })
      ),
      route(
        () => action === "startMageChangeJobMission",
        withProps(JobController.startMageChangeJobMission, { payload })
      ),
      route(
        () => action === "mageChangeJobMission",
        withProps(JobController.mageUseElement, { payload })
      ),
      route(
        () => action === "startThiefChangeJobMission",
        withProps(JobController.startThiefChangeJobMission, { payload })
      ),
      route(
        () => action === "thiefChangeJobMission",
        withProps(JobController.thiefSteal, { payload })
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
 * @param {import("bottender").LineContext} context
 */
async function OrderBased(context, { next }) {
  const { userId, type } = context.event.source;
  const isAdmin = userId && (await AdminModel.isAdminFromCache(userId));

  return router([
    ...BattleOrder(context),
    ...(isAdmin ? AdminOrder(context) : []),
    ...CustomerOrder(context),
    ...GroupOrder(context),
    ...WorldBossController.router,
    ...AdvertisementController.router,
    ...GodStoneShopController.router,
    ...JankenController.router,
    ...RaceController.router,
    ...AchievementController.router,
    ...AchievementController.titleRouter,
    ...MarketController.router,
    ...CouponController.router,
    ...ImageController.router,
    ...StatusController.router,
    ...SubscribeController.router,
    ...CharacterController.router,
    ...(type === "user" ? JobController.router : []),
    ...(type === "user" ? SubscribeController.privateRouter : []),
    text(/^[/#.](使用說明|help)$/, welcome),
    text(/^[/#.]抽(\*(?<times>\d+))?(\s*(?<tag>[\s\S]+))?$/, gacha.play),
    text(/^[/#.]消耗抽(\*(?<times>\d+))?(\s*(?<tag>[\s\S]+))?$/, (context, props) =>
      gacha.play(context, { ...props, pickup: true })
    ),
    text(/^[/#.]歐洲抽(\*(?<times>\d+))?(\s*(?<tag>[\s\S]+))?$/, (context, props) =>
      gacha.play(context, { ...props, europe: true })
    ),
    text(/^[/#.]保證抽(\*(?<times>\d+))?(\s*(?<tag>[\s\S]+))?$/, (context, props) =>
      withProps(gacha.play, { ...props, ensure: true })
    ),
    text(["#我的包包", "/mybag"], gacha.showGachaBag),
    text(/^[/#.]自動設定$/, AutoPreferenceController.showAutoSettings),
    text("/state", showState),
    text(/^.show/, showMention),
    text("/source", context => context.replyText(JSON.stringify(context.event.source))),
    text("/resetstate", context => context.resetState()),
    text("/traffic", function () {
      traffic.getSignData().then(console.table);
    }),
    text("/people", function () {
      traffic.getPeopleData().then(console.table);
    }),
    text(/^[.#]自訂頭像( (?<param1>\S+))?( (?<param2>\S+))?/, guildConfig.setSender),
    text(/^(#我的狀態|\/me)$/, context =>
      withProps(ChatLevelController.showStatus, { userId: context.event.source.userId })
    ),
    text(/^[.#/](你的狀態|you)/, context => {
      const mentionees = context.event.message.mention.mentionees;
      console.log(mentionees);
      if (mentionees.length === 0) {
        return context.replyText("請標記要查詢的對象");
      }

      const userId = mentionees[0].userId;

      return withProps(ChatLevelController.showStatus, { userId })(context);
    }),
    text(/^#狀態\s/, ChatLevelController.showFriendStatus),
    text("#等級排行", ChatLevelController.showRank),
    text(["/link", "#實用連結", "#連結"], context => {
      const liffUri = commonTemplate.getLiffUri("full");
      const bubble = commonTemplate.genLinkMenu({
        title: "🔗 實用連結",
        subtitle: "快速前往常用功能",
        items: [
          { icon: "🏠", title: "首頁", subtitle: "主選單總覽", url: liffUri, theme: "indigo" },
          {
            icon: "🏆",
            title: "排行榜",
            subtitle: "活躍度與戰力榜",
            url: `${liffUri}/rankings`,
            theme: "amber",
          },
          {
            icon: "📑",
            title: "指令集",
            subtitle: "完整指令手冊",
            url: `${liffUri}/panel/manual`,
            theme: "indigo",
          },
          {
            icon: "📰",
            title: "巴哈更新",
            subtitle: "官方公告討論串",
            url: pConfig.get("links.bahamut"),
            theme: "cyan",
          },
          {
            icon: "💻",
            title: "GitHub",
            subtitle: "原始碼與回報",
            url: pConfig.get("links.github"),
            theme: "slate",
          },
        ],
      });

      context.replyFlex("實用連結", bubble);
    }),
    text(".test", () => console.log("test")),
    text("/resetsession", OpenaiController.resetSession),
    route("*", next),
  ]);
}

function AdminOrder() {
  return [
    text(/^[.#/](後台管理|system(call)?)/i, showManagePlace),
    text(/^[.#]setexp\s(?<userId>(U[a-f0-9]{32}))\s(?<exp>\d+)/, ChatLevelController.setEXP),
    text(/^[.#]setrate\s(?<expRate>\d+)/, ChatLevelController.setEXPRate),
    ...AchievementController.adminRouter,
    ...DonateListController.adminRouter,
    ...AliasController.adminRouter,
    ...CouponController.adminRouter,
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
    text(/^[#.]?新增指令/, withProps(customerOrder.insertCustomerOrder, { touchType: 1 })),
    text(/^[#.]?新增關鍵字指令/, withProps(customerOrder.insertCustomerOrder, { touchType: 2 })),
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
    text(/^[#.](三刀出完|出完三刀|done)$/, battle.reportFinish),
    text(/^[#.](三刀重置|重置三刀|reset)$/, battle.reportReset),
    text(/^[#.](出完沒|趕快出|gblist)(\s(?<date>\d{1,2}))?$/, battle.showSigninList),
  ];
}

async function CustomerOrderBased(context, { next }) {
  if (!context.event.isText) return next;
  if (context.state.guildConfig.CustomerOrder === "N") return next;

  var detectResult = await customerOrder.CustomerOrderDetect(context);

  if (detectResult === false) return next;
}

function interactWithBot(context, { next }) {
  return router([
    askBot("你好", context => context.replyText("你好啊！")),
    text(/(誰的問題|誰在搞)/, whosProblem),
    askBot(/.*/, () => OpenaiController.naturalLanguageUnderstanding(context, { next })),
    route("*", next),
  ]);
}

async function recordLatestGroupUser(context, { next }) {
  if (context.event.source.type !== "group") return next;
  const { userId, groupId } = context.event.source;
  if (!userId) return next;
  const key = `latestGroupUser:${groupId}`;
  try {
    await redis.zAdd(key, [
      {
        score: Date.now(),
        value: userId,
      },
    ]);
    // 保留 timestamp 在 30 分鐘內的資料
    await redis.zRemRangeByScore(key, 0, Date.now() - 30 * 60 * 1000);
  } catch (e) {
    console.error(e);
  }

  return next;
}

/**
 * 誰的問題
 * @param {import("bottender").LineContext} context
 */
async function whosProblem(context) {
  if (context.event.source.type !== "group") return;
  const { groupId } = context.event.source;
  const key = `latestGroupUser:${groupId}`;
  const users = await redis.zRange(key, 0, -1);
  const { quoteToken } = context.event.message;

  if (users.length === 1) {
    return context.replyText(sample(i18n.__("message.whos_problem_only_one")), { quoteToken });
  }

  const target = sample(users);
  const replyMessage = [
    {
      type: "textV2",
      text: sample(i18n.__("message.whos_problem")),
      sender: {
        name: "裁決者",
      },
      substitution: {
        user: {
          type: "mention",
          mentionee: {
            type: "user",
            userId: target,
          },
        },
      },
      quoteToken,
    },
  ];

  context.reply(replyMessage);
}

function Nothing(context) {
  switch (context.platform) {
    case "line":
      if (context.event.source.type === "user") {
        context.replyText("沒有任何符合的指令");
      }
      break;
    case "telegram":
      if (context.event.message.chat.type === "private") {
        context.replyText("沒有任何符合的指令");
      }
      break;
  }
}

async function App(context) {
  traffic.recordPeople(context);
  return chain([
    setProfile, // 設置各式用戶資料
    statistics, // 數據蒐集
    recordLatestGroupUser, // 紀錄最近群組用戶
    lineEvent, // 事件處理
    config, // 設置群組設定檔
    transfer, // Discord Webhook轉發
    HandlePostback, // 處理postback事件
    rateLimit, // 限制使用者指令速度
    alias,
    umamiTrack, // Umami 事件追蹤
    GlobalOrderBase, // 全群指令分析
    OrderBased, // 指令分析
    CustomerOrderBased, // 自訂指令分析
    interactWithBot, // 標記機器人回應
    OpenaiController.recordSession, // 記錄對話
    Nothing, // 無符合事件
  ]);
}

module.exports = App;
