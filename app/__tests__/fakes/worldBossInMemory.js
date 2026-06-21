/**
 * In-memory fakes for the World Boss cold-start integration gate.
 *
 * Back the REAL WorldBossCombatService.dpsAttack (M4) with Map-backed state so
 * the gate exercises actual combat code (enrage trigger, knockdown batch, lazy
 * recovery, kill CAS) with NO Redis/DB/network. A virtual clock (now/setNow/
 * advance) drives the service's lazy natural-recovery branch deterministically.
 *
 * LOCK conformance:
 *   §B  wb:pool / wb:shield / wb:block are keyed by platform_id STRINGS.
 *   §C  worldBossRedis exports EXACTLY the eight names poolAdd / poolPopMin /
 *       poolScore / poolRemove / shieldSet / shieldConsume / blockSet /
 *       blockOwner. No addToPool / popOldest / isKnockedDown / recoverIfExpired
 *       / openBlockWindow / consumeBlockSlot / setShield / consumeShield.
 *   §D  getTotalDamageByEventId returns { total_damage } (an OBJECT).
 *   §6  There is NO remain_hp column. Current HP = boss.hp - SUM(log.damage).
 *
 * If M4's real export names differ, update THESE (not M4) and flag the drift.
 */

"use strict";

function createClock(startMs) {
  let nowMs = startMs || 0;
  return {
    now: () => nowMs,
    setNow: ms => {
      nowMs = ms;
    },
    advance: ms => {
      nowMs += ms;
    },
  };
}

// --- Fake worldBossRedis: pool ZSET + block/shield, keyed by platform_id (§B/§C) ---
function createRedisFake(clock) {
  const pools = new Map(); // eventId -> Map(platformId -> knockedTsMs)
  const blocks = new Map(); // eventId -> { owner: platformId, expiresMs }
  const shields = new Map(); // `${eventId}:${targetPlatformId}` -> { owner, expiresMs }

  function pool(eventId) {
    const k = String(eventId);
    if (!pools.has(k)) pools.set(k, new Map());
    return pools.get(k);
  }

  return {
    _clock: clock,
    // ZADD member=platformId score=ts
    poolAdd: async (eventId, platformId, ts) => {
      pool(eventId).set(String(platformId), ts);
    },
    // ZPOPMIN -> member strings only ([] when empty)
    poolPopMin: async (eventId, count) => {
      const p = pool(eventId);
      const sorted = [...p.entries()].sort((a, b) => a[1] - b[1]);
      const popped = sorted.slice(0, count).map(([m]) => m);
      popped.forEach(m => p.delete(m));
      return popped;
    },
    // ZSCORE -> ts | null
    poolScore: async (eventId, platformId) => {
      const score = pool(eventId).get(String(platformId));
      return score === undefined ? null : score;
    },
    // ZREM
    poolRemove: async (eventId, platformId) => {
      pool(eventId).delete(String(platformId));
    },
    // SET wb:shield:{event}:{target} = ownerPlatformId EX ttl
    shieldSet: async (eventId, targetPlatformId, ownerPlatformId, ttlSec) => {
      shields.set(`${eventId}:${targetPlatformId}`, {
        owner: String(ownerPlatformId),
        expiresMs: clock.now() + ttlSec * 1000,
      });
    },
    // GETDEL-style -> ownerPlatformId | null
    shieldConsume: async (eventId, targetPlatformId) => {
      const key = `${eventId}:${targetPlatformId}`;
      const s = shields.get(key);
      if (!s || s.expiresMs < clock.now()) {
        shields.delete(key);
        return null;
      }
      shields.delete(key);
      return s.owner;
    },
    // SET wb:block:{event} = ownerPlatformId EX ttl
    blockSet: async (eventId, ownerPlatformId, ttlSec) => {
      blocks.set(String(eventId), {
        owner: String(ownerPlatformId),
        expiresMs: clock.now() + ttlSec * 1000,
      });
    },
    // GET wb:block:{event} -> ownerPlatformId | null
    blockOwner: async eventId => {
      const b = blocks.get(String(eventId));
      if (!b || b.expiresMs < clock.now()) {
        blocks.delete(String(eventId));
        return null;
      }
      return b.owner;
    },
    _dump: () => ({ pools, blocks, shields }),
  };
}

// --- Fake WorldBossLog: log rows; HP read = { total_damage } object (§D/§6) ---
function createLogFake() {
  const rows = [];
  return {
    _rows: rows,
    createWithRole: async row => {
      rows.push({ ...row, id: rows.length + 1 });
      return rows.length;
    },
    sumDamage: eventId =>
      rows
        .filter(r => r.world_boss_event_id === eventId)
        .reduce((sum, r) => sum + (r.damage || 0), 0),
    // §D: real shape is .sum("damage as total_damage").first() -> { total_damage }.
    getTotalDamageByEventId: async function (eventId) {
      return { total_damage: this.sumDamage(eventId) };
    },
    // §E: both ids, created_at DESC within `minutes`, last `limit`.
    getRecentAttackers: async ({ eventId, limit }) =>
      rows
        .filter(r => r.world_boss_event_id === eventId)
        .slice(-limit)
        .reverse()
        .map(r => ({ user_id: r.user_id, platform_id: r.platform_id })),
    // §E: all-DPS server => zero support actions => ratio 0.
    getSupportRatio: async () => 0,
  };
}

// --- Fake WorldBossEvent: active read + kill CAS; §6 NO remain_hp column ---
function createEventFake({ eventId, maxHp }) {
  const event = {
    id: eventId,
    world_boss_id: 1,
    status: "active",
    hp: maxHp,
    killed_at: null,
    settled_at: null,
  };
  return {
    _event: event,
    getActive: async () => (event.status === "active" ? { ...event } : null),
    // casStatus(eventId, from, to, extra) -> boolean (atomic active->killed)
    casStatus: async (id, from, to, extra) => {
      if (event.status !== from) return false;
      event.status = to;
      if (extra && extra.killed_at) event.killed_at = extra.killed_at;
      return true;
    },
  };
}

module.exports = {
  createClock,
  createRedisFake,
  createLogFake,
  createEventFake,
};
