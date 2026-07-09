# Chat XP Daily Weather — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global per-day "weather" that modifies the chat-XP pipeline, is snapshotted onto every XP event, is queryable via `#今天天氣` and a REST API, and whose negative days can be neutralised by spending 女神石.

**Architecture:** A daily weather row (`chat_daily_weather`, one per UTC+8 date) is generated lazily and atomically. The XP pipeline loads it once per batch and each user's protection once per user, then applies four multiplicative effects per message through a new pure `computeEventXp`. Protection (`user_weather_protections`) is all-or-nothing for the debuff-only V1 pool: a protected debuff day is neutralised for events after purchase. Everything routes through `ChatWeatherService`; pipeline-facing math lives in pure, DB-free helpers.

**Tech Stack:** Node.js (CommonJS), Bottender, Express, Knex/MySQL, `config` package, Jest. Frontend LIFF rendering is out of scope (separate follow-up plan).

## Global Constraints

Every task implicitly includes these. Values copied verbatim from the design (`docs/plans/2026-07-09-chat-xp-daily-weather-design.md`) and verified against the codebase.

- Backend is CommonJS (`require`/`module.exports`). Style: double quotes, trailing commas `es5`, 100-char width (eslint/prettier auto-run on commit).
- **Config namespace is `chat_level.dailyWeather`** — NOT `chatXp.dailyWeather`. The repo has no `chatXp` config key; chat config lives under `chat_level.*`. This supersedes design §10.3/§13.
- Feature flags default **off**: `chat_level.dailyWeather.enabled = false`, `purchaseEnabled = false`. Disabled ⇒ pipeline treats weather as neutral, commands say "今日天氣觀測暫停".
- 女神石 = inventory `itemId 999`. **Read balance** with `require(".../model/princess/gacha").getUserGodStoneCount(userId)` → returns a plain `number`. **Debit** with `inventory.decreaseGodStone({ userId, amount, note, trx })` (appends a signed ledger row; import `const { inventory } = require(".../model/application/Inventory")`). The `inventory` table columns are camelCase.
- Transactions: `await mysql.transaction(async trx => { ... })` (`mysql = require(".../util/mysql")`), threading `trx` into every model write via `model.method(payload, trx)` → `qb(trx)`. Base model has **no** `transaction()`/`setTransaction()` (removed in df7824ec) — never store a trx on a model.
- Dates are UTC+8 `"YYYY-MM-DD"` **strings** from `todayUtc8()` (`require(".../util/date")`). Not Date objects.
- Migrations are generated with `cd app && yarn knex migrate:make <snake_name>` (never hand-name the file), then applied with `cd app && yarn migrate`. Each file exports `up(knex)`/`down(knex)`.
- Jest: the app jest config has `transform: {}`, so **`jest.mock(...)` is NOT hoisted** — it must appear before any `require()` of the mocked path. Single file: `cd app && yarn test -- <path>`.
- HTTP business errors use **400 + `{ code, message }`** (the repo has no 402/409 anywhere; it overloads 400 with a machine `code`). This supersedes design §11.3.
- V1 weather pool: **3 debuff + 3 buff**, no `mixed`. Effect fields: `cooldown_required_mult`, `raw_xp_mult`, `effective_xp_mult`, `group_bonus_mult`. No `diminish_threshold_mult` (V1.1).

---

## File Structure

**Create**
- `app/migrations/<ts>_create_chat_daily_weather.js` — one row per UTC+8 date; snapshot of that day's weather.
- `app/migrations/<ts>_create_user_weather_protections.js` — one row per user per weather date.
- `app/migrations/<ts>_add_weather_columns_to_chat_exp_events.js` — 3 nullable weather columns.
- `app/src/model/application/ChatDailyWeather.js` — model: `findByDate`, `insertIfAbsent` (atomic).
- `app/src/model/application/UserWeatherProtection.js` — model: `findByUserDate`, `createProtection`.
- `app/src/service/chatXp/weatherEffects.js` — **pure** helpers: `resolveEffectiveEffects`, `mult`, `pickWeather`, `describeEffects`.
- `app/src/service/chatXp/computeEventXp.js` — **pure** per-message XP math (extracted from pipeline, now weather-aware).
- `app/src/service/ChatWeatherService.js` — DB + orchestration: generation, status, purchase, describe.
- `app/src/controller/application/WeatherController.js` — bot command handler + two API handlers.
- Test files listed per task.

**Modify**
- `app/config/default.json` — add `chat_level.dailyWeather` block.
- `app/src/model/application/ChatExpEvent.js` — 3 new `fillable` columns + stringify `weather_effects` in `insertEvent`.
- `app/src/service/chatXp/pipeline.js` — load weather/protection, call `computeEventXp`, snapshot weather onto records.
- `app/src/app.js` — register `#今天天氣` in `OrderBased`.
- `app/src/router/api.js` — `GET /me/chat-weather/today`, `POST /me/chat-weather/protection/purchase`.

**Out of scope (follow-up frontend plan):** XP-history weather badges/chips (design §12), LIFF purchase button (design §11.2). The API from Task 8 is their contract.

---

## Task 1: Migrations (schema)

**Files:**
- Create: `app/migrations/<ts>_create_chat_daily_weather.js`
- Create: `app/migrations/<ts>_create_user_weather_protections.js`
- Create: `app/migrations/<ts>_add_weather_columns_to_chat_exp_events.js`

**Interfaces:**
- Produces: tables `chat_daily_weather` (PK `date`), `user_weather_protections` (unique `(user_id, weather_date)`), and columns `chat_exp_events.weather_key`, `.weather_effects` (json), `.weather_protected` (boolean, default false).

- [ ] **Step 1: Generate the three migration files**

```bash
cd app
yarn knex migrate:make create_chat_daily_weather
yarn knex migrate:make create_user_weather_protections
yarn knex migrate:make add_weather_columns_to_chat_exp_events
```

Each creates `app/migrations/<UTC-timestamp>_<name>.js` with empty `up`/`down`.

- [ ] **Step 2: Fill `create_chat_daily_weather`**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("chat_daily_weather", table => {
    table.date("date").primary().comment("UTC+8 date");
    table.string("weather_key", 32).notNullable();
    table.string("category", 16).notNullable().comment("buff | debuff (mixed in V1.1)");
    table.string("name", 64).notNullable().comment("display snapshot");
    table.text("flavor_text").notNullable().comment("display snapshot");
    table.json("effects").notNullable().comment("numeric effect snapshot");
    table.string("protection_type", 32).nullable();
    table.string("protection_name", 64).nullable();
    table.integer("protection_cost").unsigned().nullable().comment("女神石 cost");
    table.datetime("generated_at").notNullable();
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("chat_daily_weather");
};
```

- [ ] **Step 3: Fill `create_user_weather_protections`**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_weather_protections", table => {
    table.bigIncrements("id").primary();
    table.string("user_id", 33).notNullable();
    table.date("weather_date").notNullable().comment("UTC+8 date");
    table.string("weather_key", 32).notNullable();
    table.string("protection_type", 32).notNullable();
    table.string("protection_name", 64).notNullable();
    table.integer("stone_cost").unsigned().notNullable();
    table.datetime("purchased_at").notNullable().comment("protection starts here");
    table.timestamps(true, true);

    table.unique(["user_id", "weather_date"], "uq_user_weather_date");
    table.index(["weather_date", "weather_key"], "idx_weather_date_key");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_weather_protections");
};
```

- [ ] **Step 4: Fill `add_weather_columns_to_chat_exp_events`**

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const TABLE = "chat_exp_events";

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.string("weather_key", 32).nullable().after("permanent_mult").comment("weather snapshot");
    table
      .json("weather_effects")
      .nullable()
      .after("weather_key")
      .comment("effective effects after protection");
    table
      .boolean("weather_protected")
      .notNullable()
      .defaultTo(false)
      .after("weather_effects");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.dropColumns("weather_key", "weather_effects", "weather_protected");
  });
};
```

- [ ] **Step 5: Apply up, roll back, re-apply (verifies both directions)**

Requires local infra (`make infra`).

```bash
cd app && yarn migrate
yarn knex migrate:rollback   # drops the 3 objects via down()
yarn migrate                 # re-applies
```

Expected: `yarn migrate` prints "Batch N run: 3 migrations" the first time; rollback prints "Batch N rolled back: 3 migrations"; re-apply runs the 3 again with no error.

- [ ] **Step 6: Commit**

```bash
git add app/migrations
git commit -m "feat(chat-weather): add chat_daily_weather, user_weather_protections, event weather columns"
```

---

## Task 2: Config block + pool

**Files:**
- Modify: `app/config/default.json` (add `dailyWeather` inside the existing `chat_level` object)
- Test: `app/src/service/chatXp/__tests__/weatherConfig.test.js`

**Interfaces:**
- Produces: `config.get("chat_level.dailyWeather")` → `{ enabled, purchaseEnabled, weights:{buff,debuff}, defaultProtectionCost, pool }`. Each `pool[key]` = `{ category, name, flavorText, effects, protectionType?, protectionName?, protectionCost? }`.

- [ ] **Step 1: Write the failing test (pool integrity)**

```js
// app/src/service/chatXp/__tests__/weatherConfig.test.js
const config = require("config");

