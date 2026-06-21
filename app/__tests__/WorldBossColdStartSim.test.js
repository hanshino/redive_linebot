/**
 * World Boss cold-start acceptance GATE (D30).
 *
 * INTEGRATION gate: drives the REAL WorldBossCombatService.dpsAttack (M4)
 * against in-memory fakes (LOCK §C redis pool/block/shield keyed by platform_id,
 * log store whose HP read returns { total_damage }, event with NO remain_hp
 * column, base-gear equipment). Proves an ALL-DPS server (zero healers, zero
 * tanks) can still bring the daily boss HP to 0 under the default enrage /
 * batch / counter / recovery knobs + cold-start scaling, exercising the real
 * enrage trigger, knockdown batch, lazy recovery and kill CAS -- NOT a
 * re-implemented model.
 *
 * Canonical damage (LOCK §D / addendum §1):
 *   makeCharacter(jobKey,{level}).getStandardDamage()
 *     = Math.floor(Math.pow(level,2)) + level*10.  level 50 = 3000, level 20 = 600.
 *   then damage = Math.floor(damage * (1 + atk_percent)) (atk_percent a FRACTION).
 *
 * attackType is the raw "<jobKey>|<skill>" string (LOCK §D), e.g. "adventurer|skillOne".
 * dpsAttack takes level DIRECTLY -- no MinigameService call -- so no MinigameService mock.
 *
 * If the boss survives, the all-DPS path is unkillable and the feature MUST NOT
 * ship: tune worldboss.* in app/config/default.json (D30 recovery + cold-start
 * scaling) until it passes. If WorldBossCombatService is missing, M4 has not
 * landed -- STOP and flag the dependency; do NOT stub the service.
 *
 * Seeded RNG => deterministic. transform:{} => every jest.mock precedes the
 * require of the mocked path.
 */

"use strict";

const config = require("config");
const {
  createClock,
  createRedisFake,
  createLogFake,
  createEventFake,
} = require("./fakes/worldBossInMemory");

// ---- Per-run mutable fake handles, swapped in driveColdStart ----
let activeRedis;
let activeLog;
let activeEvent;
let activeNumericByPlatform = new Map(); // platformId -> numeric user.id

// ---- Mock collaborators BEFORE requiring the service under test (LOCK §C names) ----
jest.mock(
  "../src/util/worldBossRedis",
  () =>
    new Proxy(
      {},
      {
        get:
          (_t, prop) =>
          (...args) =>
            activeRedis[prop](...args),
      }
    )
);
jest.mock(
  "../src/model/application/WorldBossLog",
  () =>
    new Proxy(
      {},
      {
        get:
          (_t, prop) =>
          (...args) =>
            activeLog[prop](...args),
      }
    )
);
jest.mock(
  "../src/model/application/WorldBossEvent",
  () =>
    new Proxy(
      {},
      {
        get:
          (_t, prop) =>
          (...args) =>
            activeEvent[prop](...args),
      }
    )
);
// Cold start = base gear, no enhancement; atk_percent is a FRACTION (addendum §2).
jest.mock("../src/service/EquipmentService", () => ({
  getEquipmentBonuses: async () => ({
    atk_percent: 0,
    crit_rate: 0,
    cost_reduction: 0,
    exp_bonus: 0,
    gold_bonus: 0,
    support_power: 0,
    block_power: 0,
  }),
}));
// Off-hot-path absorb-credit resolution only (LOCK §B/§D); never hit in all-DPS.
jest.mock("../src/model/application/UserModel", () => ({
  getId: async platformId => activeNumericByPlatform.get(platformId) || null,
}));

// require AFTER all mocks (transform:{} => no hoisting).
const WorldBossCombatService = require("../src/service/WorldBossCombatService");

const wb = config.get("worldboss");

