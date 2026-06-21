"use strict";

const config = require("config");
const WorldBossEvent = require("../model/application/WorldBossEvent");
const WorldBossLog = require("../model/application/WorldBossLog");
const WorldBossRewardLog = require("../model/application/WorldBossRewardLog");
const { DefaultLogger } = require("../util/Logger");
const mysql = require("../util/mysql");
const { inventory } = require("../model/application/Inventory");
const AchievementEngine = require("./AchievementEngine");
const WorldBossReportService = require("./WorldBossReportService");

const ENHANCEMENT_MATERIAL_ITEM_ID = 1001;

/**
 * Settle one world-boss event. Concurrency-safe: claims the settlement with an
 * atomic `UPDATE settled_at WHERE settled_at IS NULL` (markSettled) FIRST - only
 * the worker that gets affected===1 proceeds. Aggregates three boards by numeric
 * user.id (each ranked row already carries platform_id); participation-only ids
 * are resolved numeric->platform_id (GATE) before any grant. Reply-only: sets the
 * report unread flag via WorldBossReportService, never pushes.
 * @param {Number} eventId
 * @returns {Promise<void>}
 */
exports.settleEvent = async function (eventId) {
  // 1. join-free read (the JOINing find() collides id/status and breaks on a
  //    deleted template row - must NOT be used for lifecycle status reads).
  const event = await WorldBossEvent.findRaw(eventId);
  if (!event) {
    DefaultLogger.warn(`[WorldBossSettlement] settleEvent: event ${eventId} not found`);
    return;
  }

  // 2. ATOMIC CLAIM - the real concurrency guard. Two racing settleEvent calls:
  //    only one gets affected===1; the loser bails before any aggregation/grant.
  const claimed = await WorldBossEvent.markSettled(eventId);
  if (!claimed) {
    DefaultLogger.info(`[WorldBossSettlement] event ${eventId} already settled/claimed; skipping`);
    return;
  }

  // 3. aggregate three boards by NUMERIC user.id; each row carries platform_id.
  const dpsBoard = await WorldBossLog.getDamageRank({ eventId, limit: 100000 });
  const healerBoard = await WorldBossLog.getContributionRank({
    eventId,
    role: "healer",
    limit: 100000,
  });
  const tankBoard = await WorldBossLog.getContributionRank({
    eventId,
    role: "tank",
    limit: 100000,
  });

  // numeric user_id -> platform_id, read straight off the ranked rows.
  const idMap = new Map();
  const collect = rows => rows.forEach(r => idMap.set(r.user_id, r.platform_id));
  collect(dpsBoard);
  collect(healerBoard);
  collect(tankBoard);

  // 4. GATE - find participation-only ids: participants NOT already on a ranked board.
  //    resolveUserIds is used ONLY for these ids. Ranked players already have platform_id
  //    on their row — no resolveUserIds call needed for them.
  const allParticipants = await WorldBossLog.getParticipants(eventId);
  const participationOnlyIds = allParticipants
    .filter(p => !idMap.has(p.user_id))
    .map(p => p.user_id);

  if (participationOnlyIds.length > 0) {
    const resolved = await WorldBossLog.resolveUserIds(participationOnlyIds);
    // SKIP ids with no user row (deleted accounts) — resolveUserIds returns a Map
    // and absent ids simply won't be present; never mis-credit a deleted account.
    for (const [numericId, platformId] of resolved) {
      idMap.set(numericId, platformId);
    }
  }

  const isExpired = event.status === "expired";

  // shared support ratio (addendum §15) - the SAME value M5 uses for enrage
  // down-scaling; here it drives the D22 support-board scarcity premium.
  const supportRatio = await WorldBossLog.getSupportRatio(eventId);

  const { perUser, dpsMvpNumericId } = exports._computeFaucet({
    dpsBoard,
    healerBoard,
    tankBoard,
    isExpired,
    supportRatio,
  });

  // participation-only players: anyone with >=1 action (getParticipants) who never
  // reached a ranked board row. Their reward row is added at the base participation
  // tier, and their identity is resolved through the GATE (resolveUserIds skips
  // deleted accounts). Ranked players already carry platform_id in idMap.
  const participants = await WorldBossLog.getParticipants(eventId);
  const participationOnly = [];
  for (const p of participants) {
    if (!perUser.has(p.user_id)) {
      perUser.set(p.user_id, {
        materials: isExpired
          ? config.get("worldboss.reward.expired_participation")
          : config.get("worldboss.reward.participation"),
        stones: 0,
        board: "participation",
        rank: null,
        isMvp: false,
      });
    }
    if (!idMap.has(p.user_id)) {
      idMap.set(p.user_id, p.platform_id);
      if (!p.platform_id) participationOnly.push(p.user_id);
    }
  }
  if (participationOnly.length > 0) {
    const resolved = await WorldBossLog.resolveUserIds(participationOnly);
    for (const [numericId, platformId] of resolved) idMap.set(numericId, platformId);
  }

  const dpsMvpPlatformId = dpsMvpNumericId ? idMap.get(dpsMvpNumericId) : null;

  for (const [numericId, faucet] of perUser) {
    const platformId = idMap.get(numericId);
    if (!platformId) {
      DefaultLogger.warn(
        `[WorldBossSettlement] event ${eventId}: numeric id ${numericId} has no platform_id; skipping`
      );
      continue;
    }
    await grantOne({
      eventId,
      platformId,
      materials: faucet.materials,
      stones: faucet.stones,
      board: faucet.board,
      rank: faucet.rank,
      isMvp: faucet.isMvp,
    });

    // best-effort, non-transactional: D26 boss_top_damage repair + report unread
    // flag (M8's WorldBossReportService). NO LINE push - surfaces on next reply /
    // LIFF pull.
    const userDamage = dpsBoard.find(r => r.user_id === numericId);
    await AchievementEngine.evaluate(platformId, "boss_attack", {
      feature: "world_boss",
      damage: userDamage ? userDamage.total_damage : 0,
      isTopDamage: platformId === dpsMvpPlatformId,
    });
    await WorldBossReportService.setUnread(platformId);
  }

  DefaultLogger.info(
    `[WorldBossSettlement] settled event ${eventId}: ${perUser.size} participants`
  );
};

