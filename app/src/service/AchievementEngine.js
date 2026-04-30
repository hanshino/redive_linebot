const AchievementModel = require("../model/application/Achievement");
const UserAchievementModel = require("../model/application/UserAchievement");
const UserProgressModel = require("../model/application/UserAchievementProgress");
const CategoryModel = require("../model/application/AchievementCategory");
const { DefaultLogger } = require("../util/Logger");
const mysql = require("../util/mysql");
const redis = require("../util/redis");
const { LV_MAX_TOTAL_EXP } = require("../../seeds/ChatExpUnitSeeder");

// --- In-memory cache for achievement definitions (24 rows, rarely changes) ---
let achievementCache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getCache() {
  if (achievementCache && Date.now() < cacheExpiry) return achievementCache;
  achievementCache = await AchievementModel.allWithCategories();
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return achievementCache;
}

// For testing: allow injecting cache directly
exports._setCache = data => {
  achievementCache = data;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
};

// Shared by evaluate() and getUserSummary() so ineligible rows are filtered
// from both the unlock path and the collection-rate denominator.
function isEligible(userId, achievement) {
  const eligibility =
    (achievement && achievement.condition && achievement.condition.eligibility) || null;
  if (!eligibility) return true;
  const include = Array.isArray(eligibility.includeUserIds) ? eligibility.includeUserIds : null;
  const exclude = Array.isArray(eligibility.excludeUserIds) ? eligibility.excludeUserIds : [];
  if (exclude.includes(userId)) return false;
  if (include && !include.includes(userId)) return false;
  return true;
}
exports._isEligible = isEligible;

function matchesAllKeywords(text, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return true;
  return keywords.every(k => text.includes(k));
}

// Maps event types to achievement keys
const EVENT_ACHIEVEMENT_MAP = {
  chat_message: [
    "chat_100",
    "chat_1000",
    "chat_5000",
    "chat_night_owl",
    "chat_multi_group",
    "social_all_features",
  ],
  gacha_pull: [
    "gacha_first",
    "gacha_100",
    "gacha_500",
    "gacha_collector_50",
    "gacha_lucky",
    "gacha_europe_1",
    "gacha_europe_10",
    "gacha_europe_50",
    "gacha_pickup_1",
    "gacha_pickup_10",
    "gacha_pickup_50",
    "gacha_ensure_1",
    "gacha_ensure_10",
    "gacha_ensure_50",
    "social_all_features",
  ],
  janken_win: [
    "janken_first_win",
    "janken_win_50",
    "janken_streak_5",
    "janken_streak_10",
    "social_all_features",
  ],
  janken_lose: [],
  janken_draw: [],
  janken_challenge: ["janken_challenged_10", "social_all_features"],
  boss_attack: [
    "boss_first_kill",
    "boss_level_10",
    "boss_level_50",
    "boss_top_damage",
    "social_all_features",
  ],
  command_use: ["social_first_command"],
  subscribe: ["subscribe_first", "subscribe_3", "subscribe_6", "subscribe_12"],
  mention_keyword: ["mention_admin_hi", "mention_memory_seeker", "mention_void_gazer"],
  received_mention: [
    "mention_admin_hi_self",
    "mention_memory_seeker_self",
    "mention_void_gazer_self",
  ],
};

// --- Progress calculation strategies by achievement type ---

const STRATEGIES = {
  increment(currentValue) {
    return currentValue + 1;
  },
  instant(currentValue, achievement) {
    return achievement.target_value;
  },
  contextValue(currentValue, achievement, context, contextKey) {
    return context[contextKey] !== undefined ? context[contextKey] : currentValue;
  },
  threshold(currentValue, achievement, context, contextKey, minValue) {
    return context[contextKey] >= minValue ? achievement.target_value : currentValue;
  },
  timeWindow(currentValue, achievement, startHour, endHour) {
    const hour = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCHours(); // Asia/Taipei
    return hour >= startHour && hour < endHour ? achievement.target_value : currentValue;
  },
  conditionalIncrement(currentValue, achievement, context) {
    const condition = achievement.condition || {};
    const { pullType } = condition;
    if (pullType && context.pullType !== pullType) return currentValue;
    return currentValue + 1;
  },
  mentionKeyword(currentValue, achievement, context) {
    const condition = achievement.condition || {};
    const mentionTargetUserIds = Array.isArray(condition.mentionTargetUserIds)
      ? condition.mentionTargetUserIds
      : [];
    if (!mentionTargetUserIds.length) return currentValue;

    const mentioned = Array.isArray(context.mentionedUserIds) ? context.mentionedUserIds : [];
    const text = typeof context.text === "string" ? context.text : "";

    const allTagged = mentionTargetUserIds.every(id => mentioned.includes(id));
    return allTagged && matchesAllKeywords(text, condition.keywords)
      ? achievement.target_value
      : currentValue;
  },
  receivedMentionKeyword(currentValue, achievement, context) {
    const condition = achievement.condition || {};
    const mentionedByUserId = context && context.mentionedByUserId;
    const mentioneeId = context && context._userId;
    if (!mentionedByUserId || mentionedByUserId === mentioneeId) return currentValue;
    const text = typeof context.text === "string" ? context.text : "";
    return matchesAllKeywords(text, condition.keywords) ? currentValue + 1 : currentValue;
  },
};

