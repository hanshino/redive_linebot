const redis = require("../util/redis");
const chatUserState = require("../util/chatUserState");
const broadcastQueue = require("../util/broadcastQueue");
const ChatUserData = require("../model/application/ChatUserData");
const PrestigeTrial = require("../model/application/PrestigeTrial");
const UserPrestigeTrial = require("../model/application/UserPrestigeTrial");

const PRESTIGE_CAP = 5;

function error(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function resolveLastGroup(userId) {
  const v = await redis.get(`CHAT_USER_LAST_GROUP_${userId}`);
  return v || null;
}

/**
 * Start a trial for the user.
 *
 * TOCTOU note: the active_trial_id check and the upsert are not wrapped in a
 * transaction. LIFF's single-submit UI is the primary guard; a racing caller
 * would create a dangling 'active' row. M3.5 can tighten this if needed.
 */
async function startTrial(userId, trialId) {
  const row = await ChatUserData.findByUserId(userId);
  if (!row || row.prestige_count >= PRESTIGE_CAP) {
    throw error("AWAKENED", "User is awakened or not initialized");
  }

  const trial = await PrestigeTrial.findById(trialId);
  if (!trial) {
    throw error("INVALID_TRIAL", `Trial ${trialId} does not exist`);
  }

  if (row.active_trial_id !== null && row.active_trial_id !== undefined) {
    throw error("ALREADY_ACTIVE", "An active trial already exists");
  }

  const passed = await UserPrestigeTrial.listPassedByUserId(userId);
  if (passed.some(p => p.trial_id === trialId)) {
    throw error("ALREADY_PASSED", `Trial ${trialId} already passed`);
  }

  const now = new Date();
  await UserPrestigeTrial.model.create({
    user_id: userId,
    trial_id: trialId,
    started_at: now,
    status: "active",
    final_exp_progress: 0,
  });

  await ChatUserData.upsert(userId, {
    active_trial_id: trialId,
    active_trial_started_at: now,
    active_trial_exp_progress: 0,
  });

  await chatUserState.invalidate(userId);

  const groupId = await resolveLastGroup(userId);
  await broadcastQueue.pushEvent(groupId, {
    type: "trial_enter",
    userId,
    text: `踏入了 ★${trial.star} 的試煉`,
    payload: { trialId: trial.id, trialStar: trial.star, trialSlug: trial.slug },
  });

  return { ok: true, trial, groupId };
}

async function forfeitTrial(userId) {
  const row = await ChatUserData.findByUserId(userId);
  if (!row || !row.active_trial_id) {
    throw error("NO_ACTIVE_TRIAL", "User has no active trial");
  }

  const active = await UserPrestigeTrial.findActiveByUserId(userId);
  if (!active) {
    throw error("NO_ACTIVE_TRIAL", "Active trial row missing");
  }

  const trialId = row.active_trial_id;
  const progress = row.active_trial_exp_progress || 0;
  const now = new Date();

  await UserPrestigeTrial.model.update(active.id, {
    status: "forfeited",
    ended_at: now,
    final_exp_progress: progress,
  });

  await ChatUserData.upsert(userId, {
    active_trial_id: null,
    active_trial_started_at: null,
    active_trial_exp_progress: 0,
  });

  await chatUserState.invalidate(userId);

  return { ok: true, trialId };
}

function formatTrialReward(rewardMeta, displayName) {
  if (!rewardMeta || typeof rewardMeta !== "object") return displayName || "獎勵";
  switch (rewardMeta.type) {
    case "permanent_xp_multiplier": {
      const pct = Math.round((rewardMeta.value || 0) * 100);
      return `永久 XP +${pct}%`;
    }
    case "cooldown_tier_override":
      return "律動精通";
    case "group_bonus_double":
      return "群組加成翻倍";
    case "trigger_achievement":
      if (rewardMeta.achievement_slug === "prestige_awakening") return "覺醒之證";
      return "啟程之證";
    default:
      return displayName || "獎勵";
  }
}

async function checkTrialCompletion(userId, groupIdHint) {
  const row = await ChatUserData.findByUserId(userId);
  if (!row || !row.active_trial_id) return { completed: false };

  const trial = await PrestigeTrial.findById(row.active_trial_id);
  if (!trial) return { completed: false };

  const progress = row.active_trial_exp_progress || 0;
  if (progress < trial.required_exp) return { completed: false };

  const active = await UserPrestigeTrial.findActiveByUserId(userId);
  if (!active) return { completed: false };

  const now = new Date();
  await UserPrestigeTrial.model.update(active.id, {
    status: "passed",
    ended_at: now,
    final_exp_progress: progress,
  });

  await ChatUserData.upsert(userId, {
    active_trial_id: null,
    active_trial_started_at: null,
    active_trial_exp_progress: 0,
  });

  await chatUserState.invalidate(userId);

  const groupId = groupIdHint || (await resolveLastGroup(userId));
  const rewardText = formatTrialReward(trial.reward_meta, trial.display_name);
  await broadcastQueue.pushEvent(groupId, {
    type: "trial_pass",
    userId,
    text: `通過了 ★${trial.star} 的試煉，永久解放 ${rewardText}`,
    payload: { trialId: trial.id, trialStar: trial.star, trialSlug: trial.slug },
  });

  return { completed: true, trialId: trial.id, trialStar: trial.star };
}

module.exports = { startTrial, forfeitTrial, checkTrialCompletion, PRESTIGE_CAP };
