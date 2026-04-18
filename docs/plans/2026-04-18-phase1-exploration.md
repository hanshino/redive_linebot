# Phase 1 Exploration — Subscriber Auto-Actions

**Date:** 2026-04-18
**Branch:** `feat/subscriber-auto-actions`
**Plan reference:** `.omc/plans/2026-04-18-subscriber-auto-actions.md`
**Story:** US-001 (ralph Phase 1 PRD)

This document captures the pre-implementation audit that unblocks Phase 1 execution (migrations, models, backfill). All assertions below were verified against the actual repo state on branch `feat/subscriber-auto-actions` at HEAD.

---

## (a) Verified file/line references

### `app/src/controller/princess/gacha.js`

| Reference | Plan says | Actual | Status |
|---|---|---|---|
| `gacha()` function start | 196 | 196 | ✓ |
| `gacha()` function end | 488 | 488 | ✓ |
| Transaction open (`inventory.transaction()`) | ~425 | 425 | ✓ |
| Transaction commit | ~436 | 436 | ✓ |
| Transaction rollback (error path) | ~438 | 438 | ✓ |
| `context.replyText` error fallback | 440 | 440 | ✓ |
| `handleSignin(userId)` | 449 | 449 | ✓ |
| `EventCenterService.add("daily_quest", {userId})` | 450 | 450 | ✓ |
| `AchievementEngine.evaluate(userId, "gacha_pull", ...)` | 477 | 477 | ✓ |
| `notifyUnlocks(context, userId, unlocked)` | 482 | 482 | ✓ |
| `context.replyFlex("每日一抽結果", ...)` | 484 | 484 | ✓ |
| `detectCanDaily()` start | 495 | 495 | ✓ |
| `detectCanDaily()` end | 556 | 556 | ✓ |
| `purgeDailyGachaCache()` | 558+ | 558 | ✓ |
| Redis negative-cache set (short EX:60) | ~530, ~549 | 530, 549 | ✓ |

All line numbers in the plan match current HEAD. No drift since plan authoring.

### `app/src/service/JankenService.js`

| Reference | Plan says | Actual | Status |
|---|---|---|---|
| `randomChoice()` | 27-30 | 27-30 | ✓ |
| `submitChoice()` | 141-165 | 141-165 | ✓ |
| `resolveMatch()` | 167+ | 167-260 | ✓ |
| `resolve:${matchId}` NX lock | 176-181 | 176-181 | ✓ |
| `submitArenaChallenge()` | (not in plan) | 371-396 | noted |
| `resolveArena()` | 398-414 | 398-414 | ✓ |

### `app/knexfile.js`

Pool config at line 17:
```js
pool: { min: 0, max: 10 }
```
Matches plan expectation. Concurrency cap of 8 (per plan §5 Phase 3) leaves 2 connections for HTTP / other cron overlap. No infra change needed.

---

## (b) Chart library decision

**Decision:** Use **`recharts` ^3.8.1** (already present in `frontend/package.json:28`).

- No fallback needed.
- Recharts aligns with the existing frontend stack (React 19, MUI 7, Vite 8) and is the simplest option for line / bar charts in the LIFF gacha-history page (Phase 7).
- Rationale: adding another chart lib would bloat the bundle; recharts is well-maintained and already carried.

---

## (c) Logger decision

**Decision:** Use **`log4js` 6.9.1** (already present in `app/package.json:34`) via the existing wrapper at `app/src/util/Logger.js`.

- Two pre-configured loggers are exported:
  - `DefaultLogger` — category `default`, level `debug`
  - `CustomLogger` — category `custom`, level `all`
- Phase 3 cron (`AutoDailyGacha.js`) will import `CustomLogger` (consistent with `DailyRation.js` which uses `CustomLogger` for per-user success/error trace).
- Log line for cron completion (per §10 Metrics): `CustomLogger.info("cron.auto_gacha.complete", { duration_ms, target_count, success, failed, skipped })`.
- No new logger lib required.

---

## (d) Knex pool confirmation

Confirmed at `app/knexfile.js:17`: `pool: { min: 0, max: 10 }`.

- Concurrency cap **8** (planned in §5 Phase 3) fits within budget and reserves 2 connections for concurrent HTTP traffic + other nightly crons (`DailyRation`, `DailyCleanup`, `CleanExpiredSubscriber`, `DailyQuestProcess`).
- If production measurement (deferred — see §g) shows contention above this baseline, raise to `max: 15` via coordinated knexfile + Docker compose env change.
- No changes to `knexfile.js` required in Phase 1.

---

## (e) `subscribe_card.effects` JSON shape

Confirmed by cross-referencing:
- `app/src/controller/princess/gacha.js:538-542` — iterates `effects.find(effect => effect.type === "gacha_times")` and reads `.value` as a number.
- `app/bin/DailyRation.js:41-49` — iterates `effects.find(item => item.type === "daily_ration")` and reads `.value`.

