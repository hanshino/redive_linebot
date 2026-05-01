# Janken Season Reset + Daily Rewards + ELO Rebalance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual season-reset CLI, daily women-stone rewards by ELO ranking, and rebalance ELO/bet/bounty so honest play actually progresses through tiers.

**Architecture:** New `janken_seasons` / `janken_season_snapshot` / `janken_daily_reward_log` tables; per-season fields on `janken_rating` rotate at reset, lifetime counters preserved. CLI for reset (ops-only, not LINE-driven), cron for daily rewards (kill-switched). ELO formula stays the same — only the K table, tier thresholds, bet/bounty caps, and a new `nonBetK` knob change. Phase 2 anti-farming is spec'd but not built (rewards stay off until that ships).

**Tech Stack:** Node.js (CommonJS), Knex (MySQL), Jest, Bottender, Express, React (Vite). All edits inside `app/` workspace except the small frontend chip.

**Spec:** [`docs/superpowers/specs/2026-05-01-janken-season-rewards-design.md`](../specs/2026-05-01-janken-season-rewards-design.md)

**Branch:** `feat/janken-season-rewards` (already created, design doc committed).

---

## Design Principles

- **Schema → config → model → service → bin → controller/api → frontend.** Linear dependency order.
- **Every milestone leaves `yarn test:app` green.** No half-baked merges between milestones.
- **Rewards default-off.** Both `enableSeasonEndRewards` and `enableDailyRankReward` ship as `false`; flip in a follow-up PR after Phase 2 anti-farming.
- **Live data is preserved.** No destructive migration on existing `janken_rating` rows; the season-end CLI is the only path that mutates per-season fields.
- **TDD where logic exists.** Migrations and config files don't get "tests first"; models, services, bin scripts, controllers, and template helpers do.

---

## File Map

### Created

- `app/migrations/<ts>_create_janken_seasons.js`
- `app/migrations/<ts>_create_janken_season_snapshot.js`
- `app/migrations/<ts>_create_janken_daily_reward_log.js`
- `app/migrations/<ts>_add_lifetime_counts_to_janken_rating.js`
- `app/migrations/<ts>_seed_janken_season_one.js`
- `app/src/model/application/JankenSeason.js`
- `app/src/model/application/JankenSeasonSnapshot.js`
- `app/src/model/application/JankenDailyRewardLog.js`
- `app/src/service/JankenSeasonService.js`
- `app/src/service/JankenRewardService.js`
- `app/bin/JankenSeasonEnd.js`
- `app/bin/JankenDailyRewards.js`
- `app/src/model/application/__tests__/JankenSeason.test.js`
- `app/src/model/application/__tests__/JankenSeasonSnapshot.test.js`
- `app/src/model/application/__tests__/JankenDailyRewardLog.test.js`
- `app/src/service/__tests__/JankenSeasonService.test.js`
- `app/src/service/__tests__/JankenRewardService.test.js`
- `app/src/service/__tests__/JankenService.elo.test.js` (ELO rebalance tests)
- `app/bin/__tests__/JankenSeasonEnd.test.js`
- `app/bin/__tests__/JankenDailyRewards.test.js`

### Modified

- `app/config/default.json` — replace `minigame.janken` block (§5 of spec)
- `app/src/model/application/JankenRating.js` — read tiers from config; add `getTopByElo(limit, trx)`, `resetSeasonFields(trx)`
- `app/src/service/JankenService.js` — pull `lossFactor` / `nonBetK` from config; touch `updateElo` to honor `nonBetK`
- `app/src/controller/application/JankenController.js` — extend `queryRank` payload; add 3 API handlers
- `app/src/templates/application/Janken.js` — extend `generateRankCard` with season + lifetime + today-reward block
- `app/src/router/api.js` — register 3 new routes
- `app/config/crontab.config.js` — register `JankenDailyRewards`
- `frontend/src/services/janken.js` — `getSeasons`, `getSeasonTop`, `getMyTodayReward`
- `frontend/src/pages/Janken/index.jsx` — add season chip in header

### Untouched (intentional)

- `app/src/middleware/*` — no rate-limit / postback changes.
- `app/src/model/application/JankenAutoFateLog.js` — auto-fate behavior unchanged.
- `app/src/model/application/JankenRecords.js` / `JankenResult.js` — record schema unchanged.
- LINE templates `generateDuelCard` / `generateArenaCard` / `generateResultCard` — unchanged (rank changes already render in result card via existing `getRankImageKey`).

---

## M1. Schema & Seed

**Goal:** All new tables exist, lifetime columns added, season `id=1` row inserted. `yarn migrate` is idempotent.

### Task 1.1: `janken_seasons` migration

**Files:**
- Create: `app/migrations/<ts>_create_janken_seasons.js`

- [ ] **Step 1: Generate migration file**

```bash
cd app && yarn knex migrate:make create_janken_seasons
```

- [ ] **Step 2: Write migration body**

