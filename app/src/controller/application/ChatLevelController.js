const ChatLevelModel = require("../../model/application/ChatLevelModel");
const ChatLevelTemplate = require("../../templates/application/ChatLevel");
const { DefaultLogger } = require("../../util/Logger");
const UserModel = require("../../model/application/UserModel");
const { getClient } = require("bottender");
const LineClient = getClient("line");
const GachaModel = require("../../model/princess/gacha");
const GachaRecord = require("../../model/princess/GachaRecord");
const GachaTemplate = require("../../templates/princess/gacha").line;
const NotifyController = require("./NotifyController");
const uidModel = require("../../model/princess/uid");
const ProfileTemplate = require("../../templates/application/Profile");
const MinigameTemplate = require("../../templates/application/Minigame");
const DailyTemplate = require("../../templates/application/DailyQuest");
const SubscribeTemplate = require("../../templates/application/Subscribe");
const JankenResult = require("../../model/application/JankenResult");
const SigninModel = require("../../model/application/SigninDays");
const DailyQuestModel = require("../../model/application/DailyQuest");
const DonateModel = require("../../model/application/DonateList");
const AdvancementModel = require("../../model/application/Advancement");
const SubscribeUserModel = require("../../model/application/SubscribeUser");
const SubscribeCardModel = require("../../model/application/SubscribeCard");
const { get, sample, set } = require("lodash");
const config = require("config");
const moment = require("moment");
const i18n = require("../../util/i18n");

/**
 * 顯示個人狀態，現複合了其他布丁系統的資訊
 * @param {import("bottender").LineContext} context
 */
