const crypto = require("crypto");
const config = require("config");
const BattleService = require("./WorldBossBattleService");
const SeasonService = require("./WorldBossSeasonService");
const MinigameService = require("./MinigameService");
const EquipmentService = require("./EquipmentService");
const AchievementEngine = require("./AchievementEngine");
const RPGCharacter = require("../model/application/RPGCharacter");
const UserModel = require("../model/application/UserModel");
const broadcastQueue = require("../util/broadcastQueue");
const redis = require("../util/redis");
const { DefaultLogger } = require("../util/Logger");
const { canonicalPositiveInteger } = require("../util/decimalInteger");

const COOLDOWN_SECONDS = config.get("worldboss.attack_cooldown_seconds");
const PER_HIT_EXP = config.get("worldboss.per_hit_exp");
const ATTACK_TYPES = new Set(["standard", "skill"]);
// LINE group ids start with C. Multi-person rooms (R) are deliberately out of
// scope: the world boss board is a group feature, so a room id is not a valid
// announcement destination.
const GROUP_ID = /^C[0-9a-f]{32}$/;
const FALLBACK_DISPLAY_NAME = "未知玩家";

// Compare-and-delete. A plain DEL would let a late release wipe the reservation of
// the *next* attack this user already made, handing them a free extra hit.
const RELEASE_COOLDOWN_LUA =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end';

// Errors the battle transaction raises before it writes anything at all, so the
// attempt provably consumed no attack and must not consume the cooldown either.
const NO_ATTACK_CODES = new Set(["ROUND_STALE", "ROUND_CLEARED", "DAILY_LIMIT_EXCEEDED"]);

function fail(code) {
  return Object.assign(new Error(code), { code });
}

function nonNegativeFinite(value) {
  return Math.max(0, Number(value) || 0);
}

function attackInput({ progress, bonuses, attackType }) {
  const character = RPGCharacter.make(progress.job_key, { level: progress.level });
  const isSkill = attackType === "skill";
  const baseDamage = isSkill ? character.getSkillOneDamage() : character.getStandardDamage();
  const baseCost = isSkill ? character.skillOne.cost : 10;
  const atkPercent = nonNegativeFinite(bonuses.atk_percent);
  const costReduction = nonNegativeFinite(bonuses.cost_reduction);
  const expBonus = nonNegativeFinite(bonuses.exp_bonus);

  return {
    rawDamage: Math.floor(baseDamage * (1 + atkPercent)),
    jobKey: progress.job_key,
    cost: Math.max(1, baseCost - costReduction),
    exp: PER_HIT_EXP + expBonus,
  };
}

/**
 * The authenticated session name is the only name we can trust; the user table is a
 * best-effort fallback. LINE's profile APIs are deliberately not called — an
 * announcement must never depend on an outbound request succeeding.
 */
async function resolveDisplayName(userId, profileDisplayName) {
  const trusted = typeof profileDisplayName === "string" ? profileDisplayName.trim() : "";
  if (trusted) return trusted;
  const stored = await UserModel.getProfile(userId).catch(() => null);
  const name = stored && typeof stored.displayName === "string" ? stored.displayName.trim() : "";
  return name || FALLBACK_DISPLAY_NAME;
}

/**
 * A client-supplied group id is only an assertion about where the player is looking.
 * It survives only if it is exactly the group the server last saw this user speak in;
 * there is deliberately no "fall back to the last known group" path, because that
 * would let any authenticated caller broadcast into a group they never named.
 */
async function verifiedGroupId(userId, groupId) {
  if (typeof groupId !== "string" || !GROUP_ID.test(groupId)) return null;
  const lastGroupId = await redis.get(`CHAT_USER_LAST_GROUP_${userId}`);
  return lastGroupId && lastGroupId === groupId ? groupId : null;
}

/**
 * Public facts only: who attacked, which boss, which cycle. No quota, EXP, reward,
 * ledger or personal accumulated damage may appear in a group message.
 */
function clearText(displayName, result) {
  const { position, name } = result.boss;
  const cycle = result.attackedCycleNo;
  return result.cycleAdvanced
    ? `🎊 ${displayName} 擊破第 ${cycle} 輪最後一隻王「${position} 號 ${name}」，本周回五王全滅！`
    : `⚔️ ${displayName} 擊破了第 ${cycle} 輪 ${position} 號王「${name}」！`;
}

