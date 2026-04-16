---
name: add-achievement
description: Guide for adding new achievements to the achievement system. Use this skill whenever the user mentions adding, creating, or defining new achievements, unlock conditions, or achievement categories. Also applies when discussing new event types that should trigger achievement progress.
---

# Add Achievement to the System

This project has a fully built achievement engine with event-driven evaluation, progress tracking, and automatic unlock + reward distribution. Adding a new achievement touches 2-4 files depending on scope.

## Architecture Overview

```
Business Logic (e.g. GachaController)
  → AchievementEngine.evaluate(userId, eventType, context)
    → EVENT_ACHIEVEMENT_MAP[eventType] → list of achievement keys to check
      → ACHIEVEMENT_STRATEGY[key] → calculate new progress value
        → if progress >= target_value → unlock + reward stones
```

Key files:
- `app/src/service/AchievementEngine.js` — Event mapping, strategies, evaluate/unlock logic
- `app/migrations/` — Achievement definitions (seed data)
- `frontend/src/pages/Achievement/index.jsx` — Icon mapping (optional)

## Step-by-Step: Adding a New Achievement

### Step 1: Create a migration for the achievement definition

Use `yarn knex migrate:make` to create the migration file (never write migration files manually):

```bash
cd app && yarn knex migrate:make add_achievement_<key>
```

The migration inserts into the `achievements` table:

```js
exports.up = async function (knex) {
  // Look up the category ID
  const category = await knex("achievement_categories").where({ key: "<category_key>" }).first();

  await knex("achievements").insert({
    category_id: category.id,
    key: "<unique_key>",           // e.g. "purchase_monthly_card"
    name: "<display_name>",        // e.g. "月卡支持者"
    description: "<description>",  // e.g. "購買月卡"
    icon: "<emoji>",               // e.g. "💳"
    type: "<type>",                // milestone | hidden | challenge | social
    rarity: <0-3>,                 // 0=普通, 1=稀有, 2=史詩, 3=傳說
    target_value: <number>,        // how many times / what threshold to unlock
    reward_stones: <number>,       // goddess stones reward
    order: <number>,               // display order within category
  });
};

exports.down = async function (knex) {
  await knex("achievements").where({ key: "<unique_key>" }).delete();
};
```

If a new **category** is needed (rare), also insert into `achievement_categories`:
```js
await knex("achievement_categories").insert({
  key: "<key>", name: "<name>", icon: "<emoji>", order: <number>
});
```

Existing categories: `chat`, `gacha`, `janken`, `world_boss`, `social`

### Step 2: Register the event mapping in AchievementEngine.js

In `EVENT_ACHIEVEMENT_MAP`, either add the achievement key to an existing event type, or create a new event type:

```js
const EVENT_ACHIEVEMENT_MAP = {
  // ... existing mappings ...
  purchase: ["purchase_monthly_card"],  // new event type
};
```

### Step 3: Define the progress strategy

In `ACHIEVEMENT_STRATEGY`, define how progress is calculated. Choose from built-in strategies:

| Strategy | Use When | Example |
|----------|----------|---------|
| `instant` | One-time trigger, immediately unlocks | First purchase, first kill |
| `increment` | Count occurrences | Buy N times, win N matches |
| `contextValue` | Progress comes from external data | Level reached, unique count |
| `threshold` | Context value must exceed a minimum | Score >= 100 in one game |
| `timeWindow` | Must happen during specific hours | Action between 3-4 AM |

```js
const ACHIEVEMENT_STRATEGY = {
  // ... existing strategies ...
  purchase_monthly_card: (cv, a) => STRATEGIES.instant(cv, a),
};
```

For custom logic, write a plain function:
```js
  some_complex_achievement: (cv, a, ctx) => {
    // Custom calculation, return new progress value
    return ctx.someCondition ? a.target_value : cv;
  },
```

### Step 4: Call evaluate() from business logic

In the relevant controller or service, add the fire-and-forget call:

```js
const AchievementEngine = require("../service/AchievementEngine");

// After the action completes:
AchievementEngine.evaluate(userId, "purchase", { /* optional context */ });
```

The `context` object passes extra data that strategies might need (e.g. `{ streak: 5 }`, `{ level: 10 }`, `{ uniqueCount: 50 }`).

**evaluate() is fire-and-forget** — it catches all errors internally and logs them. It won't break the calling feature if something goes wrong.

### Step 5 (Optional): Add frontend icon

In `frontend/src/pages/Achievement/index.jsx`, add to `ACHIEVEMENT_ICONS`:

```js
const ACHIEVEMENT_ICONS = {
  // ... existing ...
  purchase_monthly_card: ShoppingCartIcon,  // import from @mui/icons-material
};
```

If a new category was created, also add to `CATEGORY_ICONS`.

If no icon is mapped, the system falls back to the category icon, then to `LockIcon`.

### Step 6 (Optional): Batch evaluation

If the achievement can be retroactively checked for existing users (e.g. "registered 30+ days ago"), add batch logic in `batchEvaluate()` in `AchievementEngine.js`. This runs as a cron job.

## Achievement Types Reference

| Type | Behavior | Example |
|------|----------|---------|
| `milestone` | Visible progress, straightforward goal | "Send 100 messages" |
| `hidden` | Name/description hidden until unlocked | "Trigger easter egg" |
| `challenge` | Visible but harder to achieve | "Win 10 in a row" |
| `social` | Involves interaction with others | "Be challenged by 10 users" |

## Rarity Reference

| Value | Name | Typical reward_stones |
|-------|------|----------------------|
| 0 | 普通 | 30-50 |
| 1 | 稀有 | 150-200 |
| 2 | 史詩 | 300-500 |
| 3 | 傳說 | 300+ |

## Tracked Sets (for unique-count achievements)

For achievements that track unique items (e.g. "chat in 5 different groups"), use the `"tracked_groups"` or `"tracked_features"` strategy pattern, which stores a set in Redis:

```js
// In ACHIEVEMENT_STRATEGY:
my_unique_achievement: "tracked_groups",  // or "tracked_features"

// The context must include the item to track:
AchievementEngine.evaluate(userId, "some_event", { groupId: "..." });
// or
AchievementEngine.evaluate(userId, "some_event", { feature: "gacha" });
```

If you need a new tracked set type, model it after `handleTrackedSet()` in AchievementEngine.js.

## Checklist

Before finishing, verify:
- [ ] Migration created via `yarn knex migrate:make` (not manually)
- [ ] Achievement key is unique across all achievements
- [ ] Event type added to `EVENT_ACHIEVEMENT_MAP`
- [ ] Strategy defined in `ACHIEVEMENT_STRATEGY`
- [ ] `evaluate()` called from the relevant business logic
- [ ] Migration runs cleanly: `cd app && yarn migrate`
- [ ] (Optional) Frontend icon mapped
- [ ] (Optional) Batch evaluation added if retroactive check is needed