describe("chat_level.dailyWeather config", () => {
  const cfg = config.get("chat_level.dailyWeather");

  it("is present and defaults to disabled", () => {
    expect(cfg.enabled).toBe(false);
    expect(cfg.purchaseEnabled).toBe(false);
    expect(cfg.weights).toEqual({ buff: 60, debuff: 40 });
  });

  it("has 3 debuff + 3 buff weathers, only debuffs are protectable", () => {
    const pool = cfg.pool;
    const entries = Object.values(pool);
    expect(entries.filter(w => w.category === "debuff")).toHaveLength(3);
    expect(entries.filter(w => w.category === "buff")).toHaveLength(3);
    for (const w of entries) {
      expect(w.name && w.flavorText && w.effects).toBeTruthy();
      if (w.category === "debuff") expect(w.protectionType).toBeTruthy();
      if (w.category === "buff") expect(w.protectionType).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && yarn test -- src/service/chatXp/__tests__/weatherConfig.test.js`
Expected: FAIL — `Configuration property "chat_level.dailyWeather" is not defined`.

- [ ] **Step 3: Add the block to `app/config/default.json`**

Inside the existing `"chat_level": { ... }` object, add a `"dailyWeather"` sibling to `"exp"`:

```json
    "dailyWeather": {
      "enabled": false,
      "purchaseEnabled": false,
      "weights": { "buff": 60, "debuff": 40 },
      "defaultProtectionCost": 30,
      "pool": {
        "noisy_wind": {
          "category": "debuff",
          "name": "風異常的喧囂",
          "flavorText": "風聲把話語吹散，你需要花費更多力氣才讓大家聽見。",
          "effects": { "cooldown_required_mult": 1.1 },
          "protectionType": "windproof",
          "protectionName": "防風耳飾",
          "protectionCost": 30
        },
        "silent_fog": {
          "category": "debuff",
          "name": "沉默霧氣",
          "flavorText": "霧氣吞掉句尾，話語抵達時少了一點重量。",
          "effects": { "raw_xp_mult": 0.9 },
          "protectionType": "defog",
          "protectionName": "破霧鈴",
          "protectionCost": 30
        },
        "low_pressure": {
          "category": "debuff",
          "name": "魔力低壓",
          "flavorText": "空氣中的魔力變薄，聊天帶來的成長稍微遲鈍。",
          "effects": { "effective_xp_mult": 0.9 },
          "protectionType": "clearsky",
          "protectionName": "晴空護符",
          "protectionCost": 30
        },
        "mana_tailwind": {
          "category": "buff",
          "name": "魔力順風",
          "flavorText": "話語順著魔力流動，今天的交流特別順。",
          "effects": { "effective_xp_mult": 1.1 }
        },
        "clear_echo": {
          "category": "buff",
          "name": "晴空回音",
          "flavorText": "每句話都被清楚地接住。",
          "effects": { "cooldown_required_mult": 0.95 }
        },
        "bustling_square": {
          "category": "buff",
          "name": "熱鬧廣場",
          "flavorText": "人越多越熱鬧，話題被氣氛推著跑。",
          "effects": { "group_bonus_mult": 1.1 }
        }
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && yarn test -- src/service/chatXp/__tests__/weatherConfig.test.js`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add app/config/default.json app/src/service/chatXp/__tests__/weatherConfig.test.js
git commit -m "feat(chat-weather): add chat_level.dailyWeather config (flags off, 6-weather pool)"
```

---

## Task 3: Models + ChatExpEvent extension

**Files:**
- Create: `app/src/model/application/ChatDailyWeather.js`
- Create: `app/src/model/application/UserWeatherProtection.js`
- Modify: `app/src/model/application/ChatExpEvent.js`
- Test: `app/src/model/application/__tests__/weatherModels.test.js`

**Interfaces:**
- Consumes: `Base` (`app/src/model/base.js` — `create(attrs, trx)`, `first({filter}, trx)`), `mysql` (`app/src/util/mysql`).
- Produces:
  - `ChatDailyWeather.findByDate(date) → Promise<row|undefined>`
  - `ChatDailyWeather.insertIfAbsent(payload) → Promise` (INSERT IGNORE; `payload.effects` may be object or string)
  - `UserWeatherProtection.findByUserDate(userId, date) → Promise<row|undefined>`
  - `UserWeatherProtection.createProtection(payload, trx) → Promise<id>`
  - `ChatExpEvent.insertEvent(params)` now also persists `weather_key`, `weather_effects` (json), `weather_protected`.

- [ ] **Step 1: Write the failing test (real DB)**

Requires `make infra`. Follows the repo's real-DB pattern (`JankenRewardService.test.js`).

```js
// app/src/model/application/__tests__/weatherModels.test.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");

const ChatDailyWeather = require("../ChatDailyWeather");
const UserWeatherProtection = require("../UserWeatherProtection");

const DATE = "2099-01-01";
const USER = "U" + "9".repeat(32);

describe("weather models", () => {
  beforeEach(async () => {
    await mysql("user_weather_protections").where({ weather_date: DATE }).delete();
    await mysql("chat_daily_weather").where({ date: DATE }).delete();
  });
  afterAll(() => mysql.destroy());

  it("insertIfAbsent writes once and is idempotent for the same date", async () => {
    const payload = {
      date: DATE, weather_key: "noisy_wind", category: "debuff", name: "風異常的喧囂",
      flavor_text: "風聲把話語吹散。", effects: { cooldown_required_mult: 1.1 },
      protection_type: "windproof", protection_name: "防風耳飾", protection_cost: 30,
      generated_at: new Date(),
    };
    await ChatDailyWeather.insertIfAbsent(payload);
    await ChatDailyWeather.insertIfAbsent({ ...payload, weather_key: "silent_fog" });
    const rows = await mysql("chat_daily_weather").where({ date: DATE });
    expect(rows).toHaveLength(1);
    expect(rows[0].weather_key).toBe("noisy_wind"); // first write wins
    const found = await ChatDailyWeather.findByDate(DATE);
    expect(found.weather_key).toBe("noisy_wind");
  });

  it("createProtection persists a row findable by (user, date)", async () => {
    await UserWeatherProtection.createProtection({
      user_id: USER, weather_date: DATE, weather_key: "noisy_wind",
      protection_type: "windproof", protection_name: "防風耳飾",
      stone_cost: 30, purchased_at: new Date(),
    });
    const found = await UserWeatherProtection.findByUserDate(USER, DATE);
    expect(found.protection_type).toBe("windproof");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && yarn test -- src/model/application/__tests__/weatherModels.test.js`
Expected: FAIL — `Cannot find module '../ChatDailyWeather'`.

- [ ] **Step 3: Create `ChatDailyWeather.js`**

```js
const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "chat_daily_weather";
const fillable = [
  "date",
  "weather_key",
  "category",
  "name",
  "flavor_text",
  "effects",
  "protection_type",
  "protection_name",
  "protection_cost",
  "generated_at",
];

class ChatDailyWeather extends Base {}

const model = new ChatDailyWeather({ table: TABLE, fillable });

exports.model = model;

exports.findByDate = date => model.first({ filter: { date } });

/**
 * Atomic lazy-generation guard. `date` is the PK, so INSERT IGNORE lets the bot
 * and worker processes race a first-access generation without creating two rows
 * — callers re-SELECT via findByDate and use whichever row won.
 */
exports.insertIfAbsent = async payload => {
  const effects =
    typeof payload.effects === "string" ? payload.effects : JSON.stringify(payload.effects);
  return mysql.raw(
    `INSERT IGNORE INTO ${TABLE}
       (date, weather_key, category, name, flavor_text, effects,
        protection_type, protection_name, protection_cost, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.date,
      payload.weather_key,
      payload.category,
      payload.name,
      payload.flavor_text,
      effects,
      payload.protection_type ?? null,
      payload.protection_name ?? null,
      payload.protection_cost ?? null,
      payload.generated_at,
    ]
  );
};
```

- [ ] **Step 4: Create `UserWeatherProtection.js`**

```js
const Base = require("../base");

const TABLE = "user_weather_protections";
const fillable = [
  "user_id",
  "weather_date",
  "weather_key",
  "protection_type",
  "protection_name",
  "stone_cost",
  "purchased_at",
];

class UserWeatherProtection extends Base {}

const model = new UserWeatherProtection({ table: TABLE, fillable });

exports.model = model;

exports.findByUserDate = (userId, date) =>
  model.first({ filter: { user_id: userId, weather_date: date } });

exports.createProtection = (payload, trx) => model.create(payload, trx);
```

- [ ] **Step 5: Extend `ChatExpEvent.js`**

Append the 3 columns to `fillable` (otherwise `model.create`'s `pick()` silently drops them), and stringify `weather_effects` like `modifiers`.

Change `fillable` (add the last three entries):

```js
const fillable = [
  "user_id",
  "group_id",
  "ts",
  "raw_exp",
  "effective_exp",
  "cooldown_rate",
  "group_bonus",
  "modifiers",
  "base_xp",
  "blessing1_mult",
  "honeymoon_mult",
  "diminish_factor",
  "trial_mult",
  "permanent_mult",
  "weather_key",
  "weather_effects",
  "weather_protected",
];
```

Change `insertEvent`:

```js
exports.insertEvent = params => {
  const payload = { ...params };
  if (payload.modifiers && typeof payload.modifiers !== "string") {
    payload.modifiers = JSON.stringify(payload.modifiers);
  }
  if (payload.weather_effects && typeof payload.weather_effects !== "string") {
    payload.weather_effects = JSON.stringify(payload.weather_effects);
  }
  return model.create(payload);
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd app && yarn test -- src/model/application/__tests__/weatherModels.test.js`
Expected: PASS (2 passing).

- [ ] **Step 7: Commit**

```bash
git add app/src/model/application/ChatDailyWeather.js app/src/model/application/UserWeatherProtection.js app/src/model/application/ChatExpEvent.js app/src/model/application/__tests__/weatherModels.test.js
git commit -m "feat(chat-weather): weather models + chat_exp_events weather columns"
```

---

## Task 4: Pure weather helpers

**Files:**
- Create: `app/src/service/chatXp/weatherEffects.js`
- Test: `app/src/service/chatXp/__tests__/weatherEffects.test.js`

**Interfaces:**
- Produces (all pure, no I/O):
  - `resolveEffectiveEffects(weather, protection, eventTs) → { effects: object, protected: boolean }` — for the day's weather row, a user's protection row (or null), and an event epoch-ms timestamp. V1: only `category === "debuff"` weathers are protectable; protection active (`eventTs >= purchased_at`) neutralises the whole weather (`effects` → `{}`).
  - `mult(effects, field) → number` — `effects[field]` if a positive number, else `1`.
  - `pickWeather(pool, weights, avoidKey, rand=Math.random) → key` — weighted category pick then uniform pick within it, skipping `avoidKey` when the category has an alternative. `rand()` is called twice (category, then index).
  - `describeEffects(effects) → string[]` — e.g. `{ cooldown_required_mult: 1.1 }` → `["冷卻時間需求 +10%"]`.

- [ ] **Step 1: Write the failing tests**

```js
// app/src/service/chatXp/__tests__/weatherEffects.test.js
const {
  resolveEffectiveEffects,
  mult,
  pickWeather,
  describeEffects,
} = require("../weatherEffects");

// rand that yields the given values in order, then repeats the last.
const mkRand = vals => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

describe("resolveEffectiveEffects", () => {
  const debuff = { category: "debuff", effects: { cooldown_required_mult: 1.1 } };
  const buff = { category: "buff", effects: { effective_xp_mult: 1.1 } };
  const prot = { purchased_at: new Date("2026-07-09T02:00:00Z") };
  const before = new Date("2026-07-09T01:00:00Z").getTime();
  const after = new Date("2026-07-09T03:00:00Z").getTime();

  it("no weather → neutral", () => {
    expect(resolveEffectiveEffects(null, null, after)).toEqual({ effects: {}, protected: false });
  });
  it("debuff + protection + event after purchase → neutralised", () => {
    expect(resolveEffectiveEffects(debuff, prot, after)).toEqual({ effects: {}, protected: true });
  });
  it("debuff + protection + event before purchase → not protected", () => {
    expect(resolveEffectiveEffects(debuff, prot, before)).toEqual({
      effects: { cooldown_required_mult: 1.1 },
      protected: false,
    });
  });
  it("debuff + no protection → original effects", () => {
    expect(resolveEffectiveEffects(debuff, null, after).effects).toEqual({
      cooldown_required_mult: 1.1,
    });
  });
  it("buff is never protected even if a protection row exists", () => {
    expect(resolveEffectiveEffects(buff, prot, after)).toEqual({
      effects: { effective_xp_mult: 1.1 },
      protected: false,
    });
  });
});

describe("mult", () => {
  it("returns the field when a positive number", () => {
    expect(mult({ raw_xp_mult: 0.9 }, "raw_xp_mult")).toBe(0.9);
  });
  it("returns 1 for missing / non-positive / non-number", () => {
    expect(mult({}, "raw_xp_mult")).toBe(1);
    expect(mult({ raw_xp_mult: 0 }, "raw_xp_mult")).toBe(1);
    expect(mult(null, "raw_xp_mult")).toBe(1);
  });
});

describe("pickWeather", () => {
  // pool order: 3 debuff then 3 buff; weights buff:60 debuff:40 → categories ["debuff","buff"]
  const pool = {
    noisy_wind: { category: "debuff" },
    silent_fog: { category: "debuff" },
    low_pressure: { category: "debuff" },
    mana_tailwind: { category: "buff" },
    clear_echo: { category: "buff" },
    bustling_square: { category: "buff" },
  };
  const weights = { buff: 60, debuff: 40 };

  it("r<0.4 → debuff category, index picks within it", () => {
    expect(pickWeather(pool, weights, null, mkRand([0.1, 0.1]))).toBe("noisy_wind");
  });
  it("r>=0.4 → buff category", () => {
    expect(pickWeather(pool, weights, null, mkRand([0.9, 0.9]))).toBe("bustling_square");
  });
  it("skips avoidKey when the category has an alternative", () => {
    expect(pickWeather(pool, weights, "noisy_wind", mkRand([0.1, 0.1]))).toBe("silent_fog");
  });
});

describe("describeEffects", () => {
  it("formats penalty and bonus with signed percentages", () => {
    expect(describeEffects({ cooldown_required_mult: 1.1 })).toEqual(["冷卻時間需求 +10%"]);
    expect(describeEffects({ raw_xp_mult: 0.9 })).toEqual(["原始經驗 -10%"]);
  });
  it("empty effects → empty list", () => {
    expect(describeEffects({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && yarn test -- src/service/chatXp/__tests__/weatherEffects.test.js`
Expected: FAIL — `Cannot find module '../weatherEffects'`.

- [ ] **Step 3: Create `weatherEffects.js`**

```js
"use strict";

const EFFECT_IDENTITY = 1;

const EFFECT_LABELS = {
  cooldown_required_mult: "冷卻時間需求",
  raw_xp_mult: "原始經驗",
  effective_xp_mult: "最終經驗",
  group_bonus_mult: "群組加成",
};

/**
 * The effects actually applied to an event, plus whether protection was active.
 * V1: only debuff weathers are protectable, and protection neutralises the whole
 * weather (all-or-nothing) — see design §6.1.
 */
function resolveEffectiveEffects(weather, protection, eventTs) {
  if (!weather) return { effects: {}, protected: false };
  const isProtected =
    weather.category === "debuff" &&
    protection != null &&
    eventTs >= new Date(protection.purchased_at).getTime();
  return {
    effects: isProtected ? {} : weather.effects || {},
    protected: isProtected,
  };
}

function mult(effects, field) {
  const v = effects && effects[field];
  return typeof v === "number" && v > 0 ? v : EFFECT_IDENTITY;
}

/**
 * Weighted category pick, then uniform pick within the category, avoiding
 * avoidKey when the category has an alternative. rand() ∈ [0,1), called twice.
 */
function pickWeather(pool, weights, avoidKey, rand = Math.random) {
  const byCategory = {};
  for (const [key, def] of Object.entries(pool)) {
    (byCategory[def.category] = byCategory[def.category] || []).push(key);
  }
  const categories = Object.keys(byCategory).filter(c => (weights[c] || 0) > 0);
  const total = categories.reduce((s, c) => s + weights[c], 0);

  let r = rand() * total;
  let chosen = categories[categories.length - 1];
  for (const c of categories) {
    if (r < weights[c]) {
      chosen = c;
      break;
    }
    r -= weights[c];
  }

  let keys = byCategory[chosen];
  const filtered = keys.filter(k => k !== avoidKey);
  if (filtered.length > 0) keys = filtered;
  return keys[Math.floor(rand() * keys.length)];
}

function describeEffects(effects) {
  return Object.entries(effects || {}).map(([field, value]) => {
    const label = EFFECT_LABELS[field] || field;
    const pct = Math.round((value - 1) * 100);
    return `${label} ${pct >= 0 ? `+${pct}` : pct}%`;
  });
}

module.exports = { resolveEffectiveEffects, mult, pickWeather, describeEffects, EFFECT_IDENTITY };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && yarn test -- src/service/chatXp/__tests__/weatherEffects.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add app/src/service/chatXp/weatherEffects.js app/src/service/chatXp/__tests__/weatherEffects.test.js
git commit -m "feat(chat-weather): pure weather-effect helpers (resolve/pick/describe)"
```

---

## Task 5: ChatWeatherService

**Files:**
- Create: `app/src/service/ChatWeatherService.js`
- Test: `app/src/service/__tests__/ChatWeatherService.test.js`

**Interfaces:**
- Consumes: `config`, `moment`, `mysql`, `todayUtc8` (`../util/date`), `ChatDailyWeather`, `UserWeatherProtection`, `{ inventory }` (`../model/application/Inventory`), `gacha` (`../model/princess/gacha`, `getUserGodStoneCount`), `pickWeather`/`describeEffects` (`./chatXp/weatherEffects`), `DefaultLogger`.
- Produces:
  - `getWeatherForDate(date) → Promise<row|null>` (null when disabled; lazily+atomically generates; `effects` normalised to object)
  - `generateWeatherForDate(date) → Promise<void>`
  - `getUserProtection(userId, date) → Promise<row|undefined>`
  - `getTodayStatus(userId) → Promise<{ date, weather, protection, godStoneBalance }>`
  - `purchaseTodayProtection(userId, now?) → Promise<{ ok:true, protection } | { ok:false, code, ... }>` where code ∈ `DISABLED | NO_PROTECTION | ALREADY_PROTECTED | INSUFFICIENT_STONE`
  - `describeToday(userId) → Promise<string>` (the `#今天天氣` reply text)

- [ ] **Step 1: Write the failing test (real DB, config forced on)**

Requires `make infra`. Enables the feature via a `config` mock (default config has it off).

```js
// app/src/service/__tests__/ChatWeatherService.test.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");

const POOL = {
  noisy_wind: {
    category: "debuff", name: "風異常的喧囂", flavorText: "風聲把話語吹散。",
    effects: { cooldown_required_mult: 1.1 },
    protectionType: "windproof", protectionName: "防風耳飾", protectionCost: 30,
  },
  mana_tailwind: {
    category: "buff", name: "魔力順風", flavorText: "順風。",
    effects: { effective_xp_mult: 1.1 },
  },
};
const WEATHER_CFG = {
  enabled: true, purchaseEnabled: true,
  weights: { buff: 60, debuff: 40 }, defaultProtectionCost: 30, pool: POOL,
};

jest.mock("config", () => {
  const orig = jest.requireActual("config");
  return {
    get: jest.fn(key => {
      if (key === "chat_level.dailyWeather") return global.__WEATHER_CFG__;
      return orig.get(key);
    }),
  };
});

const Service = require("../ChatWeatherService");

const TODAY = require("../../util/date").todayUtc8();
const USER = "U" + "7".repeat(32);

describe("ChatWeatherService", () => {
  beforeEach(async () => {
    global.__WEATHER_CFG__ = JSON.parse(JSON.stringify(WEATHER_CFG));
    await mysql("user_weather_protections").where({ user_id: USER }).delete();
    await mysql("chat_daily_weather").where({ date: TODAY }).delete();
    await mysql("inventory").where({ userId: USER, itemId: 999 }).delete();
  });
  afterAll(() => mysql.destroy());

  it("getWeatherForDate returns null when disabled", async () => {
    global.__WEATHER_CFG__.enabled = false;
    expect(await Service.getWeatherForDate(TODAY)).toBeNull();
  });

  it("lazily generates exactly one row and is idempotent", async () => {
    const a = await Service.getWeatherForDate(TODAY);
    const b = await Service.getWeatherForDate(TODAY);
    expect(a.weather_key).toBe(b.weather_key);
    expect(typeof a.effects).toBe("object"); // normalised, not a JSON string
    const rows = await mysql("chat_daily_weather").where({ date: TODAY });
    expect(rows).toHaveLength(1);
  });

  it("purchase deducts stones and inserts protection atomically", async () => {
    // Force a debuff day by leaving only the debuff weather in the pool.
    global.__WEATHER_CFG__.pool = { noisy_wind: POOL.noisy_wind };
    await mysql("inventory").insert({ userId: USER, itemId: 999, itemAmount: 100, note: "seed" });

    const res = await Service.purchaseTodayProtection(USER);
    expect(res.ok).toBe(true);

    const prot = await mysql("user_weather_protections").where({ user_id: USER, weather_date: TODAY });
    expect(prot).toHaveLength(1);
    const bal = await require("../../model/princess/gacha").getUserGodStoneCount(USER);
    expect(bal).toBe(70); // 100 - 30
  });

  it("rejects duplicate purchase", async () => {
    global.__WEATHER_CFG__.pool = { noisy_wind: POOL.noisy_wind };
    await mysql("inventory").insert({ userId: USER, itemId: 999, itemAmount: 100, note: "seed" });
    await Service.purchaseTodayProtection(USER);
    const res = await Service.purchaseTodayProtection(USER);
    expect(res).toMatchObject({ ok: false, code: "ALREADY_PROTECTED" });
  });

  it("rejects insufficient stones (no protection row, no debit)", async () => {
    global.__WEATHER_CFG__.pool = { noisy_wind: POOL.noisy_wind };
    await mysql("inventory").insert({ userId: USER, itemId: 999, itemAmount: 10, note: "seed" });
    const res = await Service.purchaseTodayProtection(USER);
    expect(res).toMatchObject({ ok: false, code: "INSUFFICIENT_STONE" });
    const prot = await mysql("user_weather_protections").where({ user_id: USER, weather_date: TODAY });
    expect(prot).toHaveLength(0);
    const bal = await require("../../model/princess/gacha").getUserGodStoneCount(USER);
    expect(bal).toBe(10);
  });

  it("rejects purchase on a pure-buff day", async () => {
    global.__WEATHER_CFG__.pool = { mana_tailwind: POOL.mana_tailwind };
    await mysql("inventory").insert({ userId: USER, itemId: 999, itemAmount: 100, note: "seed" });
    const res = await Service.purchaseTodayProtection(USER);
    expect(res).toMatchObject({ ok: false, code: "NO_PROTECTION" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && yarn test -- src/service/__tests__/ChatWeatherService.test.js`
Expected: FAIL — `Cannot find module '../ChatWeatherService'`.

- [ ] **Step 3: Create `ChatWeatherService.js`**

```js
"use strict";

const config = require("config");
const moment = require("moment");
const mysql = require("../util/mysql");
const { todayUtc8 } = require("../util/date");
const ChatDailyWeather = require("../model/application/ChatDailyWeather");
const UserWeatherProtection = require("../model/application/UserWeatherProtection");
const { inventory } = require("../model/application/Inventory");
const gacha = require("../model/princess/gacha");
const { pickWeather, describeEffects } = require("./chatXp/weatherEffects");
const { DefaultLogger } = require("../util/Logger");

function cfg() {
  return config.get("chat_level.dailyWeather");
}

function normalize(row) {
  if (!row) return null;
  if (typeof row.effects === "string") row.effects = JSON.parse(row.effects);
  return row;
}

async function generateWeatherForDate(date) {
  const c = cfg();
  const prevDate = moment(date, "YYYY-MM-DD").subtract(1, "day").format("YYYY-MM-DD");
  const prev = await ChatDailyWeather.findByDate(prevDate);
  const key = pickWeather(c.pool, c.weights, prev && prev.weather_key);
  const def = c.pool[key];
  const isDebuff = def.category === "debuff";
  await ChatDailyWeather.insertIfAbsent({
    date,
    weather_key: key,
    category: def.category,
    name: def.name,
    flavor_text: def.flavorText,
    effects: def.effects,
    protection_type: isDebuff ? def.protectionType : null,
    protection_name: isDebuff ? def.protectionName : null,
    protection_cost: isDebuff ? def.protectionCost ?? c.defaultProtectionCost : null,
    generated_at: new Date(),
  });
  DefaultLogger.info(`[weather] ${date} -> ${key} (${def.category})`);
}

async function getWeatherForDate(date) {
  if (!cfg().enabled) return null;
  let row = await ChatDailyWeather.findByDate(date);
  if (!row) {
    await generateWeatherForDate(date);
    row = await ChatDailyWeather.findByDate(date);
  }
  return normalize(row);
}

function getUserProtection(userId, date) {
  return UserWeatherProtection.findByUserDate(userId, date);
}

async function getTodayStatus(userId) {
  const date = todayUtc8();
  const weather = await getWeatherForDate(date);
  const [protection, godStoneBalance] = await Promise.all([
    getUserProtection(userId, date),
    gacha.getUserGodStoneCount(userId),
  ]);
  return { date, weather, protection: protection || null, godStoneBalance };
}

function isDuplicate(e) {
  return e && (e.code === "ER_DUP_ENTRY" || /Duplicate entry/.test(e.message || ""));
}

async function purchaseTodayProtection(userId, now = Date.now()) {
  const c = cfg();
  if (!c.enabled || !c.purchaseEnabled) return { ok: false, code: "DISABLED" };

  const date = todayUtc8();
  const weather = await getWeatherForDate(date);
  if (!weather || !weather.protection_type) return { ok: false, code: "NO_PROTECTION" };

  const existing = await getUserProtection(userId, date);
  if (existing) return { ok: false, code: "ALREADY_PROTECTED", protection: existing };

  const cost = weather.protection_cost;
  const balance = await gacha.getUserGodStoneCount(userId);
  if (balance < cost) return { ok: false, code: "INSUFFICIENT_STONE", balance, cost };

  try {
    await mysql.transaction(async trx => {
      await inventory.decreaseGodStone({
        userId,
        amount: cost,
        note: `weather_protection:${weather.weather_key}`,
        trx,
      });
      await UserWeatherProtection.createProtection(
        {
          user_id: userId,
          weather_date: date,
          weather_key: weather.weather_key,
          protection_type: weather.protection_type,
          protection_name: weather.protection_name,
          stone_cost: cost,
          purchased_at: new Date(now),
        },
        trx
      );
    });
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, code: "ALREADY_PROTECTED" };
    throw e;
  }

  const protection = await getUserProtection(userId, date);
  return { ok: true, protection };
}

async function describeToday(userId) {
  if (!cfg().enabled) return "今日天氣觀測暫停";
  const { weather, protection, godStoneBalance } = await getTodayStatus(userId);
  if (!weather) return "今日天氣觀測暫停";

  const effectText = describeEffects(weather.effects);
  const lines = [
    `今日天氣：${weather.name}`,
    weather.flavor_text,
    "",
    `效果：${effectText.length ? effectText.join("、") : "無"}`,
  ];
  if (weather.protection_type) {
    lines.push(`防護：${weather.protection_name}（${weather.protection_cost} 女神石，今日有效）`);
    lines.push(protection ? "狀態：已防護" : `狀態：尚未防護（你有 ${godStoneBalance} 女神石）`);
  }
  return lines.join("\n");
}

module.exports = {
  getWeatherForDate,
  generateWeatherForDate,
  getUserProtection,
  getTodayStatus,
  purchaseTodayProtection,
  describeToday,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && yarn test -- src/service/__tests__/ChatWeatherService.test.js`
Expected: PASS (6 passing).

- [ ] **Step 5: Commit**

```bash
git add app/src/service/ChatWeatherService.js app/src/service/__tests__/ChatWeatherService.test.js
git commit -m "feat(chat-weather): ChatWeatherService (generate/status/purchase/describe)"
```

---

## Task 6: Pipeline integration

**Files:**
- Create: `app/src/service/chatXp/computeEventXp.js`
- Test: `app/src/service/chatXp/__tests__/computeEventXp.test.js`
- Modify: `app/src/service/chatXp/pipeline.js`

**Interfaces:**
- Consumes: `selectCooldownRate`, `computeGroupBonus`, `computePerMsgXp`, `applyDiminish`, `applyTrialAndPermanent` (existing chatXp pure fns), `mult` (Task 4), `resolveEffectiveEffects` (Task 4), `ChatWeatherService.getWeatherForDate` + `getUserProtection` (Task 5).
- Produces: `computeEventXp({ event, state, base, effects, dailyRawBefore, rawDeltaSoFar, catchupMult }) → { raw, effectiveInt, cooldownRate, groupBonus, blessing1Mult, honeymoonMult, diminishFactor, trialMult, permanentMult }`. With `effects === {}` it reproduces the current pipeline math exactly (all `mult` calls return 1).

- [ ] **Step 1: Write the failing test**

```js
// app/src/service/chatXp/__tests__/computeEventXp.test.js
const { computeEventXp } = require("../computeEventXp");

// Minimal state: no blessings, prestiged (honeymoon off), no trial/permanent.
const baseState = {
  prestige_count: 1,
  blessings: [],
  active_trial_star: null,
  rhythm_mastery: false,
  active_trial_id: null,
  permanent_xp_multiplier: 1,
};
const args = (over = {}) => ({
  event: { timeSinceLastMsg: 10000, groupCount: 1 }, // >6s gap → cooldownRate 1.0
  state: baseState,
  base: 90,
  effects: {},
  dailyRawBefore: 0,
  rawDeltaSoFar: 0,
  catchupMult: 1,
  ...over,
});

describe("computeEventXp", () => {
  it("neutral effects reproduce baseline (cooldownRate 1.0 for a long gap)", () => {
    const r = computeEventXp(args());
    expect(r.cooldownRate).toBe(1.0);
    expect(r.raw).toBeGreaterThan(0);
    expect(r.effectiveInt).toBe(Math.round(r.raw)); // no diminish yet, no other mults
  });

  it("effective_xp_mult scales final effective XP", () => {
    const neutral = computeEventXp(args());
    const boosted = computeEventXp(args({ effects: { effective_xp_mult: 1.1 } }));
    expect(boosted.effectiveInt).toBe(Math.round(neutral.raw * 1.1));
  });

  it("raw_xp_mult scales raw XP", () => {
    const neutral = computeEventXp(args());
    const reduced = computeEventXp(args({ effects: { raw_xp_mult: 0.9 } }));
    expect(reduced.raw).toBeCloseTo(neutral.raw * 0.9, 5);
  });

  it("cooldown_required_mult>1 lengthens the window: a 5s gap drops below full rate", () => {
    // 5000ms < 6000 (t4_6) but >4000 (t2_4) → baseline rate 0.8 without weather.
    const neutral = computeEventXp(args({ event: { timeSinceLastMsg: 5000, groupCount: 1 } }));
    // /1.1 → 4545ms, still in the 0.8 tier here; use a gap that crosses a boundary:
    // 4200ms neutral → 0.8 tier; /1.1 = 3818ms → 0.5 tier (t2_4=4000). Lower rate ⇒ less raw.
    const n2 = computeEventXp(args({ event: { timeSinceLastMsg: 4200, groupCount: 1 } }));
    const w2 = computeEventXp(
      args({ event: { timeSinceLastMsg: 4200, groupCount: 1 }, effects: { cooldown_required_mult: 1.1 } })
    );
    expect(w2.cooldownRate).toBeLessThan(n2.cooldownRate);
    expect(neutral.cooldownRate).toBeGreaterThan(0); // sanity
  });

  it("null timeSinceLastMsg stays null (no NaN) → cooldownRate 1.0", () => {
    const r = computeEventXp(args({ event: { timeSinceLastMsg: null, groupCount: 1 }, effects: { cooldown_required_mult: 1.1 } }));
    expect(r.cooldownRate).toBe(1.0);
    expect(Number.isNaN(r.raw)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && yarn test -- src/service/chatXp/__tests__/computeEventXp.test.js`
Expected: FAIL — `Cannot find module '../computeEventXp'`.

- [ ] **Step 3: Create `computeEventXp.js`** (verbatim lift of the pipeline inner-loop math + weather `mult`s)

```js
"use strict";

const { selectCooldownRate } = require("./cooldownTable");
const { computeGroupBonus } = require("./groupBonus");
const { computePerMsgXp } = require("./perMsgXp");
const { applyDiminish } = require("./diminishTier");
const { applyTrialAndPermanent } = require("./trialAndPermanent");
const { mult } = require("./weatherEffects");

/**
 * Pure per-message XP computation. `effects` is the effective weather effect map
 * ({} = neutral, reproduces pre-weather behaviour). `dailyRawBefore` + `rawDeltaSoFar`
 * feed the diminish-tier cursor; `catchupMult` is the per-batch catch-up scalar.
 */
function computeEventXp({ event, state, base, effects, dailyRawBefore, rawDeltaSoFar, catchupMult }) {
  const cdMult = mult(effects, "cooldown_required_mult");
  const adjustedTime =
    event.timeSinceLastMsg == null ? event.timeSinceLastMsg : event.timeSinceLastMsg / cdMult;
  const cooldownRate = selectCooldownRate(adjustedTime, state);

  const groupBonus = computeGroupBonus(event.groupCount, state) * mult(effects, "group_bonus_mult");

  const { raw: rawBase, blessing1Mult } = computePerMsgXp({
    base,
    cooldownRate,
    groupBonus,
    status: state,
  });
  const raw = rawBase * mult(effects, "raw_xp_mult");

  const honeymoonMult = state.prestige_count === 0 ? 1.2 : 1.0;
  const scaledIncoming = raw * honeymoonMult;
  const scaledBefore = (dailyRawBefore + rawDeltaSoFar) * honeymoonMult;
  const { result: afterDiminish, factor: diminishFactor } = applyDiminish(
    scaledIncoming,
    scaledBefore,
    state
  );
  const {
    result: afterTrialPermanent,
    trialMult,
    permanentMult,
  } = applyTrialAndPermanent(afterDiminish, state);

  const finalEffective = afterTrialPermanent * catchupMult * mult(effects, "effective_xp_mult");
  const effectiveInt = Math.max(0, Math.round(finalEffective));

  return {
    raw,
    effectiveInt,
    cooldownRate,
    groupBonus,
    blessing1Mult,
    honeymoonMult,
    diminishFactor,
    trialMult,
    permanentMult,
  };
}

module.exports = { computeEventXp };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && yarn test -- src/service/chatXp/__tests__/computeEventXp.test.js`
Expected: PASS (5 passing).

- [ ] **Step 5: Rewire `pipeline.js` to use weather + `computeEventXp`**

Add imports near the other chatXp requires (after line 22):

```js
const { computeEventXp } = require("./computeEventXp");
const { resolveEffectiveEffects } = require("./weatherEffects");
const ChatWeatherService = require("../ChatWeatherService");
```

In `processBatch`, after `const today = todayUtc8();`, load the day's weather once and thread it into `ctx`:

```js
  const today = todayUtc8();
  const weather = await ChatWeatherService.getWeatherForDate(today);

  const byUser = groupByUser(events);
  for (const [userId, userEvents] of byUser) {
    userEvents.sort((a, b) => a.ts - b.ts);
    await processUserEvents(userId, userEvents, { base, expUnitRows, today, weather });
  }
```

In `processUserEvents`, load the user's protection once (only when there is weather), then replace the inner-loop math. Add after `const catchupMult = ...`:

```js
  const protection = ctx.weather
    ? await ChatWeatherService.getUserProtection(userId, ctx.today)
    : null;
```

Replace the whole body of the `for (const event of events) { ... }` loop with:

```js
  for (const event of events) {
    const { effects: wEffects, protected: wProtected } = resolveEffectiveEffects(
      ctx.weather,
      protection,
      event.ts
    );

    const {
      raw,
      effectiveInt,
      cooldownRate,
      groupBonus,
      blessing1Mult,
      honeymoonMult,
      diminishFactor,
      trialMult,
      permanentMult,
    } = computeEventXp({
      event,
      state,
      base: ctx.base,
      effects: wEffects,
      dailyRawBefore,
      rawDeltaSoFar: rawDelta,
      catchupMult,
    });

    rawDelta += raw;
    effectiveDelta += effectiveInt;
    msgCount += 1;

    eventRecords.push({
      user_id: userId,
      group_id: event.groupId,
      ts: new Date(event.ts),
      raw_exp: raw,
      effective_exp: effectiveInt,
      cooldown_rate: cooldownRate,
      group_bonus: groupBonus,
      base_xp: ctx.base,
      blessing1_mult: blessing1Mult,
      honeymoon_mult: honeymoonMult,
      diminish_factor: diminishFactor,
      trial_mult: trialMult,
      permanent_mult: permanentMult,
      weather_key: ctx.weather ? ctx.weather.weather_key : null,
      weather_effects: ctx.weather ? wEffects : null,
      weather_protected: wProtected,
      modifiers: {
        honeymoon: state.prestige_count === 0,
        active_trial_id: state.active_trial_id,
        active_trial_star: state.active_trial_star,
        blessings: state.blessings,
        permanent_xp_multiplier: state.permanent_xp_multiplier,
        catchup_mult: catchupMult,
        weather: ctx.weather
          ? {
              key: ctx.weather.weather_key,
              name: ctx.weather.name,
              category: ctx.weather.category,
              effects: ctx.weather.effects,
              protected: wProtected,
              protection_type: ctx.weather.protection_type,
              protection_name: ctx.weather.protection_name,
            }
          : undefined,
      },
    });
  }
```

(This deletes the old inline `selectCooldownRate`/`computeGroupBonus`/`computePerMsgXp`/`applyDiminish`/`applyTrialAndPermanent` calls in the loop — they now live in `computeEventXp`. The imports of those five at the top of `pipeline.js` can stay or be removed; if removed, ensure nothing else in the file uses them — currently nothing does.)

- [ ] **Step 6: Verify the existing pipeline still runs (neutral path unchanged)**

Run the full chatXp suite; with `enabled=false` (default config) `getWeatherForDate` returns null and the loop is byte-for-byte equivalent to before.

Run: `cd app && yarn test -- src/service/chatXp`
Expected: PASS. `computeEventXp.test.js` + `weatherEffects.test.js` + `weatherConfig.test.js` all green; no regressions.

- [ ] **Step 7: Add a real-DB snapshot test for the pipeline**

Confirms weather is loaded, applied, and snapshotted onto `chat_exp_events`. Requires `make infra`. Mocks only config (enable + pool), the base-rate redis read, and the notification side-effects.

```js
// app/src/service/chatXp/__tests__/pipeline.weather.test.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");

const WEATHER_CFG = {
  enabled: true, purchaseEnabled: true, weights: { debuff: 100 }, defaultProtectionCost: 30,
  pool: {
    noisy_wind: {
      category: "debuff", name: "風異常的喧囂", flavorText: "風。",
      effects: { effective_xp_mult: 0.9 },
      protectionType: "windproof", protectionName: "防風耳飾", protectionCost: 30,
    },
  },
};
jest.mock("config", () => {
  const orig = jest.requireActual("config");
  return { get: jest.fn(k => (k === "chat_level.dailyWeather" ? WEATHER_CFG : orig.get(k))) };
});
// base rate: force redis miss so config default (90) is used
jest.mock("../../../util/redis", () => ({ get: jest.fn().mockResolvedValue(null) }));
// silence level-up notifications
jest.mock("../../../util/broadcastQueue", () => ({ pushEvent: jest.fn().mockResolvedValue() }));

const { todayUtc8 } = require("../../../util/date");
const { processBatch } = require("../pipeline");

const TODAY = todayUtc8();
const USER = "U" + "6".repeat(32);
const GROUP = "C" + "6".repeat(32);

describe("pipeline weather snapshot", () => {
  beforeEach(async () => {
    await Promise.all([
      mysql("chat_exp_events").where({ user_id: USER }).delete(),
      mysql("chat_exp_daily").where({ user_id: USER }).delete(),
      mysql("chat_user_data").where({ user_id: USER }).delete(),
      mysql("chat_daily_weather").where({ date: TODAY }).delete(),
      mysql("user_weather_protections").where({ user_id: USER }).delete(),
    ]);
  });
  afterAll(() => mysql.destroy());

  it("applies today's weather and snapshots it onto the event row", async () => {
    await processBatch([
      { userId: USER, groupId: GROUP, ts: Date.now(), timeSinceLastMsg: 10000, groupCount: 1 },
    ]);

    const rows = await mysql("chat_exp_events").where({ user_id: USER });
    expect(rows).toHaveLength(1);
    expect(rows[0].weather_key).toBe("noisy_wind");
    expect(rows[0].weather_protected).toBe(0); // no protection bought
    const mods = typeof rows[0].modifiers === "string" ? JSON.parse(rows[0].modifiers) : rows[0].modifiers;
    expect(mods.weather.key).toBe("noisy_wind");
    expect(mods.weather.protected).toBe(false);
  });
});
```

- [ ] **Step 8: Run the snapshot test**

Run: `cd app && yarn test -- src/service/chatXp/__tests__/pipeline.weather.test.js`
Expected: PASS (1 passing).

- [ ] **Step 9: Commit**

```bash
git add app/src/service/chatXp/computeEventXp.js app/src/service/chatXp/pipeline.js app/src/service/chatXp/__tests__/computeEventXp.test.js app/src/service/chatXp/__tests__/pipeline.weather.test.js
git commit -m "feat(chat-weather): apply daily weather in XP pipeline + snapshot onto events"
```

---

## Task 7: Bot command `#今天天氣`

**Files:**
- Create: `app/src/controller/application/WeatherController.js`
- Modify: `app/src/app.js`
- Test: `app/src/controller/application/__tests__/WeatherController.test.js`

**Interfaces:**
- Consumes: `ChatWeatherService.describeToday(userId)` (Task 5).
- Produces: `WeatherController.showToday(context)` — replies the description text; falls back to "獲取失敗，無法辨識用戶" when no `userId`.

- [ ] **Step 1: Write the failing test (mock the service)**

```js
// app/src/controller/application/__tests__/WeatherController.test.js
jest.mock("../../../service/ChatWeatherService", () => ({
  describeToday: jest.fn(),
}));

const WeatherService = require("../../../service/ChatWeatherService");
const WeatherController = require("../WeatherController");

const makeContext = (userId = "U" + "a".repeat(32)) => ({
  event: { source: { userId } },
  replyText: jest.fn().mockResolvedValue({}),
});

beforeEach(() => jest.clearAllMocks());

describe("WeatherController.showToday", () => {
  it("replies the weather description", async () => {
    WeatherService.describeToday.mockResolvedValue("今日天氣：晴空回音");
    const context = makeContext();
    await WeatherController.showToday(context);
    expect(WeatherService.describeToday).toHaveBeenCalledWith(context.event.source.userId);
    expect(context.replyText).toHaveBeenCalledWith("今日天氣：晴空回音");
  });

  it("rejects when there is no userId", async () => {
    const context = makeContext(undefined);
    await WeatherController.showToday(context);
    expect(context.replyText).toHaveBeenCalledWith("獲取失敗，無法辨識用戶");
    expect(WeatherService.describeToday).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && yarn test -- src/controller/application/__tests__/WeatherController.test.js`
Expected: FAIL — `Cannot find module '../WeatherController'`.

- [ ] **Step 3: Create `WeatherController.js`**

```js
const WeatherService = require("../../service/ChatWeatherService");

exports.showToday = async context => {
  const { userId } = context.event.source;
  if (!userId) {
    return context.replyText("獲取失敗，無法辨識用戶");
  }
  const text = await WeatherService.describeToday(userId);
  return context.replyText(text);
};
```

- [ ] **Step 4: Register the command in `app.js`**

Add the import next to the other controller imports (near `app/src/app.js:20`):

```js
const WeatherController = require("./controller/application/WeatherController");
```

Add the matcher inside the `router([ ... ])` array in `OrderBased`, alongside the other `text(...)` entries (e.g. right after the `經驗歷程` line):

```js
    text(/^[#!！]今天天氣$/, WeatherController.showToday),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && yarn test -- src/controller/application/__tests__/WeatherController.test.js`
Expected: PASS (2 passing).

- [ ] **Step 6: Lint (app.js edit touches the hot chain)**

Run: `cd app && yarn lint`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/controller/application/WeatherController.js app/src/app.js app/src/controller/application/__tests__/WeatherController.test.js
git commit -m "feat(chat-weather): #今天天氣 command"
```

---

## Task 8: REST API

**Files:**
- Modify: `app/src/controller/application/WeatherController.js` (add API handlers)
- Modify: `app/src/router/api.js`
- Test: `app/src/controller/application/__tests__/WeatherController.api.test.js`

**Interfaces:**
- Consumes: `ChatWeatherService.getTodayStatus(userId)`, `ChatWeatherService.purchaseTodayProtection(userId)` (Task 5); `verifyToken` (sets `req.profile.userId`).
- Produces:
  - `WeatherController.apiGetToday(req, res)` → `200 { date, weather, protection, god_stone_balance }`
  - `WeatherController.apiPurchase(req, res)` → `200 { ok:true, protection }` or `400 { code, message }` (code ∈ NO_PROTECTION / ALREADY_PROTECTED / INSUFFICIENT_STONE / DISABLED)
  - Routes: `GET /api/me/chat-weather/today`, `POST /api/me/chat-weather/protection/purchase` (both behind `verifyToken`).

- [ ] **Step 1: Write the failing test (mock service, fake req/res)**

```js
// app/src/controller/application/__tests__/WeatherController.api.test.js
jest.mock("../../../service/ChatWeatherService", () => ({
  getTodayStatus: jest.fn(),
  purchaseTodayProtection: jest.fn(),
}));

const WeatherService = require("../../../service/ChatWeatherService");
const WeatherController = require("../WeatherController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const req = { profile: { userId: "U" + "a".repeat(32) } };

beforeEach(() => jest.clearAllMocks());

describe("apiGetToday", () => {
  it("returns status with snake_case balance key", async () => {
    WeatherService.getTodayStatus.mockResolvedValue({
      date: "2026-07-09", weather: { weather_key: "noisy_wind" }, protection: null, godStoneBalance: 860,
    });
    const res = makeRes();
    await WeatherController.apiGetToday(req, res);
    expect(res.json).toHaveBeenCalledWith({
      date: "2026-07-09",
      weather: { weather_key: "noisy_wind" },
      protection: null,
      god_stone_balance: 860,
    });
  });
});

describe("apiPurchase", () => {
  it("200 on success", async () => {
    WeatherService.purchaseTodayProtection.mockResolvedValue({ ok: true, protection: { id: 1 } });
    const res = makeRes();
    await WeatherController.apiPurchase(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, protection: { id: 1 } });
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    ["NO_PROTECTION"],
    ["ALREADY_PROTECTED"],
    ["INSUFFICIENT_STONE"],
    ["DISABLED"],
  ])("400 + code on %s", async code => {
    WeatherService.purchaseTodayProtection.mockResolvedValue({ ok: false, code });
    const res = makeRes();
    await WeatherController.apiPurchase(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && yarn test -- src/controller/application/__tests__/WeatherController.api.test.js`
Expected: FAIL — `WeatherController.apiGetToday is not a function`.

- [ ] **Step 3: Add the API handlers to `WeatherController.js`**

Append:

```js
// API: GET /api/me/chat-weather/today
exports.apiGetToday = async (req, res) => {
  try {
    const { userId } = req.profile;
    const status = await WeatherService.getTodayStatus(userId);
    res.json({
      date: status.date,
      weather: status.weather,
      protection: status.protection,
      god_stone_balance: status.godStoneBalance,
    });
  } catch (e) {
    console.error("[chat-weather/today]", e);
    res.status(500).json({ error: "internal_error" });
  }
};

const PURCHASE_MESSAGES = {
  DISABLED: "今日無法購買防護",
  NO_PROTECTION: "今日天氣沒有可購買的防護",
  ALREADY_PROTECTED: "你今天已經購買防護了",
  INSUFFICIENT_STONE: "女神石不足",
};

// API: POST /api/me/chat-weather/protection/purchase
exports.apiPurchase = async (req, res) => {
  try {
    const { userId } = req.profile;
    const result = await WeatherService.purchaseTodayProtection(userId);
    if (result.ok) {
      return res.json({ ok: true, protection: result.protection });
    }
    return res.status(400).json({
      code: result.code,
      message: PURCHASE_MESSAGES[result.code] || "購買失敗",
    });
  } catch (e) {
    console.error("[chat-weather/purchase]", e);
    res.status(500).json({ error: "internal_error" });
  }
};
```

- [ ] **Step 4: Wire the routes in `api.js`**

Add the import near the top of `app/src/router/api.js` (with the other controller requires):

```js
const WeatherController = require("../controller/application/WeatherController");
```

Add the routes near the other `/me/*` routes (after `/me/xp-events`):

```js
router.get("/me/chat-weather/today", verifyToken, WeatherController.apiGetToday);
router.post("/me/chat-weather/protection/purchase", verifyToken, WeatherController.apiPurchase);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && yarn test -- src/controller/application/__tests__/WeatherController.api.test.js`
Expected: PASS (6 passing).

- [ ] **Step 6: Lint**

Run: `cd app && yarn lint`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/controller/application/WeatherController.js app/src/router/api.js app/src/controller/application/__tests__/WeatherController.api.test.js
git commit -m "feat(chat-weather): read-only today API + protection purchase endpoint"
```

---

## Task 9: Full-suite gate + doc sync

**Files:**
- Modify: `docs/plans/2026-07-09-chat-xp-daily-weather-design.md` (align config namespace + status codes to what shipped)

- [ ] **Step 1: Run the whole app test suite**

Run: `cd app && yarn test`
Expected: PASS. No regressions in existing suites; all new weather tests green.

- [ ] **Step 2: Sync the design doc to the implementation**

In `§10.3` and `§13`, replace `chatXp.dailyWeather` with `chat_level.dailyWeather`. In `§11.3`, note that the purchase endpoint returns `400 { code }` (`NO_PROTECTION` / `INSUFFICIENT_STONE` / `ALREADY_PROTECTED` / `DISABLED`) instead of `400/402/409`, matching the repo convention.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/2026-07-09-chat-xp-daily-weather-design.md
git commit -m "docs(chat-weather): sync design doc to shipped config namespace + status codes"
```

---

## Rollout (post-merge, per design §15)

Ship with flags **off**. Then, in staging: flip `enabled=true` (pipeline still writes neutral until a weather row is generated on first message of the day), observe `chat_daily_weather` + `chat_exp_events.weather_*`; then flip `purchaseEnabled=true`. In prod, watch the first 7 days of XP distribution and protection purchases before widening the pool (add `mixed` / `diminish_threshold_mult` in V1.1). Rollback = set `enabled=false` (neutralises the pipeline); never delete historical `chat_daily_weather` rows (XP history depends on them).

---

## Self-Review

**1. Spec coverage** (design §16 acceptance criteria):
- `#今天天氣` shows weather/flavor/effects/protection state → Task 7 (`describeToday`, Task 5).
- Pipeline applies today's weather when enabled → Task 6.
- Weather snapshotted into `chat_exp_events` → Task 6 (columns + `modifiers.weather`).
- XP-history badges/chips → **out of scope** (frontend follow-up); backend contract (columns + API) is delivered by Tasks 3/6/8.
- Buy protection when debuff → Task 5 + Task 8.
- Deducts configured 女神石 → Task 5 (`decreaseGodStone`, tested).
- Protection cancels only negatives, only future events → Task 4 (`resolveEffectiveEffects`) + Task 6.
- Pure buff never asks to buy → Task 5 (`NO_PROTECTION`) + `describeToday` omits protection lines.
- Existing pipeline tests pass → Task 6 Step 6 (neutral path is behaviour-preserving).

**2. Placeholder scan:** No `TODO`/`later`/"handle edge cases"/"similar to Task N". Every code step shows complete code; every test step shows the assertions.

**3. Type consistency:** `getTodayStatus` returns `{ date, weather, protection, godStoneBalance }` (camelCase internally) and the API maps `godStoneBalance → god_stone_balance` (Task 5 ↔ Task 8 checked). `resolveEffectiveEffects` returns `{ effects, protected }`, consumed by `computeEventXp({ effects })` and by pipeline's record builder (`wProtected`) — names match across Tasks 4/6. `insertIfAbsent`/`createProtection`/`findByDate`/`findByUserDate` names match between Task 3 (definition) and Task 5 (use). `purchaseTodayProtection` codes (`DISABLED`/`NO_PROTECTION`/`ALREADY_PROTECTED`/`INSUFFICIENT_STONE`) match between Task 5 (produce) and Task 8 (`PURCHASE_MESSAGES`, test).

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
