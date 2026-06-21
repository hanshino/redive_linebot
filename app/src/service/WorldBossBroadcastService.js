const { io } = require("../util/connection");
const WorldBossLog = require("../model/application/WorldBossLog");
const WorldBossEvent = require("../model/application/WorldBossEvent");
const WorldBoss = require("../model/application/WorldBoss");
const WorldBossEventLogService = require("./WorldBossEventLogService");
const WorldBossConfig = require("./WorldBossConfig");

const NAMESPACE = "/world-boss";
const DEBOUNCE_MS = 250; // ~4 Hz upper bound on emits per event (D23)
const BOARD_LIMIT = 5;
const FEED_LIMIT = 20;

// eventId -> { handle, promise, resolve } (promise is awaitable for tests/callers)
const pending = new Map();

const roomName = eventId => `wb:${eventId}`;
exports.roomName = roomName;

const emptySnapshot = eventId => ({
  eventId: Number(eventId),
  hpPct: 0,
  phase: "calm",
  boards: { dps: [], healer: [], tank: [] },
  feed: [],
});

/**
 * Build a snapshot of the current boss state.
 * HP is COMPUTED (boss.hp - SUM(damage)) — no remain_hp column exists. (addendum §6)
 * Phase is derived from hpPct vs enrage threshold from WorldBossConfig (dead-column speed with
 * config fallback via readEnrageThresholdPct). Config is read LAZILY here (never at module load).
 * @param {Number} eventId
 * @returns {Promise<Object>}
 */
exports.buildSnapshot = async eventId => {
  const event = await WorldBossEvent.getActive();
  if (!event) return emptySnapshot(eventId);

  // WorldBossEvent.getActive() does not JOIN world_boss — fetch boss template separately.
  const boss = await WorldBoss.find(event.world_boss_id);

  // HP is NOT a column — compute it: boss.hp - SUM(damage). (addendum §6: no remain_hp)
  const { total_damage: totalDamage } =
    await WorldBossEventLogService.getRemainHpByEventId(eventId);
  const maxHp = Number(boss && boss.hp) || 0;
  const remain = Math.max(0, maxHp - Number(totalDamage || 0));
  const hpPct = maxHp > 0 ? Math.max(0, Math.round((remain / maxHp) * 100)) : 0;

  // Dead-column speed = enrage threshold % (addendum §7); WorldBossConfig handles 0/null fallback.
  const threshold = WorldBossConfig.readEnrageThresholdPct(boss);
  const phase = hpPct <= threshold ? "enrage" : "calm";

  const recentMinutes = WorldBossConfig.readEnrageRecentMinutes();
  const [rawDps, rawHealer, rawTank, rawFeed] = await Promise.all([
    WorldBossLog.getDamageRank({ eventId, limit: BOARD_LIMIT }),
    WorldBossLog.getContributionRank({ eventId, role: "healer", limit: BOARD_LIMIT }),
    WorldBossLog.getContributionRank({ eventId, role: "tank", limit: BOARD_LIMIT }),
    WorldBossLog.getRecentAttackers({ eventId, minutes: recentMinutes, limit: FEED_LIMIT }),
  ]);

  // Strip internal numeric user_id — clients must only see platform_id. (addendum §8)
  const dps = rawDps.map(r => ({ platform_id: r.platform_id, total_damage: r.total_damage }));
  const healer = rawHealer.map(r => ({
    platform_id: r.platform_id,
    total_contribution: r.total_contribution,
  }));
  const tank = rawTank.map(r => ({
    platform_id: r.platform_id,
    total_contribution: r.total_contribution,
  }));
  const feed = rawFeed.map(r => ({ platform_id: r.platform_id }));

  return {
    eventId: Number(eventId),
    hpPct,
    phase,
    boards: { dps, healer, tank },
    feed,
  };
};

/**
 * Debounced broadcast: coalesces rapid calls into a single snapshot emit per debounce window.
 * Returns the in-flight flush Promise so callers/tests can await completion.
 * @param {Number} eventId
 * @returns {Promise<void>}
 */
exports.requestBroadcast = eventId => {
  if (pending.has(eventId)) return pending.get(eventId).promise; // already scheduled — coalesce

  let resolveFlush;
  const promise = new Promise(resolve => {
    resolveFlush = resolve;
  });

  const handle = setTimeout(async () => {
    pending.delete(eventId);
    try {
      const snapshot = await exports.buildSnapshot(eventId);
      io.of(NAMESPACE).to(roomName(eventId)).emit("snapshot", snapshot);
    } catch (e) {
      console.error("[WorldBossBroadcast] snapshot emit failed", e);
    } finally {
      resolveFlush();
    }
  }, DEBOUNCE_MS);

  pending.set(eventId, { handle, promise });
  return promise;
};

/**
 * One-shot enrage event emitted when the boss crosses the enrage threshold.
 * @param {Number} eventId
 * @param {String[]} knockedBatch  platform_id list of players knocked down by the enrage counter
 */
exports.emitEnrage = (eventId, knockedBatch) => {
  io.of(NAMESPACE)
    .to(roomName(eventId))
    .emit("enrage", { eventId: Number(eventId), knockedBatch });
};