```js
exports.up = function (knex) {
  return knex.schema.createTable("janken_seasons", table => {
    table.increments("id").unsigned().primary();
    table.dateTime("started_at").notNullable();
    table.dateTime("ended_at").nullable();
    table.enu("status", ["active", "closed"]).notNullable().defaultTo("active");
    table.text("notes").nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("janken_seasons");
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: migration applied, no error.

- [ ] **Step 4: Verify schema**

Run: `docker exec redive_linebot-mysql-1 mysql -uroot -p$DB_PASSWORD Princess -e "DESCRIBE janken_seasons;"`
Expected: 7 columns including `id`, `started_at`, `ended_at`, `status`, `notes`, `created_at`, `updated_at`.

- [ ] **Step 5: Commit**

```bash
git add app/migrations/*_create_janken_seasons.js
git commit -m "feat(janken): create janken_seasons table"
```

### Task 1.2: `janken_season_snapshot` migration

**Files:**
- Create: `app/migrations/<ts>_create_janken_season_snapshot.js`

- [ ] **Step 1: Generate migration file**

```bash
cd app && yarn knex migrate:make create_janken_season_snapshot
```

- [ ] **Step 2: Write migration body**

```js
exports.up = function (knex) {
  return knex.schema.createTable("janken_season_snapshot", table => {
    table.increments("id").unsigned().primary();
    table.integer("season_id").unsigned().notNullable();
    table.smallint("rank").unsigned().notNullable();
    table.string("user_id", 33).notNullable();
    table.string("display_name", 255).nullable();
    table.integer("elo").notNullable();
    table.string("rank_tier", 20).notNullable();
    table.integer("win_count").notNullable().defaultTo(0);
    table.integer("lose_count").notNullable().defaultTo(0);
    table.integer("draw_count").notNullable().defaultTo(0);
    table.integer("max_streak").notNullable().defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.index(["season_id", "rank"], "idx_season_rank");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("janken_season_snapshot");
};
```

- [ ] **Step 3: Run + verify**

Run: `cd app && yarn migrate`
Verify: `DESCRIBE janken_season_snapshot;` shows 13 columns + composite index.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_create_janken_season_snapshot.js
git commit -m "feat(janken): create janken_season_snapshot table"
```

### Task 1.3: `janken_daily_reward_log` migration

**Files:**
- Create: `app/migrations/<ts>_create_janken_daily_reward_log.js`

- [ ] **Step 1: Generate**

```bash
cd app && yarn knex migrate:make create_janken_daily_reward_log
```

- [ ] **Step 2: Write migration body**

```js
exports.up = function (knex) {
  return knex.schema.createTable("janken_daily_reward_log", table => {
    table.increments("id").unsigned().primary();
    table.string("user_id", 33).notNullable();
    table.date("reward_date").notNullable();
    table.integer("season_id").unsigned().notNullable();
    table.string("reward_type", 20).notNullable();
    table.integer("amount").notNullable().defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.unique(["user_id", "reward_date"], "uniq_user_date");
    table.index("reward_date", "idx_reward_date");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("janken_daily_reward_log");
};
```

- [ ] **Step 3: Run + verify unique key**

Run: `cd app && yarn migrate`
Verify: `SHOW INDEX FROM janken_daily_reward_log;` lists `uniq_user_date` UNIQUE.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_create_janken_daily_reward_log.js
git commit -m "feat(janken): create janken_daily_reward_log with unique (user_id, reward_date)"
```

### Task 1.4: Add lifetime counters to `janken_rating`

**Files:**
- Create: `app/migrations/<ts>_add_lifetime_counts_to_janken_rating.js`

- [ ] **Step 1: Generate**

```bash
cd app && yarn knex migrate:make add_lifetime_counts_to_janken_rating
```

- [ ] **Step 2: Write migration body**

```js
exports.up = function (knex) {
  return knex.schema.alterTable("janken_rating", table => {
    table.integer("lifetime_win_count").notNullable().defaultTo(0);
    table.integer("lifetime_lose_count").notNullable().defaultTo(0);
    table.integer("lifetime_draw_count").notNullable().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("janken_rating", table => {
    table.dropColumn("lifetime_win_count");
    table.dropColumn("lifetime_lose_count");
    table.dropColumn("lifetime_draw_count");
  });
};
```

> **Important:** do NOT backfill `lifetime_*` from existing `win_count`/`lose_count`/`draw_count`. The season-end CLI's `lifetime_* += win_count` step naturally captures pre-v2 totals. Backfilling here would double-count.

- [ ] **Step 3: Run + verify**

Run: `cd app && yarn migrate`
Verify: `DESCRIBE janken_rating;` shows three new columns all defaulting to 0.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_add_lifetime_counts_to_janken_rating.js
git commit -m "feat(janken): add lifetime_{win,lose,draw}_count to janken_rating"
```

### Task 1.5: Seed `janken_seasons` row id=1

**Files:**
- Create: `app/migrations/<ts>_seed_janken_season_one.js`

A seed file would also work, but a migration guarantees the row exists exactly once across all environments and never re-runs.

- [ ] **Step 1: Generate**

```bash
cd app && yarn knex migrate:make seed_janken_season_one
```

- [ ] **Step 2: Write migration body**

```js
exports.up = async function (knex) {
  const existing = await knex("janken_seasons").first();
  if (existing) return;

  const oldest = await knex("janken_records")
    .min({ ts: "created_at" })
    .first();
  const startedAt = (oldest && oldest.ts) || new Date();

  await knex("janken_seasons").insert({
    id: 1,
    started_at: startedAt,
    status: "active",
    notes: "v1 retroactive — first season",
  });
};

exports.down = async function (knex) {
  await knex("janken_seasons").where({ id: 1 }).delete();
};
```

- [ ] **Step 3: Run + verify**

Run: `cd app && yarn migrate`
Verify: `SELECT * FROM janken_seasons;` shows one row with `id=1`, `status=active`, `started_at` matching the oldest record.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_seed_janken_season_one.js
git commit -m "feat(janken): seed initial active season row"
```

**Exit Criteria for M1:**
- `yarn migrate` runs cleanly on a fresh DB.
- All 4 new tables / column additions present.
- `janken_seasons.id=1` exists with `status='active'`.

---

## M2. Configuration

**Goal:** `default.json` carries the new tier thresholds, K-table, bet/bounty caps, and reward amounts. Code reads from config rather than constants. Existing janken behavior unchanged when new flags are at defaults.

### Task 2.1: Replace `minigame.janken` block in `default.json`

**Files:**
- Modify: `app/config/default.json` (the `minigame.janken` object)

- [ ] **Step 1: Replace the block verbatim with §5 of the spec**

Open `app/config/default.json` and replace the entire `minigame.janken` value with:

```json
{
  "paper": "🖐️",
  "rock": "✊",
  "scissors": "✌️",
  "season": {
    "snapshotTopN": 50,
    "enableSeasonEndRewards": false,
    "endRewards": {
      "top1": 50000,
      "top2": 30000,
      "top3": 20000,
      "top4_10": 5000,
      "top11_50": 1000
    }
  },
  "daily_reward": {
    "enableDailyRankReward": false,
    "amounts": {
      "top1": 500,
      "top2": 300,
      "top3": 200,
      "top4_10": 50,
      "legend": 100,
      "master": 50,
      "fighter": 25,
      "challenger": 10,
      "beginner": 0
    }
  },
  "bet": {
    "minAmount": 10,
    "maxAmountByRank": {
      "beginner": 50000,
      "challenger": 100000,
      "fighter": 200000,
      "master": 500000,
      "legend": 1000000
    },
    "feeRate": 0.1
  },
  "streak": {
    "maxBountyByRank": {
      "beginner": 20000,
      "challenger": 50000,
      "fighter": 100000,
      "master": 200000,
      "legend": 300000
    },
    "bountyMinBet": 1000,
    "bountyClaimMultiplier": 5
  },
  "elo": {
    "initial": 1000,
    "tiers": [
      { "key": "beginner",   "name": "見習者", "minElo": 0    },
      { "key": "challenger", "name": "挑戰者", "minElo": 1100 },
      { "key": "fighter",    "name": "強者",   "minElo": 1250 },
      { "key": "master",     "name": "達人",   "minElo": 1400 },
      { "key": "legend",     "name": "傳說",   "minElo": 1550 }
    ],
    "kFactorTiers": [
      { "minBet": 50000, "k": 80 },
      { "minBet":  5000, "k": 60 },
      { "minBet":  1000, "k": 32 },
      { "minBet":   100, "k": 20 },
      { "minBet":     0, "k": 12 }
    ],
    "lossFactor": 0.5,
    "nonBetK": 0,
    "streakBonus": [
      { "minStreak": 7, "multiplier": 2.0 },
      { "minStreak": 5, "multiplier": 1.5 },
      { "minStreak": 3, "multiplier": 1.25 }
    ]
  },
  "images": {
    "rock": "/assets/janken/rock.png",
    "scissors": "/assets/janken/scissors.png",
    "paper": "/assets/janken/paper.png",
    "win": "/assets/janken/win.png",
    "lose": "/assets/janken/lose.png",
    "draw": "/assets/janken/draw.png",
    "vs": "/assets/janken/vs.png"
  }
}
```

- [ ] **Step 2: Validate JSON parses**

Run: `cd app && node -e "JSON.parse(require('fs').readFileSync('config/default.json'))"` (no output = valid).

- [ ] **Step 3: Validate config loader sees new keys**

Run: `cd app && node -e "console.log(require('config').get('minigame.janken.elo.tiers').length)"`
Expected: `5`.

- [ ] **Step 4: Commit**

```bash
git add app/config/default.json
git commit -m "config(janken): introduce season + daily_reward + rebalanced ELO/bet caps"
```

### Task 2.2: `JankenRating` reads tiers from config

**Files:**
- Modify: `app/src/model/application/JankenRating.js`
- Test: `app/src/model/application/__tests__/JankenRating.test.js` (new)

- [ ] **Step 1: Write failing test**

Create `app/src/model/application/__tests__/JankenRating.test.js`:

```js
jest.mock("config", () => ({
  get: jest.fn(key => {
    if (key === "minigame.janken.elo.tiers") {
      return [
        { key: "beginner",   name: "見習者", minElo: 0    },
        { key: "challenger", name: "挑戰者", minElo: 1100 },
        { key: "fighter",    name: "強者",   minElo: 1250 },
        { key: "master",     name: "達人",   minElo: 1400 },
        { key: "legend",     name: "傳說",   minElo: 1550 },
      ];
    }
    if (key === "minigame.janken.elo.initial") return 1000;
    return undefined;
  }),
}));

const JankenRating = require("../JankenRating");

describe("JankenRating tiers from config", () => {
  test("returns fighter at 1250", () => {
    expect(JankenRating.getRankTier(1250)).toBe("fighter");
  });
  test("returns master at 1400", () => {
    expect(JankenRating.getRankTier(1400)).toBe("master");
  });
  test("returns challenger at 1100", () => {
    expect(JankenRating.getRankTier(1100)).toBe("challenger");
  });
  test("returns beginner at 1099", () => {
    expect(JankenRating.getRankTier(1099)).toBe("beginner");
  });
  test("getNextTierElo from challenger returns fighter floor", () => {
    expect(JankenRating.getNextTierElo(1150)).toBe(1250);
  });
});
```

> Place `jest.mock("config", ...)` BEFORE `require("../JankenRating")` — `transform: {}` in jest config means mocks are NOT hoisted (per `feedback_jest_mock_hoisting`).

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd app && yarn test JankenRating.test.js`
Expected: FAIL — current code uses hard-coded `RANK_TIERS = [...minElo:1200,1400,1600,1800]`.

- [ ] **Step 3: Refactor `JankenRating.js`**

Replace the constants block at the top of `JankenRating.js`:

```js
const config = require("config");

const FALLBACK_TIERS = [
  { key: "beginner",   name: "見習者", minElo: 0    },
  { key: "challenger", name: "挑戰者", minElo: 1100 },
  { key: "fighter",    name: "強者",   minElo: 1250 },
  { key: "master",     name: "達人",   minElo: 1400 },
  { key: "legend",     name: "傳說",   minElo: 1550 },
];

function getTiers() {
  try {
    const tiers = config.get("minigame.janken.elo.tiers");
    if (Array.isArray(tiers) && tiers.length > 0) return tiers;
  } catch (_) { /* config miss → fallback */ }
  return FALLBACK_TIERS;
}

exports.RANK_TIERS = FALLBACK_TIERS; // back-compat for any external import
```

Then change every read of the module-level `RANK_TIERS` constant to call `getTiers()` instead. Specifically:

```js
exports.getRankTier = function (elo) {
  const tiers = getTiers();
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (elo >= tiers[i].minElo) return tiers[i].key;
  }
  return "beginner";
};

