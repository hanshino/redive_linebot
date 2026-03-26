const config = require("config");
const mysql = require("../util/mysql");
const { race } = require("../model/application/Race");
const { raceRunner } = require("../model/application/RaceRunner");
const { raceBet } = require("../model/application/RaceBet");
const { raceCharacter } = require("../model/application/RaceCharacter");
const { inventory } = require("../model/application/Inventory");

const raceConfig = config.get("minigame.race");

/**
 * Create a new race: pick random characters, set betting period
 * @returns {Promise<number|null>} raceId or null if race already active
 */
exports.createRace = async function () {
  const active = await race.getActive();
  if (active) return null;

  const characters = await raceCharacter.getRandomCharacters(raceConfig.runnerCount);
  if (characters.length < raceConfig.runnerCount) return null;

  const bettingEnd = new Date(Date.now() + raceConfig.bettingDurationMinutes * 60 * 1000);

  return mysql.transaction(async trx => {
    const [raceId] = await trx("race").insert({
      status: "betting",
      round: 0,
      terrain: null,
      betting_end_at: bettingEnd,
    });

    const runners = characters.map((char, i) => ({
      race_id: raceId,
      character_id: char.id,
      lane: i + 1,
      position: 0,
      stamina: raceConfig.stamina.initial,
      status: "normal",
    }));

    await trx("race_runner").insert(runners);

    return raceId;
  });
};

/**
 * Transition race from betting → running
 */
exports.startRace = async function (raceId) {
  await race.update(raceId, { status: "running", started_at: new Date() });
};

/**
 * Place a bet for a user
 */
exports.placeBet = async function (userId, raceId, runnerId, amount) {
  const activeRace = await race.find(raceId);
  if (!activeRace || activeRace.status !== "betting") {
    return { success: false, error: "目前沒有開放下注的比賽" };
  }

  // Check if betting period has expired (cron may not have transitioned yet)
  if (activeRace.betting_end_at && new Date(activeRace.betting_end_at) <= new Date()) {
    return { success: false, error: "下注時間已截止，比賽即將開始" };
  }

  if (amount < raceConfig.bet.minAmount || amount > raceConfig.bet.maxAmount) {
    return {
      success: false,
      error: `下注金額需在 ${raceConfig.bet.minAmount} ~ ${raceConfig.bet.maxAmount} 之間`,
    };
  }

  // Verify runner exists in this race
  const runners = await raceRunner.getByRace(raceId);
  const runner = runners.find(r => r.id === runnerId);
  if (!runner) {
    return { success: false, error: "找不到指定的參賽角色" };
  }

  // Check balance and deduct
  const { amount: balance } = (await inventory.getUserMoney(userId)) || { amount: 0 };
  if (balance < amount) {
    return { success: false, error: `女神石不足，目前餘額: ${balance}` };
  }

  await mysql.transaction(async trx => {
    await trx("race_bet").insert({
      race_id: raceId,
      user_id: userId,
      runner_id: runnerId,
      amount,
    });
    await trx("Inventory").insert([
      { userId, itemId: 999, itemAmount: `${-amount}`, note: "race_bet" },
    ]);
  });

  return { success: true };
};

/**
 * Advance one round: move all runners, trigger events, check finish
 */
exports.advanceRound = async function (raceId) {
  const currentRace = await race.find(raceId);
  if (!currentRace || currentRace.status !== "running") return null;

  const runners = await raceRunner.getByRace(raceId);
  const newRound = currentRace.round + 1;
  const events = [];

  // Random event (30% chance)
  let globalEvent = null;
  if (Math.random() < raceConfig.event.triggerChance) {
    globalEvent = pickRandomEvent(runners);
    if (globalEvent) events.push(globalEvent);
  }

  // Move each runner
  const updates = runners.map(runner => {
    let move = calcMovement(runner);

    // Apply global slowdown event
    if (globalEvent && globalEvent.type === "global_slow") {
      move = Math.min(move, 1);
    }

    // Apply stunned status
    if (runner.status === "stunned") {
      move = 0;
    }

    // Apply slowed status
    if (runner.status === "slowed") {
      move = Math.max(0, move - 1);
    }

    const newPosition = Math.min(runner.position + move, raceConfig.trackLength);
    const staminaCost = randomInt(raceConfig.stamina.minCost, raceConfig.stamina.maxCost);
    const newStamina = clamp(runner.stamina - staminaCost + raceConfig.stamina.recovery, 0, 100);

    return {
      id: runner.id,
      lane: runner.lane,
      position: newPosition,
      stamina: newStamina,
      status: "normal",
    };
  });

  // Apply individual events (trip, swap, boost, trip_wire)
  if (globalEvent && globalEvent.type !== "global_slow") {
    applyEventEffect(globalEvent, updates);
  }

  // Write to DB in transaction
  return mysql.transaction(async trx => {
    for (const u of updates) {
      await trx("race_runner").where("id", u.id).update({
        position: u.position,
        stamina: u.stamina,
        status: u.status,
      });
    }

    for (const evt of events) {
      await trx("race_event").insert({
        race_id: raceId,
        round: newRound,
        event_type: evt.type,
        target_runners: JSON.stringify(evt.targets),
        description: evt.description,
      });
    }

    await trx("race").where("id", raceId).update({ round: newRound });

    // Check for winner — tiebreak: stamina (desc) → lane (asc)
    const finishers = updates.filter(u => u.position >= raceConfig.trackLength);
    if (finishers.length > 0) {
      finishers.sort((a, b) => b.stamina - a.stamina || a.lane - b.lane);
      const winner = finishers[0];
      await trx("race").where("id", raceId).update({
        status: "finished",
        winner_runner_id: winner.id,
        finished_at: new Date(),
      });
      return { finished: true, winnerId: winner.id, round: newRound, events };
    }

    return { finished: false, round: newRound, events };
  });
};

