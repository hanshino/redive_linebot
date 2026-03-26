# Race Game Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the core race game — DB tables, game engine, cron lifecycle, LINE commands, API endpoints, and a basic LIFF page.

**Architecture:** Cron-driven state machine (betting → running → finished). RaceService handles round advancement logic. MySQL stores all state, Inventory model handles goddess stone transactions. LIFF polls API for live status.

**Tech Stack:** Node.js, Knex (MySQL), Redis (locks), Bottender (LINE), React (LIFF), Express API

---

### Task 1: Database Migrations

**Files:**
- Create: `app/migrations/TIMESTAMP_create_race_character.js`
- Create: `app/migrations/TIMESTAMP_create_race.js`
- Create: `app/migrations/TIMESTAMP_create_race_runner.js`
- Create: `app/migrations/TIMESTAMP_create_race_bet.js`
- Create: `app/migrations/TIMESTAMP_create_race_event.js`

**Step 1: Create 5 migration files**

Run each command separately to get distinct timestamps:

```bash
cd app && yarn knex migrate:make create_race_character
cd app && yarn knex migrate:make create_race
cd app && yarn knex migrate:make create_race_runner
cd app && yarn knex migrate:make create_race_bet
cd app && yarn knex migrate:make create_race_event
```

**Step 2: Write race_character migration**

```javascript
exports.up = function (knex) {
  return knex.schema.createTable("race_character", table => {
    table.increments("id").primary();
    table.string("name", 50).notNullable();
    table.string("personality", 20).nullable();
    table.string("avatar_url", 255).nullable();
    table.json("custom_events").nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race_character");
};
```

**Step 3: Write race migration**

```javascript
exports.up = function (knex) {
  return knex.schema.createTable("race", table => {
    table.increments("id").primary();
    table.enum("status", ["betting", "running", "finished"]).notNullable().defaultTo("betting");
    table.integer("round").unsigned().notNullable().defaultTo(0);
    table.json("terrain").nullable();
    table.integer("winner_runner_id").unsigned().nullable();
    table.datetime("betting_end_at").nullable();
    table.datetime("started_at").nullable();
    table.datetime("finished_at").nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race");
};
```

**Step 4: Write race_runner migration**

```javascript
exports.up = function (knex) {
  return knex.schema.createTable("race_runner", table => {
    table.increments("id").primary();
    table.integer("race_id").unsigned().notNullable();
    table.integer("character_id").unsigned().notNullable();
    table.tinyint("lane").unsigned().notNullable();
    table.tinyint("position").unsigned().notNullable().defaultTo(0);
    table.tinyint("stamina").unsigned().notNullable().defaultTo(100);
    table.enum("status", ["normal", "slowed", "stunned"]).notNullable().defaultTo("normal");
    table.timestamps(true, true);

    table.foreign("race_id").references("race.id").onDelete("CASCADE");
    table.foreign("character_id").references("race_character.id");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race_runner");
};
```

**Step 5: Write race_bet migration**

```javascript
exports.up = function (knex) {
  return knex.schema.createTable("race_bet", table => {
    table.increments("id").primary();
    table.integer("race_id").unsigned().notNullable();
    table.string("user_id", 50).notNullable();
    table.integer("runner_id").unsigned().notNullable();
    table.integer("amount").unsigned().notNullable();
    table.integer("payout").nullable();
    table.timestamps(true, true);

    table.foreign("race_id").references("race.id").onDelete("CASCADE");
    table.foreign("runner_id").references("race_runner.id").onDelete("CASCADE");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race_bet");
};
```

**Step 6: Write race_event migration**

```javascript
exports.up = function (knex) {
  return knex.schema.createTable("race_event", table => {
    table.increments("id").primary();
    table.integer("race_id").unsigned().notNullable();
    table.tinyint("round").unsigned().notNullable();
    table.string("event_type", 30).notNullable();
    table.json("target_runners").nullable();
    table.text("description").nullable();
    table.timestamps(true, true);

    table.foreign("race_id").references("race.id").onDelete("CASCADE");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race_event");
};
```

**Step 7: Run migrations**

```bash
cd app && yarn migrate
```

**Step 8: Seed initial characters**

Create `app/migrations/TIMESTAMP_seed_race_characters.js`:

```bash
cd app && yarn knex migrate:make seed_race_characters
```

