# Mention-Keyword Achievement Trigger + Unlock Notification

**Date:** 2026-04-17
**Status:** Draft — pending implementation

## Context

The achievement system (shipped in `feat/achievement-system-revamp`) supports event-driven unlocks via `AchievementEngine.evaluate(userId, eventType, context)`. All triggers are hard-coded in `EVENT_ACHIEVEMENT_MAP` and strategy functions in `app/src/service/AchievementEngine.js`.

Two gaps motivate this design:

1. **No mention-based trigger.** A new trigger type is needed where a user mentions a specific target user (e.g. an admin, or any configurable userId) and includes specific keywords in the same message. The target userId list must be configurable per achievement — not hard-coded to admins — so future achievements can target any userId.

2. **Silent unlocks.** `unlockAchievement()` only logs to stdout. The user wants select achievements (opt-in) to emit a visible message back to the chat where the unlock was triggered.

## Goals

- Introduce a data-driven `mention_keyword` event type with per-achievement configurable conditions (target userIds + keywords).
- Extend `AchievementEngine.evaluate()` to return newly unlocked achievements so callers can notify.
- Provide a notification helper that renders a templated unlock message and emits it via Bottender's batched reply queue (zero additional LINE API cost).
- Keep the engine free of Bottender coupling so batch/cron usage is unaffected.

## Non-Goals

- Migrating existing hard-coded strategy parameters (e.g. `timeWindow(3, 4)` for night-owl) to the new `condition` column. That can happen opportunistically later.
- LINE push messages. Only reply-token messaging is used. Reply is free; push is billed and explicitly rejected.
- Notification throttling, deduplication, or rate-limiting beyond the Bottender reply-queue's native 5-message cap.
- Frontend changes to the admin dashboard.

## Design

### 1. Schema

Add three nullable/default columns to the `achievements` table via a new Knex migration:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `condition` | `json` | `null` | Strategy-specific trigger data. Schema is owned by the strategy function, not the engine. |
| `notify_on_unlock` | `boolean` | `false` | Gate for emitting an unlock reply. Existing achievements default to silent (current behavior). |
| `notify_message` | `text` | `null` | Optional custom template. `null` → default template selected at render time. |

Migration: `app/migrations/<timestamp>_add_achievement_condition_and_notify.js` (generated via `yarn knex migrate:make`).

### 2. Condition Schema (for `mention_keyword` event)

Stored as JSON in `achievements.condition`:

```json
{
  "targetUserIds": ["U123...", "U456..."],
  "keywords": ["謝謝", "感謝"]
}
```

Semantics:
- `targetUserIds`: **all** must appear in the message's `mention.mentionees`. Empty or missing → strategy returns the current progress value unchanged (no unlock).
- `keywords`: **all** must be substrings of the message text. Empty or missing → strategy returns the current progress value unchanged (no unlock).
- 1-on-1 chats: no special guard. Mentioning in a 1-on-1 is not supported by LINE, so the condition cannot fire.

Other strategies may define their own condition shape in the future. The engine does not inspect `condition` — it only passes `achievement` through to the strategy function.

### 3. Engine API Change

`AchievementEngine.evaluate()` returns a result object:

```js
// before: returns undefined (fire-and-forget)
// after:
async evaluate(userId, eventType, context = {}) {
  // ...
  return { unlocked: Achievement[] };  // empty array if none
}
```

- Internal try/catch preserved. On error, returns `{ unlocked: [] }` (never throws).
- Existing callers using `.catch(() => {})` continue to work — they simply ignore the return value.
- `unlocked[]` contains the full achievement row (with `notify_on_unlock`, `notify_message`, `icon`, `name`, `reward_stones`).

### 4. New Event Type & Strategy

In `AchievementEngine.js`:

```js
EVENT_ACHIEVEMENT_MAP.mention_keyword = [/* achievement keys using this trigger */];

// Strategy — reused across all mention_keyword achievements
STRATEGIES.mentionKeyword = (cv, a, ctx) => {
  const { targetUserIds = [], keywords = [] } = a.condition || {};
  if (!targetUserIds.length || !keywords.length) return cv;
  const mentioned = ctx.mentionedUserIds || [];
  const allTagged = targetUserIds.every(id => mentioned.includes(id));
  const allKeyword = keywords.every(k => (ctx.text || "").includes(k));
  return (allTagged && allKeyword) ? a.target_value : cv;
};

// Per-achievement wiring
ACHIEVEMENT_STRATEGY.<mention_achievement_key> = (cv, a, ctx) =>
  STRATEGIES.mentionKeyword(cv, a, ctx);
```

### 5. Dispatch Point (statistics middleware)

`app/src/middleware/statistics.js` already fires `chat_message` on every text message. Add a parallel `mention_keyword` fire when `mention.mentionees` is non-empty, then notify unlocks from both:

```js
if (context.event.isText && userId) {
  const mentionees = get(context, "event.message.mention.mentionees", []);
  const mentionedUserIds = mentionees.map(m => m.userId).filter(Boolean);
  const text = context.event.text || "";

  const tasks = [
    AchievementEngine.evaluate(userId, "chat_message", { groupId, text }),
  ];
  if (mentionedUserIds.length) {
    tasks.push(
      AchievementEngine.evaluate(userId, "mention_keyword", { mentionedUserIds, text })
    );
  }
  const results = await Promise.all(tasks.map(p => p.catch(() => ({ unlocked: [] }))));
  const unlocked = results.flatMap(r => r.unlocked);
  await notifyUnlocks(context, userId, unlocked);
}
```

This adds one `await` to a previously fire-and-forget middleware. The added latency is bounded (in-memory cache + indexed DB lookups).

### 6. Notification Helper

New file: `app/src/service/achievementNotifier.js`

```js
const DEFAULT_TEMPLATE_WITH_REWARD =
  "🎉 {user} 解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石";
const DEFAULT_TEMPLATE_NO_REWARD =
  "🎉 {user} 解鎖成就「{icon} {name}」！";

async function notifyUnlocks(context, userId, achievements) {
  const toNotify = achievements.filter(a => a.notify_on_unlock);
  if (!toNotify.length) return;
  const userName = await getDisplayName(userId);
  for (const a of toNotify) {
    context.replyText(renderTemplate(a, userName));
  }
}

function renderTemplate(a, userName) {
  const fallback = a.reward_stones > 0
    ? DEFAULT_TEMPLATE_WITH_REWARD
    : DEFAULT_TEMPLATE_NO_REWARD;
  const tpl = a.notify_message || fallback;
  return tpl
    .replace(/\{user\}/g, userName)
    .replace(/\{name\}/g, a.name)
    .replace(/\{icon\}/g, a.icon)
    .replace(/\{reward\}/g, String(a.reward_stones));
}

module.exports = { notifyUnlocks };
```

- `getDisplayName(userId)` queries the `user` table (`platform_id`), returns `display_name`. If the row is missing or `display_name` is null, falls back to the literal string `"玩家"`.
- Supported placeholders: `{user}`, `{name}`, `{icon}`, `{reward}`. `{description}` intentionally excluded.
- Bottender's batched reply queue (`_shouldBatch = true` by default in `LineConnector`) absorbs multiple `replyText` calls and flushes them as a single `reply` API call in `handlerDidEnd()` — zero extra LINE cost.

### 7. Other Call-Site Updates

`evaluate()` is also called from:

- `app/src/middleware/statistics.js` (covered above)
- `app/src/controller/princess/gacha.js:476`
- `app/src/controller/application/JankenController.js:267, 436`
- `app/src/controller/application/SubscribeController.js:85, 255`

For consistency — so any achievement with `notify_on_unlock=true` emits regardless of trigger source — all call sites switch to:

```js
const { unlocked } = await AchievementEngine.evaluate(userId, eventType, ctx)
  .catch(() => ({ unlocked: [] }));
await notifyUnlocks(context, userId, unlocked);
```

