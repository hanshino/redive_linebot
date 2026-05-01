# Chat Level Prestige — M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the 9 new DB tables, 3 data-driven seeds, and 9 Knex models that the rest of the Prestige rewrite depends on, so a fresh DB can run `yarn migrate` + `yarn knex seed:run` clean and `yarn test` is green.

**Architecture:** Pure data-layer work. Create migrations that rename-and-recreate `chat_user_data`, drop-and-recreate `chat_exp_unit`, create 7 new tables, and drop the two retired title tables. Seed the three static/lookup tables (`chat_exp_unit` curve, 5 trials, 7 blessings). Wrap each table in a thin model following the existing `app/src/model/base.js` pattern used by `Achievement.js`. No business logic, no Redis, no event pipeline — all of that lands in M2–M10.

**Tech Stack:** Knex 3 + MySQL 8 / mysql2, Jest 30, Node 22, CommonJS. Follow existing repo conventions:
- Migrations in `app/migrations/`, generated via `cd app && yarn knex migrate:make <name>` (never hand-write filenames — user preference documented in memory).
- Seeds in `app/seeds/` with filenames like `<PascalCase>Seeder.js` (see `AdvancementSeeder.js`, `MinigameLevelSeeder.js`).
- Models in `app/src/model/application/`, extending `Base` from `app/src/model/base.js`.
- Tests in `app/__tests__/model/<Model>.test.js` (pure-function unit tests; no DB integration — existing tests use this pattern, see `JankenRating.test.js` and `AchievementEngine.test.js`).

**Non-goals for M1:**
- Do NOT touch `ChatExpUpdate`, `EventDequeue`, `AchievementEngine`, or any cron — those land in M2/M3/M5.
- Do NOT write the one-off migration script that backfills `prestige_pioneer` or snapshots legacy users — that's M9.
- Do NOT drop `chat_user_data_legacy_snapshot` — M1 creates it, M10 T+72h drops it.

**Warning for local dev:** Running M1 migrations puts `chat_user_data` into the new schema. `AchievementEngine.batchEvaluate` (`app/src/service/AchievementEngine.js:360-362`) currently reads the old `experience` column and will throw on next worker cron cycle. This is expected — M5 rewrites that query. If you run a local worker between M1 and M5, skip the `achievementEvaluate` cron job or accept the error log.

---

## File Structure

### New migrations (10 files, generated via `yarn knex migrate:make`)

Each migration is a self-contained up/down pair. Generate in the order below so timestamps enforce ordering:

```
app/migrations/
  YYYYMMDDhhmmss_rename_and_recreate_chat_user_data.js   # Task 1
  YYYYMMDDhhmmss_recreate_chat_exp_unit.js               # Task 2
  YYYYMMDDhhmmss_create_prestige_trials.js               # Task 3
  YYYYMMDDhhmmss_create_prestige_blessings.js            # Task 4
  YYYYMMDDhhmmss_create_user_prestige_trials.js          # Task 5
  YYYYMMDDhhmmss_create_user_blessings.js                # Task 6
  YYYYMMDDhhmmss_create_chat_exp_daily.js                # Task 7
  YYYYMMDDhhmmss_create_chat_exp_events.js               # Task 8
  YYYYMMDDhhmmss_create_user_prestige_history.js         # Task 9
  YYYYMMDDhhmmss_drop_chat_title_tables.js               # Task 10
```

### New seeds (3 files)

```
app/seeds/
  ChatExpUnitSeeder.js         # 101 rows from round(2.7 × L²)
  PrestigeTrialsSeeder.js      # 5 rows — static JSON meta
  PrestigeBlessingsSeeder.js   # 7 rows — static JSON meta
```

### New models (9 files)

```
app/src/model/application/
  ChatUserData.js              # core state (PK = user_id)
  ChatExpUnit.js               # curve lookup + pure helpers (getLevelFromExp / getTotalExpForLevel)
  PrestigeTrial.js             # 5-row config table (PK = id 1-5)
  PrestigeBlessing.js          # 7-row config table (PK = id 1-7)
  UserPrestigeTrial.js         # attempt log (auto-increment)
  UserBlessing.js              # acquired blessings (auto-increment + UNIQUE)
  ChatExpDaily.js              # daily aggregate (auto-increment + UNIQUE user/date) + upsertByUserDate helper
  ChatExpEvent.js              # event log (bigIncrements)
  UserPrestigeHistory.js       # prestige ledger (auto-increment + generated column)
```

### New tests (4 files — only where there's pure logic worth unit-testing)

```
app/__tests__/model/
  ChatExpUnit.test.js          # getLevelFromExp / getTotalExpForLevel
  ChatExpUnitSeeder.test.js    # seed array shape: 101 rows, formula correctness, boundary levels
  PrestigeTrialsSeeder.test.js # 5 rows, JSON shape per spec
  PrestigeBlessingsSeeder.test.js # 7 rows, JSON shape per spec
```

Models that are pure Base wrappers (ChatUserData, PrestigeTrial, PrestigeBlessing, UserPrestigeTrial, UserBlessing, ChatExpDaily, ChatExpEvent, UserPrestigeHistory) are verified by a single end-to-end task (Task 11) that runs migrations + seeds + `yarn test` on a clean DB. Per-model smoke tests would duplicate Base's own contract and exist tests don't follow that pattern.

---

## Task 1: Rename-and-recreate `chat_user_data` (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_rename_and_recreate_chat_user_data.js`

**Context:** Old schema was `{ id, experience, rank, modify_date }` keyed by internal `user.id`. New schema is keyed by LINE `platform_id` (VARCHAR 33) and stores prestige state. We preserve old rows by renaming rather than dropping, so M9's migration script can read the snapshot. The `chat_user_data_legacy_snapshot` table gets DROPed in M10 T+72h.

- [ ] **Step 1: Generate the migration stub**

Run: `cd app && yarn knex migrate:make rename_and_recreate_chat_user_data`
Expected: `Created Migration: app/migrations/<timestamp>_rename_and_recreate_chat_user_data.js`

- [ ] **Step 2: Write the migration body**

