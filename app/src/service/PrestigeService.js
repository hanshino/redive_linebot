const redis = require("../util/redis");
const chatUserState = require("../util/chatUserState");
const broadcastQueue = require("../util/broadcastQueue");
const ChatUserData = require("../model/application/ChatUserData");
const PrestigeTrial = require("../model/application/PrestigeTrial");
const UserPrestigeTrial = require("../model/application/UserPrestigeTrial");
const PrestigeBlessing = require("../model/application/PrestigeBlessing");
const UserBlessing = require("../model/application/UserBlessing");
const UserPrestigeHistory = require("../model/application/UserPrestigeHistory");

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

async function prestige(userId, blessingId) {
  const row = await ChatUserData.findByUserId(userId);
  if (!row || row.prestige_count >= PRESTIGE_CAP) {
    throw error("AWAKENED", "User is awakened or not initialized");
  }
  if ((row.current_level || 0) < 100) {
    throw error("NOT_LEVEL_100", "User must be Lv.100 to prestige");
  }

  const blessing = await PrestigeBlessing.findById(blessingId);
  if (!blessing) {
    throw error("INVALID_BLESSING", `Blessing ${blessingId} does not exist`);
  }

  const ownedBlessingIds = await UserBlessing.listBlessingIdsByUserId(userId);
  if (ownedBlessingIds.includes(blessingId)) {
    throw error("BLESSING_ALREADY_OWNED", `Blessing ${blessingId} already owned`);
  }

  const passedRows = await UserPrestigeTrial.listPassedByUserId(userId);
  const historyRows = await UserPrestigeHistory.listByUserId(userId);
  const consumedTrialIds = new Set(historyRows.map(h => h.trial_id));
  const passedButUnused = passedRows.filter(p => !consumedTrialIds.has(p.trial_id));
  if (passedButUnused.length === 0) {
    throw error("NO_PASSED_TRIAL", "No passed trial available to consume");
  }

  const claimed = passedButUnused[0]; // FIFO — earliest-passed first
  const newPrestigeCount = row.prestige_count + 1;
  const awakened = newPrestigeCount === PRESTIGE_CAP;

  let cycleStartedAt;
  if (row.prestige_count === 0) {
    cycleStartedAt = row.created_at || new Date();
  } else {
    const latest = await UserPrestigeHistory.latestByUserId(userId);
    cycleStartedAt = latest?.prestiged_at || row.created_at || new Date();
  }

  const now = new Date();

  await UserBlessing.model.create({
    user_id: userId,
    blessing_id: blessingId,
    acquired_at_prestige: newPrestigeCount,
    acquired_at: now,
  });

  await UserPrestigeHistory.model.create({
    user_id: userId,
    prestige_count_after: newPrestigeCount,
    trial_id: claimed.trial_id,
    blessing_id: blessingId,
    cycle_started_at: cycleStartedAt,
    prestiged_at: now,
  });

  await ChatUserData.upsert(userId, {
    prestige_count: newPrestigeCount,
    current_level: 0,
    current_exp: 0,
    awakened_at: awakened ? now : null,
  });

  await chatUserState.invalidate(userId);

  const groupId = await resolveLastGroup(userId);
  await broadcastQueue.pushEvent(groupId, {
    type: "prestige",
    userId,
    text: `完成第 ${newPrestigeCount} 次轉生，選擇了祝福『${blessing.display_name}』`,
    payload: {
      prestigeCount: newPrestigeCount,
      trialId: claimed.trial_id,
      blessingId,
      blessingSlug: blessing.slug,
    },
  });

  if (awakened) {
    await broadcastQueue.pushEvent(groupId, {
      type: "awakening",
      userId,
      text: "達成覺醒！",
      payload: { prestigeCount: PRESTIGE_CAP },
    });
  }

  return {
    ok: true,
    newPrestigeCount,
    trialId: claimed.trial_id,
    blessingId,
    awakened,
    groupId,
  };
}

module.exports = {
  startTrial,
  forfeitTrial,
  checkTrialCompletion,
  prestige,
  PRESTIGE_CAP,
};