const ACHIEVEMENT_STRATEGY = {
  chat_100: cv => STRATEGIES.increment(cv),
  chat_1000: cv => STRATEGIES.increment(cv),
  chat_5000: cv => STRATEGIES.increment(cv),
  chat_night_owl: (cv, a) => STRATEGIES.timeWindow(cv, a, 3, 4),
  chat_multi_group: (cv, a, ctx) => handleTrackedSet(ctx._userId, a.id, ctx.groupId, cv),
  gacha_first: (cv, a) => STRATEGIES.instant(cv, a),
  gacha_100: cv => STRATEGIES.increment(cv),
  gacha_500: cv => STRATEGIES.increment(cv),
  gacha_collector_50: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "uniqueCount"),
  gacha_lucky: (cv, a, ctx) => STRATEGIES.threshold(cv, a, ctx, "threeStarCount", 3),
  gacha_europe_1: STRATEGIES.conditionalIncrement,
  gacha_europe_10: STRATEGIES.conditionalIncrement,
  gacha_europe_50: STRATEGIES.conditionalIncrement,
  gacha_pickup_1: STRATEGIES.conditionalIncrement,
  gacha_pickup_10: STRATEGIES.conditionalIncrement,
  gacha_pickup_50: STRATEGIES.conditionalIncrement,
  gacha_ensure_1: STRATEGIES.conditionalIncrement,
  gacha_ensure_10: STRATEGIES.conditionalIncrement,
  gacha_ensure_50: STRATEGIES.conditionalIncrement,
  janken_first_win: (cv, a) => STRATEGIES.instant(cv, a),
  janken_win_50: cv => STRATEGIES.increment(cv),
  janken_streak_5: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "streak"),
  janken_streak_10: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "streak"),
  janken_challenged_10: cv => STRATEGIES.increment(cv),
  boss_first_kill: (cv, a) => STRATEGIES.instant(cv, a),
  boss_level_10: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "level"),
  boss_level_50: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "level"),
  boss_top_damage: (cv, a, ctx) => (ctx.isTopDamage ? a.target_value : cv),
  social_first_command: (cv, a) => STRATEGIES.instant(cv, a),
  social_all_features: (cv, a, ctx) => handleTrackedSet(ctx._userId, a.id, ctx.feature, cv),
  subscribe_first: cv => STRATEGIES.increment(cv),
  subscribe_3: cv => STRATEGIES.increment(cv),
  subscribe_6: cv => STRATEGIES.increment(cv),
  subscribe_12: cv => STRATEGIES.increment(cv),
  mention_admin_hi: (cv, a, ctx) => STRATEGIES.mentionKeyword(cv, a, ctx),
  mention_memory_seeker: (cv, a, ctx) => STRATEGIES.mentionKeyword(cv, a, ctx),
  mention_void_gazer: (cv, a, ctx) => STRATEGIES.mentionKeyword(cv, a, ctx),
  mention_admin_hi_self: (cv, a, ctx) => STRATEGIES.receivedMentionKeyword(cv, a, ctx),
  mention_memory_seeker_self: (cv, a, ctx) => STRATEGIES.receivedMentionKeyword(cv, a, ctx),
  mention_void_gazer_self: (cv, a, ctx) => STRATEGIES.receivedMentionKeyword(cv, a, ctx),
};

const GODDESS_STONE_ITEM_ID = 999;
const REDIS_TTL = 90 * 24 * 60 * 60; // 90 days

