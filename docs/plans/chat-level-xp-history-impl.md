# Chat Level XP History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a player-facing XP-gain history feature on the `feat/chat-level-prestige` branch — `#經驗歷程` Flex bubble, `/me` CTA, LIFF `/xp-history` page (逐筆 + 每日趨勢) with full multiplier breakdown.

**Architecture:** Extend the existing `chat_exp_events` write path with six numeric multiplier columns; refactor the three chat-XP services to expose factor values without changing their math; add three read-only `/api/me/xp-*` endpoints; render Flex bubble + LIFF page in the existing chat-level-prestige UI vocabulary.

**Tech Stack:** Knex / MySQL · Bottender (LINE) · Express · React 19 + MUI 7 + Vite · Jest (backend tests) · `recharts`-free hand-rolled SVG (Tab 2 chart).

**Spec:** `docs/plans/chat-level-xp-history.md` (read first).

**Branch:** `feat/chat-level-prestige` (no new branch — extension of the existing series).

---

## File Map

### Backend (`app/`)
| Path | Action | Purpose |
|---|---|---|
| `app/migrations/<ts>_add_xp_breakdown_columns_to_chat_exp_events.js` | Create | Add 6 nullable decimal columns |
| `app/src/service/chatXp/perMsgXp.js` | Modify | Return `{ raw, blessing1Mult }` |
| `app/src/service/chatXp/diminishTier.js` | Modify | Return `{ result, factor }` |
| `app/src/service/chatXp/trialAndPermanent.js` | Modify | Return `{ result, trialMult, permanentMult }` |
| `app/src/service/chatXp/__tests__/perMsgXp.test.js` | Create | Unit tests for new shape |
| `app/src/service/chatXp/__tests__/diminishTier.test.js` | Create | Unit tests for new shape |
| `app/src/service/chatXp/__tests__/trialAndPermanent.test.js` | Create | Unit tests for new shape |
| `app/src/service/chatXp/pipeline.js` | Modify | Persist 6 new fields per event |
| `app/src/service/chatXp/__tests__/pipeline.test.js` | Create | Integration test for end-to-end persistence |
| `app/src/model/application/ChatExpEvent.js` | Modify | Add fillable cols + range/recent helpers |
| `app/src/service/XpHistoryService.js` | Create | Compose summary / events / daily payloads |
| `app/src/service/__tests__/XpHistoryService.test.js` | Create | Unit tests for service |
| `app/src/router/api.js` | Modify | Wire 3 new GETs |
| `app/src/templates/application/XpHistory/Bubble.js` | Create | Flex bubble template |
| `app/src/templates/application/XpHistory/__tests__/Bubble.test.js` | Create | Snapshot + variant tests |
| `app/src/templates/application/Me/Profile.js` | Modify | Add CTA slot |
| `app/src/templates/application/Me/__tests__/Profile.test.js` | Modify | Cover new CTA |
| `app/src/controller/application/ChatLevelController.js` | Modify | `showXpHistory` handler |
| `app/src/app.js` | Modify | Register `#經驗歷程` matcher |

### Frontend (`frontend/`)
| Path | Action | Purpose |
|---|---|---|
| `frontend/src/pages/XpHistory/index.jsx` | Create | Page shell + Tabs + showAll toggle |
| `frontend/src/pages/XpHistory/EventList.jsx` | Create | Tab 1 list + client fold |
| `frontend/src/pages/XpHistory/BreakdownRow.jsx` | Create | Multiplier chain |
| `frontend/src/pages/XpHistory/DailyTrend.jsx` | Create | Tab 2 SVG stacked bar |
| `frontend/src/pages/XpHistory/foldEvents.js` | Create | Pure folding helper (mirrors spec §14 hash) |
| `frontend/src/pages/XpHistory/groupLabel.js` | Create | Group-id → display name with `…<last4>` fallback |
| `frontend/src/App.jsx` | Modify | Add `/xp-history` route |

---

## Conventions

- **Commit style:** Conventional commits with scope. Use `feat(chat-level): ...` for new functionality, `refactor(chat-level): ...` for the service refactors, `test(chat-level): ...` for test-only commits.
- **TDD discipline:** for the three service refactors, write failing tests for the new return shape first. For Flex / LIFF, snapshot or shallow-render tests after the manual visual check.
- **Run tests with:** `cd app && yarn test -- <test path>` for a single file; `cd app && yarn test` for all backend.
- **Lint:** `cd app && yarn lint` (and `cd frontend && yarn lint` for frontend changes) before committing.
- **Migration file:** create with `cd app && yarn knex migrate:make add_xp_breakdown_columns_to_chat_exp_events` (never hand-write the filename).

---

## M1 — Schema migration

### Task 1: Create migration adding 6 numeric columns

**Files:**
- Create: `app/migrations/<ts>_add_xp_breakdown_columns_to_chat_exp_events.js` (timestamp comes from `knex migrate:make`)

- [ ] **Step 1: Generate migration skeleton**

```bash
cd app && yarn knex migrate:make add_xp_breakdown_columns_to_chat_exp_events
```

Expected: prints the new file path under `migrations/`. Note the timestamp.

- [ ] **Step 2: Fill in the migration body**

Replace the generated file's contents with:

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const TABLE = "chat_exp_events";

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.decimal("base_xp", 4, 3).nullable().after("modifiers");
    table.decimal("blessing1_mult", 4, 3).nullable().after("base_xp");
    table.decimal("honeymoon_mult", 4, 3).nullable().after("blessing1_mult");
    table.decimal("diminish_factor", 4, 3).nullable().after("honeymoon_mult");
    table.decimal("trial_mult", 4, 3).nullable().after("diminish_factor");
    table.decimal("permanent_mult", 4, 3).nullable().after("trial_mult");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.dropColumns(
      "base_xp",
      "blessing1_mult",
      "honeymoon_mult",
      "diminish_factor",
      "trial_mult",
      "permanent_mult"
    );
  });
};
```

- [ ] **Step 3: Run the migration locally**

Make sure docker infra is running (`make infra`). Then:

```bash
cd app && yarn migrate
```

Expected: `Batch N run: 1 migrations` and the new filename listed.

- [ ] **Step 4: Verify columns exist**

```bash
docker exec -i $(docker compose ps -q mysql) mysql -uroot -p"${DB_PASSWORD}" Princess -e "DESCRIBE chat_exp_events;" 2>/dev/null
```

Expected: the six new columns listed with `decimal(4,3)`, `YES` for nullable.

- [ ] **Step 5: Verify rollback works (then re-apply)**

```bash
cd app && yarn knex migrate:rollback && yarn migrate
```

Expected: rollback drops columns; re-applying restores them. No errors.

- [ ] **Step 6: Commit**

```bash
git add app/migrations/
git commit -m "$(cat <<'EOF'
feat(chat-level): migration to add XP breakdown columns

chat_exp_events gains base_xp / blessing1_mult / honeymoon_mult /
diminish_factor / trial_mult / permanent_mult (decimal(4,3), nullable).
Old rows stay readable; new rows fed by upcoming pipeline refactor.
EOF
)"
```

---

## M2 — Service refactors (TDD)

The three multiplier services must expose their factors so `pipeline.js` can persist them. Behavior of the existing public values must not drift.

### Task 2: Refactor `diminishTier.js` to return `{ result, factor }`

**Files:**
- Modify: `app/src/service/chatXp/diminishTier.js`
- Create: `app/src/service/chatXp/__tests__/diminishTier.test.js`

- [ ] **Step 1: Write the failing test**

```js
// app/src/service/chatXp/__tests__/diminishTier.test.js
const { applyDiminish } = require("../diminishTier");