/**
 * Settle bets after race finishes (parimutuel)
 */
exports.settleBets = async function (raceId) {
  const currentRace = await race.find(raceId);
  if (!currentRace || currentRace.status !== "finished" || !currentRace.winner_runner_id) return;

  const totalPool = await raceBet.getTotalPool(raceId);
  if (totalPool === 0) return;

  const winnerBets = await raceBet.getBetsByRunner(raceId, currentRace.winner_runner_id);

  // No one bet on winner → refund all
  if (winnerBets.length === 0) {
    const allBets = await raceBet.knex.where("race_id", raceId);
    await mysql.transaction(async trx => {
      for (const bet of allBets) {
        await trx("race_bet").where("id", bet.id).update({ payout: bet.amount });
        await trx("Inventory").insert([
          { userId: bet.user_id, itemId: 999, itemAmount: bet.amount, note: "race_refund" },
        ]);
      }
    });
    return { refunded: true, total: totalPool };
  }

  // Parimutuel settlement
  const fee = Math.floor(totalPool * raceConfig.bet.feeRate);
  const prizePool = totalPool - fee;
  const winnerTotal = winnerBets.reduce((sum, b) => sum + b.amount, 0);

  await mysql.transaction(async trx => {
    for (const bet of winnerBets) {
      const payout = Math.floor(prizePool * (bet.amount / winnerTotal));
      await trx("race_bet").where("id", bet.id).update({ payout });
      await trx("Inventory").insert([
        { userId: bet.user_id, itemId: 999, itemAmount: payout, note: "race_payout" },
      ]);
    }

    // Mark losing bets as payout 0
    await trx("race_bet")
      .where("race_id", raceId)
      .where("runner_id", "!=", currentRace.winner_runner_id)
      .update({ payout: 0 });
  });

  return { refunded: false, prizePool, fee, winners: winnerBets.length };
};

/**
 * Get current odds for display
 */
exports.getOdds = async function (raceId) {
  const totalPool = await raceBet.getTotalPool(raceId);
  const poolByRunner = await raceBet.getPoolByRunner(raceId);

  return poolByRunner.map(r => ({
    runnerId: r.runner_id,
    pool: r.total,
    odds: r.total > 0 ? (totalPool / r.total).toFixed(2) : "∞",
  }));
};

// --- Helpers ---

function calcMovement(runner) {
  const base = randomInt(raceConfig.movement.baseMin, raceConfig.movement.baseMax);
  const factor = runner.stamina / 100;
  return Math.round(base * factor);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

const EVENT_TYPES = [
  { type: "trip", weight: 3, template: "{A} 被石頭絆倒了！" },
  { type: "swap", weight: 2, template: "{A} 和 {B} 突然互換了位置！" },
  { type: "boost", weight: 3, template: "{A} 撿到加速道具！" },
  { type: "global_slow", weight: 1, template: "突然下起大雨！所有角色減速！" },
  { type: "trip_wire", weight: 2, template: "{A} 對 {B} 使用了絆腳索！" },
];

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

  const a = runners[randomInt(0, runners.length - 1)];
  let others = runners.filter(r => r.id !== a.id);
  const b = others.length > 0 ? others[randomInt(0, others.length - 1)] : null;

  const desc = selected.template
    .replace("{A}", a.character_name)
    .replace("{B}", b ? b.character_name : "");

  return {
    type: selected.type,
    targets: [a.id, b ? b.id : null].filter(Boolean),
    description: desc,
  };
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
      if (u) u.position = Math.min(u.position + 2, raceConfig.trackLength);
      break;
    }
    case "trip_wire": {
      const u = findUpdate(event.targets[1]);
      if (u) u.status = "stunned";
      break;
    }
  }
}
