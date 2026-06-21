"use strict";

const config = require("config");
const WorldBossEvent = require("../model/application/WorldBossEvent");
const WorldBossLog = require("../model/application/WorldBossLog");
const WorldBossRewardLog = require("../model/application/WorldBossRewardLog");
const { DefaultLogger } = require("../util/Logger");

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

  // faucet computed in Task 2; real grant trx in Task 3. Skeleton: grant zeroed.
  for (const [numericId, platformId] of idMap) {
    if (!platformId) {
      DefaultLogger.warn(
        `[WorldBossSettlement] event ${eventId}: numeric id ${numericId} has no platform_id; skipping`
      );
      continue;
    }
    await grantOne({
      eventId,
      platformId,
      materials: 0,
      stones: 0,
      board: "none",
      rank: null,
      isMvp: false,
    });
  }

  void config;
  void ENHANCEMENT_MATERIAL_ITEM_ID;
  void isExpired;
};

async function grantOne({ eventId, platformId, materials, stones, board, rank, isMvp }) {
  // replaced by the real idempotent per-user trx in Task 3.
  return WorldBossRewardLog.tryInsert({
    user_id: platformId,
    world_boss_event_id: eventId,
    materials,
    stones,
    board,
    rank,
    is_mvp: isMvp,
  });
}

exports._grantOne = grantOne;
