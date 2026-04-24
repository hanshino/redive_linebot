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

  await writeBatch(userId, state, {
    today: ctx.today,
    expUnitRows: ctx.expUnitRows,
    rawDelta,
    effectiveDelta,
    msgCount,
    eventRecords,
  });
}

async function writeBatch(userId, state, batch) {
  const existing = await ChatUserData.findByUserId(userId);
  const prevExp = existing?.current_exp ?? 0;
  const prevTrialProgress = existing?.active_trial_exp_progress ?? 0;
  const newExp = Math.min(LEVEL_CAP_EXP, prevExp + batch.effectiveDelta);
  const newLevel = ChatExpUnit.getLevelFromExp(newExp, batch.expUnitRows);
  const newTrialProgress = state.active_trial_id
    ? prevTrialProgress + batch.effectiveDelta
    : prevTrialProgress;

  const updates = { current_exp: newExp, current_level: newLevel };
  if (state.active_trial_id) updates.active_trial_exp_progress = newTrialProgress;

  await ChatUserData.upsert(userId, updates);

  await ChatExpDaily.upsertByUserDate({
    userId,
    date: batch.today,
    rawExp: batch.rawDelta,
    effectiveExp: batch.effectiveDelta,
    msgCount: batch.msgCount,
    honeymoonActive: state.prestige_count === 0,
    trialId: state.active_trial_id,
  });

  for (const rec of batch.eventRecords) {
    await ChatExpEvent.insertEvent(rec);
  }
}

module.exports = { processBatch };
