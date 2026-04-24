# Chat Level Prestige — M3: Trial & Prestige Lifecycle (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full trial & prestige state machine on top of M2's XP pipeline. Users can start a trial, accumulate progress through regular chatting, pass (or fail, or forfeit) the trial, and — once Lv.100 + have a passed-but-unconsumed trial — prestige by picking a blessing. 5 prestiges → awakening terminal state. A daily cron expires 60-day-old active trials. All user-visible state transitions emit broadcast-queue events that M4 will deliver.

**Architecture:** One new service `app/src/service/PrestigeService.js` holds the lifecycle (`startTrial` / `forfeitTrial` / `checkTrialCompletion` / `prestige` / `getPrestigeStatus`). The XP pipeline gains one post-write hook `onBatchWritten` that detects level-crossed-100 and trial-progress-completion, firing broadcasts and marking trials passed. `EventDequeue.handleChatExp` gains a `CHAT_USER_LAST_GROUP_{userId}` cache so LIFF-initiated lifecycle events can route broadcasts to a reasonable group. A new cron `TrialExpiryCheck` runs daily to flip expired `active` trials to `failed`. Broadcasts are emitted by `lPush`-ing to `BROADCAST_QUEUE_{groupId}` — M4 will build the drainer; M3 just writes the queue.

**Tech Stack:** Node.js 22 / CommonJS / Knex + mysql2 / ioredis (via `app/src/util/redis.js`) / Jest 29 / `moment` (plain — use `moment().utcOffset(480)` for UTC+8).

---

## Context for Implementer

### What M1 + M2 already built (do not rebuild)

**Schema (M1):**
- `chat_user_data` — PK `user_id`; columns include `prestige_count`, `current_level`, `current_exp`, `awakened_at`, `active_trial_id`, `active_trial_started_at`, `active_trial_exp_progress`
- `prestige_trials` — 5 rows, `{id, slug, star, required_exp, duration_days, restriction_meta, reward_meta}`
- `prestige_blessings` — 7 rows, `{id, slug, effect_meta}`
- `user_prestige_trials` — append-only attempt log, `status ENUM('active','passed','failed','forfeited')`; `final_exp_progress` is frozen on ended trials
- `user_blessings` — `UNIQUE (user_id, blessing_id)`, `acquired_at_prestige` recorded
- `user_prestige_history` — permanent prestige-event ledger; `cycle_days` is `GENERATED ALWAYS AS (DATEDIFF(prestiged_at, cycle_started_at)) STORED` (NOT in fillable)
- `chat_exp_events` — 30-day rolling events ledger with `modifiers JSON`

**Models (`app/src/model/application/`):**
- `ChatUserData.findByUserId(userId)`, `ChatUserData.upsert(userId, attrs)`
- `PrestigeTrial.all()` (sorted `star asc, id asc`), `findById`, `findBySlug`
- `PrestigeBlessing.all()` (sorted `id asc`), `findById`, `findBySlug`
- `UserPrestigeTrial.findActiveByUserId`, `listPassedByUserId`, `listByUserId`, `.model` exposes raw Base
- `UserBlessing.listByUserId`, `listBlessingIdsByUserId`, `.model` exposes raw Base
- `UserPrestigeHistory.listByUserId`, `latestByUserId`, `.model` exposes raw Base

**M2 pipeline (`app/src/service/chatXp/`):**
- `pipeline.processBatch(events)` — batched XP write, populates `chat_user_data` + `chat_exp_daily` + `chat_exp_events`
- `writeBatch(userId, state, batch)` currently writes:
  - `current_exp = min(prevExp + batch.effectiveDelta, 27000)` via `ChatUserData.upsert`
  - `current_level = getLevelFromExp(newExp, expUnitRows)`
  - `active_trial_exp_progress += batch.effectiveDelta` when `active_trial_id` is present
- It does **not** detect trial completion or Lv.100 crossings — M3 adds that
- `chatUserState.hydrate(userId)` builds `status` from `ChatUserData`, `UserBlessing`, passed trial rewards; `load()` caches 10 min in `CHAT_USER_STATE_{userId}`
- `chatUserState.invalidate(userId)` — M3 must call this on every state-changing op

**`EventDequeue.handleChatExp`:**
- Reads `CHAT_TOUCH_TIMESTAMP_{userId}` (TTL 10s) to compute `timeSinceLastMsg`
- Writes `{userId, groupId, ts, timeSinceLastMsg, groupCount}` to `CHAT_EXP_RECORD`
- Exported via `module.exports.__testing = { handleChatExp }`
- M3 adds one more Redis write (`CHAT_USER_LAST_GROUP_{userId}`) — nothing else changes

### What M3 writes and does not write

| Target | M3 behavior |
|---|---|
| `user_prestige_trials` (active) | Insert on `startTrial` |
| `user_prestige_trials.status` | `active` → `passed` / `forfeited` / `failed` (via `TrialExpiryCheck`); `ended_at` + `final_exp_progress` set on close |
| `chat_user_data.active_trial_*` | Set on start, cleared on any close (pass/forfeit/fail) |
| `chat_user_data.prestige_count / current_level / current_exp / awakened_at` | Updated by `prestige(userId, blessingId)` |
| `user_blessings` | Insert on `prestige` |
| `user_prestige_history` | Insert on `prestige` (one row per cycle) |
| `BROADCAST_QUEUE_{groupId}` (Redis list) | `LPUSH` one JSON event for each state transition (trial-enter / trial-pass / prestige / awakening / lv-100-CTA) + `EXPIRE 86400` |
| `CHAT_USER_LAST_GROUP_{userId}` | Maintained by `EventDequeue.handleChatExp` with TTL 24h — PrestigeService reads it when it needs a groupId for LIFF-originated broadcasts |
| `CHAT_USER_STATE_{userId}` | Invalidated on every state change |
| Broadcast delivery (reply-token pulling, LINE API) | **Not implemented** — M4's job; M3 only writes the queue |
| LIFF API endpoints / frontend | **Not implemented** — M6's job |
| Achievement triggers | **Not implemented** — M5's job; M3 writes event metadata that M5 can later inspect |
| `prestige_pioneer` seeding for 82 migrated users | **Not implemented** — M9's migration script |

### Spec invariants M3 must honor

- **Prestige cap** (spec line 37, 158): hard limit of 5. Once `prestige_count = 5`, the user is **awakened** and cannot prestige again. `awakened_at` is written at the moment `prestige_count` transitions 4 → 5.
- **One active trial at a time** (spec line 407): `chat_user_data.active_trial_id` is the single source of truth; trials cannot be stacked. `startTrial` fails if an active trial exists.
- **Each trial passable only once** (spec line 407): app-layer check. Cannot `startTrial` on a trial already in user's passed list.
- **Prestige requires all three** (spec line 161): Lv.100 + ≥1 passed-but-unconsumed trial + an unused blessing.
  - `passed-but-unconsumed` = `{trial_ids from user_prestige_trials status=passed}` minus `{trial_ids from user_prestige_history}`. Steady-state ≤ 1 but can temporarily be higher if user defers prestige.
  - Trial claim policy: **earliest-passed FIFO** when multiple unconsumed passes exist.
