const ChatLevelModel = require("../../model/application/ChatLevelModel");
const ChatLevelTemplate = require("../../templates/application/ChatLevel");
const MeTemplate = require("../../templates/application/Me");
const { DefaultLogger } = require("../../util/Logger");
const { getClient } = require("bottender");
const mysql = require("../../util/mysql");
const { evaluateBuildAchievementKeys, PRESTIGE_CAP } = require("../../service/PrestigeService");
const LineClient = getClient("line");
const GachaModel = require("../../model/princess/gacha");
const GachaRecord = require("../../model/princess/GachaRecord");
const JankenResult = require("../../model/application/JankenResult");
const SigninModel = require("../../model/application/SigninDays");
const DailyQuestModel = require("../../model/application/DailyQuest");
const DonateModel = require("../../model/application/DonateList");
const SubscribeUserModel = require("../../model/application/SubscribeUser");
const SubscribeCardModel = require("../../model/application/SubscribeCard");
const SubscriptionService = require("../../service/SubscriptionService");
const { get } = require("lodash");
const moment = require("moment");
const i18n = require("../../util/i18n");
const { inventory } = require("../../model/application/Inventory");

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

    const {
      range = "等待投胎",
      level = 0,
      ranking = "?",
      exp = 0,
    } = await ChatLevelModel.getUserData(userId);
    const expDatas = await ChatLevelModel.getExpUnitData();
    const nowThreshold = expDatas.find(d => d.level === level)?.exp ?? 0;
    const nextThreshold = expDatas.find(d => d.level === level + 1)?.exp ?? 0;
    const expCurrent = Math.max(0, exp - nowThreshold);
    const expNext = Math.max(0, nextThreshold - nowThreshold);
    const expRate = expNext > 0 ? Math.round((expCurrent / expNext) * 100) : 0;

    const [
      characterCurrent = 0,
      characterTotal = 0,
      godStone = 0,
      jankenResult,
      signinInfo,
      questInfo,
      donateAmount,
      subscribeInfo,
      gachaHistory,
      gachaProgress,
    ] = await Promise.all([
      GachaModel.getUserCollectedCharacterCount(userId),
      GachaModel.getPrincessCharacterCount(),
      GachaModel.getUserGodStoneCount(userId),
      JankenResult.findUserGrade(userId),
      SigninModel.first({ filter: { user_id: userId } }),
      getQuestInfo(userId),
      DonateModel.getUserTotalAmount(userId),
      getSubscribeInfo(userId),
      getGachaHistory(userId),
      getGachaCollectProgress(userId),
    ]);

    const winCount = get(
      jankenResult.find(data => data.result === JankenResult.resultMap.win),
      "count",
      0
    );
    const loseCount = get(
      jankenResult.find(data => data.result === JankenResult.resultMap.lose),
      "count",
      0
    );
    const drawCount = get(
      jankenResult.find(data => data.result === JankenResult.resultMap.draw),
      "count",
      0
    );
    const decisive = winCount + loseCount;
    const winRate = decisive > 0 ? Math.floor((winCount / decisive) * 100) : null;

    const subscriptionRank = k => (k === "month" ? 0 : k === "season" ? 1 : 99);
    const subscriptionCards = (subscribeInfo || [])
      .slice()
      .sort((a, b) => subscriptionRank(a.key) - subscriptionRank(b.key))
      .map(card => ({
        key: card.key,
        titleText: i18n.__(`message.subscribe.${card.key}`),
        expireText: moment(card.end_at).format("YYYY-MM-DD"),
        effects: (card.effects || []).map(effect => SubscriptionService.formatEffectRow(effect)),
      }));

    const bubbles = MeTemplate.buildBubbles({
      displayName,
      pictureUrl,
      level,
      range,
      ranking,
      expRate,
      expCurrent,
      expNext,
      today: {
        gacha: questInfo.gacha,
        janken: questInfo.janken,
        weeklyCompleted: questInfo.weeklyCompletedCount,
      },
      signinDays: get(signinInfo, "sum_days", 0),
      characterCurrent,
      characterTotal,
      starProgress: gachaProgress.progress,
      godStone,
      paidStone: donateAmount || 0,
      lastRainbowDays: gachaHistory.rainbow,
      lastHasNewDays: gachaHistory.hasNew,
      janken: { win: winCount, lose: loseCount, draw: drawCount, rate: winRate },
      subscriptionCards,
    });

    context.replyFlex(`${displayName} 的狀態`, { type: "carousel", contents: bubbles });
  } catch (e) {
    console.error(e);
    DefaultLogger.error(e);
  }
};

