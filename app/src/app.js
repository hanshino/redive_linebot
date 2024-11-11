const { router, text, route } = require("bottender/router");
const { chain, withProps } = require("bottender");
const gacha = require("./controller/princess/gacha");
const battle = require("./controller/princess/battle");
const customerOrder = require("./controller/application/CustomerOrder");
const guildConfig = require("./controller/application/GroupConfig");
const setProfile = require("./middleware/profile");
const statistics = require("./middleware/statistics");
const alias = require("./middleware/alias");
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
const GuildServiceController = require("./controller/application/GuildServiceController");
const AdvertisementController = require("./controller/application/AdvertisementController");
const GodStoneShopController = require("./controller/princess/GodStoneShop");
const CharacterController = require("./controller/princess/character");
const JankenController = require("./controller/application/JankenController");
const AdvancementController = require("./controller/application/AdvancementController");
const DonateListController = require("./controller/application/DonateListController");
const GambleController = require("./controller/application/GambleController");
const AliasController = require("./controller/application/AliasController");
const VoteController = require("./controller/application/VoteController");
const MarketController = require("./controller/application/MarketController");
const CouponController = require("./controller/application/CouponController");
const ImageController = require("./controller/application/ImageController");
const StatusController = require("./controller/application/StatusController");
const LotteryController = require("./controller/application/LotteryController");
const BullshitController = require("./controller/application/BullshitController");
const SubscribeController = require("./controller/application/SubscribeController");
const ScratchCardController = require("./controller/application/ScratchCardController");
const NumberController = require("./controller/application/NumberController");
const JobController = require("./controller/application/JobController");
const { transfer } = require("./middleware/dcWebhook");
const redis = require("./util/redis");
const i18n = require("./util/i18n");
const traffic = require("./util/traffic");
const { showManagePlace } = require("./templates/application/Admin");
const { pushMessage } = require("./util/LineNotify");
const AdminModel = require("./model/application/Admin");
const axios = require("axios");
const pConfig = require("config");
const FetchGameData = require("../bin/FetchGameData");
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
      route(() => action === "battleSignUp", withProps(battle.BattlePostSignUp, { payload })),
      route(() => action === "battleCancel", withProps(battle.BattlePostCancel, { payload })),
      route(
        () => action === "worldBossAttack",
        withProps(WorldBossController.attackOnBoss, { payload })
      ),
      route(() => action === "janken", withProps(JankenController.decide, { payload })),
      route(() => action === "challenge", withProps(JankenController.challenge, { payload })),
      route(() => action === "vote", withProps(VoteController.decide, { payload })),
      route(
        () => action === "confirmTransfer",
        withProps(MarketController.doTransfer, { payload })
      ),
      route(() => action === "lottery_auto_buy", withProps(LotteryController.autoBuy, { payload })),
      route(
        () => action === "exchangeScratchCard",
        withProps(ScratchCardController.exchange, { payload })
      ),
      route(() => action === "sicBoGuess", withProps(NumberController.postbackDecide, { payload })),
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
    ...GuildServiceController.router,
    ...AdvertisementController.router,
    ...GodStoneShopController.router,
    ...JankenController.router,
    ...AdvancementController.router,
    ...VoteController.router,
    ...GambleController.router,
    ...MarketController.router,
    ...CouponController.router,
    ...ImageController.router,
    ...StatusController.router,
    ...LotteryController.router,
    ...BullshitController.router,
    ...SubscribeController.router,
    ...ScratchCardController.router,
    ...CharacterController.router,
    ...(type === "user" ? NumberController.router : []),
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
      let carousel = {
        type: "carousel",
        contents: [
          commonTemplate.genLinkBubble("🏠首頁", `${liffUri}`, "red"),
          commonTemplate.genLinkBubble("🏆排行榜", `${liffUri}?reactRedirectUri=/Rankings`, "red"),
          commonTemplate.genLinkBubble(
            "📑指令集",
            `${liffUri}?reactRedirectUri=/Panel/Manual`,
            "red"
          ),
          commonTemplate.genLinkBubble(
            "⏱️刀軸轉換",
            `${liffUri}?reactRedirectUri=/Tools/BattleTime`,
            "green"
          ),
          commonTemplate.genLinkBubble(
            "📢訂閱系統",
            `${liffUri}?reactRedirectUri=/Bot/Notify`,
            "green"
          ),
          commonTemplate.genLinkBubble(
            "巴哈更新",
            pConfig.get("links.bahamut"),
            pConfig.get("color.bahamut"),
            {
              textColor: "#ffffff",
            }
          ),
          commonTemplate.genLinkBubble(
            "Discord",
            pConfig.get("links.discord"),
            pConfig.get("color.discord"),
            {
              textColor: "#ffffff",
            }
          ),
          commonTemplate.genLinkBubble(
            "Github",
            pConfig.get("links.github"),
            pConfig.get("color.github"),
            {
              textColor: "#ffffff",
            }
          ),
        ],
      };

      context.replyFlex("實用連結", carousel);
    }),
    text(".test", () => pushMessage({ message: "test", token: process.env.LINE_NOTIFY_TOKEN })),
    route("*", next),
  ]);
}