/**
 * Evaluate achievements for a user after an event.
 * Errors are logged and swallowed, never thrown.
 * @returns {Promise<{ unlocked: Array }>} newly unlocked achievement rows (empty if none).
 */
exports.evaluate = async (userId, eventType, context = {}) => {
  const unlocked = [];
  try {
    const achievementKeys = EVENT_ACHIEVEMENT_MAP[eventType];
    if (!achievementKeys || achievementKeys.length === 0) return { unlocked };

    const cache = await getCache();
    const achievements = achievementKeys
      .map(key => cache.find(a => a.key === key))
      .filter(Boolean)
      .filter(a => isEligible(userId, a));
    if (achievements.length === 0) return { unlocked };

    const unlockedIds = await UserAchievementModel.getUnlockedIds(
      userId,
      achievements.map(a => a.id)
    );

    const ctx = { ...context, _userId: userId };

    for (const achievement of achievements) {
      try {
        if (unlockedIds.has(achievement.id)) continue;

        const { currentValue, newValue } = await calculateProgress(userId, achievement, ctx);
        if (newValue === null || newValue === currentValue) continue;

        await UserProgressModel.upsert(userId, achievement.id, newValue);

        if (newValue >= achievement.target_value) {
          await unlockAchievement(userId, achievement);
          unlocked.push(achievement);
        }
      } catch (innerErr) {
        DefaultLogger.error(
          `AchievementEngine.evaluate error for key ${achievement.key}:`,
          innerErr
        );
      }
    }
  } catch (err) {
    DefaultLogger.error("AchievementEngine.evaluate error:", err);
  }
  return { unlocked };
};

async function calculateProgress(userId, achievement, context) {
  const progress = await UserProgressModel.getProgress(userId, achievement.id);
  const currentValue = progress ? progress.current_value : 0;

  const strategy = ACHIEVEMENT_STRATEGY[achievement.key];
  const newValue = strategy ? await strategy(currentValue, achievement, context) : currentValue;

  return { currentValue, newValue };
}

async function handleTrackedSet(userId, achievementId, newItem, currentValue) {
  if (!newItem) return currentValue;
  const redisKey = `achievement:tracked:${userId}:${achievementId}`;
  const data = await redis.get(redisKey);
  const items = data ? JSON.parse(data) : [];
  if (items.includes(newItem)) return currentValue;
  items.push(newItem);
  await redis.set(redisKey, JSON.stringify(items), { EX: REDIS_TTL });
  return currentValue + 1;
}

async function unlockAchievement(userId, achievement) {
  await UserAchievementModel.unlock(userId, achievement.id);
  await UserProgressModel.delete(userId, achievement.id);

  if (achievement.reward_stones > 0) {
    // Append a new ledger row — balance is SUM(itemAmount) across rows.
    // The prior UPDATE-without-row-ID version multiplied the reward by the
    // user's existing row count (see project_stone_ledger_refactor memo).
    await mysql("Inventory").insert({
      userId,
      itemId: GODDESS_STONE_ITEM_ID,
      itemAmount: achievement.reward_stones,
      note: "成就獎勵",
    });
  }

  DefaultLogger.info(
    `Achievement unlocked: ${achievement.key} for user ${userId} (+${achievement.reward_stones} stones)`
  );
}

exports.getUserSummary = async userId => {
  const [
    allAchievements,
    categories,
    unlocked,
    recentUnlocks,
    nearCompletion,
    progressList,
    userProfile,
  ] = await Promise.all([
    AchievementModel.allWithCategories(),
    CategoryModel.all(),
    UserAchievementModel.findByUser(userId),
    UserAchievementModel.getRecentByUser(userId, 3),
    UserProgressModel.getNearCompletion(userId, 2),
    UserProgressModel.findByUser(userId),
    mysql("user").where({ platform_id: userId }).select("display_name", "picture_url").first(),
  ]);

  const unlockedIds = new Set(unlocked.map(u => u.id));
  const progressMap = {};
  progressList.forEach(p => {
    progressMap[p.id] = p.current_value;
  });

  const eligibleAchievements = allAchievements.filter(a => isEligible(userId, a));
  const total = eligibleAchievements.length;
  const unlockedCount = unlocked.length;

  const categorySummary = categories.map(cat => {
    const catAchievements = eligibleAchievements.filter(a => a.category_key === cat.key);
    const catUnlocked = catAchievements.filter(a => unlockedIds.has(a.id));
    return {
      ...cat,
      total: catAchievements.length,
      unlocked: catUnlocked.length,
      achievements: catAchievements.map(a => ({
        ...a,
        isUnlocked: unlockedIds.has(a.id),
        currentValue: progressMap[a.id] || 0,
        unlockedAt: (unlocked.find(u => u.id === a.id) || {}).unlocked_at || null,
      })),
    };
  });

  return {
    total,
    unlocked: unlockedCount,
    percentage: total > 0 ? Math.round((unlockedCount / total) * 100) : 0,
    categories: categorySummary,
    recentUnlocks,
    nearCompletion,
    profile: userProfile
      ? { displayName: userProfile.display_name, pictureUrl: userProfile.picture_url }
      : null,
  };
};

