const ChatUserData = require("../../model/application/ChatUserData");
const ChatExpUnit = require("../../model/application/ChatExpUnit");
const ChatExpDaily = require("../../model/application/ChatExpDaily");
const PrestigeTrial = require("../../model/application/PrestigeTrial");
const UserBlessing = require("../../model/application/UserBlessing");
const PrestigeBlessing = require("../../model/application/PrestigeBlessing");
const UserPrestigeTrial = require("../../model/application/UserPrestigeTrial");
const UserPrestigeHistory = require("../../model/application/UserPrestigeHistory");
const MeTemplate = require("../../templates/application/Me");
const PrestigeStatusTemplate = require("../../templates/application/Prestige/Status");
const commonTemplate = require("../../templates/common");
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
 * Build the prestige status flags shown on the adventure card / queries.
 * Awakened players never show the active-trial flag (cap reached).
 *
 * @param {Object} input
 * @param {Number} input.prestigeCount
 * @param {Boolean} input.awakened
 * @param {Number|null} input.activeTrialStar
 * @returns {Array<String>}
 */
function buildPrestigeFlags({ prestigeCount, awakened, activeTrialStar }) {
  const flags = [];
  if (awakened) flags.push("✨ 覺醒者");
  if (!awakened && activeTrialStar) flags.push(`⚔️ ★${activeTrialStar} 試煉中`);
  if (!awakened && prestigeCount === 0) flags.push("🌱 蜜月 +20% XP");
  if (!awakened && prestigeCount > 0) {
    flags.push(`${"★".repeat(prestigeCount)} 轉生 ${prestigeCount} 次`);
  }
  return flags;
}

/**
 * Resolve the active trial star number from the user row + cached trial defs.
 */
function resolveActiveTrialStar(activeTrialId, allTrials) {
  if (!activeTrialId) return null;
  const cfg = allTrials.find(t => t.id === activeTrialId);
  return cfg ? cfg.star : null;
}

/**
 * Mirror diminishTier.js tier-cap resolution for display purposes.
 * Blessing 4 expands tier1 (0-400 → 0-600); blessing 5 expands tier2 (400-1000 → 400-1200).
 */
function resolveDiminishTiers(blessingIds) {
  const ids = Array.isArray(blessingIds) ? blessingIds : [];
  return {
    tier1Upper: ids.includes(4) ? 600 : 400,
    tier2Upper: ids.includes(5) ? 1200 : 1000,
  };
}

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

    const today = moment().utcOffset(480).format("YYYY-MM-DD");
    const [chatRow, expRows, allTrials, dailyRow, blessingIds] = await Promise.all([
      ChatUserData.findByUserId(userId),
      ChatExpUnit.all(),
      PrestigeTrial.all(),
      ChatExpDaily.findByUserDate(userId, today),
      UserBlessing.listBlessingIdsByUserId(userId),
    ]);
    const dailyRaw = dailyRow?.raw_exp ?? 0;
    const { tier1Upper, tier2Upper } = resolveDiminishTiers(blessingIds);

    const prestigeCount = chatRow?.prestige_count ?? 0;
    const currentLevel = chatRow?.current_level ?? 0;
    const currentExp = chatRow?.current_exp ?? 0;
    const activeTrialId = chatRow?.active_trial_id ?? null;
    const awakened = prestigeCount >= PRESTIGE_CAP;

    const nowThreshold = ChatExpUnit.getTotalExpForLevel(currentLevel, expRows) ?? 0;
    const nextThreshold = ChatExpUnit.getTotalExpForLevel(currentLevel + 1, expRows) ?? 0;
    const expCurrent = Math.max(0, currentExp - nowThreshold);
    const expNext = Math.max(0, nextThreshold - nowThreshold);
    const expRate = expNext > 0 ? Math.round((expCurrent / expNext) * 100) : 0;

    const activeTrialStar = resolveActiveTrialStar(activeTrialId, allTrials);
    const flags = buildPrestigeFlags({ prestigeCount, awakened, activeTrialStar });

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
      level: currentLevel,
      expRate,
      expCurrent,
      expNext,
      flags,
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
      dailyRaw,
      tier1Upper,
      tier2Upper,
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

/**
 * Resolve the unconsumed passed trial (ready to be consumed by next prestige), if any.
 */
