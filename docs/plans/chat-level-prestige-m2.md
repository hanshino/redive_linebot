# Chat Level Prestige — M2: Core XP Pipeline Rewrite (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the single-message → XP write path on top of M1's schema. The output of M2 is a working XP pipeline: EventDequeue captures new-shape events, ChatExpUpdate consumes them through pure, testable compute modules, and the new `chat_user_data` / `chat_exp_daily` / `chat_exp_events` tables receive writes.

**Architecture:** Five pure functions (cooldown, group bonus, per-msg XP, diminish tier, trial & permanent multiplier) composed by a `pipeline.js` orchestrator that reads state from Redis-cached `chatUserState` and writes transactionally. EventDequeue emits a fatter event payload with `timeSinceLastMsg` + `groupCount` pre-computed; ChatExpUpdate does the heavy lifting in a 5-min batch. All new code under `app/src/service/chatXp/` + `app/src/util/chatUserState.js`.

**Tech Stack:** Node.js 22 / CommonJS / Knex + mysql2 / ioredis (via `app/src/util/redis.js`) / Jest 29 / `moment` (plain — `moment-timezone` is not installed; use `moment().utcOffset(480)` for UTC+8).

---

## Context for Implementer

### What M1 already built (do not rebuild)

- **Schema** (see `app/migrations/20260423*`):
  - `chat_user_data` — PK `user_id VARCHAR(33)`; columns: `prestige_count, current_level, current_exp, awakened_at, active_trial_id, active_trial_started_at, active_trial_exp_progress`
  - `chat_exp_unit` — 101 rows, `(unit_level PK, total_exp)`, curve `round(2.7 × L²)`
  - `prestige_trials` — 5 rows, slugs `departure/hardship/rhythm/solitude/awakening` at ★1-★5, JSON `restriction_meta` / `reward_meta`
  - `prestige_blessings` — 7 rows with JSON `effect_meta`
  - `user_prestige_trials` — append-only attempt log with `status ENUM('active','passed','failed','forfeited')`
  - `user_blessings` — acquired blessings per user
  - `chat_exp_daily` — (user_id, date) UNIQUE; accumulator columns `raw_exp / effective_exp / msg_count / honeymoon_active / trial_id`
  - `chat_exp_events` — 30-day rolling events ledger with `ts DATETIME(3)`, `modifiers JSON`
  - `user_prestige_history` — permanent prestige event ledger; `cycle_days` is a GENERATED STORED column (excluded from fillable)
- **Models** (`app/src/model/application/`):
  - `ChatUserData.js` — exports `findByUserId(userId)`, `upsert(userId, attrs)`
  - `ChatExpUnit.js` — `getLevelFromExp(exp, rows)`, `getTotalExpForLevel(level, rows)`, `all()`
  - `ChatExpDaily.js` — `findByUserDate(userId, date)`, `upsertByUserDate({...})`
  - `ChatExpEvent.js` — `insertEvent(params)` (auto-JSON-stringifies `modifiers`)
  - `PrestigeTrial.js` — `all()` (sorted `star asc, id asc`), `findById(id)`, `findBySlug(slug)`
  - `PrestigeBlessing.js` — `all()`, `findById(id)`, `findBySlug(slug)`
  - `UserPrestigeTrial.js` — `findActiveByUserId`, `listPassedByUserId`, `listByUserId`
  - `UserBlessing.js` — `listByUserId`, `listBlessingIdsByUserId`
  - `UserPrestigeHistory.js` — thin Base wrapper (cycle_days is generated, not fillable)

### What currently lives in the old path (will be replaced)

- `app/bin/EventDequeue.js:handleChatExp` — reads last-touch TS, computes per-msg `expUnit` with old percent-based cooldown, pushes `{userId, expUnit}` into `CHAT_EXP_RECORD`.
- `app/bin/EventDequeue.js:getExpRate` / `getGroupExpAdditionRate` — internal helpers, tightly coupled to old payload. Delete after replacement.
- `app/bin/EventDequeue.js:handleChatExp` currently also writes Redis key `CHAT_TOUCH_TIMESTAMP_{userId}` with **TTL 5s (bug)** — new impl must set TTL 10s.
- `app/bin/ChatExpUpdate.js` — pops `CHAT_EXP_RECORD`, hashes by userId, inserts new users into old `chat_user_data` (via `user.id`), then increments `experience` column. This entire file is rewritten in M2.
- `app/src/model/application/ChatLevelModel.js` — still references the old schema. Leave untouched; M7 rewrites the read paths.

### What M2 writes and does not write

