const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");
const ChatUserData = require("../src/model/application/ChatUserData");
const chatUserState = require("../src/util/chatUserState");

module.exports = main;

// 60-day hardcoded limit — matches prestige_trials.duration_days for all 5
// trials in v1. If a future trial introduces a different duration, move this
// to a per-row JOIN.
const EXPIRY_DAYS = 60;

async function main() {
  try {
    await expireActiveTrials();
  } catch (err) {
    console.error(err);
    if (DefaultLogger && DefaultLogger.error) DefaultLogger.error(err);
  }
}

async function expireActiveTrials() {
  const matched = await mysql("user_prestige_trials as upt")
    .join("chat_user_data as cud", function () {
      this.on("cud.user_id", "upt.user_id").andOn("cud.active_trial_id", "upt.trial_id");
    })
    .where("upt.status", "active")
    .where("upt.started_at", "<", mysql.raw(`NOW() - INTERVAL ${EXPIRY_DAYS} DAY`))
    .select("upt.id", "upt.user_id", "cud.active_trial_exp_progress as progress");

  for (const row of matched || []) {
    await expireOne({
      id: row.id,
      userId: row.user_id,
      progress: row.progress || 0,
      clearChatUserData: true,
    });
  }

  const orphans = await mysql("user_prestige_trials")
    .where("status", "active")
    .where("started_at", "<", mysql.raw(`NOW() - INTERVAL ${EXPIRY_DAYS} DAY`))
    .select("id", "user_id");

  const matchedIds = new Set((matched || []).map(r => r.id));
  for (const row of orphans || []) {
    if (matchedIds.has(row.id)) continue;
    await expireOne({
      id: row.id,
      userId: row.user_id,
      progress: 0,
      clearChatUserData: false,
    });
  }
}

async function expireOne({ id, userId, progress, clearChatUserData }) {
  await mysql("user_prestige_trials")
    .where({ id })
    .update({ status: "failed", ended_at: new Date(), final_exp_progress: progress });

  if (clearChatUserData) {
    await ChatUserData.upsert(userId, {
      active_trial_id: null,
      active_trial_started_at: null,
      active_trial_exp_progress: 0,
    });
  }

  await chatUserState.invalidate(userId);
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