exports.getRankInfo = function (elo) {
  const tiers = getTiers();
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (elo >= tiers[i].minElo) return tiers[i];
  }
  return tiers[0];
};

exports.getNextTierElo = function (elo) {
  const tiers = getTiers();
  const currentKey = exports.getRankTier(elo);
  const idx = tiers.findIndex(t => t.key === currentKey);
  if (idx >= tiers.length - 1) return null;
  return tiers[idx + 1].minElo;
};
```

- [ ] **Step 4: Run test, expect PASS**

Run: `cd app && yarn test JankenRating.test.js`
Expected: PASS, 5/5.

- [ ] **Step 5: Run full app tests, none regress**

Run: `cd app && yarn test`
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add app/src/model/application/JankenRating.js app/src/model/application/__tests__/JankenRating.test.js
git commit -m "refactor(janken): JankenRating tiers read from config with fallback"
```

### Task 2.3: `JankenService` reads `lossFactor` and `nonBetK` from config

**Files:**
- Modify: `app/src/service/JankenService.js`
- Test: `app/src/service/__tests__/JankenService.elo.test.js` (new)

- [ ] **Step 1: Write failing test**

Create `app/src/service/__tests__/JankenService.elo.test.js`:

```js
jest.mock("config", () => {
  const data = {
    "minigame.janken.elo.kFactorTiers": [
      { minBet: 50000, k: 80 },
      { minBet:  5000, k: 60 },
      { minBet:  1000, k: 32 },
      { minBet:   100, k: 20 },
      { minBet:     0, k: 12 },
    ],
    "minigame.janken.elo.lossFactor": 0.5,
    "minigame.janken.elo.nonBetK": 0,
    "minigame.janken.elo.streakBonus": [
      { minStreak: 7, multiplier: 2.0 },
      { minStreak: 5, multiplier: 1.5 },
      { minStreak: 3, multiplier: 1.25 },
    ],
    "minigame.janken.elo.initial": 1000,
    "minigame.janken.elo.tiers": [
      { key: "beginner", name: "見習者", minElo: 0 },
    ],
    "minigame.janken.bet.feeRate": 0.1,
    "minigame.janken.bet.minAmount": 10,
    "minigame.janken.streak.bountyMinBet": 1000,
    "minigame.janken.streak.bountyClaimMultiplier": 5,
    "redis.keys.jankenDecide": "jankenDecide",
    "redis.keys.jankenChallenge": "jankenChallenge",
  };
  return { get: jest.fn(key => data[key]) };
});

const JankenService = require("../JankenService");

describe("JankenService.calculateEloChange (rebalanced K table)", () => {
  test("avg bet of 289 lands in K=20 tier (was K=8)", () => {
    const change = JankenService.calculateEloChange(1000, 1000, "win", 289);
    // K=20, expected=0.5, raw = 20 * 0.5 = 10; multiplier 1 (streak 0) → floor(10) = 10
    expect(change).toBe(10);
  });

  test("loss at K=20 even matchup applies lossFactor 0.5", () => {
    const change = JankenService.calculateEloChange(1000, 1000, "lose", 289);
    // raw = 20 * (0 - 0.5) = -10; lossFactor 0.5 → ceil(-10 * 0.5) = -5
    expect(change).toBe(-5);
  });

  test("non-bet match returns 0 when nonBetK=0", () => {
    expect(JankenService.calculateEloChange(1000, 1000, "win", 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd app && yarn test JankenService.elo.test.js`
Expected: FAIL — current `calculateEloChange` accepts `betAmount` but `updateElo` early-returns for `betAmount<=0`. The first two tests should already pass on rebalanced config; the third test passes only after we route nonBetK through.

(In practice tests 1+2 pass once Task 2.1 ships — they're regression guards. Only test 3 needs new code.)

- [ ] **Step 3: Update `calculateEloChange` to support `nonBetK`**

In `app/src/service/JankenService.js`, replace `calculateEloChange`:

```js
exports.calculateEloChange = function (myElo, opponentElo, result, betAmount, { streak = 0 } = {}) {
  if (result === "draw") return 0;
  let K;
  if (!betAmount || betAmount <= 0) {
    const nonBetK = config.get("minigame.janken.elo.nonBetK");
    if (!nonBetK || nonBetK <= 0) return 0;
    K = nonBetK;
  } else {
    K = JankenRating.getKFactor(betAmount);
  }
  const expected = exports.calculateExpectedWinRate(myElo, opponentElo);
  const actual = result === "win" ? 1 : 0;
  const raw = K * (actual - expected);
  if (raw >= 0) {
    const multiplier = result === "win" ? exports.getStreakMultiplier(streak) : 1;
    return Math.floor(raw * multiplier);
  }
  const lossFactor = config.get("minigame.janken.elo.lossFactor");
  return Math.ceil(raw * lossFactor);
};
```

Also update `updateElo` to NOT early-return on `betAmount<=0` when `nonBetK > 0`:

```js
exports.updateElo = async function (p1UserId, p2UserId, p1Result, betAmount) {
  if (p1Result === "draw") {
    // ... unchanged draw branch
  }

  const nonBetK = config.get("minigame.janken.elo.nonBetK");
  if ((!betAmount || betAmount <= 0) && (!nonBetK || nonBetK <= 0)) {
    return { p1EloChange: 0, p2EloChange: 0, p1NewElo: null, p2NewElo: null };
  }
  // ... rest unchanged (keep the draw branch's existing draw_count increment for bet only)
};
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `cd app && yarn test JankenService.elo.test.js`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add app/src/service/JankenService.js app/src/service/__tests__/JankenService.elo.test.js
git commit -m "feat(janken): nonBetK config knob (default 0) + ELO rebalance regression test"
```

**Exit Criteria for M2:**
- `default.json` has new structure, JSON parses, `config.get('minigame.janken.elo.tiers')` returns 5 elements.
- `JankenRating.getRankTier(1250) === 'fighter'`.
- `JankenService.calculateEloChange(1000, 1000, 'win', 289) === 10`.
- `yarn test:app` green.

---

## M3. Models

**Goal:** Three new models present, with passing CRUD tests; `JankenRating` gains transactional helpers.

### Task 3.1: `JankenSeason` model

**Files:**
- Create: `app/src/model/application/JankenSeason.js`
- Test: `app/src/model/application/__tests__/JankenSeason.test.js`

- [ ] **Step 1: Write failing test**

```js
const mysql = require("../../../util/mysql");
const JankenSeason = require("../JankenSeason");

describe("JankenSeason", () => {
  beforeEach(async () => {
    await mysql("janken_seasons").delete();
  });
  afterAll(() => mysql.destroy());

  test("getActive returns the row with status='active'", async () => {
    await mysql("janken_seasons").insert([
      { id: 1, started_at: new Date(), status: "closed", ended_at: new Date() },
      { id: 2, started_at: new Date(), status: "active" },
    ]);
    const active = await JankenSeason.getActive();
    expect(active.id).toBe(2);
  });

  test("close sets status=closed and ended_at", async () => {
    await mysql("janken_seasons").insert({ id: 3, started_at: new Date(), status: "active" });
    await JankenSeason.close(3);
    const row = await mysql("janken_seasons").where({ id: 3 }).first();
    expect(row.status).toBe("closed");
    expect(row.ended_at).not.toBeNull();
  });

  test("openNew creates a new active season", async () => {
    const id = await JankenSeason.openNew("test note");
    const row = await mysql("janken_seasons").where({ id }).first();
    expect(row.status).toBe("active");
    expect(row.notes).toBe("test note");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module ../JankenSeason`).

Run: `cd app && yarn test JankenSeason.test.js`

- [ ] **Step 3: Implement model**

```js
const mysql = require("../../util/mysql");
const TABLE = "janken_seasons";

exports.getActive = async function (trx) {
  const db = trx || mysql;
  return db(TABLE).where({ status: "active" }).first();
};

exports.close = async function (id, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ id }).update({ status: "closed", ended_at: new Date() });
};

exports.openNew = async function (notes, trx) {
  const db = trx || mysql;
  const [id] = await db(TABLE).insert({
    started_at: new Date(),
    status: "active",
    notes: notes || null,
  });
  return id;
};

exports.findById = async function (id, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ id }).first();
};

exports.list = async function (limit = 50, trx) {
  const db = trx || mysql;
  return db(TABLE).orderBy("id", "desc").limit(limit);
};
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd app && yarn test JankenSeason.test.js`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/model/application/JankenSeason.js app/src/model/application/__tests__/JankenSeason.test.js
git commit -m "feat(janken): JankenSeason model"
```

### Task 3.2: `JankenSeasonSnapshot` model

**Files:**
- Create: `app/src/model/application/JankenSeasonSnapshot.js`
- Test: `app/src/model/application/__tests__/JankenSeasonSnapshot.test.js`

- [ ] **Step 1: Write failing test**

```js
const mysql = require("../../../util/mysql");
const JankenSeasonSnapshot = require("../JankenSeasonSnapshot");

