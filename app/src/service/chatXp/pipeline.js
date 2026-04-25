"use strict";

// pipeline.js — XP batch orchestrator
//
// No transaction wrapper: we write sequentially without an explicit DB transaction.
// The batch is popped from Redis exactly once, so re-running doesn't happen unless
// the process crashes mid-batch — acceptable for v1 (eventual-consistency trade-off).

const moment = require("moment");
const config = require("config");
const redis = require("../../util/redis");
const chatUserState = require("../../util/chatUserState");
const ChatUserData = require("../../model/application/ChatUserData");
const ChatExpDaily = require("../../model/application/ChatExpDaily");
const ChatExpEvent = require("../../model/application/ChatExpEvent");
const ChatExpUnit = require("../../model/application/ChatExpUnit");
const { selectCooldownRate } = require("./cooldownTable");
const { computeGroupBonus } = require("./groupBonus");
const { computePerMsgXp } = require("./perMsgXp");
const { applyDiminish } = require("./diminishTier");
const { applyTrialAndPermanent } = require("./trialAndPermanent");
const PrestigeService = require("../PrestigeService");
const broadcastQueue = require("../../util/broadcastQueue");
const { DefaultLogger } = require("../../util/Logger");

const LEVEL_CAP_EXP = 27000;

async function getBaseXp() {
  const redisRate = await redis.get("CHAT_GLOBAL_RATE");
  if (redisRate !== null && redisRate !== undefined) {
    const n = Number(redisRate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return config.get("chat_level.exp.rate.default");
}

function groupByUser(events) {
  const map = new Map();
  for (const ev of events) {
    if (!map.has(ev.userId)) map.set(ev.userId, []);
    map.get(ev.userId).push(ev);
  }
  return map;
}

async function processBatch(events) {
  if (!Array.isArray(events) || events.length === 0) return;

  const base = await getBaseXp();
  const expUnitRows = await ChatExpUnit.all();
  const today = moment().utcOffset(480).format("YYYY-MM-DD");

  const byUser = groupByUser(events);
  for (const [userId, userEvents] of byUser) {
    userEvents.sort((a, b) => a.ts - b.ts);
    await processUserEvents(userId, userEvents, { base, expUnitRows, today });
  }
}

async function processUserEvents(userId, events, ctx) {
  const state = await chatUserState.load(userId);
  const dailyRow = await ChatExpDaily.findByUserDate(userId, ctx.today);
  const dailyRawBefore = dailyRow?.raw_exp ?? 0;
  const honeymoonMult = state.prestige_count === 0 ? 1.2 : 1.0;

  let rawDelta = 0;
  let effectiveDelta = 0;
  let msgCount = 0;
  const eventRecords = [];

  for (const event of events) {
    const cooldownRate = selectCooldownRate(event.timeSinceLastMsg, state);
    const groupBonus = computeGroupBonus(event.groupCount, state);
    const raw = computePerMsgXp({ base: ctx.base, cooldownRate, groupBonus, status: state });

    const scaledIncoming = raw * honeymoonMult;
    const scaledBefore = (dailyRawBefore + rawDelta) * honeymoonMult;
    const afterDiminish = applyDiminish(scaledIncoming, scaledBefore, state);
    const finalEffective = applyTrialAndPermanent(afterDiminish, state);
    const effectiveInt = Math.max(0, Math.round(finalEffective));

    rawDelta += raw;
    effectiveDelta += effectiveInt;
    msgCount += 1;

    eventRecords.push({
      user_id: userId,
      group_id: event.groupId,
      ts: new Date(event.ts),
      raw_exp: raw,
      effective_exp: effectiveInt,
      cooldown_rate: cooldownRate,
      group_bonus: groupBonus,
      modifiers: {
        honeymoon: state.prestige_count === 0,
        active_trial_id: state.active_trial_id,
        active_trial_star: state.active_trial_star,
        blessings: state.blessings,
        permanent_xp_multiplier: state.permanent_xp_multiplier,
      },
    });
  }

  if (rawDelta === 0 && msgCount === 0) return;

  const batchLastGroupId = events[events.length - 1].groupId;
  const result = await writeBatch(userId, state, {
    today: ctx.today,
    expUnitRows: ctx.expUnitRows,
    rawDelta,
    effectiveDelta,
    msgCount,
    eventRecords,
  });

  DefaultLogger.info(
    `[chatXp] user=${userId.slice(0, 8)} msgs=${msgCount} raw=+${rawDelta.toFixed(1)} ` +
      `eff=+${effectiveDelta} ${result.prevLevel}→${result.newLevel} ` +
      `exp=${result.prevExp}→${result.newExp}` +
      (result.hadActiveTrial ? ` trial+=${effectiveDelta}` : "")
  );

  await onBatchWritten(userId, result, batchLastGroupId);
}

async function writeBatch(userId, state, batch) {
  const existing = await ChatUserData.findByUserId(userId);
  const prevExp = existing?.current_exp ?? 0;
  const prevLevel = existing?.current_level ?? 0;
  const prevTrialProgress = existing?.active_trial_exp_progress ?? 0;
  // Use the fresh DB row's active_trial_id (not the cached state's) as the
  // authority for the write phase. state.active_trial_id is a 10-min Redis
  // cache and M3 may end a trial between cache population and this batch;
  // writing against state would advance progress on an already-resolved trial.
  const activeTrialId = existing?.active_trial_id ?? null;
  const newExp = Math.min(LEVEL_CAP_EXP, prevExp + batch.effectiveDelta);
  const newLevel = ChatExpUnit.getLevelFromExp(newExp, batch.expUnitRows);

  const updates = { current_exp: newExp, current_level: newLevel };
  if (activeTrialId) {
    updates.active_trial_exp_progress = prevTrialProgress + batch.effectiveDelta;
  }

  await ChatUserData.upsert(userId, updates);

  await ChatExpDaily.upsertByUserDate({
    userId,
    date: batch.today,
    rawExp: batch.rawDelta,
    effectiveExp: batch.effectiveDelta,
    msgCount: batch.msgCount,
    honeymoonActive: state.prestige_count === 0,
    trialId: activeTrialId,
  });

  // insertEvent calls are sequential without a per-row try/catch: a failure
  // aborts the remaining events mid-loop (chat_user_data + chat_exp_daily
  // already written). This is part of the v1 no-transaction trade-off noted
  // at the top of the file; M3+ may revisit.
  for (const rec of batch.eventRecords) {
    await ChatExpEvent.insertEvent(rec);
  }

  return {
    prevLevel,
    newLevel,
    prevExp,
    newExp,
    hadActiveTrial: Boolean(activeTrialId),
  };
}

async function onBatchWritten(userId, batchResult, groupId) {
  if (batchResult.newLevel > batchResult.prevLevel) {
    DefaultLogger.info(
      `[chatXp] LEVEL UP user=${userId.slice(0, 8)} ` +
        `${batchResult.prevLevel}→${batchResult.newLevel}`
    );
  }
  if (batchResult.hadActiveTrial) {
    await PrestigeService.checkTrialCompletion(userId, groupId);
  }
  if (batchResult.prevLevel < 100 && batchResult.newLevel >= 100) {
    await broadcastQueue.pushEvent(groupId, {
      type: "lv_100_cta",
      userId,
      text: "已達成 Lv.100，可以前往 LIFF 進行轉生",
      payload: { level: 100 },
    });
  }
}

module.exports = { processBatch, __onBatchWritten: onBatchWritten };