```javascript
exports.up = function (knex) {
  return knex("race_character").insert([
    { name: "佩可莉姆", personality: null, avatar_url: null },
    { name: "可可蘿", personality: null, avatar_url: null },
    { name: "凱留", personality: null, avatar_url: null },
    { name: "宮子", personality: null, avatar_url: null },
    { name: "黑騎", personality: null, avatar_url: null },
    { name: "似似花", personality: null, avatar_url: null },
    { name: "初音", personality: null, avatar_url: null },
    { name: "璃乃", personality: null, avatar_url: null },
  ]);
};

exports.down = function (knex) {
  return knex("race_character").del();
};
```

```bash
cd app && yarn migrate
```

**Step 9: Commit**

```bash
git add app/migrations/
git commit -m "feat(race): add database migrations for race game tables and seed characters"
```

---

### Task 2: Models

**Files:**
- Create: `app/src/model/application/Race.js`
- Create: `app/src/model/application/RaceRunner.js`
- Create: `app/src/model/application/RaceBet.js`
- Create: `app/src/model/application/RaceEvent.js`
- Create: `app/src/model/application/RaceCharacter.js`

**Step 1: Create RaceCharacter model**

```javascript
// app/src/model/application/RaceCharacter.js
const Base = require("../base");

class RaceCharacter extends Base {
  constructor() {
    super({ table: "race_character", fillable: ["name", "personality", "avatar_url", "custom_events"] });
  }

  /**
   * Get N random characters from the pool
   * @param {number} count
   */
  async getRandomCharacters(count = 5) {
    return this.knex.orderByRaw("RAND()").limit(count);
  }
}

const raceCharacter = new RaceCharacter();
module.exports = { RaceCharacter, raceCharacter };
```

**Step 2: Create Race model**

```javascript
// app/src/model/application/Race.js
const Base = require("../base");

class Race extends Base {
  constructor() {
    super({
      table: "race",
      fillable: ["status", "round", "terrain", "winner_runner_id", "betting_end_at", "started_at", "finished_at"],
    });
  }

  /** Get the current active race (betting or running) */
  async getActive() {
    return this.knex.whereIn("status", ["betting", "running"]).first();
  }

  /** Get races that need round advancement (running + last updated > 10 min ago) */
  async getNeedAdvance(intervalMinutes = 10) {
    return this.knex
      .where("status", "running")
      .where("updated_at", "<=", this.raw(`NOW() - INTERVAL ${intervalMinutes} MINUTE`));
  }

  /** Get races where betting period has ended but status is still betting */
  async getReadyToStart() {
    return this.knex.where("status", "betting").where("betting_end_at", "<=", this.raw("NOW()"));
  }
}

const race = new Race();
module.exports = { Race, race };
```

**Step 3: Create RaceRunner model**

```javascript
// app/src/model/application/RaceRunner.js
const Base = require("../base");

class RaceRunner extends Base {
  constructor() {
    super({
      table: "race_runner",
      fillable: ["race_id", "character_id", "lane", "position", "stamina", "status"],
    });
  }

  /** Get all runners for a race, joined with character info */
  async getByRace(raceId) {
    return this.knex
      .where("race_runner.race_id", raceId)
      .join("race_character", "race_runner.character_id", "race_character.id")
      .select(
        "race_runner.*",
        "race_character.name as character_name",
        "race_character.personality",
        "race_character.avatar_url"
      )
      .orderBy("race_runner.lane");
  }
}

const raceRunner = new RaceRunner();
module.exports = { RaceRunner, raceRunner };
```

**Step 4: Create RaceBet model**

```javascript
// app/src/model/application/RaceBet.js
const Base = require("../base");

class RaceBet extends Base {
  constructor() {
    super({
      table: "race_bet",
      fillable: ["race_id", "user_id", "runner_id", "amount", "payout"],
    });
  }

  /** Get total pool amount for a race */
  async getTotalPool(raceId) {
    const result = await this.knex.where("race_id", raceId).sum({ total: "amount" }).first();
    return result.total || 0;
  }

  /** Get pool amount per runner */
  async getPoolByRunner(raceId) {
    return this.knex
      .where("race_id", raceId)
      .groupBy("runner_id")
      .select("runner_id")
      .sum({ total: "amount" });
  }

  /** Get all bets for a specific runner */
  async getBetsByRunner(raceId, runnerId) {
    return this.knex.where({ race_id: raceId, runner_id: runnerId });
  }

  /** Get a user's bets for a race */
  async getUserBets(raceId, userId) {
    return this.knex.where({ race_id: raceId, user_id: userId });
  }
}

const raceBet = new RaceBet();
module.exports = { RaceBet, raceBet };
```