/**
 * 取得轉蛋進度
 * @param {String} userId
 * @returns {Promise<{userTotalStar: Number, totalStarInGame: Number, progress: Number}>}
 */
async function getGachaCollectProgress(userId) {
  const ownItems = await inventory.getAllUserOwnCharacters(userId);
  const princessCountInGame = await GachaModel.getPrincessCharacterCount();
  const userTotalStar = ownItems.reduce((acc, item) => {
    const attributes = item?.attributes;
    if (!Array.isArray(attributes)) return acc;
    const star = attributes.find(attr => attr.key === "star");
    const value = parseInt(star?.value, 10);
    return Number.isFinite(value) ? acc + value : acc;
  }, 0);

  const totalStarInGame = princessCountInGame * 5;
  const progress = totalStarInGame > 0 ? Math.floor((userTotalStar / totalStarInGame) * 100) : 0;

  return { userTotalStar, totalStarInGame, progress };
}

async function getGachaHistory(userId) {
  const [lastRainbowRecord, lastHasNewRecord] = await Promise.all([
    GachaRecord.first({
      filter: {
        user_id: userId,
        rainbow: { operator: ">", value: 0 },
      },
      order: [{ column: "created_at", direction: "desc" }],
    }),
    GachaRecord.first({
      filter: { user_id: userId, has_new: 1 },
      order: [{ column: "created_at", direction: "desc" }],
    }),
  ]);

  const now = moment();
  const countLastDay = createdAt => now.diff(moment(createdAt).startOf("day"), "days");

  return {
    rainbow: lastRainbowRecord ? countLastDay(lastRainbowRecord.created_at) : null,
    hasNew: lastHasNewRecord ? countLastDay(lastHasNewRecord.created_at) : null,
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

exports.api = {};

/**
 * Resolve a single buildTag string from the array returned by
 * evaluateBuildAchievementKeys, applying priority: breeze > torrent >
 * temperature > solitude.
 *
 * Note: evaluateBuildAchievementKeys emits "blessing_solitude" for any user
 * who does not own blessing id 6 — including users with zero blessings. The
 * >=3 owned-blessings check below is a DISPLAY-ONLY gate enforced here to
 * avoid tagging fresh accounts as solitude build.
 */
function resolveBuildTag(keys, ownedBlessingIds) {
  const priority = ["blessing_breeze", "blessing_torrent", "blessing_temperature"];
  for (const key of priority) {
    if (keys.includes(key)) return key.replace("blessing_", "");
  }
  if (keys.includes("blessing_solitude") && ownedBlessingIds.length >= 3) {
    return "solitude";
  }
  return null;
}

// Global top-10 across all groups (intentional). Per-group rankings live
// at GET /api/groups/:groupId/speak-rank (see api.js:79).
exports.api.queryRank = async (req, res) => {
  const rows = await mysql("chat_user_data")
    .select("user_id", "current_level", "current_exp", "prestige_count")
    .where("current_exp", ">", 0)
    .orderBy("current_exp", "desc")
    .orderBy("user_id", "asc")
    .limit(10);

  if (rows.length === 0) {
    return res.json([]);
  }

  const userIds = rows.map(r => r.user_id);

  // Batch-fetch all blessing ids for ranked users in a single query
  const blessingRows = await mysql("user_blessings")
    .select("user_id", "blessing_id")
    .whereIn("user_id", userIds);

  // Group blessing ids by user_id
  const blessingMap = {};
  for (const row of blessingRows) {
    if (!blessingMap[row.user_id]) blessingMap[row.user_id] = [];
    blessingMap[row.user_id].push(row.blessing_id);
  }

  // Resolve displayName for each user in parallel (user_id IS the LINE platform id in new schema)
  const result = await Promise.all(
    rows.map(async (row, index) => {
      const { displayName } = await LineClient.getUserProfile(row.user_id)
        .then(user => ({ displayName: user.displayName || `未知${index + 1}` }))
        .catch(() => ({ displayName: `未知${index + 1}` }));

      const ownedBlessingIds = blessingMap[row.user_id] || [];
      const buildKeys = evaluateBuildAchievementKeys(ownedBlessingIds);
      const buildTag = resolveBuildTag(buildKeys, ownedBlessingIds);

      // awakened = reached prestige cap (5); PRESTIGE_CAP imported from PrestigeService
      const awakened = row.prestige_count >= PRESTIGE_CAP;

      return {
        rank: index + 1,
        level: row.current_level,
        experience: row.current_exp,
        prestigeCount: row.prestige_count,
        awakened,
        blessingIds: ownedBlessingIds,
        buildTag,
        displayName,
      };
    })
  );

  res.json(result);
};