function AdminOrder() {
  return [
    text(/^[.#/](後台管理|system(call)?)/i, showManagePlace),
    text(/^[.#]setexp\s(?<userId>(U[a-f0-9]{32}))\s(?<exp>\d+)/, ChatLevelController.setEXP),
    text(/^[.#]setrate\s(?<expRate>\d+)/, ChatLevelController.setEXPRate),
    text("!download", FetchGameData),
    ...GambleController.adminRouter,
    ...AdvancementController.adminRouter,
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
    text(/^[#.]gbs/, battle.BattleSignUp),
    text(/^[#.]gbc(\s(?<week>[1-9]{1}(\d{0,2})?))?(\s(?<boss>[1-5]{1}))?$/, battle.BattleCancel),
    text(
      /^[#.](gb|刀表)(\s(?<week>[1-9]{1}(\d{0,2})?))?(\s(?<boss>[1-5]{1}))?$/,
      battle.BattleList
    ),
    text(/^[#.](檢視下一?[周週][回次]|shownextweek)$/, battle.NextBattleList),
    text(/^[#.](檢視上一?[周週][回次]|showlastweek)$/, battle.PreBattleList),
    text(/^[#.]((前往)?(下一?[周週][回次])|nextweek)$/, battle.IncWeek),
    text(/^[#.]((回去)?(上一?[周週][回次])|lastweek)$/, battle.DecWeek),
    text(/^[#.]([五5]王倒了|finishweek)$/, battle.FinishWeek),
    text(/^[#.](設定[周週][回次]|setweek)(\s(?<week>\d+))?$/, battle.SetWeek),
    text(/^[#.](當[周週][回次]報名表|nowweek)$/, battle.CurrentBattle),
    text(/^[#.](三刀出完|出完三刀|done)$/, battle.reportFinish),
    text(/^[#.](三刀重置|重置三刀|reset)$/, battle.reportReset),
    text(/^[#.](出完沒|趕快出|gblist)(\s(?<date>\d{1,2}))?$/, battle.showSigninList),
    text(/^[#.](signtest)$/, battle.SignMessageTest),
    text(["#刀軸轉換", ".bt", "/bt"], context => {
      let bubble = commonTemplate.genLinkBubble(
        "⏱️刀軸轉換",
        `${commonTemplate.getLiffUri("full")}?reactRedirectUri=/Tools/BattleTime`,
        "green"
      );

      return context.replyFlex("刀軸轉換按鈕", bubble);
    }),
  ];
}

async function CustomerOrderBased(context, { next }) {
  if (!context.event.isText) return next;
  if (context.state.guildConfig.CustomerOrder === "N") return next;

  var detectResult = await customerOrder.CustomerOrderDetect(context);

  if (detectResult === false) return next;
}

function interactWithBot(context) {
  return router([
    askBot("你好", context => context.replyText("你好啊！")),
    askBot(["誰的問題", "誰在搞"], whosProblem),
  ]);
}

const recordLatestGroupUser = async (context, { next }) => {
  if (context.event.source.type !== "group") return next;
  const { userId, groupId } = context.event.source;
  const key = `latestGroupUser:${groupId}`;
  await redis.zAdd(key, [
    {
      score: Date.now(),
      value: userId,
    },
  ]);
  // 保留 timestamp 在 30 分鐘內的資料
  await redis.zRemRangeByScore(key, 0, Date.now() - 30 * 60 * 1000);
  return next;
};

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
    GlobalOrderBase, // 全群指令分析
    OrderBased, // 指令分析
    CustomerOrderBased, // 自訂指令分析
    interactWithBot, // 標記機器人回應
    Nothing, // 無符合事件
  ]);
}

module.exports = App;