- **Blessing uniqueness**: `UNIQUE (user_id, blessing_id)` enforced at DB. App-layer check first to give a meaningful error.
- **60-day expiry** (spec line 152): any `user_prestige_trials.status = 'active'` with `started_at < NOW() - INTERVAL 60 DAY` flips to `failed` via daily cron (00:05). `chat_user_data.active_trial_*` cleared. No broadcast (spec line 301-303: "試煉 60 天時限到期失敗（玩家下次開 LIFF 才會看到結果）").
- **Forfeit is silent** (spec line 301): no broadcast.
- **Lv.100 crossing** (spec line 165): when a pipeline batch moves a user's `current_level` from `<100` to exactly `100`, broadcast the CTA. **Only once per cycle** — if they were already at 100 (e.g., they crossed, didn't prestige, kept chatting and got capped) the next batch must not re-emit.
- **Trial pass broadcast** (spec line 297): `「[用戶名] 通過了 ★N 的試煉，永久解放 XXX」`
- **Trial enter broadcast** (spec line 297): `「[用戶名] 踏入了 ★N 的試煉」`
- **Prestige broadcast** (spec line 298): `「[用戶名] 完成第 N 次轉生，選擇了祝福『XXX』」`
- **Awakening broadcast** (spec line 299): `「[用戶名] 達成覺醒！」` — fired on the same transaction as the 5th prestige (so two broadcasts, in order: prestige, then awakening).
- **Cycle start time** (spec line 556-557): `user_prestige_history.cycle_started_at` = `Lv.1` starting moment. For the first prestige, this is **T-0 migration timestamp** (M9 seeds it). For subsequent cycles, it's `prestiged_at` of the **previous** prestige. M3's `prestige()` must look up the previous `prestiged_at` (or, for the first cycle, fall back to user's `chat_user_data.created_at`).
- **Trial progress** (spec line 214, M2 ctx): `active_trial_exp_progress` accumulates **effective** XP (post-diminish, post-trial-mult, post-permanent). M2 already does this. M3 only reads it for completion check.

### Broadcast event routing (M3 decision)

Broadcasts have a groupId (queue key). M3 sources it this way:

| Event | groupId source |
|---|---|
| `trial_enter` | `CHAT_USER_LAST_GROUP_{userId}` (LIFF-originated; fail silently if not cached) |
| `trial_pass` | The groupId of the last event in the batch that crossed the threshold (pipeline knows it) |
| `trial_forfeit` | **Not broadcast** (spec line 301) |
| `trial_failed_by_expiry` | **Not broadcast** |
| `prestige` | `CHAT_USER_LAST_GROUP_{userId}` (LIFF-originated) |
| `awakening` | Same groupId as the preceding `prestige` event (shared dispatch) |
| `lv_100_cta` | The groupId of the last event in the batch that triggered the crossing |

If `CHAT_USER_LAST_GROUP_{userId}` is unset (user hasn't chatted in the last 24h), the broadcast is silently dropped. That's acceptable for trial_enter / prestige / awakening — a stale user's prestige happens in LIFF, nobody's watching any group anyway.

**Broadcast payload shape** (one JSON per list entry):

```json
{
  "type": "trial_pass",
  "userId": "Uxxxxx...",
  "text": "通過了 ★3 的試煉，永久解放 律動精通",
  "payload": { "trialId": 3, "trialStar": 3, "trialSlug": "rhythm" },
  "createdAt": 1750000000000
}
```

`text` is pre-formatted without the `[用戶名]` prefix — M4's drainer will resolve the display name and prepend it at send time (user display-name lookup needs LINE API / cache, which M4 owns). If you want to test `text` during M3 development, format it exactly per spec line 297-299 minus the name prefix.

### Canonical status-transition invariants

Before and after each PrestigeService op:

```
startTrial(userId, trialId):
  PRE:  chat_user_data.active_trial_id IS NULL
        AND trialId NOT IN passed_trial_ids(userId)
        AND trialId exists in prestige_trials
        AND prestige_count < 5
  POST: chat_user_data.active_trial_id = trialId
        chat_user_data.active_trial_started_at = NOW()
        chat_user_data.active_trial_exp_progress = 0
        one new row in user_prestige_trials(status='active', started_at=NOW())
        CHAT_USER_STATE_{userId} invalidated
        BROADCAST_QUEUE emitted (trial_enter)

forfeitTrial(userId):
  PRE:  chat_user_data.active_trial_id IS NOT NULL
  POST: the matching user_prestige_trials row → status='forfeited', ended_at=NOW(), final_exp_progress=progress
        chat_user_data.active_trial_id = NULL
        chat_user_data.active_trial_started_at = NULL
        chat_user_data.active_trial_exp_progress = 0
        CHAT_USER_STATE_{userId} invalidated
        (no broadcast)

checkTrialCompletion(userId, state, groupId):
  PRE:  chat_user_data.active_trial_id IS NOT NULL
        AND chat_user_data.active_trial_exp_progress >= trial.required_exp
  POST: the matching user_prestige_trials row → status='passed', ended_at=NOW(), final_exp_progress=progress
        chat_user_data.active_trial_id = NULL
        chat_user_data.active_trial_started_at = NULL
        chat_user_data.active_trial_exp_progress = 0
        CHAT_USER_STATE_{userId} invalidated
        BROADCAST_QUEUE emitted (trial_pass)

prestige(userId, blessingId):
  PRE:  chat_user_data.current_level >= 100
        AND prestige_count < 5
        AND blessingId exists in prestige_blessings AND NOT IN user's user_blessings
        AND EXISTS at least one passed trial NOT YET referenced in user_prestige_history
  POST: claim earliest passed-but-unconsumed trial (FIFO) → let its trial_id = T
        INSERT user_blessings(user_id, blessing_id=blessingId, acquired_at_prestige=prestige_count+1, acquired_at=NOW())
        INSERT user_prestige_history(user_id, prestige_count_after=prestige_count+1, trial_id=T, blessing_id=blessingId, cycle_started_at=<see below>, prestiged_at=NOW())
        chat_user_data.prestige_count = prestige_count+1
        chat_user_data.current_level = 0
        chat_user_data.current_exp = 0
        IF new prestige_count == 5: chat_user_data.awakened_at = NOW()
        CHAT_USER_STATE_{userId} invalidated
        BROADCAST_QUEUE emitted (prestige; then also awakening if pc=5)

  cycle_started_at:
    IF prestige_count == 0 (this is the first prestige) → chat_user_data.created_at
    ELSE                                                 → prior user_prestige_history.prestiged_at (via latestByUserId)

TrialExpiryCheck (cron):
  For each row in user_prestige_trials WHERE status='active' AND started_at < NOW() - INTERVAL 60 DAY:
    Update that row → status='failed', ended_at=NOW(), final_exp_progress=<the user's active_trial_exp_progress>
    Update corresponding chat_user_data → active_trial_id=NULL, active_trial_started_at=NULL, active_trial_exp_progress=0
    Invalidate CHAT_USER_STATE_{userId}
    (no broadcast)
```

### File structure to create / modify

```
app/src/
├── service/
│   └── PrestigeService.js              # NEW — lifecycle service
└── util/
    └── broadcastQueue.js               # NEW — thin Redis LPUSH wrapper (push only; M4 adds drain)

app/bin/
├── EventDequeue.js                     # MODIFY — add CHAT_USER_LAST_GROUP_* write
├── TrialExpiryCheck.js                 # NEW — daily cron
└── ChatExpUpdate.js                    # MODIFY — no change if pipeline handles onBatchWritten internally

app/src/service/chatXp/
└── pipeline.js                         # MODIFY — add post-write hook (trial pass detection + Lv.100 CTA)

app/config/
└── crontab.config.js                   # MODIFY — add Trial Expiry Check schedule

app/__tests__/
├── service/
│   └── PrestigeService.test.js         # NEW — unit tests for each lifecycle op
├── util/
│   └── broadcastQueue.test.js          # NEW — pushEvent shape + TTL + groupId fallback
├── service/chatXp/
│   └── pipeline.lifecycle.test.js      # NEW — onBatchWritten: trial pass + Lv.100 CTA
├── bin/
│   ├── EventDequeue.lastGroup.test.js  # NEW — CHAT_USER_LAST_GROUP_{userId} TTL + write
│   └── TrialExpiryCheck.test.js        # NEW — expiry cron behavior
└── service/
    └── PrestigeService.integration.test.js  # NEW — full lifecycle round-trip
```

### Branch & commit convention

- **Parent branch**: `feat/chat-level-prestige` (integration branch; currently HEAD = `3606285` after M2 merge).
- **M3 child branch**: `feat/clp-m3` (create in Task 0).
- **Commit style**: `feat(chat-level): <component name>` — same as M1/M2.
- **Merge back**: `git checkout feat/chat-level-prestige && git merge --no-ff feat/clp-m3 -m "Merge M3: trial & prestige lifecycle"` in Task 12.

### Testing notes

- `app/__tests__/setup.js` globally mocks `mysql`, `redis`, `Logger`, etc. Do not re-`jest.mock` these per file.
- `redis.lPush`, `redis.rPop` were added in M2's setup. M3 additionally needs `redis.expire` — add that if missing (Task 1 covers).
- For tests that exercise `mysql(table).update(...).where(...)`, rely on the chainable `qb` mock pattern from M2 (`mysql.mockImplementation(() => ({ where: jest.fn().mockReturnThis(), update: jest.fn().mockResolvedValue(1), ... }))`).
- For tests that need multiple mysql calls in sequence, use `mysql.mockImplementationOnce` chained. Order matters; inspect `PrestigeService` methods to align mocks with the call sequence.
- Integration test (Task 11) uses the full mocked stack — no real DB round-trip. It asserts the sequence of mysql calls and the final broadcast queue emissions.

---

## Task 0: Create M3 branch

**Files:** (none — branch ops only)

- [ ] **Step 1: Verify we're on the integration branch with a clean tree**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git status && git rev-parse --abbrev-ref HEAD && git log --oneline -1
```
Expected output includes:
```
On branch feat/chat-level-prestige
nothing to commit, working tree clean
feat/chat-level-prestige
3606285 Merge M2: core XP pipeline rewrite
```

If the working tree is dirty, stop and report — do not destroy uncommitted work.

- [ ] **Step 2: Create and switch to M3 child branch**

Run:
```bash
git -C /home/hanshino/workspace/redive_linebot checkout -b feat/clp-m3
```
Expected: `Switched to a new branch 'feat/clp-m3'`.

- [ ] **Step 3: Confirm the branch exists**

Run:
```bash
git -C /home/hanshino/workspace/redive_linebot rev-parse --abbrev-ref HEAD
```
Expected: `feat/clp-m3`.

---

## Task 1: `broadcastQueue.js` — push-only Redis helper (TDD)

**Files:**
- Create: `app/src/util/broadcastQueue.js`
- Test: `app/__tests__/util/broadcastQueue.test.js`
- Modify: `app/__tests__/setup.js` — add `expire` mock if missing

**Responsibility:** Wrap the raw `LPUSH + EXPIRE` pattern behind one function `pushEvent(groupId, eventObject)`. M4 will add a `drain(groupId)` sibling; M3 only writes.

**Contract:**
```js
// pushEvent(groupId, event) — event is a plain object that will be JSON-stringified.
// Augments with createdAt if not present. Silently no-ops when groupId is null/undefined/empty.
async function pushEvent(groupId, event) { ... }
```

Key: `BROADCAST_QUEUE_{groupId}`
Op: `LPUSH BROADCAST_QUEUE_{groupId} <JSON>` then `EXPIRE BROADCAST_QUEUE_{groupId} 86400`

**If `groupId` is falsy, the function must return `false` without touching Redis** (this is how LIFF-originated broadcasts with no cached last-group fail open).

Also export a constant:
```js
const BROADCAST_QUEUE_KEY = groupId => `BROADCAST_QUEUE_${groupId}`;
```

- [ ] **Step 1: Confirm `redis.expire` is mocked globally**

Run:
```bash
grep -n "expire" /home/hanshino/workspace/redive_linebot/app/__tests__/setup.js
```

If `expire:` is missing from the redis mock, add it.

- [ ] **Step 2: Add `expire` to the redis mock if missing**

Edit `app/__tests__/setup.js` — find the redis mock block (it has `lPush`, `rPop` already from M2) and add `expire: jest.fn()` alongside those. Keep the existing structure exactly; just add the new line.

After adding, the redis mock's relevant lines should look roughly like:
```js
  lPush: jest.fn(),
  rPop: jest.fn(),
  expire: jest.fn(),
```

- [ ] **Step 3: Write failing tests**

Create `app/__tests__/util/broadcastQueue.test.js`:

```js
const broadcastQueue = require("../../src/util/broadcastQueue");
const redis = require("../../src/util/redis");

describe("broadcastQueue.pushEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("LPUSHes a JSON-stringified event into BROADCAST_QUEUE_{groupId}", async () => {
    const event = {
      type: "trial_enter",
      userId: "Uabc",
      text: "踏入了 ★1 的試煉",
      payload: { trialId: 1, trialStar: 1, trialSlug: "departure" },
    };
    await broadcastQueue.pushEvent("Ggroup1", event);

    expect(redis.lPush).toHaveBeenCalledTimes(1);
    const [key, payload] = redis.lPush.mock.calls[0];
    expect(key).toBe("BROADCAST_QUEUE_Ggroup1");
    const parsed = JSON.parse(payload);
    expect(parsed.type).toBe("trial_enter");
    expect(parsed.userId).toBe("Uabc");
    expect(parsed.text).toBe("踏入了 ★1 的試煉");
    expect(parsed.payload).toEqual({ trialId: 1, trialStar: 1, trialSlug: "departure" });
    expect(typeof parsed.createdAt).toBe("number");
  });

  it("sets 24h EXPIRE on the key", async () => {
    await broadcastQueue.pushEvent("Ggroup1", { type: "prestige", userId: "Uabc" });
    expect(redis.expire).toHaveBeenCalledWith("BROADCAST_QUEUE_Ggroup1", 86400);
  });

  it("preserves caller-supplied createdAt when present", async () => {
    await broadcastQueue.pushEvent("Ggroup1", {
      type: "prestige",
      userId: "Uabc",
      createdAt: 1700000000000,
    });
    const [, payload] = redis.lPush.mock.calls[0];
    expect(JSON.parse(payload).createdAt).toBe(1700000000000);
  });

  it("returns false and does nothing when groupId is null", async () => {
    const result = await broadcastQueue.pushEvent(null, { type: "trial_enter", userId: "Uabc" });
    expect(result).toBe(false);
    expect(redis.lPush).not.toHaveBeenCalled();
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it("returns false and does nothing when groupId is empty string", async () => {
    const result = await broadcastQueue.pushEvent("", { type: "trial_enter", userId: "Uabc" });
    expect(result).toBe(false);
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("returns false and does nothing when groupId is undefined", async () => {
    const result = await broadcastQueue.pushEvent(undefined, { type: "trial_enter", userId: "Uabc" });
    expect(result).toBe(false);
    expect(redis.lPush).not.toHaveBeenCalled();
  });
});

describe("broadcastQueue.BROADCAST_QUEUE_KEY", () => {
  it("formats the key", () => {
    expect(broadcastQueue.BROADCAST_QUEUE_KEY("Gxyz")).toBe("BROADCAST_QUEUE_Gxyz");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/util/broadcastQueue.test.js`
Expected: All tests FAIL (module not found).

- [ ] **Step 5: Implement `broadcastQueue.js`**

Create `app/src/util/broadcastQueue.js`:

```js
const redis = require("./redis");

const BROADCAST_QUEUE_KEY = groupId => `BROADCAST_QUEUE_${groupId}`;
const TTL_SECONDS = 86400;

/**
 * Push a broadcast event onto the group's queue.
 * M4's drainer consumes these. If groupId is falsy (e.g. the LIFF-originated
 * broadcast has no cached last-group for this user), the event is silently
 * dropped — reply-token delivery requires a group anyway.
 *
 * @param {string|null|undefined} groupId
 * @param {object} event — { type, userId, text, payload, createdAt? }
 * @returns {Promise<boolean>} true if pushed, false if dropped
 */
async function pushEvent(groupId, event) {
  if (!groupId) return false;
  const payload = {
    createdAt: Date.now(),
    ...event,
  };
  const key = BROADCAST_QUEUE_KEY(groupId);
  await redis.lPush(key, JSON.stringify(payload));
  await redis.expire(key, TTL_SECONDS);
  return true;
}

module.exports = { pushEvent, BROADCAST_QUEUE_KEY, TTL_SECONDS };
```

- [ ] **Step 6: Re-run tests**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/util/broadcastQueue.test.js`
Expected: All 7 tests PASS.

- [ ] **Step 7: Commit**

Run:
```bash
git -C /home/hanshino/workspace/redive_linebot add app/src/util/broadcastQueue.js app/__tests__/util/broadcastQueue.test.js app/__tests__/setup.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): broadcastQueue push helper"
```

---

## Task 2: `CHAT_USER_LAST_GROUP` tracking in EventDequeue (TDD)

**Files:**
- Modify: `app/bin/EventDequeue.js` (function `handleChatExp`)
- Test: `app/__tests__/bin/EventDequeue.lastGroup.test.js` (NEW)

**Responsibility:** Every time `handleChatExp` runs for a group text message, write `CHAT_USER_LAST_GROUP_{userId} = groupId` with TTL `86400` (24h). PrestigeService reads this when it needs a groupId for a LIFF-originated broadcast. TTL 24h matches the broadcast queue TTL.

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/bin/EventDequeue.lastGroup.test.js`:

```js
const { __testing } = require("../../bin/EventDequeue");
const redis = require("../../src/util/redis");

describe("EventDequeue.handleChatExp — CHAT_USER_LAST_GROUP tracking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  it("writes CHAT_USER_LAST_GROUP_{userId} with TTL 86400 for group text messages", async () => {
    const event = {
      type: "message",
      timestamp: 1700000000000,
      source: { type: "group", userId: "Uuser1", groupId: "Ggroup1" },
      message: { type: "text" },
    };
    await __testing.handleChatExp(event);

    const call = redis.set.mock.calls.find(c => c[0] === "CHAT_USER_LAST_GROUP_Uuser1");
    expect(call).toBeDefined();
    expect(call[1]).toBe("Ggroup1");
    expect(call[2]).toEqual({ EX: 86400 });
  });

  it("does NOT write CHAT_USER_LAST_GROUP for non-group messages", async () => {
    const event = {
      type: "message",
      timestamp: 1700000000000,
      source: { type: "user", userId: "Uuser1" },
      message: { type: "text" },
    };
    await __testing.handleChatExp(event);

    const call = redis.set.mock.calls.find(
      c => typeof c[0] === "string" && c[0].startsWith("CHAT_USER_LAST_GROUP_")
    );
    expect(call).toBeUndefined();
  });

  it("does NOT write CHAT_USER_LAST_GROUP for non-text group messages", async () => {
    const event = {
      type: "message",
      timestamp: 1700000000000,
      source: { type: "group", userId: "Uuser1", groupId: "Ggroup1" },
      message: { type: "sticker" },
    };
    await __testing.handleChatExp(event);

    const call = redis.set.mock.calls.find(
      c => typeof c[0] === "string" && c[0].startsWith("CHAT_USER_LAST_GROUP_")
    );
    expect(call).toBeUndefined();
  });

  it("keeps the existing CHAT_EXP_RECORD lPush behavior", async () => {
    const event = {
      type: "message",
      timestamp: 1700000000000,
      source: { type: "group", userId: "Uuser1", groupId: "Ggroup1" },
      message: { type: "text" },
    };
    await __testing.handleChatExp(event);

    expect(redis.lPush).toHaveBeenCalled();
    const [key, payload] = redis.lPush.mock.calls[0];
    expect(key).toBe("CHAT_EXP_RECORD");
    const parsed = JSON.parse(payload);
    expect(parsed.userId).toBe("Uuser1");
    expect(parsed.groupId).toBe("Ggroup1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/bin/EventDequeue.lastGroup.test.js`
Expected: First 2 tests FAIL (`CHAT_USER_LAST_GROUP_Uuser1` never written); other 2 PASS.

- [ ] **Step 3: Implement the Redis write**

In `app/bin/EventDequeue.js`, locate the `handleChatExp` function (near the bottom; also exported via `__testing`). After the existing `await redis.set(touchKey, String(currTS), { EX: 10 });` and before the `await redis.lPush(...)` call, add:

```js
  // Record the group this user was last active in. PrestigeService uses this
  // to route LIFF-originated broadcasts (trial_enter / prestige / awakening)
  // when the caller has no explicit group context.
  await redis.set(`CHAT_USER_LAST_GROUP_${userId}`, groupId, { EX: 86400 });
```

Verify with:
```bash
grep -A 1 "CHAT_USER_LAST_GROUP" /home/hanshino/workspace/redive_linebot/app/bin/EventDequeue.js
```

- [ ] **Step 4: Re-run tests**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/bin/EventDequeue.lastGroup.test.js`
Expected: All 4 tests PASS.

- [ ] **Step 5: Verify the handleChatExp test suite from M2 still passes**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/bin/EventDequeue.handleChatExp.test.js`
Expected: All tests still PASS (the new redis.set call is additive and doesn't interfere).

- [ ] **Step 6: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/bin/EventDequeue.js app/__tests__/bin/EventDequeue.lastGroup.test.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): track CHAT_USER_LAST_GROUP in EventDequeue"
```

---

## Task 3: `PrestigeService.startTrial` (TDD)

**Files:**
- Create: `app/src/service/PrestigeService.js` (skeleton + `startTrial`)
- Test: `app/__tests__/service/PrestigeService.test.js` (new file with `startTrial` suite only for this task; subsequent tasks append suites)

**Contract:**

```js
/**
 * Start a trial for the user.
 * @param {string} userId
 * @param {number} trialId — prestige_trials.id (1-5)
 * @returns {Promise<{ok:true, trial:PrestigeTrialRow, groupId:string|null}>}
 * @throws {Error} with codes:
 *   - 'ALREADY_ACTIVE'       — user already has an active trial
 *   - 'ALREADY_PASSED'       — trialId is in user's passed list
 *   - 'INVALID_TRIAL'        — trialId not in prestige_trials
 *   - 'AWAKENED'             — user has prestige_count = 5 (cannot start more trials)
 */
async function startTrial(userId, trialId) { ... }
```

Error style: throw `new Error(message)` with `.code` property (matches existing service convention in `JankenService`, `SubscriptionService`). The API layer (M6) maps codes to HTTP responses.

**Algorithm:**
1. Look up user's `chat_user_data` row (`ChatUserData.findByUserId`). If missing or `prestige_count >= 5` → throw `AWAKENED`.
2. Look up the trial (`PrestigeTrial.findById`). If not found → throw `INVALID_TRIAL`.
3. If `chat_user_data.active_trial_id !== null` → throw `ALREADY_ACTIVE`.
4. Look up user's passed trials (`UserPrestigeTrial.listPassedByUserId`). If `trialId` is in the list → throw `ALREADY_PASSED`.
5. Insert `user_prestige_trials` row: `{user_id, trial_id, started_at: NOW(), status: 'active', final_exp_progress: 0}`.
6. Update `chat_user_data`: `active_trial_id = trialId, active_trial_started_at = NOW(), active_trial_exp_progress = 0`.
7. Invalidate `CHAT_USER_STATE_{userId}`.
8. Resolve groupId from `CHAT_USER_LAST_GROUP_{userId}` (nullable).
9. Emit `trial_enter` broadcast event (no-op if groupId falsy).
10. Return `{ok:true, trial, groupId}`.

**Broadcast text format** (spec line 297): `踏入了 ★${star} 的試煉`. Payload: `{ trialId, trialStar: trial.star, trialSlug: trial.slug }`.

**Concurrency note**: There's a TOCTOU window between the `findByUserId` check and the update/insert. In v1 we accept the race (LIFF UI enforces single submission, and the DB `active_trial_id` won't allow two trials semantically — the update is last-writer-wins but the first trial will have a dangling `active` row). If this becomes a problem, M3.5 can wrap in a transaction. Document this trade-off in the code comment.

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/service/PrestigeService.test.js`:

```js
const PrestigeService = require("../../src/service/PrestigeService");
const ChatUserData = require("../../src/model/application/ChatUserData");
const PrestigeTrial = require("../../src/model/application/PrestigeTrial");
const UserPrestigeTrial = require("../../src/model/application/UserPrestigeTrial");
const chatUserState = require("../../src/util/chatUserState");
const broadcastQueue = require("../../src/util/broadcastQueue");
const redis = require("../../src/util/redis");
const mysql = require("../../src/util/mysql");

describe("PrestigeService.startTrial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("inserts user_prestige_trials row + updates chat_user_data + invalidates state + emits trial_enter", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      current_level: 50,
      active_trial_id: null,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
      duration_days: 60,
    });
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial.model, "create").mockResolvedValueOnce(42);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce("Glast");

    const result = await PrestigeService.startTrial("Uabc", 1);

    expect(UserPrestigeTrial.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "Uabc",
        trial_id: 1,
        status: "active",
        final_exp_progress: 0,
      })
    );
    const upsertArgs = ChatUserData.upsert.mock.calls[0];
    expect(upsertArgs[0]).toBe("Uabc");
    expect(upsertArgs[1].active_trial_id).toBe(1);
    expect(upsertArgs[1].active_trial_exp_progress).toBe(0);
    expect(upsertArgs[1].active_trial_started_at).toBeInstanceOf(Date);

    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uabc");

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({
        type: "trial_enter",
        userId: "Uabc",
        text: "踏入了 ★1 的試煉",
        payload: { trialId: 1, trialStar: 1, trialSlug: "departure" },
      })
    );

    expect(result.ok).toBe(true);
    expect(result.trial.id).toBe(1);
    expect(result.groupId).toBe("Glast");
  });

  it("emits broadcast with null groupId when CHAT_USER_LAST_GROUP is not cached", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      active_trial_id: null,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
    });
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce(null);

    const result = await PrestigeService.startTrial("Uabc", 1);

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(null, expect.any(Object));
    expect(result.groupId).toBeNull();
  });

  it("throws AWAKENED when prestige_count >= 5", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 5,
      active_trial_id: null,
    });

    await expect(PrestigeService.startTrial("Uabc", 1)).rejects.toMatchObject({
      code: "AWAKENED",
    });
  });

  it("throws AWAKENED when chat_user_data row is missing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(null);

    await expect(PrestigeService.startTrial("Uabc", 1)).rejects.toMatchObject({
      code: "AWAKENED",
    });
  });

  it("throws INVALID_TRIAL when trialId is not in prestige_trials", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      active_trial_id: null,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce(null);

    await expect(PrestigeService.startTrial("Uabc", 99)).rejects.toMatchObject({
      code: "INVALID_TRIAL",
    });
  });

  it("throws ALREADY_ACTIVE when chat_user_data.active_trial_id is set", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      active_trial_id: 2,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
    });

    await expect(PrestigeService.startTrial("Uabc", 1)).rejects.toMatchObject({
      code: "ALREADY_ACTIVE",
    });
  });

  it("throws ALREADY_PASSED when user already passed this trial", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      active_trial_id: null,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
    });
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 10, trial_id: 1, status: "passed" },
    ]);

    await expect(PrestigeService.startTrial("Uabc", 1)).rejects.toMatchObject({
      code: "ALREADY_PASSED",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: All FAIL (module not found).

- [ ] **Step 3: Implement `PrestigeService.js` skeleton + startTrial**

Create `app/src/service/PrestigeService.js`:

```js
const redis = require("../util/redis");
const chatUserState = require("../util/chatUserState");
const broadcastQueue = require("../util/broadcastQueue");
const ChatUserData = require("../model/application/ChatUserData");
const PrestigeTrial = require("../model/application/PrestigeTrial");
const UserPrestigeTrial = require("../model/application/UserPrestigeTrial");

const PRESTIGE_CAP = 5;

function error(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function resolveLastGroup(userId) {
  const v = await redis.get(`CHAT_USER_LAST_GROUP_${userId}`);
  return v || null;
}

/**
 * Start a trial for the user.
 *
 * TOCTOU note: the active_trial_id check and the upsert are not wrapped in a
 * transaction. LIFF's single-submit UI is the primary guard; a racing caller
 * would create a dangling 'active' row. M3.5 can tighten this if needed.
 */
async function startTrial(userId, trialId) {
  const row = await ChatUserData.findByUserId(userId);
  if (!row || row.prestige_count >= PRESTIGE_CAP) {
    throw error("AWAKENED", "User is awakened or not initialized");
  }

  const trial = await PrestigeTrial.findById(trialId);
  if (!trial) {
    throw error("INVALID_TRIAL", `Trial ${trialId} does not exist`);
  }

  if (row.active_trial_id !== null && row.active_trial_id !== undefined) {
    throw error("ALREADY_ACTIVE", "An active trial already exists");
  }

  const passed = await UserPrestigeTrial.listPassedByUserId(userId);
  if (passed.some(p => p.trial_id === trialId)) {
    throw error("ALREADY_PASSED", `Trial ${trialId} already passed`);
  }

  const now = new Date();
  await UserPrestigeTrial.model.create({
    user_id: userId,
    trial_id: trialId,
    started_at: now,
    status: "active",
    final_exp_progress: 0,
  });

  await ChatUserData.upsert(userId, {
    active_trial_id: trialId,
    active_trial_started_at: now,
    active_trial_exp_progress: 0,
  });

  await chatUserState.invalidate(userId);

  const groupId = await resolveLastGroup(userId);
  await broadcastQueue.pushEvent(groupId, {
    type: "trial_enter",
    userId,
    text: `踏入了 ★${trial.star} 的試煉`,
    payload: { trialId: trial.id, trialStar: trial.star, trialSlug: trial.slug },
  });

  return { ok: true, trial, groupId };
}

module.exports = { startTrial, PRESTIGE_CAP };
```

- [ ] **Step 4: Re-run tests**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/src/service/PrestigeService.js app/__tests__/service/PrestigeService.test.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): PrestigeService.startTrial"
```

---

## Task 4: `PrestigeService.forfeitTrial` (TDD)

**Files:**
- Modify: `app/src/service/PrestigeService.js` (add `forfeitTrial`)
- Modify: `app/__tests__/service/PrestigeService.test.js` (append `describe` block for `forfeitTrial`)

**Contract:**

```js
/**
 * Forfeit the user's currently active trial. Silent (no broadcast).
 * @param {string} userId
 * @returns {Promise<{ok:true, trialId:number}>}
 * @throws {Error} with codes:
 *   - 'NO_ACTIVE_TRIAL'
 */
async function forfeitTrial(userId) { ... }
```

**Algorithm:**
1. Look up `chat_user_data`. If `active_trial_id` is null → throw `NO_ACTIVE_TRIAL`.
2. Find the active row: `UserPrestigeTrial.findActiveByUserId`. If somehow missing, treat as `NO_ACTIVE_TRIAL` (data-consistency guard).
3. Update the active `user_prestige_trials` row: `status = 'forfeited', ended_at = NOW(), final_exp_progress = chat_user_data.active_trial_exp_progress`.
4. Clear `chat_user_data`: `active_trial_id = null, active_trial_started_at = null, active_trial_exp_progress = 0`.
5. Invalidate `CHAT_USER_STATE_{userId}`.
6. **No broadcast** — spec line 301.
7. Return `{ok:true, trialId: <the cleared id>}`.

- [ ] **Step 1: Write failing tests (append to existing file)**

Append to `app/__tests__/service/PrestigeService.test.js`:

```js
describe("PrestigeService.forfeitTrial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("marks row forfeited, clears chat_user_data, invalidates state, no broadcast", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 2,
      active_trial_exp_progress: 1200,
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 42,
      user_id: "Uabc",
      trial_id: 2,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    const result = await PrestigeService.forfeitTrial("Uabc");

    expect(UserPrestigeTrial.model.update).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        status: "forfeited",
        final_exp_progress: 1200,
      })
    );
    const updateArgs = UserPrestigeTrial.model.update.mock.calls[0][1];
    expect(updateArgs.ended_at).toBeInstanceOf(Date);

    const upsertArgs = ChatUserData.upsert.mock.calls[0];
    expect(upsertArgs[0]).toBe("Uabc");
    expect(upsertArgs[1]).toEqual({
      active_trial_id: null,
      active_trial_started_at: null,
      active_trial_exp_progress: 0,
    });

    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uabc");
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();

    expect(result).toEqual({ ok: true, trialId: 2 });
  });

  it("throws NO_ACTIVE_TRIAL when active_trial_id is null", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: null,
    });

    await expect(PrestigeService.forfeitTrial("Uabc")).rejects.toMatchObject({
      code: "NO_ACTIVE_TRIAL",
    });
  });

  it("throws NO_ACTIVE_TRIAL when chat_user_data row is missing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(null);

    await expect(PrestigeService.forfeitTrial("Uabc")).rejects.toMatchObject({
      code: "NO_ACTIVE_TRIAL",
    });
  });

  it("throws NO_ACTIVE_TRIAL when active row is missing despite active_trial_id set", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 2,
      active_trial_exp_progress: 0,
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce(null);

    await expect(PrestigeService.forfeitTrial("Uabc")).rejects.toMatchObject({
      code: "NO_ACTIVE_TRIAL",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: existing `startTrial` suite still PASS; `forfeitTrial` suite all FAIL (`PrestigeService.forfeitTrial is not a function`).

- [ ] **Step 3: Implement `forfeitTrial`**

Edit `app/src/service/PrestigeService.js` — add the function and export it:

```js
async function forfeitTrial(userId) {
  const row = await ChatUserData.findByUserId(userId);
  if (!row || !row.active_trial_id) {
    throw error("NO_ACTIVE_TRIAL", "User has no active trial");
  }

  const active = await UserPrestigeTrial.findActiveByUserId(userId);
  if (!active) {
    throw error("NO_ACTIVE_TRIAL", "Active trial row missing");
  }

  const trialId = row.active_trial_id;
  const progress = row.active_trial_exp_progress || 0;
  const now = new Date();

  await UserPrestigeTrial.model.update(active.id, {
    status: "forfeited",
    ended_at: now,
    final_exp_progress: progress,
  });

  await ChatUserData.upsert(userId, {
    active_trial_id: null,
    active_trial_started_at: null,
    active_trial_exp_progress: 0,
  });

  await chatUserState.invalidate(userId);

  return { ok: true, trialId };
}

module.exports = { startTrial, forfeitTrial, PRESTIGE_CAP };
```

- [ ] **Step 4: Re-run tests**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: All tests PASS (startTrial 7 + forfeitTrial 4 = 11).

- [ ] **Step 5: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/src/service/PrestigeService.js app/__tests__/service/PrestigeService.test.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): PrestigeService.forfeitTrial"
```

---

## Task 5: `PrestigeService.checkTrialCompletion` (TDD)

**Files:**
- Modify: `app/src/service/PrestigeService.js` (add `checkTrialCompletion`)
- Modify: `app/__tests__/service/PrestigeService.test.js` (append block)

**Contract:**

```js
/**
 * Close an active trial as passed if its progress has met required_exp.
 * Called by the XP pipeline after a batch write. Idempotent: if there's no
 * active trial, or progress is below threshold, returns { completed:false }.
 *
 * @param {string} userId
 * @param {string|null} groupIdHint — preferred groupId for the trial_pass
 *   broadcast (e.g., the groupId of the last event in the batch). If null,
 *   falls back to CHAT_USER_LAST_GROUP_{userId}.
 * @returns {Promise<{completed:boolean, trialId?:number, trialStar?:number}>}
 */
async function checkTrialCompletion(userId, groupIdHint) { ... }
```

**Algorithm:**
1. Look up `chat_user_data`. If no `active_trial_id`, return `{completed: false}`.
2. Look up the trial config (`PrestigeTrial.findById`). If missing (shouldn't happen) → return `{completed: false}`.
3. If `active_trial_exp_progress < required_exp` → return `{completed: false}`.
4. Find the active user row (`UserPrestigeTrial.findActiveByUserId`). If missing → return `{completed: false}` (data drift; swallow silently, we'd rather the user recover via forfeit-retry than crash the pipeline).
5. Update the `user_prestige_trials` row to `passed` + `ended_at = NOW()` + `final_exp_progress = progress`.
6. Clear `chat_user_data.active_trial_*`.
7. Invalidate `CHAT_USER_STATE_{userId}`.
8. Build broadcast text from `trial.reward_meta`:
   - `permanent_xp_multiplier` → `「永久 XP +${value*100}%」` (e.g., `+10%`)
   - `cooldown_tier_override` → `「律動精通」`
   - `group_bonus_double` → `「群組加成翻倍」`
   - `trigger_achievement` → `「啟程之證」` for departure (`achievement_slug: prestige_departure`); `「覺醒之證」` when meta also has `achievement_slug: prestige_awakening`
   - Fallback: the trial's `display_name`
9. Emit `trial_pass` broadcast (groupId = `groupIdHint` or fallback to `CHAT_USER_LAST_GROUP_{userId}`).
10. Return `{completed:true, trialId, trialStar}`.

**Text format** (spec line 297): `通過了 ★${star} 的試煉，永久解放 ${reward}`.

- [ ] **Step 1: Write failing tests (append)**

Append to `app/__tests__/service/PrestigeService.test.js`:

```js
describe("PrestigeService.checkTrialCompletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("returns completed:false when active_trial_id is null", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: null,
    });
    const result = await PrestigeService.checkTrialCompletion("Uabc", "Ggroup1");
    expect(result).toEqual({ completed: false });
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("returns completed:false when progress is below required_exp", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 1,
      active_trial_exp_progress: 1500,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
      reward_meta: { type: "trigger_achievement", achievement_slug: "prestige_departure" },
    });

    const result = await PrestigeService.checkTrialCompletion("Uabc", "Ggroup1");
    expect(result).toEqual({ completed: false });
  });

  it("passes the trial, clears active, emits trial_pass with groupIdHint", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 2,
      active_trial_exp_progress: 3100,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 2,
      slug: "hardship",
      star: 2,
      required_exp: 3000,
      reward_meta: { type: "permanent_xp_multiplier", value: 0.10 },
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 55,
      user_id: "Uabc",
      trial_id: 2,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    const result = await PrestigeService.checkTrialCompletion("Uabc", "Ghint");

    expect(UserPrestigeTrial.model.update).toHaveBeenCalledWith(
      55,
      expect.objectContaining({
        status: "passed",
        final_exp_progress: 3100,
      })
    );
    expect(ChatUserData.upsert).toHaveBeenCalledWith(
      "Uabc",
      expect.objectContaining({
        active_trial_id: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
      })
    );
    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uabc");
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Ghint",
      expect.objectContaining({
        type: "trial_pass",
        userId: "Uabc",
        text: "通過了 ★2 的試煉，永久解放 永久 XP +10%",
        payload: { trialId: 2, trialStar: 2, trialSlug: "hardship" },
      })
    );
    expect(result).toEqual({ completed: true, trialId: 2, trialStar: 2 });
  });

  it("falls back to CHAT_USER_LAST_GROUP when groupIdHint is null", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 1,
      active_trial_exp_progress: 2000,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "departure",
      star: 1,
      required_exp: 2000,
      reward_meta: { type: "trigger_achievement", achievement_slug: "prestige_departure" },
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 10,
      trial_id: 1,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce("Gfallback");

    await PrestigeService.checkTrialCompletion("Uabc", null);

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Gfallback",
      expect.objectContaining({ type: "trial_pass" })
    );
  });

  it("formats reward text for cooldown_tier_override as 律動精通", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 3,
      active_trial_exp_progress: 2500,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 3,
      slug: "rhythm",
      star: 3,
      required_exp: 2500,
      reward_meta: { type: "cooldown_tier_override", tiers: { "2-4": 0.7, "4-6": 0.9 } },
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 11,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    await PrestigeService.checkTrialCompletion("Uabc", "Gg");

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Gg",
      expect.objectContaining({
        text: "通過了 ★3 的試煉,永久解放 律動精通".replace(",", "，"),
      })
    );
  });

  it("formats reward text for group_bonus_double as 群組加成翻倍", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      active_trial_id: 4,
      active_trial_exp_progress: 2500,
    });
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce({
      id: 4,
      slug: "solitude",
      star: 4,
      required_exp: 2500,
      reward_meta: { type: "group_bonus_double" },
    });
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 12,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    await PrestigeService.checkTrialCompletion("Uabc", "Gg");

    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Gg",
      expect.objectContaining({ text: "通過了 ★4 的試煉，永久解放 群組加成翻倍" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: existing suites PASS; `checkTrialCompletion` suite FAIL.

- [ ] **Step 3: Implement `checkTrialCompletion`**

Edit `app/src/service/PrestigeService.js`:

```js
function formatTrialReward(rewardMeta, displayName) {
  if (!rewardMeta || typeof rewardMeta !== "object") return displayName || "獎勵";
  switch (rewardMeta.type) {
    case "permanent_xp_multiplier": {
      const pct = Math.round((rewardMeta.value || 0) * 100);
      return `永久 XP +${pct}%`;
    }
    case "cooldown_tier_override":
      return "律動精通";
    case "group_bonus_double":
      return "群組加成翻倍";
    case "trigger_achievement":
      if (rewardMeta.achievement_slug === "prestige_awakening") return "覺醒之證";
      return "啟程之證";
    default:
      return displayName || "獎勵";
  }
}

async function checkTrialCompletion(userId, groupIdHint) {
  const row = await ChatUserData.findByUserId(userId);
  if (!row || !row.active_trial_id) return { completed: false };

  const trial = await PrestigeTrial.findById(row.active_trial_id);
  if (!trial) return { completed: false };

  const progress = row.active_trial_exp_progress || 0;
  if (progress < trial.required_exp) return { completed: false };

  const active = await UserPrestigeTrial.findActiveByUserId(userId);
  if (!active) return { completed: false };

  const now = new Date();
  await UserPrestigeTrial.model.update(active.id, {
    status: "passed",
    ended_at: now,
    final_exp_progress: progress,
  });

  await ChatUserData.upsert(userId, {
    active_trial_id: null,
    active_trial_started_at: null,
    active_trial_exp_progress: 0,
  });

  await chatUserState.invalidate(userId);

  const groupId = groupIdHint || (await resolveLastGroup(userId));
  const rewardText = formatTrialReward(trial.reward_meta, trial.display_name);
  await broadcastQueue.pushEvent(groupId, {
    type: "trial_pass",
    userId,
    text: `通過了 ★${trial.star} 的試煉，永久解放 ${rewardText}`,
    payload: { trialId: trial.id, trialStar: trial.star, trialSlug: trial.slug },
  });

  return { completed: true, trialId: trial.id, trialStar: trial.star };
}

module.exports = { startTrial, forfeitTrial, checkTrialCompletion, PRESTIGE_CAP };
```

- [ ] **Step 4: Re-run tests**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: All tests PASS (startTrial 7 + forfeitTrial 4 + checkTrialCompletion 6 = 17).

- [ ] **Step 5: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/src/service/PrestigeService.js app/__tests__/service/PrestigeService.test.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): PrestigeService.checkTrialCompletion"
```

---

## Task 6: Pipeline integration — `onBatchWritten` hook (TDD)

**Files:**
- Modify: `app/src/service/chatXp/pipeline.js` — add `onBatchWritten` call + Lv.100 CTA detection
- Test: `app/__tests__/service/chatXp/pipeline.lifecycle.test.js` (NEW)

**Responsibility:** After the pipeline writes a batch, it must detect two events and fire hooks:

1. **Trial completion**: if the user had an `active_trial_id` during the batch, call `PrestigeService.checkTrialCompletion(userId, batchLastGroupId)`. Must happen even if the pipeline already wrote `active_trial_exp_progress` — checkTrialCompletion re-reads the fresh DB row.
2. **Lv.100 CTA**: if the batch crossed the user's `current_level` from `<100` to `===100`, emit one `lv_100_cta` broadcast. To detect "crossed": compare `prevLevel` (computed from `prevExp` before the batch write) vs `newLevel`. Must be exactly once per crossing — if the user is already at 100 (e.g. a prior batch already crossed, they didn't prestige, they kept chatting but got capped at 27000) the check `prevLevel < 100 && newLevel >= 100` naturally filters it.

**Where to emit Lv.100 CTA:** directly within `pipeline.js` using `broadcastQueue.pushEvent` — this isn't lifecycle-state-changing, so it doesn't need to live in PrestigeService. Keep PrestigeService focused on things that mutate user_prestige_trials / user_blessings / user_prestige_history.

**groupId for both hooks:** use the groupId of the last event in the batch (sorted by ts), since that's the one that triggered the state-change moment. This lets the broadcast land in the group where the message happened.

**Broadcast text for Lv.100 CTA** (spec line 165): `「已達成 Lv.100，可以前往 LIFF 進行轉生」`. Payload: `{ level: 100 }`.

**Edge case — trial-pass race with Lv.100 crossing:** if the same batch both completes a trial AND crosses Lv.100, fire both broadcasts (order: trial_pass first, lv_100_cta second). Both are observable to players, both are useful.

### Modifications to `pipeline.js`

Add these imports at the top:

```js
const PrestigeService = require("../PrestigeService");
const broadcastQueue = require("../../util/broadcastQueue");
```

Restructure `writeBatch` so it returns enough info for the hook, then add the hook call in `processUserEvents`:

```js
async function writeBatch(userId, state, batch) {
  const existing = await ChatUserData.findByUserId(userId);
  const prevExp = existing?.current_exp ?? 0;
  const prevLevel = existing?.current_level ?? 0;
  const prevTrialProgress = existing?.active_trial_exp_progress ?? 0;
  const activeTrialId = existing?.active_trial_id ?? null;
  const newExp = Math.min(LEVEL_CAP_EXP, prevExp + batch.effectiveDelta);
  const newLevel = ChatExpUnit.getLevelFromExp(newExp, batch.expUnitRows);

  const updates = { current_exp: newExp, current_level: newLevel };
  if (activeTrialId) {
    updates.active_trial_exp_progress = prevTrialProgress + batch.effectiveDelta;
  }

  await ChatUserData.upsert(userId, updates);
  await ChatExpDaily.upsertByUserDate({
    userId,
    date: batch.today,
    rawExp: batch.rawDelta,
    effectiveExp: batch.effectiveDelta,
    msgCount: batch.msgCount,
    honeymoonActive: state.prestige_count === 0,
    trialId: activeTrialId,
  });
  for (const rec of batch.eventRecords) {
    await ChatExpEvent.insertEvent(rec);
  }

  return { prevLevel, newLevel, hadActiveTrial: Boolean(activeTrialId) };
}
```

Then in `processUserEvents`, after `writeBatch` returns, invoke the hook:

```js
async function processUserEvents(userId, events, ctx) {
  // ... existing per-event loop unchanged ...

  if (rawDelta === 0 && msgCount === 0) return;

  const batchLastGroupId = events[events.length - 1].groupId;
  const result = await writeBatch(userId, state, {
    today: ctx.today,
    expUnitRows: ctx.expUnitRows,
    rawDelta,
    effectiveDelta,
    msgCount,
    eventRecords,
  });

  await onBatchWritten(userId, result, batchLastGroupId);
}

async function onBatchWritten(userId, batchResult, groupId) {
  if (batchResult.hadActiveTrial) {
    // checkTrialCompletion is idempotent: if progress is still short, it no-ops.
    await PrestigeService.checkTrialCompletion(userId, groupId);
  }

  if (batchResult.prevLevel < 100 && batchResult.newLevel >= 100) {
    await broadcastQueue.pushEvent(groupId, {
      type: "lv_100_cta",
      userId,
      text: "已達成 Lv.100，可以前往 LIFF 進行轉生",
      payload: { level: 100 },
    });
  }
}
```

Export `onBatchWritten` for testability (unit-test the hook directly without running the full pipeline):

```js
module.exports = { processBatch, __onBatchWritten: onBatchWritten };
```

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/service/chatXp/pipeline.lifecycle.test.js`:

```js
const pipeline = require("../../../src/service/chatXp/pipeline");
const PrestigeService = require("../../../src/service/PrestigeService");
const broadcastQueue = require("../../../src/util/broadcastQueue");

describe("pipeline.__onBatchWritten", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(PrestigeService, "checkTrialCompletion").mockResolvedValue({ completed: false });
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("does nothing when there was no active trial and no Lv.100 crossing", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 40, newLevel: 42, hadActiveTrial: false },
      "Glast"
    );
    expect(PrestigeService.checkTrialCompletion).not.toHaveBeenCalled();
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("calls checkTrialCompletion with groupId when hadActiveTrial is true", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 40, newLevel: 42, hadActiveTrial: true },
      "Glast"
    );
    expect(PrestigeService.checkTrialCompletion).toHaveBeenCalledWith("Uabc", "Glast");
  });

  it("emits lv_100_cta when batch crosses level 100", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 99, newLevel: 100, hadActiveTrial: false },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({
        type: "lv_100_cta",
        userId: "Uabc",
        text: "已達成 Lv.100，可以前往 LIFF 進行轉生",
        payload: { level: 100 },
      })
    );
  });

  it("does NOT emit lv_100_cta when prevLevel is already 100", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 100, newLevel: 100, hadActiveTrial: false },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("does NOT emit lv_100_cta when newLevel is below 100", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 98, newLevel: 99, hadActiveTrial: false },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).not.toHaveBeenCalled();
  });

  it("emits both trial pass (via checkTrialCompletion) and lv_100_cta when batch triggers both", async () => {
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 99, newLevel: 100, hadActiveTrial: true },
      "Glast"
    );
    expect(PrestigeService.checkTrialCompletion).toHaveBeenCalledWith("Uabc", "Glast");
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({ type: "lv_100_cta" })
    );
  });

  it("handles big jumps (e.g. 90 → 105 after cap) as a crossing", async () => {
    // newLevel is clamped to 100 in writeBatch due to LEVEL_CAP_EXP, but defend.
    await pipeline.__onBatchWritten(
      "Uabc",
      { prevLevel: 90, newLevel: 100, hadActiveTrial: false },
      "Glast"
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({ type: "lv_100_cta" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/pipeline.lifecycle.test.js`
Expected: All FAIL (`pipeline.__onBatchWritten` is undefined).

- [ ] **Step 3: Modify `pipeline.js`**

Edit `app/src/service/chatXp/pipeline.js`:

1. Add imports at top (after existing imports):
   ```js
   const PrestigeService = require("../PrestigeService");
   const broadcastQueue = require("../../util/broadcastQueue");
   ```

2. Change `writeBatch` to return `{prevLevel, newLevel, hadActiveTrial}`:
   Replace the existing `writeBatch` function with the version shown above (compute `prevLevel`, return the summary).

3. Modify `processUserEvents` to capture the return value and call the hook. Replace the tail section after `if (rawDelta === 0 && msgCount === 0) return;` with:
   ```js
     const batchLastGroupId = events[events.length - 1].groupId;
     const result = await writeBatch(userId, state, {
       today: ctx.today,
       expUnitRows: ctx.expUnitRows,
       rawDelta,
       effectiveDelta,
       msgCount,
       eventRecords,
     });

     await onBatchWritten(userId, result, batchLastGroupId);
   }
   ```

4. Add `onBatchWritten` function (after `writeBatch`):
   ```js
   async function onBatchWritten(userId, batchResult, groupId) {
     if (batchResult.hadActiveTrial) {
       await PrestigeService.checkTrialCompletion(userId, groupId);
     }
     if (batchResult.prevLevel < 100 && batchResult.newLevel >= 100) {
       await broadcastQueue.pushEvent(groupId, {
         type: "lv_100_cta",
         userId,
         text: "已達成 Lv.100，可以前往 LIFF 進行轉生",
         payload: { level: 100 },
       });
     }
   }
   ```

5. Update the exports:
   ```js
   module.exports = { processBatch, __onBatchWritten: onBatchWritten };
   ```

- [ ] **Step 4: Re-run the new lifecycle tests**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/pipeline.lifecycle.test.js`
Expected: All 7 tests PASS.

- [ ] **Step 5: Re-run existing pipeline tests to verify no regression**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/pipeline.test.js`
Expected: All M2 pipeline tests still PASS. If `writeBatch` contract changes broke anything, fix the test expectations — do not change behavior.

Common regression: existing pipeline tests may expect `processUserEvents` to complete without calling `onBatchWritten`. Since `hadActiveTrial:false + prevLevel<100` is now the default, the new call is a no-op — but if a test mocked `chatUserState.load` with an active_trial_id, the new call will fire `PrestigeService.checkTrialCompletion`. If such a test exists, stub `PrestigeService.checkTrialCompletion` in that test's `beforeEach`.

- [ ] **Step 6: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/src/service/chatXp/pipeline.js app/__tests__/service/chatXp/pipeline.lifecycle.test.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): pipeline onBatchWritten hook (trial pass + Lv.100 CTA)"
```

---

## Task 7: `PrestigeService.prestige` (TDD)

**Files:**
- Modify: `app/src/service/PrestigeService.js` (add `prestige`)
- Modify: `app/__tests__/service/PrestigeService.test.js` (append block)

**Contract:**

```js
/**
 * Consume one passed-but-unused trial + one unused blessing and prestige the user.
 * @param {string} userId
 * @param {number} blessingId — prestige_blessings.id (1-7)
 * @returns {Promise<{
 *   ok:true, newPrestigeCount:number, trialId:number, blessingId:number,
 *   awakened:boolean, groupId:string|null
 * }>}
 * @throws {Error} with codes:
 *   - 'AWAKENED'
 *   - 'NOT_LEVEL_100'
 *   - 'NO_PASSED_TRIAL'
 *   - 'INVALID_BLESSING'
 *   - 'BLESSING_ALREADY_OWNED'
 */
async function prestige(userId, blessingId) { ... }
```

**Algorithm:**
1. Look up `chat_user_data`. If missing or `prestige_count >= 5` → throw `AWAKENED`.
2. If `current_level < 100` → throw `NOT_LEVEL_100`.
3. Look up blessing (`PrestigeBlessing.findById`). If not found → throw `INVALID_BLESSING`.
4. Look up user's blessings (`UserBlessing.listBlessingIdsByUserId`). If `blessingId` is in the list → throw `BLESSING_ALREADY_OWNED`.
5. Compute `passedButUnused`:
   - `passedRows = UserPrestigeTrial.listPassedByUserId(userId)` (already sorted by `ended_at asc`)
   - `historyRows = UserPrestigeHistory.listByUserId(userId)` (sorted by `prestige_count_after asc`)
   - `consumedTrialIds = new Set(historyRows.map(r => r.trial_id))`
   - `passedButUnused = passedRows.filter(r => !consumedTrialIds.has(r.trial_id))`
6. If `passedButUnused.length === 0` → throw `NO_PASSED_TRIAL`.
7. Claim the earliest: `claimed = passedButUnused[0]`.
8. Compute `cycleStartedAt`:
   - If `row.prestige_count === 0` (first prestige) → `row.created_at` (the chat_user_data creation time; initialized at migration T-0 or at user's first XP write)
   - Else → `UserPrestigeHistory.latestByUserId(userId).prestiged_at` (the previous cycle's completion time)
9. `newPrestigeCount = row.prestige_count + 1`.
10. `awakened = (newPrestigeCount === 5)`.
11. Insert `user_blessings`: `{user_id, blessing_id: blessingId, acquired_at_prestige: newPrestigeCount, acquired_at: NOW()}`.
12. Insert `user_prestige_history`: `{user_id, prestige_count_after: newPrestigeCount, trial_id: claimed.trial_id, blessing_id: blessingId, cycle_started_at: cycleStartedAt, prestiged_at: NOW()}`.
13. Update `chat_user_data`: `{prestige_count: newPrestigeCount, current_level: 0, current_exp: 0, awakened_at: awakened ? NOW() : null}`.
14. Invalidate `CHAT_USER_STATE_{userId}`.
15. Resolve `groupId` from `CHAT_USER_LAST_GROUP_{userId}`.
16. Emit `prestige` broadcast: `「完成第 N 次轉生，選擇了祝福『${blessing.display_name}』」`. Payload: `{prestigeCount: newPrestigeCount, trialId, blessingId, blessingSlug}`.
17. If `awakened`, emit additional `awakening` broadcast: `「達成覺醒！」`. Payload: `{prestigeCount: 5}`.
18. Return `{ok: true, newPrestigeCount, trialId, blessingId, awakened, groupId}`.

**Note on `awakened_at`:** if the user is not awakened, the field stays `null` (don't overwrite). Using `null` in `ChatUserData.upsert` will set it to SQL NULL, which is what we want (unchanged from previous NULL). If for some reason awakened_at was already set and we're prestiging again (impossible due to AWAKENED guard, but defensive), we'd keep it — but the guard prevents this.

**Transactional note:** like M2, we don't wrap in a DB transaction. The four writes (`user_blessings`, `user_prestige_history`, `chat_user_data`, state invalidate) are sequential; a crash between steps 11 and 13 would leave orphan rows in user_blessings / user_prestige_history without the chat_user_data update. Accepted for v1: the invariant reconstructor is `prestige_count = history.length`. A follow-up in M8+ could add a consistency check.

- [ ] **Step 1: Write failing tests (append)**

Append to `app/__tests__/service/PrestigeService.test.js`:

```js
const PrestigeBlessing = require("../../src/model/application/PrestigeBlessing");
const UserBlessing = require("../../src/model/application/UserBlessing");
const UserPrestigeHistory = require("../../src/model/application/UserPrestigeHistory");

describe("PrestigeService.prestige", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  it("prestige_count 0 → 1: claims FIFO passed trial, inserts history & blessing, emits prestige broadcast", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      current_level: 100,
      current_exp: 27000,
      active_trial_id: null,
      created_at: new Date("2026-04-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "language_gift",
      display_name: "語言天賦",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 1, trial_id: 1, status: "passed", ended_at: new Date("2026-05-01T00:00:00Z") },
    ]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(99);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(100);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce("Glast");

    const result = await PrestigeService.prestige("Uabc", 1);

    expect(UserBlessing.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "Uabc",
        blessing_id: 1,
        acquired_at_prestige: 1,
      })
    );
    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "Uabc",
        prestige_count_after: 1,
        trial_id: 1,
        blessing_id: 1,
        cycle_started_at: new Date("2026-04-01T00:00:00Z"),
      })
    );
    expect(ChatUserData.upsert).toHaveBeenCalledWith(
      "Uabc",
      expect.objectContaining({
        prestige_count: 1,
        current_level: 0,
        current_exp: 0,
        awakened_at: null,
      })
    );
    expect(broadcastQueue.pushEvent).toHaveBeenCalledWith(
      "Glast",
      expect.objectContaining({
        type: "prestige",
        userId: "Uabc",
        text: "完成第 1 次轉生，選擇了祝福『語言天賦』",
        payload: {
          prestigeCount: 1,
          trialId: 1,
          blessingId: 1,
          blessingSlug: "language_gift",
        },
      })
    );
    // Only prestige event, no awakening
    expect(broadcastQueue.pushEvent).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      ok: true,
      newPrestigeCount: 1,
      trialId: 1,
      blessingId: 1,
      awakened: false,
      groupId: "Glast",
    });
  });

  it("prestige_count 4 → 5: awakens, writes awakened_at, emits BOTH prestige and awakening", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uold",
      prestige_count: 4,
      current_level: 100,
      current_exp: 27000,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 5,
      slug: "rhythm_spring",
      display_name: "節律之泉",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1, 2, 4, 6]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 10, trial_id: 1, ended_at: new Date("2026-02-01T00:00:00Z") },
      { id: 11, trial_id: 2, ended_at: new Date("2026-03-01T00:00:00Z") },
      { id: 12, trial_id: 3, ended_at: new Date("2026-04-01T00:00:00Z") },
      { id: 13, trial_id: 4, ended_at: new Date("2026-05-01T00:00:00Z") },
      { id: 14, trial_id: 5, ended_at: new Date("2026-06-01T00:00:00Z") },
    ]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([
      { prestige_count_after: 1, trial_id: 1, prestiged_at: new Date("2026-02-10T00:00:00Z") },
      { prestige_count_after: 2, trial_id: 2, prestiged_at: new Date("2026-03-10T00:00:00Z") },
      { prestige_count_after: 3, trial_id: 3, prestiged_at: new Date("2026-04-10T00:00:00Z") },
      { prestige_count_after: 4, trial_id: 4, prestiged_at: new Date("2026-05-10T00:00:00Z") },
    ]);
    jest.spyOn(UserPrestigeHistory, "latestByUserId").mockResolvedValueOnce({
      prestige_count_after: 4,
      prestiged_at: new Date("2026-05-10T00:00:00Z"),
    });
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(2);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);
    redis.get.mockResolvedValueOnce("Gg");

    const result = await PrestigeService.prestige("Uold", 5);

    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        prestige_count_after: 5,
        trial_id: 5, // FIFO: unused passes are [5]
        blessing_id: 5,
        cycle_started_at: new Date("2026-05-10T00:00:00Z"),
      })
    );
    const upsertArgs = ChatUserData.upsert.mock.calls[0][1];
    expect(upsertArgs.prestige_count).toBe(5);
    expect(upsertArgs.current_level).toBe(0);
    expect(upsertArgs.current_exp).toBe(0);
    expect(upsertArgs.awakened_at).toBeInstanceOf(Date);

    expect(broadcastQueue.pushEvent).toHaveBeenCalledTimes(2);
    expect(broadcastQueue.pushEvent).toHaveBeenNthCalledWith(
      1,
      "Gg",
      expect.objectContaining({ type: "prestige" })
    );
    expect(broadcastQueue.pushEvent).toHaveBeenNthCalledWith(
      2,
      "Gg",
      expect.objectContaining({
        type: "awakening",
        text: "達成覺醒！",
        payload: { prestigeCount: 5 },
      })
    );
    expect(result.awakened).toBe(true);
  });

  it("claims FIFO earliest-passed trial when multiple passes are unused", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Udefer",
      prestige_count: 0,
      current_level: 100,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "language_gift",
      display_name: "語言天賦",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 1, trial_id: 1, ended_at: new Date("2026-03-01T00:00:00Z") },
      { id: 2, trial_id: 3, ended_at: new Date("2026-03-20T00:00:00Z") },
    ]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    await PrestigeService.prestige("Udefer", 1);

    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({ trial_id: 1 })
    );
  });

  it("throws AWAKENED when prestige_count is 5", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uawake",
      prestige_count: 5,
      current_level: 100,
    });
    await expect(PrestigeService.prestige("Uawake", 1)).rejects.toMatchObject({ code: "AWAKENED" });
  });

  it("throws NOT_LEVEL_100 when current_level < 100", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Ulow",
      prestige_count: 0,
      current_level: 99,
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "language_gift",
      display_name: "語言天賦",
    });

    await expect(PrestigeService.prestige("Ulow", 1)).rejects.toMatchObject({
      code: "NOT_LEVEL_100",
    });
  });

  it("throws INVALID_BLESSING for unknown blessingId", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 0,
      current_level: 100,
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce(null);
    await expect(PrestigeService.prestige("Uabc", 99)).rejects.toMatchObject({
      code: "INVALID_BLESSING",
    });
  });

  it("throws BLESSING_ALREADY_OWNED when user already has this blessing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 2,
      current_level: 100,
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 1,
      slug: "language_gift",
      display_name: "語言天賦",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1, 4]);
    await expect(PrestigeService.prestige("Uabc", 1)).rejects.toMatchObject({
      code: "BLESSING_ALREADY_OWNED",
    });
  });

  it("throws NO_PASSED_TRIAL when no passed trials are unconsumed", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 1,
      current_level: 100,
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 2,
      slug: "swift_tongue",
      display_name: "迅雷語速",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 1, trial_id: 1 },
    ]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([
      { trial_id: 1, prestige_count_after: 1 },
    ]);
    await expect(PrestigeService.prestige("Uabc", 2)).rejects.toMatchObject({
      code: "NO_PASSED_TRIAL",
    });
  });

  it("uses UserPrestigeHistory.latestByUserId for cycle_started_at on subsequent prestiges", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uabc",
      prestige_count: 1,
      current_level: 100,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce({
      id: 2,
      slug: "swift_tongue",
      display_name: "迅雷語速",
    });
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 1, trial_id: 1 },
      { id: 2, trial_id: 2 },
    ]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([
      { prestige_count_after: 1, trial_id: 1 },
    ]);
    jest.spyOn(UserPrestigeHistory, "latestByUserId").mockResolvedValueOnce({
      prestige_count_after: 1,
      prestiged_at: new Date("2026-03-15T00:00:00Z"),
    });
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(1);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValueOnce(1);

    await PrestigeService.prestige("Uabc", 2);

    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cycle_started_at: new Date("2026-03-15T00:00:00Z"),
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify the new block fails**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: earlier suites PASS; prestige suite FAIL (`PrestigeService.prestige is not a function`).

- [ ] **Step 3: Implement `prestige`**

Edit `app/src/service/PrestigeService.js`:

1. Add imports near the top:
   ```js
   const PrestigeBlessing = require("../model/application/PrestigeBlessing");
   const UserBlessing = require("../model/application/UserBlessing");
   const UserPrestigeHistory = require("../model/application/UserPrestigeHistory");
   ```

2. Add the function:
   ```js
   async function prestige(userId, blessingId) {
     const row = await ChatUserData.findByUserId(userId);
     if (!row || row.prestige_count >= PRESTIGE_CAP) {
       throw error("AWAKENED", "User is awakened or not initialized");
     }
     if ((row.current_level || 0) < 100) {
       throw error("NOT_LEVEL_100", "User must be Lv.100 to prestige");
     }

     const blessing = await PrestigeBlessing.findById(blessingId);
     if (!blessing) {
       throw error("INVALID_BLESSING", `Blessing ${blessingId} does not exist`);
     }

     const ownedBlessingIds = await UserBlessing.listBlessingIdsByUserId(userId);
     if (ownedBlessingIds.includes(blessingId)) {
       throw error("BLESSING_ALREADY_OWNED", `Blessing ${blessingId} already owned`);
     }

     const passedRows = await UserPrestigeTrial.listPassedByUserId(userId);
     const historyRows = await UserPrestigeHistory.listByUserId(userId);
     const consumedTrialIds = new Set(historyRows.map(h => h.trial_id));
     const passedButUnused = passedRows.filter(p => !consumedTrialIds.has(p.trial_id));
     if (passedButUnused.length === 0) {
       throw error("NO_PASSED_TRIAL", "No passed trial available to consume");
     }

     const claimed = passedButUnused[0]; // FIFO
     const newPrestigeCount = row.prestige_count + 1;
     const awakened = newPrestigeCount === PRESTIGE_CAP;

     let cycleStartedAt;
     if (row.prestige_count === 0) {
       cycleStartedAt = row.created_at || new Date();
     } else {
       const latest = await UserPrestigeHistory.latestByUserId(userId);
       cycleStartedAt = latest?.prestiged_at || row.created_at || new Date();
     }

     const now = new Date();

     await UserBlessing.model.create({
       user_id: userId,
       blessing_id: blessingId,
       acquired_at_prestige: newPrestigeCount,
       acquired_at: now,
     });

     await UserPrestigeHistory.model.create({
       user_id: userId,
       prestige_count_after: newPrestigeCount,
       trial_id: claimed.trial_id,
       blessing_id: blessingId,
       cycle_started_at: cycleStartedAt,
       prestiged_at: now,
     });

     await ChatUserData.upsert(userId, {
       prestige_count: newPrestigeCount,
       current_level: 0,
       current_exp: 0,
       awakened_at: awakened ? now : null,
     });

     await chatUserState.invalidate(userId);

     const groupId = await resolveLastGroup(userId);
     await broadcastQueue.pushEvent(groupId, {
       type: "prestige",
       userId,
       text: `完成第 ${newPrestigeCount} 次轉生，選擇了祝福『${blessing.display_name}』`,
       payload: {
         prestigeCount: newPrestigeCount,
         trialId: claimed.trial_id,
         blessingId,
         blessingSlug: blessing.slug,
       },
     });

     if (awakened) {
       await broadcastQueue.pushEvent(groupId, {
         type: "awakening",
         userId,
         text: "達成覺醒！",
         payload: { prestigeCount: PRESTIGE_CAP },
       });
     }

     return {
       ok: true,
       newPrestigeCount,
       trialId: claimed.trial_id,
       blessingId,
       awakened,
       groupId,
     };
   }

   module.exports = {
     startTrial,
     forfeitTrial,
     checkTrialCompletion,
     prestige,
     PRESTIGE_CAP,
   };
   ```

- [ ] **Step 4: Re-run all PrestigeService tests**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: All suites PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/src/service/PrestigeService.js app/__tests__/service/PrestigeService.test.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): PrestigeService.prestige + awakening"
```

---

## Task 8: `PrestigeService.getPrestigeStatus` — read model for API/UI (TDD)

**Files:**
- Modify: `app/src/service/PrestigeService.js` (add `getPrestigeStatus`)
- Modify: `app/__tests__/service/PrestigeService.test.js` (append block)

**Responsibility:** A pure read that M6's LIFF API will call to render the Prestige home page. It returns everything needed to decide what CTAs to show: current state, active trial progress, which trials/blessings are still available.

**Contract:**

```js
/**
 * @param {string} userId
 * @returns {Promise<{
 *   userId: string,
 *   prestigeCount: number,
 *   awakened: boolean,
 *   currentLevel: number,
 *   currentExp: number,
 *   canPrestige: boolean,        // true iff Lv.100 AND has unconsumed passed trial AND prestige_count < 5
 *   activeTrial: null | {
 *     id: number, slug: string, star: number, displayName: string,
 *     requiredExp: number, progress: number, startedAt: Date,
 *     expiresAt: Date   // startedAt + duration_days
 *   },
 *   availableTrials: Array<{id, slug, star, displayName, requiredExp, restrictionMeta, rewardMeta}>,
 *   availableBlessings: Array<{id, slug, displayName, effectMeta}>,
 *   ownedBlessings: number[],   // blessing_ids
 *   passedTrialIds: number[],
 *   hasUnconsumedPassedTrial: boolean
 * }>}
 */
async function getPrestigeStatus(userId) { ... }
```

**Algorithm:**
1. Load `chat_user_data` (`ChatUserData.findByUserId`). If missing, return a "fresh user" shape with all zeros and the full trial/blessing lists as available.
2. Load `PrestigeTrial.all()` and `PrestigeBlessing.all()`.
3. Load `UserPrestigeTrial.listPassedByUserId`, `UserBlessing.listBlessingIdsByUserId`, `UserPrestigeHistory.listByUserId`.
4. `passedTrialIds = passedRows.map(p => p.trial_id)`; `consumedTrialIds = history.map(h => h.trial_id)` → `unconsumedTrialIds = passedTrialIds \ consumedTrialIds` (array subtraction, preserve order).
5. `availableTrials` = all trials excluding those already passed (spec line 142: "擇取一個尚未通過的試煉").
6. `availableBlessings` = all blessings excluding those owned.
7. Build `activeTrial` from `chat_user_data.active_trial_*` + the trial config lookup. `expiresAt = startedAt + duration_days * 86_400_000 ms`.
8. `awakened = prestige_count === 5`.
9. `canPrestige = (current_level >= 100) && (prestige_count < 5) && (unconsumedTrialIds.length > 0) && (availableBlessings.length > 0)`.

- [ ] **Step 1: Write failing tests**

Append to `app/__tests__/service/PrestigeService.test.js`:

```js
describe("PrestigeService.getPrestigeStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns fresh-user shape when chat_user_data is missing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(null);
    jest.spyOn(PrestigeTrial, "all").mockResolvedValueOnce([
      { id: 1, slug: "departure", star: 1, display_name: "啟程", required_exp: 2000 },
      { id: 2, slug: "hardship", star: 2, display_name: "刻苦", required_exp: 3000 },
    ]);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValueOnce([
      { id: 1, slug: "language_gift", display_name: "語言天賦", effect_meta: {} },
    ]);

    const status = await PrestigeService.getPrestigeStatus("Unew");

    expect(status.userId).toBe("Unew");
    expect(status.prestigeCount).toBe(0);
    expect(status.awakened).toBe(false);
    expect(status.currentLevel).toBe(0);
    expect(status.canPrestige).toBe(false);
    expect(status.activeTrial).toBeNull();
    expect(status.availableTrials).toHaveLength(2);
    expect(status.availableBlessings).toHaveLength(1);
    expect(status.ownedBlessings).toEqual([]);
    expect(status.passedTrialIds).toEqual([]);
    expect(status.hasUnconsumedPassedTrial).toBe(false);
  });

  it("returns active trial with startedAt + expiresAt when an active trial exists", async () => {
    const startedAt = new Date("2026-04-01T00:00:00Z");
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uactive",
      prestige_count: 0,
      current_level: 40,
      current_exp: 4320,
      active_trial_id: 3,
      active_trial_started_at: startedAt,
      active_trial_exp_progress: 1100,
    });
    jest.spyOn(PrestigeTrial, "all").mockResolvedValueOnce([
      {
        id: 3,
        slug: "rhythm",
        star: 3,
        display_name: "律動",
        required_exp: 2500,
        duration_days: 60,
      },
    ]);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);

    const status = await PrestigeService.getPrestigeStatus("Uactive");
    expect(status.activeTrial).toEqual({
      id: 3,
      slug: "rhythm",
      star: 3,
      displayName: "律動",
      requiredExp: 2500,
      progress: 1100,
      startedAt,
      expiresAt: new Date(startedAt.getTime() + 60 * 86_400_000),
    });
  });

  it("excludes passed trials from availableTrials; excludes owned blessings from availableBlessings", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Upart",
      prestige_count: 2,
      current_level: 100,
      current_exp: 27000,
      active_trial_id: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeTrial, "all").mockResolvedValueOnce([
      { id: 1, slug: "departure", star: 1, display_name: "啟程", required_exp: 2000 },
      { id: 2, slug: "hardship", star: 2, display_name: "刻苦", required_exp: 3000 },
      { id: 3, slug: "rhythm", star: 3, display_name: "律動", required_exp: 2500 },
    ]);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValueOnce([
      { id: 1, slug: "language_gift", display_name: "語言天賦", effect_meta: {} },
      { id: 4, slug: "whispering", display_name: "絮語之心", effect_meta: {} },
    ]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 10, trial_id: 1 },
      { id: 11, trial_id: 2 },
    ]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([
      { prestige_count_after: 1, trial_id: 1 },
      { prestige_count_after: 2, trial_id: 2 },
    ]);

    const status = await PrestigeService.getPrestigeStatus("Upart");
    expect(status.availableTrials.map(t => t.id)).toEqual([3]);
    expect(status.availableBlessings.map(b => b.id)).toEqual([4]);
    expect(status.passedTrialIds).toEqual([1, 2]);
    expect(status.hasUnconsumedPassedTrial).toBe(false);
    expect(status.canPrestige).toBe(false); // no unconsumed passed trial
  });

  it("canPrestige=true when Lv.100 + unconsumed passed trial + unused blessing", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uready",
      prestige_count: 0,
      current_level: 100,
      current_exp: 27000,
      active_trial_id: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeTrial, "all").mockResolvedValueOnce([
      { id: 1, slug: "departure", star: 1, display_name: "啟程", required_exp: 2000 },
    ]);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValueOnce([
      { id: 1, slug: "language_gift", display_name: "語言天賦", effect_meta: {} },
    ]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([
      { id: 10, trial_id: 1 },
    ]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);

    const status = await PrestigeService.getPrestigeStatus("Uready");
    expect(status.canPrestige).toBe(true);
    expect(status.hasUnconsumedPassedTrial).toBe(true);
  });

  it("awakened=true when prestige_count === 5, canPrestige=false", async () => {
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
      user_id: "Uawake",
      prestige_count: 5,
      current_level: 30,
      current_exp: 2430,
      awakened_at: new Date("2026-06-01T00:00:00Z"),
    });
    jest.spyOn(PrestigeTrial, "all").mockResolvedValueOnce([]);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);

    const status = await PrestigeService.getPrestigeStatus("Uawake");
    expect(status.awakened).toBe(true);
    expect(status.canPrestige).toBe(false);
    expect(status.prestigeCount).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: new suite FAILS.

- [ ] **Step 3: Implement `getPrestigeStatus`**

Add to `app/src/service/PrestigeService.js`:

```js
async function getPrestigeStatus(userId) {
  const [row, allTrials, allBlessings] = await Promise.all([
    ChatUserData.findByUserId(userId),
    PrestigeTrial.all(),
    PrestigeBlessing.all(),
  ]);

  const prestigeCount = row?.prestige_count ?? 0;
  const currentLevel = row?.current_level ?? 0;
  const currentExp = row?.current_exp ?? 0;
  const awakened = prestigeCount >= PRESTIGE_CAP;
  const activeTrialId = row?.active_trial_id ?? null;
  const activeTrialStartedAt = row?.active_trial_started_at ?? null;
  const activeTrialProgress = row?.active_trial_exp_progress ?? 0;

  const [passedRows, ownedBlessings, historyRows] = row
    ? await Promise.all([
        UserPrestigeTrial.listPassedByUserId(userId),
        UserBlessing.listBlessingIdsByUserId(userId),
        UserPrestigeHistory.listByUserId(userId),
      ])
    : [[], [], []];

  const passedTrialIds = passedRows.map(p => p.trial_id);
  const passedSet = new Set(passedTrialIds);
  const consumedTrialIds = new Set(historyRows.map(h => h.trial_id));
  const unconsumedTrialIds = passedTrialIds.filter(id => !consumedTrialIds.has(id));

  const availableTrials = allTrials
    .filter(t => !passedSet.has(t.id))
    .map(t => ({
      id: t.id,
      slug: t.slug,
      star: t.star,
      displayName: t.display_name,
      requiredExp: t.required_exp,
      restrictionMeta: t.restriction_meta,
      rewardMeta: t.reward_meta,
    }));

  const ownedSet = new Set(ownedBlessings);
  const availableBlessings = allBlessings
    .filter(b => !ownedSet.has(b.id))
    .map(b => ({
      id: b.id,
      slug: b.slug,
      displayName: b.display_name,
      effectMeta: b.effect_meta,
    }));

  let activeTrial = null;
  if (activeTrialId) {
    const cfg = allTrials.find(t => t.id === activeTrialId);
    if (cfg) {
      const startedAt = activeTrialStartedAt instanceof Date
        ? activeTrialStartedAt
        : new Date(activeTrialStartedAt);
      activeTrial = {
        id: cfg.id,
        slug: cfg.slug,
        star: cfg.star,
        displayName: cfg.display_name,
        requiredExp: cfg.required_exp,
        progress: activeTrialProgress,
        startedAt,
        expiresAt: new Date(startedAt.getTime() + (cfg.duration_days || 60) * 86_400_000),
      };
    }
  }

  const canPrestige =
    currentLevel >= 100 &&
    prestigeCount < PRESTIGE_CAP &&
    unconsumedTrialIds.length > 0 &&
    availableBlessings.length > 0;

  return {
    userId,
    prestigeCount,
    awakened,
    currentLevel,
    currentExp,
    canPrestige,
    activeTrial,
    availableTrials,
    availableBlessings,
    ownedBlessings,
    passedTrialIds,
    hasUnconsumedPassedTrial: unconsumedTrialIds.length > 0,
  };
}

module.exports = {
  startTrial,
  forfeitTrial,
  checkTrialCompletion,
  prestige,
  getPrestigeStatus,
  PRESTIGE_CAP,
};
```

- [ ] **Step 4: Re-run tests**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/src/service/PrestigeService.js app/__tests__/service/PrestigeService.test.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): PrestigeService.getPrestigeStatus"
```

---

## Task 9: `TrialExpiryCheck` cron — 60-day expiry (TDD)

**Files:**
- Create: `app/bin/TrialExpiryCheck.js`
- Test: `app/__tests__/bin/TrialExpiryCheck.test.js`

**Responsibility:** Nightly cron that finds any `user_prestige_trials` row with `status='active' AND started_at < NOW() - INTERVAL <duration_days> DAY`, flips it to `failed`, clears `chat_user_data.active_trial_*`, invalidates `CHAT_USER_STATE_{userId}`. No broadcast (spec line 303).

**Note on duration:** spec says 60 days (line 101, 152). The value lives in `prestige_trials.duration_days`. For v1 all rows are seeded to 60. We'll read from `prestige_trials` to keep it data-driven, but we accept the join cost (5 rows, tiny). Actually — to keep the cron dead simple, we hardcode 60 days and let the data-driven generalization come in M3.5 if needed. The cron comment notes this.

**Algorithm:**
1. Select all active trials older than 60 days:
   ```sql
   SELECT upt.id, upt.user_id, cud.active_trial_exp_progress
   FROM user_prestige_trials upt
   JOIN chat_user_data cud ON cud.user_id = upt.user_id AND cud.active_trial_id = upt.trial_id
   WHERE upt.status = 'active' AND upt.started_at < NOW() - INTERVAL 60 DAY
   ```
   (If for some reason `chat_user_data.active_trial_id` is already NULL — e.g., race with forfeit — the JOIN drops the row. We also need to handle that drift. Run a second query for "orphans": rows with status='active' whose user's `active_trial_id` no longer matches. On expiry we care about expiring the row; progress is 0 fallback.)
2. For each row: update `user_prestige_trials` → `status='failed', ended_at=NOW(), final_exp_progress=<progress>`; update `chat_user_data` → clear active; invalidate state.
3. Also handle orphan rows: `WHERE status='active' AND started_at < NOW() - INTERVAL 60 DAY AND NOT EXISTS (...)` — just expire the row.

To keep the cron simple, use two separate passes:

```js
async function expireActiveTrials() {
  const matched = await mysql("user_prestige_trials as upt")
    .join("chat_user_data as cud", function () {
      this.on("cud.user_id", "upt.user_id").andOn("cud.active_trial_id", "upt.trial_id");
    })
    .where("upt.status", "active")
    .where("upt.started_at", "<", mysql.raw("NOW() - INTERVAL 60 DAY"))
    .select("upt.id", "upt.user_id", "cud.active_trial_exp_progress as progress");

  for (const row of matched) {
    await expireOne({
      id: row.id,
      userId: row.user_id,
      progress: row.progress || 0,
      clearChatUserData: true,
    });
  }

  const orphans = await mysql("user_prestige_trials")
    .where("status", "active")
    .where("started_at", "<", mysql.raw("NOW() - INTERVAL 60 DAY"))
    .select("id", "user_id");

  for (const row of orphans) {
    await expireOne({
      id: row.id,
      userId: row.user_id,
      progress: 0,
      clearChatUserData: false, // chat_user_data already out of sync; don't touch
    });
  }
}

async function expireOne({ id, userId, progress, clearChatUserData }) {
  await mysql("user_prestige_trials")
    .where({ id })
    .update({ status: "failed", ended_at: new Date(), final_exp_progress: progress });

  if (clearChatUserData) {
    await ChatUserData.upsert(userId, {
      active_trial_id: null,
      active_trial_started_at: null,
      active_trial_exp_progress: 0,
    });
  }

  await chatUserState.invalidate(userId);
}
```

Match the existing cron skeleton from `app/bin/EventDequeue.js`:

```js
module.exports = main;

async function main() {
  try {
    await expireActiveTrials();
  } catch (err) {
    console.error(err);
    DefaultLogger.error(err);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
```

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/bin/TrialExpiryCheck.test.js`:

```js
const mysql = require("../../src/util/mysql");
const ChatUserData = require("../../src/model/application/ChatUserData");
const chatUserState = require("../../src/util/chatUserState");

describe("TrialExpiryCheck", () => {
  let main;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    main = require("../../bin/TrialExpiryCheck");
    jest.spyOn(ChatUserData, "upsert").mockResolvedValue(1);
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
  });

  it("marks matched active trials failed, clears chat_user_data, invalidates state", async () => {
    // First query: matched (JOIN with chat_user_data) returns two rows
    // Second query: orphans returns none
    const matchedRows = [
      { id: 10, user_id: "Uold1", progress: 800 },
      { id: 11, user_id: "Uold2", progress: 1500 },
    ];
    const updateMock = jest.fn().mockResolvedValue(1);

    let call = 0;
    mysql.mockImplementation(() => {
      call++;
      if (call === 1) {
        // JOIN query
        return {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue(matchedRows),
        };
      }
      if (call === 2) {
        // orphans query
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([]),
        };
      }
      // subsequent queries: update user_prestige_trials by id
      return {
        where: jest.fn().mockReturnThis(),
        update: updateMock,
      };
    });
    mysql.raw = jest.fn(x => ({ __raw: x }));

    await main();

    // Two trial rows should have been updated to failed
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", final_exp_progress: 800 })
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", final_exp_progress: 1500 })
    );

    // chat_user_data should be cleared for both users
    expect(ChatUserData.upsert).toHaveBeenCalledWith(
      "Uold1",
      expect.objectContaining({
        active_trial_id: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
      })
    );
    expect(ChatUserData.upsert).toHaveBeenCalledWith("Uold2", expect.any(Object));
    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uold1");
    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uold2");
  });

  it("expires orphan rows without touching chat_user_data", async () => {
    const orphanRows = [{ id: 99, user_id: "Uorphan" }];
    const updateMock = jest.fn().mockResolvedValue(1);

    let call = 0;
    mysql.mockImplementation(() => {
      call++;
      if (call === 1) {
        return {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([]),
        };
      }
      if (call === 2) {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue(orphanRows),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        update: updateMock,
      };
    });
    mysql.raw = jest.fn(x => ({ __raw: x }));

    await main();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", final_exp_progress: 0 })
    );
    expect(ChatUserData.upsert).not.toHaveBeenCalled();
    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uorphan");
  });

  it("returns cleanly when there's nothing to expire", async () => {
    let call = 0;
    mysql.mockImplementation(() => {
      call++;
      if (call === 1) {
        return {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([]),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
      };
    });
    mysql.raw = jest.fn(x => ({ __raw: x }));

    await expect(main()).resolves.toBeUndefined();
    expect(ChatUserData.upsert).not.toHaveBeenCalled();
    expect(chatUserState.invalidate).not.toHaveBeenCalled();
  });

  it("swallows errors so cron doesn't crash", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mysql.mockImplementation(() => {
      throw new Error("db connection lost");
    });

    await expect(main()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/bin/TrialExpiryCheck.test.js`
Expected: All FAIL (module not found).

- [ ] **Step 3: Implement `TrialExpiryCheck.js`**

Create `app/bin/TrialExpiryCheck.js`:

```js
const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");
const ChatUserData = require("../src/model/application/ChatUserData");
const chatUserState = require("../src/util/chatUserState");

module.exports = main;

// 60-day hardcoded limit — matches prestige_trials.duration_days for all 5
// trials in v1. If a future trial introduces a different duration, move this
// to a per-row JOIN.
const EXPIRY_DAYS = 60;

async function main() {
  try {
    await expireActiveTrials();
  } catch (err) {
    console.error(err);
    if (DefaultLogger && DefaultLogger.error) DefaultLogger.error(err);
  }
}

async function expireActiveTrials() {
  const matched = await mysql("user_prestige_trials as upt")
    .join("chat_user_data as cud", function () {
      this.on("cud.user_id", "upt.user_id").andOn("cud.active_trial_id", "upt.trial_id");
    })
    .where("upt.status", "active")
    .where("upt.started_at", "<", mysql.raw(`NOW() - INTERVAL ${EXPIRY_DAYS} DAY`))
    .select("upt.id", "upt.user_id", "cud.active_trial_exp_progress as progress");

  for (const row of matched || []) {
    await expireOne({
      id: row.id,
      userId: row.user_id,
      progress: row.progress || 0,
      clearChatUserData: true,
    });
  }

  const orphans = await mysql("user_prestige_trials")
    .where("status", "active")
    .where("started_at", "<", mysql.raw(`NOW() - INTERVAL ${EXPIRY_DAYS} DAY`))
    .select("id", "user_id");

  const matchedIds = new Set((matched || []).map(r => r.id));
  for (const row of orphans || []) {
    if (matchedIds.has(row.id)) continue; // already handled above
    await expireOne({
      id: row.id,
      userId: row.user_id,
      progress: 0,
      clearChatUserData: false,
    });
  }
}

async function expireOne({ id, userId, progress, clearChatUserData }) {
  await mysql("user_prestige_trials")
    .where({ id })
    .update({ status: "failed", ended_at: new Date(), final_exp_progress: progress });

  if (clearChatUserData) {
    await ChatUserData.upsert(userId, {
      active_trial_id: null,
      active_trial_started_at: null,
      active_trial_exp_progress: 0,
    });
  }

  await chatUserState.invalidate(userId);
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/bin/TrialExpiryCheck.test.js`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/bin/TrialExpiryCheck.js app/__tests__/bin/TrialExpiryCheck.test.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): TrialExpiryCheck cron"
```

---

## Task 10: Crontab registration

**Files:**
- Modify: `app/config/crontab.config.js`

**Schedule:** daily 00:05 (spec line 101: "每日 00:05").

In the standard cron format used by this file (`[s, m, h, dom, mon, dow]`), that's `["0", "5", "0", "*", "*", "*"]`.

- [ ] **Step 1: Add the entry**

Edit `app/config/crontab.config.js`. Before the closing `];`, add a new entry:

```js
  {
    name: "Trial Expiry Check",
    description: "expire 60-day-old active trials to failed status",
    period: ["0", "5", "0", "*", "*", "*"],
    immediate: false,
    require_path: "./bin/TrialExpiryCheck",
  },
```

Place it right after the `"Chat Exp Update"` entry so related chat-level crons group together.

- [ ] **Step 2: Verify the file still parses**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot/app && node -e "console.log(require('./config/crontab.config.js').find(c => c.name === 'Trial Expiry Check'))"
```
Expected: prints the new entry object with `period: [ '0', '5', '0', '*', '*', '*' ]`.

- [ ] **Step 3: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/config/crontab.config.js
git -C /home/hanshino/workspace/redive_linebot commit -m "feat(chat-level): register TrialExpiryCheck cron (00:05 daily)"
```

---

## Task 11: End-to-end lifecycle integration test

**Files:**
- Create: `app/__tests__/service/PrestigeService.integration.test.js`

**Responsibility:** One integration test that walks a user through the entire Lv.100 → trial → pass → prestige lifecycle against the mocked stack, asserting the full sequence of side effects.

This test serves as the spec-compliance witness for M3: if it passes, the flow works end to end.

**Scenario:**
1. `Uint` starts at `prestige_count=0, current_level=0, current_exp=0`, no blessings, no trials.
2. `getPrestigeStatus` → `canPrestige:false`, all 5 trials + 7 blessings available.
3. `startTrial("Uint", 1)` — ★1 departure. Assert: user_prestige_trials insert, chat_user_data updated, state invalidated, trial_enter broadcast.
4. Simulate `checkTrialCompletion` where progress has reached 2000. Assert: user_prestige_trials row → passed, chat_user_data cleared, trial_pass broadcast.
5. Assume user reaches Lv.100 (mock `chat_user_data.current_level=100, current_exp=27000`).
6. `prestige("Uint", 1)` — pick 語言天賦. Assert: user_blessings insert, user_prestige_history insert (prestige_count_after=1, trial_id=1, blessing_id=1), chat_user_data → prestige_count=1/level=0/exp=0/awakened_at=null, prestige broadcast.
7. Final `getPrestigeStatus` — `prestigeCount:1, availableTrials` excludes id=1, `availableBlessings` excludes id=1.

This test uses mock-per-step — the ChatUserData.findByUserId mock chain has 7+ consecutive values since each operation queries it. That's why implementation tests (Tasks 3-8) cover each step independently; this test validates **composition**, not the per-op details.

- [ ] **Step 1: Write the test**

Create `app/__tests__/service/PrestigeService.integration.test.js`:

```js
const PrestigeService = require("../../src/service/PrestigeService");
const ChatUserData = require("../../src/model/application/ChatUserData");
const PrestigeTrial = require("../../src/model/application/PrestigeTrial");
const PrestigeBlessing = require("../../src/model/application/PrestigeBlessing");
const UserPrestigeTrial = require("../../src/model/application/UserPrestigeTrial");
const UserBlessing = require("../../src/model/application/UserBlessing");
const UserPrestigeHistory = require("../../src/model/application/UserPrestigeHistory");
const chatUserState = require("../../src/util/chatUserState");
const broadcastQueue = require("../../src/util/broadcastQueue");
const redis = require("../../src/util/redis");

describe("PrestigeService — full lifecycle integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    jest.spyOn(broadcastQueue, "pushEvent").mockResolvedValue(true);
  });

  const TRIAL_DEPARTURE = {
    id: 1,
    slug: "departure",
    star: 1,
    display_name: "啟程",
    required_exp: 2000,
    duration_days: 60,
    restriction_meta: { type: "none" },
    reward_meta: { type: "trigger_achievement", achievement_slug: "prestige_departure" },
  };
  const TRIAL_HARDSHIP = {
    id: 2,
    slug: "hardship",
    star: 2,
    display_name: "刻苦",
    required_exp: 3000,
    duration_days: 60,
    restriction_meta: { type: "xp_multiplier", value: 0.7 },
    reward_meta: { type: "permanent_xp_multiplier", value: 0.1 },
  };
  const ALL_TRIALS = [
    TRIAL_DEPARTURE,
    TRIAL_HARDSHIP,
    {
      id: 3,
      slug: "rhythm",
      star: 3,
      display_name: "律動",
      required_exp: 2500,
      duration_days: 60,
      restriction_meta: { type: "cooldown_shift_multiplier", value: 1.33 },
      reward_meta: { type: "cooldown_tier_override", tiers: {} },
    },
    {
      id: 4,
      slug: "solitude",
      star: 4,
      display_name: "孤鳴",
      required_exp: 2500,
      duration_days: 60,
      restriction_meta: { type: "group_bonus_disabled" },
      reward_meta: { type: "group_bonus_double" },
    },
    {
      id: 5,
      slug: "awakening",
      star: 5,
      display_name: "覺悟",
      required_exp: 5000,
      duration_days: 60,
      restriction_meta: { type: "xp_multiplier", value: 0.5 },
      reward_meta: { type: "permanent_xp_multiplier", value: 0.15 },
    },
  ];
  const BLESSING_LANG = {
    id: 1,
    slug: "language_gift",
    display_name: "語言天賦",
    effect_meta: { type: "per_msg_xp_multiplier", value: 0.08 },
  };
  const ALL_BLESSINGS = [
    BLESSING_LANG,
    { id: 2, slug: "swift_tongue", display_name: "迅雷語速", effect_meta: {} },
    { id: 3, slug: "ember_afterglow", display_name: "燃燒餘熱", effect_meta: {} },
    { id: 4, slug: "whispering", display_name: "絮語之心", effect_meta: {} },
    { id: 5, slug: "rhythm_spring", display_name: "節律之泉", effect_meta: {} },
    { id: 6, slug: "star_guard", display_name: "群星加護", effect_meta: {} },
    { id: 7, slug: "greenhouse", display_name: "溫室之語", effect_meta: {} },
  ];

  it("fresh user → startTrial → pass → prestige → ends with one blessing and one prestige row", async () => {
    // Step 1: fresh user snapshot
    const freshUser = {
      user_id: "Uint",
      prestige_count: 0,
      current_level: 0,
      current_exp: 0,
      active_trial_id: null,
      active_trial_exp_progress: 0,
      active_trial_started_at: null,
      created_at: new Date("2026-04-01T00:00:00Z"),
    };

    // Status-before
    jest.spyOn(PrestigeTrial, "all").mockResolvedValue(ALL_TRIALS);
    jest.spyOn(PrestigeBlessing, "all").mockResolvedValue(ALL_BLESSINGS);
    jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(freshUser);
    jest.spyOn(UserPrestigeTrial, "listPassedByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeHistory, "listByUserId").mockResolvedValueOnce([]);

    let status = await PrestigeService.getPrestigeStatus("Uint");
    expect(status.prestigeCount).toBe(0);
    expect(status.canPrestige).toBe(false);
    expect(status.availableTrials).toHaveLength(5);
    expect(status.availableBlessings).toHaveLength(7);

    // Step 2: startTrial (★1)
    ChatUserData.findByUserId.mockResolvedValueOnce(freshUser);
    jest.spyOn(PrestigeTrial, "findById").mockResolvedValueOnce(TRIAL_DEPARTURE);
    UserPrestigeTrial.listPassedByUserId.mockResolvedValueOnce([]);
    jest.spyOn(UserPrestigeTrial.model, "create").mockResolvedValueOnce(101);
    jest.spyOn(ChatUserData, "upsert").mockResolvedValue(1);
    redis.get.mockResolvedValueOnce("Gintegration");

    const startRes = await PrestigeService.startTrial("Uint", 1);
    expect(startRes.ok).toBe(true);
    expect(startRes.trial.id).toBe(1);
    expect(broadcastQueue.pushEvent).toHaveBeenLastCalledWith(
      "Gintegration",
      expect.objectContaining({ type: "trial_enter" })
    );

    // Step 3: simulate trial pass via checkTrialCompletion
    const progressedUser = {
      ...freshUser,
      active_trial_id: 1,
      active_trial_exp_progress: 2050,
      active_trial_started_at: new Date("2026-04-10T00:00:00Z"),
    };
    ChatUserData.findByUserId.mockResolvedValueOnce(progressedUser);
    PrestigeTrial.findById.mockResolvedValueOnce(TRIAL_DEPARTURE);
    jest.spyOn(UserPrestigeTrial, "findActiveByUserId").mockResolvedValueOnce({
      id: 101,
      trial_id: 1,
      status: "active",
    });
    jest.spyOn(UserPrestigeTrial.model, "update").mockResolvedValueOnce(1);

    const compRes = await PrestigeService.checkTrialCompletion("Uint", "Gmsgctx");
    expect(compRes).toEqual({ completed: true, trialId: 1, trialStar: 1 });
    expect(broadcastQueue.pushEvent).toHaveBeenLastCalledWith(
      "Gmsgctx",
      expect.objectContaining({ type: "trial_pass" })
    );

    // Step 4: prestige
    const lv100User = {
      ...freshUser,
      current_level: 100,
      current_exp: 27000,
    };
    ChatUserData.findByUserId.mockResolvedValueOnce(lv100User);
    jest.spyOn(PrestigeBlessing, "findById").mockResolvedValueOnce(BLESSING_LANG);
    UserBlessing.listBlessingIdsByUserId.mockResolvedValueOnce([]);
    UserPrestigeTrial.listPassedByUserId.mockResolvedValueOnce([
      { id: 101, trial_id: 1, ended_at: new Date("2026-04-15T00:00:00Z") },
    ]);
    UserPrestigeHistory.listByUserId.mockResolvedValueOnce([]);
    jest.spyOn(UserBlessing.model, "create").mockResolvedValueOnce(201);
    jest.spyOn(UserPrestigeHistory.model, "create").mockResolvedValueOnce(301);
    redis.get.mockResolvedValueOnce("Gintegration");

    const prestRes = await PrestigeService.prestige("Uint", 1);
    expect(prestRes.ok).toBe(true);
    expect(prestRes.newPrestigeCount).toBe(1);
    expect(prestRes.trialId).toBe(1);
    expect(prestRes.blessingId).toBe(1);
    expect(prestRes.awakened).toBe(false);

    expect(UserPrestigeHistory.model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        prestige_count_after: 1,
        trial_id: 1,
        blessing_id: 1,
        cycle_started_at: new Date("2026-04-01T00:00:00Z"),
      })
    );
    expect(broadcastQueue.pushEvent).toHaveBeenLastCalledWith(
      "Gintegration",
      expect.objectContaining({
        type: "prestige",
        text: "完成第 1 次轉生，選擇了祝福『語言天賦』",
      })
    );

    // Step 5: status-after
    const postUser = {
      ...freshUser,
      prestige_count: 1,
      current_level: 0,
      current_exp: 0,
    };
    ChatUserData.findByUserId.mockResolvedValueOnce(postUser);
    UserPrestigeTrial.listPassedByUserId.mockResolvedValueOnce([{ id: 101, trial_id: 1 }]);
    UserBlessing.listBlessingIdsByUserId.mockResolvedValueOnce([1]);
    UserPrestigeHistory.listByUserId.mockResolvedValueOnce([
      { prestige_count_after: 1, trial_id: 1 },
    ]);

    status = await PrestigeService.getPrestigeStatus("Uint");
    expect(status.prestigeCount).toBe(1);
    expect(status.ownedBlessings).toEqual([1]);
    expect(status.passedTrialIds).toEqual([1]);
    expect(status.hasUnconsumedPassedTrial).toBe(false);
    expect(status.availableTrials.map(t => t.id)).toEqual([2, 3, 4, 5]);
    expect(status.availableBlessings.map(b => b.id)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(status.canPrestige).toBe(false);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/PrestigeService.integration.test.js`
Expected: Single test PASS.

If any mock chain doesn't line up (e.g. `findByUserId` called one more time than mocked), inspect the PrestigeService implementation — the mocks must exactly match the call sequence. Adjust `mockResolvedValueOnce` counts as needed.

- [ ] **Step 3: Run the full app test suite as a regression sanity check**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test`
Expected: All tests PASS (including M1, M2 suites).

- [ ] **Step 4: Commit**

```bash
git -C /home/hanshino/workspace/redive_linebot add app/__tests__/service/PrestigeService.integration.test.js
git -C /home/hanshino/workspace/redive_linebot commit -m "test(chat-level): PrestigeService full-lifecycle integration"
```

---

## Task 12: Merge M3 back into integration branch

**Files:** (none — branch ops only)

- [ ] **Step 1: Verify M3 branch is clean and all tests pass**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git status && cd app && yarn lint && yarn test
```
Expected: clean tree, lint clean, all tests pass.

If lint fails with `--fix`-able issues, run `yarn lint --fix`, commit with `style(chat-level): lint cleanup`, then re-run tests.

- [ ] **Step 2: Checkout the integration branch**

Run:
```bash
git -C /home/hanshino/workspace/redive_linebot checkout feat/chat-level-prestige
```
Expected: `Switched to branch 'feat/chat-level-prestige'`.

- [ ] **Step 3: Merge M3 with --no-ff**

Run:
```bash
git -C /home/hanshino/workspace/redive_linebot merge --no-ff feat/clp-m3 -m "Merge M3: trial & prestige lifecycle"
```
Expected: A merge commit is created. No conflicts (we haven't touched anything M2 didn't already rewrite, except adding one Redis write in `EventDequeue.js` and extending `pipeline.js`).

If conflicts surface (unexpected): stop and report. Do NOT `merge -X` or `checkout --theirs`.

- [ ] **Step 4: Push the integration branch**

Run:
```bash
git -C /home/hanshino/workspace/redive_linebot push origin feat/chat-level-prestige
```

- [ ] **Step 5: Verify the merge landed**

Run:
```bash
git -C /home/hanshino/workspace/redive_linebot log --oneline --graph -n 15
```
Expected: a merge commit `Merge M3: trial & prestige lifecycle` sitting on `feat/chat-level-prestige`, with 12 child commits reachable via the merge arrow.

- [ ] **Step 6: Delete the local M3 branch (optional, but matches M2 cleanup)**

Run:
```bash
git -C /home/hanshino/workspace/redive_linebot branch -d feat/clp-m3
```
Expected: `Deleted branch feat/clp-m3 (was <sha>).` — succeeds only if the branch is reachable from `feat/chat-level-prestige` (which it is after the merge).

---

## Exit Criteria (M3 done)

- [ ] All 5 PrestigeService methods implemented: `startTrial`, `forfeitTrial`, `checkTrialCompletion`, `prestige`, `getPrestigeStatus`
- [ ] Pipeline calls `onBatchWritten` after every user batch — trial completion detected, Lv.100 CTA fired exactly once per crossing
- [ ] `TrialExpiryCheck` cron runs daily 00:05, marks 60-day-old actives as failed
- [ ] All lifecycle-state-changing ops invalidate `CHAT_USER_STATE_{userId}`
- [ ] Broadcasts emitted to `BROADCAST_QUEUE_{groupId}` for: `trial_enter`, `trial_pass`, `prestige`, `awakening`, `lv_100_cta` (with TTL 86400)
- [ ] No broadcast for `forfeitTrial` / `TrialExpiryCheck` (silent per spec)
- [ ] `EventDequeue.handleChatExp` maintains `CHAT_USER_LAST_GROUP_{userId}` TTL 24h for LIFF-originated broadcast routing
- [ ] Full `yarn test` passes; new coverage ≥ 50 tests added across 6 new test files
- [ ] `feat/clp-m3` merged into `feat/chat-level-prestige` via `--no-ff`, pushed to origin

**Out of scope (explicit):**
- LINE reply-token delivery → M4
- LIFF API endpoints + frontend pages → M6
- Achievement triggers (prestige_departure / prestige_awakening / blessing build achievements) → M5
- Seeding `prestige_pioneer` for 82 legacy Lv.100+ users → M9 migration script
- `CHAT_XP_PAUSED` feature flag → M8
- `AchievementEngine.batchEvaluate` rewrite for `chat_100/1000/5000` → M5
- Admin/manual tools → intentionally NOT built (phpMyAdmin is the ops path)