/**
 * Grant one player's reward in its OWN transaction. Idempotency: reward-log
 * tryInsert is the FIRST write and the dedupe key - a dup (false) short-circuits
 * before any ledger write; any throw rolls back ONLY this user's trx. settleEvent
 * is therefore re-runnable: a re-run re-grants only un-granted users (the unique
 * key on world_boss_reward_log dedupes the rest). itemAmount is a positive NUMBER
 * (addendum §13 - grants are positive; matching increaseGodStone's convention).
 */
async function grantOne({ eventId, platformId, materials, stones, board, rank, isMvp }) {
  await mysql.transaction(async trx => {
    const inserted = await WorldBossRewardLog.tryInsert(
      {
        user_id: platformId,
        world_boss_event_id: eventId,
        materials,
        stones,
        board,
        rank,
        is_mvp: isMvp,
      },
      trx
    );
    if (!inserted) return; // duplicate - already granted; no ledger writes.

    if (materials > 0) {
      // insertItems has NO trx param; use the trx-bound builder. itemId 1001 is
      // registered by M3/M4's seeded item-master migration (M7 only grants it).
      await trx("Inventory").insert([
        {
          userId: platformId,
          itemId: ENHANCEMENT_MATERIAL_ITEM_ID,
          itemAmount: materials,
          note: "world_boss_reward",
        },
      ]);
    }
    if (stones > 0) {
      await inventory.increaseGodStone({
        userId: platformId,
        amount: stones,
        note: "world_boss_mvp",
        trx,
      });
    }
  });
}