// Deterministic LCG so the gate never flakes across runs/machines.
function makeLcg(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Drive the REAL dpsAttack until kill / hits exhausted / tick cap.
 * @returns {{ killed, finalHp, ticksUsed, totalHits, totalKnockdowns }}
 */
async function driveColdStart({ players, levelMin, levelMax, maxHp, maxTicks, rng }) {
  const eventId = 1;
  const clock = createClock(0);
  activeRedis = createRedisFake(clock);
  activeLog = createLogFake();
  activeEvent = createEventFake({ eventId, maxHp });
  activeNumericByPlatform = new Map();

  const hitsPerDay = Math.floor(wb.daily_limit / wb.normal_attack_cost);
  const recoveryMs = wb.natural_recovery_minutes * 60000;

  const roster = [];
  for (let i = 0; i < players; i++) {
    const span = levelMax - levelMin + 1;
    const level = levelMin + Math.floor(rng() * span);
    const platformId = `U${String(i).padStart(6, "0")}`;
    const numericUserId = i + 1;
    activeNumericByPlatform.set(platformId, numericUserId);
    // base damage is job-independent (addendum §1); raw "<jobKey>|<skill>" form (§D).
    roster.push({
      platformId,
      numericUserId,
      level,
      attackType: "adventurer|skillOne",
      hitsLeft: hitsPerDay,
    });
  }

  let totalHits = 0;
  let totalKnockdowns = 0;
  let tick = 0;

  while (tick < maxTicks) {
    tick++;
    let anyActed = false;

    for (const p of roster) {
      if (activeEvent._event.status !== "active") break;
      if (p.hitsLeft <= 0) continue;

      const res = await WorldBossCombatService.dpsAttack({
        platformId: p.platformId,
        numericUserId: p.numericUserId,
        eventId,
        attackType: p.attackType,
        level: p.level,
      });

      if (res.rejected) {
        // knocked_down etc.: no hit consumed; retry next tick after recovery.
        continue;
      }
      p.hitsLeft--;
      totalHits++;
      anyActed = true;
      if (Array.isArray(res.knockedBatch)) totalKnockdowns += res.knockedBatch.length;
      if (res.selfKnocked) totalKnockdowns++;
    }

    if (activeEvent._event.status !== "active") break;
    // Advance the virtual clock one recovery window so the service's lazy
    // poolScore/poolRemove recovery branch fires on the next tick.
    clock.advance(recoveryMs);

    const anyHitsLeft = roster.some(pl => pl.hitsLeft > 0);
    if (!anyHitsLeft && !anyActed) break;
  }

  const finalHp = maxHp - activeLog.sumDamage(eventId);
  return {
    killed: activeEvent._event.status === "killed",
    finalHp,
    ticksUsed: tick,
    totalHits,
    totalKnockdowns,
  };
}

async function runMonteCarlo({ trials, players, levelMin, levelMax, maxHp, maxTicks, seed }) {
  let kills = 0;
  for (let t = 0; t < trials; t++) {
    const r = await driveColdStart({
      players,
      levelMin,
      levelMax,
      maxHp,
      maxTicks,
      rng: makeLcg((seed || 1) + t),
    });
    if (r.killed) kills++;
  }
  return { trials, kills, killRate: kills / trials };
}

describe("World Boss cold-start (all-DPS) acceptance gate — drives real dpsAttack", () => {
  it("kills the daily boss with zero healers and zero tanks (representative server)", async () => {
    const result = await driveColdStart({
      players: 80,
      levelMin: 20,
      levelMax: 60,
      maxHp: wb.cold_start_max_hp,
      maxTicks: 50,
      rng: makeLcg(12345),
    });

    expect(result.killed).toBe(true);
    expect(result.finalHp).toBeLessThanOrEqual(0);
  });

  it("is NOT trivially weak: one low-level player cannot kill the boss in 1-2 hits", async () => {
    const result = await driveColdStart({
      players: 1,
      levelMin: 20,
      levelMax: 20,
      maxHp: wb.cold_start_max_hp,
      maxTicks: 1,
      rng: makeLcg(999),
    });

    // one lvl-20 getStandardDamage = 20^2 + 20*10 = 600, far below cold_start_max_hp,
    // and a single tick is capped at hitsPerDay=10 hits => <=6000 base damage.
    expect(result.killed).toBe(false);
    expect(result.finalHp).toBeGreaterThan(0);
    expect(result.totalHits).toBeLessThanOrEqual(
      Math.floor(wb.daily_limit / wb.normal_attack_cost)
    );
  });

  it("Monte-Carlo: all-DPS server kills the boss in the large majority of seeded trials", async () => {
    const mc = await runMonteCarlo({
      trials: 100,
      players: 80,
      levelMin: 20,
      levelMax: 60,
      maxHp: wb.cold_start_max_hp,
      maxTicks: 50,
      seed: 1,
    });

    expect(mc.trials).toBe(100);
    // Cold-start safety valve (D30): the all-DPS path must reliably succeed.
    expect(mc.killRate).toBeGreaterThanOrEqual(0.95);
  });

  it("uses the locked default knobs from config (regression guard on gate inputs)", () => {
    expect(wb.enrage_threshold_pct).toBe(35);
    expect(wb.enrage_batch_size).toBe(20);
    expect(wb.enrage_counter_rate).toBe(0.15);
    expect(wb.enrage_damage_multiplier).toBe(2);
    expect(wb.enrage_contribution_multiplier).toBe(2);
    expect(wb.natural_recovery_minutes).toBe(15);
    expect(wb.daily_limit).toBe(100);
    expect(wb.normal_attack_cost).toBe(10);
    expect(wb.cold_start_max_hp).toBeGreaterThan(0);
  });
});
