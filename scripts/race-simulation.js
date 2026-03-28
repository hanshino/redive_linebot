/**
 * Race simulation — run N races with configurable parameters and output statistics.
 *
 * Usage:
 *   node scripts/race-simulation.js [--races 100] [--recovery 12]
 */

// Inline lodash utilities to avoid dependency resolution issues
const _ = {
  random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  clamp(val, lower, upper) {
    return Math.min(Math.max(val, lower), upper);
  },
};

// ─── Config (mirrors app/config/default.json with proposed changes) ──────────

const BASE_CONFIG = {
  trackLength: 80,
  runnerCount: 5,
  stamina: {
    initial: 100,
    minCost: 8,
    maxCost: 15,
    recovery: 5,
  },
  movement: {
    baseMin: 0,
    baseMax: 2,
    guaranteedMin: 0, // minimum move even at 0 stamina (0 = original behavior)
  },
  event: {
    triggerChance: 0.15,
  },
};

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? Number(args[idx + 1]) : defaultVal;
}

const NUM_RACES = getArg("races", 100);
const config = {
  ...BASE_CONFIG,
  trackLength: getArg("track", BASE_CONFIG.trackLength),
  stamina: {
    ...BASE_CONFIG.stamina,
    recovery: getArg("recovery", BASE_CONFIG.stamina.recovery),
  },
  movement: {
    ...BASE_CONFIG.movement,
    guaranteedMin: getArg("min-move", BASE_CONFIG.movement.guaranteedMin),
  },
};

// ─── Simulation logic (mirrors RaceService.js) ──────────────────────────────

const EVENT_TYPES = [
  { type: "trip", weight: 3 },
  { type: "swap", weight: 2 },
  { type: "boost", weight: 3 },
  { type: "global_slow", weight: 1 },
  { type: "trip_wire", weight: 2 },
];

function calcMovement(runner) {
  const base = _.random(config.movement.baseMin, config.movement.baseMax);
  const factor = runner.stamina / 100;
  const move = Math.round(base * factor);
  // Guaranteed minimum: even at 0 stamina, can still crawl forward
  if (config.movement.guaranteedMin > 0 && move < config.movement.guaranteedMin) {
    return _.random(0, 1) < 0.5 ? config.movement.guaranteedMin : 0;
  }
  return move;
}

function pickRandomEvent(runners) {
  const totalWeight = EVENT_TYPES.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * totalWeight;
  let selected = EVENT_TYPES[0];
  for (const evt of EVENT_TYPES) {
    roll -= evt.weight;
    if (roll <= 0) {
      selected = evt;
      break;
    }
  }
  const a = runners[_.random(0, runners.length - 1)];
  const others = runners.filter(r => r.id !== a.id);
  const b = others.length > 0 ? others[_.random(0, others.length - 1)] : null;
  return { type: selected.type, targets: [a.id, b ? b.id : null].filter(Boolean) };
}

function applyEventEffect(event, updates) {
  const findUpdate = id => updates.find(u => u.id === id);
  switch (event.type) {
    case "trip": {
      const u = findUpdate(event.targets[0]);
      if (u) u.position = Math.max(0, u.position - 1);
      break;
    }
    case "swap": {
      const uA = findUpdate(event.targets[0]);
      const uB = findUpdate(event.targets[1]);
      if (uA && uB) {
        const tmp = uA.position;
        uA.position = uB.position;
        uB.position = tmp;
      }
      break;
    }
    case "boost": {
      const u = findUpdate(event.targets[0]);
      if (u) u.position = Math.min(u.position + 2, config.trackLength);
      break;
    }
    case "trip_wire": {
      const u = findUpdate(event.targets[1]);
      if (u) u.status = "stunned";
      break;
    }
  }
}