exports._grantOne = grantOne;

// Healthy support share at the 7:2:1 target (3 support / 10 total) - the anchor
// for the D22 scarcity premium. Shared input is WorldBossLog.getSupportRatio.
const SUPPORT_TARGET_SHARE = 0.3;
const SUPPORT_RATIO_EPS = 0.001;

function bandForPercentile(rankIndex, total, bands) {
  // rankIndex is 0-based. Percentile = rankIndex / max(total-1, 1) so that
  // rank-1 always maps to 0% (p1) and rank-last maps to 100% (rest).
  const pct = rankIndex / Math.max(total - 1, 1);
  if (pct <= 0.01) return bands.p1;
  if (pct <= 0.05) return bands.p5;
  if (pct <= 0.2) return bands.p20;
  return bands.rest;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Scarcity multiplier for support boards (D22, addendum §15). Scales the band
 * bonus UP as the live support ratio -> 0 (cold start), x1 at/above the target
 * share, capped at x3. Consumes the SAME getSupportRatio M5 uses for enrage
 * down-scaling - no parallel proxy.
 * @param {Number} supportRatio
 * @returns {Number}
 */
function scarcityMultiplier(supportRatio) {
  return clamp(SUPPORT_TARGET_SHARE / Math.max(supportRatio, SUPPORT_RATIO_EPS), 1, 3);
}

/**
 * Pure faucet math. No I/O. Rows carry user_id (numeric); perUser keys on the
 * numeric id. supportRatio is supplied by settleEvent (WorldBossLog.getSupportRatio).
 * @returns {{ perUser: Map, dpsMvpNumericId: (Number|null) }}
 */
exports._computeFaucet = function ({ dpsBoard, healerBoard, tankBoard, isExpired, supportRatio }) {
  const participation = config.get("worldboss.reward.participation");
  const expiredParticipation = config.get("worldboss.reward.expired_participation");
  const bands = {
    p1: config.get("worldboss.reward.rank_bands.p1"),
    p5: config.get("worldboss.reward.rank_bands.p5"),
    p20: config.get("worldboss.reward.rank_bands.p20"),
    rest: config.get("worldboss.reward.rank_bands.rest"),
  };
  const mvpStones = config.get("worldboss.reward.mvp_stones");
  const supportMult = scarcityMultiplier(supportRatio);

  const perUser = new Map();
  let dpsMvpNumericId = null;

  // Assign each player to their single best board (highest score).
  const best = new Map(); // numericId -> { board, score, rankIndex, count }
  function consider(board, rows, scoreKey) {
    rows.forEach((r, i) => {
      const score = r[scoreKey] || 0;
      const prev = best.get(r.user_id);
      if (!prev || score > prev.score) {
        best.set(r.user_id, { board, score, rankIndex: i, count: rows.length });
      }
    });
  }
  consider("dps", dpsBoard, "total_damage");
  consider("healer", healerBoard, "total_contribution");
  consider("tank", tankBoard, "total_contribution");

  for (const [numericId, info] of best) {
    if (isExpired) {
      perUser.set(numericId, {
        materials: expiredParticipation,
        stones: 0,
        board: info.board,
        rank: null,
        isMvp: false,
      });
      continue;
    }

    const bandBonus = bandForPercentile(info.rankIndex, info.count, bands);
    let bonus = bandBonus;
    if (info.board === "healer" || info.board === "tank") {
      bonus = Math.round(bandBonus * supportMult);
    }
    const isMvp = info.rankIndex === 0;
    let stones = 0;
    if (info.board === "dps" && isMvp) {
      stones = mvpStones;
      dpsMvpNumericId = numericId;
    }
    perUser.set(numericId, {
      materials: participation + bonus,
      stones,
      board: info.board,
      rank: info.rankIndex + 1,
      isMvp,
    });
  }

  return { perUser, dpsMvpNumericId };
};
