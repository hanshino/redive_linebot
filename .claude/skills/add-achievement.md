---
name: add-achievement
description: Guide for adding new achievements to the achievement system. Use this skill whenever the user mentions adding, creating, or defining new achievements, unlock conditions, achievement categories, mention-based triggers, or unlock notifications. Also applies when discussing new event types that should trigger achievement progress, or when configuring a reply message to be sent back to chat on unlock.
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

    // --- Optional: condition JSON for strategies that need per-achievement config
    //     (mention_keyword is the primary user). Omit if strategy doesn't read it.
    condition: JSON.stringify({ /* strategy-specific shape */ }),

    // --- Optional: send a chat reply when this achievement unlocks
    notify_on_unlock: true,              // default false → silent unlock (logs only)
    notify_message: "<template or null>" // null → use default template
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
| `mentionKeyword` | @mention a target userId, optionally with keywords | Greet an admin; touch a specific god |

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

## Mention-Keyword Achievements (event type: `mention_keyword`)

A data-driven trigger that fires when a user sends a text message that @mentions one or more target userIds, optionally also containing specific keywords. Useful for easter-egg achievements like "greet an admin", "touch a specific god", etc.

**Key property**: the trigger logic is generic. All per-achievement data lives in the `condition` JSON column — so a new mention-keyword achievement is just a migration + two lines in `AchievementEngine.js`. No business-logic wiring needed: `statistics.js` already dispatches `mention_keyword` for every text message containing `mention.mentionees`.

### Condition schema

```json
{
  "targetUserIds": ["U123...", "U456..."],  // ALL must be @mentioned
  "keywords": ["謝謝", "感謝"]               // ALL must appear as substrings. May be empty.
}
```

Semantics:
- `targetUserIds` is **required**. Empty → never unlocks.
- `keywords` is **optional**. Empty array (`[]`) means "mention-only trigger" — the achievement fires on any message that @mentions all target userIds, regardless of text content.
- Both lists use all-must-match (AND) semantics, not any-match.

### When to use empty keywords

Use mention-only triggers (`keywords: []`) when:
- The target userId is rarely @mentioned (e.g. a niche persona), so the trigger threshold is naturally low.
- You want the achievement to feel serendipitous — the user doesn't need to know what to say.

Avoid empty keywords when the target userId is a frequently-mentioned admin/active user — the achievement will fire on almost any interaction and feel cheap. In that case, gate it with 1–2 keywords.

**Cost of empty keywords**: none beyond the existing dispatch. Once a user unlocks the achievement, `evaluate()` short-circuits on the already-unlocked check before running the strategy, so there's no repeated computation — just one indexed DB lookup per @mention event from that user.

### Example migration (keyword-gated)

```js
await knex("achievements").insert({
  category_id: category.id,
  key: "mention_admin_hi",
  name: "來自鬆餅的祝福",
  description: "與管理員打招呼",
  icon: "🥞",
  type: "hidden",
  rarity: 2,
  target_value: 1,
  reward_stones: 100,
  order: 99,
  condition: JSON.stringify({
    targetUserIds: ["U41b31c07a3279ca64355d2de43101b3d"],
    keywords: ["鬆餅", "祝福"],
  }),
  notify_on_unlock: true,
  notify_message: "恭喜你加入鬆餅教(((o(*ﾟ▽ﾟ*)o)))\n已解鎖隱藏成就：{icon} {name}",
});
```

### Example migration (mention-only, no keywords)

```js
await knex("achievements").insert({
  category_id: category.id,
  key: "mention_memory_seeker",
  name: "追尋神祇回憶的人",
  description: "觸碰到了布丁古神的意識",
  icon: "🍮",
  type: "hidden",
  rarity: 2,
  target_value: 1,
  reward_stones: 100,
  order: 100,
  condition: JSON.stringify({
    targetUserIds: ["U80ca6f24809c9a00981562b771fb6b84"],
    keywords: [],  // ← empty: fires on any mention of the target userId
  }),
  notify_on_unlock: true,
  notify_message:
    "你觸摸到了布丁古神，古老的符文緩緩浮現……\n「穿越時光的旅人啊，神祇向你致意」\n已解鎖隱藏成就：{icon} {name}",
});
```

### Engine wiring (two one-liners)

```js
// 1. Add the key to the mention_keyword event map
EVENT_ACHIEVEMENT_MAP.mention_keyword = ["mention_admin_hi", "mention_memory_seeker"];

// 2. Wire the strategy (reuse STRATEGIES.mentionKeyword)
ACHIEVEMENT_STRATEGY.mention_memory_seeker = (cv, a, ctx) => STRATEGIES.mentionKeyword(cv, a, ctx);
```

No controller changes needed — `statistics.js` already dispatches `mention_keyword` on every text message with mentionees.

## Unlock Notifications (`notify_on_unlock`)

Select achievements can send a reply back to the chat where the unlock was triggered, via Bottender's batched reply queue (zero extra LINE API cost — batched into the same `reply` call as other messages).

### How to enable

Set two columns on the achievement row:
- `notify_on_unlock: true` (default `false` → silent, logs only)
- `notify_message: "<template>"` (or `null` to use the default template)

### Template placeholders

Supported in custom `notify_message`:
- `{user}` — the unlocker's `display_name` (falls back to literal `"玩家"` if missing)
- `{name}` — achievement name
- `{icon}` — achievement icon
- `{reward}` — reward stone count as integer

Repeated placeholders are replaced globally. `{description}` is intentionally not supported.

### Default templates (when `notify_message` is `null`)

- With reward (`reward_stones > 0`): `🎉 {user} 解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石`
- No reward: `🎉 {user} 解鎖成就「{icon} {name}」！`

### Call-site pattern

`AchievementEngine.evaluate()` returns `{ unlocked: Achievement[] }`. For any call site that has a Bottender `context`, use the `notifyUnlocks` helper to emit replies:

```js
const AchievementEngine = require("../service/AchievementEngine");
const { notifyUnlocks } = require("../service/achievementNotifier");

const { unlocked } = await AchievementEngine.evaluate(userId, "<eventType>", ctx)
  .catch(() => ({ unlocked: [] }));
await notifyUnlocks(context, userId, unlocked);
```

Batch/cron call sites (no `context`) simply ignore the return value — that's fine.

### Reply-queue cap

LINE reply tokens cap at 5 messages per reply. If a single event generates >5 `context.replyText` calls (controller replies + unlock notifications combined), Bottender drops the overflow and logs a warning. This is tolerated as-is — unlikely in practice and harmless.

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
- [ ] `evaluate()` called from the relevant business logic (skip for `mention_keyword` — `statistics.js` dispatches it automatically)
- [ ] If `condition` is needed, `JSON.stringify(...)` the object before insert
- [ ] If `notify_on_unlock: true`, confirm the relevant call site destructures `{ unlocked }` and calls `notifyUnlocks(context, userId, unlocked)` (already wired for `statistics.js`, gacha, janken, subscribe)
- [ ] Migration runs cleanly: `cd app && yarn migrate`
- [ ] (Optional) Frontend icon mapped
- [ ] (Optional) Batch evaluation added if retroactive check is needed
