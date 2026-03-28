/**
 * Race parameter simulation test.
 *
 * Validates that the current config produces races within acceptable bounds.
 * Run this after changing any race parameters (trackLength, stamina, movement, events)
 * to catch issues like stamina depletion deadlocks or runaway race duration.
 *
 * For detailed exploration, use: node scripts/race-simulation.js --races 100
 */

const config = require("config");

const raceConfig = config.get("minigame.race");

// Inline lodash utilities (test should not depend on lodash import path)
function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function clamp(val, lower, upper) {
  return Math.min(Math.max(val, lower), upper);
}

function calcMovement(runner) {
  const base = random(raceConfig.movement.baseMin, raceConfig.movement.baseMax);
  const factor = runner.stamina / 100;
  const move = Math.round(base * factor);
  const guaranteedMin = raceConfig.movement.guaranteedMin || 0;
  if (guaranteedMin > 0 && move < guaranteedMin) {
    return random(0, 1) === 1 ? guaranteedMin : 0;
  }
  return move;
}

function simulateRace() {
  const runners = Array.from({ length: raceConfig.runnerCount }, (_, i) => ({
    id: i + 1,
    position: 0,
    stamina: raceConfig.stamina.initial,
    status: "normal",
  }));

  let round = 0;
  let eventCount = 0;
  const MAX_ROUNDS = 500;

  while (round < MAX_ROUNDS) {
    round++;

    if (Math.random() < raceConfig.event.triggerChance) {
      eventCount++;
    }

    for (const runner of runners) {
      let move = calcMovement(runner);
      if (runner.status === "stunned") move = 0;
      if (runner.status === "slowed") move = Math.max(0, move - 1);

      runner.position = Math.min(runner.position + move, raceConfig.trackLength);
      const staminaCost = random(raceConfig.stamina.minCost, raceConfig.stamina.maxCost);
      runner.stamina = clamp(
        runner.stamina - staminaCost + raceConfig.stamina.recovery,
        0,
        100
      );
      runner.status = "normal";
    }

    if (runners.some(r => r.position >= raceConfig.trackLength)) {
      return { round, eventCount, finished: true };
    }
  }

  return { round: MAX_ROUNDS, eventCount, finished: false };
}

describe("Race simulation parameter validation", () => {
  const NUM_RACES = 50;
  let results;

  beforeAll(() => {
    results = Array.from({ length: NUM_RACES }, () => simulateRace());
  });

  test("all races finish within 500 rounds (no deadlocks)", () => {
    const unfinished = results.filter(r => !r.finished);
    expect(unfinished.length).toBe(0);
  });

  test("average race duration is between 30 and 100 rounds", () => {
    const avgRounds = results.reduce((s, r) => s + r.round, 0) / results.length;
    expect(avgRounds).toBeGreaterThanOrEqual(30);
    expect(avgRounds).toBeLessThanOrEqual(100);
  });

  test("no race finishes in fewer than 15 rounds", () => {
    const tooShort = results.filter(r => r.round < 15);
    expect(tooShort.length).toBe(0);
  });

  test("no race exceeds 300 rounds", () => {
    const tooLong = results.filter(r => r.round > 300);
    expect(tooLong.length).toBe(0);
  });

  test("average event count is between 5 and 30", () => {
    const avgEvents = results.reduce((s, r) => s + r.eventCount, 0) / results.length;
    expect(avgEvents).toBeGreaterThanOrEqual(5);
    expect(avgEvents).toBeLessThanOrEqual(30);
  });
});