exports.getStats = async () => {
  return AchievementModel.getStats();
};

/**
 * Direct idempotent unlock by achievement key. Used by flows that know exactly
 * which achievement to award (e.g. PrestigeService), bypassing the strategy-
 * based evaluate() path. Errors are logged and swallowed so caller side-effects
 * never rollback on reward-pipeline failure.
 *
 * @param {string} userId
 * @param {string} key
 * @returns {Promise<{unlocked:boolean, achievement?:object, reason?:string}>}
 */
exports.unlockByKey = async (userId, key) => {
  try {
    const cache = await getCache();
    const achievement = cache.find(a => a.key === key);
    if (!achievement) {
      DefaultLogger.warn(`AchievementEngine.unlockByKey: unknown key=${key}`);
      return { unlocked: false, reason: "unknown_key" };
    }
    if (!isEligible(userId, achievement)) {
      return { unlocked: false, reason: "ineligible" };
    }
    const unlockedIds = await UserAchievementModel.getUnlockedIds(userId, [achievement.id]);
    if (unlockedIds.has(achievement.id)) {
      return { unlocked: false, reason: "already_unlocked" };
    }
    await unlockAchievement(userId, achievement);
    return { unlocked: true, achievement };
  } catch (err) {
    DefaultLogger.error(`AchievementEngine.unlockByKey error for ${key}:`, err);
    return { unlocked: false, reason: "error" };
  }
};

exports.batchEvaluate = async () => {
  DefaultLogger.info("AchievementEngine: starting batch evaluation");
  const cache = await getCache();

  // Chat milestones: batch query
  const chatAchievements = cache.filter(a =>
    ["chat_100", "chat_1000", "chat_5000"].includes(a.key)
  );
  if (chatAchievements.length > 0) {
    // Lifetime XP = fully-banked prestige cycles (LV_MAX_TOTAL_EXP per cycle) +
    // current cycle progress. Post-prestige `current_exp` resets to 0, so a raw
    // current_exp query would revoke chat milestones on every prestige.
    const chatUsers = await mysql("chat_user_data").select(
      "user_id",
      mysql.raw("prestige_count * ? + current_exp AS lifetime_exp", [LV_MAX_TOTAL_EXP])
    );
    const chatAchievementIds = chatAchievements.map(a => a.id);

    const existingUnlocks = await mysql("user_achievements")
      .whereIn("achievement_id", chatAchievementIds)
      .select("user_id", "achievement_id");
    const unlockedSet = new Set(existingUnlocks.map(u => `${u.user_id}:${u.achievement_id}`));

    for (const user of chatUsers) {
      const userId = user.user_id;
      const count = user.lifetime_exp || 0;
      for (const achievement of chatAchievements) {
        if (unlockedSet.has(`${userId}:${achievement.id}`)) continue;
        await UserProgressModel.upsert(userId, achievement.id, count);
        if (count >= achievement.target_value) {
          await unlockAchievement(userId, achievement);
        }
      }
    }
  }

  // Veteran achievement: batch check
  const veteranAchievement = cache.find(a => a.key === "social_veteran_30d");
  if (veteranAchievement) {
    const existingUnlocks = await mysql("user_achievements")
      .where("achievement_id", veteranAchievement.id)
      .select("user_id");
    const unlockedUserIds = new Set(existingUnlocks.map(u => u.user_id));

    const veterans = await mysql("user")
      .select("platform_id")
      .where("created_at", "<=", mysql.raw("DATE_SUB(NOW(), INTERVAL 30 DAY)"));

    for (const user of veterans) {
      if (unlockedUserIds.has(user.platform_id)) continue;
      await unlockAchievement(user.platform_id, veteranAchievement);
    }
  }

  DefaultLogger.info("AchievementEngine: batch evaluation complete");
};