async function announceClear({ userId, groupId, displayName, result }) {
  if (result.cleared !== true) return false;
  const destination = await verifiedGroupId(userId, groupId);
  if (!destination) return false;

  const name = await resolveDisplayName(userId, displayName);
  const queued = await broadcastQueue.pushEvent(destination, {
    type: "world_boss_clear",
    userId,
    text: clearText(name, result),
    payload: {
      cycleNo: result.attackedCycleNo,
      position: result.boss.position,
      cycleAdvanced: Boolean(result.cycleAdvanced),
    },
  });
  return Boolean(queued);
}

/**
 * Compare-and-delete the cooldown we own. Never throws: failing to release only costs
 * the player the rest of a 5 second window, while propagating would replace the real
 * domain error with a Redis error.
 */
async function releaseCooldown(key, token) {
  try {
    await redis.eval(RELEASE_COOLDOWN_LUA, { keys: [key], arguments: [token] });
  } catch (error) {
    DefaultLogger.warn("[world-boss-attack] cooldown release failed", {
      key,
      reason: error && error.message,
    });
  }
}

/**
 * The single application seam for a world boss attack. Identity, damage, cost, exp,
 * cooldown and the announcement decision live here so no transport (HTTP today,
 * anything later) can drift from another.
 *
 * The daily quota is deliberately NOT prechecked here: BattleService re-computes it
 * inside the row lock and is the only authority, so a precheck would be a second
 * non-authoritative copy of the rule plus an extra round trip.
 */
async function attack({ userId, roundId, attackType, groupId, displayName }) {
  if (typeof userId !== "string" || !userId) throw fail("INVALID_USER");
  if (!ATTACK_TYPES.has(attackType)) throw fail("INVALID_ATTACK_TYPE");
  let canonicalRoundId;
  try {
    canonicalRoundId = canonicalPositiveInteger(roundId);
  } catch {
    throw fail("INVALID_ROUND_ID");
  }

  // ponytail: chose option (b) — reserve first, release on provably-no-attack errors.
  // Option (a), reserving after target validation, cannot work: target validation only
  // exists inside BattleService's transaction, so moving the reservation past it would
  // leave the transaction itself unguarded and let a tap burst open concurrent
  // transactions — trading a UX annoyance for a load hole. The reservation therefore
  // stays an atomic NX in front of all work, and the two rejections a player can hit by
  // tapping a stale card (plus the quota rejection) give it back with an ownership-token
  // compare-and-delete. ROUND_NOT_FOUND / SEASON_ENDED / NO_ACTIVE_SEASON keep the
  // cooldown on purpose: those come from a client sending ids it was never shown.
  const cooldownKey = `worldboss-v2:${userId}`;
  const cooldownToken = crypto.randomUUID();
  const cooldownReserved = await redis.set(cooldownKey, cooldownToken, {
    EX: COOLDOWN_SECONDS,
    NX: true,
  });
  if (!cooldownReserved) throw fail("ATTACK_COOLDOWN");

  const [storedProgress, bonuses] = await Promise.all([
    MinigameService.findByUserId(userId),
    EquipmentService.getEquipmentBonuses(userId),
  ]);
  const progress = storedProgress || { level: 1, job_key: "adventurer" };
  const { rawDamage, jobKey, cost, exp } = attackInput({ progress, bonuses, attackType });

  let result;
  try {
    result = await BattleService.attack({
      userId,
      attackType,
      roundId: canonicalRoundId,
      rawDamage,
      jobKey,
      cost,
      exp,
    });
  } catch (error) {
    if (error && NO_ATTACK_CODES.has(error.code)) {
      await releaseCooldown(cooldownKey, cooldownToken);
    }
    throw error;
  }

  // Everything below runs after the attack transaction committed. None of it may throw
  // a persisted attack away, so each side effect degrades instead of propagating.
  let announcementQueued = false;
  try {
    announcementQueued = await announceClear({ userId, groupId, displayName, result });
  } catch (error) {
    DefaultLogger.warn("[world-boss-attack] clear announcement failed", {
      userId,
      roundId: canonicalRoundId,
      reason: error && error.message,
    });
  }

  // LIFF has no LINE context, so unlocks are recorded but never announced here.
  await AchievementEngine.evaluate(userId, "boss_attack", { feature: "world_boss" }).catch(
    () => {}
  );
  const latestReward = await SeasonService.getLatestSettledResult(userId).catch(() => null);

  return { result, announcementQueued, latestReward: latestReward || null };
}

module.exports = { attack };
module.exports._internal = {
  attackInput,
  nonNegativeFinite,
  resolveDisplayName,
  verifiedGroupId,
  clearText,
};
