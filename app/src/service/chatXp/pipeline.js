"use strict";

// pipeline.js — XP batch orchestrator
//
// No transaction wrapper: we write sequentially without an explicit DB transaction.
// The batch is popped from Redis exactly once, so re-running doesn't happen unless
// the process crashes mid-batch — acceptable for v1 (eventual-consistency trade-off).

const config = require("config");
const redis = require("../../util/redis");
const { todayUtc8 } = require("../../util/date");
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
const PrestigeTrial = require("../../model/application/PrestigeTrial");
const UserPrestigeTrial = require("../../model/application/UserPrestigeTrial");
const UserPrestigeHistory = require("../../model/application/UserPrestigeHistory");
const broadcastQueue = require("../../util/broadcastQueue");
const { DefaultLogger } = require("../../util/Logger");
const { getClient } = require("bottender");
const Lv50CTA = require("../../templates/application/Prestige/Lv50CTA");
const Lv100CTA = require("../../templates/application/Prestige/Lv100CTA");
const Lv100NoTrialCTA = require("../../templates/application/Prestige/Lv100NoTrialCTA");
const LineClient = getClient("line");

const PRESTIGE_LIFF_PATH = "prestige";

async function resolveProfile(groupId, userId) {
  try {
    if (groupId) {
      const member = await LineClient.getGroupMemberProfile(groupId, userId);
      if (member?.displayName) {
        return { displayName: member.displayName, pictureUrl: member.pictureUrl };
      }
    }
    const user = await LineClient.getUserProfile(userId);
    return { displayName: user?.displayName || "玩家", pictureUrl: user?.pictureUrl };
  } catch {
    return { displayName: "玩家", pictureUrl: undefined };
  }
}

async function resolveUnconsumedPassedTrialName(userId) {
  try {
    const [passed, consumed] = await Promise.all([
      UserPrestigeTrial.listPassedByUserId(userId),
      UserPrestigeHistory.listByUserId(userId),
    ]);
    const passedRows = passed || [];
    if (passedRows.length === 0) return null;
    const consumedSet = new Set((consumed || []).map(h => h.trial_id));
    const unconsumed = passedRows.find(p => !consumedSet.has(p.trial_id));
    if (!unconsumed) return null;
    const trial = await PrestigeTrial.findById(unconsumed.trial_id);
    return trial?.display_name || null;
  } catch {
    return null;
  }
}

const { LV_MAX_TOTAL_EXP: LEVEL_CAP_EXP } = require("../../../seeds/ChatExpUnitSeeder");

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
  const today = todayUtc8();

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

  let rawDelta = 0;
  let effectiveDelta = 0;
  let msgCount = 0;
  const eventRecords = [];

  for (const event of events) {
    const cooldownRate = selectCooldownRate(event.timeSinceLastMsg, state);
    const groupBonus = computeGroupBonus(event.groupCount, state);
    const { raw, blessing1Mult } = computePerMsgXp({
      base: ctx.base,
      cooldownRate,
      groupBonus,
      status: state,
    });

    const honeymoonMult = state.prestige_count === 0 ? 1.2 : 1.0;
    const scaledIncoming = raw * honeymoonMult;
    const scaledBefore = (dailyRawBefore + rawDelta) * honeymoonMult;
    const { result: afterDiminish, factor: diminishFactor } = applyDiminish(
      scaledIncoming,
      scaledBefore,
      state
    );
    const {
      result: finalEffective,
      trialMult,
      permanentMult,
    } = applyTrialAndPermanent(afterDiminish, state);
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
      base_xp: ctx.base,
      blessing1_mult: blessing1Mult,
      honeymoon_mult: honeymoonMult,
      diminish_factor: diminishFactor,
      trial_mult: trialMult,
      permanent_mult: permanentMult,
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
    prestigeCount: existing?.prestige_count ?? 0,
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
  const fireLv50 =
    batchResult.prevLevel < 50 &&
    batchResult.newLevel >= 50 &&
    batchResult.prestigeCount === 0 &&
    !batchResult.hadActiveTrial;
  const fireLv100 = batchResult.prevLevel < 100 && batchResult.newLevel >= 100;

  if (!fireLv50 && !fireLv100) return;

  const { displayName, pictureUrl } = await resolveProfile(groupId, userId);

  if (fireLv50) {
    const liffUri = `https://liff.line.me/${process.env.LINE_LIFF_ID}/${PRESTIGE_LIFF_PATH}`;
    const flex = Lv50CTA.build({
      displayName,
      pictureUrl,
      level: batchResult.newLevel,
      prestigeCount: batchResult.prestigeCount,
      liffUri,
    });
    await broadcastQueue.pushEvent(groupId, {
      type: "lv_50_cta",
      userId,
      flex,
      payload: { level: 50 },
    });
  }
  if (fireLv100) {
    const liffUri = `https://liff.line.me/${process.env.LINE_LIFF_ID}/${PRESTIGE_LIFF_PATH}`;
    const passedTrialName = await resolveUnconsumedPassedTrialName(userId);
    if (passedTrialName) {
      const flex = Lv100CTA.build({
        displayName,
        pictureUrl,
        prestigeCount: batchResult.prestigeCount,
        passedTrialName,
        liffUri,
      });
      await broadcastQueue.pushEvent(groupId, {
        type: "lv_100_cta",
        userId,
        flex,
        payload: { level: 100, prestigeCount: batchResult.prestigeCount, passedTrialName },
      });
    } else {
      const flex = Lv100NoTrialCTA.build({
        displayName,
        pictureUrl,
        prestigeCount: batchResult.prestigeCount,
        liffUri,
      });
      await broadcastQueue.pushEvent(groupId, {
        type: "lv_100_no_trial_cta",
        userId,
        flex,
        payload: { level: 100, prestigeCount: batchResult.prestigeCount },
      });
    }
  }
}

module.exports = { processBatch, __onBatchWritten: onBatchWritten };