describe("JankenSeasonSnapshot", () => {
  beforeEach(async () => {
    await mysql("janken_season_snapshot").delete();
  });
  afterAll(() => mysql.destroy());

  test("bulkInsert + getBySeason round-trips", async () => {
    await JankenSeasonSnapshot.bulkInsert(7, [
      { rank: 1, user_id: "U1", display_name: "A", elo: 1500, rank_tier: "master",
        win_count: 30, lose_count: 10, draw_count: 5, max_streak: 6 },
      { rank: 2, user_id: "U2", display_name: "B", elo: 1300, rank_tier: "fighter",
        win_count: 20, lose_count: 15, draw_count: 3, max_streak: 4 },
    ]);
    const rows = await JankenSeasonSnapshot.getBySeason(7);
    expect(rows).toHaveLength(2);
    expect(rows[0].rank).toBe(1);
    expect(rows[0].elo).toBe(1500);
  });

  test("bulkInsert with empty array is a no-op", async () => {
    await expect(JankenSeasonSnapshot.bulkInsert(8, [])).resolves.toBeUndefined();
    const rows = await JankenSeasonSnapshot.getBySeason(8);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement**

```js
const mysql = require("../../util/mysql");
const TABLE = "janken_season_snapshot";

exports.bulkInsert = async function (seasonId, rows, trx) {
  if (!rows || rows.length === 0) return undefined;
  const db = trx || mysql;
  const data = rows.map(r => ({
    season_id: seasonId,
    rank: r.rank,
    user_id: r.user_id,
    display_name: r.display_name || null,
    elo: r.elo,
    rank_tier: r.rank_tier,
    win_count: r.win_count || 0,
    lose_count: r.lose_count || 0,
    draw_count: r.draw_count || 0,
    max_streak: r.max_streak || 0,
  }));
  await db(TABLE).insert(data);
  return undefined;
};

exports.getBySeason = async function (seasonId, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ season_id: seasonId }).orderBy("rank", "asc");
};
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd app && yarn test JankenSeasonSnapshot.test.js`

- [ ] **Step 5: Commit**

```bash
git add app/src/model/application/JankenSeasonSnapshot.js app/src/model/application/__tests__/JankenSeasonSnapshot.test.js
git commit -m "feat(janken): JankenSeasonSnapshot model with bulk insert"
```

### Task 3.3: `JankenDailyRewardLog` model

**Files:**
- Create: `app/src/model/application/JankenDailyRewardLog.js`
- Test: `app/src/model/application/__tests__/JankenDailyRewardLog.test.js`

- [ ] **Step 1: Write failing test**

```js
const mysql = require("../../../util/mysql");
const JankenDailyRewardLog = require("../JankenDailyRewardLog");

describe("JankenDailyRewardLog", () => {
  beforeEach(async () => {
    await mysql("janken_daily_reward_log").delete();
  });
  afterAll(() => mysql.destroy());

  test("tryInsert returns true on first insert, false on duplicate same-day", async () => {
    const args = { user_id: "U1", reward_date: "2026-05-01", season_id: 1, reward_type: "top1", amount: 500 };
    expect(await JankenDailyRewardLog.tryInsert(args)).toBe(true);
    expect(await JankenDailyRewardLog.tryInsert(args)).toBe(false);
    const count = await mysql("janken_daily_reward_log").count({ c: "*" }).first();
    expect(count.c).toBe(1);
  });

  test("getByUserAndDate returns the row when present", async () => {
    await JankenDailyRewardLog.tryInsert({
      user_id: "U2", reward_date: "2026-05-02", season_id: 1, reward_type: "challenger", amount: 10,
    });
    const row = await JankenDailyRewardLog.getByUserAndDate("U2", "2026-05-02");
    expect(row.amount).toBe(10);
    expect(row.reward_type).toBe("challenger");
  });

  test("getByUserAndDate returns undefined when missing", async () => {
    const row = await JankenDailyRewardLog.getByUserAndDate("U999", "2026-05-02");
    expect(row).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement**

```js
const mysql = require("../../util/mysql");
const TABLE = "janken_daily_reward_log";

exports.tryInsert = async function ({ user_id, reward_date, season_id, reward_type, amount }, trx) {
  const db = trx || mysql;
  try {
    await db(TABLE).insert({ user_id, reward_date, season_id, reward_type, amount });
    return true;
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") return false;
    throw err;
  }
};

exports.getByUserAndDate = async function (user_id, reward_date, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ user_id, reward_date }).first();
};
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd app && yarn test JankenDailyRewardLog.test.js`

- [ ] **Step 5: Commit**

```bash
git add app/src/model/application/JankenDailyRewardLog.js app/src/model/application/__tests__/JankenDailyRewardLog.test.js
git commit -m "feat(janken): JankenDailyRewardLog model with dup-key idempotency"
```

### Task 3.4: `JankenRating.getTopByElo` and `resetSeasonFields`

**Files:**
- Modify: `app/src/model/application/JankenRating.js`
- Modify: `app/src/model/application/__tests__/JankenRating.test.js`

- [ ] **Step 1: Add tests for the two new methods**

Append to `JankenRating.test.js`:

```js
describe("JankenRating.getTopByElo", () => {
  beforeEach(async () => {
    await mysql("janken_rating").delete();
    await mysql("janken_rating").insert([
      { user_id: "U_A", elo: 1500, rank_tier: "master", win_count: 10 },
      { user_id: "U_B", elo: 1100, rank_tier: "challenger", win_count: 5 },
      { user_id: "U_C", elo: 1700, rank_tier: "legend", win_count: 20 },
    ]);
  });
  afterAll(() => mysql.destroy());

  test("returns rows ordered by elo desc", async () => {
    const rows = await JankenRating.getTopByElo(2);
    expect(rows[0].user_id).toBe("U_C");
    expect(rows[1].user_id).toBe("U_A");
  });
});

describe("JankenRating.resetSeasonFields", () => {
  beforeEach(async () => {
    await mysql("janken_rating").delete();
    await mysql("janken_rating").insert([
      { user_id: "U_X", elo: 1500, rank_tier: "master", win_count: 30, lose_count: 10,
        draw_count: 5, streak: 4, max_streak: 9, bounty: 100,
        lifetime_win_count: 0, lifetime_lose_count: 0, lifetime_draw_count: 0 },
    ]);
  });

  test("rotates per-season fields into lifetime, zeros bounty/streak, leaves max_streak", async () => {
    await JankenRating.resetSeasonFields();
    const row = await mysql("janken_rating").where({ user_id: "U_X" }).first();
    expect(row.elo).toBe(1000);
    expect(row.rank_tier).toBe("beginner");
    expect(row.win_count).toBe(0);
    expect(row.lose_count).toBe(0);
    expect(row.draw_count).toBe(0);
    expect(row.streak).toBe(0);
    expect(row.bounty).toBe(0);
    expect(row.max_streak).toBe(9);
    expect(row.lifetime_win_count).toBe(30);
    expect(row.lifetime_lose_count).toBe(10);
    expect(row.lifetime_draw_count).toBe(5);
  });
});
```

(Add `const mysql = require("../../../util/mysql");` near the top if not present.)

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement both methods**

In `JankenRating.js`:

```js
exports.getTopByElo = async function (limit = 50, trx) {
  const db = trx || mysql;
  return db(TABLE).orderBy("elo", "desc").orderBy("win_count", "desc").limit(limit);
};

exports.resetSeasonFields = async function (trx) {
  const db = trx || mysql;
  return db(TABLE).update({
    lifetime_win_count: db.raw("lifetime_win_count + win_count"),
    lifetime_lose_count: db.raw("lifetime_lose_count + lose_count"),
    lifetime_draw_count: db.raw("lifetime_draw_count + draw_count"),
    elo: 1000,
    rank_tier: "beginner",
    win_count: 0,
    lose_count: 0,
    draw_count: 0,
    streak: 0,
    bounty: 0,
  });
};
```

- [ ] **Step 4: Run, expect PASS**.

Run: `cd app && yarn test JankenRating.test.js`

- [ ] **Step 5: Update `fillable`**

In `JankenRating.js`, extend the `fillable` array:

```js
const fillable = [
  "user_id", "elo", "rank_tier",
  "win_count", "lose_count", "draw_count",
  "streak", "max_streak", "bounty",
  "lifetime_win_count", "lifetime_lose_count", "lifetime_draw_count",
];
```

- [ ] **Step 6: Commit**

```bash
git add app/src/model/application/JankenRating.js app/src/model/application/__tests__/JankenRating.test.js
git commit -m "feat(janken): JankenRating.getTopByElo and resetSeasonFields"
```

**Exit Criteria for M3:**
- All four model tests green.
- Reset method correctly rotates lifetime totals and zeros per-season fields.

---

## M4. Services

**Goal:** `JankenSeasonService.endCurrentAndOpenNext` performs a full atomic season transition. `JankenRewardService` exposes `payoutDaily` (cron) and `payoutSeasonEnd` (gated stub) with the kill-switch behavior.

### Task 4.1: `JankenSeasonService.endCurrentAndOpenNext`

**Files:**
- Create: `app/src/service/JankenSeasonService.js`
- Test: `app/src/service/__tests__/JankenSeasonService.test.js`

- [ ] **Step 1: Write failing test**

```js
const mysql = require("../../util/mysql");
const JankenSeasonService = require("../JankenSeasonService");

describe("JankenSeasonService.endCurrentAndOpenNext", () => {
  beforeEach(async () => {
    await mysql("janken_season_snapshot").delete();
    await mysql("janken_seasons").delete();
    await mysql("janken_rating").delete();
    await mysql("janken_seasons").insert({
      id: 1, started_at: new Date(), status: "active", notes: "season 1",
    });
    await mysql("janken_rating").insert([
      { user_id: "U1", elo: 1700, rank_tier: "legend",   win_count: 50, lose_count: 10, draw_count: 5, streak: 3, max_streak: 8, bounty: 0 },
      { user_id: "U2", elo: 1500, rank_tier: "master",   win_count: 30, lose_count: 12, draw_count: 4, streak: 0, max_streak: 6, bounty: 0 },
      { user_id: "U3", elo: 1100, rank_tier: "challenger", win_count: 12, lose_count: 8, draw_count: 2, streak: 1, max_streak: 3, bounty: 0 },
    ]);
  });
  afterAll(() => mysql.destroy());

  test("snapshots top, resets, opens next season", async () => {
    const result = await JankenSeasonService.endCurrentAndOpenNext({ note: "test reset", payoutEnabled: false });
    expect(result.closedSeasonId).toBe(1);
    expect(result.newSeasonId).toBeGreaterThan(1);
    expect(result.snapshotCount).toBe(3);

    const snapshots = await mysql("janken_season_snapshot").where({ season_id: 1 }).orderBy("rank");
    expect(snapshots[0].user_id).toBe("U1");
    expect(snapshots[0].rank).toBe(1);

    const closed = await mysql("janken_seasons").where({ id: 1 }).first();
    expect(closed.status).toBe("closed");
    expect(closed.ended_at).not.toBeNull();

    const newActive = await mysql("janken_seasons").where({ status: "active" }).first();
    expect(newActive.id).toBe(result.newSeasonId);
    expect(newActive.notes).toBe("test reset");

    const u1 = await mysql("janken_rating").where({ user_id: "U1" }).first();
    expect(u1.elo).toBe(1000);
    expect(u1.rank_tier).toBe("beginner");
    expect(u1.win_count).toBe(0);
    expect(u1.lifetime_win_count).toBe(50);
    expect(u1.max_streak).toBe(8);
  });

  test("aborts when no active season", async () => {
    await mysql("janken_seasons").update({ status: "closed", ended_at: new Date() });
    await expect(JankenSeasonService.endCurrentAndOpenNext({ note: "x", payoutEnabled: false }))
      .rejects.toThrow(/no active season/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement**

```js
const mysql = require("../util/mysql");
const config = require("config");
const JankenSeason = require("../model/application/JankenSeason");
const JankenSeasonSnapshot = require("../model/application/JankenSeasonSnapshot");
const JankenRating = require("../model/application/JankenRating");
const JankenRewardService = require("./JankenRewardService");
const { DefaultLogger } = require("../util/Logger");

exports.endCurrentAndOpenNext = async function ({ note = null, payoutEnabled = false } = {}) {
  const snapshotTopN = config.get("minigame.janken.season.snapshotTopN") || 50;
  const enableSeasonEndRewards =
    payoutEnabled && Boolean(config.get("minigame.janken.season.enableSeasonEndRewards"));

  return mysql.transaction(async trx => {
    const active = await JankenSeason.getActive(trx);
    if (!active) throw new Error("Janken: no active season to close");

    const top = await JankenRating.getTopByElo(snapshotTopN, trx);
    const userIds = top.map(r => r.user_id);
    const profiles = userIds.length
      ? await trx("user").whereIn("platform_id", userIds).select("platform_id", "display_name")
      : [];
    const nameByUid = Object.fromEntries(profiles.map(p => [p.platform_id, p.display_name]));

    const snapshotRows = top.map((r, i) => ({
      rank: i + 1,
      user_id: r.user_id,
      display_name: nameByUid[r.user_id] || null,
      elo: r.elo,
      rank_tier: r.rank_tier,
      win_count: r.win_count,
      lose_count: r.lose_count,
      draw_count: r.draw_count,
      max_streak: r.max_streak,
    }));
    await JankenSeasonSnapshot.bulkInsert(active.id, snapshotRows, trx);

    if (enableSeasonEndRewards) {
      await JankenRewardService.payoutSeasonEnd(snapshotRows, active.id, trx);
    } else {
      DefaultLogger.info(
        `[JankenSeasonService] season-end rewards skipped (payoutEnabled=${payoutEnabled}, flag=${config.get(
          "minigame.janken.season.enableSeasonEndRewards"
        )})`
      );
    }

    await JankenSeason.close(active.id, trx);
    await JankenRating.resetSeasonFields(trx);
    const newSeasonId = await JankenSeason.openNew(note, trx);

    DefaultLogger.info(
      `[JankenSeasonService] season ${active.id} closed, ${snapshotRows.length} snapshotted, season ${newSeasonId} opened`
    );

    return {
      closedSeasonId: active.id,
      newSeasonId,
      snapshotCount: snapshotRows.length,
      payoutEnabled: enableSeasonEndRewards,
    };
  });
};
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd app && yarn test JankenSeasonService.test.js`

- [ ] **Step 5: Commit**

```bash
git add app/src/service/JankenSeasonService.js app/src/service/__tests__/JankenSeasonService.test.js
git commit -m "feat(janken): JankenSeasonService.endCurrentAndOpenNext"
```

### Task 4.2: `JankenRewardService.payoutDaily`

**Files:**
- Create: `app/src/service/JankenRewardService.js`
- Test: `app/src/service/__tests__/JankenRewardService.test.js`

- [ ] **Step 1: Write failing test**

```js
const mysql = require("../../util/mysql");
const JankenRewardService = require("../JankenRewardService");

describe("JankenRewardService.payoutDaily", () => {
  beforeEach(async () => {
    await Promise.all([
      mysql("janken_daily_reward_log").delete(),
      mysql("janken_records").delete(),
      mysql("janken_rating").delete(),
      mysql("Inventory").where({ note: "janken_daily_rank_reward" }).delete(),
      mysql("janken_seasons").delete(),
    ]);
    await mysql("janken_seasons").insert({ id: 1, started_at: new Date(), status: "active" });
  });
  afterAll(() => mysql.destroy());

  test("dry-run when flag is false: no inventory, no log rows", async () => {
    // flag is false in default.json — confirm shadow mode
    await mysql("janken_rating").insert({ user_id: "U_T", elo: 1100, rank_tier: "challenger" });
    await mysql("janken_records").insert({
      id: "rec-1", user_id: "U_T", target_user_id: "U_O", group_id: "G", bet_amount: 100,
      created_at: yesterdayLocal(),
    });
    const result = await JankenRewardService.payoutDaily(yesterdayDateString());
    expect(result.dryRun).toBe(true);
    expect(result.candidates).toHaveLength(1);
    const stones = await mysql("Inventory").where({ note: "janken_daily_rank_reward" });
    expect(stones).toHaveLength(0);
    const logs = await mysql("janken_daily_reward_log");
    expect(logs).toHaveLength(0);
  });
});

function yesterdayLocal() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d;
}
function yesterdayDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement**

```js
const mysql = require("../util/mysql");
const config = require("config");
const JankenSeason = require("../model/application/JankenSeason");
const JankenRating = require("../model/application/JankenRating");
const JankenDailyRewardLog = require("../model/application/JankenDailyRewardLog");
const { inventory } = require("../model/application/Inventory");
const { DefaultLogger } = require("../util/Logger");

function bucketByPosition(p, rankTier) {
  if (p === 1) return "top1";
  if (p === 2) return "top2";
  if (p === 3) return "top3";
  if (p <= 10) return "top4_10";
  if (rankTier === "legend") return "legend";
  if (rankTier === "master") return "master";
  if (rankTier === "fighter") return "fighter";
  if (rankTier === "challenger") return "challenger";
  return "beginner";
}
exports.bucketByPosition = bucketByPosition;

exports.payoutDaily = async function (rewardDate) {
  const enabled = Boolean(config.get("minigame.janken.daily_reward.enableDailyRankReward"));
  const amounts = config.get("minigame.janken.daily_reward.amounts") || {};
  const season = await JankenSeason.getActive();
  if (!season) {
    DefaultLogger.warn("[JankenRewardService] no active season; skipping daily payout");
    return { dryRun: !enabled, candidates: [], season: null };
  }

  const start = new Date(`${rewardDate}T00:00:00+08:00`);
  const end = new Date(`${rewardDate}T23:59:59.999+08:00`);
  const initiators = mysql("janken_records")
    .distinct({ u: "user_id" })
    .where("bet_amount", ">", 0)
    .whereBetween("created_at", [start, end]);
  const targets = mysql("janken_records")
    .distinct({ u: "target_user_id" })
    .where("bet_amount", ">", 0)
    .whereBetween("created_at", [start, end]);
  const activeRows = await initiators.union([targets]);
  const activeIds = activeRows.map(r => r.u);
  if (activeIds.length === 0) {
    DefaultLogger.info(`[JankenRewardService] no active players for ${rewardDate}`);
    return { dryRun: !enabled, candidates: [], season: season.id };
  }

  const ranked = await mysql("janken_rating")
    .whereIn("user_id", activeIds)
    .orderBy("elo", "desc")
    .orderBy("win_count", "desc");

  const candidates = ranked.map((r, i) => ({
    user_id: r.user_id,
    position: i + 1,
    rank_tier: r.rank_tier,
    reward_type: bucketByPosition(i + 1, r.rank_tier),
  })).map(c => ({ ...c, amount: amounts[c.reward_type] || 0 }));

  if (!enabled) {
    DefaultLogger.info(
      `[JankenRewardService] DRY RUN ${rewardDate} season=${season.id} candidates=${candidates.length}`
    );
    return { dryRun: true, candidates, season: season.id };
  }

  let credited = 0;
  for (const c of candidates) {
    const inserted = await JankenDailyRewardLog.tryInsert({
      user_id: c.user_id,
      reward_date: rewardDate,
      season_id: season.id,
      reward_type: c.reward_type,
      amount: c.amount,
    });
    if (inserted && c.amount > 0) {
      await inventory.increaseGodStone({
        userId: c.user_id, amount: c.amount, note: "janken_daily_rank_reward",
      });
      credited += c.amount;
    }
  }

  DefaultLogger.info(
    `[JankenRewardService] paid ${rewardDate} season=${season.id} credited=${credited} stones to ${candidates.length} players`
  );
  return { dryRun: false, candidates, season: season.id, credited };
};

exports.payoutSeasonEnd = async function (snapshotRows, seasonId, trx) {
  const enabled = Boolean(config.get("minigame.janken.season.enableSeasonEndRewards"));
  if (!enabled) {
    DefaultLogger.info(`[JankenRewardService] season-end payout skipped (flag off)`);
    return { dryRun: true, paid: 0 };
  }
  const rewards = config.get("minigame.janken.season.endRewards") || {};
  let paid = 0;
  for (const row of snapshotRows) {
    let bucket = null;
    if (row.rank === 1) bucket = "top1";
    else if (row.rank === 2) bucket = "top2";
    else if (row.rank === 3) bucket = "top3";
    else if (row.rank <= 10) bucket = "top4_10";
    else if (row.rank <= 50) bucket = "top11_50";
    if (!bucket) continue;
    const amount = rewards[bucket] || 0;
    if (amount <= 0) continue;
    if (trx) inventory.setTransaction(trx);
    await inventory.increaseGodStone({
      userId: row.user_id, amount, note: "janken_season_end_reward",
    });
    paid += amount;
  }
  return { dryRun: false, paid };
};
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd app && yarn test JankenRewardService.test.js`

- [ ] **Step 5: Add a "flag-on" payout test**

Append to `JankenRewardService.test.js` a test that mocks `config.get("minigame.janken.daily_reward.enableDailyRankReward")` → `true` and asserts the inventory + log row appear:

```js
test("flag-on: inserts log row + credits inventory", async () => {
  jest.resetModules();
  jest.doMock("config", () => {
    const orig = jest.requireActual("config");
    return {
      get: jest.fn(key => {
        if (key === "minigame.janken.daily_reward.enableDailyRankReward") return true;
        return orig.get(key);
      }),
    };
  });
  const Service = require("../JankenRewardService");
  const date = yesterdayDateString();
  await mysql("janken_rating").insert({ user_id: "U_FlagOn", elo: 1700, rank_tier: "legend" });
  await mysql("janken_records").insert({
    id: "rec-flag", user_id: "U_FlagOn", target_user_id: "U_O", group_id: "G",
    bet_amount: 500, created_at: yesterdayLocal(),
  });
  const result = await Service.payoutDaily(date);
  expect(result.dryRun).toBe(false);
  const log = await mysql("janken_daily_reward_log").where({ user_id: "U_FlagOn" }).first();
  expect(log.amount).toBe(500); // top1
  const stones = await mysql("Inventory").where({ note: "janken_daily_rank_reward", userId: "U_FlagOn" }).first();
  expect(Number(stones.itemAmount)).toBe(500);
});
```

> Per `feedback_jest_mock_hoisting`: place `jest.doMock` BEFORE the `require()`; `jest.resetModules()` invalidates the existing cached `JankenRewardService`.

- [ ] **Step 6: Run, expect PASS**.

- [ ] **Step 7: Commit**

```bash
git add app/src/service/JankenRewardService.js app/src/service/__tests__/JankenRewardService.test.js
git commit -m "feat(janken): JankenRewardService.payoutDaily + payoutSeasonEnd (kill-switched)"
```

**Exit Criteria for M4:**
- Both service test files green.
- Service correctly observes both kill-switches.

---

## M5. CLI + Cron

**Goal:** `JankenSeasonEnd.js` runnable from `node`. Daily reward cron registered and idempotent on re-run.

### Task 5.1: `app/bin/JankenSeasonEnd.js`

**Files:**
- Create: `app/bin/JankenSeasonEnd.js`
- Test: `app/bin/__tests__/JankenSeasonEnd.test.js`

- [ ] **Step 1: Write failing test**

```js
const SeasonEnd = require("../JankenSeasonEnd");

describe("JankenSeasonEnd CLI", () => {
  test("parseArgv parses --note and --enable-rewards", () => {
    const args = SeasonEnd.parseArgv(["--note", "foo bar", "--enable-rewards"]);
    expect(args.note).toBe("foo bar");
    expect(args.enableRewards).toBe(true);
  });
  test("parseArgv defaults: note null, enableRewards false", () => {
    expect(SeasonEnd.parseArgv([])).toEqual({ note: null, enableRewards: false });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement**

```js
const JankenSeasonService = require("../src/service/JankenSeasonService");
const { DefaultLogger } = require("../src/util/Logger");

function parseArgv(argv) {
  const out = { note: null, enableRewards: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--enable-rewards") out.enableRewards = true;
    else if (a === "--note" && i + 1 < argv.length) {
      out.note = argv[++i];
    }
  }
  return out;
}
exports.parseArgv = parseArgv;

async function main(argv = process.argv.slice(2)) {
  const args = parseArgv(argv);
  DefaultLogger.info(`[JankenSeasonEnd] starting: note=${args.note} enableRewards=${args.enableRewards}`);
  const result = await JankenSeasonService.endCurrentAndOpenNext({
    note: args.note,
    payoutEnabled: args.enableRewards,
  });
  DefaultLogger.info(`[JankenSeasonEnd] done: ${JSON.stringify(result)}`);
  return result;
}
exports.main = main;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      DefaultLogger.error("[JankenSeasonEnd] failed", err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run argv test, expect PASS**

Run: `cd app && yarn test JankenSeasonEnd.test.js`

- [ ] **Step 5: Smoke-run against the test DB**

Run: `cd app && node bin/JankenSeasonEnd.js --note "smoke test"`
Expected: prints "done: {...}" with snapshotCount, newSeasonId. Verify in MySQL:
- `SELECT * FROM janken_seasons ORDER BY id DESC LIMIT 2;` → newest is active.
- `SELECT COUNT(*) FROM janken_season_snapshot;` → expected snapshot rows for the just-closed season.
- `SELECT user_id, elo, rank_tier FROM janken_rating LIMIT 5;` → all `elo=1000`.

> CAUTION: This **mutates the local DB**. Use a clean local DB or restore from backup after testing.

- [ ] **Step 6: Commit**

```bash
git add app/bin/JankenSeasonEnd.js app/bin/__tests__/JankenSeasonEnd.test.js
git commit -m "feat(janken): JankenSeasonEnd CLI (Node bin script)"
```

### Task 5.2: `app/bin/JankenDailyRewards.js` + cron registration

**Files:**
- Create: `app/bin/JankenDailyRewards.js`
- Modify: `app/config/crontab.config.js`
- Test: `app/bin/__tests__/JankenDailyRewards.test.js`

- [ ] **Step 1: Write failing test**

```js
const DailyRewards = require("../JankenDailyRewards");

describe("JankenDailyRewards CLI", () => {
  test("computeRewardDate returns yesterday in YYYY-MM-DD (Asia/Taipei)", () => {
    const now = new Date("2026-05-02T03:00:00+08:00");
    expect(DailyRewards.computeRewardDate(now)).toBe("2026-05-01");
  });
  test("computeRewardDate around midnight TPE", () => {
    const now = new Date("2026-05-02T00:10:00+08:00");
    expect(DailyRewards.computeRewardDate(now)).toBe("2026-05-01");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**.

- [ ] **Step 3: Implement**

```js
const JankenRewardService = require("../src/service/JankenRewardService");
const { DefaultLogger } = require("../src/util/Logger");

function computeRewardDate(now = new Date()) {
  // Use Asia/Taipei calendar day; reward is for "yesterday in TPE"
  const tpe = new Date(now.getTime() + (8 * 60 - now.getTimezoneOffset()) * 60 * 1000);
  tpe.setUTCDate(tpe.getUTCDate() - 1);
  return tpe.toISOString().slice(0, 10);
}
exports.computeRewardDate = computeRewardDate;

async function main() {
  const date = computeRewardDate();
  DefaultLogger.info(`[JankenDailyRewards] running for ${date}`);
  const result = await JankenRewardService.payoutDaily(date);
  DefaultLogger.info(`[JankenDailyRewards] done: ${JSON.stringify(result)}`);
}

module.exports = main;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      DefaultLogger.error("[JankenDailyRewards] failed", err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run test, expect PASS**.

- [ ] **Step 5: Register cron**

Append to `app/config/crontab.config.js` array:

```js
{
  name: "Janken Daily Rewards",
  description: "credit daily women-stones to active janken players (kill-switched in config)",
  period: ["0", "10", "0", "*", "*", "*"],
  immediate: false,
  require_path: "./bin/JankenDailyRewards",
},
```

- [ ] **Step 6: Smoke-run cron locally**

Run: `cd app && node bin/JankenDailyRewards.js`
Expected: prints `done: {dryRun:true, candidates:[...], season: ...}` (because `enableDailyRankReward=false`). Verify `SELECT COUNT(*) FROM janken_daily_reward_log` is unchanged.

- [ ] **Step 7: Commit**

```bash
git add app/bin/JankenDailyRewards.js app/bin/__tests__/JankenDailyRewards.test.js app/config/crontab.config.js
git commit -m "feat(janken): JankenDailyRewards cron (00:10 TPE, dry-run by default)"
```

**Exit Criteria for M5:**
- Both bin scripts executable, both tests green.
- Cron entry visible in `crontab.config.js`.
- Smoke run produces dry-run output without DB writes.

---

## M6. Controller / Template / API

**Goal:** `/猜拳段位` rank card shows the season number, lifetime totals, and today's reward (if any). Three new HTTP routes serve seasons + today-reward to the frontend.

### Task 6.1: Extend `queryRank` payload

**Files:**
- Modify: `app/src/controller/application/JankenController.js` (`queryRank` function)

- [ ] **Step 1: Read the existing function** (already read in brainstorming — lines 32–68).

- [ ] **Step 2: Add fetches for season + lifetime + today reward**

Replace the body of `queryRank` to add:

```js
const JankenSeason = require("../../model/application/JankenSeason");
const JankenDailyRewardLog = require("../../model/application/JankenDailyRewardLog");

async function queryRank(context) {
  const { userId } = context.event.source;
  if (!userId) return;

  const rating = await JankenRating.findOrCreate(userId);
  const season = await JankenSeason.getActive();
  // ... (existing rankLabel / rankImageKey / rankTier / etc. unchanged) ...

  const today = new Date().toISOString().slice(0, 10);
  const todayRewardRow = await JankenDailyRewardLog.getByUserAndDate(userId, today);
  const todayReward = todayRewardRow ? { type: todayRewardRow.reward_type, amount: todayRewardRow.amount } : null;

  const lifetime = {
    win: rating.lifetime_win_count + rating.win_count,
    lose: rating.lifetime_lose_count + rating.lose_count,
    draw: rating.lifetime_draw_count + rating.draw_count,
  };

  const rankCard = jankenTemplate.generateRankCard({
    // ... existing args ...
    seasonId: season ? season.id : null,
    seasonStartedAt: season ? season.started_at : null,
    lifetime,
    todayReward,
  });
  await context.replyFlex("猜拳段位", rankCard);
}
```

- [ ] **Step 3: Smoke-test by replying to a fake event**

Manual: in `yarn dev`, send `/猜拳段位` from a LINE group; verify the new lines render. Document in PR description.

- [ ] **Step 4: Commit**

```bash
git add app/src/controller/application/JankenController.js
git commit -m "feat(janken): rank card payload with season + lifetime + today reward"
```

### Task 6.2: Update `generateRankCard` template

**Files:**
- Modify: `app/src/templates/application/Janken.js#generateRankCard`

- [ ] **Step 1: Add a "season + lifetime + today reward" block**

Inside `generateRankCard`, accept the new `seasonId`, `seasonStartedAt`, `lifetime`, `todayReward` props and render an additional vertical box BEFORE the existing footer's separator. Keep the new block compact (3 rows max). Code:

```js
const seasonBlock = seasonId
  ? {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "賽季", color: HERO_SURFACE.textMuted, size: "xs", flex: 1 },
        {
          type: "text",
          text: `第 ${seasonId} 賽季`,
          color: HERO_SURFACE.text, size: "xs", align: "end", flex: 2,
        },
      ],
    }
  : null;

const lifetimeBlock = lifetime
  ? {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "生涯戰績", color: HERO_SURFACE.textMuted, size: "xs", flex: 1 },
        {
          type: "text",
          text: `${lifetime.win} 勝 / ${lifetime.lose} 敗 / ${lifetime.draw} 平`,
          color: HERO_SURFACE.text, size: "xs", align: "end", flex: 2,
        },
      ],
    }
  : null;

const todayRewardBlock = todayReward
  ? {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "今日獎勵", color: HERO_SURFACE.textMuted, size: "xs", flex: 1 },
        {
          type: "text",
          text: `+${todayReward.amount} 女神石`,
          color: HERO_SURFACE.textAccent, size: "xs", align: "end", flex: 2,
        },
      ],
    }
  : null;

const newRows = [seasonBlock, lifetimeBlock, todayRewardBlock].filter(Boolean);
```

Insert these into `bodyContents` between the existing separator and the bounty/maxBet block (or as part of the same nested box).

- [ ] **Step 2: Add a snapshot test for the template**

Create `app/src/templates/application/__tests__/Janken.rankCard.test.js`:

```js
const tpl = require("../Janken");

test("generateRankCard renders season block when seasonId provided", () => {
  const card = tpl.generateRankCard({
    rankLabel: "見習者 5", rankImageKey: "rank_beginner",
    elo: 1000, winCount: 0, loseCount: 0, drawCount: 0, winRate: 0,
    streak: 0, maxStreak: 0, bounty: 0, eloToNext: 100, serverRank: 1, maxBet: 50000,
    baseUrl: "https://x", seasonId: 2, seasonStartedAt: new Date(),
    lifetime: { win: 100, lose: 50, draw: 5 },
    todayReward: { type: "top1", amount: 500 },
  });
  const rendered = JSON.stringify(card);
  expect(rendered).toContain("第 2 賽季");
  expect(rendered).toContain("100 勝 / 50 敗");
  expect(rendered).toContain("+500 女神石");
});

test("generateRankCard hides season/lifetime/todayReward blocks when null", () => {
  const card = tpl.generateRankCard({
    rankLabel: "見習者 5", rankImageKey: "rank_beginner",
    elo: 1000, winCount: 0, loseCount: 0, drawCount: 0, winRate: 0,
    streak: 0, maxStreak: 0, bounty: 0, eloToNext: 100, serverRank: 1, maxBet: 50000,
    baseUrl: "https://x",
  });
  const rendered = JSON.stringify(card);
  expect(rendered).not.toContain("賽季");
  expect(rendered).not.toContain("生涯戰績");
});
```

- [ ] **Step 3: Run, expect PASS**.

Run: `cd app && yarn test Janken.rankCard.test.js`

- [ ] **Step 4: Commit**

```bash
git add app/src/templates/application/Janken.js app/src/templates/application/__tests__/Janken.rankCard.test.js
git commit -m "feat(janken): rank card shows season + lifetime + today reward"
```

### Task 6.3: New API routes

**Files:**
- Modify: `app/src/controller/application/JankenController.js` (add `api.seasons`, `api.seasonTop`, `api.todayReward`)
- Modify: `app/src/router/api.js` (register routes)

- [ ] **Step 1: Implement handlers**

Append to `JankenController.js`:

```js
const JankenSeason = require("../../model/application/JankenSeason");
const JankenSeasonSnapshot = require("../../model/application/JankenSeasonSnapshot");

exports.api.seasons = async (req, res) => {
  try {
    const seasons = await JankenSeason.list(50);
    res.json(seasons);
  } catch (err) {
    console.error("[Janken Seasons API]", err);
    res.status(500).json({ message: "Failed to fetch seasons" });
  }
};

exports.api.seasonTop = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: "Invalid season id" });
    const rows = await JankenSeasonSnapshot.getBySeason(id);
    res.json(rows);
  } catch (err) {
    console.error("[Janken Season Top API]", err);
    res.status(500).json({ message: "Failed to fetch season top" });
  }
};

exports.api.todayReward = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ message: "userId required" });
    const today = new Date().toISOString().slice(0, 10);
    const row = await JankenDailyRewardLog.getByUserAndDate(userId, today);
    res.json(row || null);
  } catch (err) {
    console.error("[Janken Today Reward API]", err);
    res.status(500).json({ message: "Failed to fetch today reward" });
  }
};
```

- [ ] **Step 2: Register in `app/src/router/api.js`**

Add three lines near the existing `/api/janken/*` block:

```js
router.get("/janken/seasons", JankenController.api.seasons);
router.get("/janken/seasons/:id/top", JankenController.api.seasonTop);
router.get("/janken/me/today-reward", JankenController.api.todayReward);
```

- [ ] **Step 3: Smoke-test the routes**

Run: `cd app && yarn dev`, then `curl localhost:9527/api/janken/seasons` (no auth — these endpoints are LIFF-friendly via cookie / token from `validation.js`; if the existing `/api/janken/rankings` returns 200, these will too).

- [ ] **Step 4: Update `/api/janken/rankings` payload**

Modify `JankenController.api.rankings` to include `seasonId` (read once at top of handler):

```js
const season = await JankenSeason.getActive();
res.json({ seasonId: season ? season.id : null, items: result });
// (was: res.json(result))
```

- [ ] **Step 5: Update frontend service signature**

Modify `frontend/src/services/janken.js`:

```js
import api from "./api";
export const getRankings = () => api.get("/api/janken/rankings").then(r => r.data);
export const getRecentMatches = () => api.get("/api/janken/recent-matches").then(r => r.data);
export const getSeasons = () => api.get("/api/janken/seasons").then(r => r.data);
export const getSeasonTop = id => api.get(`/api/janken/seasons/${id}/top`).then(r => r.data);
export const getMyTodayReward = userId => api.get(`/api/janken/me/today-reward`, { params: { userId } }).then(r => r.data);
```

> Frontend `Janken/index.jsx` currently does `setRankings(data)`. Update to `setRankings(data.items || []); setSeasonId(data.seasonId)` in Task 7.1.

- [ ] **Step 6: Commit**

```bash
git add app/src/controller/application/JankenController.js app/src/router/api.js frontend/src/services/janken.js
git commit -m "feat(janken): API endpoints for seasons, season top, today reward"
```

**Exit Criteria for M6:**
- `/猜拳段位` rank card renders season + lifetime + today reward (where present).
- 3 new endpoints respond, plus `/api/janken/rankings` carries `seasonId`.

---

## M7. Frontend

**Goal:** Surface the current season number on the existing `/janken` page header. Other surfaces (per-season hall of fame, today-reward indicator on the rank list) are out of scope for this PR.

### Task 7.1: Season chip on `/janken` page

**Files:**
- Modify: `frontend/src/pages/Janken/index.jsx`

- [ ] **Step 1: Adjust state + fetch**

In `frontend/src/pages/Janken/index.jsx`:

```jsx
const [seasonId, setSeasonId] = useState(null);
// ... inside fetchRankings:
const data = await getRankings();
setRankings(data.items || []);
setSeasonId(data.seasonId || null);
```

- [ ] **Step 2: Render chip in header**

```jsx
<Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
  <Typography variant="h5" sx={{ fontWeight: 700 }}>
    猜拳競技場
  </Typography>
  {seasonId != null && (
    <Chip
      label={`第 ${seasonId} 賽季`}
      size="small"
      color="primary"
      variant="outlined"
    />
  )}
</Stack>
```

(Add `Chip`, `Stack` to MUI imports.)

- [ ] **Step 3: Smoke-test in browser**

Run: `yarn dev` from repo root (boots both bot + frontend).
Open `http://localhost:3000/janken` → verify the chip renders next to the title.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Janken/index.jsx
git commit -m "feat(janken): show current season chip on /janken page"
```

**Exit Criteria for M7:**
- `/janken` page header shows "第 N 賽季" chip alongside the title.
- Existing rankings + battle feed unaffected.

---

## M8. Manual QA + Final Lint

**Goal:** End-to-end sanity check on local infra before opening the PR.

### Task 8.1: Local end-to-end run

- [ ] **Step 1: Reset local DB to a known state**

Run: `make infra` (ensures MySQL up) and `cd app && yarn migrate` (idempotent).

- [ ] **Step 2: Verify schema**

Run from a mysql client:

```sql
DESCRIBE janken_seasons;
DESCRIBE janken_season_snapshot;
DESCRIBE janken_daily_reward_log;
DESCRIBE janken_rating;  -- expect lifetime_* present
SELECT * FROM janken_seasons;
```

Expected: 1 active season seeded.

- [ ] **Step 3: Run season-end CLI dry**

Run: `cd app && node bin/JankenSeasonEnd.js --note "QA dry run"`
Verify: snapshot rows for season 1, ratings reset, season 2 active.

- [ ] **Step 4: Run daily cron dry**

Run: `cd app && node bin/JankenDailyRewards.js`
Verify: prints `dryRun:true`, no rows in `janken_daily_reward_log`, no inventory deltas.

- [ ] **Step 5: Lint**

Run: `cd app && yarn lint && cd ../frontend && yarn lint`
Expected: zero errors.

- [ ] **Step 6: Full test suite**

Run: `cd app && yarn test`
Expected: green.

- [ ] **Step 7: Commit any lint fixups**

```bash
git add -p   # only lint-related changes
git commit -m "chore: lint fixups"
```

### Task 8.2: Open PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/janken-season-rewards
```

- [ ] **Step 2: Open PR**

Title: `feat(janken): season reset + daily rank rewards + ELO rebalance`

Body checklist:
- Spec: `docs/superpowers/specs/2026-05-01-janken-season-rewards-design.md`
- Impl plan: `docs/superpowers/plans/2026-05-01-janken-season-rewards.md`
- ✅ Migrations idempotent on production DB (lifetime_* default 0; first reset captures existing per-season totals).
- ✅ Rewards default-OFF (`enableSeasonEndRewards: false`, `enableDailyRankReward: false`); cron runs in dry-run mode until Phase 2 anti-farming ships.
- ✅ Tier thresholds, K-table, and bet/bounty caps rebalanced.
- ⚠️ Production deploy needs `yarn migrate` then a (separate, ops-run) `node app/bin/JankenSeasonEnd.js --note "v2 啟動"` to actually reset ELO.

**Exit Criteria for M8:**
- All migrations applied, both bin scripts smoke-run successfully.
- `yarn lint` + `yarn test` green.
- PR opened, branch pushed.

---

## Out of Scope (deliberate)

The spec calls these out as Phase 2 — they ship in a follow-up PR after this one merges:

- Per-day, per-opponent ELO cap (Redis `janken:elo_pair:*`).
- Daily ELO ceiling (`daily_elo_gain` columns + 50-elo cap).
- Diversity gate for daily reward eligibility (≥3 unique opponents in 7d).
- `JankenSuspectReport` weekly cron.
- Frontend "歷代賽季" tab.
- `nonBetK > 0` activation (will land alongside per-day per-opponent ELO cap to prevent farming).

When Phase 2 lands, flip both kill-switches in `default.json` and run another `JankenSeasonEnd` to start the first "real" reward season.

## Self-Review

Done while writing this plan:

- **Spec coverage**: every spec section maps to a milestone (§1 Schema → M1, §2 Reset Flow → M4 + M5, §3 Daily Reward → M4 + M5, §4 ELO → M2, §5 Config → M2, §6 Code → M3 + M4 + M6 + M7, §7 Phase 2 → Out of Scope, §8 Economic estimate → informational, §9 Testing → embedded in TDD steps, §10 Rollout → M8).
- **Placeholder scan**: no TBD/TODO; every step has the actual code or command.
- **Type/name consistency**:
  - `endCurrentAndOpenNext({ note, payoutEnabled })` consistent across Task 4.1, 5.1.
  - `payoutDaily(rewardDate)` consistent across 4.2, 5.2.
  - `bucketByPosition(p, rankTier)` exported and used in 4.2, with same signature.
  - `JankenSeason.getActive()` / `.close(id, trx)` / `.openNew(notes, trx)` consistent across 3.1, 4.1.
- **Cron format**: 6-field array (verified in repo: `["0","10","0","*","*","*"]`).
- **Mock hoisting**: jest.mock placement noted (matches repo's `transform: {}` constraint per `feedback_jest_mock_hoisting`).