Batch evaluation (`AchievementEngine.batchEvaluate()` / cron) ignores the return value — no `context`, no chat to reply to. That is acceptable.

### 8. Reply-Queue 5-Message Cap

LINE reply tokens cap at 5 messages per reply. When a single event causes more than 5 `context.replyText` calls combined (controller replies + unlock notifications), Bottender drops the overflow and emits a warning.

This design **does not** add special handling. Rationale:
- A single message triggering multiple unlocks is rare.
- The overflow dropping is handled gracefully by Bottender (no crash).
- Prioritization (e.g. keep rarest) can be a follow-up if production logs show it happening.

### 9. Adding a Concrete Mention-Keyword Achievement (example flow)

The feature ships without a specific achievement; it provides the trigger type. To add one later (via add-achievement skill):

1. Migration inserts into `achievements` with:
   - `type: "hidden"`, `rarity: 2`
   - `target_value: 1`, `reward_stones: 300`
   - `condition: JSON.stringify({ targetUserIds: ["U..."], keywords: ["..."] })`
   - `notify_on_unlock: true`, `notify_message: null` (use default) or custom text.
2. Add the key to `EVENT_ACHIEVEMENT_MAP.mention_keyword`.
3. Add `ACHIEVEMENT_STRATEGY.<key> = (cv, a, ctx) => STRATEGIES.mentionKeyword(cv, a, ctx);`.

## Error Handling

- `evaluate()` continues to swallow all internal errors and log via `DefaultLogger`. On error returns `{ unlocked: [] }`.
- `notifyUnlocks` errors (e.g. user lookup failure) must not break the middleware chain. Wrap in try/catch; log and continue.
- Missing/malformed `condition` JSON in DB: strategy returns `cv` unchanged (no progress, no crash).

## Testing

Jest tests in `app/src/service/__tests__/`:

- `AchievementEngine.test.js` additions:
  - `evaluate` returns `{ unlocked: [] }` when no progress.
  - `evaluate` returns unlocked array with full achievement row when a threshold is crossed.
  - `mentionKeyword` strategy: all target + all keyword match → unlocks.
  - `mentionKeyword` strategy: partial target / partial keyword / empty condition → no unlock.

- `achievementNotifier.test.js` (new):
  - Filters non-`notify_on_unlock` entries.
  - Uses custom template when `notify_message` set.
  - Falls back to with-reward template when `reward_stones > 0` and `notify_message` null.
  - Falls back to no-reward template when `reward_stones === 0` and `notify_message` null.
  - Placeholder replacement handles repeated placeholders (global regex).

Integration smoke-check: manually trigger a mention-based achievement in a test LINE group.

## Migration & Rollout

1. Schema migration runs in a single step; all existing rows default `notify_on_unlock=false`, `condition=null`, `notify_message=null` → zero user-visible change.
2. Engine changes are backward compatible (new return value, existing callers ignore).
3. Call-site updates can roll out incrementally — each site independently benefits from unlock notifications once updated.
4. New mention-keyword achievements are added via subsequent migrations as content decisions are made.

## Open Questions

None at spec-approval time.

## Files Touched

**New:**
- `app/src/service/achievementNotifier.js`
- `app/src/service/__tests__/achievementNotifier.test.js`
- `app/migrations/<timestamp>_add_achievement_condition_and_notify.js`

**Modified:**
- `app/src/service/AchievementEngine.js` (return value, new strategy, new event type)
- `app/src/middleware/statistics.js` (dispatch + notify)
- `app/src/controller/princess/gacha.js` (call-site update)
- `app/src/controller/application/JankenController.js` (call-site update, 2 places)
- `app/src/controller/application/SubscribeController.js` (call-site update, 2 places)
- `app/src/model/application/Achievement.js` (if column list is explicit)
- `app/src/service/__tests__/AchievementEngine.test.js` (new cases)
