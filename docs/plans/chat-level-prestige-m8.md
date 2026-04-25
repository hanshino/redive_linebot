# M8 — Housekeeping Cron + Feature Flag

**Goal:** Cap `chat_exp_events` retention at 30 days via a daily prune job, and add a `CHAT_XP_PAUSED` Redis kill-switch so the T-0 migration window can stop XP recording without taking the bot offline. The two earlier housekeeping crons (`TrialExpiryCheck`, `BroadcastQueueDrainer`) are already wired in M3 / M4; M8 only adds the third.

**Branch:** `feat/clp-m8` off `feat/chat-level-prestige`

## Architecture

- **`ChatExpEventsPrune`** — daily 03:00 cron that issues a single `DELETE FROM chat_exp_events WHERE ts < NOW() - INTERVAL 30 DAY`. Spec line 545. Stays a thin wrapper around `mysql(...).where(...).del()` so it inherits the connection pool and survives transient DB blips by logging and exiting cleanly (cron contract: never crash the worker).
- **`CHAT_XP_PAUSED` flag** — a Redis string key (`"1"` = paused, missing/`"0"` = running). Checked at the top of `EventDequeue.handleChatExp` so the webhook keeps recording user/group joins, message counts, and reply tokens, but **stops pushing** to `CHAT_EXP_RECORD`. The `ChatExpUpdate` pipeline (every 5 min) drains whatever's already on the queue, then idles. This matches the spec's T-0 sequence: "設 CHAT_XP_PAUSED = 1（bot 暫停計 XP，保留 webhook 接收）".
- The flag is read once per chat message — single `redis.get`, ~no overhead. No caching layer because we want unset-takes-effect-immediately behavior at flag flip.

## Files

| File | Action |
|---|---|
| `app/bin/ChatExpEventsPrune.js` | New — single-statement prune cron |
| `app/bin/EventDequeue.js` | Add `CHAT_XP_PAUSED` short-circuit at top of `handleChatExp` |
| `app/config/crontab.config.js` | Append `Chat Exp Events Prune` entry, daily 03:00 |
| `app/__tests__/bin/ChatExpEventsPrune.test.js` | New — happy path + error swallow |
| `app/__tests__/bin/EventDequeue.handleChatExp.test.js` | Extend — flag short-circuits push |

## Tasks

1. **`ChatExpEventsPrune.js`** — module exports a `main()` that runs the prune, swallows errors via `console.error` (matches `TrialExpiryCheck` pattern), supports direct invocation (`require.main === module`).
2. **EventDequeue short-circuit** — add a single `redis.get("CHAT_XP_PAUSED")` check at entry of `handleChatExp`; bail before computing anything if flag is `"1"`. Touch timestamp + last-group tracking + lPush are all skipped during pause so the queue stays clean for the migration script.
3. **Cron registration** — insert new entry between `Daily Cleanup` (00:00) and `Daily Ration` so `Daily Cleanup` (00:00) runs first, then `TrialExpiryCheck` (00:05), then `ChatExpEventsPrune` (03:00). Schedule string: `["0", "0", "3", "*", "*", "*"]`.
4. **Tests** —
   - `ChatExpEventsPrune.test.js`: asserts the call shape (`mysql("chat_exp_events").where(...).del()`), happy path returns cleanly, error in `del()` is logged but does not throw.
   - Extend `EventDequeue.handleChatExp.test.js`: when `redis.get("CHAT_XP_PAUSED") === "1"`, the function returns without calling `redis.set` (touch TS) or `redis.lPush` (XP record). Assert per-message overhead is one `redis.get` followed by an early return.

## Exit Criteria

- [ ] `yarn test` green (new cron test + extended handleChatExp test, no regressions in the 6 existing EventDequeue tests).
- [ ] `yarn lint` clean.
- [ ] Manual smoke: setting `CHAT_XP_PAUSED=1` in Redis blocks new entries on `CHAT_EXP_RECORD` while reply tokens / GuildMembers updates continue.
- [ ] `crontab.config.js` lists three M3/M4/M8 housekeeping crons (`Trial Expiry Check`, `Broadcast Queue Drainer`, `Chat Exp Events Prune`) with the schedules from the impl plan.

## Out of Scope

- Pipeline-side pause: `ChatExpUpdate` still runs during the migration window; M9 owns the runbook step that waits for the queue to drain before snapshotting. M8 only stops new writes upstream.
- Dashboard / observability for the flag — the migration runbook will read it via `redis-cli GET` directly. M11 can move it into `/admin` if needed.
- Per-event compaction of the `CHAT_EXP_RECORD` Redis list — naturally bounded by the 5-min pipeline cadence and Redis memory cap. Not an M8 concern.

**Dependencies:** M2 (the `chat_exp_events` table + EventDequeue rewrite this short-circuits)