function simulateRace() {
  const runners = Array.from({ length: config.runnerCount }, (_, i) => ({
    id: i + 1,
    name: `Runner${i + 1}`,
    position: 0,
    stamina: config.stamina.initial,
    status: "normal",
  }));

  let round = 0;
  let eventCount = 0;
  const staminaHistory = []; // track avg stamina per round

  const MAX_ROUNDS = 500; // safety cap

  while (round < MAX_ROUNDS) {
    round++;

    let globalEvent = null;
    if (Math.random() < config.event.triggerChance) {
      globalEvent = pickRandomEvent(runners);
      eventCount++;
    }

    const updates = runners.map(runner => {
      let move = calcMovement(runner);

      if (globalEvent && globalEvent.type === "global_slow") {
        move = Math.min(move, 1);
      }
      if (runner.status === "stunned") {
        move = 0;
      }
      if (runner.status === "slowed") {
        move = Math.max(0, move - 1);
      }

      const newPosition = Math.min(runner.position + move, config.trackLength);
      const staminaCost = _.random(config.stamina.minCost, config.stamina.maxCost);
      const newStamina = _.clamp(
        runner.stamina - staminaCost + config.stamina.recovery,
        0,
        100
      );

      return {
        id: runner.id,
        position: newPosition,
        stamina: newStamina,
        status: "normal",
      };
    });

    if (globalEvent && globalEvent.type !== "global_slow") {
      applyEventEffect(globalEvent, updates);
    }

    // Apply updates
    for (const u of updates) {
      const runner = runners.find(r => r.id === u.id);
      runner.position = u.position;
      runner.stamina = u.stamina;
      runner.status = u.status;
    }

    const avgStamina = runners.reduce((s, r) => s + r.stamina, 0) / runners.length;
    staminaHistory.push(avgStamina);

    // Check finish
    const finishers = runners.filter(r => r.position >= config.trackLength);
    if (finishers.length > 0) {
      return { round, eventCount, staminaHistory, finished: true };
    }
  }

  return { round: MAX_ROUNDS, eventCount, staminaHistory, finished: false };
}

// ─── Run simulation ─────────────────────────────────────────────────────────

console.log("=== 蘭德索爾盃 賽事模擬 ===\n");
console.log("參數:");
console.log(`  trackLength:    ${config.trackLength}`);
console.log(`  movement:       ${config.movement.baseMin}~${config.movement.baseMax}`);
console.log(`  stamina:        初始=${config.stamina.initial}, 消耗=${config.stamina.minCost}~${config.stamina.maxCost}, 回復=${config.stamina.recovery}`);
console.log(`  triggerChance:  ${config.event.triggerChance}`);
console.log(`  模擬場數:       ${NUM_RACES}\n`);

const results = [];
for (let i = 0; i < NUM_RACES; i++) {
  results.push(simulateRace());
}

const rounds = results.map(r => r.round);
const events = results.map(r => r.eventCount);
const unfinished = results.filter(r => !r.finished).length;

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: (sum / sorted.length).toFixed(1),
    median: sorted[Math.floor(sorted.length / 2)],
    p10: sorted[Math.floor(sorted.length * 0.1)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
  };
}

const roundStats = stats(rounds);
const eventStats = stats(events);

console.log("── 回合數統計 ──");
console.log(`  最少: ${roundStats.min}  |  最多: ${roundStats.max}`);
console.log(`  平均: ${roundStats.avg}  |  中位: ${roundStats.median}`);
console.log(`  P10:  ${roundStats.p10}   |  P90:  ${roundStats.p90}`);
console.log(`  未完賽 (>500回合): ${unfinished} 場`);

console.log("\n── 事件數統計 ──");
console.log(`  最少: ${eventStats.min}  |  最多: ${eventStats.max}`);
console.log(`  平均: ${eventStats.avg}  |  中位: ${eventStats.median}`);

// Duration estimation (1 min per round)
console.log("\n── 預估比賽時長 (1分鐘/回合) ──");
console.log(`  最短: ${roundStats.min} 分鐘 (${(roundStats.min / 60).toFixed(1)} 小時)`);
console.log(`  平均: ${roundStats.avg} 分鐘 (${(roundStats.avg / 60).toFixed(1)} 小時)`);
console.log(`  最長: ${roundStats.max} 分鐘 (${(roundStats.max / 60).toFixed(1)} 小時)`);

// Stamina curve — sample from first race
console.log("\n── 體力曲線 (第一場) ──");
const sample = results[0].staminaHistory;
const checkpoints = [1, 10, 25, 50, 75, 100, sample.length];
for (const cp of checkpoints) {
  if (cp <= sample.length) {
    console.log(`  回合 ${String(cp).padStart(3)}: 平均體力 ${sample[cp - 1].toFixed(1)}`);
  }
}

// Distribution histogram
console.log("\n── 回合數分布 ──");
const bucketSize = 10;
const buckets = {};
for (const r of rounds) {
  const key = Math.floor(r / bucketSize) * bucketSize;
  buckets[key] = (buckets[key] || 0) + 1;
}
const maxCount = Math.max(...Object.values(buckets));
const sortedKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
for (const key of sortedKeys) {
  const count = buckets[key];
  const bar = "█".repeat(Math.round((count / maxCount) * 40));
  console.log(`  ${String(key).padStart(3)}~${String(key + bucketSize - 1).padStart(3)} | ${bar} ${count}`);
}
