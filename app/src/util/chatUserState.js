const redis = require("./redis");
const mysql = require("./mysql");
const ChatUserData = require("../model/application/ChatUserData");
const UserBlessing = require("../model/application/UserBlessing");

const TTL_SECONDS = 600;
const STATE_KEY = userId => `CHAT_USER_STATE_${userId}`;

function defaultState(userId) {
  return {
    user_id: userId,
    prestige_count: 0,
    current_level: 0,
    current_exp: 0,
    blessings: [],
    active_trial_id: null,
    active_trial_star: null,
    active_trial_started_at: null,
    active_trial_exp_progress: 0,
    permanent_xp_multiplier: 0,
    rhythm_mastery: false,
    group_bonus_double: false,
  };
}

function parseRewardMeta(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

async function loadPassedTrialRewards(userId) {
  const rows = await mysql("user_prestige_trials as upt")
    .join("prestige_trials as pt", "pt.id", "upt.trial_id")
    .where({ "upt.user_id": userId, "upt.status": "passed" })
    .select("pt.star", "pt.reward_meta");

  let permanent_xp_multiplier = 0;
  let rhythm_mastery = false;
  let group_bonus_double = false;
  for (const row of rows || []) {
    const meta = parseRewardMeta(row.reward_meta);
    if (!meta) continue;
    if (meta.type === "permanent_xp_multiplier" && typeof meta.value === "number") {
      permanent_xp_multiplier += meta.value;
    } else if (meta.type === "cooldown_tier_override") {
      rhythm_mastery = true;
    } else if (meta.type === "group_bonus_double") {
      group_bonus_double = true;
    }
  }
  return { permanent_xp_multiplier, rhythm_mastery, group_bonus_double };
}

async function resolveTrialStar(activeTrialId) {
  if (!activeTrialId) return null;
  const row = await mysql("prestige_trials").where({ id: activeTrialId }).first();
  return row ? row.star : null;
}

async function hydrate(userId) {
  const [base, blessings, rewards] = await Promise.all([
    ChatUserData.findByUserId(userId),
    UserBlessing.listBlessingIdsByUserId(userId),
    loadPassedTrialRewards(userId),
  ]);

  if (!base) {
    return { ...defaultState(userId), blessings, ...rewards };
  }

  const active_trial_star = await resolveTrialStar(base.active_trial_id);

  return {
    user_id: userId,
    prestige_count: base.prestige_count ?? 0,
    current_level: base.current_level ?? 0,
    current_exp: base.current_exp ?? 0,
    blessings,
    active_trial_id: base.active_trial_id ?? null,
    active_trial_star,
    active_trial_started_at: base.active_trial_started_at ?? null,
    active_trial_exp_progress: base.active_trial_exp_progress ?? 0,
    ...rewards,
  };
}

function isValidCachedState(parsed) {
  return (
    parsed !== null &&
    typeof parsed === "object" &&
    typeof parsed.user_id === "string" &&
    Array.isArray(parsed.blessings)
  );
}

async function load(userId) {
  const cached = await redis.get(STATE_KEY(userId));
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (isValidCachedState(parsed)) return parsed;
    } catch {
      // corrupted cache, fall through to hydrate
    }
  }
  // Call via module.exports so jest.spyOn(chatUserState, "hydrate") takes effect.
  const state = await module.exports.hydrate(userId);
  await redis.set(STATE_KEY(userId), JSON.stringify(state), { EX: TTL_SECONDS });
  return state;
}

function invalidate(userId) {
  return redis.del(STATE_KEY(userId));
}

module.exports = { load, hydrate, invalidate, STATE_KEY, TTL_SECONDS };