**Step 5: Create RaceEvent model**

```javascript
// app/src/model/application/RaceEvent.js
const Base = require("../base");

class RaceEvent extends Base {
  constructor() {
    super({
      table: "race_event",
      fillable: ["race_id", "round", "event_type", "target_runners", "description"],
    });
  }

  /** Get all events for a race */
  async getByRace(raceId) {
    return this.knex.where("race_id", raceId).orderBy("round").orderBy("id");
  }
}

const raceEvent = new RaceEvent();
module.exports = { RaceEvent, raceEvent };
```

**Step 6: Commit**

```bash
git add app/src/model/application/Race*.js
git commit -m "feat(race): add Race, RaceRunner, RaceBet, RaceEvent, RaceCharacter models"
```

---

### Task 3: Game Config

**Files:**
- Modify: `app/config/default.json`

**Step 1: Add race config**

Add under `minigame` key in `app/config/default.json`:

```json
{
  "minigame": {
    "race": {
      "trackLength": 10,
      "runnerCount": 5,
      "bettingDurationMinutes": 15,
      "advanceIntervalMinutes": 10,
      "stamina": {
        "initial": 100,
        "minCost": 8,
        "maxCost": 15,
        "recovery": 5
      },
      "movement": {
        "baseMin": 0,
        "baseMax": 2
      },
      "event": {
        "triggerChance": 0.3
      },
      "bet": {
        "minAmount": 10,
        "maxAmount": 50000,
        "feeRate": 0.1
      },
      "schedule": {
        "startHours": [8, 10, 12, 14, 16, 18, 20, 22]
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add app/config/default.json
git commit -m "feat(race): add race game config to default.json"
```

---

### Task 4: RaceService — Game Engine

**Files:**
- Create: `app/src/service/RaceService.js`

**Step 1: Create RaceService**

```javascript
// app/src/service/RaceService.js
const config = require("config");
const mysql = require("../util/mysql");
const { race } = require("../model/application/Race");
const { raceRunner } = require("../model/application/RaceRunner");
const { raceBet } = require("../model/application/RaceBet");
const { raceEvent } = require("../model/application/RaceEvent");
const { raceCharacter } = require("../model/application/RaceCharacter");
const { inventory } = require("../model/application/Inventory");

const raceConfig = config.get("minigame.race");

/**
 * Create a new race: pick random characters, set betting period
 */
exports.createRace = async function () {
  const active = await race.getActive();
  if (active) return null; // already an active race

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
  await race.update({ id: raceId }, { status: "running", started_at: new Date() });
};

/**
 * Place a bet for a user
 */
exports.placeBet = async function (userId, raceId, runnerId, amount) {
  const activeRace = await race.find(raceId);
  if (!activeRace || activeRace.status !== "betting") {
    return { success: false, error: "目前沒有開放下注的比賽" };
  }

  if (amount < raceConfig.bet.minAmount || amount > raceConfig.bet.maxAmount) {
    return { success: false, error: `下注金額需在 ${raceConfig.bet.minAmount} ~ ${raceConfig.bet.maxAmount} 之間` };
  }

  // Verify runner exists in this race
  const runner = await raceRunner.first({ race_id: raceId, id: runnerId });
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
    await inventory.decreaseGodStone({ userId, amount, note: "race_bet" });
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

    // Reset status after applying
    const newStatus = "normal";

    return {
      id: runner.id,
      position: newPosition,
      stamina: newStamina,
      status: newStatus,
    };
  });

  // Apply individual events (trip, swap, boost, trip_wire)
  if (globalEvent && globalEvent.type !== "global_slow") {
    applyEventEffect(globalEvent, updates, runners);
  }

  // Write to DB in transaction
  return mysql.transaction(async trx => {
    // Update each runner
    for (const u of updates) {
      await trx("race_runner").where("id", u.id).update({
        position: u.position,
        stamina: u.stamina,
        status: u.status,
      });
    }

    // Save events
    for (const evt of events) {
      await trx("race_event").insert({
        race_id: raceId,
        round: newRound,
        event_type: evt.type,
        target_runners: JSON.stringify(evt.targets),
        description: evt.description,
      });
    }

    // Update race round
    await trx("race").where("id", raceId).update({ round: newRound, updated_at: new Date() });

    // Check for winner
    const winner = updates.find(u => u.position >= raceConfig.trackLength);
    if (winner) {
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
 * Settle bets after race finishes
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
        await inventory.increaseGodStone({ userId: bet.user_id, amount: bet.amount, note: "race_refund" });
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
      await inventory.increaseGodStone({ userId: bet.user_id, amount: payout, note: "race_payout" });
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
  { type: "trip", weight: 3, template: "「{A} 被石頭絆倒了！」" },
  { type: "swap", weight: 2, template: "「{A} 和 {B} 突然互換了位置！」" },
  { type: "boost", weight: 3, template: "「{A} 撿到加速道具！」" },
  { type: "global_slow", weight: 1, template: "「突然下起大雨！所有角色減速！」" },
  { type: "trip_wire", weight: 2, template: "「{A} 對 {B} 使用了絆腳索！」" },
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
  let b = runners.filter(r => r.id !== a.id);
  b = b.length > 0 ? b[randomInt(0, b.length - 1)] : null;

  const desc = selected.template
    .replace("{A}", a.character_name)
    .replace("{B}", b ? b.character_name : "");

  return {
    type: selected.type,
    targets: [a.id, b ? b.id : null].filter(Boolean),
    description: desc,
    targetA: a,
    targetB: b,
  };
}

function applyEventEffect(event, updates, runners) {
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
```