exports.showStatus = async (context, props) => {
  try {
    const userId = get(props, "userId", context.event.source.userId);
    const profile =
      context.event.source.type === "user"
        ? context.event.source
        : await LineClient.getGroupMemberProfile(context.event.source.groupId, userId);
    let { displayName, pictureUrl } = profile;
    pictureUrl = pictureUrl || "https://i.imgur.com/NMl4z2u.png";

    if (!userId || !displayName) {
      context.replyText("獲取失敗，無法辨識用戶");
      throw "userId or displayName is empty";
    }

    let { rank, range, level, ranking, exp } = await ChatLevelModel.getUserData(userId);

    let expDatas = await ChatLevelModel.getExpUnitData();

    let targets = expDatas.filter(data => data.level === level + 1 || data.level === level);
    let expRate = 0;

    if (targets.length === 2) {
      let [nowExpData, nextExpData] = targets;
      expRate = Math.round(((exp - nowExpData.exp) / (nextExpData.exp - nowExpData.exp)) * 100);
    }

    const [
      current = 0,
      total = 0,
      godStone = 0,
      subData,
      bindInfo,
      jankenResult,
      signinInfo,
      questInfo,
      donateAmount,
      achievement,
      subscribeInfo,
      gachaHistory,
    ] = await Promise.all([
      GachaModel.getUserCollectedCharacterCount(userId),
      GachaModel.getPrincessCharacterCount(),
      GachaModel.getUserGodStoneCount(userId),
      NotifyController.getData(userId),
      uidModel.getData(userId),
      JankenResult.findUserGrade(userId),
      SigninModel.first({ filter: { user_id: userId } }),
      getQuestInfo(userId),
      DonateModel.getUserTotalAmount(userId),
      AdvancementModel.findUserAdvancementsByPlatformId(userId),
      getSubscribeInfo(userId),
      getGachaHistory(userId),
    ]);

    let subInfo;
    if (subData) {
      subInfo = NotifyController.getSubData(subData.subType);
    } else {
      subInfo = NotifyController.getSubData(0);
    }

    const bubbles = [];

    // ---------- 整理聊天數據 ----------
    const chatlevelBubble = ChatLevelTemplate.showStatus({
      displayName,
      range,
      rank,
      level,
      ranking,
      pictureUrl,
      expRate,
      exp,
      achievement: get(sample(achievement), "name", "-"),
    });

    // ---------- 整理訂閱數據 ----------
    const monthCard = subscribeInfo.find(data => data.key === "month");
    let monthBubble;
    if (monthCard) {
      monthBubble = SubscribeTemplate.generateStatus({
        title: i18n.__("message.subscribe.month"),
        effects: monthCard.effects.map(effect =>
          SubscribeTemplate.generateEffect(
            i18n.__("message.subscribe.effects_row_positive", {
              type: i18n.__(`message.subscribe.effects.${effect.type}`),
              value: effect.value,
            }),
            "blue"
          )
        ),
        expiredAt: moment(monthCard.end_at).format("YYYY-MM-DD"),
        theme: "blue",
      });
    }

    const seasonCard = subscribeInfo.find(data => data.key === "season");
    let seasonBubble;
    if (seasonCard) {
      seasonBubble = SubscribeTemplate.generateStatus({
        title: i18n.__("message.subscribe.season"),
        effects: seasonCard.effects.map(effect =>
          SubscribeTemplate.generateEffect(
            i18n.__("message.subscribe.effects_row_positive", {
              type: i18n.__(`message.subscribe.effects.${effect.type}`),
              value: effect.value,
            }),
            "red"
          )
        ),
        expiredAt: moment(seasonCard.end_at).format("YYYY-MM-DD"),
        theme: "red",
      });
    }

    // ---------- 整理轉蛋數據 ----------
    const gachaBubble = GachaTemplate.genGachaStatus({
      current,
      total,
      godStone,
      paidStone: donateAmount || 0,
      gachaHistory,
    });

    // ---------- 整理其他雜項數據 ----------
    const otherBubble = ProfileTemplate.genOtherInformations({ bindInfo, subInfo });

    // ---------- 整理猜拳數據 ----------
    let winCount = get(
      jankenResult.find(data => data.result === JankenResult.resultMap.win),
      "count",
      0
    );
    let loseCount = get(
      jankenResult.find(data => data.result === JankenResult.resultMap.lose),
      "count",
      0
    );
    let drawCount = get(
      jankenResult.find(data => data.result === JankenResult.resultMap.draw),
      "count",
      0
    );
    let rate = Math.floor((winCount / (winCount + loseCount)) * 100) || 0;
    const jankenGradeBubble = MinigameTemplate.generateJankenGrade({
      winCount,
      loseCount,
      drawCount,
      rate,
    });

    const dailyBubble = DailyTemplate.genDailyInfo({
      ...questInfo,
      sumDays: get(signinInfo, "sum_days", 0),
    });

    bubbles.push(chatlevelBubble, dailyBubble, gachaBubble, jankenGradeBubble, otherBubble);
    const subscribeBubbles = [];

    if (monthBubble) {
      bubbles.forEach(bubble =>
        changeBackgroundColor(bubble, config.get("subscribe.month_user_background_color"))
      );
      subscribeBubbles.push(monthBubble);
    }

    if (seasonBubble) {
      bubbles.forEach(bubble =>
        changeBackgroundColor(bubble, config.get("subscribe.season_user_background_color"))
      );
      subscribeBubbles.push(seasonBubble);
    }

    subscribeBubbles && bubbles.push(...subscribeBubbles);

    context.replyFlex(`${displayName} 的狀態`, { type: "carousel", contents: bubbles });

    const isSelf = context.event.source.userId === userId;
    if (!level && isSelf) {
      context.replyText("尚未有任何數據，經驗開始累積後即可投胎！");
    }
  } catch (e) {
    DefaultLogger.error(e);
  }
};

async function getGachaHistory(userId) {
  const lastRainbowRecord = await GachaRecord.first({
    filter: {
      user_id: userId,
      rainbow: {
        operator: ">",
        value: 0,
      },
    },
    order: [{ column: "created_at", direction: "desc" }],
  });

  const lastHasNewRecord = await GachaRecord.first({
    filter: {
      user_id: userId,
      has_new: 1,
    },
    order: [{ column: "created_at", direction: "desc" }],
  });

  const now = moment();
  const countLastDay = createdAt => {
    const start = moment(createdAt).startOf("day");
    return now.diff(start, "days");
  };

  let lastRainbow = "-";
  if (lastRainbowRecord) {
    lastRainbow = countLastDay(lastRainbowRecord.created_at);
  }

  let lastHasNew = "-";
  if (lastHasNewRecord) {
    lastHasNew = countLastDay(lastHasNewRecord.created_at);
  }

  return {
    rainbow: lastRainbow,
    hasNew: lastHasNew,
  };
}

