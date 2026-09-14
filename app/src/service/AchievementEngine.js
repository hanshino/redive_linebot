const crypto = require("crypto");
const AchievementModel = require("../model/application/Achievement");
const UserAchievementModel = require("../model/application/UserAchievement");
const UserProgressModel = require("../model/application/UserAchievementProgress");
const CategoryModel = require("../model/application/AchievementCategory");
const { DefaultLogger } = require("../util/Logger");
const mysql = require("../util/mysql");
const redis = require("../util/redis");
const { todayUtc8 } = require("../util/date");
const { toPublic, toPublicList } = require("./achievementPublicView");
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
function isEligible(userId, achievement, asOfDate) {
  const condition = (achievement && achievement.condition) || null;

  // `availableFrom` (YYYY-MM-DD, Asia/Taipei) hides a not-yet-released row from
  // both the unlock path and the completion-rate denominator — otherwise a
  // future achievement would drag everyone's percentage down before it exists.
  // There is deliberately no `availableUntil`: once live, a row stays live, so
  // an already-unlocked achievement can never vanish from a user's collection.
  const availableFrom = condition && condition.availableFrom;
  if (availableFrom && (asOfDate || todayUtc8()) < availableFrom) return false;

  const eligibility = (condition && condition.eligibility) || null;
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
  boss_attack: ["social_all_features"],
  command_use: ["social_first_command"],
  subscribe: ["subscribe_first", "subscribe_3", "subscribe_6", "subscribe_12"],
  mention_keyword: ["mention_admin_hi", "mention_memory_seeker", "mention_void_gazer"],
  received_mention: [
    "mention_admin_hi_self",
    "mention_memory_seeker_self",
    "mention_void_gazer_self",
  ],
  race_bet_placed: ["race_first_bet", "race_all_in"],
  race_bet_won: ["race_win_10", "race_big_win"],
  trade_complete: ["trade_first", "trade_50"],
  atm_transfer: ["atm_whale"],
  coupon_redeem: ["coupon_first", "coupon_collector"],
  shop_exchange: ["shop_first_exchange", "shop_big_spender"],
  prestige_complete: ["prestige_first", "prestige_3", "prestige_5"],
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
  // Generic threshold check driven entirely by DB `condition` JSON — used for
  // hidden achievements whose exact numeric threshold must NOT be hardcoded in
  // this file (keeps secret thresholds out of git; only the DB row seeded via
  // raw SQL knows the real number).
  conditionThreshold(currentValue, achievement, context) {
    const condition = achievement.condition || {};
    const { contextKey, minValue } = condition;
    if (!contextKey || minValue === undefined) return currentValue;
    return context[contextKey] >= minValue ? achievement.target_value : currentValue;
  },
  // Fully definition-driven strategy: the DB row's `condition` names both the
  // event and the metric, so a new achievement needs no code change here (and
  // its key never has to appear in this file — secret keys stay out of git).
  conditionMetric(currentValue, achievement, context) {
    const condition = achievement.condition || {};
    const metric = condition.metric;
    switch (metric) {
      case "streak":
        return STRATEGIES.contextValue(currentValue, achievement, context, "streak");
      case "total":
        return STRATEGIES.contextValue(currentValue, achievement, context, "total");
      case "full_month":
        // `condition.month` (YYYY-MM) pins a full-month achievement to one
        // specific month. streak/total are cumulative and deliberately NOT
        // gated: only the month-shaped metric can be month-specific.
        // No `month` set = any month counts.
        if (condition.month && context.month !== condition.month) return currentValue;
        return context.fullMonth ? achievement.target_value : currentValue;
      default:
        DefaultLogger.warn(
          `AchievementEngine: unknown condition.metric=${metric} for achievement id=${achievement.id}`
        );
        return currentValue;
    }
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
  // Durable tracked-set is intercepted in evaluateInTransaction. Keep these no-op entries so
  // resolveAchievements still treats the keys as hardcoded and cannot drag them into a foreign event.
  chat_multi_group: cv => cv,
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
  social_first_command: (cv, a) => STRATEGIES.instant(cv, a),
  social_all_features: cv => cv,
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
  race_first_bet: (cv, a) => STRATEGIES.instant(cv, a),
  race_win_10: cv => STRATEGIES.increment(cv),
  race_all_in: (cv, a, ctx) => STRATEGIES.conditionThreshold(cv, a, ctx),
  race_big_win: (cv, a, ctx) => STRATEGIES.conditionThreshold(cv, a, ctx),
  trade_first: (cv, a) => STRATEGIES.instant(cv, a),
  trade_50: cv => STRATEGIES.increment(cv),
  atm_whale: (cv, a, ctx) => STRATEGIES.conditionThreshold(cv, a, ctx),
  coupon_first: (cv, a) => STRATEGIES.instant(cv, a),
  coupon_collector: cv => STRATEGIES.increment(cv),
  shop_first_exchange: (cv, a) => STRATEGIES.instant(cv, a),
  shop_big_spender: (cv, a, ctx) => STRATEGIES.conditionThreshold(cv, a, ctx),
  prestige_first: (cv, a) => STRATEGIES.instant(cv, a),
  prestige_3: (cv, a, ctx) => STRATEGIES.conditionThreshold(cv, a, ctx),
  // 5 matches PrestigeService.PRESTIGE_CAP, which is already public to players.
  prestige_5: (cv, a, ctx) => STRATEGIES.threshold(cv, a, ctx, "prestigeCount", 5),
};

const GODDESS_STONE_ITEM_ID = 999;
// Distinct-feature 的 item 語意固定在 code；tracking_key 同時是 definition revision。
// 不保存原始 item，只保存 achievement_id | tracking_key | item 的 SHA-256。
const TRACKED_CONTEXT_KEYS = Object.freeze({
  chat_multi_group: "groupId",
  social_all_features: "feature",
});

/**
 * Candidate rows for an event = the hardcoded key list (legacy events) UNION
 * every definition whose `condition.event` names this event. The second half is
 * what lets a new achievement ship as a DB row alone: no key here, no strategy
 * entry, therefore no secret key or threshold committed to git.
 *
 * Keys that already own a hardcoded strategy are excluded from the second half:
 * their strategy is written for their own event's context, and `resolveStrategy`
 * prefers it over the generic one. Without this guard a DB row setting
 * `condition.event` on such a key would drag it into a foreign event and run
 * that strategy against the wrong context — e.g. `gacha_first` (instant, always
 * returns target_value) would unlock on a signin. The event map stays the only
 * way a hardcoded key gets evaluated.
 */
function resolveAchievements(cache, eventType) {
  const byKey = (EVENT_ACHIEVEMENT_MAP[eventType] || [])
    .map(key => cache.find(a => a.key === key))
    .filter(Boolean);

  const seen = new Set(byKey.map(a => a.id));
  const byCondition = cache.filter(
    a =>
      a.condition &&
      a.condition.event === eventType &&
      !seen.has(a.id) &&
      !ACHIEVEMENT_STRATEGY[a.key]
  );

  return [...byKey, ...byCondition];
}

/**
 * Pick the progress strategy for one achievement: an explicit per-key entry
 * wins; otherwise a definition carrying `condition.event` falls back to the
 * generic metric strategy.
 */
function resolveStrategy(achievement) {
  const byKey = ACHIEVEMENT_STRATEGY[achievement.key];
  if (byKey) return byKey;
  if (achievement.condition && achievement.condition.event) return STRATEGIES.conditionMetric;
  return null;
}

/**
 * Mutex ensure 必須在交易外 autocommit 執行。若在交易內 INSERT IGNORE 撞既有列，MySQL 會先取得
 * shared lock，再於 SELECT FOR UPDATE 升級 exclusive lock，兩連線可能互相等待。
 * 獨立 lock table 不依賴 user 表，所以被 mention 但尚無 user row 的 userId 也能安全序列化。
 */
exports.ensureUserLock = async userId => {
  await mysql.raw("INSERT IGNORE INTO achievement_user_lock (user_id) VALUES (?)", [userId]);
};

async function lockUserMutex(trx, userId) {
  const row = await trx("achievement_user_lock").where({ user_id: userId }).forUpdate().first();
  if (!row) {
    throw new Error("achievement_user_lock missing; call ensureUserLock before transaction");
  }
}
exports.lockUserInTransaction = lockUserMutex;

function trackedItemHash(achievementId, trackingKey, item) {
  return crypto
    .createHash("sha256")
    .update(`${achievementId}|${trackingKey}|${item}`)
    .digest("hex");
}

function parseTrackedItems(data) {
  if (data === null || data === undefined) return { found: false, items: [] };
  let items;
  try {
    items = JSON.parse(data);
  } catch (error) {
    throw new Error("achievement tracked Redis payload malformed", { cause: error });
  }
  if (!Array.isArray(items) || items.some(item => typeof item !== "string" || !item)) {
    throw new Error("achievement tracked Redis payload malformed");
  }
  return { found: true, items: [...new Set(items)] };
}

/**
 * Per-(user, achievement) lazy migration + durable distinct marker（KTD7）。
 * - migration 不存在：成功交易內對 legacy Redis key 唯讀 GET，保留當下仍可觀測 membership；nil 是合法空集合。
 * - migration 已存在：永遠不再 GET；tracking_key 不符視為 definition revision mismatch，throw。
 * - item_hash 不存在才 INSERT marker 並 +1；既有 MySQL progress 只作 opaque baseline，不重算。
 * Redis error／malformed／revision mismatch 一律 throw，讓 strict pending 或 legacy 外層整筆 rollback。
 */
async function handleTrackedSetInTransaction(
  trx,
  userId,
  achievement,
  trackingKey,
  newItem,
  currentValue
) {
  const migration = await trx("achievement_tracked_migration")
    .where({ user_id: userId, achievement_id: achievement.id })
    .first();
  if (migration && migration.tracking_key !== trackingKey) {
    throw new Error("achievement tracked definition revision mismatch");
  }

  if (!migration) {
    const redisKey = `achievement:tracked:${userId}:${achievement.id}`;
    // Deliberately read-only. This branch is permanent for users who have not yet entered the new core.
    const observed = parseTrackedItems(await redis.get(redisKey));
    if (observed.items.length > 0) {
      await trx("achievement_tracked_item").insert(
        observed.items.map(item => ({
          user_id: userId,
          achievement_id: achievement.id,
          item_hash: trackedItemHash(achievement.id, trackingKey, item),
        }))
      );
    }
    await trx("achievement_tracked_migration").insert({
      user_id: userId,
      achievement_id: achievement.id,
      tracking_key: trackingKey,
      redis_found: observed.found,
      item_count: observed.items.length,
      baseline_value: currentValue,
    });
  }

  if (!newItem) return currentValue;
  const itemHash = trackedItemHash(achievement.id, trackingKey, String(newItem));
  const exists = await trx("achievement_tracked_item")
    .where({ user_id: userId, achievement_id: achievement.id, item_hash: itemHash })
    .first();
  if (exists) return currentValue;
  await trx("achievement_tracked_item").insert({
    user_id: userId,
    achievement_id: achievement.id,
    item_hash: itemHash,
  });
  return currentValue + 1;
}

/**
 * 共用 unlock + reward。INSERT IGNORE 保留為 mutex 後的第二道防線；unlock、刪 progress、reward
 * 全部使用呼叫端 trx。錯誤不吞，讓整筆 rollback。
 */
async function unlockAchievementInTransaction(trx, userId, achievement) {
  const created = await UserAchievementModel.unlock(userId, achievement.id, trx);
  await UserProgressModel.delete(userId, achievement.id, trx);
  if (!created) return false;

  if (achievement.reward_stones > 0) {
    await trx("inventory").insert({
      userId,
      itemId: GODDESS_STONE_ITEM_ID,
      itemAmount: achievement.reward_stones,
      note: "成就獎勵",
    });
  }
  return true;
}

function logUnlocked(userId, achievement) {
  DefaultLogger.info(
    `Achievement unlocked: ${achievement.key} for user ${userId} (+${achievement.reward_stones} stones)`
  );
}

/**
 * Strict internal transaction core（U4 outbox consumer 可直接呼叫）。呼叫前必須先在 trx 外
 * `ensureUserLock(userId)`；本函式只在 trx 內 FOR UPDATE mutex，不自行開／提交交易。
 * progress／marker／unlock／reward 任一錯誤都 throw，讓呼叫端 rollback。
 */
exports.evaluateInTransaction = async (trx, userId, eventType, context = {}) => {
  await lockUserMutex(trx, userId);
  const cache = await getCache();
  const achievements = resolveAchievements(cache, eventType).filter(a =>
    isEligible(userId, a, context.date)
  );
  if (achievements.length === 0) return { unlocked: [] };

  const allIds = achievements.map(a => a.id);
  const [unlockedIds, progressMap] = await Promise.all([
    UserAchievementModel.getUnlockedIds(userId, allIds, trx),
    UserProgressModel.getProgressByIds(userId, allIds, trx),
  ]);
  const ctx = { ...context, _userId: userId };
  const updates = [];
  const toUnlock = [];

  for (const achievement of achievements.filter(a => !unlockedIds.has(a.id))) {
    const currentValue = progressMap.get(achievement.id) || 0;
    const trackingKey = TRACKED_CONTEXT_KEYS[achievement.key];
    let newValue;
    if (trackingKey) {
      newValue = await handleTrackedSetInTransaction(
        trx,
        userId,
        achievement,
        trackingKey,
        ctx[trackingKey],
        currentValue
      );
    } else {
      const strategy = resolveStrategy(achievement);
      newValue = strategy ? await strategy(currentValue, achievement, ctx) : currentValue;
    }
    if (newValue === null || newValue === currentValue) continue;
    updates.push({ userId, achievementId: achievement.id, currentValue: newValue });
    if (newValue >= achievement.target_value) toUnlock.push(achievement);
  }

  if (updates.length > 0) await UserProgressModel.upsertMany(updates, trx);
  const unlocked = [];
  for (const achievement of toUnlock) {
    if (await unlockAchievementInTransaction(trx, userId, achievement)) unlocked.push(achievement);
  }
  return { unlocked };
};

/** Strict wrapper：errors propagate；供 U4 使用或需要自行交易的 strict caller。 */
exports.evaluateStrict = async (userId, eventType, context = {}) => {
  await exports.ensureUserLock(userId);
  const result = await mysql.transaction(trx =>
    exports.evaluateInTransaction(trx, userId, eventType, context)
  );
  result.unlocked.forEach(achievement => logUnlocked(userId, achievement));
  return result;
};

/**
 * Legacy 外部 API：回傳形狀與吞錯行為不變；內部改走同一 strict core。`unlocked` 只有 transaction
 * commit 成功後才回傳，任何 core 錯誤整筆 rollback、最外層唯一 catch 回 `{ unlocked: [] }`。
 */
exports.evaluate = async (userId, eventType, context = {}) => {
  try {
    return await exports.evaluateStrict(userId, eventType, context);
  } catch (err) {
    DefaultLogger.error("AchievementEngine.evaluate error:", err);
    return { unlocked: [] };
  }
};

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
      achievements: catAchievements.map(a =>
        toPublic(
          {
            ...a,
            isUnlocked: unlockedIds.has(a.id),
            currentValue: progressMap[a.id] || 0,
            unlockedAt: (unlocked.find(u => u.id === a.id) || {}).unlocked_at || null,
          },
          { includeDescription: unlockedIds.has(a.id) }
        )
      ),
    };
  });

  // getUserSummary is the shared exit for the LIFF achievement page, the
  // `/api/achievements/user/:userId` endpoint and the LINE flex card, so the
  // projection lives here rather than in each caller. The flex template only
  // reads allowlisted fields (icon/name/rarity/unlocked_at/current_value/
  // target_value/percentage), so it is unaffected.
  return {
    total,
    unlocked: unlockedCount,
    percentage: total > 0 ? Math.round((unlockedCount / total) * 100) : 0,
    categories: categorySummary,
    recentUnlocks: toPublicList(recentUnlocks, { includeDescription: true }),
    nearCompletion: toPublicList(nearCompletion),
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
    await exports.ensureUserLock(userId);
    const result = await mysql.transaction(async trx => {
      await lockUserMutex(trx, userId);
      const unlockedIds = await UserAchievementModel.getUnlockedIds(userId, [achievement.id], trx);
      if (unlockedIds.has(achievement.id)) {
        return { unlocked: false, reason: "already_unlocked" };
      }
      const created = await unlockAchievementInTransaction(trx, userId, achievement);
      if (!created) return { unlocked: false, reason: "already_unlocked" };
      return { unlocked: true, achievement };
    });
    if (result.unlocked) logUnlocked(userId, achievement);
    return result;
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
      const candidates = chatAchievements.filter(
        achievement => !unlockedSet.has(`${userId}:${achievement.id}`)
      );
      if (candidates.length === 0) continue;
      await exports.ensureUserLock(userId);
      const unlocked = await mysql.transaction(async trx => {
        await lockUserMutex(trx, userId);
        const unlockedIds = await UserAchievementModel.getUnlockedIds(
          userId,
          candidates.map(a => a.id),
          trx
        );
        const progressMap = await UserProgressModel.getProgressByIds(
          userId,
          candidates.map(a => a.id),
          trx
        );
        const newlyUnlocked = [];
        for (const achievement of candidates) {
          if (unlockedIds.has(achievement.id)) continue;
          // Broad scan happened before the mutex. Never let its stale absolute count overwrite a
          // newer event-path increment that committed before this transaction acquired the lock.
          const currentValue = Math.max(count, progressMap.get(achievement.id) || 0);
          await UserProgressModel.upsert(userId, achievement.id, currentValue, trx);
          if (currentValue >= achievement.target_value) {
            if (await unlockAchievementInTransaction(trx, userId, achievement)) {
              newlyUnlocked.push(achievement);
            }
          }
        }
        return newlyUnlocked;
      });
      unlocked.forEach(achievement => logUnlocked(userId, achievement));
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
      await exports.ensureUserLock(user.platform_id);
      const unlocked = await mysql.transaction(async trx => {
        await lockUserMutex(trx, user.platform_id);
        const unlockedIds = await UserAchievementModel.getUnlockedIds(
          user.platform_id,
          [veteranAchievement.id],
          trx
        );
        if (!unlockedIds.has(veteranAchievement.id)) {
          return unlockAchievementInTransaction(trx, user.platform_id, veteranAchievement);
        }
        return false;
      });
      if (unlocked) logUnlocked(user.platform_id, veteranAchievement);
    }
  }

  DefaultLogger.info("AchievementEngine: batch evaluation complete");
};