**Step 2: Commit**

```bash
git add app/src/service/RaceService.js
git commit -m "feat(race): add RaceService with game engine, betting, and settlement logic"
```

---

### Task 5: Cron Job — Race Lifecycle

**Files:**
- Create: `app/bin/RaceAdvance.js`
- Modify: `app/config/crontab.config.js`

**Step 1: Create RaceAdvance cron handler**

```javascript
// app/bin/RaceAdvance.js
const { race } = require("../src/model/application/Race");
const RaceService = require("../src/service/RaceService");
const config = require("config");

const raceConfig = config.get("minigame.race");

module.exports = async function () {
  try {
    // 1. Check if any betting period has ended → start race
    const readyRaces = await race.getReadyToStart();
    for (const r of readyRaces) {
      console.log(`[Race] Starting race #${r.id}`);
      await RaceService.startRace(r.id);
    }

    // 2. Check if any running race needs advancement
    const advanceable = await race.getNeedAdvance(raceConfig.advanceIntervalMinutes);
    for (const r of advanceable) {
      console.log(`[Race] Advancing race #${r.id} round ${r.round + 1}`);
      const result = await RaceService.advanceRound(r.id);
      if (result && result.finished) {
        console.log(`[Race] Race #${r.id} finished! Settling bets...`);
        await RaceService.settleBets(r.id);
      }
    }

    // 3. Check schedule — should we create a new race?
    const active = await race.getActive();
    if (!active) {
      const now = new Date();
      const currentHour = now.getHours();
      if (raceConfig.schedule.startHours.includes(currentHour)) {
        // Only create if we haven't created one this hour
        const recentRace = await race.knex
          .where("created_at", ">=", new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentHour))
          .first();
        if (!recentRace) {
          const raceId = await RaceService.createRace();
          if (raceId) console.log(`[Race] Created new race #${raceId}`);
        }
      }
    }
  } catch (err) {
    console.error("[Race] Cron error:", err);
  }
};
```

**Step 2: Register in crontab.config.js**

Add to the array:

```javascript
{
  name: "Race Advance",
  description: "manage race lifecycle: create, advance rounds, settle bets",
  period: ["0", "*", "*", "*", "*", "*"], // every minute
  immediate: false,
  require_path: "./bin/RaceAdvance",
},
```

**Step 3: Commit**

```bash
git add app/bin/RaceAdvance.js app/config/crontab.config.js
git commit -m "feat(race): add cron job for race lifecycle management"
```

---

### Task 6: RaceController — LINE Commands

**Files:**
- Create: `app/src/controller/application/RaceController.js`
- Modify: `app/src/app.js` (add router import + spread)

**Step 1: Create RaceController**

```javascript
// app/src/controller/application/RaceController.js
const { text } = require("bottender/router");
const RaceService = require("../../service/RaceService");
const { race } = require("../../model/application/Race");
const { raceRunner } = require("../../model/application/RaceRunner");
const { raceBet } = require("../../model/application/RaceBet");
const config = require("config");

const LIFF_URL = process.env.LIFF_COMPACT_URL || "";