Replace the generated file's contents with:

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  const hasOld = await knex.schema.hasTable("chat_user_data");
  if (hasOld) {
    await knex.schema.renameTable("chat_user_data", "chat_user_data_legacy_snapshot");
  }

  return knex.schema.createTable("chat_user_data", table => {
    table.string("user_id", 33).notNullable().primary().comment("LINE platform_id");
    table
      .tinyint("prestige_count")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("0-5, 5 = 覺醒終態");
    table
      .smallint("current_level")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("0-100");
    table
      .integer("current_exp")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("0-27000");
    table
      .datetime("awakened_at")
      .nullable()
      .comment("prestige_count 到 5 時寫入");
    table
      .tinyint("active_trial_id")
      .unsigned()
      .nullable()
      .comment("目前挑戰中的試煉 (NULL = 無)");
    table
      .datetime("active_trial_started_at")
      .nullable()
      .comment("60 天期限倒數起點");
    table
      .integer("active_trial_exp_progress")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("試煉條件累積 XP");
    table.timestamps(true, true);

    table.index(["active_trial_id", "active_trial_started_at"], "idx_active_trial");
    table.index(["awakened_at"], "idx_awakened");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("chat_user_data");
  const hasSnapshot = await knex.schema.hasTable("chat_user_data_legacy_snapshot");
  if (hasSnapshot) {
    await knex.schema.renameTable("chat_user_data_legacy_snapshot", "chat_user_data");
  }
};
```

- [ ] **Step 3: Run the migration against local DB**

Pre-req: `make infra` must be running. Then:
Run: `cd app && yarn migrate`
Expected: last log line includes the new filename, no error. `DESCRIBE chat_user_data;` via phpMyAdmin (`localhost:5278`) shows the new columns.

- [ ] **Step 4: Verify rollback works**

Run: `cd app && yarn knex migrate:rollback`
Expected: new `chat_user_data` dropped; if legacy snapshot existed it's renamed back. Confirm via `SHOW TABLES LIKE 'chat_user_data%'`.

Then re-apply:
Run: `cd app && yarn migrate`
Expected: clean re-run.

- [ ] **Step 5: Commit**

```bash
git add app/migrations/*_rename_and_recreate_chat_user_data.js
git commit -m "feat(chat-level): migration — rename old chat_user_data + create new prestige schema"
```

---

## Task 2: Recreate `chat_exp_unit` (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_recreate_chat_exp_unit.js`

**Context:** Old table was keyed by `id` with a pre-baked curve for Lv.1–173. New table is keyed on `unit_level` as PK (SMALLINT 0–100) holding `total_exp = round(2.7 × L²)`. Seeding happens in Task 11, not here.

- [ ] **Step 1: Generate the migration stub**

Run: `cd app && yarn knex migrate:make recreate_chat_exp_unit`
Expected: new file created.

- [ ] **Step 2: Write the migration body**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("chat_exp_unit");
  return knex.schema.createTable("chat_exp_unit", table => {
    table
      .smallint("unit_level")
      .unsigned()
      .notNullable()
      .primary()
      .comment("0-100, 新曲線平方律");
    table
      .integer("total_exp")
      .unsigned()
      .notNullable()
      .comment("累計 XP: round(2.7 * unit_level^2)");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("chat_exp_unit");
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: no error. `DESCRIBE chat_exp_unit;` shows 2 columns.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_recreate_chat_exp_unit.js
git commit -m "feat(chat-level): migration — recreate chat_exp_unit with new square-law curve schema"
```

---

## Task 3: Create `prestige_trials` (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_create_prestige_trials.js`

**Context:** 5-row config table. `id` is natural PK (1–5), not auto-increment — matches spec "id TINYINT UNSIGNED PK (1-5)".

- [ ] **Step 1: Generate stub**

Run: `cd app && yarn knex migrate:make create_prestige_trials`

- [ ] **Step 2: Write migration body**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("prestige_trials", table => {
    table.tinyint("id").unsigned().notNullable().primary().comment("1-5");
    table.string("slug", 30).notNullable().unique().comment("machine key");
    table.string("display_name", 20).notNullable();
    table.tinyint("star").unsigned().notNullable().comment("1-5 stars");
    table.integer("required_exp").unsigned().notNullable();
    table
      .tinyint("duration_days")
      .unsigned()
      .notNullable()
      .defaultTo(60);
    table.json("restriction_meta").notNullable().comment("試煉限制 JSON");
    table.json("reward_meta").notNullable().comment("通過獎勵 JSON");
    table.text("description").nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("prestige_trials");
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_create_prestige_trials.js
git commit -m "feat(chat-level): migration — create prestige_trials config table"
```

---

## Task 4: Create `prestige_blessings` (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_create_prestige_blessings.js`

**Context:** 7-row config table. `id` is natural PK (1–7).

- [ ] **Step 1: Generate stub**

Run: `cd app && yarn knex migrate:make create_prestige_blessings`

- [ ] **Step 2: Write migration body**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("prestige_blessings", table => {
    table.tinyint("id").unsigned().notNullable().primary().comment("1-7");
    table.string("slug", 30).notNullable().unique();
    table.string("display_name", 20).notNullable();
    table.json("effect_meta").notNullable().comment("祝福效果 JSON");
    table.text("description").nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("prestige_blessings");
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_create_prestige_blessings.js
git commit -m "feat(chat-level): migration — create prestige_blessings config table"
```

---

## Task 5: Create `user_prestige_trials` (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_create_user_prestige_trials.js`

**Context:** Append-only attempt log. Each row = one attempt. `ended_at` NULL while `status = 'active'`. Per spec: "每試煉只能通過一次" is enforced in app layer, not MySQL (no filtered unique).

- [ ] **Step 1: Generate stub**

Run: `cd app && yarn knex migrate:make create_user_prestige_trials`

- [ ] **Step 2: Write migration body**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_prestige_trials", table => {
    table.increments("id").primary();
    table.string("user_id", 33).notNullable().comment("LINE platform_id");
    table.tinyint("trial_id").unsigned().notNullable().comment("FK prestige_trials.id");
    table.datetime("started_at").notNullable();
    table.datetime("ended_at").nullable();
    table
      .enum("status", ["active", "passed", "failed", "forfeited"])
      .notNullable()
      .defaultTo("active");
    table
      .integer("final_exp_progress")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("結束時凍結 — 用於 audit 與 UI 展示");
    table.timestamps(true, true);

    table.index(["user_id", "trial_id", "status"], "idx_user_trial_status");
    table.index(["status", "ended_at"], "idx_status_ended");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_prestige_trials");
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_create_user_prestige_trials.js
git commit -m "feat(chat-level): migration — create user_prestige_trials attempt log"
```

---

## Task 6: Create `user_blessings` (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_create_user_blessings.js`

**Context:** Each blessing per user is unique (spec: 祝福永久疊加、不可重選). UNIQUE enforces that at DB level.

- [ ] **Step 1: Generate stub**

Run: `cd app && yarn knex migrate:make create_user_blessings`

- [ ] **Step 2: Write migration body**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_blessings", table => {
    table.increments("id").primary();
    table.string("user_id", 33).notNullable();
    table.tinyint("blessing_id").unsigned().notNullable();
    table
      .tinyint("acquired_at_prestige")
      .unsigned()
      .notNullable()
      .comment("取得時的新 prestige_count (1-5)");
    table
      .datetime("acquired_at")
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["user_id", "blessing_id"], "uq_user_blessing");
    table.index(["user_id"], "idx_user");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_blessings");
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_create_user_blessings.js
git commit -m "feat(chat-level): migration — create user_blessings table"
```

---

## Task 7: Create `chat_exp_daily` (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_create_chat_exp_daily.js`

**Context:** Daily aggregate keyed by `(user_id, date)` — spec: "UTC+8 日界線" handled at write time (Taipei tz). UNIQUE (user_id, date) lets us `INSERT ... ON DUPLICATE KEY UPDATE` for per-day accumulation. Permanent retention — no cron prune for this table.

- [ ] **Step 1: Generate stub**

Run: `cd app && yarn knex migrate:make create_chat_exp_daily`

- [ ] **Step 2: Write migration body**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("chat_exp_daily", table => {
    table.increments("id").primary();
    table.string("user_id", 33).notNullable();
    table.date("date").notNullable().comment("UTC+8 日界線");
    table
      .integer("raw_exp")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("diminish / 試煉倍率前");
    table
      .integer("effective_exp")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("實際入帳 XP");
    table
      .integer("msg_count")
      .unsigned()
      .notNullable()
      .defaultTo(0);
    table
      .boolean("honeymoon_active")
      .notNullable()
      .defaultTo(false);
    table
      .tinyint("trial_id")
      .unsigned()
      .nullable()
      .comment("若當日在試煉期內，記錄 trial_id");
    table.timestamps(true, true);

    table.unique(["user_id", "date"], "uq_user_date");
    table.index(["date"], "idx_date");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("chat_exp_daily");
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_create_chat_exp_daily.js
git commit -m "feat(chat-level): migration — create chat_exp_daily aggregate table"
```

---

## Task 8: Create `chat_exp_events` (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_create_chat_exp_events.js`

**Context:** Event-level log, 30-day rolling retention (M8 cron handles prune). Millisecond timestamps via `DATETIME(3)` (knex `.datetime("ts", { precision: 3 })`). BIGINT PK because high write volume. `modifiers` JSON for debugging — what祝福/試煉/蜜月 contributed to this event.

- [ ] **Step 1: Generate stub**

Run: `cd app && yarn knex migrate:make create_chat_exp_events`

- [ ] **Step 2: Write migration body**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("chat_exp_events", table => {
    table.bigIncrements("id").primary();
    table.string("user_id", 33).notNullable();
    table.string("group_id", 33).notNullable();
    table
      .datetime("ts", { precision: 3 })
      .notNullable()
      .comment("ms precision for cooldown debug");
    table
      .smallint("raw_exp")
      .unsigned()
      .notNullable();
    table
      .smallint("effective_exp")
      .unsigned()
      .notNullable();
    table
      .decimal("cooldown_rate", 3, 2)
      .notNullable();
    table
      .decimal("group_bonus", 4, 2)
      .notNullable();
    table
      .json("modifiers")
      .nullable()
      .comment("祝福 / 試煉 / 蜜月貢獻 debug");

    table.index(["user_id", "ts"], "idx_user_ts");
    table.index(["ts"], "idx_ts_retention");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("chat_exp_events");
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_create_chat_exp_events.js
git commit -m "feat(chat-level): migration — create chat_exp_events log (30-day retention)"
```

---

## Task 9: Create `user_prestige_history` (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_create_user_prestige_history.js`

**Context:** Permanent ledger of every transcendence event. `cycle_days` is a MySQL GENERATED STORED column computed from `DATEDIFF(prestiged_at, cycle_started_at)`. Knex doesn't have native generated-column DSL — use `table.specificType`.

- [ ] **Step 1: Generate stub**

Run: `cd app && yarn knex migrate:make create_user_prestige_history`

- [ ] **Step 2: Write migration body**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_prestige_history", table => {
    table.increments("id").primary();
    table.string("user_id", 33).notNullable();
    table
      .tinyint("prestige_count_after")
      .unsigned()
      .notNullable()
      .comment("1-5");
    table.tinyint("trial_id").unsigned().notNullable();
    table.tinyint("blessing_id").unsigned().notNullable();
    table
      .datetime("cycle_started_at")
      .notNullable()
      .comment("Lv.1 起算；首次 = T-0 遷移時");
    table
      .datetime("prestiged_at")
      .notNullable()
      .defaultTo(knex.fn.now());
    table.specificType(
      "cycle_days",
      "SMALLINT UNSIGNED GENERATED ALWAYS AS (DATEDIFF(prestiged_at, cycle_started_at)) STORED"
    );

    table.index(["user_id"], "idx_user");
    table.index(["prestige_count_after"], "idx_prestige_count");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_prestige_history");
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: no error. Verify generated column: `SHOW CREATE TABLE user_prestige_history;` should include `GENERATED ALWAYS AS (datediff(...)) STORED`.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_create_user_prestige_history.js
git commit -m "feat(chat-level): migration — create user_prestige_history ledger"
```

---

## Task 10: Drop retired title tables (migration)

**Files:**
- Create: `app/migrations/<generated-timestamp>_drop_chat_title_tables.js`

**Context:** Spec 「稱號系統（廢除）」 — remove `chat_level_title` and `chat_range_title` entirely. Down migration recreates empty shells (no seed data) for rollback safety; real data is gone at T+72h when legacy snapshot drops.

- [ ] **Step 1: Generate stub**

Run: `cd app && yarn knex migrate:make drop_chat_title_tables`

- [ ] **Step 2: Write migration body**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("chat_level_title");
  await knex.schema.dropTableIfExists("chat_range_title");
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.createTable("chat_level_title", table => {
    table.increments("id").primary();
    table.string("title", 50).notNullable();
    table.integer("title_range").notNullable();
  });
  await knex.schema.createTable("chat_range_title", table => {
    table.integer("id").primary();
    table.string("title", 50).notNullable();
  });
};
```

- [ ] **Step 3: Run migration**

Run: `cd app && yarn migrate`
Expected: no error. `SHOW TABLES LIKE 'chat_%_title';` returns empty.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_drop_chat_title_tables.js
git commit -m "feat(chat-level): migration — drop chat_level_title + chat_range_title (title system retired)"
```

---

## Task 11: `ChatExpUnit` model + seed + tests

**Files:**
- Create: `app/src/model/application/ChatExpUnit.js`
- Create: `app/seeds/ChatExpUnitSeeder.js`
- Create: `app/__tests__/model/ChatExpUnit.test.js`
- Create: `app/__tests__/model/ChatExpUnitSeeder.test.js`

**Context:** The curve is `total_exp(L) = round(2.7 × L²)`. Lv.0 = 0, Lv.100 = 27000. Model exposes two pure helpers — `getLevelFromExp(exp, rows)` finds the highest level whose `total_exp <= exp`, and `getTotalExpForLevel(level, rows)` is a simple lookup. Pure functions → easy unit tests. The Base model is also exposed for CRUD if ever needed downstream.

- [ ] **Step 1: Write the failing seeder test**

Create `app/__tests__/model/ChatExpUnitSeeder.test.js`:

```js
jest.mock("../../src/util/mysql", () => jest.fn());

describe("ChatExpUnitSeeder", () => {
  const Seeder = require("../../seeds/ChatExpUnitSeeder");

  it("generates 101 rows from level 0 to 100", () => {
    const rows = Seeder.buildRows();
    expect(rows).toHaveLength(101);
    expect(rows[0]).toEqual({ unit_level: 0, total_exp: 0 });
    expect(rows[100]).toEqual({ unit_level: 100, total_exp: 27000 });
  });

  it("applies round(2.7 * L^2) formula", () => {
    const rows = Seeder.buildRows();
    expect(rows[10].total_exp).toBe(270);
    expect(rows[30].total_exp).toBe(2430);
    expect(rows[50].total_exp).toBe(6750);
    expect(rows[70].total_exp).toBe(13230);
    expect(rows[90].total_exp).toBe(21870);
  });

  it("produces monotonically increasing total_exp", () => {
    const rows = Seeder.buildRows();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].total_exp).toBeGreaterThanOrEqual(rows[i - 1].total_exp);
    }
  });
});
```

- [ ] **Step 2: Write the failing model test**

Create `app/__tests__/model/ChatExpUnit.test.js`:

```js
jest.mock("../../src/util/mysql", () => jest.fn());

const ChatExpUnit = require("../../src/model/application/ChatExpUnit");

const ROWS = [
  { unit_level: 0, total_exp: 0 },
  { unit_level: 1, total_exp: 3 },
  { unit_level: 10, total_exp: 270 },
  { unit_level: 50, total_exp: 6750 },
  { unit_level: 100, total_exp: 27000 },
];

describe("ChatExpUnit", () => {
  describe("getLevelFromExp", () => {
    it("returns 0 when exp is 0", () => {
      expect(ChatExpUnit.getLevelFromExp(0, ROWS)).toBe(0);
    });

    it("returns the highest level whose total_exp <= exp", () => {
      expect(ChatExpUnit.getLevelFromExp(269, ROWS)).toBe(1);
      expect(ChatExpUnit.getLevelFromExp(270, ROWS)).toBe(10);
      expect(ChatExpUnit.getLevelFromExp(6749, ROWS)).toBe(10);
      expect(ChatExpUnit.getLevelFromExp(6750, ROWS)).toBe(50);
    });

    it("caps at max level when exp >= max total_exp", () => {
      expect(ChatExpUnit.getLevelFromExp(27000, ROWS)).toBe(100);
      expect(ChatExpUnit.getLevelFromExp(999999, ROWS)).toBe(100);
    });
  });

  describe("getTotalExpForLevel", () => {
    it("returns total_exp for a known level", () => {
      expect(ChatExpUnit.getTotalExpForLevel(50, ROWS)).toBe(6750);
      expect(ChatExpUnit.getTotalExpForLevel(100, ROWS)).toBe(27000);
    });

    it("returns null for an unknown level", () => {
      expect(ChatExpUnit.getTotalExpForLevel(101, ROWS)).toBeNull();
      expect(ChatExpUnit.getTotalExpForLevel(-1, ROWS)).toBeNull();
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd app && yarn test -- ChatExpUnit`
Expected: FAIL — `Cannot find module '../../seeds/ChatExpUnitSeeder'` and `'../../src/model/application/ChatExpUnit'`.

- [ ] **Step 4: Implement the seeder**

Create `app/seeds/ChatExpUnitSeeder.js`:

```js
const MAX_LEVEL = 100;
const COEFFICIENT = 2.7;

function buildRows() {
  const rows = [];
  for (let level = 0; level <= MAX_LEVEL; level++) {
    rows.push({
      unit_level: level,
      total_exp: Math.round(COEFFICIENT * level * level),
    });
  }
  return rows;
}

exports.buildRows = buildRows;

exports.seed = async function (knex) {
  await knex("chat_exp_unit").del();
  await knex("chat_exp_unit").insert(buildRows());
};
```

- [ ] **Step 5: Implement the model**

Create `app/src/model/application/ChatExpUnit.js`:

```js
const Base = require("../base");

const TABLE = "chat_exp_unit";
const fillable = ["unit_level", "total_exp"];

class ChatExpUnit extends Base {}

const model = new ChatExpUnit({ table: TABLE, fillable });

exports.model = model;

exports.all = () => model.all({ order: [{ column: "unit_level", direction: "asc" }] });

/**
 * 用給定的曲線資料，回傳 exp 所屬的最高等級。
 * @param {number} exp
 * @param {Array<{unit_level: number, total_exp: number}>} rows 依 unit_level 升冪排列
 * @returns {number}
 */
exports.getLevelFromExp = function (exp, rows) {
  let level = 0;
  for (const row of rows) {
    if (row.total_exp <= exp) level = row.unit_level;
    else break;
  }
  return level;
};

/**
 * @param {number} level
 * @param {Array<{unit_level: number, total_exp: number}>} rows
 * @returns {number|null}
 */
exports.getTotalExpForLevel = function (level, rows) {
  const row = rows.find(r => r.unit_level === level);
  return row ? row.total_exp : null;
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app && yarn test -- ChatExpUnit`
Expected: PASS — all assertions green.

- [ ] **Step 7: Run the seeder against local DB**

Run: `cd app && yarn knex seed:run --specific=ChatExpUnitSeeder.js`
Expected: no error. Verify via SQL: `SELECT COUNT(*) FROM chat_exp_unit;` returns 101, `SELECT total_exp FROM chat_exp_unit WHERE unit_level = 100;` returns 27000.

- [ ] **Step 8: Commit**

```bash
git add app/seeds/ChatExpUnitSeeder.js app/src/model/application/ChatExpUnit.js app/__tests__/model/ChatExpUnit.test.js app/__tests__/model/ChatExpUnitSeeder.test.js
git commit -m "feat(chat-level): ChatExpUnit seeder + model + curve helpers"
```

---

## Task 12: `PrestigeTrial` model + seed + test

**Files:**
- Create: `app/src/model/application/PrestigeTrial.js`
- Create: `app/seeds/PrestigeTrialsSeeder.js`
- Create: `app/__tests__/model/PrestigeTrialsSeeder.test.js`

**Context:** 5 fixed rows with JSON `restriction_meta` / `reward_meta` that drive the trial engine in M2+. Test verifies row count and JSON shape matches spec table. Model is a thin Base wrapper with a `findBySlug` helper since M3's PrestigeService looks trials up by slug.

- [ ] **Step 1: Write the failing seeder test**

Create `app/__tests__/model/PrestigeTrialsSeeder.test.js`:

```js
jest.mock("../../src/util/mysql", () => jest.fn());

describe("PrestigeTrialsSeeder", () => {
  const Seeder = require("../../seeds/PrestigeTrialsSeeder");

  it("produces exactly 5 trials with ids 1-5", () => {
    const rows = Seeder.buildRows();
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("has expected slugs in star order", () => {
    const rows = Seeder.buildRows();
    expect(rows.map(r => r.slug)).toEqual([
      "departure",
      "hardship",
      "rhythm",
      "solitude",
      "awakening",
    ]);
  });

  it("encodes restriction_meta + reward_meta as JSON strings per spec", () => {
    const rows = Seeder.buildRows();
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(JSON.parse(byId[1].restriction_meta)).toEqual({ type: "none" });
    expect(JSON.parse(byId[1].reward_meta)).toEqual({
      type: "trigger_achievement",
      achievement_slug: "prestige_departure",
    });

    expect(JSON.parse(byId[2].restriction_meta)).toEqual({
      type: "xp_multiplier",
      value: 0.7,
    });
    expect(JSON.parse(byId[2].reward_meta)).toEqual({
      type: "permanent_xp_multiplier",
      value: 0.1,
    });

    expect(JSON.parse(byId[3].restriction_meta)).toEqual({
      type: "cooldown_shift_multiplier",
      value: 1.33,
    });
    expect(JSON.parse(byId[3].reward_meta)).toEqual({
      type: "cooldown_tier_override",
      tiers: { "2-4": 0.7, "4-6": 0.9 },
    });

    expect(JSON.parse(byId[4].restriction_meta)).toEqual({
      type: "group_bonus_disabled",
    });
    expect(JSON.parse(byId[4].reward_meta)).toEqual({ type: "group_bonus_double" });

    expect(JSON.parse(byId[5].restriction_meta)).toEqual({
      type: "xp_multiplier",
      value: 0.5,
    });
    expect(JSON.parse(byId[5].reward_meta)).toEqual({
      type: "permanent_xp_multiplier",
      value: 0.15,
      achievement_slug: "prestige_awakening",
    });
  });

  it("has correct required_exp and star per spec", () => {
    const rows = Seeder.buildRows();
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId[1]).toMatchObject({ star: 1, required_exp: 2000, duration_days: 60 });
    expect(byId[2]).toMatchObject({ star: 2, required_exp: 3000, duration_days: 60 });
    expect(byId[3]).toMatchObject({ star: 3, required_exp: 2500, duration_days: 60 });
    expect(byId[4]).toMatchObject({ star: 4, required_exp: 2500, duration_days: 60 });
    expect(byId[5]).toMatchObject({ star: 5, required_exp: 5000, duration_days: 60 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && yarn test -- PrestigeTrialsSeeder`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the seeder**

Create `app/seeds/PrestigeTrialsSeeder.js`:

```js
const TRIALS = [
  {
    id: 1,
    slug: "departure",
    display_name: "啟程",
    star: 1,
    required_exp: 2000,
    duration_days: 60,
    restriction_meta: { type: "none" },
    reward_meta: { type: "trigger_achievement", achievement_slug: "prestige_departure" },
    description: "初次踏上轉生之路，無限制。達標觸發啟程成就。",
  },
  {
    id: 2,
    slug: "hardship",
    display_name: "刻苦",
    star: 2,
    required_exp: 3000,
    duration_days: 60,
    restriction_meta: { type: "xp_multiplier", value: 0.7 },
    reward_meta: { type: "permanent_xp_multiplier", value: 0.1 },
    description: "期間 XP ×0.7，通過後永久 XP +10%。",
  },
  {
    id: 3,
    slug: "rhythm",
    display_name: "律動",
    star: 3,
    required_exp: 2500,
    duration_days: 60,
    restriction_meta: { type: "cooldown_shift_multiplier", value: 1.33 },
    reward_meta: { type: "cooldown_tier_override", tiers: { "2-4": 0.7, "4-6": 0.9 } },
    description: "冷卻曲線右移 ×1.33（8s 滿速）。通過後中段 tier 提升。",
  },
  {
    id: 4,
    slug: "solitude",
    display_name: "孤鳴",
    star: 4,
    required_exp: 2500,
    duration_days: 60,
    restriction_meta: { type: "group_bonus_disabled" },
    reward_meta: { type: "group_bonus_double" },
    description: "期間群組加成失效。通過後群組加成斜率翻倍。",
  },
  {
    id: 5,
    slug: "awakening",
    display_name: "覺悟",
    star: 5,
    required_exp: 5000,
    duration_days: 60,
    restriction_meta: { type: "xp_multiplier", value: 0.5 },
    reward_meta: {
      type: "permanent_xp_multiplier",
      value: 0.15,
      achievement_slug: "prestige_awakening",
    },
    description: "最終試煉，期間 XP ×0.5。通過後永久 XP +15% 並解鎖覺醒。",
  },
];

function buildRows() {
  return TRIALS.map(t => ({
    ...t,
    restriction_meta: JSON.stringify(t.restriction_meta),
    reward_meta: JSON.stringify(t.reward_meta),
  }));
}

exports.buildRows = buildRows;

exports.seed = async function (knex) {
  await knex("prestige_trials").del();
  await knex("prestige_trials").insert(buildRows());
};
```

- [ ] **Step 4: Implement the model**

Create `app/src/model/application/PrestigeTrial.js`:

```js
const Base = require("../base");

const TABLE = "prestige_trials";
const fillable = [
  "id",
  "slug",
  "display_name",
  "star",
  "required_exp",
  "duration_days",
  "restriction_meta",
  "reward_meta",
  "description",
];

class PrestigeTrial extends Base {}

const model = new PrestigeTrial({ table: TABLE, fillable });

exports.model = model;

exports.all = () => model.all({ order: [{ column: "star", direction: "asc" }] });

exports.findBySlug = slug => model.first({ filter: { slug } });

exports.findById = id => model.first({ filter: { id } });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && yarn test -- PrestigeTrialsSeeder`
Expected: PASS.

- [ ] **Step 6: Run seeder against DB**

Run: `cd app && yarn knex seed:run --specific=PrestigeTrialsSeeder.js`
Expected: no error. `SELECT slug FROM prestige_trials ORDER BY id;` returns `departure, hardship, rhythm, solitude, awakening`.

- [ ] **Step 7: Commit**

```bash
git add app/seeds/PrestigeTrialsSeeder.js app/src/model/application/PrestigeTrial.js app/__tests__/model/PrestigeTrialsSeeder.test.js
git commit -m "feat(chat-level): PrestigeTrial seeder + model (5 trials, JSON meta)"
```

---

## Task 13: `PrestigeBlessing` model + seed + test

**Files:**
- Create: `app/src/model/application/PrestigeBlessing.js`
- Create: `app/seeds/PrestigeBlessingsSeeder.js`
- Create: `app/__tests__/model/PrestigeBlessingsSeeder.test.js`

**Context:** Same shape as trials but 7 rows, one JSON column (`effect_meta`). JSON payload types drive the M2 pipeline math.

- [ ] **Step 1: Write the failing seeder test**

Create `app/__tests__/model/PrestigeBlessingsSeeder.test.js`:

```js
jest.mock("../../src/util/mysql", () => jest.fn());

describe("PrestigeBlessingsSeeder", () => {
  const Seeder = require("../../seeds/PrestigeBlessingsSeeder");

  it("produces exactly 7 blessings with ids 1-7", () => {
    const rows = Seeder.buildRows();
    expect(rows).toHaveLength(7);
    expect(rows.map(r => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("has expected slugs", () => {
    const rows = Seeder.buildRows();
    expect(rows.map(r => r.slug)).toEqual([
      "language_gift",
      "swift_tongue",
      "ember_afterglow",
      "whispering",
      "rhythm_spring",
      "star_guard",
      "greenhouse",
    ]);
  });

  it("encodes effect_meta as JSON string per spec", () => {
    const rows = Seeder.buildRows();
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(JSON.parse(byId[1].effect_meta)).toEqual({
      type: "per_msg_xp_multiplier",
      value: 0.08,
    });
    expect(JSON.parse(byId[2].effect_meta)).toEqual({
      type: "cooldown_threshold_shift",
      from: 6,
      to: 5,
    });
    expect(JSON.parse(byId[3].effect_meta)).toEqual({
      type: "cooldown_tier_override",
      tiers: { "0-1": 0.1, "1-2": 0.3 },
    });
    expect(JSON.parse(byId[4].effect_meta)).toEqual({
      type: "diminish_tier_expand",
      tier: "0-200",
      to: 300,
    });
    expect(JSON.parse(byId[5].effect_meta)).toEqual({
      type: "diminish_tier_expand",
      tier: "200-500",
      to: 600,
    });
    expect(JSON.parse(byId[6].effect_meta)).toEqual({
      type: "group_bonus_slope",
      value: 0.025,
    });
    expect(JSON.parse(byId[7].effect_meta)).toEqual({
      type: "small_group_multiplier",
      threshold: 10,
      value: 1.3,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && yarn test -- PrestigeBlessingsSeeder`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the seeder**

Create `app/seeds/PrestigeBlessingsSeeder.js`:

```js
const BLESSINGS = [
  {
    id: 1,
    slug: "language_gift",
    display_name: "語言天賦",
    effect_meta: { type: "per_msg_xp_multiplier", value: 0.08 },
    description: "單句基礎 XP +8%。",
  },
  {
    id: 2,
    slug: "swift_tongue",
    display_name: "迅雷語速",
    effect_meta: { type: "cooldown_threshold_shift", from: 6, to: 5 },
    description: "冷卻滿速門檻 6s → 5s。",
  },
  {
    id: 3,
    slug: "ember_afterglow",
    display_name: "燃燒餘熱",
    effect_meta: { type: "cooldown_tier_override", tiers: { "0-1": 0.1, "1-2": 0.3 } },
    description: "冷卻初段緩衝：<1s 0→10%、1–2s 10→30%。",
  },
  {
    id: 4,
    slug: "whispering",
    display_name: "絮語之心",
    effect_meta: { type: "diminish_tier_expand", tier: "0-200", to: 300 },
    description: "日 XP 100% 區間 0–200 → 0–300。",
  },
  {
    id: 5,
    slug: "rhythm_spring",
    display_name: "節律之泉",
    effect_meta: { type: "diminish_tier_expand", tier: "200-500", to: 600 },
    description: "日 XP 30% 區間 200–500 → 200–600。",
  },
  {
    id: 6,
    slug: "star_guard",
    display_name: "群星加護",
    effect_meta: { type: "group_bonus_slope", value: 0.025 },
    description: "群組加成斜率 0.02 → 0.025。",
  },
  {
    id: 7,
    slug: "greenhouse",
    display_name: "溫室之語",
    effect_meta: { type: "small_group_multiplier", threshold: 10, value: 1.3 },
    description: "群組 <10 人時 XP ×1.3。",
  },
];

function buildRows() {
  return BLESSINGS.map(b => ({
    ...b,
    effect_meta: JSON.stringify(b.effect_meta),
  }));
}

exports.buildRows = buildRows;

exports.seed = async function (knex) {
  await knex("prestige_blessings").del();
  await knex("prestige_blessings").insert(buildRows());
};
```

- [ ] **Step 4: Implement the model**

Create `app/src/model/application/PrestigeBlessing.js`:

```js
const Base = require("../base");

const TABLE = "prestige_blessings";
const fillable = ["id", "slug", "display_name", "effect_meta", "description"];

class PrestigeBlessing extends Base {}

const model = new PrestigeBlessing({ table: TABLE, fillable });

exports.model = model;

exports.all = () => model.all({ order: [{ column: "id", direction: "asc" }] });

exports.findBySlug = slug => model.first({ filter: { slug } });

exports.findById = id => model.first({ filter: { id } });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && yarn test -- PrestigeBlessingsSeeder`
Expected: PASS.

- [ ] **Step 6: Run seeder against DB**

Run: `cd app && yarn knex seed:run --specific=PrestigeBlessingsSeeder.js`
Expected: no error. `SELECT COUNT(*) FROM prestige_blessings;` returns 7.

- [ ] **Step 7: Commit**

```bash
git add app/seeds/PrestigeBlessingsSeeder.js app/src/model/application/PrestigeBlessing.js app/__tests__/model/PrestigeBlessingsSeeder.test.js
git commit -m "feat(chat-level): PrestigeBlessing seeder + model (7 blessings, JSON effect_meta)"
```

---

## Task 14: `ChatUserData` model

**Files:**
- Create: `app/src/model/application/ChatUserData.js`

**Context:** Thin Base wrapper. PK is `user_id` (VARCHAR), not numeric `id` — Base's default `find(id)` won't work here, so expose `findByUserId` explicitly. `upsert` helper needed because M2/M3 will create-or-update rows for new users on first message.

- [ ] **Step 1: Implement the model**

Create `app/src/model/application/ChatUserData.js`:

```js
const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "chat_user_data";
const fillable = [
  "user_id",
  "prestige_count",
  "current_level",
  "current_exp",
  "awakened_at",
  "active_trial_id",
  "active_trial_started_at",
  "active_trial_exp_progress",
];

class ChatUserData extends Base {}

const model = new ChatUserData({ table: TABLE, fillable });

exports.model = model;
exports.TABLE = TABLE;

exports.findByUserId = userId => model.first({ filter: { user_id: userId } });

/**
 * 建立或更新一列；PK = user_id。
 * @param {string} userId
 * @param {object} attributes
 */
exports.upsert = async (userId, attributes = {}) => {
  const existing = await exports.findByUserId(userId);
  if (existing) {
    return mysql(TABLE)
      .where({ user_id: userId })
      .update(attributes);
  }
  return mysql(TABLE).insert({ user_id: userId, ...attributes });
};
```

- [ ] **Step 2: Verify model loads with no syntax error**

Run: `cd app && node -e "require('./src/model/application/ChatUserData')"`
Expected: no output, no throw.

- [ ] **Step 3: Commit**

```bash
git add app/src/model/application/ChatUserData.js
git commit -m "feat(chat-level): ChatUserData model (prestige state, user_id PK)"
```

---

## Task 15: `UserPrestigeTrial` model

**Files:**
- Create: `app/src/model/application/UserPrestigeTrial.js`

**Context:** Attempt log. M3's PrestigeService inserts one row per `startTrial`, updates `status`/`ended_at`/`final_exp_progress` on pass/fail/forfeit. Expose `findActiveByUserId` and `listPassedByUserId` since those are the two hot queries.

- [ ] **Step 1: Implement the model**

Create `app/src/model/application/UserPrestigeTrial.js`:

```js
const Base = require("../base");

const TABLE = "user_prestige_trials";
const fillable = [
  "user_id",
  "trial_id",
  "started_at",
  "ended_at",
  "status",
  "final_exp_progress",
];

class UserPrestigeTrial extends Base {}

const model = new UserPrestigeTrial({ table: TABLE, fillable });

exports.model = model;

exports.findActiveByUserId = userId =>
  model.first({ filter: { user_id: userId, status: "active" } });

exports.listPassedByUserId = userId =>
  model.all({
    filter: { user_id: userId, status: "passed" },
    order: [{ column: "ended_at", direction: "asc" }],
  });

exports.listByUserId = userId =>
  model.all({
    filter: { user_id: userId },
    order: [{ column: "started_at", direction: "asc" }],
  });
```

- [ ] **Step 2: Syntax check**

Run: `cd app && node -e "require('./src/model/application/UserPrestigeTrial')"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/model/application/UserPrestigeTrial.js
git commit -m "feat(chat-level): UserPrestigeTrial model (attempt log)"
```

---

## Task 16: `UserBlessing` model

**Files:**
- Create: `app/src/model/application/UserBlessing.js`

**Context:** Per-user acquired blessings. UNIQUE (user_id, blessing_id) in schema. Expose `listByUserId` returning the set of acquired blessing_ids (M2 reads this to apply pipeline effects).

- [ ] **Step 1: Implement the model**

Create `app/src/model/application/UserBlessing.js`:

```js
const Base = require("../base");

const TABLE = "user_blessings";
const fillable = ["user_id", "blessing_id", "acquired_at_prestige", "acquired_at"];

class UserBlessing extends Base {}

const model = new UserBlessing({ table: TABLE, fillable });

exports.model = model;

exports.listByUserId = userId =>
  model.all({
    filter: { user_id: userId },
    order: [{ column: "acquired_at_prestige", direction: "asc" }],
  });

exports.listBlessingIdsByUserId = async userId => {
  const rows = await model.all({ filter: { user_id: userId }, select: ["blessing_id"] });
  return rows.map(r => r.blessing_id);
};
```

- [ ] **Step 2: Syntax check**

Run: `cd app && node -e "require('./src/model/application/UserBlessing')"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/model/application/UserBlessing.js
git commit -m "feat(chat-level): UserBlessing model"
```

---

## Task 17: `ChatExpDaily` model

**Files:**
- Create: `app/src/model/application/ChatExpDaily.js`

**Context:** Daily aggregate. M2's `ChatExpUpdate` will upsert-by-date (INSERT ... ON DUPLICATE KEY UPDATE via `knex.raw` since knex 3's `onConflict` chains are mysql-specific). Expose `upsertByUserDate({ userId, date, rawExp, effectiveExp, msgCount, honeymoonActive, trialId })` with atomic increment semantics.

- [ ] **Step 1: Implement the model**

Create `app/src/model/application/ChatExpDaily.js`:

```js
const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "chat_exp_daily";
const fillable = [
  "user_id",
  "date",
  "raw_exp",
  "effective_exp",
  "msg_count",
  "honeymoon_active",
  "trial_id",
];

class ChatExpDaily extends Base {}

const model = new ChatExpDaily({ table: TABLE, fillable });

exports.model = model;

exports.findByUserDate = (userId, date) =>
  model.first({ filter: { user_id: userId, date } });

/**
 * 以 (user_id, date) 為鍵 upsert，raw_exp / effective_exp / msg_count 為累加型欄位。
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.date          YYYY-MM-DD (UTC+8)
 * @param {number} params.rawExp        增量 (add to raw_exp)
 * @param {number} params.effectiveExp  增量 (add to effective_exp)
 * @param {number} params.msgCount      增量 (add to msg_count)
 * @param {boolean} params.honeymoonActive
 * @param {number|null} params.trialId
 */
exports.upsertByUserDate = async ({
  userId,
  date,
  rawExp,
  effectiveExp,
  msgCount,
  honeymoonActive,
  trialId,
}) => {
  return mysql.raw(
    `INSERT INTO ${TABLE}
       (user_id, date, raw_exp, effective_exp, msg_count, honeymoon_active, trial_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       raw_exp = raw_exp + VALUES(raw_exp),
       effective_exp = effective_exp + VALUES(effective_exp),
       msg_count = msg_count + VALUES(msg_count),
       honeymoon_active = VALUES(honeymoon_active),
       trial_id = VALUES(trial_id)`,
    [userId, date, rawExp, effectiveExp, msgCount, honeymoonActive, trialId]
  );
};
```

- [ ] **Step 2: Syntax check**

Run: `cd app && node -e "require('./src/model/application/ChatExpDaily')"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/model/application/ChatExpDaily.js
git commit -m "feat(chat-level): ChatExpDaily model with upsertByUserDate helper"
```

---

## Task 18: `ChatExpEvent` model

**Files:**
- Create: `app/src/model/application/ChatExpEvent.js`

**Context:** Event log, high write volume. Expose `insertEvent({ userId, groupId, ts, rawExp, effectiveExp, cooldownRate, groupBonus, modifiers })` as the single write point M2 will call. Read queries live in reporting dashboards, not here.

- [ ] **Step 1: Implement the model**

Create `app/src/model/application/ChatExpEvent.js`:

```js
const Base = require("../base");

const TABLE = "chat_exp_events";
const fillable = [
  "user_id",
  "group_id",
  "ts",
  "raw_exp",
  "effective_exp",
  "cooldown_rate",
  "group_bonus",
  "modifiers",
];

class ChatExpEvent extends Base {}

const model = new ChatExpEvent({ table: TABLE, fillable });

exports.model = model;

/**
 * 寫入一筆事件。modifiers 會自動 JSON.stringify。
 * @param {object} params
 */
exports.insertEvent = params => {
  const payload = { ...params };
  if (payload.modifiers && typeof payload.modifiers !== "string") {
    payload.modifiers = JSON.stringify(payload.modifiers);
  }
  return model.create(payload);
};
```

- [ ] **Step 2: Syntax check**

Run: `cd app && node -e "require('./src/model/application/ChatExpEvent')"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/model/application/ChatExpEvent.js
git commit -m "feat(chat-level): ChatExpEvent model with insertEvent helper"
```

---

## Task 19: `UserPrestigeHistory` model

**Files:**
- Create: `app/src/model/application/UserPrestigeHistory.js`

**Context:** Prestige ledger, append-only. M3's PrestigeService writes one row per successful prestige. `cycle_days` is DB-generated (DATEDIFF) — don't include in `fillable` (would error on insert).

- [ ] **Step 1: Implement the model**

Create `app/src/model/application/UserPrestigeHistory.js`:

```js
const Base = require("../base");

const TABLE = "user_prestige_history";
// cycle_days is a generated column — excluded from fillable
const fillable = [
  "user_id",
  "prestige_count_after",
  "trial_id",
  "blessing_id",
  "cycle_started_at",
  "prestiged_at",
];

class UserPrestigeHistory extends Base {}

const model = new UserPrestigeHistory({ table: TABLE, fillable });

exports.model = model;

exports.listByUserId = userId =>
  model.all({
    filter: { user_id: userId },
    order: [{ column: "prestige_count_after", direction: "asc" }],
  });

exports.latestByUserId = userId =>
  model.first({
    filter: { user_id: userId },
    order: [{ column: "prestige_count_after", direction: "desc" }],
  });
```

- [ ] **Step 2: Syntax check**

Run: `cd app && node -e "require('./src/model/application/UserPrestigeHistory')"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/model/application/UserPrestigeHistory.js
git commit -m "feat(chat-level): UserPrestigeHistory model (cycle_days is generated, excluded from fillable)"
```

---

## Task 20: End-to-end verification on a clean DB

**Files:** None created; this is a validation pass.

**Context:** The final gate for M1's Exit Criteria. Prove the full M1 chain runs clean from scratch: drop the DB, run all migrations, run all three seeds, run the full test suite. If anything here fails, track the root cause back to the earlier task and fix there — don't paper over with tweaks in this task.

- [ ] **Step 1: Start infra**

Run: `make infra`
Expected: mysql / redis / phpmyadmin containers up.

- [ ] **Step 2: Drop and recreate the Princess schema on the local DB**

Run: `docker exec -i redive_linebot-mysql-1 mysql -uroot -p"${DB_PASSWORD}" -e 'DROP DATABASE Princess; CREATE DATABASE Princess;'`

(If the container name differs, list containers with `docker ps --format '{{.Names}}' | grep mysql` and substitute.)

Expected: no output, no error.

- [ ] **Step 3: Run all migrations**

Run: `cd app && yarn migrate`
Expected: `Batch 1 run: <N> migrations` where N includes all existing repo migrations + the 10 new ones from Tasks 1–10. No errors.

- [ ] **Step 4: Verify new tables exist**

Run:
```bash
docker exec -i redive_linebot-mysql-1 mysql -uroot -p"${DB_PASSWORD}" Princess -e \
  "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='Princess' AND TABLE_NAME IN ('chat_user_data','chat_exp_unit','prestige_trials','prestige_blessings','user_prestige_trials','user_blessings','chat_exp_daily','chat_exp_events','user_prestige_history') ORDER BY TABLE_NAME;"
```
Expected: all 9 table names printed.

Also verify retired tables are gone:
```bash
docker exec -i redive_linebot-mysql-1 mysql -uroot -p"${DB_PASSWORD}" Princess -e \
  "SHOW TABLES LIKE 'chat_%_title';"
```
Expected: empty result.

- [ ] **Step 5: Run the three new seeds**

Run: `cd app && yarn knex seed:run`
Expected: all seeders (including the 3 new ones + existing ones) run without error.

- [ ] **Step 6: Verify seed row counts + key values**

Run:
```bash
docker exec -i redive_linebot-mysql-1 mysql -uroot -p"${DB_PASSWORD}" Princess -e "
  SELECT 'chat_exp_unit' AS t, COUNT(*) AS n FROM chat_exp_unit
  UNION ALL SELECT 'prestige_trials', COUNT(*) FROM prestige_trials
  UNION ALL SELECT 'prestige_blessings', COUNT(*) FROM prestige_blessings;
  SELECT total_exp FROM chat_exp_unit WHERE unit_level = 100;
  SELECT slug FROM prestige_trials ORDER BY id;
  SELECT slug FROM prestige_blessings ORDER BY id;
"
```
Expected: counts = 101 / 5 / 7; total_exp @ Lv100 = 27000; 5 trial slugs in star order; 7 blessing slugs in id order.

- [ ] **Step 7: Run the full test suite**

Run: `cd app && yarn test`
Expected: all tests green, including the 4 new ones from Tasks 11–13.

- [ ] **Step 8: Run lint**

Run: `cd app && yarn lint`
Expected: no errors.

- [ ] **Step 9: Final M1 commit (if any stragglers)**

```bash
git status
```

If everything was committed task-by-task, nothing should appear. If there are untracked files (e.g. accidental logs), address them before calling M1 done. Otherwise this step is a no-op and M1 is complete.

- [ ] **Step 10: Optional — push the branch for review**

```bash
git push origin feat/chat-level-prestige
```

---

## Self-Review (applied by plan author)

**1. Spec coverage vs impl-plan M1 checklist:**

| impl-plan M1 item | Task |
|---|---|
| `rename_and_recreate_chat_user_data` migration | Task 1 |
| `create_prestige_trials` migration | Task 3 |
| `create_prestige_blessings` migration | Task 4 |
| `create_user_prestige_trials` migration | Task 5 |
| `create_user_blessings` migration | Task 6 |
| `recreate_chat_exp_unit` migration | Task 2 |
| `create_chat_exp_daily` migration | Task 7 |
| `create_chat_exp_events` migration | Task 8 |
| `create_user_prestige_history` migration | Task 9 |
| `drop_chat_title_tables` migration | Task 10 |
| `prestige_trials` seed | Task 12 |
| `prestige_blessings` seed | Task 13 |
| `chat_exp_unit` seed | Task 11 |
| 9 models | Tasks 11 (ChatExpUnit), 12 (PrestigeTrial), 13 (PrestigeBlessing), 14 (ChatUserData), 15 (UserPrestigeTrial), 16 (UserBlessing), 17 (ChatExpDaily), 18 (ChatExpEvent), 19 (UserPrestigeHistory) |
| Unit tests (CRUD + seed verification) | Tasks 11–13 for pure logic; Task 20 end-to-end gate for Base wrappers |
| Exit criterion: `yarn migrate` + `yarn knex seed:run` clean | Task 20 Steps 3–6 |
| Exit criterion: `yarn test` green | Task 20 Step 7 |

All impl-plan M1 items have a home in this plan.

**2. Known deviations from impl-plan doc:**

- Seed filenames use `PascalCaseSeeder.js` (matching existing repo convention — `AdvancementSeeder.js`, `MinigameLevelSeeder.js`) rather than the snake_case names shown in the impl plan. Tables still use snake_case; only the seed filenames are PascalCase.
- No per-model CRUD integration test. Rationale: no existing test pattern for DB-backed model CRUD (see `__tests__/` directory — all model tests are pure-function). End-to-end verification in Task 20 covers the "models actually work" question via the test suite + seed run.

**3. Placeholder scan:** No `TBD` / `implement later` / `similar to Task N` in the plan. All code blocks are complete. All commands have expected outputs.

**4. Type / identifier consistency check:**
- Table names consistently snake_case across migrations, seeds, models.
- Model slug helpers (`findBySlug`) reference the same slugs that seeds write.
- `fillable` arrays in models match column lists in migrations (sanity-checked each pair).
- `cycle_days` correctly excluded from `UserPrestigeHistory` fillable (it's generated).
- `ChatUserData` fillable excludes `created_at` / `updated_at` (auto-managed by `timestamps(true, true)`).

---

## Execution Handoff

Plan complete and saved to `docs/plans/chat-level-prestige-m1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh `executor` subagent per task, reviewer between tasks, fast iteration with clean context per step.

**2. Inline Execution** — Run tasks in this session via superpowers:executing-plans, batch execution with checkpoints after Task 10 (all migrations) and Task 19 (all models).

Which approach?