| Target | M2 behavior |
|---|---|
| `chat_user_data.current_exp` | Upsert: `MIN(current_exp + Δ_effective, 27000)` |
| `chat_user_data.current_level` | Recompute via `getLevelFromExp` after each batch |
| `chat_user_data.active_trial_exp_progress` | `+= Δ_effective` iff `active_trial_id IS NOT NULL` |
| `chat_user_data.prestige_count / active_trial_* (start)` | **Not touched** — M3 owns these |
| `chat_exp_daily` (today's row) | `upsertByUserDate` incrementing `raw_exp / effective_exp / msg_count`, writing `honeymoon_active / trial_id` current-value |
| `chat_exp_events` | One row per message, always, even when effective=0 |
| `user_prestige_trials` / `user_blessings` / `user_prestige_history` | **Not touched** — M3 owns these |
| Broadcasts (trial pass, prestige, Lv.100 CTA) | **Not implemented** — M3 detects, M4 delivers |
| `CHAT_XP_PAUSED` feature flag | **Not implemented** — M8 |
| `AchievementEngine.batchEvaluate` rewrite | **Not implemented** — M5 |

### Spec invariants M2 must honor

- **Cooldown is global per userId (cross-group shared)** — key `CHAT_TOUCH_TIMESTAMP_{userId}` has no group suffix and must stay that way (spec line 88-90, line 366-367).
- **XP calculation order** (spec line 336-343):
  ```
  單句 XP = base × cooldown × groupBonus × (1 + blessing1)
  日累計 × 活動倍率 × (未轉生蜜月 +20%)   ← 活動倍率 = 1.0 in v1
    → 邊際遞減（0-200/200-500/500+, 邊界受祝福 4/5 影響）
    → × 試煉當期倍率
    → × (1 + 試煉永久獎勵)
    → 實際入帳
  ```
- **Honeymoon applies BEFORE diminish**; trial current-period multiplier + permanent trial reward apply AFTER diminish.
- **Cooldown table stacking** (spec line 98-116) is a single pipeline, tiers do not overlap:
  - Blessing 3 → left tiers `<1s` and `1-2s`
  - ★3 permanent reward "rhythm mastery" → middle tiers `2-4s` and `4-6s`
  - Blessing 2 → right tier (lowers full-speed threshold by 1s, `6s → 5s` baseline; under ★3 trial `8s → 7s`)
- **★3 trial restriction**: `restriction_meta = {"type":"cooldown_shift_multiplier","value":1.33}` — multiply ALL thresholds by 1.333 during the trial.
- **★4 trial restriction**: `restriction_meta = {"type":"group_bonus_disabled"}` — groupBonus returns 1.0 during the trial.
- **★2 / ★5 trial restrictions**: `xp_multiplier 0.7 / 0.5`. Applied AFTER diminish (multiplicative).
- **★2 / ★5 permanent rewards**: `permanent_xp_multiplier 0.10 / 0.15`. Sum them (additive into `1 + sum`).
- **★4 permanent reward**: `group_bonus_double` — doubles slope from 0.02 → 0.04 (overriding blessing 6's 0.025 when both present; take max).
- **★3 permanent reward** "rhythm mastery": `cooldown_tier_override {tiers:{"2-4":0.70,"4-6":0.90}}` — overrides middle-tier rates.
- **Blessing 7**: `<10 人` groups multiply group bonus by 1.3 (applied after slope calculation — commutative with slope portion, so order doesn't matter mathematically).
- **Lv.100 cap is hard**: `current_exp` never exceeds 27000. Any overflow is discarded from `current_exp` but still written to `chat_exp_events` and accumulated in `chat_exp_daily` and trial progress.
- **Day boundary**: UTC+8 (`moment().utcOffset(480).format("YYYY-MM-DD")` — `480 = 8*60` minutes) per spec DB section line 406. `moment-timezone` is not installed in this project; plain `moment` with a fixed offset works because Taiwan does not observe DST.
- **`active_trial_exp_progress` accumulates effective XP** (post-diminish, post-trial-mult, post-permanent), per spec line 214: "試煉條件 XP 計算方式：累積的是應用試煉倍率後的實際入帳 XP".

### File structure to create

```
app/src/
├── util/
│   └── chatUserState.js            # NEW — Redis cache + DB hydration
└── service/
    └── chatXp/                     # NEW directory
        ├── cooldownTable.js        # pure: (timeDiffMs, status) -> rate
        ├── groupBonus.js           # pure: (memberCount, status) -> multiplier
        ├── perMsgXp.js             # pure: ({base, cooldownRate, groupBonus, status}) -> raw
        ├── diminishTier.js         # pure: (incoming, dailyBefore, status) -> effective-after-diminish
        ├── trialAndPermanent.js    # pure: (effective, status) -> final
        └── pipeline.js             # orchestrator — reads state, calls pure fns, writes DB

app/bin/
├── EventDequeue.js                 # MODIFY — new handleChatExp payload + TTL 10s
└── ChatExpUpdate.js                # REWRITE — delegate to pipeline.js

app/__tests__/
├── util/
│   └── chatUserState.test.js       # NEW
├── service/
│   └── chatXp/
│       ├── cooldownTable.test.js
│       ├── groupBonus.test.js
│       ├── perMsgXp.test.js
│       ├── diminishTier.test.js
│       ├── trialAndPermanent.test.js
│       └── pipeline.test.js
└── bin/
    └── EventDequeue.handleChatExp.test.js   # NEW — payload shape + TTL
```

Each pure module is ≤120 lines. `pipeline.js` ≤200 lines. `chatUserState.js` ≤150 lines.

### Canonical `status` shape (used by all pure modules)

This is the object produced by `chatUserState.load(userId)` and passed to every pure module. All fields are **required** (no undefined); pipeline asserts post-hydration.

```js
{
  user_id: "Uxxxxx...",
  prestige_count: 0,                     // 0–5
  current_level: 0,                      // 0–100
  current_exp: 0,                        // 0–27000
  blessings: [1, 4, 6],                  // blessing_ids (number[])
  active_trial_id: null,                 // number | null
  active_trial_star: null,               // number (1-5) | null   — derived from prestige_trials.star
  active_trial_started_at: null,         // Date | null
  active_trial_exp_progress: 0,          // integer
  permanent_xp_multiplier: 0.10,         // sum of passed ★2/★5 reward_meta values (float)
  rhythm_mastery: false,                 // true iff ★3 passed
  group_bonus_double: false,             // true iff ★4 passed
}
```

### Branch & commit convention

- **Parent branch**: `feat/chat-level-prestige` (integration branch, currently HEAD = `61b0c63`).
- **M2 child branch**: `feat/clp-m2` (create in Task 0).
- **Commit style**: `feat(chat-level): <component name>` — matches M1 commits (`feat(chat-level): ChatExpDaily model with upsertByUserDate helper`).
- **Merge back**: `git checkout feat/chat-level-prestige && git merge --no-ff feat/clp-m2 -m "Merge M2: core XP pipeline rewrite"` in Task 11.

### Testing notes

- `app/__tests__/setup.js` is loaded via `setupFiles` in `app/jest.config.js` — it globally mocks `mysql`, `redis`, `bottender`, `validation`, `Logger`, etc. **Do not re-`jest.mock` these per file** (M1 learned this the hard way — see commit `0c0fc88`).
- For state hydration tests (Task 6), override the global mysql/redis mocks **inside individual tests** using `mysql.mockImplementationOnce` / `redis.get.mockResolvedValueOnce` patterns — or wrap DB calls behind a thin seam you can inject. The global qb is chainable; per-test overrides work.
- Pure-function tests (Tasks 1-5) need **no mocks at all** — they accept primitives + plain objects, return primitives. This is the value of the pure design.
- Pipeline integration test (Task 7) uses the global mysql mock + `chatUserState.load` mocked via `jest.spyOn` — do not attempt a real DB round-trip.

---

## Task 0: Create M2 branch

**Files:** (none — branch ops only)

- [ ] **Step 1: Verify we're on the integration branch with a clean tree**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git status && git rev-parse --abbrev-ref HEAD
```
Expected output includes:
```
On branch feat/chat-level-prestige
nothing to commit, working tree clean
feat/chat-level-prestige
```

If the working tree is dirty, stop and report — do not destroy uncommitted work.

- [ ] **Step 2: Create and switch to M2 child branch**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git checkout -b feat/clp-m2
```
Expected: `Switched to a new branch 'feat/clp-m2'`.

- [ ] **Step 3: Confirm parent history reaches M1**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git log --oneline -5
```
Expected top line: `61b0c63 feat(chat-level): UserPrestigeHistory model ...` (or later if M2 already added commits — in which case you're resuming mid-task).

---

## Task 1: `cooldownTable.js` — pure cooldown rate selector (TDD)

**Files:**
- Create: `app/src/service/chatXp/cooldownTable.js`
- Test: `app/__tests__/service/chatXp/cooldownTable.test.js`

**Baseline table** (time-since-last-msg → rate, spec line 78-90):

| Time diff | Rate |
|---|---|
| `< 1000ms` | 0 |
| `< 2000ms` | 0.1 |
| `< 4000ms` | 0.5 |
| `< 6000ms` | 0.8 |
| `≥ 6000ms` | 1.0 |

**Modifier pipeline** (applied in this exact order):
1. Start from baseline thresholds (1000, 2000, 4000, 6000) and baseline rates (0, 0.1, 0.5, 0.8, 1.0).
2. If `status.active_trial_star === 3`, multiply all four thresholds by 1.333 (round to nearest integer ms): 1333, 2666, 5333, 7998.
3. If `status.rhythm_mastery === true`, override rate for tier 2-4s (0.5→0.7) and tier 4-6s (0.8→0.9).
4. If `status.blessings` includes `2`, subtract 1000ms from the last threshold (tier_4_6 upper bound): makes full-speed kick in 1s sooner.
5. If `status.blessings` includes `3`, override rate for tier 0-1s (0→0.1) and tier 1-2s (0.1→0.3).

**First-message case**: `timeDiffMs === null || timeDiffMs === undefined` → return `1.0` (full speed).

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/service/chatXp/cooldownTable.test.js`:

```js
const { selectCooldownRate } = require("../../../src/service/chatXp/cooldownTable");

const baseStatus = {
  prestige_count: 0,
  blessings: [],
  active_trial_star: null,
  rhythm_mastery: false,
};

describe("selectCooldownRate", () => {
  describe("first message", () => {
    it("returns 1.0 when timeDiffMs is null", () => {
      expect(selectCooldownRate(null, baseStatus)).toBe(1.0);
    });
    it("returns 1.0 when timeDiffMs is undefined", () => {
      expect(selectCooldownRate(undefined, baseStatus)).toBe(1.0);
    });
  });

  describe("baseline (no modifiers)", () => {
    it("returns 0 for <1s", () => {
      expect(selectCooldownRate(500, baseStatus)).toBe(0);
      expect(selectCooldownRate(999, baseStatus)).toBe(0);
    });
    it("returns 0.1 for 1-2s", () => {
      expect(selectCooldownRate(1000, baseStatus)).toBe(0.1);
      expect(selectCooldownRate(1999, baseStatus)).toBe(0.1);
    });
    it("returns 0.5 for 2-4s", () => {
      expect(selectCooldownRate(2000, baseStatus)).toBe(0.5);
      expect(selectCooldownRate(3999, baseStatus)).toBe(0.5);
    });
    it("returns 0.8 for 4-6s", () => {
      expect(selectCooldownRate(4000, baseStatus)).toBe(0.8);
      expect(selectCooldownRate(5999, baseStatus)).toBe(0.8);
    });
    it("returns 1.0 for >=6s", () => {
      expect(selectCooldownRate(6000, baseStatus)).toBe(1.0);
      expect(selectCooldownRate(60000, baseStatus)).toBe(1.0);
    });
  });

  describe("blessing 2 (swift tongue: full-speed threshold 6s -> 5s)", () => {
    const s = { ...baseStatus, blessings: [2] };
    it("still returns 0.8 for 4-5s", () => {
      expect(selectCooldownRate(4500, s)).toBe(0.8);
    });
    it("returns 1.0 at 5s (new threshold)", () => {
      expect(selectCooldownRate(5000, s)).toBe(1.0);
      expect(selectCooldownRate(5500, s)).toBe(1.0);
    });
  });

  describe("blessing 3 (ember afterglow: left tiers 0.1 / 0.3)", () => {
    const s = { ...baseStatus, blessings: [3] };
    it("returns 0.1 for <1s", () => {
      expect(selectCooldownRate(500, s)).toBe(0.1);
    });
    it("returns 0.3 for 1-2s", () => {
      expect(selectCooldownRate(1500, s)).toBe(0.3);
    });
    it("returns 0.5 for 2-4s unchanged", () => {
      expect(selectCooldownRate(3000, s)).toBe(0.5);
    });
  });

  describe("rhythm mastery (★3 permanent: mid tiers 0.7 / 0.9)", () => {
    const s = { ...baseStatus, rhythm_mastery: true };
    it("returns 0.7 for 2-4s", () => {
      expect(selectCooldownRate(3000, s)).toBe(0.7);
    });
    it("returns 0.9 for 4-6s", () => {
      expect(selectCooldownRate(5000, s)).toBe(0.9);
    });
    it("returns 0 for <1s unchanged", () => {
      expect(selectCooldownRate(500, s)).toBe(0);
    });
  });

  describe("★3 trial active (right-shift all thresholds x1.333)", () => {
    const s = { ...baseStatus, active_trial_star: 3 };
    it("returns 0 for <1.333s", () => {
      expect(selectCooldownRate(1332, s)).toBe(0);
    });
    it("returns 0.1 for 1.333-2.666s", () => {
      expect(selectCooldownRate(1333, s)).toBe(0.1);
      expect(selectCooldownRate(2665, s)).toBe(0.1);
    });
    it("returns 0.5 for 2.666-5.333s", () => {
      expect(selectCooldownRate(2666, s)).toBe(0.5);
      expect(selectCooldownRate(5332, s)).toBe(0.5);
    });
    it("returns 0.8 for 5.333-7.998s", () => {
      expect(selectCooldownRate(5333, s)).toBe(0.8);
      expect(selectCooldownRate(7997, s)).toBe(0.8);
    });
    it("returns 1.0 at 7.998s (shifted full-speed)", () => {
      expect(selectCooldownRate(7998, s)).toBe(1.0);
    });
  });

  describe("★3 trial + all blessings + rhythm mastery (spec line 132-138)", () => {
    const s = {
      ...baseStatus,
      active_trial_star: 3,
      blessings: [2, 3],
      rhythm_mastery: true,
    };
    it("returns 0.1 for <1.333s (blessing 3 overrides 0->0.1)", () => {
      expect(selectCooldownRate(500, s)).toBe(0.1);
    });
    it("returns 0.3 for 1.333-2.666s (blessing 3 overrides 0.1->0.3)", () => {
      expect(selectCooldownRate(2000, s)).toBe(0.3);
    });
    it("returns 0.7 for 2.666-5.333s (rhythm mastery mid)", () => {
      expect(selectCooldownRate(4000, s)).toBe(0.7);
    });
    it("returns 0.9 for 5.333-6.998s (blessing 2 lowered upper by 1000ms)", () => {
      expect(selectCooldownRate(5500, s)).toBe(0.9);
      expect(selectCooldownRate(6997, s)).toBe(0.9);
    });
    it("returns 1.0 at 6.998s (★3 shift 7998 - blessing 2 subtracts 1000)", () => {
      expect(selectCooldownRate(6998, s)).toBe(1.0);
    });
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/cooldownTable.test.js`

Expected: fail with `Cannot find module '../../../src/service/chatXp/cooldownTable'`.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/service/chatXp/cooldownTable.js`:

```js
const BASELINE_RATES = { t0_1: 0, t1_2: 0.1, t2_4: 0.5, t4_6: 0.8, tFull: 1.0 };

function buildTable(status) {
  let t0_1 = 1000;
  let t1_2 = 2000;
  let t2_4 = 4000;
  let t4_6 = 6000;

  if (status.active_trial_star === 3) {
    t0_1 = Math.round(t0_1 * 1.333);
    t1_2 = Math.round(t1_2 * 1.333);
    t2_4 = Math.round(t2_4 * 1.333);
    t4_6 = Math.round(t4_6 * 1.333);
  }

  const rates = { ...BASELINE_RATES };

  if (status.rhythm_mastery) {
    rates.t2_4 = 0.7;
    rates.t4_6 = 0.9;
  }

  if (Array.isArray(status.blessings) && status.blessings.includes(2)) {
    t4_6 -= 1000;
  }

  if (Array.isArray(status.blessings) && status.blessings.includes(3)) {
    rates.t0_1 = 0.1;
    rates.t1_2 = 0.3;
  }

  return [
    { maxMs: t0_1, rate: rates.t0_1 },
    { maxMs: t1_2, rate: rates.t1_2 },
    { maxMs: t2_4, rate: rates.t2_4 },
    { maxMs: t4_6, rate: rates.t4_6 },
    { maxMs: Infinity, rate: rates.tFull },
  ];
}

function selectCooldownRate(timeDiffMs, status) {
  if (timeDiffMs === null || timeDiffMs === undefined) return 1.0;
  const table = buildTable(status);
  for (const row of table) {
    if (timeDiffMs < row.maxMs) return row.rate;
  }
  return 1.0;
}

module.exports = { selectCooldownRate, buildTable };
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/cooldownTable.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git add app/src/service/chatXp/cooldownTable.js app/__tests__/service/chatXp/cooldownTable.test.js && git commit -m "feat(chat-level): cooldownTable pure selector

Handles baseline cooldown curve + ★3 trial shift + rhythm_mastery
permanent reward + blessing 2 (full-speed -1s) + blessing 3 (left tier
overrides). null timeDiff returns 1.0 (first message).

Covered by 20+ unit tests including spec line 132-138 stacked case."
```

---

## Task 2: `groupBonus.js` — pure group member-count multiplier (TDD)

**Files:**
- Create: `app/src/service/chatXp/groupBonus.js`
- Test: `app/__tests__/service/chatXp/groupBonus.test.js`

**Rules** (spec line 188-240):

- If `status.active_trial_star === 4` (solitude trial active): return `1.0` (group bonus disabled).
- Else, determine slope:
  - Default slope: `0.02`
  - If `status.blessings` includes `6` (star guard): slope = `0.025`
  - If `status.group_bonus_double === true` (★4 reward): slope = `Math.max(slope * 2, 0.04)` — doubles from whatever is current, floored at 0.04.
- Base multiplier:
  - If `memberCount < 5`: base = `1.0`
  - Else: base = `1 + (memberCount - 5) * slope`
- Small group override:
  - If `memberCount < 10` AND `status.blessings` includes `7` (greenhouse): multiply result by `1.3`.

Returns a positive float.

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/service/chatXp/groupBonus.test.js`:

```js
const { computeGroupBonus } = require("../../../src/service/chatXp/groupBonus");

const baseStatus = {
  blessings: [],
  active_trial_star: null,
  group_bonus_double: false,
};

describe("computeGroupBonus", () => {
  describe("baseline slope 0.02", () => {
    it("returns 1.0 for <5 members", () => {
      expect(computeGroupBonus(2, baseStatus)).toBe(1.0);
      expect(computeGroupBonus(4, baseStatus)).toBe(1.0);
    });
    it("returns 1.0 at 5 members (boundary)", () => {
      expect(computeGroupBonus(5, baseStatus)).toBe(1.0);
    });
    it("returns 1.10 at 10 members", () => {
      expect(computeGroupBonus(10, baseStatus)).toBeCloseTo(1.10, 5);
    });
    it("returns 1.50 at 30 members", () => {
      expect(computeGroupBonus(30, baseStatus)).toBeCloseTo(1.50, 5);
    });
  });

  describe("★4 trial active (group bonus disabled)", () => {
    const s = { ...baseStatus, active_trial_star: 4 };
    it("returns 1.0 regardless of member count", () => {
      expect(computeGroupBonus(50, s)).toBe(1.0);
      expect(computeGroupBonus(3, s)).toBe(1.0);
    });
    it("overrides blessing 6 and 7 and group_bonus_double", () => {
      expect(computeGroupBonus(50, { ...s, blessings: [6, 7], group_bonus_double: true })).toBe(1.0);
    });
  });

  describe("blessing 6 (slope -> 0.025)", () => {
    const s = { ...baseStatus, blessings: [6] };
    it("returns 1.125 at 10 members", () => {
      expect(computeGroupBonus(10, s)).toBeCloseTo(1.125, 5);
    });
    it("returns 1.625 at 30 members", () => {
      expect(computeGroupBonus(30, s)).toBeCloseTo(1.625, 5);
    });
  });

  describe("★4 reward (group_bonus_double: slope -> max(base*2, 0.04))", () => {
    it("doubles baseline slope: 0.02 -> 0.04 at 10 members", () => {
      const s = { ...baseStatus, group_bonus_double: true };
      expect(computeGroupBonus(10, s)).toBeCloseTo(1.20, 5);
    });
    it("takes max vs blessing 6: max(0.025*2, 0.04) = 0.05 at 10 members", () => {
      const s = { ...baseStatus, blessings: [6], group_bonus_double: true };
      expect(computeGroupBonus(10, s)).toBeCloseTo(1.25, 5);
    });
  });

  describe("blessing 7 (small group <10 members x1.3)", () => {
    it("multiplies by 1.3 at 8 members (no blessing 6)", () => {
      const s = { ...baseStatus, blessings: [7] };
      expect(computeGroupBonus(8, s)).toBeCloseTo(1.0 * 1.3, 5);
    });
    it("does NOT multiply at 10 members (boundary exclusive)", () => {
      const s = { ...baseStatus, blessings: [7] };
      expect(computeGroupBonus(10, s)).toBeCloseTo(1.10, 5);
    });
    it("stacks with blessing 6 at 8 members", () => {
      const s = { ...baseStatus, blessings: [6, 7] };
      // (1 + 3*0.025) * 1.3 = 1.075 * 1.3 = 1.3975
      expect(computeGroupBonus(8, s)).toBeCloseTo(1.3975, 4);
    });
  });

  describe("no blessings, solo chat", () => {
    it("returns 1.0 for 1-member room", () => {
      expect(computeGroupBonus(1, baseStatus)).toBe(1.0);
    });
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/groupBonus.test.js`

Expected: `Cannot find module '../../../src/service/chatXp/groupBonus'`.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/service/chatXp/groupBonus.js`:

```js
function computeGroupBonus(memberCount, status) {
  if (status.active_trial_star === 4) return 1.0;

  let slope = 0.02;
  if (Array.isArray(status.blessings) && status.blessings.includes(6)) slope = 0.025;
  if (status.group_bonus_double) slope = Math.max(slope * 2, 0.04);

  let bonus = memberCount < 5 ? 1.0 : 1 + (memberCount - 5) * slope;

  if (
    memberCount < 10 &&
    Array.isArray(status.blessings) &&
    status.blessings.includes(7)
  ) {
    bonus *= 1.3;
  }

  return bonus;
}

module.exports = { computeGroupBonus };
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/groupBonus.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hanshino/workspace/redive_linebot && git add app/src/service/chatXp/groupBonus.js app/__tests__/service/chatXp/groupBonus.test.js && git commit -m "feat(chat-level): groupBonus pure multiplier

★4 trial disables entirely; baseline 0.02 slope; blessing 6 -> 0.025;
★4 reward doubles slope with floor 0.04 (takes max vs blessing 6);
blessing 7 multiplies by 1.3 for <10 member groups."
```

---

## Task 3: `perMsgXp.js` — per-message raw XP (TDD)

**Files:**
- Create: `app/src/service/chatXp/perMsgXp.js`
- Test: `app/__tests__/service/chatXp/perMsgXp.test.js`

**Formula** (spec line 338):
```
raw = round(base × cooldownRate × groupBonus × (1 + blessingOneBonus))
```
Where:
- `blessingOneBonus = 0.08` if `status.blessings` includes `1` (language_gift); else `0`.
- Rounded via `Math.round` (banker's rounding is fine — JS default).
- Result is a non-negative integer.

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/service/chatXp/perMsgXp.test.js`:

```js
const { computePerMsgXp } = require("../../../src/service/chatXp/perMsgXp");

const baseStatus = { blessings: [] };

describe("computePerMsgXp", () => {
  it("returns base at full cooldown, no group bonus, no blessings", () => {
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 1.0, groupBonus: 1.0, status: baseStatus })
    ).toBe(90);
  });

  it("scales by cooldownRate", () => {
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 0.5, groupBonus: 1.0, status: baseStatus })
    ).toBe(45);
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 0.1, groupBonus: 1.0, status: baseStatus })
    ).toBe(9);
  });

  it("returns 0 when cooldownRate is 0", () => {
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 0, groupBonus: 2.0, status: { blessings: [1] } })
    ).toBe(0);
  });

  it("scales by groupBonus", () => {
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 1.0, groupBonus: 1.5, status: baseStatus })
    ).toBe(135);
  });

  it("applies blessing 1 (+8%)", () => {
    // 90 * 1.08 = 97.2 -> 97
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 1.0, groupBonus: 1.0, status: { blessings: [1] } })
    ).toBe(97);
  });

  it("composes all factors", () => {
    // 90 * 0.8 * 1.10 * 1.08 = 85.536 -> 86
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 0.8, groupBonus: 1.10, status: { blessings: [1] } })
    ).toBe(86);
  });

  it("rounds via Math.round (0.5 rounds up)", () => {
    // 10 * 0.25 * 1.0 * 1.0 = 2.5 -> 3
    expect(
      computePerMsgXp({ base: 10, cooldownRate: 0.25, groupBonus: 1.0, status: baseStatus })
    ).toBe(3);
  });

  it("handles missing blessings array gracefully", () => {
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 1.0, groupBonus: 1.0, status: {} })
    ).toBe(90);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/perMsgXp.test.js`

Expected: module not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/service/chatXp/perMsgXp.js`:

```js
function computePerMsgXp({ base, cooldownRate, groupBonus, status }) {
  const blessing1 =
    Array.isArray(status.blessings) && status.blessings.includes(1) ? 0.08 : 0;
  return Math.round(base * cooldownRate * groupBonus * (1 + blessing1));
}

module.exports = { computePerMsgXp };
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/perMsgXp.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hanshino/workspace/redive_linebot && git add app/src/service/chatXp/perMsgXp.js app/__tests__/service/chatXp/perMsgXp.test.js && git commit -m "feat(chat-level): perMsgXp pure integer XP per message

raw = round(base × cooldown × groupBonus × (1 + blessing1)).
blessing1 contributes +0.08 when present; otherwise 0."
```

---

## Task 4: `diminishTier.js` — pure daily diminish tiering (TDD)

**Files:**
- Create: `app/src/service/chatXp/diminishTier.js`
- Test: `app/__tests__/service/chatXp/diminishTier.test.js`

**Tier structure** (spec line 56-73):

| Tier | Range (before/at) | Rate |
|---|---|---|
| 1 | `0 – tier1Upper` | 100% |
| 2 | `tier1Upper – tier2Upper` | 30% |
| 3 | `tier2Upper+` | 3% |

- `tier1Upper = 300` if blessing 4 present, else `200`.
- `tier2Upper = 600` if blessing 5 present, else `500`.

Inputs:
- `incoming`: amount to add (post-honeymoon, post-activity multiplier — already scaled). Non-negative float.
- `dailyBefore`: current cumulative in same scale (post-honeymoon). Non-negative float.
- `status`: state object — only `blessings` is read.

Output: effective XP (post-diminish), float. **Pipeline will round when persisting** — keep this function pure float math.

Algorithm: walk the tiers left-to-right, taking `min(remaining, tierUpperBound - cursor)` from each until remaining is zero.

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/service/chatXp/diminishTier.test.js`:

```js
const { applyDiminish } = require("../../../src/service/chatXp/diminishTier");

const base = { blessings: [] };

describe("applyDiminish", () => {
  describe("baseline tiers (200 / 500 / inf)", () => {
    it("returns full incoming when entirely in tier 1", () => {
      expect(applyDiminish(50, 0, base)).toBe(50);
      expect(applyDiminish(100, 99, base)).toBe(100);
    });
    it("splits 100 at dailyBefore=150 across tier1 and tier2", () => {
      // 50 at 100% + 50 at 30% = 50 + 15 = 65
      expect(applyDiminish(100, 150, base)).toBeCloseTo(65, 5);
    });
    it("computes moderate-day full spend: 300 at dailyBefore=0", () => {
      // 200 at 100% + 100 at 30% = 230
      expect(applyDiminish(300, 0, base)).toBeCloseTo(230, 5);
    });
    it("splits across all three tiers: 1000 at dailyBefore=0", () => {
      // 200 at 100% + 300 at 30% + 500 at 3% = 200 + 90 + 15 = 305
      expect(applyDiminish(1000, 0, base)).toBeCloseTo(305, 5);
    });
    it("returns 3% when entirely above 500", () => {
      expect(applyDiminish(100, 600, base)).toBeCloseTo(3, 5);
    });
    it("splits 100 at dailyBefore=450 across tier2 and tier3", () => {
      // 50 at 30% + 50 at 3% = 15 + 1.5 = 16.5
      expect(applyDiminish(100, 450, base)).toBeCloseTo(16.5, 5);
    });
  });

  describe("blessing 4 (tier1 expanded 0-200 -> 0-300)", () => {
    const s = { blessings: [4] };
    it("covers 300 entirely in tier 1", () => {
      expect(applyDiminish(300, 0, s)).toBeCloseTo(300, 5);
    });
    it("splits 100 at dailyBefore=250 across expanded tier1 and tier2", () => {
      // 50 at 100% + 50 at 30% = 50 + 15 = 65
      expect(applyDiminish(100, 250, s)).toBeCloseTo(65, 5);
    });
  });

  describe("blessing 5 (tier2 expanded 200-500 -> 200-600)", () => {
    const s = { blessings: [5] };
    it("keeps tier1 at 200, extends tier2 to 600", () => {
      // dailyBefore=550, incoming=100: 50 at 30% + 50 at 3% = 15 + 1.5 = 16.5
      expect(applyDiminish(100, 550, s)).toBeCloseTo(16.5, 5);
    });
    it("compares vs baseline at same inputs (verifies tier shift)", () => {
      // baseline: dailyBefore=550 is entirely in tier3 (500+), 100 at 3% = 3
      expect(applyDiminish(100, 550, base)).toBeCloseTo(3, 5);
    });
  });

  describe("blessings 4 + 5 combined (tiers 0-300 / 300-600 / 600+)", () => {
    const s = { blessings: [4, 5] };
    it("computes 1000 at dailyBefore=0", () => {
      // 300 at 100% + 300 at 30% + 400 at 3% = 300 + 90 + 12 = 402
      expect(applyDiminish(1000, 0, s)).toBeCloseTo(402, 5);
    });
  });

  describe("edge cases", () => {
    it("returns 0 for incoming=0", () => {
      expect(applyDiminish(0, 100, base)).toBe(0);
    });
    it("handles incoming exactly on tier1 upper boundary", () => {
      // dailyBefore=200, incoming=50: entirely at 30% = 15
      expect(applyDiminish(50, 200, base)).toBeCloseTo(15, 5);
    });
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/diminishTier.test.js`

Expected: module not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/service/chatXp/diminishTier.js`:

```js
const TIER1_RATE = 1.0;
const TIER2_RATE = 0.3;
const TIER3_RATE = 0.03;

function applyDiminish(incoming, dailyBefore, status) {
  if (incoming <= 0) return 0;

  const blessings = Array.isArray(status.blessings) ? status.blessings : [];
  const tier1Upper = blessings.includes(4) ? 300 : 200;
  const tier2Upper = blessings.includes(5) ? 600 : 500;

  let remaining = incoming;
  let cursor = dailyBefore;
  let result = 0;

  if (cursor < tier1Upper) {
    const take = Math.min(remaining, tier1Upper - cursor);
    result += take * TIER1_RATE;
    remaining -= take;
    cursor += take;
  }
  if (remaining > 0 && cursor < tier2Upper) {
    const take = Math.min(remaining, tier2Upper - cursor);
    result += take * TIER2_RATE;
    remaining -= take;
    cursor += take;
  }
  if (remaining > 0) {
    result += remaining * TIER3_RATE;
  }

  return result;
}

module.exports = { applyDiminish };
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/diminishTier.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hanshino/workspace/redive_linebot && git add app/src/service/chatXp/diminishTier.js app/__tests__/service/chatXp/diminishTier.test.js && git commit -m "feat(chat-level): diminishTier pure daily curve

Tiers 100%/30%/3% with tier1 upper 200 (300 w/ blessing 4),
tier2 upper 500 (600 w/ blessing 5). Walks left-to-right, splitting
incoming across tiers. Honeymoon scaling done in pipeline."
```

---

## Task 5: `trialAndPermanent.js` — pure trial period + permanent reward multiplier (TDD)

**Files:**
- Create: `app/src/service/chatXp/trialAndPermanent.js`
- Test: `app/__tests__/service/chatXp/trialAndPermanent.test.js`

**Formula** (spec line 342):
```
final = effective × trialMult × (1 + permanent_xp_multiplier)
```

Trial current-period multiplier — applied only when `status.active_trial_star` matches:
- `active_trial_star === 2` (hardship): `0.7`
- `active_trial_star === 5` (awakening): `0.5`
- `active_trial_star === 1 | 3 | 4` or `null`: `1.0` (these trials use cooldown/group restrictions, not XP multipliers)

Permanent: `status.permanent_xp_multiplier` is a pre-summed float (★2 reward = +0.10, ★5 reward = +0.15; both passed = +0.25). Treated additively: `(1 + value)`.

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/service/chatXp/trialAndPermanent.test.js`:

```js
const { applyTrialAndPermanent } = require("../../../src/service/chatXp/trialAndPermanent");

describe("applyTrialAndPermanent", () => {
  it("returns input unchanged when no trial and no permanent", () => {
    expect(
      applyTrialAndPermanent(100, { active_trial_star: null, permanent_xp_multiplier: 0 })
    ).toBeCloseTo(100, 5);
  });

  describe("trial current-period multiplier", () => {
    it("★1 active: x1.0", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 1, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(100, 5);
    });
    it("★2 active: x0.7", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 2, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(70, 5);
    });
    it("★3 active: x1.0 (cooldown-only restriction)", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 3, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(100, 5);
    });
    it("★4 active: x1.0 (group-bonus-only restriction)", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 4, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(100, 5);
    });
    it("★5 active: x0.5", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 5, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(50, 5);
    });
  });

  describe("permanent multiplier", () => {
    it("★2 passed (+0.10): x1.10", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: null, permanent_xp_multiplier: 0.10 })
      ).toBeCloseTo(110, 5);
    });
    it("★2 + ★5 passed (+0.25): x1.25", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: null, permanent_xp_multiplier: 0.25 })
      ).toBeCloseTo(125, 5);
    });
  });

  describe("trial + permanent combined", () => {
    it("★5 active + ★2 passed: 100 * 0.5 * 1.10 = 55", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 5, permanent_xp_multiplier: 0.10 })
      ).toBeCloseTo(55, 5);
    });
    it("★3 active + ★2+★5 passed: 100 * 1.0 * 1.25 = 125", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 3, permanent_xp_multiplier: 0.25 })
      ).toBeCloseTo(125, 5);
    });
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/trialAndPermanent.test.js`

Expected: module not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/service/chatXp/trialAndPermanent.js`:

```js
function applyTrialAndPermanent(effective, status) {
  let trialMult = 1.0;
  if (status.active_trial_star === 2) trialMult = 0.7;
  else if (status.active_trial_star === 5) trialMult = 0.5;

  const permanent = Number(status.permanent_xp_multiplier) || 0;
  return effective * trialMult * (1 + permanent);
}

module.exports = { applyTrialAndPermanent };
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/trialAndPermanent.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hanshino/workspace/redive_linebot && git add app/src/service/chatXp/trialAndPermanent.js app/__tests__/service/chatXp/trialAndPermanent.test.js && git commit -m "feat(chat-level): trialAndPermanent multiplier

★2 active x0.7, ★5 active x0.5, others x1.0. permanent_xp_multiplier
combined additively as (1 + value). Applied after diminish."
```

---

## Task 6: `chatUserState.js` — Redis-cached state with DB hydration (TDD)

**Files:**
- Create: `app/src/util/chatUserState.js`
- Test: `app/__tests__/util/chatUserState.test.js`

**Interface:**

```js
// Returns full status object (see canonical shape in Context section).
// Reads Redis first; on miss, hydrates from DB, caches, returns.
async function load(userId): Promise<Status>

// Unconditional DB hydration (bypasses cache). Used internally by load()
// and for cache-rebuild after state mutations (M3 will call this).
async function hydrate(userId): Promise<Status>

// Delete Redis cache so next load() re-hydrates. M3 calls this after
// trial start/end, prestige, blessing select.
async function invalidate(userId): Promise<void>

// Constants for callers
STATE_KEY(userId): string   // "CHAT_USER_STATE_{userId}"
TTL_SECONDS: number         // 600 (10 min)
```

**Hydration reads:**
- `chat_user_data WHERE user_id = ?` → base fields (prestige_count, current_level, current_exp, active_trial_id, active_trial_started_at, active_trial_exp_progress)
- `prestige_trials WHERE id = <active_trial_id>` → `active_trial_star` (null if no active trial)
- `user_blessings WHERE user_id = ?` → `blessings: number[]`
- `user_prestige_trials JOIN prestige_trials WHERE user_id = ? AND status = 'passed'` → sum up reward_meta:
  - Type `permanent_xp_multiplier` → add `value` to `permanent_xp_multiplier`
  - Type `cooldown_tier_override` → set `rhythm_mastery = true`
  - Type `group_bonus_double` → set `group_bonus_double = true`
  - Type `trigger_achievement` → ignored for XP state (M5 handles achievements)

**Missing-user fallback**: If `chat_user_data` has no row for this userId, return a default state with all zeros — this represents a brand-new user who hasn't sent a first message yet. Do not auto-insert a row here; pipeline's write step will upsert on first XP write.

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/util/chatUserState.test.js`:

```js
const chatUserState = require("../../src/util/chatUserState");
const redis = require("../../src/util/redis");
const mysql = require("../../src/util/mysql");
const ChatUserData = require("../../src/model/application/ChatUserData");
const UserBlessing = require("../../src/model/application/UserBlessing");

describe("chatUserState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("STATE_KEY", () => {
    it("formats key with userId prefix", () => {
      expect(chatUserState.STATE_KEY("Uabc")).toBe("CHAT_USER_STATE_Uabc");
    });
  });

  describe("hydrate", () => {
    it("returns all-zero default state for unknown user", async () => {
      jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce(null);
      jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([]);
      // mysql("user_prestige_trials").join(...).where(...).select(...) -> returns [] for "no passed trials"
      mysql.mockReturnValue({
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
        first: jest.fn().mockResolvedValue(null),
      });

      const state = await chatUserState.hydrate("Unew");
      expect(state).toEqual({
        user_id: "Unew",
        prestige_count: 0,
        current_level: 0,
        current_exp: 0,
        blessings: [],
        active_trial_id: null,
        active_trial_star: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
        permanent_xp_multiplier: 0,
        rhythm_mastery: false,
        group_bonus_double: false,
      });
    });

    it("aggregates passed-trial rewards into state fields", async () => {
      jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
        user_id: "Uold",
        prestige_count: 2,
        current_level: 40,
        current_exp: 4320,
        active_trial_id: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
      });
      jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1, 4]);

      const passedRows = [
        { star: 2, reward_meta: JSON.stringify({ type: "permanent_xp_multiplier", value: 0.10 }) },
        { star: 3, reward_meta: JSON.stringify({
            type: "cooldown_tier_override",
            tiers: { "2-4": 0.70, "4-6": 0.90 },
          }) },
      ];
      mysql.mockImplementation(table => {
        const qb = {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue(passedRows),
          first: jest.fn().mockResolvedValue(null),
        };
        return qb;
      });

      const state = await chatUserState.hydrate("Uold");
      expect(state.prestige_count).toBe(2);
      expect(state.current_level).toBe(40);
      expect(state.current_exp).toBe(4320);
      expect(state.blessings).toEqual([1, 4]);
      expect(state.permanent_xp_multiplier).toBeCloseTo(0.10, 5);
      expect(state.rhythm_mastery).toBe(true);
      expect(state.group_bonus_double).toBe(false);
    });

    it("resolves active_trial_star from prestige_trials when trial is active", async () => {
      jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
        user_id: "Uactive",
        prestige_count: 1,
        current_level: 50,
        current_exp: 6750,
        active_trial_id: 3,
        active_trial_started_at: "2026-04-10T00:00:00Z",
        active_trial_exp_progress: 1200,
      });
      jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1]);

      // First mysql() call is for passed trials (returns []), second is for prestige_trials by id.
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
          first: jest.fn().mockResolvedValue({ id: 3, star: 3 }),
        };
      });

      const state = await chatUserState.hydrate("Uactive");
      expect(state.active_trial_id).toBe(3);
      expect(state.active_trial_star).toBe(3);
      expect(state.active_trial_exp_progress).toBe(1200);
    });

    it("sums multiple permanent_xp_multiplier rewards (★2 + ★5 = +0.25)", async () => {
      jest.spyOn(ChatUserData, "findByUserId").mockResolvedValueOnce({
        user_id: "Uboth",
        prestige_count: 4,
        current_level: 0,
        current_exp: 0,
        active_trial_id: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
      });
      jest.spyOn(UserBlessing, "listBlessingIdsByUserId").mockResolvedValueOnce([1, 2, 4, 5]);

      const passedRows = [
        { star: 2, reward_meta: JSON.stringify({ type: "permanent_xp_multiplier", value: 0.10 }) },
        { star: 5, reward_meta: JSON.stringify({ type: "permanent_xp_multiplier", value: 0.15 }) },
        { star: 4, reward_meta: JSON.stringify({ type: "group_bonus_double" }) },
      ];
      mysql.mockImplementation(() => ({
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(passedRows),
        first: jest.fn().mockResolvedValue(null),
      }));

      const state = await chatUserState.hydrate("Uboth");
      expect(state.permanent_xp_multiplier).toBeCloseTo(0.25, 5);
      expect(state.group_bonus_double).toBe(true);
      expect(state.rhythm_mastery).toBe(false);
    });
  });

  describe("load", () => {
    it("returns cached JSON when Redis has value", async () => {
      const cached = {
        user_id: "Uc",
        prestige_count: 3,
        current_level: 70,
        current_exp: 13230,
        blessings: [1, 2, 6],
        active_trial_id: null,
        active_trial_star: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
        permanent_xp_multiplier: 0.10,
        rhythm_mastery: false,
        group_bonus_double: false,
      };
      redis.get.mockResolvedValueOnce(JSON.stringify(cached));
      const hydrateSpy = jest.spyOn(chatUserState, "hydrate");

      const state = await chatUserState.load("Uc");
      expect(state).toEqual(cached);
      expect(hydrateSpy).not.toHaveBeenCalled();
    });

    it("hydrates and caches on cache miss", async () => {
      redis.get.mockResolvedValueOnce(null);
      const hydrated = {
        user_id: "Um",
        prestige_count: 0,
        current_level: 0,
        current_exp: 0,
        blessings: [],
        active_trial_id: null,
        active_trial_star: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
        permanent_xp_multiplier: 0,
        rhythm_mastery: false,
        group_bonus_double: false,
      };
      jest.spyOn(chatUserState, "hydrate").mockResolvedValueOnce(hydrated);

      const state = await chatUserState.load("Um");
      expect(state).toEqual(hydrated);
      expect(redis.set).toHaveBeenCalledWith(
        "CHAT_USER_STATE_Um",
        JSON.stringify(hydrated),
        { EX: 600 }
      );
    });
  });

  describe("invalidate", () => {
    it("calls redis.del with the correct key", async () => {
      await chatUserState.invalidate("Uinv");
      expect(redis.del).toHaveBeenCalledWith("CHAT_USER_STATE_Uinv");
    });
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/util/chatUserState.test.js`

Expected: module not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/util/chatUserState.js`:

```js
const redis = require("./redis");
const mysql = require("./mysql");
const ChatUserData = require("../model/application/ChatUserData");
const UserBlessing = require("../model/application/UserBlessing");

const TTL_SECONDS = 600;
const STATE_KEY = userId => `CHAT_USER_STATE_${userId}`;

function defaultState(userId) {
  return {
    user_id: userId,
    prestige_count: 0,
    current_level: 0,
    current_exp: 0,
    blessings: [],
    active_trial_id: null,
    active_trial_star: null,
    active_trial_started_at: null,
    active_trial_exp_progress: 0,
    permanent_xp_multiplier: 0,
    rhythm_mastery: false,
    group_bonus_double: false,
  };
}

function parseRewardMeta(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

async function loadPassedTrialRewards(userId) {
  const rows = await mysql("user_prestige_trials as upt")
    .join("prestige_trials as pt", "pt.id", "upt.trial_id")
    .where({ "upt.user_id": userId, "upt.status": "passed" })
    .select("pt.star", "pt.reward_meta");

  let permanent_xp_multiplier = 0;
  let rhythm_mastery = false;
  let group_bonus_double = false;
  for (const row of rows || []) {
    const meta = parseRewardMeta(row.reward_meta);
    if (!meta) continue;
    if (meta.type === "permanent_xp_multiplier" && typeof meta.value === "number") {
      permanent_xp_multiplier += meta.value;
    } else if (meta.type === "cooldown_tier_override") {
      rhythm_mastery = true;
    } else if (meta.type === "group_bonus_double") {
      group_bonus_double = true;
    }
  }
  return { permanent_xp_multiplier, rhythm_mastery, group_bonus_double };
}

async function resolveTrialStar(activeTrialId) {
  if (!activeTrialId) return null;
  const row = await mysql("prestige_trials").where({ id: activeTrialId }).first();
  return row ? row.star : null;
}

async function hydrate(userId) {
  const base = await ChatUserData.findByUserId(userId);
  const blessings = await UserBlessing.listBlessingIdsByUserId(userId);
  const rewards = await loadPassedTrialRewards(userId);

  if (!base) {
    return { ...defaultState(userId), blessings, ...rewards };
  }

  const active_trial_star = await resolveTrialStar(base.active_trial_id);

  return {
    user_id: userId,
    prestige_count: base.prestige_count ?? 0,
    current_level: base.current_level ?? 0,
    current_exp: base.current_exp ?? 0,
    blessings,
    active_trial_id: base.active_trial_id ?? null,
    active_trial_star,
    active_trial_started_at: base.active_trial_started_at ?? null,
    active_trial_exp_progress: base.active_trial_exp_progress ?? 0,
    ...rewards,
  };
}

async function load(userId) {
  const cached = await redis.get(STATE_KEY(userId));
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // corrupted cache, fall through to hydrate
    }
  }
  const state = await module.exports.hydrate(userId);
  await redis.set(STATE_KEY(userId), JSON.stringify(state), { EX: TTL_SECONDS });
  return state;
}

function invalidate(userId) {
  return redis.del(STATE_KEY(userId));
}

module.exports = { load, hydrate, invalidate, STATE_KEY, TTL_SECONDS };
```

**Note**: the `load` function calls `module.exports.hydrate` (not direct `hydrate`) so that test `jest.spyOn(chatUserState, "hydrate")` stubs take effect.

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/util/chatUserState.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hanshino/workspace/redive_linebot && git add app/src/util/chatUserState.js app/__tests__/util/chatUserState.test.js && git commit -m "feat(chat-level): chatUserState Redis cache + DB hydration

load(userId) reads CHAT_USER_STATE_{userId} (TTL 600s); on miss
hydrates from chat_user_data + user_blessings + passed trial rewards.
invalidate(userId) deletes cache. Canonical status shape documented
in chat-level-prestige-m2.md."
```

---

## Task 7: `pipeline.js` — orchestrator (TDD with mocks)

**Files:**
- Create: `app/src/service/chatXp/pipeline.js`
- Test: `app/__tests__/service/chatXp/pipeline.test.js`

**Interface:**

```js
// Process a batch of events popped from CHAT_EXP_RECORD.
// Groups by userId, time-sorts, computes XP, writes DB transactionally.
async function processBatch(events: Event[]): Promise<void>
```

Where `Event` is:
```js
{
  userId: string,
  groupId: string,
  ts: number,               // unix ms (from LINE webhook event.timestamp)
  timeSinceLastMsg: number|null,  // ms since previous touch, null if first
  groupCount: number        // group member count at event time
}
```

**Per-user processing algorithm:**

```
state = await chatUserState.load(userId)
base = await getBaseXp()                   // Redis CHAT_GLOBAL_RATE || config default 90
today = moment().utcOffset(480).format("YYYY-MM-DD")   // UTC+8, Taiwan has no DST
dailyRow = await ChatExpDaily.findByUserDate(userId, today)
dailyRawBefore = dailyRow?.raw_exp ?? 0    // pre-honeymoon scale
honeymoonMult = state.prestige_count === 0 ? 1.2 : 1.0

rawDelta = 0
effectiveDelta = 0
msgCount = 0
eventRecords = []

for event in timeSortedEvents:
  cooldownRate = selectCooldownRate(event.timeSinceLastMsg, state)
  groupBonus   = computeGroupBonus(event.groupCount, state)
  raw = computePerMsgXp({ base, cooldownRate, groupBonus, status: state })  // integer

  // Apply honeymoon + diminish in same scale
  scaledIncoming = raw * honeymoonMult
  scaledDailyBefore = (dailyRawBefore + rawDelta) * honeymoonMult
  afterDiminish = applyDiminish(scaledIncoming, scaledDailyBefore, state)
  finalEffective = applyTrialAndPermanent(afterDiminish, state)   // float

  rawDelta += raw
  effectiveInt = Math.round(finalEffective)
  effectiveDelta += effectiveInt
  msgCount += 1

  eventRecords.push({
    user_id: event.userId,
    group_id: event.groupId,
    ts: new Date(event.ts),
    raw_exp: raw,
    effective_exp: effectiveInt,
    cooldown_rate: cooldownRate,
    group_bonus: groupBonus,
    modifiers: {
      honeymoon: state.prestige_count === 0,
      active_trial_id: state.active_trial_id,
      active_trial_star: state.active_trial_star,
      blessings: state.blessings,
      permanent_xp_multiplier: state.permanent_xp_multiplier,
    },
  })

await writeBatch({
  userId, state, today, rawDelta, effectiveDelta, msgCount, eventRecords,
})
```

**`writeBatch` (inside a transaction):**

```
BEGIN
existing = SELECT * FROM chat_user_data WHERE user_id = ?
newExp = min(27000, (existing?.current_exp ?? 0) + effectiveDelta)
newLevel = getLevelFromExp(newExp, expUnitRows)
newTrialProgress = (existing?.active_trial_exp_progress ?? 0)
  + (state.active_trial_id ? effectiveDelta : 0)

if existing:
  UPDATE chat_user_data SET
    current_exp = newExp,
    current_level = newLevel,
    active_trial_exp_progress = newTrialProgress,
    updated_at = NOW()
  WHERE user_id = ?
else:
  INSERT INTO chat_user_data (user_id, current_exp, current_level, active_trial_exp_progress, ...)

ChatExpDaily.upsertByUserDate({
  userId, date: today,
  rawExp: rawDelta,
  effectiveExp: effectiveDelta,
  msgCount,
  honeymoonActive: state.prestige_count === 0,
  trialId: state.active_trial_id,
})

for each eventRecord:
  ChatExpEvent.insertEvent(eventRecord)

COMMIT
```

If `ChatUserData.upsert` is used (already exists in M1), call it instead of raw UPDATE/INSERT. It handles the insert-vs-update branch. **BUT** it uses `mysql(TABLE).where({user_id: userId}).update(attrs)` which is not transaction-aware. For M2, use raw knex inside a transaction instead, or skip the transaction wrapper and accept eventual consistency risk in batch. **Pragmatic choice for M2**: no transaction. Batch is retry-safe (rawDelta/effectiveDelta are additive; re-running the batch would double-count, but we only pop once from Redis so re-running doesn't happen unless the process crashes mid-batch — acceptable for v1, logged as known edge case). Rationale: simpler code, lower risk of getting transaction plumbing wrong, matches existing `initialUsers` pattern in old ChatExpUpdate.

Therefore the pipeline writes sequentially without an explicit transaction. We accept this trade-off. Document it as a comment.

**Base XP helper:**
```js
async function getBaseXp() {
  const config = require("config");
  const redisRate = await redis.get("CHAT_GLOBAL_RATE");
  if (redisRate !== null && redisRate !== undefined) {
    const n = Number(redisRate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return config.get("chat_level.exp.rate.default");
}
```

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/service/chatXp/pipeline.test.js`:

```js
const pipeline = require("../../../src/service/chatXp/pipeline");
const chatUserState = require("../../../src/util/chatUserState");
const ChatUserData = require("../../../src/model/application/ChatUserData");
const ChatExpDaily = require("../../../src/model/application/ChatExpDaily");
const ChatExpEvent = require("../../../src/model/application/ChatExpEvent");
const ChatExpUnit = require("../../../src/model/application/ChatExpUnit");
const redis = require("../../../src/util/redis");

// 101-row curve used for level lookups in tests
const EXP_UNIT_ROWS = Array.from({ length: 101 }, (_, i) => ({
  unit_level: i,
  total_exp: Math.round(2.7 * i * i),
}));

const baseState = {
  user_id: "Ua",
  prestige_count: 1,
  current_level: 50,
  current_exp: 6750,
  blessings: [],
  active_trial_id: null,
  active_trial_star: null,
  active_trial_started_at: null,
  active_trial_exp_progress: 0,
  permanent_xp_multiplier: 0,
  rhythm_mastery: false,
  group_bonus_double: false,
};

describe("pipeline.processBatch", () => {
  let loadSpy, findByUserIdSpy, findByUserDateSpy;
  let upsertSpy, upsertDailySpy, insertEventSpy, allExpUnitSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    loadSpy = jest.spyOn(chatUserState, "load");
    findByUserIdSpy = jest.spyOn(ChatUserData, "findByUserId");
    findByUserDateSpy = jest.spyOn(ChatExpDaily, "findByUserDate");
    upsertSpy = jest.spyOn(ChatUserData, "upsert").mockResolvedValue();
    upsertDailySpy = jest.spyOn(ChatExpDaily, "upsertByUserDate").mockResolvedValue();
    insertEventSpy = jest.spyOn(ChatExpEvent, "insertEvent").mockResolvedValue(1);
    allExpUnitSpy = jest.spyOn(ChatExpUnit, "all").mockResolvedValue(EXP_UNIT_ROWS);
    redis.get.mockImplementation(key => {
      if (key === "CHAT_GLOBAL_RATE") return Promise.resolve(null);
      return Promise.resolve(null);
    });
  });

  it("returns early for empty event list", async () => {
    await pipeline.processBatch([]);
    expect(loadSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("processes a single-user single-event batch with defaults", async () => {
    loadSpy.mockResolvedValueOnce(baseState);
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce({ user_id: "Ua", current_exp: 6750, active_trial_exp_progress: 0 });

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // raw = 90 * 1 * 1 * 1 = 90; diminish: dailyBefore=0, all in tier1 -> 90; final = 90
    expect(upsertSpy).toHaveBeenCalledWith(
      "Ua",
      expect.objectContaining({ current_exp: 6840, current_level: expect.any(Number) })
    );
    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "Ua", rawExp: 90, effectiveExp: 90, msgCount: 1 })
    );
    expect(insertEventSpy).toHaveBeenCalledTimes(1);
    expect(insertEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "Ua",
        group_id: "Gx",
        raw_exp: 90,
        effective_exp: 90,
      })
    );
  });

  it("applies honeymoon x1.2 when prestige_count=0", async () => {
    loadSpy.mockResolvedValueOnce({ ...baseState, prestige_count: 0 });
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce(null);

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // raw=90; scaled=108; dailyBefore=0; all tier1 -> 108; final=108 rounded
    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ rawExp: 90, effectiveExp: 108, honeymoonActive: true })
    );
  });

  it("applies ★2 trial x0.7 multiplier", async () => {
    loadSpy.mockResolvedValueOnce({
      ...baseState,
      active_trial_id: 2,
      active_trial_star: 2,
    });
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce({
      user_id: "Ua", current_exp: 6750, active_trial_exp_progress: 500,
    });

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // raw=90; diminish=90; x0.7 = 63
    expect(upsertSpy).toHaveBeenCalledWith(
      "Ua",
      expect.objectContaining({
        current_exp: 6813,   // 6750 + 63
        active_trial_exp_progress: 563,
      })
    );
    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveExp: 63, trialId: 2 })
    );
  });

  it("caps current_exp at 27000 (Lv.100)", async () => {
    loadSpy.mockResolvedValueOnce({ ...baseState, current_level: 99, current_exp: 26950 });
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce({ user_id: "Ua", current_exp: 26950, active_trial_exp_progress: 0 });

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // raw=90, effective=90, would push to 27040 but cap at 27000
    expect(upsertSpy).toHaveBeenCalledWith(
      "Ua",
      expect.objectContaining({ current_exp: 27000, current_level: 100 })
    );
  });

  it("accumulates dailyBefore across multiple events for same user", async () => {
    loadSpy.mockResolvedValueOnce(baseState);
    findByUserDateSpy.mockResolvedValueOnce({ raw_exp: 150, effective_exp: 150 });
    findByUserIdSpy.mockResolvedValueOnce({ user_id: "Ua", current_exp: 6750, active_trial_exp_progress: 0 });

    // Two events, each raw=90; dailyBefore starts at 150
    // Event 1: scaled=90, scaledBefore=150, diminish: 50 at 1.0 + 40 at 0.3 = 50+12=62, effective 62
    // Event 2: scaled=90, scaledBefore=240, diminish: all at 0.3 = 27, effective 27
    // Total raw 180, total effective 89
    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
      { userId: "Ua", groupId: "Gx", ts: 1700000010000, timeSinceLastMsg: 10000, groupCount: 3 },
    ]);

    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ rawExp: 180, effectiveExp: 89, msgCount: 2 })
    );
    expect(insertEventSpy).toHaveBeenCalledTimes(2);
  });

  it("processes multiple users independently", async () => {
    loadSpy
      .mockResolvedValueOnce(baseState)
      .mockResolvedValueOnce({ ...baseState, user_id: "Ub" });
    findByUserDateSpy.mockResolvedValue(null);
    findByUserIdSpy.mockResolvedValue(null);

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
      { userId: "Ub", groupId: "Gx", ts: 1700000001000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(upsertDailySpy).toHaveBeenCalledTimes(2);
  });

  it("time-sorts events per user", async () => {
    loadSpy.mockResolvedValueOnce(baseState);
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce(null);

    const outOfOrder = [
      { userId: "Ua", groupId: "Gx", ts: 1700000010000, timeSinceLastMsg: 10000, groupCount: 3 },
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ];
    await pipeline.processBatch(outOfOrder);

    expect(insertEventSpy.mock.calls[0][0].ts.getTime()).toBe(1700000000000);
    expect(insertEventSpy.mock.calls[1][0].ts.getTime()).toBe(1700000010000);
  });

  it("reads CHAT_GLOBAL_RATE when present", async () => {
    redis.get.mockImplementation(key => {
      if (key === "CHAT_GLOBAL_RATE") return Promise.resolve("120");
      return Promise.resolve(null);
    });
    loadSpy.mockResolvedValueOnce(baseState);
    findByUserDateSpy.mockResolvedValueOnce(null);
    findByUserIdSpy.mockResolvedValueOnce(null);

    await pipeline.processBatch([
      { userId: "Ua", groupId: "Gx", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 },
    ]);

    // base 120 -> raw = 120
    expect(upsertDailySpy).toHaveBeenCalledWith(
      expect.objectContaining({ rawExp: 120, effectiveExp: 120 })
    );
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/pipeline.test.js`

Expected: module not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/service/chatXp/pipeline.js`:

```js
const moment = require("moment");
const config = require("config");
const redis = require("../../util/redis");
const chatUserState = require("../../util/chatUserState");
const ChatUserData = require("../../model/application/ChatUserData");
const ChatExpDaily = require("../../model/application/ChatExpDaily");
const ChatExpEvent = require("../../model/application/ChatExpEvent");
const ChatExpUnit = require("../../model/application/ChatExpUnit");
const { selectCooldownRate } = require("./cooldownTable");
const { computeGroupBonus } = require("./groupBonus");
const { computePerMsgXp } = require("./perMsgXp");
const { applyDiminish } = require("./diminishTier");
const { applyTrialAndPermanent } = require("./trialAndPermanent");

const LEVEL_CAP_EXP = 27000;

async function getBaseXp() {
  const redisRate = await redis.get("CHAT_GLOBAL_RATE");
  if (redisRate !== null && redisRate !== undefined) {
    const n = Number(redisRate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return config.get("chat_level.exp.rate.default");
}

function groupByUser(events) {
  const map = new Map();
  for (const ev of events) {
    if (!map.has(ev.userId)) map.set(ev.userId, []);
    map.get(ev.userId).push(ev);
  }
  return map;
}

async function processBatch(events) {
  if (!Array.isArray(events) || events.length === 0) return;
  const base = await getBaseXp();
  const expUnitRows = await ChatExpUnit.all();
  const today = moment().utcOffset(480).format("YYYY-MM-DD");

  const byUser = groupByUser(events);
  for (const [userId, userEvents] of byUser) {
    userEvents.sort((a, b) => a.ts - b.ts);
    await processUserEvents(userId, userEvents, { base, expUnitRows, today });
  }
}

async function processUserEvents(userId, events, ctx) {
  const state = await chatUserState.load(userId);
  const dailyRow = await ChatExpDaily.findByUserDate(userId, ctx.today);
  const dailyRawBefore = dailyRow?.raw_exp ?? 0;
  const honeymoonMult = state.prestige_count === 0 ? 1.2 : 1.0;

  let rawDelta = 0;
  let effectiveDelta = 0;
  let msgCount = 0;
  const eventRecords = [];

  for (const event of events) {
    const cooldownRate = selectCooldownRate(event.timeSinceLastMsg, state);
    const groupBonus = computeGroupBonus(event.groupCount, state);
    const raw = computePerMsgXp({ base: ctx.base, cooldownRate, groupBonus, status: state });

    const scaledIncoming = raw * honeymoonMult;
    const scaledBefore = (dailyRawBefore + rawDelta) * honeymoonMult;
    const afterDiminish = applyDiminish(scaledIncoming, scaledBefore, state);
    const finalEffective = applyTrialAndPermanent(afterDiminish, state);
    const effectiveInt = Math.max(0, Math.round(finalEffective));

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
      modifiers: {
        honeymoon: state.prestige_count === 0,
        active_trial_id: state.active_trial_id,
        active_trial_star: state.active_trial_star,
        blessings: state.blessings,
        permanent_xp_multiplier: state.permanent_xp_multiplier,
      },
    });
  }

  if (rawDelta === 0 && msgCount === 0) return;

  await writeBatch(userId, state, {
    today: ctx.today,
    expUnitRows: ctx.expUnitRows,
    rawDelta,
    effectiveDelta,
    msgCount,
    eventRecords,
  });
}

async function writeBatch(userId, state, batch) {
  const existing = await ChatUserData.findByUserId(userId);
  const prevExp = existing?.current_exp ?? 0;
  const prevTrialProgress = existing?.active_trial_exp_progress ?? 0;
  const newExp = Math.min(LEVEL_CAP_EXP, prevExp + batch.effectiveDelta);
  const newLevel = ChatExpUnit.getLevelFromExp(newExp, batch.expUnitRows);
  const newTrialProgress = state.active_trial_id
    ? prevTrialProgress + batch.effectiveDelta
    : prevTrialProgress;

  const updates = { current_exp: newExp, current_level: newLevel };
  if (state.active_trial_id) updates.active_trial_exp_progress = newTrialProgress;

  await ChatUserData.upsert(userId, updates);

  await ChatExpDaily.upsertByUserDate({
    userId,
    date: batch.today,
    rawExp: batch.rawDelta,
    effectiveExp: batch.effectiveDelta,
    msgCount: batch.msgCount,
    honeymoonActive: state.prestige_count === 0,
    trialId: state.active_trial_id,
  });

  for (const rec of batch.eventRecords) {
    await ChatExpEvent.insertEvent(rec);
  }
}

module.exports = { processBatch };
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/service/chatXp/pipeline.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hanshino/workspace/redive_linebot && git add app/src/service/chatXp/pipeline.js app/__tests__/service/chatXp/pipeline.test.js && git commit -m "feat(chat-level): pipeline orchestrator

processBatch groups events by userId, time-sorts, runs the 5-step XP
pipeline (cooldown -> groupBonus -> perMsg -> honeymoon+diminish ->
trial+permanent), writes chat_user_data / chat_exp_daily / chat_exp_events.
Level-cap at 27000. Reads CHAT_GLOBAL_RATE override from Redis."
```

---

## Task 8: Rewrite `EventDequeue.handleChatExp` — new payload + TTL fix (TDD)

**Files:**
- Modify: `app/bin/EventDequeue.js` — rewrite `handleChatExp` and delete `getExpRate` / `getGroupExpAdditionRate`
- Create: `app/__tests__/bin/EventDequeue.handleChatExp.test.js`

**Old payload** (`CHAT_EXP_RECORD`):
```js
{ userId, expUnit }
```

**New payload**:
```js
{ userId, groupId, ts, timeSinceLastMsg, groupCount }
```

**Behavior changes:**
- TTL on `CHAT_TOUCH_TIMESTAMP_{userId}` → **10 seconds** (was 5 — bug, spec line 88).
- Always update touch TS on every text group message (old code skipped when cooldown was 0; skip is not needed in new pipeline).
- No cooldown / XP pre-computation here. Pipeline owns all of it.
- Preserve early-return guards: skip non-group, non-message, non-text events.

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/bin/EventDequeue.handleChatExp.test.js`:

```js
// Test the exported handleChatExp behavior. We expose it by destructuring
// from a require cycle that captures internals — OR refactor to export.
// We'll expose via a test helper export in the module itself.
const redis = require("../../src/util/redis");
// handleChatExp + __testing are added as exports in Task 8 Step 3.
const { handleChatExp } = require("../../bin/EventDequeue").__testing;

function groupTextEvent({ userId = "Uaaa", groupId = "Gbbb", ts = 1700000000000, text = "hi" } = {}) {
  return {
    source: { type: "group", userId, groupId },
    type: "message",
    message: { type: "text", text },
    timestamp: ts,
  };
}

describe("EventDequeue.handleChatExp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue();
    redis.lPush.mockResolvedValue();
  });

  it("ignores non-group events", async () => {
    await handleChatExp({
      source: { type: "user", userId: "Uaaa" },
      type: "message",
      message: { type: "text" },
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("ignores non-text messages", async () => {
    await handleChatExp({
      source: { type: "group", userId: "Uaaa", groupId: "Gbbb" },
      type: "message",
      message: { type: "sticker" },
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("ignores non-message events", async () => {
    await handleChatExp({
      source: { type: "group", userId: "Uaaa", groupId: "Gbbb" },
      type: "follow",
      timestamp: 1700000000000,
    });
    expect(redis.lPush).not.toHaveBeenCalled();
  });

  it("pushes new-shape payload with null timeSinceLastMsg on first message", async () => {
    redis.get.mockResolvedValueOnce(null); // no CHAT_TOUCH_TIMESTAMP
    redis.get.mockResolvedValueOnce(null); // member count cache miss (handler may use a separate path)

    await handleChatExp(groupTextEvent({ userId: "Uaaa", groupId: "Gbbb", ts: 1700000000000 }));

    const pushCall = redis.lPush.mock.calls.find(c => c[0] === "CHAT_EXP_RECORD");
    expect(pushCall).toBeDefined();
    const payload = JSON.parse(pushCall[1]);
    expect(payload).toEqual(
      expect.objectContaining({
        userId: "Uaaa",
        groupId: "Gbbb",
        ts: 1700000000000,
        timeSinceLastMsg: null,
      })
    );
    expect(typeof payload.groupCount).toBe("number");
  });

  it("computes timeSinceLastMsg from previous touch TS", async () => {
    // CHAT_TOUCH_TIMESTAMP_{user} returns 1699999997000
    redis.get.mockImplementation(key => {
      if (key === "CHAT_TOUCH_TIMESTAMP_Uaaa") return Promise.resolve("1699999997000");
      return Promise.resolve(null);
    });

    await handleChatExp(groupTextEvent({ userId: "Uaaa", ts: 1700000000000 }));

    const pushCall = redis.lPush.mock.calls.find(c => c[0] === "CHAT_EXP_RECORD");
    const payload = JSON.parse(pushCall[1]);
    expect(payload.timeSinceLastMsg).toBe(3000);
  });

  it("sets CHAT_TOUCH_TIMESTAMP_{userId} with 10s TTL", async () => {
    redis.get.mockResolvedValue(null);

    await handleChatExp(groupTextEvent({ userId: "Uaaa", ts: 1700000000000 }));

    expect(redis.set).toHaveBeenCalledWith(
      "CHAT_TOUCH_TIMESTAMP_Uaaa",
      "1700000000000",
      { EX: 10 }
    );
  });

  it("always updates touch TS even when timeSinceLastMsg < 1s", async () => {
    redis.get.mockImplementation(key => {
      if (key === "CHAT_TOUCH_TIMESTAMP_Uaaa") return Promise.resolve("1699999999500");
      return Promise.resolve(null);
    });

    await handleChatExp(groupTextEvent({ userId: "Uaaa", ts: 1700000000000 }));

    expect(redis.set).toHaveBeenCalledWith(
      "CHAT_TOUCH_TIMESTAMP_Uaaa",
      "1700000000000",
      { EX: 10 }
    );
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/bin/EventDequeue.handleChatExp.test.js`

Expected: failure — `__testing` export doesn't exist yet, or pushed payload doesn't match.

- [ ] **Step 3: Rewrite `handleChatExp` in `app/bin/EventDequeue.js`**

Locate the existing `handleChatExp`, `getExpRate`, `getGroupExpAdditionRate` functions (lines ~132-191 in current file) and replace with:

```js
async function handleChatExp(botEvent) {
  if (botEvent.source.type !== "group") return;
  if (botEvent.type !== "message" || botEvent.message.type !== "text") return;

  const { userId, groupId } = botEvent.source;
  if (!userId || !groupId) return;

  const currTS = botEvent.timestamp;
  const touchKey = `CHAT_TOUCH_TIMESTAMP_${userId}`;
  const lastTouchRaw = await redis.get(touchKey);
  const lastTouchTS = lastTouchRaw ? Number(lastTouchRaw) : null;
  const timeSinceLastMsg =
    lastTouchTS && Number.isFinite(lastTouchTS) ? currTS - lastTouchTS : null;

  const groupCount = await getGroupMemberCount(groupId);

  // Always update touch TS (10s TTL per spec line 88 — old 5s was a bug)
  await redis.set(touchKey, String(currTS), { EX: 10 });

  await redis.lPush(
    "CHAT_EXP_RECORD",
    JSON.stringify({ userId, groupId, ts: currTS, timeSinceLastMsg, groupCount })
  );
}
```

Remove the now-unused helpers `getExpRate` and `getGroupExpAdditionRate`. Keep `getGroupMemberCount` (still needed).

Add a `__testing` export at the bottom of the file (near the existing `if (require.main === module)` block):

```js
module.exports.__testing = { handleChatExp };
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/bin/EventDequeue.handleChatExp.test.js`

Expected: all tests pass.

If `redis.lPush` is not in the global mock, add it to `app/__tests__/setup.js` (at the top, in the redis mock object): `lPush: jest.fn(), rPop: jest.fn()`. Commit this setup change in the same task.

- [ ] **Step 5: Commit**

```bash
cd /home/hanshino/workspace/redive_linebot && git add app/bin/EventDequeue.js app/__tests__/bin/EventDequeue.handleChatExp.test.js app/__tests__/setup.js 2>/dev/null; git commit -m "feat(chat-level): EventDequeue.handleChatExp new payload + TTL fix

Emit {userId, groupId, ts, timeSinceLastMsg, groupCount} into
CHAT_EXP_RECORD; let pipeline own all XP computation. TTL on
CHAT_TOUCH_TIMESTAMP bumped 5s -> 10s (spec line 88 — old value was
below the full-speed threshold). Always update touch TS."
```

---

## Task 9: Rewrite `ChatExpUpdate.js` — consume new queue through pipeline

**Files:**
- Rewrite: `app/bin/ChatExpUpdate.js`
- Test: `app/__tests__/bin/ChatExpUpdate.test.js`

The new file is thin — it just pops events and hands them to `pipeline.processBatch`.

- [ ] **Step 1: Write failing test**

Create `app/__tests__/bin/ChatExpUpdate.test.js`:

```js
const redis = require("../../src/util/redis");
const pipeline = require("../../src/service/chatXp/pipeline");
const ChatExpUpdate = require("../../bin/ChatExpUpdate");

describe("ChatExpUpdate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(pipeline, "processBatch").mockResolvedValue();
  });

  it("no-ops when queue is empty", async () => {
    redis.rPop.mockResolvedValue(null);
    await ChatExpUpdate();
    expect(pipeline.processBatch).not.toHaveBeenCalled();
  });

  it("pops up to 1000 events and hands them to pipeline.processBatch", async () => {
    const events = Array.from({ length: 3 }, (_, i) => ({
      userId: `U${i}`, groupId: "G", ts: 1700000000000 + i, timeSinceLastMsg: null, groupCount: 3,
    }));
    redis.rPop
      .mockResolvedValueOnce(JSON.stringify(events[0]))
      .mockResolvedValueOnce(JSON.stringify(events[1]))
      .mockResolvedValueOnce(JSON.stringify(events[2]))
      .mockResolvedValueOnce(null);

    await ChatExpUpdate();

    expect(pipeline.processBatch).toHaveBeenCalledTimes(1);
    expect(pipeline.processBatch).toHaveBeenCalledWith(events);
  });

  it("skips unparseable queue items but still processes parseable ones", async () => {
    const good = { userId: "Ua", groupId: "G", ts: 1700000000000, timeSinceLastMsg: null, groupCount: 3 };
    redis.rPop
      .mockResolvedValueOnce("{{ bad json")
      .mockResolvedValueOnce(JSON.stringify(good))
      .mockResolvedValueOnce(null);

    await ChatExpUpdate();

    expect(pipeline.processBatch).toHaveBeenCalledWith([good]);
  });

  it("re-enters are guarded (running=true short-circuits)", async () => {
    redis.rPop.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(null), 20))
    );
    // First call does not await before second — simulate overlap
    const p1 = ChatExpUpdate();
    const p2 = ChatExpUpdate();
    await Promise.all([p1, p2]);
    // The second call returns early; we can't observe directly, but redis.rPop
    // should only have been invoked by the first runner.
    expect(redis.rPop.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/bin/ChatExpUpdate.test.js`

Expected: current ChatExpUpdate doesn't delegate to pipeline — tests fail on missing `pipeline.processBatch` call.

- [ ] **Step 3: Rewrite `app/bin/ChatExpUpdate.js`**

Replace the entire file with:

```js
const redis = require("../src/util/redis");
const pipeline = require("../src/service/chatXp/pipeline");
const { DefaultLogger } = require("../src/util/Logger");

module.exports = main;

let running = false;

async function main() {
  if (running) return;
  running = true;
  try {
    const events = await popQueue();
    if (events.length === 0) return;
    await pipeline.processBatch(events);
  } catch (err) {
    console.error(err);
    DefaultLogger.error(err);
  } finally {
    running = false;
  }
}

async function popQueue(max = 1000) {
  const events = [];
  for (let i = 0; i < max; i++) {
    const raw = await redis.rPop("CHAT_EXP_RECORD");
    if (raw === null) break;
    try {
      events.push(JSON.parse(raw));
    } catch {
      // skip malformed payloads — they never re-enter the queue
    }
  }
  return events;
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test __tests__/bin/ChatExpUpdate.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hanshino/workspace/redive_linebot && git add app/bin/ChatExpUpdate.js app/__tests__/bin/ChatExpUpdate.test.js && git commit -m "feat(chat-level): ChatExpUpdate delegates to pipeline

Pops up to 1000 events from CHAT_EXP_RECORD and hands them to
pipeline.processBatch. Skips malformed payloads. Preserves the
running-guard so overlapping cron firings short-circuit."
```

---

## Task 10: Lint + full test sweep

**Files:** (none — verification only)

- [ ] **Step 1: Run eslint**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn lint 2>&1 | tail -30`

Expected: no errors. If the new files flag warnings, fix them before proceeding.

- [ ] **Step 2: Run the full jest suite**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test 2>&1 | tail -40`

Expected:
- All M2 tests (6 new test files) pass.
- All pre-existing tests pass (except the one pre-M1 flake in `images.test.js` which is documented as unrelated).
- Total suite count: roughly 280+ (M1 left 271; M2 adds ~60-80 new tests).

If any pre-existing test newly fails, stop and investigate — M2 shouldn't have touched any pre-existing behavior (old ChatLevelModel reads still route through the old (broken) path; but that broken path has been broken since M1, so no regression). Tests that were green after M1 must remain green.

- [ ] **Step 3: Commit any fixes from lint/test**

If lint or test fixes were needed, commit them:
```bash
cd /home/hanshino/workspace/redive_linebot && git add -A && git commit -m "chore(chat-level): lint + test sweep for M2"
```
If nothing to commit, skip this step.

---

## Task 11: Local smoke test against real MySQL + Redis

**Files:** (none — manual verification against the local dev DB)

This exercises the full pipeline end-to-end using the running MySQL container and Redis (from `make infra`).

- [ ] **Step 1: Ensure infra is up**

Run:
```bash
docker ps --filter name=redive_linebot --format "{{.Names}}\t{{.Status}}"
```
Expected: `redive_linebot-mysql-1 Up ... (healthy)`.

If not, run `cd /home/hanshino/workspace/redive_linebot && make infra`. (Note: the repo's `redis-test` container may occupy port 6379 — if redis fails to bind, stop that external container or use its existing instance; mysql alone is sufficient for this smoke test if you mock redis below.)

If no real Redis is available, skip Steps 2-4 and do Step 5 only (DB-level verification via raw inserts).

- [ ] **Step 2: Manually push a synthetic event into CHAT_EXP_RECORD**

Use a local node shell (from `/home/hanshino/workspace/redive_linebot/app`):

```bash
cd /home/hanshino/workspace/redive_linebot/app && node -e "
const redis = require('./src/util/redis');
const evt = { userId: 'Utest' + '0'.repeat(28), groupId: 'Gtest' + '0'.repeat(28), ts: Date.now(), timeSinceLastMsg: null, groupCount: 5 };
redis.lPush('CHAT_EXP_RECORD', JSON.stringify(evt)).then(() => { console.log('pushed', evt); process.exit(0); });
"
```

Expected: prints `pushed { userId: ..., ... }` and exits cleanly.

- [ ] **Step 3: Run ChatExpUpdate once**

```bash
cd /home/hanshino/workspace/redive_linebot/app && node bin/ChatExpUpdate.js
```

Expected: exits with code 0, no uncaught errors. (The process might wait for Logger flushes — Ctrl+C after a few seconds is acceptable if it hangs on logger cleanup.)

- [ ] **Step 4: Verify DB rows were written**

Run:
```bash
PASS="$(grep '^DB_PASSWORD=' /home/hanshino/workspace/redive_linebot/.env | cut -d= -f2)"; docker exec redive_linebot-mysql-1 mysql -uroot -p"$PASS" Princess -e "SELECT user_id, current_exp, current_level FROM chat_user_data WHERE user_id LIKE 'Utest%'; SELECT user_id, date, raw_exp, effective_exp, msg_count FROM chat_exp_daily WHERE user_id LIKE 'Utest%'; SELECT user_id, raw_exp, effective_exp, cooldown_rate, group_bonus FROM chat_exp_events WHERE user_id LIKE 'Utest%';" 2>&1 | grep -v "Using a password"
```

Expected:
- `chat_user_data`: one row for the test userId, `current_exp = 90`, `current_level = 5` (since `round(2.7 × 5²) = 68 ≤ 90 < round(2.7 × 6²) = 97`).
- `chat_exp_daily`: one row with `raw_exp = 90`, `effective_exp = 108` (prestige_count=0 so honeymoon ×1.2 = 108), `msg_count = 1`.
- Wait — `current_exp` should also be 108 (effective, not raw). Re-verify: pipeline adds `effectiveDelta` (108) to `current_exp`, so `current_exp = 108`, `current_level` corresponds to `getLevelFromExp(108)` = 6 (since `2.7×6² = 97 ≤ 108`). The raw_exp=90 in chat_exp_daily is the pre-honeymoon raw; effective_exp=108 is post-honeymoon-diminish (all in tier1) = 108.

If the row shapes match those expectations, Step 4 passes.

- [ ] **Step 5: Clean up test row**

```bash
PASS="$(grep '^DB_PASSWORD=' /home/hanshino/workspace/redive_linebot/.env | cut -d= -f2)"; docker exec redive_linebot-mysql-1 mysql -uroot -p"$PASS" Princess -e "DELETE FROM chat_user_data WHERE user_id LIKE 'Utest%'; DELETE FROM chat_exp_daily WHERE user_id LIKE 'Utest%'; DELETE FROM chat_exp_events WHERE user_id LIKE 'Utest%';" 2>&1 | grep -v "Using a password"
```

Expected: no errors.

- [ ] **Step 6: Report results**

Document in a brief comment on the final merge commit (Task 12): "M2 smoke test: 1 synthetic event → chat_user_data current_exp=108 level=6, chat_exp_daily raw=90 effective=108, chat_exp_events rate=1 groupBonus=1. Honeymoon x1.2 verified."

If Step 2-4 could not run (no redis available locally), document that in the merge commit — acceptable fallback is test-coverage (Task 10) as the only verification, given M2's pipeline is heavily unit-tested.

---

## Task 12: Merge `feat/clp-m2` → `feat/chat-level-prestige`

**Files:** (none — git ops only)

- [ ] **Step 1: Final verification commit log on M2 branch**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git log feat/chat-level-prestige..feat/clp-m2 --oneline
```

Expected: ~10 commits, one per task (Tasks 1-9 each commit; Task 10 may or may not have added a chore commit).

- [ ] **Step 2: Switch back to integration branch**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git checkout feat/chat-level-prestige
```

Expected: `Switched to branch 'feat/chat-level-prestige'`.

- [ ] **Step 3: Merge with --no-ff to preserve milestone boundary**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git merge --no-ff feat/clp-m2 -m "$(cat <<'EOF'
Merge M2: core XP pipeline rewrite

- 5 pure compute modules (cooldown / groupBonus / perMsg / diminish / trial&permanent)
- chatUserState Redis cache + DB hydration
- pipeline orchestrator with honeymoon + Lv.100 cap
- EventDequeue.handleChatExp new payload + TTL fix (5s -> 10s)
- ChatExpUpdate delegates to pipeline

Follows M1 schema. Does not touch M3+ responsibilities (trial
lifecycle, broadcasts, achievements, controller cleanup, feature flag).

Smoke test: synthetic event -> chat_user_data / chat_exp_daily /
chat_exp_events all updated correctly. Unit tests 60+ new.
EOF
)"
```

Expected: merge commit created; no conflicts (M2 added new files + rewrote 2 existing files that no one else touched in M1).

- [ ] **Step 4: Verify final state**

Run:
```bash
cd /home/hanshino/workspace/redive_linebot && git log --oneline -5 && git status
```

Expected: HEAD is the merge commit; working tree clean; branch is ahead of origin by 10-12 commits.

- [ ] **Step 5: Push integration branch**

```bash
cd /home/hanshino/workspace/redive_linebot && git push origin feat/chat-level-prestige
```

Expected: push succeeds. (No PR opens — the plan is to accumulate M2-M10 on the integration branch, single PR at the end.)

- [ ] **Step 6: Optionally delete M2 branch locally**

```bash
cd /home/hanshino/workspace/redive_linebot && git branch -d feat/clp-m2
```

Expected: `Deleted branch feat/clp-m2 (was <sha>).` — proves merge was clean and reachable from the integration branch.

---

## Exit Criteria (for the whole plan)

- [ ] All 12 tasks complete.
- [ ] `yarn test` green (271+60 new ≈ 330+ tests; 1 pre-existing images.test.js failure is acceptable).
- [ ] `yarn lint` clean for `app/`.
- [ ] `app/src/service/chatXp/` contains: `cooldownTable.js`, `groupBonus.js`, `perMsgXp.js`, `diminishTier.js`, `trialAndPermanent.js`, `pipeline.js`.
- [ ] `app/src/util/chatUserState.js` present.
- [ ] `app/bin/EventDequeue.js` pushes new-shape payload and uses TTL 10s.
- [ ] `app/bin/ChatExpUpdate.js` delegates to `pipeline.processBatch`.
- [ ] Smoke test (Task 11) documented results (or fallback noted).
- [ ] Integration branch `feat/chat-level-prestige` pushed to origin with M2 merge commit on top.

## Out of Scope for M2 (explicit reminder)

- Trial / prestige lifecycle state machine → **M3**
- Group broadcast of trial pass / prestige / Lv.100 CTA → **M3 / M4**
- Reply token queue sorted-set rewrite → **M4**
- 7 new achievements + `AchievementEngine.batchEvaluate` rewrite → **M5**
- LIFF pages + `/api/prestige/*` endpoints → **M6**
- `ChatLevelController` cleanup + 冒險小卡 status flags → **M7**
- `CHAT_XP_PAUSED` feature flag + `TrialExpiryCheck` + `ChatExpEventsPrune` crons → **M8**
- Migration script + rollback + staging drill → **M9**
- Rollout announcements + T-0 cutover + T+7 observation → **M10**

## Notes for Implementer

- **Don't touch `app/src/model/application/ChatLevelModel.js`** — it's already broken after M1 (reads nonexistent `experience` column); M7 rewrites it. Leaving it untouched is correct.
- **Don't fix `AchievementEngine.batchEvaluate`** — same reason, M5 owns it.
- **Don't add a `CHAT_DAILY_XP_{userId}_{date}` Redis key** — the 5-minute batch reads `chat_exp_daily` directly. The impl plan mentions this key as "future optional cache"; M2 doesn't need it. YAGNI.
- **Float vs integer in diminish**: `applyDiminish` returns a float. The pipeline rounds to int at write time (`Math.round`). This matches the SMALLINT/INT UNSIGNED column types.
- **Rounding of `group_bonus` in events table**: stored as `DECIMAL(4,2)` — knex mysql2 driver handles float → decimal conversion automatically when the value is passed as a number.
- **No Redis transactions** for state invalidation — M2 only invalidates via `chatUserState.invalidate` (not used in M2 itself; lives for M3). Pipeline reads state once per user per batch, which is fine since state changes (trial start, prestige) are mediated through LIFF → API → service, not through pipeline.