exports.router = [
  text(/^[.#/](賽馬)$/i, showRaceStatus),
  text(/^[.#/]下注\s*(.+)\s+(\d+)$/i, placeBet),
  text(/^[.#/](賽馬紀錄)$/i, showBetHistory),
];

async function showRaceStatus(context) {
  const activeRace = await race.getActive();

  if (!activeRace) {
    await context.replyText("目前沒有進行中的比賽，請等待下一場開賽！");
    return;
  }

  const runners = await raceRunner.getByRace(activeRace.id);
  const trackLen = config.get("minigame.race.trackLength");

  let statusText = "";
  if (activeRace.status === "betting") {
    const endTime = new Date(activeRace.betting_end_at);
    statusText = `🏇 下注中！截止時間: ${endTime.toLocaleTimeString("zh-TW")}\n\n`;
  } else {
    statusText = `🏇 比賽進行中！第 ${activeRace.round} 回合\n\n`;
  }

  for (const runner of runners) {
    const progress = "▓".repeat(runner.position) + "░".repeat(trackLen - runner.position);
    statusText += `${runner.lane}. ${runner.character_name} [${progress}] ${runner.position}/${trackLen}\n`;
  }

  if (LIFF_URL) {
    statusText += `\n📱 詳細資訊: ${LIFF_URL}/race`;
  }

  await context.replyText(statusText);
}

async function placeBet(context, { match }) {
  const { userId } = context.event.source;
  const characterName = match[1].trim();
  const amount = parseInt(match[2], 10);

  const activeRace = await race.getActive();
  if (!activeRace || activeRace.status !== "betting") {
    await context.replyText("目前沒有開放下注的比賽！");
    return;
  }

  const runners = await raceRunner.getByRace(activeRace.id);
  const target = runners.find(r => r.character_name === characterName);
  if (!target) {
    const names = runners.map(r => `${r.lane}. ${r.character_name}`).join("\n");
    await context.replyText(`找不到角色「${characterName}」，本場參賽角色:\n${names}`);
    return;
  }

  const result = await RaceService.placeBet(userId, activeRace.id, target.id, amount);
  if (!result.success) {
    await context.replyText(result.error);
    return;
  }

  // Show current odds
  const odds = await RaceService.getOdds(activeRace.id);
  const targetOdd = odds.find(o => o.runnerId === target.id);
  await context.replyText(
    `✅ 成功下注 ${amount} 女神石在「${characterName}」！\n` +
      `目前賠率: ${targetOdd ? targetOdd.odds : "-"}x`
  );
}

async function showBetHistory(context) {
  const { userId } = context.event.source;
  const recentBets = await raceBet.knex
    .where("race_bet.user_id", userId)
    .join("race_runner", "race_bet.runner_id", "race_runner.id")
    .join("race_character", "race_runner.character_id", "race_character.id")
    .join("race", "race_bet.race_id", "race.id")
    .select("race_bet.*", "race_character.name as character_name", "race.status as race_status")
    .orderBy("race_bet.created_at", "desc")
    .limit(10);

  if (recentBets.length === 0) {
    await context.replyText("你還沒有下注紀錄！");
    return;
  }

  let text = "🏇 最近下注紀錄:\n\n";
  for (const bet of recentBets) {
    const statusIcon = bet.payout > 0 ? "🏆" : bet.payout === 0 ? "❌" : "⏳";
    const payoutText = bet.payout !== null ? ` → ${bet.payout > 0 ? "+" : ""}${bet.payout || "未中獎"}` : "";
    text += `${statusIcon} ${bet.character_name} | ${bet.amount} 石${payoutText}\n`;
  }

  await context.replyText(text);
}
```

**Step 2: Register in app.js**

Import at the top of `app/src/app.js` (near other controller imports):

```javascript
const RaceController = require("./controller/application/RaceController");
```

Add in OrderBased router array (after JankenController.router):

```javascript
...RaceController.router,
```

**Step 3: Commit**

```bash
git add app/src/controller/application/RaceController.js app/src/app.js
git commit -m "feat(race): add LINE commands for race status, betting, and history"
```

---

### Task 7: API Endpoints

**Files:**
- Create: `app/src/router/race.js`
- Modify: `app/src/router/api.js`

**Step 1: Create race API router**

```javascript
// app/src/router/race.js
const express = require("express");
const router = express.Router();
const { race } = require("../model/application/Race");
const { raceRunner } = require("../model/application/RaceRunner");
const { raceBet } = require("../model/application/RaceBet");
const { raceEvent } = require("../model/application/RaceEvent");
const RaceService = require("../service/RaceService");
const { verifyToken } = require("../middleware/validation");

// Public: get current race status
router.get("/current", async (req, res) => {
  const activeRace = await race.getActive();
  if (!activeRace) {
    return res.json({ race: null });
  }

  const runners = await raceRunner.getByRace(activeRace.id);
  const events = await raceEvent.getByRace(activeRace.id);
  const odds = await RaceService.getOdds(activeRace.id);

  res.json({ race: activeRace, runners, events, odds });
});

// Public: get finished race result
router.get("/:raceId", async (req, res) => {
  const { raceId } = req.params;
  const raceData = await race.find(raceId);
  if (!raceData) return res.status(404).json({ error: "Race not found" });

  const runners = await raceRunner.getByRace(raceId);
  const events = await raceEvent.getByRace(raceId);

  res.json({ race: raceData, runners, events });
});

// Auth: place bet
router.post("/bet", verifyToken, async (req, res) => {
  const { userId } = req.profile;
  const { raceId, runnerId, amount } = req.body;

  if (!raceId || !runnerId || !amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const result = await RaceService.placeBet(userId, raceId, runnerId, parseInt(amount, 10));
  res.json(result);
});

// Auth: get my bets for current race
router.get("/current/my-bets", verifyToken, async (req, res) => {
  const { userId } = req.profile;
  const activeRace = await race.getActive();
  if (!activeRace) return res.json({ bets: [] });

  const bets = await raceBet.getUserBets(activeRace.id, userId);
  res.json({ bets });
});

module.exports = router;
```

**Step 2: Register in api.js**

Add to `app/src/router/api.js`:

```javascript
const RaceRouter = require("./race");
// ...
router.use("/race", RaceRouter);
```

**Step 3: Commit**

```bash
git add app/src/router/race.js app/src/router/api.js
git commit -m "feat(race): add REST API endpoints for race status, betting, and results"
```

---

### Task 8: LIFF Frontend — Race Page

**Files:**
- Create: `frontend/src/pages/Race.jsx`
- Create: `frontend/src/api/race.js`
- Modify: `frontend/src/App.jsx` (add route)

**Step 1: Create API helper**

```javascript
// frontend/src/api/race.js
import axios from "axios";

const api = axios.create({ baseURL: "/api/race" });

export const getCurrentRace = () => api.get("/current").then(r => r.data);
export const placeBet = (raceId, runnerId, amount) =>
  api.post("/bet", { raceId, runnerId, amount }).then(r => r.data);
export const getMyBets = () => api.get("/current/my-bets").then(r => r.data);
```

**Step 2: Create Race page**

Build a basic but functional page with:
- Race track visualization (progress bars)
- Runner info (name, stamina, status)
- Betting form (during betting phase)
- Event log
- Odds display
- Auto-refresh every 10 seconds

This will be a single-page React component. Follow existing frontend patterns (Material-UI, functional components with hooks).

**Step 3: Add route in App.jsx**

```javascript
import Race from "./pages/Race";
// in Routes:
<Route path="race" element={<Race />} />
```

**Step 4: Commit**

```bash
git add frontend/src/pages/Race.jsx frontend/src/api/race.js frontend/src/App.jsx
git commit -m "feat(race): add LIFF race page with track visualization and betting UI"
```

---

### Task 9: Integration Testing & Fixes

**Step 1: Run migrations locally**

```bash
cd app && yarn migrate
```

**Step 2: Verify cron registration**

Start the app locally and check logs for `[Race]` entries.

**Step 3: Test LINE commands**

- Send `.賽馬` → should show "no active race" message
- Manually insert a test race via DB or temporarily modify cron to create immediately
- Send `.下注 佩可莉姆 100` → test betting flow
- Send `.賽馬紀錄` → test history

**Step 4: Test LIFF page**

- Navigate to `localhost/race`
- Verify polling works
- Test bet placement through UI

**Step 5: Fix any issues found**

**Step 6: Final commit**

```bash
git add -u
git commit -m "fix(race): integration fixes from testing"
```

---

### Summary

| Task | What | Files |
|------|------|-------|
| 1 | DB Migrations + Seed | `app/migrations/` (6 files) |
| 2 | Models (5) | `app/src/model/application/Race*.js` |
| 3 | Config | `app/config/default.json` |
| 4 | RaceService engine | `app/src/service/RaceService.js` |
| 5 | Cron job | `app/bin/RaceAdvance.js`, `crontab.config.js` |
| 6 | LINE commands | `app/src/controller/application/RaceController.js`, `app.js` |
| 7 | API endpoints | `app/src/router/race.js`, `api.js` |
| 8 | LIFF page | `frontend/src/pages/Race.jsx`, `api/race.js`, `App.jsx` |
| 9 | Integration test | Various fixes |