describe("applyDiminish", () => {
  test("returns { result, factor } shape", () => {
    const out = applyDiminish(10, 0, { blessings: [] });
    expect(out).toHaveProperty("result");
    expect(out).toHaveProperty("factor");
  });

  test("tier 1 only: factor=1.0, result === incoming", () => {
    const { result, factor } = applyDiminish(50, 100, { blessings: [] });
    expect(result).toBe(50);
    expect(factor).toBe(1);
  });

  test("entirely in tier 2: factor=0.3", () => {
    // dailyBefore=500 (already past 400), tier2_upper=1000
    const { result, factor } = applyDiminish(100, 500, { blessings: [] });
    expect(result).toBeCloseTo(30);
    expect(factor).toBeCloseTo(0.3);
  });

  test("entirely in tier 3: factor=0.03", () => {
    const { result, factor } = applyDiminish(100, 1500, { blessings: [] });
    expect(result).toBeCloseTo(3);
    expect(factor).toBeCloseTo(0.03);
  });

  test("crosses tier 1 to tier 2: factor is mixed (>0.3, <1)", () => {
    // 100 incoming, dailyBefore=350, tier1_upper=400 → 50 at 1.0 + 50 at 0.3 = 65
    const { result, factor } = applyDiminish(100, 350, { blessings: [] });
    expect(result).toBeCloseTo(65);
    expect(factor).toBeCloseTo(0.65);
  });

  test("incoming = 0 → result 0, factor 0", () => {
    const { result, factor } = applyDiminish(0, 0, { blessings: [] });
    expect(result).toBe(0);
    expect(factor).toBe(0);
  });

  test("blessing 4 expands tier 1 cap to 600", () => {
    const { result, factor } = applyDiminish(100, 500, { blessings: [4] });
    expect(result).toBe(100);
    expect(factor).toBe(1);
  });

  test("blessing 5 expands tier 2 cap to 1200", () => {
    // dailyBefore=1100, tier2_upper=1200 (with blessing 5), 100 incoming → 30 at tier2 ratio
    const { result, factor } = applyDiminish(100, 1100, { blessings: [5] });
    expect(result).toBeCloseTo(30);
    expect(factor).toBeCloseTo(0.3);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd app && yarn test -- src/service/chatXp/__tests__/diminishTier.test.js
```

Expected: all tests fail with `out.result is undefined` (or similar — current implementation returns a number).

- [ ] **Step 3: Refactor implementation**

Replace `app/src/service/chatXp/diminishTier.js` with:

```js
const TIER1_RATE = 1.0;
const TIER2_RATE = 0.3;
const TIER3_RATE = 0.03;

function applyDiminish(incoming, dailyBefore, status) {
  if (incoming <= 0) return { result: 0, factor: 0 };

  const blessings = Array.isArray(status.blessings) ? status.blessings : [];
  const tier1Upper = blessings.includes(4) ? 600 : 400;
  const tier2Upper = blessings.includes(5) ? 1200 : 1000;

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
  }
  if (remaining > 0) {
    result += remaining * TIER3_RATE;
  }

  return { result, factor: result / incoming };
}

module.exports = { applyDiminish };
```

- [ ] **Step 4: Re-run the test**

```bash
cd app && yarn test -- src/service/chatXp/__tests__/diminishTier.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/service/chatXp/diminishTier.js app/src/service/chatXp/__tests__/diminishTier.test.js
git commit -m "refactor(chat-level): expose diminish factor from applyDiminish"
```

---

### Task 3: Refactor `trialAndPermanent.js` to return `{ result, trialMult, permanentMult }`

**Files:**
- Modify: `app/src/service/chatXp/trialAndPermanent.js`
- Create: `app/src/service/chatXp/__tests__/trialAndPermanent.test.js`

- [ ] **Step 1: Write the failing test**

```js
// app/src/service/chatXp/__tests__/trialAndPermanent.test.js
const { applyTrialAndPermanent } = require("../trialAndPermanent");

describe("applyTrialAndPermanent", () => {
  test("no trial, no permanent → trialMult=1, permanentMult=1", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: null, permanent_xp_multiplier: 0 });
    expect(out.result).toBe(10);
    expect(out.trialMult).toBe(1);
    expect(out.permanentMult).toBe(1);
  });

  test("★2 trial → trialMult=0.7", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: 2, permanent_xp_multiplier: 0 });
    expect(out.trialMult).toBe(0.7);
    expect(out.result).toBeCloseTo(7);
  });

  test("★5 trial → trialMult=0.5", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: 5, permanent_xp_multiplier: 0 });
    expect(out.trialMult).toBe(0.5);
    expect(out.result).toBeCloseTo(5);
  });

  test("permanent 0.05 → permanentMult=1.05", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: null, permanent_xp_multiplier: 0.05 });
    expect(out.permanentMult).toBeCloseTo(1.05);
    expect(out.result).toBeCloseTo(10.5);
  });

  test("trial × permanent compose multiplicatively", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: 5, permanent_xp_multiplier: 0.05 });
    expect(out.result).toBeCloseTo(10 * 0.5 * 1.05);
  });

  test("nullish permanent_xp_multiplier defaults to 0", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: null });
    expect(out.permanentMult).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd app && yarn test -- src/service/chatXp/__tests__/trialAndPermanent.test.js
```

Expected: all tests fail (current returns a bare number).

- [ ] **Step 3: Refactor implementation**

Replace `app/src/service/chatXp/trialAndPermanent.js` with:

```js
function applyTrialAndPermanent(effective, status) {
  let trialMult = 1.0;
  if (status.active_trial_star === 2) trialMult = 0.7;
  else if (status.active_trial_star === 5) trialMult = 0.5;

  const permanent = Number(status.permanent_xp_multiplier) || 0;
  const permanentMult = 1 + permanent;

  return {
    result: effective * trialMult * permanentMult,
    trialMult,
    permanentMult,
  };
}

module.exports = { applyTrialAndPermanent };
```

- [ ] **Step 4: Re-run the test**

```bash
cd app && yarn test -- src/service/chatXp/__tests__/trialAndPermanent.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/service/chatXp/trialAndPermanent.js app/src/service/chatXp/__tests__/trialAndPermanent.test.js
git commit -m "refactor(chat-level): expose trial / permanent multipliers separately"
```

---

### Task 4: Refactor `perMsgXp.js` to return `{ raw, blessing1Mult }`

**Files:**
- Modify: `app/src/service/chatXp/perMsgXp.js`
- Create: `app/src/service/chatXp/__tests__/perMsgXp.test.js`

- [ ] **Step 1: Write the failing test**

```js
// app/src/service/chatXp/__tests__/perMsgXp.test.js
const { computePerMsgXp } = require("../perMsgXp");