**Shape:** `effects` is a JSON array of `{ type: string, value: number }` objects stored on the `subscribe_card` table (not on `subscribe_user`). Example inferred from usage:

```json
[
  { "type": "gacha_times", "value": 2 },
  { "type": "daily_ration", "value": 50 }
]
```

**Access pattern (for Phase 3 target loader):** join `subscribe_user` with `subscribe_card` on `subscribe_user.subscribe_card_key = subscribe_card.key`. The `effects` column lives on `subscribe_card`. Existing `detectCanDaily` at `gacha.js:516-524` demonstrates this join.

**Implication for Phase 3 cron:** target loader must JOIN against `subscribe_card` to obtain `effects`; do not duplicate the effects onto `subscribe_user`.

---

## (f) Arena `resolveArena` signature (v1 scope-out justification)

Arena path uses a fundamentally different protocol from duel:

```js
// JankenService.js:371
exports.submitArenaChallenge = async function (groupId, holderUserId, challengerUserId, choice)
// Redis key: `${CHALLENGE_PREFIX}:${groupId}:${holderUserId}`
// Payload:   JSON.stringify({ challengerUserId, choice })

// JankenService.js:398
exports.resolveArena = async function (groupId, holderUserId, holderChoice)
// Returns: { challengerUserId, challengerChoice, holderChoice } | null
```

Differences from duel:

| Axis | Duel (`resolveMatch`) | Arena (`resolveArena`) |
|---|---|---|
| Unique key | `matchId` (UUID per 1v1) | `(groupId, holderUserId)` — long-lived holder slot |
| Role model | symmetric P1/P2 | asymmetric holder vs challenger |
| Redis TTL | 3600s per player-side choice | 10 min per pending challenge |
| Choice storage | one Redis key per player | single Redis key with JSON payload |
| Bet flow | both escrow via `tryEscrowOnce` | arena uses different settlement (need further read if in-scope) |

Both arena entry points (`submitArenaChallenge` at 371, `resolveArena` at 398) already handle `choice === "random"` natively (lines 372-374 and 399-401). Auto-fate for arena would require:

- Detecting when a holder has a pending challenger (no matchId to hook off of).
- Deciding WHOSE auto-fate triggers: holder only? challenger only? both?
- Integrating with bet-lock semantics unique to arena.

**v1 scope-out stands.** Tracked as follow-up F1 in plan §12.

---

## (g) Open items and discrepancies

### Open items (not blockers for Phase 1)

1. **DailyRation baseline (AC-17 in plan §3).** Requires production access (`docker exec redive_linebot-worker-1 …` on the remote host) to tail `app/log/error_log.log` for `DailyRation` start/end lines. Deferred to Phase 3 precondition; not needed for Phase 1 migrations/models/backfill.
2. **Existing `effects` values in production `subscribe_card`.** Plan assumes `gacha_times` value ≥1 for month/season cards but this is not verified locally. Should be spot-checked before Phase 3 cron goes live; no impact on Phase 1 schema.
3. **Whether any non-subscriber users have `user_auto_preference` rows accidentally created during testing.** N/A at Phase 1 — the table does not exist yet.

### Discrepancies between plan and reality

None. All line numbers, function signatures, and dependencies in `.omc/plans/2026-04-18-subscriber-auto-actions.md` v2.1 match HEAD of `feat/subscriber-auto-actions` branch.

### Confirmed patterns to mimic

- **Cron entry pattern (for Phase 3 `AutoDailyGacha.js`):** `app/bin/DailyRation.js` — exports `main` function, registers `if (require.main === module) { main().then(() => process.exit(0)); }` at tail. Uses `CustomLogger` for per-user traces.
- **Subscription target loader pattern:** `SubscribeUser.getDailyRation({key, now})` at `app/src/model/application/SubscribeUser.js:12-29` — filters by `start_at <= now`, `end_at > now`, and excludes users already processed today via a NOT-IN subquery on `SubscribeJobLog`. Phase 3 loader will apply the same `end_at > now` check plus a NOT-IN on `auto_gacha_job_log(user_id, run_date=CURDATE())`.
- **Migration style:** `app/migrations/20221026092347_create_gacha_record_table.js` (reference for `gacha_record_detail` FK pattern at `20260406120001_create_gacha_banner_characters.js:13`). Use `table.foreign().references().onDelete("CASCADE")` for FKs and `table.unique(["col1","col2"])` for composite uniques.
- **Model pattern:** `app/src/model/princess/GachaRecord.js` — single-instance export extending `base` with `table` + `fillable`.
- **Transaction pattern (for backfill script):** `app/bin/DailyRation.js:83-87` — `Model.connection.transaction(async trx => { ... })`.

---

_End of Phase 1 exploration._