async function resolveReadyTrial(userId, allTrials) {
  const passed = (await UserPrestigeTrial.listPassedByUserId(userId)) || [];
  if (passed.length === 0) return null;
  const consumed = (await UserPrestigeHistory.listByUserId(userId)) || [];
  const consumedSet = new Set(consumed.map(h => h.trial_id));
  const unconsumed = passed.find(p => !consumedSet.has(p.trial_id));
  if (!unconsumed) return null;
  const cfg = allTrials.find(t => t.id === unconsumed.trial_id);
  if (!cfg) return null;
  return { star: cfg.star, display_name: cfg.display_name };
}

function parseRestrictionMeta(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * `!轉生狀態` — Flex bubble of prestige progress (4 scenarios: honeymoon /
 * in-trial / ready-to-prestige / awakened).
 * @param {import("bottender").LineContext} context
 */
exports.showPrestigeStatus = async context => {
  try {
    const userId = context.event.source.userId;
    if (!userId) return;

    const profile =
      context.event.source.type === "user"
        ? context.event.source
        : await LineClient.getGroupMemberProfile(context.event.source.groupId, userId).catch(
            () => null
          );
    const displayName = profile?.displayName || "你";
    const pictureUrl = profile?.pictureUrl;

    const [chatRow, expRows, allTrials, allBlessingDefs, ownedRows] = await Promise.all([
      ChatUserData.findByUserId(userId),
      ChatExpUnit.all(),
      PrestigeTrial.all(),
      PrestigeBlessing.all(),
      UserBlessing.listByUserId(userId),
    ]);

    const prestigeCount = chatRow?.prestige_count ?? 0;
    const awakened = prestigeCount >= PRESTIGE_CAP;
    const currentLevel = chatRow?.current_level ?? 0;
    const currentExp = chatRow?.current_exp ?? 0;
    const activeTrialId = chatRow?.active_trial_id ?? null;
    const activeTrialStartedAt = chatRow?.active_trial_started_at ?? null;
    const activeTrialProgress = chatRow?.active_trial_exp_progress ?? 0;

    const nowThreshold = ChatExpUnit.getTotalExpForLevel(currentLevel, expRows) ?? 0;
    const nextThreshold = ChatExpUnit.getTotalExpForLevel(currentLevel + 1, expRows) ?? 0;
    const expCurrent = Math.max(0, currentExp - nowThreshold);
    const expNext = Math.max(0, nextThreshold - nowThreshold);
    const expRate = expNext > 0 ? Math.round((expCurrent / expNext) * 100) : 0;

    const activeTrialCfg = activeTrialId ? allTrials.find(t => t.id === activeTrialId) : null;
    const activeTrial = activeTrialCfg
      ? {
          ...activeTrialCfg,
          restriction_meta: parseRestrictionMeta(activeTrialCfg.restriction_meta),
        }
      : null;

    let activeTrialRemainingDays = null;
    let activeTrialDeadlineLabel = null;
    if (activeTrial && activeTrialStartedAt) {
      const expiresAt = moment(activeTrialStartedAt).add(activeTrial.duration_days || 60, "days");
      activeTrialRemainingDays = Math.max(0, expiresAt.diff(moment(), "days"));
      activeTrialDeadlineLabel = expiresAt.format("MM/DD");
    }

    const readyTrial = awakened ? null : await resolveReadyTrial(userId, allTrials);

    const blessingDefById = new Map(allBlessingDefs.map(b => [b.id, b]));
    const ownedBlessings = ownedRows
      .map(r => blessingDefById.get(r.blessing_id))
      .filter(Boolean)
      .map(b => ({ slug: b.slug, display_name: b.display_name }));

    const liffUri = commonTemplate.getLiffUri("full", "/prestige");
    const liffUriSummary = `${liffUri}?view=summary`;

    const flex = PrestigeStatusTemplate.build({
      displayName,
      pictureUrl,
      prestigeCount,
      awakened,
      level: currentLevel,
      expCurrent,
      expNext,
      expRate,
      activeTrial,
      activeTrialProgress,
      activeTrialRemainingDays,
      activeTrialDeadlineLabel,
      readyTrial,
      ownedBlessings,
      liffUri,
      liffUriSummary,
    });

    context.replyFlex(flex.altText, flex.contents);
  } catch (e) {
    console.error(e);
    DefaultLogger.error(e);
  }
};

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

// Exposed for unit tests.
exports._internal = { buildPrestigeFlags, resolveActiveTrialStar };