describe("computePerMsgXp", () => {
  test("no blessing 1: blessing1Mult = 1.0, raw = round(base × cooldown × group)", () => {
    const out = computePerMsgXp({
      base: 5,
      cooldownRate: 1.0,
      groupBonus: 1.1,
      status: { blessings: [] },
    });
    expect(out.blessing1Mult).toBe(1);
    expect(out.raw).toBe(Math.round(5 * 1.0 * 1.1)); // 6
  });

  test("blessing 1 owned: blessing1Mult = 1.08", () => {
    const out = computePerMsgXp({
      base: 5,
      cooldownRate: 1.0,
      groupBonus: 1.0,
      status: { blessings: [1] },
    });
    expect(out.blessing1Mult).toBeCloseTo(1.08);
    expect(out.raw).toBe(Math.round(5 * 1.0 * 1.0 * 1.08)); // 5
  });

  test("non-array blessings tolerated", () => {
    const out = computePerMsgXp({
      base: 5,
      cooldownRate: 1.0,
      groupBonus: 1.0,
      status: { blessings: null },
    });
    expect(out.blessing1Mult).toBe(1);
  });

  test("rounds to integer raw", () => {
    const out = computePerMsgXp({
      base: 5,
      cooldownRate: 1.2,
      groupBonus: 1.1,
      status: { blessings: [1] },
    });
    // 5 × 1.2 × 1.1 × 1.08 = 7.128 → round → 7
    expect(out.raw).toBe(7);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd app && yarn test -- src/service/chatXp/__tests__/perMsgXp.test.js
```

Expected: all tests fail (current returns a bare number).

- [ ] **Step 3: Refactor implementation**

Replace `app/src/service/chatXp/perMsgXp.js` with:

```js
function computePerMsgXp({ base, cooldownRate, groupBonus, status }) {
  const hasBlessing1 = Array.isArray(status.blessings) && status.blessings.includes(1);
  const blessing1Mult = hasBlessing1 ? 1.08 : 1.0;
  const raw = Math.round(base * cooldownRate * groupBonus * blessing1Mult);
  return { raw, blessing1Mult };
}

module.exports = { computePerMsgXp };
```

- [ ] **Step 4: Re-run the test**

```bash
cd app && yarn test -- src/service/chatXp/__tests__/perMsgXp.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/service/chatXp/perMsgXp.js app/src/service/chatXp/__tests__/perMsgXp.test.js
git commit -m "refactor(chat-level): expose blessing1 multiplier from perMsgXp"
```

---

### Task 5: Update `pipeline.js` to consume new shapes + persist 6 fields

**Files:**
- Modify: `app/src/service/chatXp/pipeline.js`
- Modify: `app/src/model/application/ChatExpEvent.js`

- [ ] **Step 1: Add the 6 new columns to the model's `fillable` list**

Edit `app/src/model/application/ChatExpEvent.js`:

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
  "base_xp",
  "blessing1_mult",
  "honeymoon_mult",
  "diminish_factor",
  "trial_mult",
  "permanent_mult",
];

class ChatExpEvent extends Base {}

const model = new ChatExpEvent({ table: TABLE, fillable });

exports.model = model;

exports.insertEvent = params => {
  const payload = { ...params };
  if (payload.modifiers && typeof payload.modifiers !== "string") {
    payload.modifiers = JSON.stringify(payload.modifiers);
  }
  return model.create(payload);
};
```

- [ ] **Step 2: Modify `pipeline.js` to use the new return shapes**

In `app/src/service/chatXp/pipeline.js`, locate the inner loop in `processUserEvents` (around lines 114–145). Replace it so that:

1. `computePerMsgXp` is destructured to `{ raw, blessing1Mult }`.
2. `applyDiminish` is destructured to `{ result: afterDiminish, factor: diminishFactor }`.
3. `applyTrialAndPermanent` is destructured to `{ result: finalEffective, trialMult, permanentMult }`.
4. The `eventRecords.push({...})` payload includes the six new fields.

Final loop body (replace the current `for (const event of events) { … }` block):

```js
  for (const event of events) {
    const cooldownRate = selectCooldownRate(event.timeSinceLastMsg, state);
    const groupBonus = computeGroupBonus(event.groupCount, state);
    const { raw, blessing1Mult } = computePerMsgXp({
      base: ctx.base,
      cooldownRate,
      groupBonus,
      status: state,
    });

    const honeymoonMult = state.prestige_count === 0 ? 1.2 : 1.0;
    const scaledIncoming = raw * honeymoonMult;
    const scaledBefore = (dailyRawBefore + rawDelta) * honeymoonMult;
    const { result: afterDiminish, factor: diminishFactor } = applyDiminish(
      scaledIncoming,
      scaledBefore,
      state
    );
    const { result: finalEffective, trialMult, permanentMult } = applyTrialAndPermanent(
      afterDiminish,
      state
    );
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
      base_xp: ctx.base,
      blessing1_mult: blessing1Mult,
      honeymoon_mult: honeymoonMult,
      diminish_factor: diminishFactor,
      trial_mult: trialMult,
      permanent_mult: permanentMult,
      modifiers: {
        honeymoon: state.prestige_count === 0,
        active_trial_id: state.active_trial_id,
        active_trial_star: state.active_trial_star,
        blessings: state.blessings,
        permanent_xp_multiplier: state.permanent_xp_multiplier,
      },
    });
  }
```

Also remove the now-redundant `const honeymoonMult = state.prestige_count === 0 ? 1.2 : 1.0;` declaration that lived above the loop (lines 107).

- [ ] **Step 3: Run the full backend test suite**

```bash
cd app && yarn test
```

Expected: all existing tests pass; no regression. (We have no pipeline.test.js yet — that's Task 6.)

- [ ] **Step 4: Lint**

```bash
cd app && yarn lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/service/chatXp/pipeline.js app/src/model/application/ChatExpEvent.js
git commit -m "refactor(chat-level): persist 6 multiplier columns per chat XP event"
```

---

### Task 6: Add pipeline integration test asserting the persisted shape

**Files:**
- Create: `app/src/service/chatXp/__tests__/pipeline.test.js`

- [ ] **Step 1: Write the test**

```js
// app/src/service/chatXp/__tests__/pipeline.test.js
//
// We mock all the I/O collaborators and assert that processBatch wires the new
// numeric fields through into ChatExpEvent.insertEvent.

jest.mock("../../../util/redis", () => ({ get: jest.fn().mockResolvedValue(null) }));
jest.mock("../../../util/chatUserState", () => ({
  load: jest.fn().mockResolvedValue({
    prestige_count: 0,             // honeymoon active
    blessings: [1],                // blessing 1 owned
    active_trial_id: null,
    active_trial_star: null,
    permanent_xp_multiplier: 0,
  }),
}));
jest.mock("../../../model/application/ChatUserData", () => ({
  findByUserId: jest.fn().mockResolvedValue({
    current_exp: 0,
    current_level: 0,
    active_trial_exp_progress: 0,
    active_trial_id: null,
    prestige_count: 0,
  }),
  upsert: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../model/application/ChatExpDaily", () => ({
  findByUserDate: jest.fn().mockResolvedValue(null),
  upsertByUserDate: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../model/application/ChatExpUnit", () => ({
  all: jest.fn().mockResolvedValue([]),
  getLevelFromExp: jest.fn().mockReturnValue(0),
  getTotalExpForLevel: jest.fn().mockReturnValue(0),
}));
jest.mock("../../../model/application/ChatExpEvent", () => ({
  insertEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../util/broadcastQueue", () => ({ pushEvent: jest.fn() }));
jest.mock("../../PrestigeService", () => ({ checkTrialCompletion: jest.fn() }));
jest.mock("../../../model/application/PrestigeTrial", () => ({ findById: jest.fn() }));
jest.mock("../../../model/application/UserPrestigeTrial", () => ({ listPassedByUserId: jest.fn() }));
jest.mock("../../../model/application/UserPrestigeHistory", () => ({ listByUserId: jest.fn() }));
jest.mock("config", () => ({
  get: jest.fn().mockReturnValue(5), // base XP
}));

const ChatExpEvent = require("../../../model/application/ChatExpEvent");
const { processBatch } = require("../pipeline");

describe("pipeline.processBatch", () => {
  beforeEach(() => jest.clearAllMocks());

  test("persists six new numeric columns per event", async () => {
    await processBatch([
      {
        userId: "U_test",
        groupId: "G1",
        ts: Date.now(),
        timeSinceLastMsg: 9999, // full cooldown rate (1.0 typically)
        groupCount: 0,
      },
    ]);

    expect(ChatExpEvent.insertEvent).toHaveBeenCalledTimes(1);
    const payload = ChatExpEvent.insertEvent.mock.calls[0][0];
    expect(payload).toHaveProperty("base_xp", 5);
    expect(payload).toHaveProperty("blessing1_mult", 1.08);
    expect(payload).toHaveProperty("honeymoon_mult", 1.2);
    expect(payload).toHaveProperty("diminish_factor");
    expect(payload).toHaveProperty("trial_mult", 1);
    expect(payload).toHaveProperty("permanent_mult", 1);
  });

  test("identity: raw ≈ round(base × cooldown × group × blessing1)", async () => {
    await processBatch([
      { userId: "U_test", groupId: "G1", ts: Date.now(), timeSinceLastMsg: 9999, groupCount: 0 },
    ]);
    const p = ChatExpEvent.insertEvent.mock.calls[0][0];
    const expected = Math.round(p.base_xp * p.cooldown_rate * p.group_bonus * p.blessing1_mult);
    expect(p.raw_exp).toBe(expected);
  });
});
```

> Note: `jest.mock(...)` calls live before any `require` of the mocked path — the project's `app/jest.config` sets `transform: {}`, so jest.mock is **not** hoisted (per project memory).

- [ ] **Step 2: Run the test**

```bash
cd app && yarn test -- src/service/chatXp/__tests__/pipeline.test.js
```

Expected: pass. If it fails because `selectCooldownRate` returns something unexpected (e.g. `0.5`), inspect the mock state and adjust `timeSinceLastMsg` or `chatUserState.load` mock to make `cooldownRate` deterministic. The exact `cooldown_rate` value isn't asserted — only the persisted shape and the identity.

- [ ] **Step 3: Lint + full suite**

```bash
cd app && yarn lint && yarn test
```

Expected: clean / all pass.

- [ ] **Step 4: Commit**

```bash
git add app/src/service/chatXp/__tests__/pipeline.test.js
git commit -m "test(chat-level): assert pipeline persists XP breakdown columns"
```

---

## M3 — APIs

### Task 7: Add `ChatExpEvent` range/recent helpers

**Files:**
- Modify: `app/src/model/application/ChatExpEvent.js`

- [ ] **Step 1: Add helpers**

Append to `app/src/model/application/ChatExpEvent.js`:

```js
exports.findInRange = ({ userId, from, to, limit = 1000, beforeId = null, beforeTs = null }) => {
  let q = model.knex
    .where({ user_id: userId })
    .andWhere("ts", ">=", `${from} 00:00:00`)
    .andWhere("ts", "<", `${to} 23:59:59.999`)
    .orderBy("ts", "desc")
    .orderBy("id", "desc")
    .limit(limit);

  if (beforeTs && beforeId) {
    q = q.andWhere(builder => {
      builder
        .where("ts", "<", beforeTs)
        .orWhere(b2 => b2.where("ts", "=", beforeTs).andWhere("id", "<", beforeId));
    });
  }
  return q;
};

exports.findLatestByUser = userId =>
  model.knex
    .where({ user_id: userId })
    .orderBy("ts", "desc")
    .orderBy("id", "desc")
    .limit(1)
    .first();
```

- [ ] **Step 2: Lint**

```bash
cd app && yarn lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/src/model/application/ChatExpEvent.js
git commit -m "feat(chat-level): add range and latest queries on ChatExpEvent"
```

---

### Task 8: `XpHistoryService` — payload composition (TDD)

**Files:**
- Create: `app/src/service/XpHistoryService.js`
- Create: `app/src/service/__tests__/XpHistoryService.test.js`

- [ ] **Step 1: Write the failing test**

```js
// app/src/service/__tests__/XpHistoryService.test.js

jest.mock("../../model/application/ChatExpEvent", () => ({
  findInRange: jest.fn(),
  findLatestByUser: jest.fn(),
}));
jest.mock("../../model/application/ChatExpDaily", () => ({
  findByUserDate: jest.fn(),
  model: { all: jest.fn() },
}));
jest.mock("../../model/application/UserBlessing", () => ({
  listBlessingIdsByUserId: jest.fn(),
}));

const ChatExpEvent = require("../../model/application/ChatExpEvent");
const ChatExpDaily = require("../../model/application/ChatExpDaily");
const UserBlessing = require("../../model/application/UserBlessing");
const XpHistoryService = require("../XpHistoryService");

describe("XpHistoryService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("buildSummary", () => {
    test("returns today.tier=1 when daily_raw < tier1_upper", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 200,
        effective_exp: 200,
        msg_count: 40,
        honeymoon_active: 1,
        trial_id: null,
      });
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.tier).toBe(1);
      expect(summary.today.daily_raw).toBe(200);
      expect(summary.today.tier1_upper).toBe(400);
      expect(summary.today.tier2_upper).toBe(1000);
      expect(summary.today.honeymoon_active).toBe(true);
      expect(summary.today.active_trial_star).toBeNull();
    });

    test("blessing 4 expands tier1_upper to 600", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 500, effective_exp: 500, msg_count: 100, honeymoon_active: 0, trial_id: null,
      });
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([4]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.tier1_upper).toBe(600);
      expect(summary.today.tier).toBe(1);
    });

    test("daily_raw between tier1 and tier2 → tier 2", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 800, effective_exp: 520, msg_count: 160, honeymoon_active: 0, trial_id: null,
      });
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.tier).toBe(2);
    });

    test("daily_raw past tier2_upper → tier 3", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue({
        raw_exp: 1500, effective_exp: 720, msg_count: 280, honeymoon_active: 0, trial_id: 5,
      });
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.tier).toBe(3);
      expect(summary.today.active_trial_star).toBe(5);
    });

    test("no events today → daily_raw=0 / tier=1 / last_event=null", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue(null);
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue(null);

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.today.daily_raw).toBe(0);
      expect(summary.today.tier).toBe(1);
      expect(summary.last_event).toBeNull();
    });

    test("returns last_event with the multiplier columns", async () => {
      ChatExpDaily.findByUserDate.mockResolvedValue(null);
      UserBlessing.listBlessingIdsByUserId.mockResolvedValue([]);
      ChatExpEvent.findLatestByUser.mockResolvedValue({
        ts: "2026-05-01T20:14:32",
        group_id: "G1",
        raw_exp: 5,
        effective_exp: 0,
        base_xp: "5.000",
        cooldown_rate: "1.000",
        group_bonus: "1.000",
        blessing1_mult: "1.000",
        honeymoon_mult: "1.000",
        diminish_factor: "0.030",
        trial_mult: "0.500",
        permanent_mult: "1.050",
        modifiers: '{"active_trial_star":5,"blessings":[]}',
      });

      const summary = await XpHistoryService.buildSummary("U_test");
      expect(summary.last_event).not.toBeNull();
      expect(summary.last_event.base_xp).toBe(5);
      expect(summary.last_event.diminish_factor).toBe(0.03);
      expect(summary.last_event.modifiers.active_trial_star).toBe(5);
    });
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
cd app && yarn test -- src/service/__tests__/XpHistoryService.test.js
```

Expected: `Cannot find module '../XpHistoryService'`.

- [ ] **Step 3: Implement the service**

Create `app/src/service/XpHistoryService.js`:

```js
const moment = require("moment");
const ChatExpEvent = require("../model/application/ChatExpEvent");
const ChatExpDaily = require("../model/application/ChatExpDaily");
const UserBlessing = require("../model/application/UserBlessing");

const TIER1_BASE = 400;
const TIER1_BLESSING4 = 600;
const TIER2_BASE = 1000;
const TIER2_BLESSING5 = 1200;

function todayDateUtc8() {
  return moment().utcOffset(480).format("YYYY-MM-DD");
}

function deriveTier(dailyRaw, tier1Upper, tier2Upper) {
  if (dailyRaw < tier1Upper) return 1;
  if (dailyRaw < tier2Upper) return 2;
  return 3;
}

function decimalOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseModifiers(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function shapeEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    ts: row.ts,
    group_id: row.group_id,
    raw_exp: Number(row.raw_exp),
    effective_exp: Number(row.effective_exp),
    cooldown_rate: decimalOrNull(row.cooldown_rate),
    group_bonus: decimalOrNull(row.group_bonus),
    base_xp: decimalOrNull(row.base_xp),
    blessing1_mult: decimalOrNull(row.blessing1_mult),
    honeymoon_mult: decimalOrNull(row.honeymoon_mult),
    diminish_factor: decimalOrNull(row.diminish_factor),
    trial_mult: decimalOrNull(row.trial_mult),
    permanent_mult: decimalOrNull(row.permanent_mult),
    modifiers: parseModifiers(row.modifiers),
  };
}

async function buildSummary(userId) {
  const date = todayDateUtc8();
  const [daily, blessingIds, lastEvent] = await Promise.all([
    ChatExpDaily.findByUserDate(userId, date),
    UserBlessing.listBlessingIdsByUserId(userId),
    ChatExpEvent.findLatestByUser(userId),
  ]);

  const ids = Array.isArray(blessingIds) ? blessingIds : [];
  const tier1Upper = ids.includes(4) ? TIER1_BLESSING4 : TIER1_BASE;
  const tier2Upper = ids.includes(5) ? TIER2_BLESSING5 : TIER2_BASE;

  const dailyRaw = daily?.raw_exp ?? 0;
  const today = {
    date,
    raw_exp: dailyRaw,
    effective_exp: daily?.effective_exp ?? 0,
    msg_count: daily?.msg_count ?? 0,
    daily_raw: dailyRaw,
    tier: deriveTier(dailyRaw, tier1Upper, tier2Upper),
    tier1_upper: tier1Upper,
    tier2_upper: tier2Upper,
    honeymoon_active: Boolean(daily?.honeymoon_active),
    active_trial_star: null, // populated below if last_event has it
  };

  const last = shapeEvent(lastEvent);
  if (last?.modifiers?.active_trial_star) {
    today.active_trial_star = last.modifiers.active_trial_star;
  }

  return { today, last_event: last };
}

async function buildEvents(userId, { from, to, limit = 1000, beforeId, beforeTs }) {
  const rows = await ChatExpEvent.findInRange({
    userId,
    from,
    to,
    limit,
    beforeId,
    beforeTs,
  });
  return { events: rows.map(shapeEvent) };
}

async function buildDaily(userId, { from, to }) {
  const rows = await ChatExpDaily.model.all({
    filter: {
      user_id: userId,
      date: { operator: ">=", value: from },
    },
    order: [{ column: "date", direction: "asc" }],
  });
  // Filter `to` in JS — base model's filter dialect doesn't compose two operators on the same key.
  const filtered = rows.filter(r => r.date <= to);
  return {
    days: filtered.map(r => ({
      date: r.date,
      raw_exp: r.raw_exp,
      effective_exp: r.effective_exp,
      msg_count: r.msg_count,
      honeymoon_active: Boolean(r.honeymoon_active),
      trial_id: r.trial_id ?? null,
    })),
  };
}

module.exports = { buildSummary, buildEvents, buildDaily };
```

- [ ] **Step 4: Re-run the test**

```bash
cd app && yarn test -- src/service/__tests__/XpHistoryService.test.js
```

Expected: pass.

- [ ] **Step 5: Lint + full suite**

```bash
cd app && yarn lint && yarn test
```

Expected: clean / all pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/service/XpHistoryService.js app/src/service/__tests__/XpHistoryService.test.js
git commit -m "feat(chat-level): XpHistoryService composes summary / events / daily payloads"
```

---

### Task 9: Wire 3 read-only `/api/me/xp-*` routes

**Files:**
- Modify: `app/src/router/api.js`

- [ ] **Step 1: Find a stable insertion point**

Open `app/src/router/api.js`. After the existing `router.get("/me", ...)` block (around line 48), we'll add three routes. They use `verifyToken` and read `req.profile.userId`, so the user can never query someone else's data — privacy is structural.

- [ ] **Step 2: Add the routes**

Insert (right after the `/me` route):

```js
const XpHistoryService = require("../service/XpHistoryService");

router.get("/me/xp-summary", verifyToken, async (req, res) => {
  try {
    const { userId } = req.profile;
    const summary = await XpHistoryService.buildSummary(userId);
    res.json(summary);
  } catch (e) {
    console.error("[xp-summary]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/me/xp-events", verifyToken, async (req, res) => {
  try {
    const { userId } = req.profile;
    const moment = require("moment");
    const today = moment().utcOffset(480).format("YYYY-MM-DD");
    const from = (req.query.from || today).slice(0, 10);
    const to = (req.query.to || today).slice(0, 10);

    // 7-day window cap
    const fromM = moment(from);
    const toM = moment(to);
    if (!fromM.isValid() || !toM.isValid() || toM.diff(fromM, "days") > 7) {
      return res.status(400).json({ error: "range must be ≤ 7 days" });
    }

    const result = await XpHistoryService.buildEvents(userId, {
      from,
      to,
      limit: Math.min(Number(req.query.limit) || 1000, 1000),
      beforeId: req.query.beforeId ? Number(req.query.beforeId) : null,
      beforeTs: req.query.beforeTs || null,
    });
    res.json(result);
  } catch (e) {
    console.error("[xp-events]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/me/xp-daily", verifyToken, async (req, res) => {
  try {
    const { userId } = req.profile;
    const moment = require("moment");
    const today = moment().utcOffset(480).format("YYYY-MM-DD");
    const from = (req.query.from || moment(today).subtract(29, "days").format("YYYY-MM-DD")).slice(0, 10);
    const to = (req.query.to || today).slice(0, 10);

    const fromM = moment(from);
    const toM = moment(to);
    if (!fromM.isValid() || !toM.isValid() || toM.diff(fromM, "days") > 365) {
      return res.status(400).json({ error: "range must be ≤ 365 days" });
    }

    const result = await XpHistoryService.buildDaily(userId, { from, to });
    res.json(result);
  } catch (e) {
    console.error("[xp-daily]", e);
    res.status(500).json({ error: "internal_error" });
  }
});
```

- [ ] **Step 3: Smoke test the routes**

```bash
cd app && yarn dev
```

In another terminal (with a valid LIFF token in `$TOKEN`):

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:9527/api/me/xp-summary | jq .
curl -H "Authorization: Bearer $TOKEN" "http://localhost:9527/api/me/xp-events?from=2026-04-25&to=2026-05-01" | jq '.events | length'
curl -H "Authorization: Bearer $TOKEN" "http://localhost:9527/api/me/xp-daily?from=2026-04-01&to=2026-05-01" | jq '.days | length'
```

Expected: 200 OK with JSON shapes matching spec §8.

If you don't have a token handy, skip this step and rely on Frontend integration in M5.

- [ ] **Step 4: Lint**

```bash
cd app && yarn lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/router/api.js
git commit -m "feat(chat-level): expose /api/me/xp-{summary,events,daily} endpoints"
```

---

## M4 — Bot side: Flex bubble, command, /me CTA

### Task 10: Build the `XpHistory` Flex bubble template

**Files:**
- Create: `app/src/templates/application/XpHistory/Bubble.js`
- Create: `app/src/templates/application/XpHistory/__tests__/Bubble.test.js`

> Reference for visual structure: `xp-history/flex/xp_history_*.json` (designer prototype, gitignored). Read these JSONs to copy the gradient colors, padding values, and chip style. Do not import them — re-author the structure in `Bubble.js`.

- [ ] **Step 1: Write the failing test**

```js
// app/src/templates/application/XpHistory/__tests__/Bubble.test.js
const Bubble = require("../Bubble");

const baseSummary = {
  today: {
    date: "2026-05-01",
    raw_exp: 327,
    effective_exp: 327,
    msg_count: 63,
    daily_raw: 327,
    tier: 1,
    tier1_upper: 600,
    tier2_upper: 1000,
    honeymoon_active: true,
    active_trial_star: null,
  },
  last_event: {
    ts: "2026-05-01T14:27:48",
    group_id: "Cabc123",
    raw_exp: 5,
    effective_exp: 6,
    base_xp: 5.0,
    cooldown_rate: 1.0,
    group_bonus: 1.1,
    blessing1_mult: 1.0,
    honeymoon_mult: 1.2,
    diminish_factor: 1.0,
    trial_mult: 1.0,
    permanent_mult: 1.0,
    modifiers: { honeymoon: true, active_trial_star: null, blessings: [] },
  },
};

describe("XpHistory Bubble", () => {
  test("returns altText + flex contents (carousel-friendly)", () => {
    const out = Bubble.build({
      summary: baseSummary,
      groupName: "夜貓子閒聊",
      liffUri: "https://liff.line.me/2000-xp-history/xp-history",
      prestigeLiffUri: "https://liff.line.me/2000-prestige/prestige",
    });
    expect(out).toHaveProperty("altText");
    expect(out).toHaveProperty("contents");
    expect(out.contents.type).toBe("bubble");
  });

  test("tier 2 → status line mentions tier 2", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.today.tier = 2;
    summary.today.daily_raw = 840;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    const text = JSON.stringify(out.contents);
    expect(text).toMatch(/tier 2/);
  });

  test("tier 3 → status line mentions tier 3", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.today.tier = 3;
    summary.today.daily_raw = 1540;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    expect(JSON.stringify(out.contents)).toMatch(/tier 3/);
  });

  test("active trial → header pill shows ⚔ ★N 試煉中", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.today.active_trial_star = 5;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    expect(JSON.stringify(out.contents)).toMatch(/★5 試煉中/);
  });

  test("last_event with no breakdown columns shows '舊版資料' chip", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.last_event.base_xp = null;
    summary.last_event.blessing1_mult = null;
    summary.last_event.honeymoon_mult = null;
    summary.last_event.diminish_factor = null;
    summary.last_event.trial_mult = null;
    summary.last_event.permanent_mult = null;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    expect(JSON.stringify(out.contents)).toMatch(/舊版資料/);
  });

  test("no last event → renders empty-state placeholder", () => {
    const summary = JSON.parse(JSON.stringify(baseSummary));
    summary.last_event = null;
    const out = Bubble.build({ summary, groupName: null, liffUri: "u", prestigeLiffUri: "p" });
    expect(JSON.stringify(out.contents)).toMatch(/今日尚無|還沒|尚未/);
  });

  test("CTA button URI is the LIFF URI", () => {
    const out = Bubble.build({
      summary: baseSummary,
      groupName: null,
      liffUri: "https://liff.line.me/X/xp-history",
      prestigeLiffUri: "https://liff.line.me/Y/prestige",
    });
    expect(JSON.stringify(out.contents)).toContain("https://liff.line.me/X/xp-history");
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd app && yarn test -- src/templates/application/XpHistory/__tests__/Bubble.test.js
```

Expected: `Cannot find module '../Bubble'`.

- [ ] **Step 3: Implement the template**

Create `app/src/templates/application/XpHistory/Bubble.js`. Re-author the structure from the prototype JSONs (`xp-history/flex/xp_history_*.json`); the implementation should produce the same shape but be generated from the `summary` argument:

```js
const moment = require("moment");

const COLORS = {
  cyanStart: "#00838F",
  cyanEnd: "#00ACC1",
  amber: "#FBBF24",
  amberDeep: "#F59E0B",
  amberText: "#FCD34D",
  amberTint: "#FFF7E6",
  amberTintDeep: "#B45309",
  white: "#FFFFFF",
  whiteOverlay: "#FFFFFF44",
  greenTint: "#E8F9EF",
  greenDeep: "#15803D",
  cyanTint: "#E0F7FA",
  redTint: "#FDECEC",
  redDeep: "#B91C1C",
  greyTint: "#EEF0F3",
  greyText: "#6B6577",
  deep: "#3A2800",
  muted: "#5A6B7F",
  warmBg: "#F8FAFB",
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function tierStatusLine(today) {
  const { tier, tier1_upper, tier2_upper, daily_raw } = today;
  if (tier === 1) {
    return { text: `滿速 0–${tier1_upper} · 尚未進入遞減`, color: COLORS.amberText };
  }
  if (tier === 2) {
    return { text: `⚠ 已進入 tier 2 · XP ×0.30 · ${daily_raw} raw`, color: COLORS.amberText };
  }
  return { text: `⚠ tier 3 · 幾乎不漲 · ${daily_raw} raw`, color: "#FCA5A5" };
}

function progressBar(today) {
  const { daily_raw, tier1_upper, tier2_upper } = today;
  const scale = Math.max(daily_raw, Math.round(tier2_upper * 1.4));
  const t1 = Math.round((Math.min(daily_raw, tier1_upper) / scale) * 100);
  const t2 = Math.round((Math.min(Math.max(0, daily_raw - tier1_upper), tier2_upper - tier1_upper) / scale) * 100);
  const t3 = Math.round((Math.max(0, daily_raw - tier2_upper) / scale) * 100);
  const rest = Math.max(0, 100 - t1 - t2 - t3);

  const segs = [];
  if (t1 > 0) segs.push({ flex: t1, color: COLORS.amber });
  if (t2 > 0) segs.push({ flex: t2, color: COLORS.amberDeep });
  if (t3 > 0) segs.push({ flex: t3, color: "#9CA3AF" });
  if (rest > 0) segs.push({ flex: rest, color: COLORS.whiteOverlay });

  return {
    type: "box",
    layout: "horizontal",
    spacing: "xs",
    height: "8px",
    contents: segs.map(s => ({
      type: "box",
      layout: "vertical",
      flex: s.flex,
      backgroundColor: s.color,
      cornerRadius: "md",
      contents: [],
    })),
  };
}

function chipBox(text, { bg, fg, border }) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: bg,
    borderColor: border,
    borderWidth: border ? "1px" : undefined,
    cornerRadius: "xl",
    paddingStart: "sm",
    paddingEnd: "sm",
    paddingTop: "2px",
    paddingBottom: "2px",
    flex: 0,
    contents: [{ type: "text", text, size: "xxs", color: fg, weight: "bold" }],
  };
}

function buildLastEventChips(ev) {
  if (!ev) return null;
  if (ev.base_xp == null) {
    return [chipBox("舊版資料 · 無乘數明細", { bg: COLORS.greyTint, fg: COLORS.greyText })];
  }
  const out = [];
  if (ev.honeymoon_mult > 1) out.push(chipBox(`🌱 蜜月 ×${ev.honeymoon_mult.toFixed(2)}`, { bg: COLORS.greenTint, fg: COLORS.greenDeep }));
  if (ev.modifiers?.active_trial_star) {
    out.push(chipBox(`★${ev.modifiers.active_trial_star} ×${ev.trial_mult.toFixed(2)}`, { bg: COLORS.amberTint, fg: COLORS.amberTintDeep }));
  }
  if (ev.blessing1_mult > 1) out.push(chipBox(`🗣 暖流 ×${ev.blessing1_mult.toFixed(2)}`, { bg: COLORS.cyanTint, fg: COLORS.cyanStart }));
  if (ev.group_bonus > 1) out.push(chipBox(`群組 ×${ev.group_bonus.toFixed(2)}`, { bg: COLORS.cyanTint, fg: COLORS.cyanStart }));
  if (ev.diminish_factor < 1) {
    const tier3 = ev.diminish_factor <= 0.05;
    out.push(chipBox(`已遞減 ×${ev.diminish_factor.toFixed(2)}`, tier3
      ? { bg: COLORS.redTint, fg: COLORS.redDeep, border: "#DC2626" }
      : { bg: COLORS.amberTint, fg: COLORS.amberTintDeep }));
  }
  if (ev.permanent_mult > 1) out.push(chipBox(`永久 ×${ev.permanent_mult.toFixed(2)}`, { bg: "#F3E8FF", fg: "#6B21A8" }));
  if (out.length === 0) out.push(chipBox("正常獲取", { bg: COLORS.greyTint, fg: COLORS.greyText }));
  return out;
}

function buildLastEventCard(ev, groupName) {
  if (!ev) {
    return {
      type: "text",
      text: "今日尚無聊天紀錄",
      size: "sm",
      color: COLORS.muted,
      align: "center",
      margin: "md",
    };
  }
  const accent =
    ev.diminish_factor === 0.03 ? "#DC2626" :
    ev.diminish_factor === 0.3 ? COLORS.amberDeep :
    ev.base_xp == null ? "#9CA3AF" : COLORS.cyanEnd;

  const time = moment(ev.ts).format("HH:mm");
  const groupLabel = groupName || `…${(ev.group_id || "").slice(-4).toLowerCase()}`;
  const effColor = ev.effective_exp === 0
    ? "#DC2626"
    : ev.effective_exp < ev.raw_exp / 2 ? COLORS.amberDeep : COLORS.deep;

  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    backgroundColor: COLORS.warmBg,
    cornerRadius: "md",
    contents: [
      { type: "box", layout: "vertical", width: "3px", backgroundColor: accent, contents: [] },
      {
        type: "box",
        layout: "vertical",
        paddingAll: "md",
        flex: 1,
        contents: [
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            contents: [
              {
                type: "text",
                contents: [
                  { type: "span", text: time, weight: "bold", color: COLORS.deep, size: "sm" },
                  { type: "span", text: `  ·  ${groupLabel}`, color: COLORS.muted, size: "xxs" },
                ],
                flex: 1,
              },
              {
                type: "text",
                contents: [
                  { type: "span", text: String(ev.raw_exp), weight: "bold", color: COLORS.muted, size: "xs" },
                  { type: "span", text: " → ", color: COLORS.muted, size: "xxs" },
                  { type: "span", text: String(ev.effective_exp), weight: "bold", color: effColor, size: "md" },
                ],
                align: "end",
                flex: 0,
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "xs",
            margin: "sm",
            wrap: true,
            contents: buildLastEventChips(ev),
          },
        ],
      },
    ],
  };
}

function buildHeader(today) {
  const { date, raw_exp, effective_exp, msg_count, active_trial_star } = today;
  const m = moment(date);
  const datePill = active_trial_star
    ? `⚔ ★${active_trial_star} 試煉中`
    : `${m.format("MM/DD")} ${WEEKDAYS[m.day()]}`;

  const status = tierStatusLine(today);

  return {
    type: "box",
    layout: "vertical",
    paddingAll: "lg",
    background: { type: "linearGradient", angle: "135deg", startColor: COLORS.cyanStart, endColor: COLORS.cyanEnd },
    backgroundColor: COLORS.cyanStart,
    contents: [
      {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        contents: [
          { type: "text", text: "📊 今日經驗", weight: "bold", size: "md", color: COLORS.white, flex: 1 },
          { type: "text", text: datePill, size: "xxs", color: COLORS.amberText, weight: "bold", align: "end", flex: 0 },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        margin: "md",
        alignItems: "flex-end",
        contents: [
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              { type: "text", text: "累計實得", size: "xxs", color: COLORS.white },
              {
                type: "text",
                contents: [
                  { type: "span", text: String(effective_exp), weight: "bold", color: COLORS.amberText, size: "xxl" },
                  { type: "span", text: ` / ${raw_exp} raw`, color: COLORS.white, size: "xs" },
                ],
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            flex: 0,
            contents: [
              { type: "text", text: "訊息", size: "xxs", color: COLORS.white, align: "end" },
              { type: "text", text: String(msg_count), weight: "bold", color: COLORS.white, size: "lg", align: "end" },
            ],
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        margin: "md",
        contents: [
          progressBar(today),
          { type: "text", text: status.text, size: "xxs", color: status.color, weight: "bold", margin: "xs" },
        ],
      },
    ],
  };
}

function build({ summary, groupName, liffUri, prestigeLiffUri }) {
  const lastEventBlock = {
    type: "box",
    layout: "vertical",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    contents: [
      { type: "text", text: "最近一則", size: "xxs", color: COLORS.muted, weight: "bold" },
      buildLastEventCard(summary.last_event, groupName),
    ],
  };

  const ctaBlock = {
    type: "box",
    layout: "vertical",
    paddingAll: "lg",
    paddingTop: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.amber,
        cornerRadius: "md",
        paddingTop: "md",
        paddingBottom: "md",
        action: { type: "uri", label: "查看完整歷程", uri: liffUri },
        contents: [{ type: "text", text: "📊 查看完整歷程", size: "sm", color: COLORS.deep, weight: "bold", align: "center" }],
      },
      {
        type: "text",
        text: "→ 轉生狀態",
        size: "xxs",
        color: COLORS.cyanStart,
        weight: "bold",
        align: "center",
        margin: "sm",
        action: { type: "uri", label: "轉生狀態", uri: prestigeLiffUri },
      },
    ],
  };

  return {
    altText: "📊 今日經驗歷程",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "none",
        paddingAll: "none",
        contents: [buildHeader(summary.today), lastEventBlock, ctaBlock],
      },
    },
  };
}

module.exports = { build };
```

- [ ] **Step 4: Run the test**

```bash
cd app && yarn test -- src/templates/application/XpHistory/__tests__/Bubble.test.js
```

Expected: pass.

- [ ] **Step 5: Lint**

```bash
cd app && yarn lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/src/templates/application/XpHistory/
git commit -m "feat(chat-level): add #經驗歷程 Flex bubble template"
```

---

### Task 11: Add `showXpHistory` controller + register `#經驗歷程`

**Files:**
- Modify: `app/src/controller/application/ChatLevelController.js`
- Modify: `app/src/app.js`

- [ ] **Step 1: Add the controller export**

In `app/src/controller/application/ChatLevelController.js`, add after `showPrestigeStatus`:

```js
const XpHistoryService = require("../../service/XpHistoryService");
const XpHistoryBubble = require("../../templates/application/XpHistory/Bubble");

/**
 * `#經驗歷程` — Flex bubble of today's XP summary + last event breakdown.
 * @param {import("bottender").LineContext} context
 */
exports.showXpHistory = async context => {
  try {
    const userId = context.event.source.userId;
    if (!userId) return;

    const summary = await XpHistoryService.buildSummary(userId);
    let groupName = null;
    if (summary.last_event?.group_id && context.event.source.type !== "user") {
      try {
        const g = await LineClient.getGroupSummary(summary.last_event.group_id);
        groupName = g?.groupName || null;
      } catch {
        groupName = null;
      }
    }

    const liffUri = commonTemplate.getLiffUri("full", "/xp-history");
    const prestigeLiffUri = commonTemplate.getLiffUri("full", "/prestige");
    const flex = XpHistoryBubble.build({ summary, groupName, liffUri, prestigeLiffUri });
    context.replyFlex(flex.altText, flex.contents);
  } catch (e) {
    console.error(e);
    DefaultLogger.error(e);
  }
};
```

(`commonTemplate`, `LineClient`, `DefaultLogger` are already required at top of file.)

- [ ] **Step 2: Register the matcher in `app.js`**

In `app/src/app.js`, find the line `text(/^[#!！]轉生狀態$/, ChatLevelController.showPrestigeStatus),` and add a peer line right after it:

```js
      text(/^[#!！]經驗歷程$/, ChatLevelController.showXpHistory),
```

- [ ] **Step 3: Manual smoke test**

Start dev server: `cd app && yarn dev` (and `make tunnel` if not already done).
Send `#經驗歷程` from a personal LINE chat with the bot.

Expected: bubble renders with today summary + last event card + CTA. CTA button opens LIFF (will 404 until M5; that's fine for now).

- [ ] **Step 4: Lint**

```bash
cd app && yarn lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/controller/application/ChatLevelController.js app/src/app.js
git commit -m "feat(chat-level): #經驗歷程 text command renders XP history bubble"
```

---

### Task 12: Add CTA button to `/me` profile bubble

**Files:**
- Modify: `app/src/templates/application/Me/Profile.js`
- Modify: `app/src/templates/application/Me/__tests__/Profile.test.js`

- [ ] **Step 1: Inspect existing template**

```bash
grep -n "buildHero\|buildSubPanel\|exports\|module.exports" app/src/templates/application/Me/Profile.js | head -20
```

Identify where buttons are rendered today. The CTA should sit in the same row as existing CTA(s) on the profile bubble. Look for `action: { type: "uri", … }` references.

- [ ] **Step 2: Add a new CTA button slot**

The existing template has a hero + sub-panel structure. Find the bottom-of-bubble button row (or the `buildSubPanel` body that renders existing CTAs). Insert a button:

```js
{
  type: "button",
  style: "secondary",
  height: "sm",
  action: {
    type: "message",
    label: "查看經驗歷程",
    text: "#經驗歷程",
  },
}
```

Place it adjacent to other "secondary" actions if any, otherwise as a new button at the end of the visible button column. (We use a `message` action — sending the text triggers the same controller via the OrderBased matcher; this avoids needing a LIFF deep link from `/me`.)

- [ ] **Step 3: Update the existing test**

Open `app/src/templates/application/Me/__tests__/Profile.test.js`. Add a test:

```js
test("includes 經驗歷程 CTA button", () => {
  const out = buildBubbles({ /* … the existing minimal valid args used by other tests … */ });
  expect(JSON.stringify(out)).toMatch(/查看經驗歷程/);
});
```

Use the same "minimal valid args" pattern that the existing tests in this file already use.

- [ ] **Step 4: Run the test**

```bash
cd app && yarn test -- src/templates/application/Me/__tests__/Profile.test.js
```

Expected: pass.

- [ ] **Step 5: Lint**

```bash
cd app && yarn lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/src/templates/application/Me/Profile.js app/src/templates/application/Me/__tests__/Profile.test.js
git commit -m "feat(chat-level): add 查看經驗歷程 CTA to /me profile bubble"
```

---

## M5 — LIFF page

### Task 13: Group label helper + fold function

**Files:**
- Create: `frontend/src/pages/XpHistory/groupLabel.js`
- Create: `frontend/src/pages/XpHistory/foldEvents.js`

- [ ] **Step 1: Implement helpers**

Create `frontend/src/pages/XpHistory/groupLabel.js`:

```js
// Group display name resolution. v1: simple last-4 fallback when no name cache.
export function groupLabel(groupId) {
  if (!groupId) return "群組";
  return `…${groupId.slice(-4).toLowerCase()}`;
}
```

Create `frontend/src/pages/XpHistory/foldEvents.js`:

```js
// Mirrors spec §14 modifierHash.
export function modifierHash(ev) {
  const m = ev.modifiers || {};
  const tier =
    ev.diminish_factor == null ? "none"
    : ev.diminish_factor === 1 ? 1
    : ev.diminish_factor === 0.3 ? 2 : 3;
  const blessings = Array.isArray(m.blessings) ? [...m.blessings].sort((a, b) => a - b) : [];
  return JSON.stringify({
    honeymoon: !!m.honeymoon,
    trial: m.active_trial_star ?? 0,
    blessings,
    perm: Number(m.permanent_xp_multiplier ?? 0).toFixed(2),
    tier,
  });
}

export function foldEvents(events) {
  const groups = new Map();
  for (const ev of events) {
    const minute = ev.ts.slice(0, 16);
    const key = `${minute}|${ev.group_id}|${modifierHash(ev)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }
  const folded = [];
  for (const [key, evs] of groups) {
    evs.sort((a, b) => b.ts.localeCompare(a.ts));
    folded.push({
      key,
      events: evs,
      ts: evs[0].ts,
      minute: evs[0].ts.slice(0, 16),
      group_id: evs[0].group_id,
      count: evs.length,
      raw_total: evs.reduce((s, e) => s + (Number(e.raw_exp) || 0), 0),
      eff_total: evs.reduce((s, e) => s + (Number(e.effective_exp) || 0), 0),
      degraded: evs[0].base_xp == null,
    });
  }
  folded.sort((a, b) => b.ts.localeCompare(a.ts));
  return folded;
}
```

- [ ] **Step 2: Lint**

```bash
cd frontend && yarn lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/XpHistory/groupLabel.js frontend/src/pages/XpHistory/foldEvents.js
git commit -m "feat(chat-level): xp-history fold helper + group label fallback"
```

---

### Task 14: `EventList` + `BreakdownRow` (逐筆 tab)

**Files:**
- Create: `frontend/src/pages/XpHistory/EventList.jsx`
- Create: `frontend/src/pages/XpHistory/BreakdownRow.jsx`

- [ ] **Step 1: Implement BreakdownRow**

Create `frontend/src/pages/XpHistory/BreakdownRow.jsx`:

```jsx
import { Box, Typography } from "@mui/material";

const fmt = (n, d = 2) => (Number(n) || 0).toFixed(d);

export default function BreakdownRow({ ev, showAll }) {
  if (ev.base_xp == null) {
    return (
      <Box sx={{ p: 1.5, bgcolor: "#F8FAFB", borderRadius: 1, fontStyle: "italic", color: "text.secondary", fontSize: 12 }}>
        此筆早於 v2，無乘數明細
      </Box>
    );
  }

  const rawParts = [
    { label: "base", val: fmt(ev.base_xp, 3), hide: false, color: "text.primary" },
    { label: "cooldown", val: `×${fmt(ev.cooldown_rate)}`, hide: ev.cooldown_rate === 1 },
    { label: "群組", val: `×${fmt(ev.group_bonus)}`, hide: ev.group_bonus === 1 },
    { label: "暖流", val: `×${fmt(ev.blessing1_mult)}`, hide: ev.blessing1_mult === 1 },
  ];
  const tierLabel =
    ev.diminish_factor === 1 ? "遞減 tier1" :
    ev.diminish_factor === 0.3 ? "遞減 tier2" : "遞減 tier3";
  const effParts = [
    { label: "蜜月", val: `×${fmt(ev.honeymoon_mult)}`, hide: ev.honeymoon_mult === 1 },
    { label: tierLabel, val: `×${fmt(ev.diminish_factor)}`, hide: ev.diminish_factor === 1 },
    { label: "試煉", val: `×${fmt(ev.trial_mult)}`, hide: ev.trial_mult === 1 },
    { label: "永久", val: `×${fmt(ev.permanent_mult)}`, hide: ev.permanent_mult === 1 },
  ];

  const visibleRaw = rawParts.filter(p => showAll || !p.hide);
  const visibleEff = effParts.filter(p => showAll || !p.hide);

  return (
    <Box sx={{ p: 1.5, bgcolor: "#F8FAFB", borderRadius: 1, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, lineHeight: 1.7 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "baseline" }}>
        {visibleRaw.map((p, i) => (
          <Box key={i} component="span" sx={{ fontWeight: i === 0 ? 700 : 600 }}>
            <Box component="span" sx={{ color: "text.disabled", fontWeight: 400, mr: 0.5 }}>{p.label}</Box>
            {p.val}
          </Box>
        ))}
      </Box>
      <Typography component="div" sx={{ ml: 2, fontFamily: "inherit", fontSize: 12, color: "text.secondary" }}>
        → raw <Box component="span" sx={{ color: "text.primary", fontWeight: 700, fontSize: 13 }}>{ev.raw_exp}</Box>
      </Typography>

      {visibleEff.length > 0 && (
        <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "baseline" }}>
          <Box component="span" sx={{ color: "text.disabled", fontWeight: 400 }}>raw {ev.raw_exp}</Box>
          {visibleEff.map((p, i) => (
            <Box key={i} component="span" sx={{ fontWeight: 600 }}>
              <Box component="span" sx={{ color: "text.disabled", fontWeight: 400, mr: 0.5 }}>{p.label}</Box>
              {p.val}
            </Box>
          ))}
        </Box>
      )}
      <Typography component="div" sx={{ ml: 2, fontFamily: "inherit", fontSize: 12, color: "text.secondary" }}>
        → effective <Box component="span" sx={{ color: "warning.dark", fontWeight: 700, fontSize: 14 }}>{ev.effective_exp}</Box>
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 2: Implement EventList**

Create `frontend/src/pages/XpHistory/EventList.jsx`:

```jsx
import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import BreakdownRow from "./BreakdownRow";
import { foldEvents } from "./foldEvents";

const ACCENT = {
  cyan: "#00ACC1",
  amber: "#F59E0B",
  red: "#DC2626",
  grey: "#9CA3AF",
};

function accentFor(folded) {
  if (folded.degraded) return ACCENT.grey;
  const ev = folded.events[0];
  if (ev.diminish_factor === 0.03) return ACCENT.red;
  if (ev.diminish_factor === 0.3) return ACCENT.amber;
  return ACCENT.cyan;
}

export default function EventList({ events, showAll, groupLabel }) {
  const folded = useMemo(() => foldEvents(events || []), [events]);
  const [expanded, setExpanded] = useState(new Set());

  const toggle = key => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (folded.length === 0) {
    return <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>沒有資料</Typography>;
  }

  return (
    <Stack gap={1}>
      {folded.map(f => {
        const isOpen = expanded.has(f.key);
        return (
          <Box key={f.key} sx={{
            bgcolor: "background.paper", borderRadius: 1.5, overflow: "hidden",
            border: 1, borderColor: "divider", display: "flex",
          }}>
            <Box sx={{ width: 4, bgcolor: accentFor(f), flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box onClick={() => toggle(f.key)} sx={{
                p: 1.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 1.25,
              }}>
                <Box sx={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, fontWeight: 700, minWidth: 42 }}>
                  {f.minute.slice(11, 16)}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{
                    fontSize: 12, color: "text.secondary",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {groupLabel(f.group_id)}
                    {f.count > 1 && <Box component="span" sx={{ color: "warning.main", fontWeight: 700 }}> · ×{f.count}</Box>}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <Typography sx={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: "text.secondary" }}>
                    {f.raw_total > 0 ? `${f.raw_total} →` : "→"}
                  </Typography>
                  <Typography sx={{
                    fontFamily: "ui-monospace, Menlo, monospace", fontSize: 18, fontWeight: 700,
                    color: f.eff_total === 0 ? "error.main" : f.eff_total < f.raw_total / 2 ? "warning.main" : "text.primary",
                    lineHeight: 1,
                  }}>
                    {f.eff_total}
                  </Typography>
                </Box>
                <Box sx={{ color: "text.disabled", fontSize: 12, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                  ›
                </Box>
              </Box>
              {isOpen && (
                <Stack gap={1} sx={{ px: 1.5, pb: 1.5 }}>
                  {f.events.map(ev => (
                    <BreakdownRow key={ev.id} ev={ev} showAll={showAll} />
                  ))}
                </Stack>
              )}
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
```

- [ ] **Step 3: Lint**

```bash
cd frontend && yarn lint
```

Expected: clean.

- [ ] **Step 4: Manual smoke test**

With infra + bot + frontend running, navigate to `http://localhost:3000/xp-history` (with a logged-in LIFF token). The tab should populate from `/api/me/xp-events`. Tap a folded row, breakdown shows. Toggle "顯示全部乘數" — hidden multipliers appear.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/XpHistory/EventList.jsx frontend/src/pages/XpHistory/BreakdownRow.jsx
git commit -m "feat(chat-level): xp-history 逐筆 tab — fold + breakdown chain"
```

---

### Task 15: `DailyTrend` (每日趨勢 tab)

**Files:**
- Create: `frontend/src/pages/XpHistory/DailyTrend.jsx`

- [ ] **Step 1: Implement DailyTrend**

Create `frontend/src/pages/XpHistory/DailyTrend.jsx`:

```jsx
import { useState } from "react";
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

const COLORS = {
  amber: "#FBBF24",
  amberDeep: "#F59E0B",
  divider: "#E5E7EB",
  muted: "#94A3B8",
  loss: "rgba(148,163,184,0.45)",
  text: "#3A2800",
};

export default function DailyTrend({ days, range, onRangeChange }) {
  const W = 320;
  const PAD_L = 28;
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 56;
  const H = 240;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const sliced = (days || []).slice(-range);
  const maxRaw = Math.max(...sliced.map(d => d.raw_exp || 0), 100);
  const barW = sliced.length > 0 ? innerW / sliced.length : 0;
  const gap = Math.min(2, barW * 0.15);

  const [picked, setPicked] = useState(null);

  return (
    <Stack gap={1.5}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={range}
        onChange={(_, v) => v && onRangeChange(v)}
        fullWidth
      >
        {[7, 30, 90, 365].map(r => (
          <ToggleButton key={r} value={r} sx={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
            {r === 365 ? "1y" : `${r}d`}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Box sx={{
        bgcolor: "background.paper", borderRadius: 1.5, border: 1, borderColor: "divider",
        p: 1.5,
      }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
          <Typography sx={{ fontWeight: 700, color: COLORS.text }}>raw vs effective</Typography>
          <Typography variant="caption" sx={{ fontFamily: "ui-monospace, Menlo, monospace", color: COLORS.muted }}>
            最近 {range === 365 ? "一年" : `${range} 天`}
          </Typography>
        </Stack>

        <Box
          component="svg"
          viewBox={`0 0 ${W} ${H}`}
          sx={{ width: "100%", display: "block", touchAction: "manipulation" }}
          onClick={e => {
            // click on empty area deselects
            if (e.target.tagName === "svg") setPicked(null);
          }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map(p => (
            <line
              key={p}
              x1={PAD_L} x2={W - PAD_R}
              y1={PAD_T + innerH * (1 - p)} y2={PAD_T + innerH * (1 - p)}
              stroke={COLORS.divider}
              strokeWidth="1"
              strokeDasharray={p === 0 ? "" : "2 3"}
            />
          ))}
          {[0, 0.5, 1].map(p => (
            <text
              key={p}
              x={PAD_L - 4}
              y={PAD_T + innerH * (1 - p) + 3}
              textAnchor="end"
              fontSize="9"
              fill={COLORS.muted}
              fontFamily="ui-monospace, Menlo, monospace"
            >{Math.round(maxRaw * p)}</text>
          ))}

          {sliced.map((d, i) => {
            const x = PAD_L + i * barW + gap / 2;
            const w = Math.max(1, barW - gap);
            const effH = ((d.effective_exp || 0) / maxRaw) * innerH;
            const lossH = (Math.max(0, (d.raw_exp || 0) - (d.effective_exp || 0)) / maxRaw) * innerH;
            const yLoss = PAD_T + innerH - effH - lossH;
            const yEff = PAD_T + innerH - effH;
            const isPicked = picked && picked.date === d.date;
            return (
              <g
                key={d.date}
                onClick={(e) => {
                  e.stopPropagation();
                  setPicked(prev => (prev?.date === d.date ? null : d));
                }}
                style={{ cursor: "pointer" }}
              >
                <rect x={x} y={yLoss} width={w} height={lossH} fill={COLORS.loss} />
                <rect x={x} y={yEff} width={w} height={effH} fill={isPicked ? COLORS.amberDeep : COLORS.amber} />
                {d.honeymoon_active && (
                  <text x={x + w / 2} y={PAD_T + innerH + 12} textAnchor="middle" fontSize="9" fill="#15803D">🌱</text>
                )}
                {d.trial_id && (
                  <text x={x + w / 2} y={PAD_T + innerH + (d.honeymoon_active ? 24 : 12)} textAnchor="middle" fontSize="9" fill="#B45309">⚔★{d.trial_star ?? ""}</text>
                )}
                {(i % Math.max(1, Math.floor(sliced.length / 6)) === 0) && (
                  <text
                    x={x + w / 2}
                    y={PAD_T + innerH + (d.honeymoon_active && d.trial_id ? 38 : (d.honeymoon_active || d.trial_id ? 26 : 14))}
                    textAnchor="middle" fontSize="9" fill={COLORS.muted}
                    fontFamily="ui-monospace, Menlo, monospace"
                  >{d.date.slice(5)}</text>
                )}
              </g>
            );
          })}

          {picked && (() => {
            const i = sliced.findIndex(d => d.date === picked.date);
            if (i < 0) return null;
            const x = PAD_L + i * barW + barW / 2;
            return <line x1={x} x2={x} y1={PAD_T} y2={PAD_T + innerH} stroke={COLORS.text} strokeWidth="1" strokeDasharray="2 2" opacity="0.35" />;
          })()}
        </Box>

        <Box sx={{
          mt: 1, p: "6px 8px", bgcolor: "#F8FAFB", borderRadius: 0.75,
          fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: "text.secondary", minHeight: 40,
        }}>
          {picked ? (
            <>
              <Box sx={{ color: COLORS.text, fontWeight: 700 }}>{picked.date}</Box>
              <Box>
                raw <Box component="span" sx={{ color: COLORS.muted }}>{picked.raw_exp}</Box>
                {" "}· eff <Box component="span" sx={{ color: COLORS.amberDeep, fontWeight: 700 }}>{picked.effective_exp}</Box>
                {" "}· 訊息 {picked.msg_count}
              </Box>
            </>
          ) : (
            <Box sx={{ color: COLORS.muted }}>點選長條看單日數字</Box>
          )}
        </Box>

        <Stack direction="row" gap={1.5} sx={{ mt: 1, fontSize: 10, color: "text.secondary", fontFamily: "ui-monospace, Menlo, monospace" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: COLORS.amber, borderRadius: 0.25 }} />
            effective
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: COLORS.loss, borderRadius: 0.25 }} />
            loss
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>🌱 蜜月</Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>⚔★ 試煉</Box>
        </Stack>
      </Box>
    </Stack>
  );
}
```

- [ ] **Step 2: Lint**

```bash
cd frontend && yarn lint
```

Expected: clean.

- [ ] **Step 3: Manual smoke test**

Refresh `/xp-history`, switch to 「每日趨勢」 tab. Bars render against `/api/me/xp-daily`. Tap a bar → tooltip pins below; tap empty area → deselects. Range buttons (7/30/90/1y) refetch and re-scale.

Test on a phone too (chrome devtools mobile mode is OK in v1) to confirm tap-pin works.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/XpHistory/DailyTrend.jsx
git commit -m "feat(chat-level): xp-history 每日趨勢 tab — tap-pinned stacked bars"
```

---

### Task 16: Page shell + routing

**Files:**
- Create: `frontend/src/pages/XpHistory/index.jsx`
- Modify: `frontend/src/App.jsx`

> Built last because it depends on the helpers + components from Tasks 13–15.

- [ ] **Step 1: Add the route**

In `frontend/src/App.jsx`, find where other LIFF page routes are registered (e.g. `<Route path="/prestige" ... />`). Add:

```jsx
<Route path="/xp-history" element={<XpHistory />} />
```

And import:

```jsx
import XpHistory from "./pages/XpHistory";
```

- [ ] **Step 2: Create page shell**

Create `frontend/src/pages/XpHistory/index.jsx`:

```jsx
import { useEffect, useState } from "react";
import {
  Box, Container, Tabs, Tab, FormControlLabel, Switch, Stack, Typography,
} from "@mui/material";
import liff from "@line/liff";

import EventList from "./EventList";
import DailyTrend from "./DailyTrend";
import { groupLabel as defaultGroupLabel } from "./groupLabel";

const TODAY = () => new Date().toISOString().slice(0, 10);

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function XpHistory() {
  const [tab, setTab] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [token, setToken] = useState(null);

  const [events, setEvents] = useState([]);
  const [eventsRange, setEventsRange] = useState({ from: addDays(TODAY(), -1), to: TODAY() });
  const [days, setDays] = useState([]);
  const [dailyRange, setDailyRange] = useState(30);

  // LIFF init mirrors the prestige page
  useEffect(() => {
    (async () => {
      try {
        await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });
        if (!liff.isLoggedIn()) liff.login();
        else setToken(liff.getAccessToken());
      } catch (e) {
        console.error("liff.init", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/me/xp-events?from=${eventsRange.from}&to=${eventsRange.to}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(j => setEvents(Array.isArray(j.events) ? j.events : []));
  }, [token, eventsRange]);

  useEffect(() => {
    if (!token) return;
    const to = TODAY();
    const from = addDays(to, -(dailyRange - 1));
    fetch(`/api/me/xp-daily?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(j => setDays(Array.isArray(j.days) ? j.days : []));
  }, [token, dailyRange]);

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">經驗歷程</Typography>
        {tab === 0 && (
          <FormControlLabel
            control={<Switch size="small" checked={showAll} onChange={e => setShowAll(e.target.checked)} />}
            label="顯示全部乘數"
          />
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="逐筆" />
        <Tab label="每日趨勢" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <EventList events={events} showAll={showAll} groupLabel={defaultGroupLabel} />
        </Box>
      )}
      {tab === 1 && (
        <Box>
          <DailyTrend days={days} range={dailyRange} onRangeChange={setDailyRange} />
        </Box>
      )}
    </Container>
  );
}
```

- [ ] **Step 3: Smoke test the route**

```bash
cd frontend && yarn dev
```

Open http://localhost:3000/xp-history (after logging in via LIFF flow if hooked up). Expect tabs to render, both populating from the APIs, and the showAll toggle wiring through to BreakdownRow.

- [ ] **Step 4: Lint**

```bash
cd frontend && yarn lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/XpHistory/index.jsx frontend/src/App.jsx
git commit -m "feat(chat-level): wire /xp-history LIFF page shell + route"
```

---

## M6 — Acceptance + production checks

### Task 17: End-to-end acceptance run

- [ ] **Step 1: Run the full backend test suite**

```bash
cd app && yarn test
```

Expected: all green.

- [ ] **Step 2: Lint everything**

```bash
cd app && yarn lint
cd ../frontend && yarn lint
```

Expected: clean both.

- [ ] **Step 3: Manual end-to-end checklist**

Walk the spec §13 checklist, ticking each item:

- [ ] Send `#經驗歷程` from a personal LINE chat → bubble renders with today's data.
- [ ] Send the same from a group chat where the bot has membership → bubble renders, last_event group label resolves to the group name.
- [ ] `/me` profile bubble shows `查看經驗歷程` CTA. Tap → triggers `#經驗歷程` text + bubble.
- [ ] LIFF `/xp-history` 逐筆 tab shows folded rows, breakdown chain matches spec example math.
- [ ] Toggle "顯示全部乘數" on → ×1.0 multipliers appear.
- [ ] LIFF 每日趨勢 tab shows 30-day stacked bars; toggle ranges; tap bar pins detail; tap empty deselects.
- [ ] Privacy: open devtools, change `userId` query if any → server should always read `req.profile.userId`. Confirm by inspecting network responses.
- [ ] Send a message in a tracked group, wait for the next ChatExpUpdate cron tick (≤ 1 min). Reload LIFF — the new event appears with full numeric breakdown.
- [ ] Open a row pre-dating the migration (older than today's deploy if applicable) — should fall back to "此筆早於 v2，無乘數明細" placeholder; bubble's "舊版資料" chip appears if that row is the latest.

- [ ] **Step 4: Update spec acceptance checklist**

In `docs/plans/chat-level-xp-history.md` §13, tick the boxes for items now confirmed.

- [ ] **Step 5: Final commit**

```bash
git add docs/plans/chat-level-xp-history.md
git commit -m "docs(chat-level): tick xp-history acceptance checklist"
```

- [ ] **Step 6: Push to remote**

```bash
git push origin feat/chat-level-prestige
```

---

## Production deploy checklist

- Migration runs as part of normal `yarn migrate` flow. No data backfill required.
- No new seed needed.
- No new cron job — existing `ChatExpEventsPrune` already retains the events table at 30 days.
- Frontend assets ship via the existing build pipeline.
- LIFF endpoint base unchanged; SPA route is enough.
- After deploy, run a single SQL spot-check on prod (via Portainer-mediated `docker exec`):
  ```
  SELECT base_xp, blessing1_mult, honeymoon_mult, diminish_factor, trial_mult, permanent_mult
  FROM chat_exp_events ORDER BY id DESC LIMIT 5;
  ```
  Expected: the 5 most recent rows have all six new columns populated (non-null).