function getSubscribeInfo(userId) {
  return SubscribeUserModel.knex
    .select(["effects", "end_at", "key"])
    .where({ user_id: userId })
    .join(
      SubscribeCardModel.table,
      SubscribeCardModel.getColumnName("key"),
      SubscribeUserModel.getColumnName("subscribe_card_key")
    );
}

async function getQuestInfo(userId) {
  const start = moment().startOf("day").toDate();
  const end = moment().endOf("day").toDate();
  let jankenOptions = {
    filter: {
      userId,
      createdAt: {
        start,
        end,
      },
    },
  };

  let signinOptions = {
    filter: {
      user_id: userId,
    },
  };

  let weeklyQuestOptions = {
    filter: {
      createdAt: {
        start: moment().startOf("week").toDate(),
        end: moment().endOf("week").toDate(),
      },
    },
  };

  let [gachaRecord, jankenResult, weekQuestRecord] = await Promise.all([
    GachaRecord.first(signinOptions).andWhereBetween("created_at", [start, end]),
    JankenResult.all(jankenOptions),
    DailyQuestModel.all(userId, weeklyQuestOptions),
  ]);

  return {
    gacha: !!gachaRecord,
    janken: jankenResult.length > 0,
    weeklyCompletedCount: weekQuestRecord.length,
  };
}

exports.showFriendStatus = async context => {
  const { mention, text } = context.event.message;
  if (!mention) {
    return context.replyText("請tag想要查詢的夥伴們！");
  }
  let users = mention.mentionees.map(d => ({
    ...d,
    displayName: text.substr(d.index + 1, d.length - 1),
  }));
  let userDatas = await ChatLevelModel.getUserDatas(users.map(user => user.userId));
  let messages = userDatas.map((data, index) =>
    [
      index + 1,
      users.find(user => user.userId === data.userId).displayName,
      `${data.level}等`,
      `${data.ranking}名`,
    ].join("\t")
  );

  if (messages.length === 0) {
    context.replyText("查詢失敗！");
  } else {
    messages = [">>>查詢結果<<<", ...messages];
    context.replyText(messages.join("\n"));
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
    context.replyText(msg, { sender: { name: "管理員指令" } });
  });
};

/**
 * 管理員密技，直接設定經驗值倍率
 * @param {Context} context
 * @param {Object} param1
 * @param {Object} param1.match
 */
exports.setEXPRate = (context, { match }) => {
  let { expRate } = match.groups;
  console.log(expRate, "修改經驗倍率");
  ChatLevelModel.setExperienceRate(expRate).then(result => {
    let msg = result ? "修改成功" : "修改失敗";
    context.replyText(msg, { sender: { name: "管理員指令" } });
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

function changeBackgroundColor(bubble, color) {
  set(bubble, "header.backgroundColor", color);
  set(bubble, "body.backgroundColor", color);
}

exports.api = {};

exports.api.queryRank = async (req, res) => {
  let data = await ChatLevelModel.getRankList(1);
  let ids = data.map(d => d.id);

  let platformIds = await UserModel.getPlatformIds(ids);
  let hashPlatformIds = {};

  platformIds.forEach(v => {
    hashPlatformIds[v.id] = v.userId;
  });

  let result = await Promise.all(
    data.map(async (d, index) => {
      let { displayName } = await LineClient.getUserProfile(hashPlatformIds[d.id])
        .then(user => ({ displayName: user.displayName || `未知${index + 1}` }))
        .catch(() => ({
          displayName: `未知${index + 1}`,
        }));
      let { rank, experience } = d;
      let level = await ChatLevelModel.getLevel(experience);
      return {
        rank,
        level,
        experience,
        displayName,
      };
    })
  );

  res.json(result);
};
