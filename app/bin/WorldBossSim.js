/**
 * World Boss cold-start BALANCE sweep (HP-tuning model — NOT the gate).
 *
 * A fast closed-form lower-bound model of an ALL-DPS server, used to explore
 * cold_start_max_hp candidates before running the slow integration gate
 * (app/__tests__/WorldBossColdStartSim.test.js, which drives the REAL
 * WorldBossCombatService.dpsAttack). This file re-implements an IDEALIZED round
 * model and therefore proves nothing about the shipped combat code -- a passing
 * sweep is a balance sanity-check only. The integration gate is the authority.
 * standardDamage() below is pinned by test to equal RPGCharacter.getStandardDamage()
 * (via the real make factory); enrage knobs are read from config so the model
 * can never silently diverge from M4.
 *
 * Canonical formula (LOCK §D / addendum §1): floor(level^2) + level*10. level 50 = 3000.
 * Enrage doubles the FINAL per-hit damage.
 *
 * Pure compute. No DB / Redis / network. RNG injectable for determinism.
 * Run ad-hoc:  node bin/WorldBossSim.js
 */

"use strict";

const config = require("config");

// Canonical formula — MUST equal RPGCharacter.getStandardDamage()
// (app/src/model/application/RPGCharacter.js:139-141, base formula not
// overridden in any subclass). A test in WorldBossColdStartSim.test.js pins
// this against the real make() factory.
function standardDamage(level) {
  return Math.floor(Math.pow(level, 2)) + level * 10;
}

function knobs() {
  const wb = config.get("worldboss");
  return {
    enrageThresholdPct: wb.enrage_threshold_pct,
    enrageBatchSize: wb.enrage_batch_size,
    enrageCounterRate: wb.enrage_counter_rate,
    enrageDamageMultiplier: wb.enrage_damage_multiplier,
    dailyLimit: wb.daily_limit,
    normalAttackCost: wb.normal_attack_cost,
  };
}

function simulateColdStart(opts) {
  const cfg = knobs();
  const rng = opts.rng || Math.random;
  const players = opts.players;
  const levelMin = opts.levelMin;
  const levelMax = opts.levelMax;
  const maxHp = opts.maxHp;
  const maxRounds = opts.maxRounds;

  const hitsPerDay = Math.floor(cfg.dailyLimit / cfg.normalAttackCost);
  const enrageHpFloor = maxHp * (cfg.enrageThresholdPct / 100);

  const roster = [];
  for (let i = 0; i < players; i++) {
    const span = levelMax - levelMin + 1;
    const level = levelMin + Math.floor(rng() * span);
    roster.push({ level: level, hitsLeft: hitsPerDay, knockedThisRound: false });
  }

  let hp = maxHp;
  let enraged = false;
  let totalHits = 0;
  let totalKnockdowns = 0;
  let round = 0;

  while (hp > 0 && round < maxRounds) {
    round++;
    for (let i = 0; i < roster.length; i++) {
      roster[i].knockedThisRound = false;
    }

    for (let i = 0; i < roster.length; i++) {
      const p = roster[i];
      if (hp <= 0) break;
      if (p.hitsLeft <= 0) continue;
      if (p.knockedThisRound) continue;

      p.hitsLeft--;
      totalHits++;

      let dmg = standardDamage(p.level);
      // Crossing hit is computed in the calm band (NOT doubled); hits that START
      // already enraged get x2 (LOCK §D). Modelled by doubling only when already
      // enraged at the top of this hit.
      if (enraged) dmg *= cfg.enrageDamageMultiplier;
      hp -= dmg;

      if (!enraged && hp <= enrageHpFloor) {
        enraged = true;
        const start = Math.max(0, i - cfg.enrageBatchSize + 1);
        for (let j = start; j <= i; j++) {
          if (!roster[j].knockedThisRound) {
            roster[j].knockedThisRound = true;
            totalKnockdowns++;
          }
        }
      } else if (enraged && rng() < cfg.enrageCounterRate) {
        p.knockedThisRound = true;
        totalKnockdowns++;
      }
    }

    const anyHitsLeft = roster.some(p => p.hitsLeft > 0);
    if (!anyHitsLeft) break;
  }

  return {
    killed: hp <= 0,
    finalHp: hp,
    roundsUsed: round,
    totalHits: totalHits,
    totalKnockdowns: totalKnockdowns,
  };
}

function makeLcg(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function runMonteCarlo(opts) {
  const trials = opts.trials;
  const baseSeed = opts.seed || 1;

  let kills = 0;
  let roundsSum = 0;
  let finalHpPctSum = 0;

  for (let t = 0; t < trials; t++) {
    const r = simulateColdStart({
      players: opts.players,
      levelMin: opts.levelMin,
      levelMax: opts.levelMax,
      maxHp: opts.maxHp,
      maxRounds: opts.maxRounds,
      rng: makeLcg(baseSeed + t),
    });
    if (r.killed) {
      kills++;
      roundsSum += r.roundsUsed;
    }
    finalHpPctSum += Math.max(0, r.finalHp) / opts.maxHp;
  }

  return {
    trials: trials,
    kills: kills,
    killRate: kills / trials,
    avgRoundsToKill: kills > 0 ? roundsSum / kills : null,
    avgFinalHpPct: finalHpPctSum / trials,
  };
}

module.exports = { simulateColdStart, runMonteCarlo, standardDamage, makeLcg };

if (require.main === module) {
  // Sweep a range of HP candidates to find the killable lower bound.
  // 80 players levels 20-60, 200 trials per candidate, kill-rate target >= 0.95.
  const candidates = [200000, 300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000];
  console.log("HP-tuning sweep: 80 players, levels 20-60, 200 trials each");
  console.log("Looking for killRate >= 0.95 (cold_start_max_hp lower bound for M10.4)\n");

  let suggestedHp = null;
  for (const hp of candidates) {
    const mc = runMonteCarlo({
      trials: 200,
      players: 80,
      levelMin: 20,
      levelMax: 60,
      maxHp: hp,
      maxRounds: 50,
      seed: 1,
    });
    const marker = mc.killRate >= 0.95 ? " <-- killable (>= 0.95)" : "";
    console.log(
      `maxHp=${hp.toLocaleString()} killRate=${mc.killRate.toFixed(3)}` +
        ` avgRounds=${mc.avgRoundsToKill !== null ? mc.avgRoundsToKill.toFixed(1) : "N/A"}` +
        marker
    );
    if (suggestedHp === null && mc.killRate >= 0.95) {
      suggestedHp = hp;
    }
  }

  console.log(
    suggestedHp !== null
      ? `\nSuggested cold_start_max_hp lower bound: ${suggestedHp.toLocaleString()}`
      : "\nNo candidate achieved killRate >= 0.95 — lower HP or add more players."
  );
}
