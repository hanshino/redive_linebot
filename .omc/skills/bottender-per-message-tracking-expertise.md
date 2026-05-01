---
name: bottender-per-message-tracking
description: Per-message tracking (like achievement evaluate) must go in statistics middleware, not in command controllers which only run on specific commands
triggers:
  - every message tracking
  - per-message evaluate
  - chat achievement not triggering
  - statistics middleware
  - message count not incrementing
  - evaluate not called
  - no achievement progress
---

# Bottender Per-Message Tracking Must Use statistics Middleware

## The Insight

In this Bottender codebase, there are two very different execution contexts that look similar but have completely different reach:

1. **Middleware** (`app/src/middleware/`) — runs on EVERY incoming message, chained in `app/src/app.js`
2. **Controller handlers** (`app/src/controller/`) — only run when a specific command pattern matches (e.g., `.等級`, `.成就`)

If you need something to happen on every user message (tracking, counting, analytics, achievement progress), it **must** go in a middleware — specifically `statistics.js` which is the earliest data-collection middleware in the chain. Putting it in a controller handler means it only fires when users explicitly type that command.

## Why This Matters

The symptom is silent failure: no errors, no warnings, the code just never executes. A user can send 100 messages and their chat achievement progress stays at 0 because the evaluate call was inside `ChatLevelController.showStatus` (triggered by `.等級` command) instead of in the per-message middleware.

This is especially deceptive because the code looks correct at a glance — `AchievementEngine.evaluate(userId, "chat_message")` is right there in the controller. You'd only notice the problem by asking "when does this code path actually execute?"

## Recognition Pattern

- User reports that per-message tracking (achievements, counts, analytics) isn't working
- The tracking code exists in a controller file under `app/src/controller/`
- The controller is wired to a specific command pattern via `text(/^[.#/].../)` in its `exports.router`
- No errors in logs — the code simply never runs for normal messages

## The Approach

1. **Check the execution context**: Is the code in a middleware or a controller? Controllers only run on command matches.
2. **The middleware chain** (defined in `app/src/app.js`):
   ```
   setProfile → statistics → recordLatestGroupUser → lineEvent
   → config → transfer → HandlePostback
   → rateLimit → alias
   → GlobalOrderBase → OrderBased → CustomerOrderBased
   → interactWithBot → recordSession → Nothing
   ```
3. **`statistics.js`** is the right place for per-message tracking — it runs early, before any command routing, and processes every message type.
4. **Guard with `context.event.isText`** if you only want text messages (not images, stickers, etc.).
5. **Fire-and-forget pattern**: Use `.catch(() => {})` to prevent tracking errors from breaking the message flow.

## Key Files

- `app/src/middleware/statistics.js` — Per-message data collection (the RIGHT place)
- `app/src/app.js` — Middleware chain definition
- `app/src/controller/application/ChatLevelController.js` — Command handler (the WRONG place for per-message logic)
