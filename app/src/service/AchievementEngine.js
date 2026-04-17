const AchievementModel = require("../model/application/Achievement");
const UserAchievementModel = require("../model/application/UserAchievement");
const UserProgressModel = require("../model/application/UserAchievementProgress");
const CategoryModel = require("../model/application/AchievementCategory");
const { DefaultLogger } = require("../util/Logger");
const mysql = require("../util/mysql");
const redis = require("../util/redis");

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

// Maps event types to achievement keys
const EVENT_ACHIEVEMENT_MAP = {
  chat_message: ["chat_100", "chat_1000", "chat_5000", "chat_night_owl", "chat_multi_group"],
  gacha_pull: ["gacha_first", "gacha_100", "gacha_500", "gacha_collector_50", "gacha_lucky"],
  janken_win: ["janken_first_win", "janken_win_50", "janken_streak_5", "janken_streak_10"],
  janken_lose: [],
  janken_draw: [],
  janken_challenge: ["janken_challenged_10"],
  boss_attack: ["boss_first_kill", "boss_level_10", "boss_level_50", "boss_top_damage"],
  command_use: ["social_first_command", "social_all_features"],
  subscribe: ["subscribe_first", "subscribe_3", "subscribe_6", "subscribe_12"],
  mention_keyword: ["mention_admin_hi", "mention_memory_seeker", "mention_void_gazer"],
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
  mentionKeyword(currentValue, achievement, context) {
    const condition = achievement.condition || {};
    const targetUserIds = Array.isArray(condition.targetUserIds) ? condition.targetUserIds : [];
    const keywords = Array.isArray(condition.keywords) ? condition.keywords : [];
    if (!targetUserIds.length) return currentValue;

    const mentioned = Array.isArray(context.mentionedUserIds) ? context.mentionedUserIds : [];
    const text = typeof context.text === "string" ? context.text : "";

    const allTagged = targetUserIds.every(id => mentioned.includes(id));
    const allKeyword = keywords.length === 0 || keywords.every(k => text.includes(k));
    return allTagged && allKeyword ? achievement.target_value : currentValue;
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
    const achievements = achievementKeys.map(key => cache.find(a => a.key === key)).filter(Boolean);
    if (achievements.length === 0) return { unlocked };

    const unlockedIds = await UserAchievementModel.getUnlockedIds(
      userId,
      achievements.map(a => a.id)
    );

    const ctx = { ...context, _userId: userId };

    for (const achievement of achievements) {
      try {
        if (unlockedIds.has(achievement.id)) continue;

        const newValue = await calculateProgress(userId, achievement, ctx);
        if (newValue === null) continue;

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
  if (!strategy) return currentValue;

  return strategy(currentValue, achievement, context);
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
    const existing = await mysql("Inventory")
      .where({ userId, itemId: GODDESS_STONE_ITEM_ID })
      .first();
    if (existing) {
      await mysql("Inventory")
        .where({ userId, itemId: GODDESS_STONE_ITEM_ID })
        .update({ itemAmount: mysql.raw("itemAmount + ?", [achievement.reward_stones]) });
    } else {
      await mysql("Inventory").insert({
        userId,
        itemId: GODDESS_STONE_ITEM_ID,
        itemAmount: achievement.reward_stones,
      });
    }
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

  const total = allAchievements.length;
  const unlockedCount = unlocked.length;

  const categorySummary = categories.map(cat => {
    const catAchievements = allAchievements.filter(a => a.category_key === cat.key);
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

exports.batchEvaluate = async () => {
  DefaultLogger.info("AchievementEngine: starting batch evaluation");
  const cache = await getCache();

  // Chat milestones: batch query
  const chatAchievements = cache.filter(a =>
    ["chat_100", "chat_1000", "chat_5000"].includes(a.key)
  );
  if (chatAchievements.length > 0) {
    const chatUsers = await mysql("chat_user_data")
      .join("user", "chat_user_data.id", "user.id")
      .select("user.platform_id", "chat_user_data.experience");
    const chatAchievementIds = chatAchievements.map(a => a.id);

    const existingUnlocks = await mysql("user_achievements")
      .whereIn("achievement_id", chatAchievementIds)
      .select("user_id", "achievement_id");
    const unlockedSet = new Set(existingUnlocks.map(u => `${u.user_id}:${u.achievement_id}`));

    for (const user of chatUsers) {
      const userId = user.platform_id;
      const count = user.experience || 0;
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
