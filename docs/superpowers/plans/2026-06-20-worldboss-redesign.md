# World Boss Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static "training-dummy" world boss with a server-wide co-op raid that fights back during an enrage phase, runs a three-role (DPS / healer / tank) economy, and auto-settles idempotent equipment-material + 女神石 rewards on kill or escape — all under reply-only / no-tick constraints.

**Architecture:** A daily server boss is opened and settled by a per-minute cron (`bin/WorldBossAdvance.js`, copied from `RaceAdvance.js`); all combat resolves synchronously on the player's "resolving hit" or lazily on a Redis TTL — never a background tick. Contribution lands in the durable append-log `world_boss_event_log` (Redis drives only live interaction, never scoring); three boards (傷害/治療/格擋) settle into idempotent per-event reward grants that cross the numeric-id → platform_id boundary via a JOIN (`resolveUserIds`). Discovery is pull-based (battle-report card piggyback + `#世界王` + a Socket.IO-backed LIFF page).

**Tech Stack:** Bottender + Express + Socket.IO (Node 22, CommonJS), Knex/MySQL, Redis (ZSET pool + TTL shield/block), Jest (`app/__tests__`), React 19 + MUI 7 + Vite LIFF frontend.

> **Precedence of the reference sections below (highest first):** Part 1 (API & Ownership Lock) ▸ Part 2 (Verified Ground-Truth Corrections) ▸ Appendix A (Original Interface Contract). The milestones in Part 3 are self-contained and already conform to Part 1 + Part 2.

---

# Part 1 — API & Ownership Lock (DEFINITIVE)

# COMBAT / LIFECYCLE / MODEL API LOCK (DEFINITIVE — supersedes the addendum and contract wherever they differ)

A verification pass found the milestones disagreed on file ownership, Redis helper names, the `dpsAttack` signature, pool key identity, and the M6/M7 lifecycle-vs-settlement split. Root cause: the model-query-helper milestone got lost and two milestones grabbed lifecycle. This document is the SINGLE authority. Every re-drafted milestone MUST cite these exact names/signatures. Anything conflicting with this is wrong.

## A. MILESTONE OWNERSHIP MAP (final)
- **M1 — Foundation & model layer (SOLE owner of the whole model/migration/config layer).** Schema migrations; `worldboss.*` config + `items` registry; new model classes `WorldBossRole`, `WorldBossRewardLog`; AND **all new query helpers** on the existing `WorldBossLog` and `WorldBossEvent` modules (listed in §E). Every later milestone CALLS these — none of them re-defines a model method.
- **M2 — Role system + base-gear grant.** (FIXED — already correct; do not re-draft.)
- **M3 — Equipment enhancement layer.** (FIXED — already correct; do not re-draft.)
- **M4 — Combat core. SOLE CREATOR of `app/src/util/worldBossRedis.js` AND `app/src/service/WorldBossCombatService.js`.** Creates the Redis helpers (§C) and `dpsAttack` + the internal enrage trigger / batch-knock / counter-knock / kill-CAS (§D). M4 is NOT "equipment" — that is M3.
- **M5 — Combat support. MODIFIES `WorldBossCombatService.js`** to ADD `tankBlock` / `healerRevive` / `healerShield` and the D30 cold-start scaling. **USES `worldBossRedis` (created by M4) — never re-creates it, never re-creates `WorldBossCombatService.js`, never redefines `dpsAttack`.** M5 deletes any task that "Create:"s either combat file.
- **M6 — Lifecycle cron. SOLE owner of `app/src/service/WorldBossLifecycleService.js` (`createDailyBoss` + `advance` scan), `app/bin/WorldBossAdvance.js`, and the `"World Boss Advance"` crontab entry.** `advance` CALLS `require("./WorldBossSettlementService").settleEvent(eventId)`. M6 does NOT define `settleEvent`.
- **M7 — Settlement & economy. SOLE owner of `app/src/service/WorldBossSettlementService.js` (`settleEvent` + `_computeFaucet` + `grantOne`).** M7 does NOT create `bin/WorldBossAdvance.js`, the crontab entry, `createDailyBoss`, or `WorldBossLifecycleService.js`. All M7 test paths target `WorldBossSettlementService`. (Settlement remains per-user-transaction re-runnable; that part of M7 was verified correct — keep it.)
- **M8 — Realtime + LIFF + report.** (FIXED — already conforms; do not re-draft. Its consumption contract is frozen in §F and the re-draft MUST match it.)
- **M9 — LINE command surface + cleanup.** (FIXED — do not re-draft. Frozen contract in §F.)
- **M10 — Monte-Carlo gate.** Imports the REAL `WorldBossCombatService.dpsAttack` and fakes `worldBossRedis` + `WorldBossLog` to EXACTLY the §C/§E names; asserts an all-DPS server kills the daily boss.

## B. POOL / SHIELD / BLOCK IDENTITY = `platform_id` (this CORRECTS addendum §4)
The rescue pool, shield tokens, and block-owner records are ALL keyed by `platform_id` — one uniform key space. (Addendum §4 said "numeric user.id" for the pool; that is WRONG and is hereby overridden. Only the LOG and grants use numeric/resolution.) Rationale: the inbound LINE event and every live knocked-down check start from `platform_id`, so keying Redis on it avoids a resolve round-trip on the hot path.
- The LOG (`world_boss_event_log.user_id`) stays NUMERIC `user.id` (immutable fact, migration 20211019095909).
- `getRecentAttackers` returns BOTH ids `{ user_id: <numeric>, platform_id: <string> }`, so the enrage batch ZADDs `platform_id` into the pool while any contribution writeback row uses the numeric `user_id`.
- Tank/shield absorb credit: the owner is known by `platform_id` (stored in Redis); convert to numeric via `UserModel.getId(platformId)` before `createWithRole` (skip the writeback if it returns null — never mis-credit).
- Settlement `resolveUserIds` maps the numeric ids it aggregated from the LOG back to `platform_id` for grants.

## C. `app/src/util/worldBossRedis.js` — EXACT exports (created in M4)
All members are `platform_id` strings.
```
exports.poolAdd      = async (eventId, platformId, ts) => void;            // ZADD score=ts
exports.poolPopMin   = async (eventId, count) => [platformId, ...];        // ZPOPMIN -> member strings only ([] when empty; handle single-object return)
exports.poolScore    = async (eventId, platformId) => ts | null;          // ZSCORE (null if absent)
exports.poolRemove   = async (eventId, platformId) => void;               // ZREM
exports.shieldSet    = async (eventId, targetPlatformId, ownerPlatformId, ttlSec) => void;  // SET wb:shield:{event}:{target} = ownerPlatformId EX ttl
exports.shieldConsume= async (eventId, targetPlatformId) => ownerPlatformId | null;         // GETDEL-style; null if no shield
exports.blockSet     = async (eventId, ownerPlatformId, ttlSec) => void;  // SET wb:block:{event} = ownerPlatformId EX ttl
exports.blockOwner   = async (eventId) => ownerPlatformId | null;          // GET wb:block:{event}
```
Lazy natural recovery lives in the COMBAT SERVICE, not the util: a knocked-down check is `poolScore(eventId, platformId)` → if the score exists and `score + recoveryMinutes*60000 <= now` then `poolRemove(...)` and treat as recovered (not knocked). There is NO `isKnockedDown` / `recoverIfExpired` / `addToPool` / `popFromPool` / `getBlockOwner` / `consumeShield` / `openBlockWindow` / `consumeBlockSlot` / `setShield` export — those older names are FORBIDDEN; use only the eight above.

## D. `WorldBossCombatService` — EXACT signatures & result shapes
Numeric id is resolved ONLY via `UserModel.getId(platformId)` (verified `UserModel.js:8-11`, returns numeric `user.id` or `null`). There is NO `_resolveNumericId` — delete it; use `UserModel.getId` everywhere (combat AND writeback). Callers (M8/M9) pass an already-resolved `numericUserId`; the service trusts it and only self-resolves an absorb-credit owner (off the hot path).

```
exports.dpsAttack = async ({ platformId, numericUserId, eventId, attackType, level }) =>
  { damage, contribution, enraged, didEnrageTrigger, knockedBatch, selfKnocked, rejected, reason };
exports.tankBlock     = async ({ platformId, numericUserId, eventId }) => { rejected, reason, windowMinutes };
exports.healerRevive  = async ({ platformId, numericUserId, eventId }) => { rejected, reason, revived: [platformId...], contribution };
exports.healerShield  = async ({ platformId, numericUserId, eventId }) => { rejected, reason, shielded: [platformId...], contribution };
```
- `attackType` is the raw attack string in the existing `"<jobKey>|<skill>"` form (e.g. `"sword|skillOne"`); v1 DPS damage uses `getStandardDamage()` regardless of skill (skill-specific damage is out of scope, noted for M9). `level` is the chat/minigame level (caller fetched it via `MinigameService.findByUserId(platformId).level`); the service does NOT call MinigameService.
- DPS damage = `makeCharacter(jobKey, { level }).getStandardDamage()` = `Math.floor(Math.pow(level,2)) + level*10`; then `damage = Math.floor(damage * (1 + bonuses.atk_percent))` (fraction, via `EquipmentService.getEquipmentBonuses(platformId)`). `contribution = damage` on the DPS board.
- HP read: `WorldBossLog.getTotalDamageByEventId(eventId)` returns `{ total_damage }` (verified). `remainHpBefore = event.hp - parseInt(total_damage || 0, 10)`. Phase: enraged when `remainHpBefore <= event.hp * thresholdPct/100`.
- **Enrage crossing-hit rule (LOCKED):** the hit that CROSSES from calm into enrage is NOT doubled (it is computed while still in the calm band) and it FIRES the trigger as a side effect (`didEnrageTrigger:true`, batch-knock recent attackers). Hits that START already in the enrage band get ×2 on BOTH `damage` and `contribution`. M10's sim imports the real `dpsAttack`, so it inherits this automatically.
- `knockedBatch` returned to callers is a list of `platform_id`s (already platform-keyed — pool identity is platform_id per §B; no numeric leak to M8).
- Reject paths return `{ rejected:true, reason }` with NO log write and NO energy spent: `reason:"not_active"` (event status != active), `reason:"knocked_down"` (caller is in the pool and not recovered), `reason:"no_role"`/`"no_energy"` as applicable.

## E. Model-layer additions — ALL owned by M1 (every later milestone only CALLS these)
On `app/src/model/application/WorldBossLog.js` (add `role`,`contribution` to its `fillable`; existing `getTopRank`/`getTotalDamageByEventId` stay):
```
createWithRole({ user_id /*numeric*/, world_boss_event_id, role, action_type, damage, cost, contribution }, trx?) => Promise<...>;
getRecentAttackers({ eventId, minutes, limit }) => Promise<[{ user_id /*numeric*/, platform_id }]>;   // JOIN user; last `limit` rows within `minutes`, created_at DESC
getSupportRatio(eventId) => Promise<number>;   // (#distinct users with >=1 healer|tank action) / (#distinct users with >=1 action); 0 when no actions
getDamageRank({ eventId, limit }) => Promise<[{ user_id, platform_id, total_damage }]>;               // JOIN user, GROUP BY user_id, ORDER BY SUM(damage) DESC
getContributionRank({ eventId, role, limit }) => Promise<[{ user_id, platform_id, total_contribution }]>; // JOIN user, WHERE role, SUM(contribution)
getParticipants(eventId) => Promise<[{ user_id, platform_id }]>;   // distinct users with >=1 row (for participation award)
resolveUserIds(numericIds /* number[] */) => Promise<Map<number,string>>;   // JOIN user; skip ids with no user row
```
On `app/src/model/application/WorldBossEvent.js` (add `status`,`killed_at`,`settled_at` to `fillable`; `create`/`update` use `pick(attributes, fillable)`):
```
getActive() => Promise<row|null>;                         // status='active' AND now BETWEEN start_time/end_time (the single holding event)
getKilledUnsettled() => Promise<row[]>;                   // status='killed' AND settled_at IS NULL
getOverdueActive() => Promise<row[]>;                     // status='active' AND end_time < now
casStatus(eventId, fromStatus, toStatus, extra = {}) => Promise<boolean>;  // UPDATE ... SET status=to, ...extra WHERE id=? AND status=from; true if affected===1
findRaw(id) => Promise<row|undefined>;                    // join-free: mysql("world_boss_event").where({id}).first()  (do NOT use find(), it INNER-JOINs world_boss)
markSettled(eventId) => Promise<boolean>;                 // UPDATE ... SET settled_at=now() WHERE id=? AND settled_at IS NULL; true if affected===1 (atomic claim)
```
M1 keeps its existing 10 tasks intact and ADDS two tasks (WorldBossLog helpers; WorldBossEvent helpers) implementing exactly the above with TDD.

## F. FROZEN CONSUMER CONTRACT (from M8/M9 — the re-draft MUST match these; do NOT change M8/M9)
- M8 calls `dpsAttack({ platformId, numericUserId, eventId, attackType, level })`, and `tankBlock/healerRevive/healerShield({ platformId, numericUserId, eventId })`. It resolves `numericUserId` via `UserModel.getId(platformId)` (returns 409 `no_user` on null) and `level` via `MinigameService.findByUserId` (level only). The combat service import path is `app/src/service/WorldBossCombatService.js` regardless of which milestone created it (M8's "(M5)" label is cosmetic; the file is created in M4).
- Report-unread flag has exactly ONE writer: `WorldBossReportService.setUnread(platformId)` (created in M8). **M7 settlement calls `WorldBossReportService.setUnread(platformId)`** to surface the battle report — it does NOT call a `worldBossRedis.setReportUnread`. (M7 may require WorldBossReportService; at runtime both ship together.)
- Combat result fields M8 reads: `rejected`,`reason`,`didEnrageTrigger`,`knockedBatch`(platform_ids),`revived`,`contribution`,`shielded`,`windowMinutes`. Keep these exact field names.

## G. M6/M7 split specifics (close the dual-create regression)
- `createDailyBoss()` lives ONLY in `WorldBossLifecycleService` (M6). Its canonical contract: settle every `getKilledUnsettled()` (call `settleEvent`); expire every `getOverdueActive()` via `casStatus(id,"active","expired",{})` then `settleEvent`; if no `getActive()`, open today's boss from the rotation (`config.get("worldboss.boss_pool")`, `config.get("worldboss.open_hour")`) by `WorldBossEvent.create({..., status:"active"})`. Idempotent: one boss/day.
- The expire CAS extra object is `{}` (settled_at is owned by `settleEvent.markSettled`; killed_at stays null for expiry).
- `settleEvent(eventId)` lives ONLY in `WorldBossSettlementService` (M7). M6's `advance` and `createDailyBoss` call `require("./WorldBossSettlementService").settleEvent`.

## H. DEFERRED OUT OF v1 (conscious omission, not a gap)
- D22's "first-two-weeks healer/tank role-swap migration bonus" (`遷移頭兩週給補/坦轉職限時加成`) is DEFERRED to post-v1. The 7:2:1 anchor + the `getSupportRatio` scarcity premium already rebalance roles; the time-boxed promo is a launch nicety. Note it explicitly in M7 (or M2) as deferred so it is a conscious decision, not a silent miss. Do NOT add a task for it.

---

# Part 2 — Verified Ground-Truth Corrections

> Authoritative except where Part 1 overrides (notably: Part 1 §B sets the rescue-pool / shield / block key space to `platform_id`, overriding §4 below which said numeric).

# VERIFIED GROUND TRUTH & CORRECTIONS (AUTHORITATIVE — overrides the contract and any draft claim that conflicts)

Every fact below was verified against the real repo at `/home/hanshino/workspace/redive_linebot/app`. Where this addendum and the contract disagree, THIS WINS. Where a draft used a different value/signature, change it to match this.

## 1. DPS damage formula (canonical, single source)
- DPS damage = `makeCharacter(jobKey, { level }).getStandardDamage()` where `getStandardDamage()` = `Math.floor(Math.pow(level, 2)) + level * 10` (RPGCharacter.js:139-141).
- `level` = chat/minigame level from `minigameService.findByUserId(platformId).level`; `jobKey` = `levelData.job_key`.
- Skill-one = `getSkillOneDamage()` (currently equals standard) with `cost = rpgCharacter.skillOne.cost` (10). Default attack cost = 10.
- There is NO `level*10`-only formula, NO `level*BASE_DAMAGE_PER_LEVEL`. Any milestone using those is WRONG — replace with `getStandardDamage()`.
- Enrage band multiplies the FINAL damage AND the logged contribution by 2 (`speed` col = threshold %, see §7). Apply ×2 after equipment bonuses.

## 2. Equipment bonus units (fractions, not percents)
- Applied exactly as the live code does: `damage = Math.floor(damage * (1 + atk_percent))`; `cost = Math.max(1, cost - cost_reduction)` (WorldBossController.js:535-545).
- So `atk_percent` is a FRACTION (0.5 ⇒ +50%). `support_power`/`block_power` are INTEGER people-counts.
- Enhancement: effective attribute value = `base * (1 + 0.05 * enhance_level)`, applied PER PIECE inside `getEquipmentBonuses`; cap enhance_level at 10 (full = base×1.5). For integer attrs (`support_power`/`block_power`) `Math.floor` the result.
- `getEquipmentBonuses` currently returns `{atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus}` (EquipmentService.js:107-111). It MUST be extended to also return `support_power` and `block_power`, and to apply the enhance multiplier.

## 3. Equipment Redis cache invalidation (or bonuses never refresh)
- `EquipmentService.getPlayerEquipment(userId)` caches `playerEquipment:${userId}` (userId = platform_id) with a TTL (EquipmentService.js:30-49); `getEquipmentBonuses` reads through it.
- `enhanceEquipment(...)` MUST call `await redis.del(\`playerEquipment:${userId}\`)` after persisting `enhance_level`, or combat keeps reading stale bonuses. (Mirror the existing `redis.del` at :67/:79.)

## 4. Identity boundary (the GATE — corrected, do not get this wrong)
- `world_boss_event_log.user_id` is the INTERNAL numeric `user.id` (migration 20211019095909: `table.integer("user_id")`).
- The live attack handler already holds BOTH ids: `userId` = LINE **platform_id** (used for minigame / equipment / achievement / inventory) and `id` = numeric **user.id** (written to `log.user_id`). Reuse this; do not invent new resolution.
- To get numeric `user.id` from a platform_id: query the `user` table — `mysql.first("id").from("user").where({ platform_id })`. **DO NOT** use `MinigameLevel.findByUserId(...).id` — that returns the minigame_level PK, NOT user.id (MinigameLevel.js:80 only resolves platform→user.id inside a subquery). Any draft resolving the numeric id via the minigame service is a BUG — fix it.
- `resolveUserIds` (settlement) = the EXISTING `getTopRank` JOIN pattern (WorldBossLog.js:158-161): `.join("user", "world_boss_event_log.user_id", "user.id").select("user.platform_id as userId")`. ALL three board queries (傷害 = SUM(damage); 治療 / 格擋 = SUM(contribution) WHERE role) MUST follow this pattern and return platform_id. `resolveUserIds(numericIds) ⇒ Map<numericId, platformId>`; SKIP ids with no `user` row (deleted accounts) — never mis-credit.
- Rescue-pool / shield / block Redis keys are keyed by the SAME numeric `user.id` as the log, so batch-knock (from the "recent attackers" log query), knocked-down checks, and contribution writeback all share one id space. Live personal replies start from the inbound platform_id → resolve to numeric id (user table) to check the pool. Grants convert numeric→platform_id via `resolveUserIds`.

## 5. `WorldBossEvent` model fillable (status is silently dropped otherwise)
- Current `fillable = ["world_boss_id","announcement","start_time","end_time"]`; `create()`/`update()` do `pick(attributes, fillable)` (WorldBossEvent.js:5,58,64). So `status`/`killed_at`/`settled_at` are DROPPED unless added.
- M1 MUST add `"status","killed_at","settled_at"` to `fillable`. Migration should also `defaultTo("active")` (or `"pending"`) on `status` so a create without the field is still valid.
- Stamp `settled_at`/`killed_at` via a real `WorldBossEvent.update(id, {...})` (existing `update` at :64). Do NOT use a no-op `casStatus(from==to)` purely to stamp a column.
- `casStatus(eventId, fromStatus, toStatus)` is ONLY for the atomic transition (`active→killed`, `active→expired`): implement as a conditional `UPDATE ... SET status=to WHERE id=? AND status=from`; a returned rowCount of 1 means this caller won the race (and may proceed to settle/knock), 0 means another did.

## 6. No `remain_hp` column — HP is dynamic
- There is NO `remain_hp` on `world_boss` or `world_boss_event`. Current HP = `world_boss.hp - SUM(world_boss_event_log.damage WHERE world_boss_event_id=?)`.
- Snapshot / HP% / phase must compute this from one SUM query. `hpPct = round((hp - sumDamage) / hp * 100)`. Phase = HP% vs threshold (`world_boss.speed` col). Any draft reading `event.remain_hp` is WRONG.

## 7. Repurposed dead columns (per-boss combat knobs; fallback to config defaults when 0/null)
`world_boss.attack` = enrage counter-knock chance %; `world_boss.defense` = entry-batch size N; `world_boss.speed` = enrage HP-threshold %; `world_boss.luck` = natural-recovery minutes override. `gold` stays unused (settlement numbers live in config). Read via `WorldBossConfig` with config fallback.

## 8. `destory` typo location
- The typo is `exports.destory` in `src/model/application/WorldBoss.js:62` (the boss TEMPLATE model), called by `src/handler/WorldBoss/admin.js:43`. `WorldBossEvent.js:68` is ALREADY correct (`destroy`).
- M9 fixes `WorldBoss.js` + `admin.js` ONLY. Do not touch `WorldBossEvent`.

## 9. `equipment.rarity` enum
- `enum("rarity", ["common","rare","epic","legendary"]).defaultTo("common")` (migration 20260227090000:13). Base-gear seeds MUST use `"common"` (or another listed value) — NEVER `"R"`.

## 10. M4 / M5 file ownership (resolve the collision — they share files)
- `app/src/service/WorldBossCombatService.js` is CREATED in **M4** exporting: `dpsAttack(context, { platformId, eventId, attackType })`, the internal enrage transition `_resolveHit(...)` (detects HP% threshold cross → `casStatus active→killed?` no — enrage is a phase, see note), batch-knock of recent attackers, per-attack counter knock, and a shared `_resolveNumericId(platformId)`. **M5** MODIFIES the same file, ADDING `tankBlock(...)`, `healerRevive(...)`, `healerShield(...)`. Neither re-creates the other's exports.
- `app/src/util/worldBossRedis.js` is CREATED in **M4** with pool + shield + block helpers: `addToPool(eventId, numericId, ts)`, `popOldest(eventId, k) ⇒ numericId[]`, `isKnockedDown(eventId, numericId)`, `recoverIfExpired(eventId, numericId, tMinutes) ⇒ bool`, `openBlockWindow(eventId, numericId, ttlSec)`, `consumeBlockSlot(eventId) ⇒ ownerNumericId|null`, `setShield(eventId, numericId, ttlSec)`, `consumeShield(eventId, numericId) ⇒ bool`. **M5** USES these (does not re-create).
- NOTE on phases: enrage is a PHASE derived from HP% (calm ≥ threshold, enrage < threshold) computed per resolving hit — it is NOT a status column. `status` is only pending/active/killed/expired. Kill = HP reaches 0 ⇒ `casStatus(active→killed)` + `killed_at` in the SAME trx as that final log insert.

## 11. Contribution write-on-resolve timing (who credits whom)
- Healer `healerRevive`: writes its OWN contribution = the ACTUAL `popOldest` count, immediately (effect resolves synchronously). Log row: role=healer, contribution=poppedCount.
- Tank `tankBlock`: only OPENS a Redis block window (stores owner numericId + TTL). The CREDIT is written later by the resolving hit that the block absorbs: when M4's batch-knock would knock a user but a block slot is consumed (`consumeBlockSlot` returns the tank's numericId), THAT handler writes a role=tank, contribution=1 log row for the tank. So `wb:block`/`wb:shield` MUST store `owner_user_id` (numeric) to know whom to credit.
- Healer `healerShield`: sets a shield token (owner = the protected user; but credit goes to the SHIELDING healer — store BOTH: protected numericId as the key subject, shielding healer numericId as the value). When a knock is prevented by a shield, the resolving-hit handler writes a role=healer, contribution=1 row for the shielding healer.
- All scoring reads from the log (`SUM`), never from Redis.

## 12. Lifecycle vs settlement ownership
- **M6** OWNS `app/bin/WorldBossAdvance.js` + `app/src/service/WorldBossLifecycleService.js` (`createDailyBoss()`, and the per-minute scan that finds `status='killed' AND settled_at IS NULL` and `status='active' AND end_time<now`, transitions expired via `casStatus`, and CALLS `settlement.settleEvent(eventId)`).
- **M7** OWNS `app/src/service/WorldBossSettlementService.js` (`settleEvent(eventId)` — pure reward/economy/idempotency/resolveUserIds). Lifecycle calls settlement; settlement does not schedule itself.

## 13. Inventory ledger signs
- Ledger balance = `SUM(itemAmount)`. A GRANT (materials, stones) is a POSITIVE `itemAmount` insert. A SPEND (enhance cost) is a NEGATIVE insert. Any test expecting a negative amount for a settlement grant is wrong — grants are positive.
- Stones use `increaseGodStone({userId: platformId, amount, note, trx})`. For the new enhancement-material item id, use the generic Inventory add path with a positive `itemAmount` (confirm the exact helper in the Inventory model during drafting).

## 14. Coverage-gap resolutions
- D26 `boss_top_damage` fix lives in **M7** settlement: at settlement, feed `isTopDamage = (user is 傷害榜 #1)` into `AchievementEngine.evaluate(platformId, "boss_attack", { ..., isTopDamage })`. M9 only references the bug; the actual repair is M7.
- D27 free reselect for EXISTING players: lazy default (no `world_boss_role` row ⇒ treated as `dps`, `reselect_count=0`). "One free reselect" = the first role CHANGE costs 0 when `reselect_count==0`, then increments; later changes cost 女神石. A backfill migration is OPTIONAL (lazy COALESCE on read covers correctness); if included it ONLY inserts dps rows and must NOT pre-spend the free reselect. State this explicitly — no mandatory backfill.
- D23 LIFF: snapshot carries `recentFeed` (scrolling action feed); the enrage event carries the knocked-down batch (count + small sample). Ensure M8 includes both.

## 15. Shared "support ratio" definition (used by two milestones)
- D30 dynamic enrage-pressure scaling (M5 combat) and D22 scarcity premium (M7 economy) MUST use ONE definition: `getSupportRatio(eventId)` = (# distinct users with ≥1 healer/tank energy-spending action this event) / (# distinct users with ≥1 action this event). Define once on `WorldBossLog` and consume from both. M5 scales batch-N and counter-% DOWN as this ratio → 0 (cold start); M7 scales support-board unit rewards UP as this ratio → 0 (scarcity premium).

## 16. M10 cold-start sim MUST exercise real combat math
- The Monte-Carlo gate must import and call the REAL damage function path (`getStandardDamage` at minigame level, enrage ×2, equipment atk_percent fraction) and the REAL knock/recovery/scaling parameters — not a parallel re-implementation with its own formula. Model an all-DPS server (N players × ~10 actions, default knobs + cold-start scaling) and ASSERT the daily boss HP reaches 0. Add a sanity assert that a sane boss HP is NOT trivially killed in 1-2 hits (guards against an over-weak boss). If full combat-service invocation is impractical in a sim harness, the sim must at minimum import the exact damage + enrage + scaling helpers (shared pure functions), so the number it validates is the number the game uses.

---

# Part 3 — Milestones

## Milestone M1: Data model & config foundation

**Goal:** Land all schema changes, the lifecycle fillable extension, config tunables, the two new model classes (`WorldBossRole`, `WorldBossRewardLog`), AND every new query/lifecycle helper on `WorldBossLog` / `WorldBossEvent` that every later milestone (M2–M10) consumes — pure foundation, no game logic, no commands.

**Single-owner declaration (resolves the 3-way config conflict — read first):** M1 is the **sole owner** of the entire `worldboss.*` config block AND the top-level `items` registry in `app/config/default.json`. Reviewers verified that the drafts for M2 (defensive `reselect_stone_cost`), M3 (`worldboss.enhance` + a scalar `items` block), and M4 also tried to write these same keys with **incompatible shapes** (object-vs-scalar `items`). Those config-writing steps are **deleted from M2/M3/M4** — those milestones may only *read* via `config.get(...)` / the M3 `WorldBossConfig` accessors. M1 fixes the shape once, here, and nobody else touches `worldboss.*` or `items` in `default.json`. If a later milestone needs a new tunable, it is added here in M1.

**Single-owner declaration for the MODEL layer (API LOCK §A/§E — read first):** M1 is the **sole owner of the entire model/migration layer**: it creates `WorldBossRole` + `WorldBossRewardLog`, AND adds **every** new query helper on the existing `WorldBossLog` and `WorldBossEvent` modules. The helpers locked to M1 by §E are: on `WorldBossLog` — `createWithRole`, `getRecentAttackers`, `getSupportRatio`, `getDamageRank`, `getContributionRank`, `getParticipants`, `resolveUserIds`; on `WorldBossEvent` — `getActive`, `getKilledUnsettled`, `getOverdueActive`, `casStatus`, `findRaw`, `markSettled`. **Every later milestone CALLS these — none re-defines them.** Combat (M4/M5), lifecycle (M6), and settlement (M7) all import these exact names; M1 does NOT implement any combat/lifecycle/settlement *logic* here — only the model methods that those services orchestrate.

**Equipment-attribute unit convention (pin it now — downstream blocker; per addendum §2):** Verified against the live code at `WorldBossController.js:535-545`: `damage = Math.floor(damage * (1 + atk_percent))` and `cost = Math.max(1, cost - cost_reduction)`. So `atk_percent` is a **FRACTION** (`0.5` ⇒ +50%, `0.05` ⇒ +5%), NOT a percent integer. `support_power`/`block_power` are INTEGER people-counts. M1 does not seed gear, but as config owner it records this so M2's base-gear seeder, M4's `getEquipmentBonuses` (which M4 extends to also return `support_power`/`block_power` and to apply the per-piece enhance multiplier `base * (1 + 0.05 * enhance_level)`, capped at `enhance_level <= 10`), and the combat service all agree: **equipment attribute fractions are stored as decimals; no `/100` anywhere.** A reviewer rejects any M2/M4 seed that stores `atk_percent: 5` or applies `/100`.

**Identity-boundary convention M1 OWNS the helpers for (API LOCK §B, supersedes addendum §4):** `world_boss_event_log.user_id` is the INTERNAL numeric `user.id` (migration `20211019095909`: `table.integer("user_id")`). The rescue pool / shield / block Redis key space is `platform_id` (LOCK §B — this CORRECTS addendum §4, which said numeric; the pool is platform-keyed). The LOG stays numeric. The bridge between the two id spaces is owned entirely by M1's helpers: `getRecentAttackers` and the three rank helpers (`getDamageRank`/`getContributionRank`/`getParticipants`) JOIN `user` and return **BOTH** `user_id` (numeric) and `platform_id` (string) on every row, so the enrage batch can ZADD `platform_id` into the pool while any contribution writeback row uses the numeric `user_id`; `resolveUserIds(numericIds)` returns `Map<numericId, platformId>`, skipping ids with no `user` row (never mis-credit). Numeric resolution from a platform_id is `UserModel.getId(platformId)` (verified `UserModel.js:8-11`, returns numeric `user.id` or `null`) — there is NO `MinigameLevel`-based resolution and NO `_resolveNumericId`.

**Read before starting (real files, do not skim):**
- `app/src/model/application/JankenDailyRewardLog.js` (verified: `tryInsert` = `const db = trx || mysql; try { insert } catch ER_DUP_ENTRY → false; throw`) + its test `app/src/model/application/__tests__/JankenDailyRewardLog.test.js` (verified: `dotenv` → `jest.unmock("../../../util/mysql")` → `jest.requireActual` → `beforeEach delete` → `afterAll mysql.destroy()`).
- `app/src/model/base.js` — the `Base` class new models extend (`new Model({ table, fillable })` gives `first({filter})`/`create`/`update`; `create` uses `lodash.pick(attributes, this.fillable)`; `update(id, attrs, { pk })` accepts a pk override).
- `app/src/model/application/WorldBossLog.js` — verified: `class WorldBossLog extends base` is exported as `exports.model`, alongside PLAIN `exports.*` functions that `require("../../util/mysql")` directly. `exports.create` (lines 113-122) does `pick(attributes, ["user_id","world_boss_event_id","action_type","damage","cost"])` — it does NOT include `role`/`contribution`, so M1 adds a separate `createWithRole`. `exports.getTopRank` (lines 156-164) is the canonical JOIN pattern: `.join("user", "world_boss_event_log.user_id", "user.id")` projecting `user.platform_id as userId`. `exports.getTotalDamageByEventId` (lines 146-151) returns `{ total_damage }` (the HP-read combat uses).
- `app/src/model/application/WorldBossEvent.js` — verified: a PLAIN exports object (NOT a `Base` subclass). Module-level `fillable = ["world_boss_id","announcement","start_time","end_time"]` (line 5) is used by `create` (line 59) and `update` (line 64) via `pick(attributes, fillable)`. `find` (line 44) INNER-JOINs `world_boss` (`worldBoss(query)`), so it CANNOT read an orphan event — that is why §E adds a join-free `findRaw`. `destroy` (line 68) is ALREADY correct (the `destory` typo lives in `WorldBoss.js`, M9 owns that fix — do NOT touch it here).
- `app/src/model/application/UserModel.js` — verified `exports.getId = async platformId => rows.length ? rows[0].id : null` (lines 8-11). This is the ONLY numeric-id resolver; helpers that need numeric→platform_id JOIN `user` inline.
- `app/src/util/mysql.js` — the shared Knex instance (`mysql2`, db `Princess`); `mysql.raw(...)`, `mysql.transaction()`, `mysql(table)` all available.
- `app/migrations/20211019082811_create_world_boss_event.js`, `20211019095909_create_world_boss_event_log.js` (confirms `user_id` is `table.integer` = numeric `user.id`), `20240904042536_add_cost_column_to_world_boss_event_log_table.js`, `20260501221854_create_janken_daily_reward_log.js` — migration style (`knex.schema.createTable` / `.table(...)`; symmetric `down`).
- `app/config/default.json` — verified: `999` is the goddess-stone item id (two `"itemId": 999` entries at lines 172/176); NO top-level `items` key exists yet; the existing `worldboss` block has ONLY `daily_limit/penalty_rate/money_revoke_attack_cost/revoke_charm/manual` (lines 27-40).

**Inherited global constraints (a reviewer rejects on any violation):** migrations created ONLY via `cd app && yarn knex migrate:make <name>` then edit the generated file — never hand-author a timestamp. Backend is CommonJS. ESLint: double quotes, es5 trailing commas, 100-char width. Jest `transform:{}` → place every `jest.mock(...)` BEFORE the `require()` of the mocked module. Branch `feat/worldboss-redesign`, never main. Money item is `GODDESS_STONE_ITEM_ID = 999`. NO LINE Push API / NO background tick (irrelevant to M1, but introduce no timers/push hooks).

**Database prerequisite (resolves the test-reproducibility finding):** Tasks 1–12 require **local infra running**: `make infra` (MySQL on `localhost:3306`, from repo root) must be up, and root `.env` must have `DB_HOST/DB_PORT/DB_USER/DB_USER_PASSWORD` populated (the same vars `app/src/util/mysql.js` and `knexfile.js` read). The real-DB model tests (Tasks 7–9, 11–12) follow the verified `JankenDailyRewardLog.test.js` pattern but ADD an explicit **DB-availability guard**: if a connection can't be opened, the suite emits a clear skip message instead of throwing an opaque `ECONNREFUSED`. This keeps suites self-documenting in a CI box without infra, while still exercising the real SQL / unique-key / `ER_DUP_ENTRY` behavior when infra IS up (a pure mock can't prove the DB JOIN/constraint fires). The migration smoke (Task 13) is likewise gated on `make infra`; it is the explicitly-manual integration step.

**Migration ordering note:** `yarn knex migrate:make` stamps each file with the current second. Create the five migrations **in the order listed in Tasks 1–5** (a few seconds apart) so timestamps sort the same way they appear here. The alter-tables run after their base tables already exist (old migrations), so ordering among the M1 files matters only for reproducibility, not correctness.

---

### Task 1 — Migration: `world_boss_event` lifecycle columns (D25)

**Files:**
- Create (via generator): `app/migrations/<ts>_alter_world_boss_event_add_lifecycle.js`
- No test (pure DDL; verified by `yarn migrate` running clean + Tasks 7/12/13 reading the columns).

**Interfaces:**
- Produces (for M1 `WorldBossEvent.getActive/getKilledUnsettled/getOverdueActive/casStatus/markSettled` in Task 12, M6 lifecycle, M7 settlement): columns `status` enum(`pending`,`active`,`killed`,`expired`) notNullable default `active`; `killed_at` datetime nullable; `settled_at` datetime nullable; indexes `idx_wbe_status_settled`, `idx_wbe_status_end`. The `defaultTo("active")` (addendum §5) guarantees a `create()` without `status` is still valid.
- Consumes: nothing.

**Prerequisite:** `make infra` running.

Steps:

- [ ] **Step 1: Generate the migration file.** Run `cd app && yarn knex migrate:make alter_world_boss_event_add_lifecycle`. This prints the generated path `app/migrations/<ts>_alter_world_boss_event_add_lifecycle.js`. Open that exact file (do not rename it).

- [ ] **Step 2: Write `up`/`down` into the generated file.** Replace the stub body with:

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.table("world_boss_event", table => {
    table
      .enu("status", ["pending", "active", "killed", "expired"])
      .notNullable()
      .defaultTo("active")
      .comment("生命週期狀態");
    table.datetime("killed_at").nullable().comment("被擊殺時間");
    table.datetime("settled_at").nullable().comment("結算完成時間");
    table.index(["status", "settled_at"], "idx_wbe_status_settled");
    table.index(["status", "end_time"], "idx_wbe_status_end");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.table("world_boss_event", table => {
    table.dropIndex(["status", "settled_at"], "idx_wbe_status_settled");
    table.dropIndex(["status", "end_time"], "idx_wbe_status_end");
    table.dropColumn("status");
    table.dropColumn("killed_at");
    table.dropColumn("settled_at");
  });
};
```

- [ ] **Step 3: Run the migration up.** `cd app && yarn migrate`. Expect: a line `Batch N run: 1 migrations` naming this file, exit code 0. (Legacy in-flight `world_boss_event` rows default to `status='active'` — intentional per the contract; cron expires those past `end_time` later.) If this errors with `ECONNREFUSED` / `ER_ACCESS_DENIED`, infra is not up — run `make infra` from the repo root first.

- [ ] **Step 4: Verify rollback is symmetric, then re-apply.** `cd app && yarn knex migrate:rollback` (expect it names this file, exit 0), then `cd app && yarn migrate` again (expect it re-runs clean). This proves `down` works before you commit. If rollback errors on the index drop, fix the index names to match `up` exactly.

- [ ] **Step 5: Commit.**

```bash
git add app/migrations/*_alter_world_boss_event_add_lifecycle.js
git commit -m "feat(worldboss): add lifecycle columns to world_boss_event (D25)"
```

---

### Task 2 — Migration: `world_boss_event_log` role + contribution + indexes (D27)

**Files:**
- Create (via generator): `app/migrations/<ts>_alter_world_boss_event_log_add_role_contribution.js`
- No test (pure DDL).

**Interfaces:**
- Produces (for M1 `WorldBossLog.createWithRole`/`getContributionRank`/`getRecentAttackers`/`getSupportRatio` in Task 11, M5 contribution writes, M7 board aggregation): columns `role` enum(`dps`,`healer`,`tank`) notNullable default `dps`; `contribution` int notNullable default 0; indexes `idx_wbel_event`, `idx_wbel_event_user`, `idx_wbel_event_role`, `idx_wbel_event_created`, `idx_wbel_user_created`.
- Consumes: nothing. The base `world_boss_event_log` table and its existing `damage`/`cost`/`user_id` columns already exist. **`user_id` here is the INTERNAL numeric `user.id`** (verified `table.integer("user_id")`, migration `20211019095909`) — Task 11's helpers `GROUP BY` this numeric column, then JOIN `user` to project BOTH `user_id` (numeric) AND `user.platform_id` (LOCK §B); `idx_wbel_event_user` covers that grouping.

**Prerequisite:** `make infra` running.

Steps:

- [ ] **Step 1: Generate the file.** `cd app && yarn knex migrate:make alter_world_boss_event_log_add_role_contribution`. Open the generated `app/migrations/<ts>_alter_world_boss_event_log_add_role_contribution.js`.

- [ ] **Step 2: Write `up`/`down`.** Replace the stub:

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.table("world_boss_event_log", table => {
    table
      .enu("role", ["dps", "healer", "tank"])
      .notNullable()
      .defaultTo("dps")
      .comment("行動當下的職業 (D27)");
    table.integer("contribution").notNullable().defaultTo(0).comment("該職業榜貢獻分");
    table.index(["world_boss_event_id"], "idx_wbel_event");
    table.index(["world_boss_event_id", "user_id"], "idx_wbel_event_user");
    table.index(["world_boss_event_id", "role"], "idx_wbel_event_role");
    table.index(["world_boss_event_id", "created_at"], "idx_wbel_event_created");
    table.index(["user_id", "created_at"], "idx_wbel_user_created");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.table("world_boss_event_log", table => {
    table.dropIndex(["world_boss_event_id"], "idx_wbel_event");
    table.dropIndex(["world_boss_event_id", "user_id"], "idx_wbel_event_user");
    table.dropIndex(["world_boss_event_id", "role"], "idx_wbel_event_role");
    table.dropIndex(["world_boss_event_id", "created_at"], "idx_wbel_event_created");
    table.dropIndex(["user_id", "created_at"], "idx_wbel_user_created");
    table.dropColumn("role");
    table.dropColumn("contribution");
  });
};
```

> Note for downstream drafters (per addendum §1, §6, §10): `damage` stays meaning ONLY damage to the boss (drives the dynamic HP — there is NO `remain_hp` column; current HP = `world_boss.hp - SUM(damage WHERE world_boss_event_id=?)`, read via the existing `getTotalDamageByEventId`). `contribution` is the per-role board score. Enrage is a PHASE derived from HP% (calm ≥ threshold, enrage < threshold), NOT a status column; on an enraged hit M5 multiplies BOTH `damage` (DPS) and `contribution` by 2 at write time (addendum §1, §10). The `idx_wbel_event_user` index covers Task 11's `GROUP BY user_id` ranking (numeric id); those helpers JOIN `user` and return BOTH ids per LOCK §B — M1 owns both the columns/indexes AND the SELECT shape.

- [ ] **Step 3: Run up.** `cd app && yarn migrate` → expect this file in `Batch N run: 1 migrations`, exit 0.

- [ ] **Step 4: Rollback + re-apply.** `cd app && yarn knex migrate:rollback` then `cd app && yarn migrate`. Expect both exit 0.

- [ ] **Step 5: Commit.**

```bash
git add app/migrations/*_alter_world_boss_event_log_add_role_contribution.js
git commit -m "feat(worldboss): add role + contribution to event_log with 5 indexes (D27)"
```

---

### Task 3 — Migration: `player_equipment.enhance_level` (D8/D9)

**Files:**
- Create (via generator): `app/migrations/<ts>_add_enhance_level_to_player_equipment.js`
- No test (pure DDL).

**Interfaces:**
- Produces (for M4 `EquipmentService.getEquipmentBonuses` enhance math + `PlayerEquipment.setEnhanceLevel`): column `enhance_level int notNullable default 0`. The enhance multiplier M4 applies PER PIECE is `base * (1 + 0.05 * enhance_level)`, capped at `enhance_level <= 10` (full = base×1.5), over the fraction-stored attributes; for integer attrs (`support_power`/`block_power`) M4 `Math.floor`s the result (addendum §2). After persisting a new `enhance_level`, M4's `enhanceEquipment` MUST `redis.del(\`playerEquipment:${userId}\`)` (addendum §3) or combat reads stale bonuses — M1 only adds the column.
- Consumes: nothing (`player_equipment` table pre-exists).

**Prerequisite:** `make infra` running.

Steps:

- [ ] **Step 1: Confirm the target table exists.** `cd app && grep -rln "player_equipment" migrations/`. Expect at least one create migration. If the table name differs, STOP and reconcile with the contract before generating (the contract locks the name `player_equipment`).

- [ ] **Step 2: Generate the file.** `cd app && yarn knex migrate:make add_enhance_level_to_player_equipment`. Open the generated file.

- [ ] **Step 3: Write `up`/`down`.**

```js
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("player_equipment", table => {
    table.integer("enhance_level").notNullable().defaultTo(0).comment("強化等級 0-10 (D9)");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("player_equipment", table => {
    table.dropColumn("enhance_level");
  });
};
```

- [ ] **Step 4: Run up, rollback, re-apply.** `cd app && yarn migrate` → exit 0; `cd app && yarn knex migrate:rollback` → exit 0; `cd app && yarn migrate` → exit 0.

- [ ] **Step 5: Commit.**

```bash
git add app/migrations/*_add_enhance_level_to_player_equipment.js
git commit -m "feat(worldboss): add enhance_level to player_equipment (D9)"
```

---

### Task 4 — Migration: create `world_boss_role` table (D27)

**Files:**
- Create (via generator): `app/migrations/<ts>_create_world_boss_role.js`
- No test (pure DDL; the model in Task 8 is tested).

**Interfaces:**
- Produces (for M2 `WorldBossRole` model + `WorldBossRoleService`): table `world_boss_role` with PK `user_id` (LINE platform_id string, len 33), `role` enum(`dps`,`healer`,`tank`), `chosen_at` timestamp, `reselect_count` int notNullable default 0.
- Consumes: nothing.

> D27 reselect semantics (addendum §14 — for M2, recorded here so the column meaning is unambiguous): EXISTING players with no `world_boss_role` row are treated lazily as `dps` with `reselect_count=0`. "One free reselect" = the first role CHANGE costs 0 when `reselect_count==0`, then increments; later changes cost 女神石 (`worldboss.reselect_stone_cost`). A backfill migration is OPTIONAL — lazy COALESCE-on-read in `WorldBossRoleService.getRole` already covers correctness; if M2 includes one it ONLY inserts `dps` rows and must NOT pre-spend the free reselect (`reselect_count` stays 0). M1 ships NO backfill; `defaultTo(0)` here is what makes the lazy path correct.

**Prerequisite:** `make infra` running.

Steps:

- [ ] **Step 1: Generate the file.** `cd app && yarn knex migrate:make create_world_boss_role`. Open the generated file.

- [ ] **Step 2: Write `up`/`down`.** PK is the string `user_id` (platform_id), matching the contract — role gating happens at the LINE layer where platform_id is known:

```js
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("world_boss_role", table => {
    table.string("user_id", 33).notNullable().primary().comment("LINE platform_id");
    table.enu("role", ["dps", "healer", "tank"]).notNullable();
    table.timestamp("chosen_at").defaultTo(knex.fn.now());
    table.integer("reselect_count").notNullable().defaultTo(0).comment("0 = 仍有免費重選");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("world_boss_role");
};
```

- [ ] **Step 3: Run up, rollback, re-apply.** `cd app && yarn migrate`; `cd app && yarn knex migrate:rollback`; `cd app && yarn migrate`. All exit 0.

- [ ] **Step 4: Commit.**

```bash
git add app/migrations/*_create_world_boss_role.js
git commit -m "feat(worldboss): create world_boss_role table (D27)"
```

---

### Task 5 — Migration: create `world_boss_reward_log` table (idempotent)

**Files:**
- Create (via generator): `app/migrations/<ts>_create_world_boss_reward_log.js`
- No test here (the model `tryInsert` is tested in Task 9).

**Interfaces:**
- Produces (for M3 `WorldBossRewardLog.tryInsert`, M7 settlement, M8 report card): table `world_boss_reward_log` keyed on platform_id, with UNIQUE `(user_id, world_boss_event_id)` named `uniq_wbrl_user_event` (this unique key is what makes `tryInsert` idempotent via `ER_DUP_ENTRY`). `materials`/`stones` columns hold POSITIVE grant amounts only (the ledger sign convention — addendum §13 — lives in M7's Inventory inserts, not here: a grant is a POSITIVE `itemAmount`, a spend is NEGATIVE; this log records the granted magnitudes).
- Consumes: nothing.

**Prerequisite:** `make infra` running.

Steps:

- [ ] **Step 1: Generate the file.** `cd app && yarn knex migrate:make create_world_boss_reward_log`. Open the generated file.

- [ ] **Step 2: Write `up`/`down`.** Mirror `janken_daily_reward_log`'s shape (string `user_id` len 33, `increments` PK, unique key, `created_at` default now):

```js
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("world_boss_reward_log", table => {
    table.increments("id").unsigned().primary();
    table.string("user_id", 33).notNullable().comment("platform_id (發放身分)");
    table.integer("world_boss_event_id").notNullable();
    table.integer("materials").notNullable().defaultTo(0).comment("強化素材數量");
    table.integer("stones").notNullable().defaultTo(0).comment("女神石數量");
    table.enu("board", ["dps", "healer", "tank", "none"]).notNullable().defaultTo("none");
    table.integer("rank").nullable().comment("null = 純參與 / 逾時");
    table.boolean("is_mvp").notNullable().defaultTo(false);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.unique(["user_id", "world_boss_event_id"], "uniq_wbrl_user_event");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("world_boss_reward_log");
};
```

- [ ] **Step 3: Run up, rollback, re-apply.** `cd app && yarn migrate`; `cd app && yarn knex migrate:rollback`; `cd app && yarn migrate`. All exit 0.

- [ ] **Step 4: Commit.**

```bash
git add app/migrations/*_create_world_boss_reward_log.js
git commit -m "feat(worldboss): create idempotent world_boss_reward_log table"
```

---

### Task 6 — Config: SOLE-OWNER `worldboss.*` tunables + `items` registry (D22/D25)

> **Single-owner gate (reviewer-enforced):** This task is the ONLY place in the whole feature where `worldboss.*` and the top-level `items` block are written into `app/config/default.json`. M2, M3, and M4 were each independently drafting overlapping keys (`reselect_stone_cost`, `worldboss.enhance`, and two incompatible `items` shapes — object vs scalar). All of those config-writing steps are removed from M2/M3/M4; they only `config.get(...)`. If you (the M1 drafter) find a key a later milestone needs, it goes HERE.

**Files:**
- Modify: `app/config/default.json` — MERGE new keys into the existing `"worldboss"` block (currently `daily_limit/penalty_rate/money_revoke_attack_cost/revoke_charm/manual`, lines 27-40) and add ONE top-level `"items"` block.
- No standalone JS test; Task 13 Step 4 re-verifies the merged shape parses. M3's `WorldBossConfig` accessor (out of M1 scope) reads these.

**Interfaces:**
- Produces (for M3 `WorldBossConfig` accessors, M4 enhance math, M5 combat knobs, M6 rotation `boss_pool`/`open_hour`, M7 reward amounts, M10 cold-start sim): all `worldboss.*` tunables below + the `items` registry naming `goddess_stone` (999) and `enhancement_material` (1001), in ONE fixed shape. `GODDESS_STONE_ITEM_ID = 999` is already the convention in this file (verified: two `"itemId": 999` entries) — `worldboss.stone_item_id` re-states it canonically; `worldboss.enhancement_material_item_id = 1001` is new.
- Consumes: nothing.

> Important: `default.json` is strict JSON (no comments). Do NOT paste `jsonc` comments. Keep the EXISTING `worldboss` keys — merge, don't replace. `daily_limit` already exists as `100` (matches the contract); leave it.

Steps:

- [ ] **Step 1: Confirm `1001` is unused.** `cd app && grep -rn "\b1001\b" config/ src/`. Expect no item-id hit (verified empty at audit time). If `1001` is already a registered item id, STOP, pick the next free id, and note the change back to the contract owner so the single-owner registry stays authoritative.

- [ ] **Step 2: Merge the new sibling keys into the existing `worldboss` block.** In `app/config/default.json`, the block currently reads (lines 27-40):

```json
  "worldboss": {
    "daily_limit": 100,
    "penalty_rate": 0.1,
    "money_revoke_attack_cost": 10000,
    "revoke_charm": "隱匿於夜之黑暗，撫慰心靈的爆裂之炎，吾以幻夢之名，呼喚初晨的重生，在夢幻之境、遺落之地，引領破碎時光的歸來吧。",
    "manual": [ ... ]
  },
```

Add these sibling keys inside the SAME object (keep every existing key untouched):

```json
    "normal_attack_cost": 10,
    "enrage_threshold_pct": 35,
    "enrage_batch_size": 20,
    "enrage_recent_minutes": 10,
    "enrage_counter_rate": 0.15,
    "enrage_damage_multiplier": 2,
    "enrage_contribution_multiplier": 2,
    "natural_recovery_minutes": 15,
    "revive_count_k": 2,
    "shield_count_k": 2,
    "block_window_minutes": 5,
    "reselect_stone_cost": 5000,
    "enhance": { "max_level": 10, "per_level_pct": 0.05, "cost_base": 8 },
    "reward": {
      "participation": 15,
      "expired_participation": 5,
      "rank_bands": { "p1": 50, "p5": 35, "p20": 20, "rest": 8 },
      "mvp_stones": 30
    },
    "open_hour": 4,
    "boss_pool": [],
    "stone_item_id": 999,
    "enhancement_material_item_id": 1001
```

> Notes for downstream drafters (all of these keys are now owned here — do not re-add them in M2/M3/M4):
> - `reselect_stone_cost: 5000` — M2's `WorldBossRoleService.reselectRole` READS this (must NOT re-add the key; the M2 draft that did is rejected).
> - `enhance.per_level_pct: 0.05` / `enhance.max_level: 10` — M4's `getEquipmentBonuses` READS these for the PER-PIECE multiplier `base * (1 + per_level_pct * enhance_level)`, capped at `enhance_level <= 10` (full = base×1.5); combined with the fraction-stored attribute convention (header note) a +5%-`atk_percent` item at +0 = `0.05`, at +10 = `0.05 * 1.5 = 0.075` (addendum §2). M3 must NOT re-add a `worldboss.enhance` block.
> - `enhance.cost_base: 8` — enhance cost is `cost(L) = L * cost_base` to go from level `L-1`→`L` (+1 costs 8 … +10 costs 80; one item to full = 440 materials). M4 reads this; M1 only owns the value.
> - `enrage_*` / `revive_count_k` / `shield_count_k` / `block_window_minutes` / `natural_recovery_minutes` — M5 combat + M10 sim read these; per addendum §7 the boss-row dead columns (`attack`=counter-rate %, `defense`=batch size N, `speed`=enrage HP-threshold %, `luck`=recovery-minutes override) OVERRIDE these defaults per boss when non-zero, read via M3's `WorldBossConfig`. `gold` stays unused.
> - `open_hour: 4` / `boss_pool: []` — M6's `createDailyBoss` reads `config.get("worldboss.boss_pool")` and `config.get("worldboss.open_hour")` (LOCK §G). `boss_pool` is intentionally empty `[]` here; M7's `WorldBossScheduleSeeder` (or a deploy seed) fills it with real `world_boss` template ids. Leaving it `[]` lets M3's accessor and M10's sim default-handle it.
> - `stone_item_id`/`enhancement_material_item_id` are the canonical ids the contract names `GODDESS_STONE_ITEM_ID`/`ENHANCEMENT_MATERIAL_ITEM_ID`; M3 re-exports them from `WorldBossConfig` (reading these keys, not redefining them).

- [ ] **Step 3: Add the ONE canonical top-level `items` block.** This repo tracks money as item `999` but has no central JSON item registry. Add a single top-level `"items"` block (place it after the `worldboss` block) so all milestones agree on ids/meta (D22). **Use exactly this object shape — `{ itemId, name }` per item — and no other.** (Reviewers found a competing draft that wrote `items: { goddess_stone: 999 }` as a scalar; that shape is rejected. The object shape wins so accessors can read both `.itemId` and `.name`.)

```json
  "items": {
    "goddess_stone": { "itemId": 999, "name": "女神石" },
    "enhancement_material": { "itemId": 1001, "name": "強化素材" }
  },
```

> The actual item-row insertion into whatever item-master table the Inventory system uses is OWNED by M3/M4 seeds — M1 only records the id + meta in config so all milestones agree on `1001`. Do NOT write item-master rows in M1.

- [ ] **Step 4: Validate the JSON parses and the canonical keys resolve.** `cd app && node -e "const c=require('config'); console.log(c.get('worldboss.enhance.cost_base'), c.get('worldboss.enhance.per_level_pct'), c.get('worldboss.reward.rank_bands.p1'), c.get('worldboss.reselect_stone_cost'), c.get('worldboss.open_hour'), c.get('items.goddess_stone.itemId'), c.get('items.enhancement_material.itemId'), c.get('worldboss.daily_limit'))"`. Expect output: `8 0.05 50 5000 4 999 1001 100`. A JSON syntax error throws here and exits non-zero — fix the trailing comma / brace before continuing.

- [ ] **Step 5: Commit.**

```bash
git add app/config/default.json
git commit -m "feat(worldboss): own worldboss tunables + items registry (stone 999 / material 1001) (D22/D25)"
```

---

### Task 7 — Model: extend `WorldBossEvent` fillable with lifecycle columns (addendum §5 — BLOCKER)

> **Why this task exists (addendum §5):** `WorldBossEvent.js` is a plain exports module whose `create` (line 59) and `update` (line 64) both do `pick(attributes, fillable)` against the module-level `fillable = ["world_boss_id","announcement","start_time","end_time"]` (line 5). The lifecycle columns added in Task 1 (`status`/`killed_at`/`settled_at`) are therefore **silently dropped** on any `create`/`update` until they are in `fillable`. The Task 12 lifecycle helpers (`casStatus`/`markSettled`) and M6/M7 stamp `settled_at`/`killed_at` via the model, so this extension is a hard prerequisite. M1 owns it because M1 owns the schema AND the lifecycle helpers (Task 12). M1 ONLY widens `fillable` here — Task 12 adds the helper methods; this task adds no methods and does not touch the existing `create`/`update`/`destroy` bodies (the `destory` typo is in `WorldBoss.js`, not this file — addendum §8).

**Files:**
- Modify: `app/src/model/application/WorldBossEvent.js` — line 5 `fillable` array only.
- Create test: `app/src/model/application/__tests__/WorldBossEvent.test.js`

**Interfaces:**
- Consumes (from Task 1): columns `status`/`killed_at`/`settled_at` on `world_boss_event`; `world_boss_id`/`start_time`/`end_time` already exist; `status` `defaultTo("active")` (so a `create` omitting `status` is valid).
- Consumes (existing): `exports.create(attributes)` and `exports.update(id, attributes)` (both `pick(attributes, fillable)`).
- Produces (for Task 12 `casStatus` extra-stamping + M7 `settleEvent` `settled_at` stamp): `WorldBossEvent.create`/`update` now persist `status`, `killed_at`, `settled_at`.

**Prerequisite:** `make infra` running (real-DB test). Strict TDD — write the failing test first.

- [ ] **Step 1: Write the FULL failing test.** Create `app/src/model/application/__tests__/WorldBossEvent.test.js`. Real-DB pattern (dotenv → unmock mysql → requireActual), with the connectivity guard. The test seeds a `world_boss` template row first and reads back the persisted columns with a direct `mysql` query. `jest.unmock` MUST precede the model `require`:

```js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossEvent = require("../WorldBossEvent");

let dbUp = true;
let bossId;

describe("WorldBossEvent lifecycle fillable", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      // eslint-disable-next-line no-console
      console.warn(
        'SKIP: WorldBossEvent tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_event").delete();
    await mysql("world_boss").where({ name: "T-WBE" }).delete();
    [bossId] = await mysql("world_boss").insert({ name: "T-WBE", hp: 1000 });
  });

  afterAll(() => mysql.destroy());

  test("create without status defaults to active (column default)", async () => {
    if (!dbUp) return;
    await WorldBossEvent.create({
      world_boss_id: bossId,
      announcement: "x",
      start_time: "2026-06-20 00:00:00",
      end_time: "2026-06-21 00:00:00",
    });
    const row = await mysql("world_boss_event").where({ world_boss_id: bossId }).first();
    expect(row.status).toBe("active");
    expect(row.killed_at).toBeNull();
    expect(row.settled_at).toBeNull();
  });

  test("create persists status when provided (no longer dropped by pick)", async () => {
    if (!dbUp) return;
    await WorldBossEvent.create({
      world_boss_id: bossId,
      announcement: "x",
      start_time: "2026-06-20 00:00:00",
      end_time: "2026-06-21 00:00:00",
      status: "pending",
    });
    const row = await mysql("world_boss_event").where({ world_boss_id: bossId }).first();
    expect(row.status).toBe("pending");
  });

  test("update stamps killed_at + settled_at + status (the M6/M7 stamp path)", async () => {
    if (!dbUp) return;
    await WorldBossEvent.create({
      world_boss_id: bossId,
      announcement: "x",
      start_time: "2026-06-20 00:00:00",
      end_time: "2026-06-21 00:00:00",
    });
    const created = await mysql("world_boss_event").where({ world_boss_id: bossId }).first();
    await WorldBossEvent.update(created.id, {
      status: "killed",
      killed_at: "2026-06-20 10:00:00",
      settled_at: "2026-06-20 10:01:00",
    });
    const row = await mysql("world_boss_event").where({ id: created.id }).first();
    expect(row.status).toBe("killed");
    expect(row.killed_at).not.toBeNull();
    expect(row.settled_at).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** `cd app && yarn test -- src/model/application/__tests__/WorldBossEvent.test.js`. Expect FAIL on at least the second and third tests: `status`/`killed_at`/`settled_at` come back `null`/`active` (not the provided values) because `pick(attributes, fillable)` drops them while `fillable` still excludes them. This is the red state proving the addendum-§5 blocker. (A SKIP warning with 0 assertions means infra is down — run `make infra`.)

- [ ] **Step 3: Minimal impl — widen `fillable` only.** In `app/src/model/application/WorldBossEvent.js`, line 5, change:

```js
const fillable = ["world_boss_id", "announcement", "start_time", "end_time"];
```

to:

```js
const fillable = [
  "world_boss_id",
  "announcement",
  "start_time",
  "end_time",
  "status",
  "killed_at",
  "settled_at",
];
```

Do not touch `create`/`update`/`destroy`/`find`/`all` — they already `pick(attributes, fillable)`, so widening the array is the entire fix.

- [ ] **Step 4: Run the test and confirm it PASSES.** `cd app && yarn test -- src/model/application/__tests__/WorldBossEvent.test.js`. Expect: 3 passing, exit 0. If the third test still shows `killed_at` null, confirm the array edit landed on line 5 and that you did not accidentally edit a second `fillable` (there is only one).

- [ ] **Step 5: Lint, then commit.** `cd app && yarn lint -- src/model/application/WorldBossEvent.js src/model/application/__tests__/WorldBossEvent.test.js` (expect 0 errors).

```bash
git add app/src/model/application/WorldBossEvent.js \
        app/src/model/application/__tests__/WorldBossEvent.test.js
git commit -m "fix(worldboss): add status/killed_at/settled_at to WorldBossEvent fillable (addendum §5)"
```

---

### Task 8 — Model: `WorldBossRole` (CRUD over `world_boss_role`)

**Files:**
- Create: `app/src/model/application/WorldBossRole.js`
- Create test: `app/src/model/application/__tests__/WorldBossRole.test.js`

**Interfaces:**
- Consumes (from Task 4): table `world_boss_role` (PK string `user_id`).
- Consumes (from `app/src/model/base.js`): `Base` class — `new Model({table, fillable})` gives `first({filter})`, `create(attrs)`, `update(id, attrs, {pk})`.
- Produces (for M2 `WorldBossRoleService`): exactly these exports (contract-locked names):
  - `exports.model` — the `WorldBossRole` instance.
  - `exports.find = (userId) => Promise<row|undefined>` — by platform_id.
  - `exports.create = (attrs) => Promise<insertId>`.
  - `exports.update = (userId, attrs) => Promise<affectedRows>` — `{ pk: "user_id" }`.

**Prerequisite:** `make infra` running (real-DB test). Strict TDD — write the failing test first.

- [ ] **Step 1: Write the FULL failing test.** Create `app/src/model/application/__tests__/WorldBossRole.test.js`. Same real-DB pattern as `JankenDailyRewardLog.test.js` (dotenv → unmock mysql → requireActual), PLUS a connectivity guard so the suite skips with a clear message when infra is down instead of throwing `ECONNREFUSED`. `jest.unmock` MUST precede the `require` of the model (jest is not hoisted here):

```js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossRole = require("../WorldBossRole");

let dbUp = true;

describe("WorldBossRole model", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      // eslint-disable-next-line no-console
      console.warn(
        'SKIP: WorldBossRole model tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_role").delete();
  });

  afterAll(() => mysql.destroy());

  test("create then find returns the row by platform_id", async () => {
    if (!dbUp) return;
    await WorldBossRole.create({ user_id: "Urole1", role: "tank", reselect_count: 0 });
    const row = await WorldBossRole.find("Urole1");
    expect(row.role).toBe("tank");
    expect(row.reselect_count).toBe(0);
  });

  test("find returns undefined when absent", async () => {
    if (!dbUp) return;
    const row = await WorldBossRole.find("Umissing");
    expect(row).toBeUndefined();
  });

  test("update changes role + reselect_count keyed on user_id", async () => {
    if (!dbUp) return;
    await WorldBossRole.create({ user_id: "Urole2", role: "dps", reselect_count: 0 });
    await WorldBossRole.update("Urole2", { role: "healer", reselect_count: 1 });
    const row = await WorldBossRole.find("Urole2");
    expect(row.role).toBe("healer");
    expect(row.reselect_count).toBe(1);
  });

  test("create only persists fillable fields", async () => {
    if (!dbUp) return;
    await WorldBossRole.create({ user_id: "Urole3", role: "dps", bogus: "x" });
    const row = await WorldBossRole.find("Urole3");
    expect(row.role).toBe("dps");
    expect(row.bogus).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** `cd app && yarn test -- src/model/application/__tests__/WorldBossRole.test.js`. Expect FAIL: `Cannot find module '../WorldBossRole'` (file does not exist yet). This is the red state. (If you instead see the SKIP warning and 0 assertions, infra is down — run `make infra` so the test actually exercises the DB.)

- [ ] **Step 3: Write the FULL model.** Create `app/src/model/application/WorldBossRole.js`. It extends `base.js` and re-exports the contract-locked thin functions over it:

```js
const TABLE = "world_boss_role";
const base = require("../base");

class WorldBossRole extends base {}

const model = new WorldBossRole({
  table: TABLE,
  fillable: ["user_id", "role", "chosen_at", "reselect_count"],
});

exports.table = TABLE;
exports.model = model;

/**
 * 依 platform_id 取得職業設定
 * @param {String} userId LINE platform_id
 * @returns {Promise<Object|undefined>}
 */
exports.find = userId => model.first({ filter: { user_id: userId } });

/**
 * 新增職業設定
 * @param {Object} attrs
 * @returns {Promise<Number>}
 */
exports.create = attrs => model.create(attrs);

/**
 * 更新職業設定 (主鍵為 user_id)
 * @param {String} userId LINE platform_id
 * @param {Object} attrs
 * @returns {Promise<Number>}
 */
exports.update = (userId, attrs) => model.update(userId, attrs, { pk: "user_id" });
```

- [ ] **Step 4: Run the test and confirm it PASSES.** `cd app && yarn test -- src/model/application/__tests__/WorldBossRole.test.js`. Expect: 4 passing tests, exit 0. If `create only persists fillable fields` fails because `bogus` leaked, confirm `fillable` matches Step 3 exactly (base `create` uses `lodash.pick(attributes, this.fillable)`).

- [ ] **Step 5: Lint, then commit.** `cd app && yarn lint -- src/model/application/WorldBossRole.js src/model/application/__tests__/WorldBossRole.test.js` (expect 0 errors).

```bash
git add app/src/model/application/WorldBossRole.js \
        app/src/model/application/__tests__/WorldBossRole.test.js
git commit -m "feat(worldboss): WorldBossRole model with platform_id PK CRUD"
```

---

### Task 9 — Model: `WorldBossRewardLog` (idempotent `tryInsert`)

**Files:**
- Create: `app/src/model/application/WorldBossRewardLog.js`
- Create test: `app/src/model/application/__tests__/WorldBossRewardLog.test.js`

**Interfaces:**
- Consumes (from Task 5): table `world_boss_reward_log` with UNIQUE `(user_id, world_boss_event_id)` named `uniq_wbrl_user_event`.
- Consumes pattern: `app/src/model/application/JankenDailyRewardLog.js` (verified: `tryInsert` = `const db = trx || mysql; try { db(TABLE).insert(...) } catch ER_DUP_ENTRY → false; throw`; accepts optional `trx`).
- Produces (for M7 settlement loop, M8 report card) — contract-locked signatures:
  - `exports.tryInsert = async ({ user_id, world_boss_event_id, materials, stones, board, rank, is_mvp }, trx) => Promise<boolean>` — `true` on insert, `false` on dup. MUST accept `trx` (M7 settlement runs it inside `mysql.transaction`, as the FIRST insert per user so a dup short-circuits before any ledger write — addendum §13: grants are positive ledger inserts).
  - `exports.getByUserAndEvent = (user_id, world_boss_event_id, trx) => Promise<row|undefined>`.
  - `exports.getUnreadForUser = (user_id) => Promise<row|undefined>` — report-card source (most-recent reward row for that platform_id).

**Prerequisite:** `make infra` running (real-DB test). Strict TDD.

- [ ] **Step 1: Write the FULL failing test.** Create `app/src/model/application/__tests__/WorldBossRewardLog.test.js`. Mirror the Janken idempotency test precisely (it is the canonical proof the unique key + `ER_DUP_ENTRY` catch work end-to-end against a real DB — a pure mock cannot prove the DB constraint fires, which is why this stays a real-DB suite), PLUS the same connectivity guard as Task 8:

```js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossRewardLog = require("../WorldBossRewardLog");

let dbUp = true;

describe("WorldBossRewardLog", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      // eslint-disable-next-line no-console
      console.warn(
        'SKIP: WorldBossRewardLog tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_reward_log").delete();
  });

  afterAll(() => mysql.destroy());

  test("tryInsert returns true first, false on duplicate (user_id, event)", async () => {
    if (!dbUp) return;
    const args = {
      user_id: "Uwin1",
      world_boss_event_id: 42,
      materials: 50,
      stones: 30,
      board: "dps",
      rank: 1,
      is_mvp: true,
    };
    expect(await WorldBossRewardLog.tryInsert(args)).toBe(true);
    expect(await WorldBossRewardLog.tryInsert(args)).toBe(false);
    const count = await mysql("world_boss_reward_log")
      .where({ user_id: "Uwin1", world_boss_event_id: 42 })
      .count({ c: "*" })
      .first();
    expect(Number(count.c)).toBe(1);
  });

  test("tryInsert allows same user across different events", async () => {
    if (!dbUp) return;
    expect(
      await WorldBossRewardLog.tryInsert({
        user_id: "Uwin2",
        world_boss_event_id: 1,
        materials: 15,
        stones: 0,
        board: "none",
        rank: null,
        is_mvp: false,
      })
    ).toBe(true);
    expect(
      await WorldBossRewardLog.tryInsert({
        user_id: "Uwin2",
        world_boss_event_id: 2,
        materials: 15,
        stones: 0,
        board: "none",
        rank: null,
        is_mvp: false,
      })
    ).toBe(true);
  });

  test("tryInsert participates in an outer transaction (rollback drops the row)", async () => {
    if (!dbUp) return;
    await mysql.transaction(async trx => {
      const ok = await WorldBossRewardLog.tryInsert(
        {
          user_id: "Utrx",
          world_boss_event_id: 7,
          materials: 8,
          stones: 0,
          board: "tank",
          rank: 5,
          is_mvp: false,
        },
        trx
      );
      expect(ok).toBe(true);
      await trx.rollback();
    });
    const row = await WorldBossRewardLog.getByUserAndEvent("Utrx", 7);
    expect(row).toBeUndefined();
  });

  test("getByUserAndEvent returns the row when present", async () => {
    if (!dbUp) return;
    await WorldBossRewardLog.tryInsert({
      user_id: "Uget",
      world_boss_event_id: 9,
      materials: 20,
      stones: 0,
      board: "healer",
      rank: 3,
      is_mvp: false,
    });
    const row = await WorldBossRewardLog.getByUserAndEvent("Uget", 9);
    expect(row.materials).toBe(20);
    expect(row.board).toBe("healer");
  });

  test("getUnreadForUser returns the most recent reward row for the user", async () => {
    if (!dbUp) return;
    await WorldBossRewardLog.tryInsert({
      user_id: "Uunread",
      world_boss_event_id: 100,
      materials: 15,
      stones: 0,
      board: "none",
      rank: null,
      is_mvp: false,
    });
    await WorldBossRewardLog.tryInsert({
      user_id: "Uunread",
      world_boss_event_id: 101,
      materials: 50,
      stones: 30,
      board: "dps",
      rank: 1,
      is_mvp: true,
    });
    const row = await WorldBossRewardLog.getUnreadForUser("Uunread");
    expect(row.world_boss_event_id).toBe(101);
    expect(row.is_mvp).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** `cd app && yarn test -- src/model/application/__tests__/WorldBossRewardLog.test.js`. Expect FAIL: `Cannot find module '../WorldBossRewardLog'`. Red state confirmed. (A SKIP warning with 0 assertions means infra is down — run `make infra`.)

- [ ] **Step 3: Write the FULL model.** Create `app/src/model/application/WorldBossRewardLog.js`. `tryInsert` is a direct structural copy of `JankenDailyRewardLog.tryInsert` (same `db = trx || mysql`, same `ER_DUP_ENTRY` catch). `getUnreadForUser` returns the most-recent row by `id` desc:

```js
const mysql = require("../../util/mysql");

const TABLE = "world_boss_reward_log";

/**
 * 冪等寫入結算獎勵紀錄；unique (user_id, world_boss_event_id) 衝突回傳 false
 * @param {Object} attrs
 * @param {String} attrs.user_id LINE platform_id
 * @param {Number} attrs.world_boss_event_id
 * @param {Number} attrs.materials 強化素材數量
 * @param {Number} attrs.stones 女神石數量
 * @param {String} attrs.board dps|healer|tank|none
 * @param {?Number} attrs.rank 名次, null = 純參與/逾時
 * @param {Boolean} attrs.is_mvp
 * @param {import("knex").Knex.Transaction} [trx]
 * @returns {Promise<Boolean>}
 */
exports.tryInsert = async function (
  { user_id, world_boss_event_id, materials, stones, board, rank, is_mvp },
  trx
) {
  const db = trx || mysql;
  try {
    await db(TABLE).insert({
      user_id,
      world_boss_event_id,
      materials,
      stones,
      board,
      rank,
      is_mvp,
    });
    return true;
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") return false;
    throw err;
  }
};

/**
 * 取得單一玩家在某活動的獎勵紀錄
 * @param {String} user_id LINE platform_id
 * @param {Number} world_boss_event_id
 * @param {import("knex").Knex.Transaction} [trx]
 * @returns {Promise<Object|undefined>}
 */
exports.getByUserAndEvent = function (user_id, world_boss_event_id, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ user_id, world_boss_event_id }).first();
};

/**
 * 取得玩家最近一筆獎勵紀錄 (戰報卡來源)
 * @param {String} user_id LINE platform_id
 * @returns {Promise<Object|undefined>}
 */
exports.getUnreadForUser = function (user_id) {
  return mysql(TABLE).where({ user_id }).orderBy("id", "desc").first();
};

exports.table = TABLE;
```

- [ ] **Step 4: Run the test and confirm it PASSES.** `cd app && yarn test -- src/model/application/__tests__/WorldBossRewardLog.test.js`. Expect: 5 passing, exit 0. The transaction-rollback test is the key proof that `tryInsert` honors an outer `trx` (required by M7's settlement, where `reward_log` insert is the FIRST insert inside `mysql.transaction` so a dup short-circuits before any ledger write — addendum §13).

> Boolean note: MySQL stores `is_mvp` as tinyint; the test uses `toBeTruthy()` so `1`/`true` both pass. Downstream readers (M8 report card) should treat it as truthy, not `=== true`.

- [ ] **Step 5: Lint, then commit.** `cd app && yarn lint -- src/model/application/WorldBossRewardLog.js src/model/application/__tests__/WorldBossRewardLog.test.js`.

```bash
git add app/src/model/application/WorldBossRewardLog.js \
        app/src/model/application/__tests__/WorldBossRewardLog.test.js
git commit -m "feat(worldboss): WorldBossRewardLog idempotent tryInsert (copies JankenDailyRewardLog)"
```

---

### Task 10 — Model: `WorldBossLog` query helpers (API LOCK §E — M1 SOLE owner)

> **Why this task is M1's (LOCK §A/§E):** the model-query-helper milestone was previously lost, and two later milestones each tried to redefine these. The LOCK assigns ALL of them to M1. M4/M5 combat writes via `createWithRole`; M5's cold-start scaling and M7's scarcity premium BOTH read `getSupportRatio` (one shared definition — addendum §15); M4's enrage batch reads `getRecentAttackers`; M7 settlement reads `getDamageRank`/`getContributionRank`/`getParticipants`/`resolveUserIds`. **No later milestone re-defines any of these — they only CALL them.** This task adds NO combat/lifecycle/settlement logic; it is pure SQL on `world_boss_event_log`.

**Files:**
- Modify: `app/src/model/application/WorldBossLog.js` — add `role`,`contribution` to the `exports.model` `fillable` (line 97), and append the seven new `exports.*` helpers. Leave the existing `WorldBossLog` class methods, `exports.create`, `getTopRank`, `getTotalDamageByEventId` untouched.
- Create test: `app/src/model/application/__tests__/WorldBossLog.helpers.test.js`

**Interfaces:**
- Consumes (from Task 2): columns `role`/`contribution` + the five indexes on `world_boss_event_log`; `user_id` is numeric `user.id`.
- Consumes (existing): `getTopRank`'s verified JOIN pattern (`.join("user", "world_boss_event_log.user_id", "user.id")`) — the rank helpers extend it to also project `user.platform_id`. `UserModel` is NOT required here (resolution is via inline JOIN; `UserModel.getId` is the combat-service path, off this module).
- Produces (LOCK §E — exact signatures, every later milestone calls these verbatim):
  - `createWithRole({ user_id /*numeric*/, world_boss_event_id, role, action_type, damage, cost, contribution }, trx?) => Promise<...>` — single-row insert; honors an outer `trx`.
  - `getRecentAttackers({ eventId, minutes, limit }) => Promise<[{ user_id /*numeric*/, platform_id }]>` — JOIN `user`; last `limit` rows within `minutes`, `created_at` DESC.
  - `getSupportRatio(eventId) => Promise<number>` — (#distinct users with ≥1 healer|tank action) / (#distinct users with ≥1 action); `0` when no actions.
  - `getDamageRank({ eventId, limit }) => Promise<[{ user_id, platform_id, total_damage }]>` — JOIN `user`, GROUP BY `user_id`, ORDER BY `SUM(damage)` DESC.
  - `getContributionRank({ eventId, role, limit }) => Promise<[{ user_id, platform_id, total_contribution }]>` — JOIN `user`, WHERE `role`, GROUP BY `user_id`, SUM(`contribution`) DESC.
  - `getParticipants(eventId) => Promise<[{ user_id, platform_id }]>` — distinct users with ≥1 row (participation award).
  - `resolveUserIds(numericIds /* number[] */) => Promise<Map<number,string>>` — JOIN `user`; SKIP ids with no `user` row (never mis-credit).

**Prerequisite:** `make infra` running (real-DB test). Strict TDD — write the failing test first.

- [ ] **Step 1: Write the FULL failing test.** Create `app/src/model/application/__tests__/WorldBossLog.helpers.test.js`. Real-DB pattern with the connectivity guard. Because the rank/recent/resolve helpers JOIN `user`, the test seeds two real `user` rows and uses their numeric ids; it seeds a `world_boss` template + a `world_boss_event` to own the log rows. `jest.unmock` precedes the model `require`:

```js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossLog = require("../WorldBossLog");

let dbUp = true;
let eventId;
let uidA; // numeric user.id
let uidB;

describe("WorldBossLog query helpers (LOCK §E)", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      // eslint-disable-next-line no-console
      console.warn(
        'SKIP: WorldBossLog helper tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("user").whereIn("platform_id", ["UwblA", "UwblB"]).delete();
    [uidA] = await mysql("user").insert({ platform: "line", platform_id: "UwblA" });
    [uidB] = await mysql("user").insert({ platform: "line", platform_id: "UwblB" });

    await mysql("world_boss").where({ name: "T-WBL" }).delete();
    const [bossId] = await mysql("world_boss").insert({ name: "T-WBL", hp: 100000 });
    [eventId] = await mysql("world_boss_event").insert({
      world_boss_id: bossId,
      announcement: "t",
      start_time: "2026-06-20 00:00:00",
      end_time: "2026-06-21 00:00:00",
      status: "active",
    });
  });

  afterEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_event_log").where({ world_boss_event_id: eventId }).delete();
    await mysql("world_boss_event").where({ id: eventId }).delete();
    await mysql("world_boss").where({ name: "T-WBL" }).delete();
    await mysql("user").whereIn("platform_id", ["UwblA", "UwblB"]).delete();
  });

  afterAll(() => mysql.destroy());

  test("createWithRole inserts a row with role + contribution", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "sword|skillOne",
      damage: 500,
      cost: 10,
      contribution: 500,
    });
    const row = await mysql("world_boss_event_log")
      .where({ world_boss_event_id: eventId, user_id: uidA })
      .first();
    expect(row.role).toBe("dps");
    expect(row.contribution).toBe(500);
    expect(row.damage).toBe(500);
  });

  test("createWithRole honors an outer transaction (rollback drops the row)", async () => {
    if (!dbUp) return;
    await mysql.transaction(async trx => {
      await WorldBossLog.createWithRole(
        {
          user_id: uidA,
          world_boss_event_id: eventId,
          role: "tank",
          action_type: "block",
          damage: 0,
          cost: 10,
          contribution: 1,
        },
        trx
      );
      await trx.rollback();
    });
    const row = await mysql("world_boss_event_log")
      .where({ world_boss_event_id: eventId, user_id: uidA })
      .first();
    expect(row).toBeUndefined();
  });

  test("getDamageRank returns both ids ordered by SUM(damage) desc", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 100,
      cost: 10,
      contribution: 100,
    });
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 50,
      cost: 10,
      contribution: 50,
    });
    await WorldBossLog.createWithRole({
      user_id: uidB,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 80,
      cost: 10,
      contribution: 80,
    });
    const rank = await WorldBossLog.getDamageRank({ eventId, limit: 10 });
    expect(rank).toHaveLength(2);
    expect(rank[0].user_id).toBe(uidA);
    expect(rank[0].platform_id).toBe("UwblA");
    expect(Number(rank[0].total_damage)).toBe(150);
    expect(rank[1].user_id).toBe(uidB);
    expect(rank[1].platform_id).toBe("UwblB");
  });

  test("getContributionRank filters by role and sums contribution", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "healer",
      action_type: "revive",
      damage: 0,
      cost: 10,
      contribution: 3,
    });
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "healer",
      action_type: "shield",
      damage: 0,
      cost: 10,
      contribution: 2,
    });
    await WorldBossLog.createWithRole({
      user_id: uidB,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 999,
      cost: 10,
      contribution: 999,
    });
    const rank = await WorldBossLog.getContributionRank({ eventId, role: "healer", limit: 10 });
    expect(rank).toHaveLength(1);
    expect(rank[0].user_id).toBe(uidA);
    expect(rank[0].platform_id).toBe("UwblA");
    expect(Number(rank[0].total_contribution)).toBe(5);
  });

  test("getRecentAttackers returns both ids within the window, newest first", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 1,
      cost: 10,
      contribution: 1,
    });
    await WorldBossLog.createWithRole({
      user_id: uidB,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 1,
      cost: 10,
      contribution: 1,
    });
    const recent = await WorldBossLog.getRecentAttackers({ eventId, minutes: 60, limit: 10 });
    expect(recent.length).toBeGreaterThanOrEqual(2);
    expect(recent[0]).toHaveProperty("user_id");
    expect(recent[0]).toHaveProperty("platform_id");
    const platformIds = recent.map(r => r.platform_id);
    expect(platformIds).toContain("UwblA");
    expect(platformIds).toContain("UwblB");
  });

  test("getSupportRatio = support-distinct / total-distinct (0 when no actions)", async () => {
    if (!dbUp) return;
    expect(await WorldBossLog.getSupportRatio(eventId)).toBe(0);
    // A is a healer (support), B is dps only -> 1 of 2 distinct users supports
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "healer",
      action_type: "revive",
      damage: 0,
      cost: 10,
      contribution: 1,
    });
    await WorldBossLog.createWithRole({
      user_id: uidB,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 10,
      cost: 10,
      contribution: 10,
    });
    expect(await WorldBossLog.getSupportRatio(eventId)).toBeCloseTo(0.5, 5);
  });

  test("getParticipants returns distinct users with both ids", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 1,
      cost: 10,
      contribution: 1,
    });
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 1,
      cost: 10,
      contribution: 1,
    });
    const parts = await WorldBossLog.getParticipants(eventId);
    expect(parts).toHaveLength(1);
    expect(parts[0].user_id).toBe(uidA);
    expect(parts[0].platform_id).toBe("UwblA");
  });

  test("resolveUserIds maps numeric->platform_id and skips missing", async () => {
    if (!dbUp) return;
    const map = await WorldBossLog.resolveUserIds([uidA, uidB, 99999999]);
    expect(map instanceof Map).toBe(true);
    expect(map.get(uidA)).toBe("UwblA");
    expect(map.get(uidB)).toBe("UwblB");
    expect(map.has(99999999)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** `cd app && yarn test -- src/model/application/__tests__/WorldBossLog.helpers.test.js`. Expect FAIL: `WorldBossLog.createWithRole is not a function` (the new helpers do not exist yet). Red state confirmed. (A SKIP warning with 0 assertions means infra is down — run `make infra`.)

- [ ] **Step 3: Widen the model `fillable`, then append the seven helpers.** In `app/src/model/application/WorldBossLog.js`, first change the `exports.model` fillable (line 97) from:

```js
  fillable: ["world_boss_event_id", "user_id", "action_type", "damage", "cost"],
```

to:

```js
  fillable: ["world_boss_event_id", "user_id", "action_type", "damage", "cost", "role", "contribution"],
```

Then append the helpers after `exports.getTopRank` (do NOT alter `exports.create`, which deliberately keeps the legacy 5-field pick for the old attack path). All use the existing `getTopRank` JOIN convention and return BOTH ids per LOCK §B:

```js
/**
 * 寫入帶職業 + 貢獻分的攻擊紀錄 (LOCK §E)
 * @param {Object} attrs
 * @param {Number} attrs.user_id 內部數字 user.id
 * @param {Number} attrs.world_boss_event_id
 * @param {String} attrs.role dps|healer|tank
 * @param {String} attrs.action_type
 * @param {Number} attrs.damage
 * @param {Number} attrs.cost
 * @param {Number} attrs.contribution
 * @param {import("knex").Knex.Transaction} [trx]
 * @returns {Promise<Array<Number>>}
 */
exports.createWithRole = async (
  { user_id, world_boss_event_id, role, action_type, damage, cost, contribution },
  trx
) => {
  const db = trx || mysql;
  return await db(TABLE).insert({
    user_id,
    world_boss_event_id,
    role,
    action_type,
    damage,
    cost,
    contribution,
  });
};

/**
 * 取得近期攻擊者 (供 enrage 批次擊倒); 同時回傳數字 id 與 platform_id (LOCK §B)
 * @param {Object} param
 * @param {Number} param.eventId
 * @param {Number} param.minutes 視窗 (分鐘)
 * @param {Number} param.limit
 * @returns {Promise<Array<{user_id: Number, platform_id: String}>>}
 */
exports.getRecentAttackers = async ({ eventId, minutes, limit }) => {
  return await mysql(TABLE)
    .select({ user_id: "world_boss_event_log.user_id", platform_id: "user.platform_id" })
    .join("user", "world_boss_event_log.user_id", "user.id")
    .where("world_boss_event_id", eventId)
    .andWhere("world_boss_event_log.created_at", ">=", mysql.raw("now() - interval ? minute", [minutes]))
    .orderBy("world_boss_event_log.created_at", "desc")
    .limit(limit);
};

/**
 * 支援職業參與比 = (有 >=1 次 healer|tank 行動的人) / (有 >=1 次行動的人); 無行動回傳 0
 * 同一定義供 M5 冷啟動縮放與 M7 稀缺加成共用 (addendum §15)
 * @param {Number} eventId
 * @returns {Promise<Number>}
 */
exports.getSupportRatio = async eventId => {
  const totalRow = await mysql(TABLE)
    .countDistinct({ c: "user_id" })
    .where("world_boss_event_id", eventId)
    .first();
  const total = Number(totalRow.c || 0);
  if (total === 0) return 0;

  const supportRow = await mysql(TABLE)
    .countDistinct({ c: "user_id" })
    .where("world_boss_event_id", eventId)
    .whereIn("role", ["healer", "tank"])
    .first();
  const support = Number(supportRow.c || 0);
  return support / total;
};

/**
 * 傷害榜: GROUP BY user_id, SUM(damage) desc; 回傳數字 id + platform_id (LOCK §B)
 * @param {Object} param
 * @param {Number} param.eventId
 * @param {Number} param.limit
 * @returns {Promise<Array<{user_id: Number, platform_id: String, total_damage: Number}>>}
 */
exports.getDamageRank = async ({ eventId, limit }) => {
  return await mysql(TABLE)
    .select({ user_id: "world_boss_event_log.user_id", platform_id: "user.platform_id" })
    .sum({ total_damage: "damage" })
    .join("user", "world_boss_event_log.user_id", "user.id")
    .where("world_boss_event_id", eventId)
    .groupBy("world_boss_event_log.user_id", "user.platform_id")
    .orderBy("total_damage", "desc")
    .limit(limit);
};

/**
 * 職業貢獻榜 (依 role 過濾): GROUP BY user_id, SUM(contribution) desc; 回傳兩種 id (LOCK §B)
 * @param {Object} param
 * @param {Number} param.eventId
 * @param {String} param.role dps|healer|tank
 * @param {Number} param.limit
 * @returns {Promise<Array<{user_id: Number, platform_id: String, total_contribution: Number}>>}
 */
exports.getContributionRank = async ({ eventId, role, limit }) => {
  return await mysql(TABLE)
    .select({ user_id: "world_boss_event_log.user_id", platform_id: "user.platform_id" })
    .sum({ total_contribution: "contribution" })
    .join("user", "world_boss_event_log.user_id", "user.id")
    .where("world_boss_event_id", eventId)
    .andWhere("role", role)
    .groupBy("world_boss_event_log.user_id", "user.platform_id")
    .orderBy("total_contribution", "desc")
    .limit(limit);
};

/**
 * 取得參與者 (有 >=1 筆紀錄的不重複玩家); 回傳兩種 id (供參與獎發放)
 * @param {Number} eventId
 * @returns {Promise<Array<{user_id: Number, platform_id: String}>>}
 */
exports.getParticipants = async eventId => {
  return await mysql(TABLE)
    .distinct({ user_id: "world_boss_event_log.user_id", platform_id: "user.platform_id" })
    .join("user", "world_boss_event_log.user_id", "user.id")
    .where("world_boss_event_id", eventId);
};

/**
 * 將結算彙總出的數字 user.id 反查為 platform_id (供發放); 找不到 user 列者略過 (LOCK §B)
 * @param {Array<Number>} numericIds
 * @returns {Promise<Map<Number, String>>}
 */
exports.resolveUserIds = async numericIds => {
  const map = new Map();
  if (!Array.isArray(numericIds) || numericIds.length === 0) return map;

  const rows = await mysql("user")
    .select({ id: "id", platform_id: "platform_id" })
    .whereIn("id", numericIds);

  rows.forEach(row => map.set(row.id, row.platform_id));
  return map;
};
```

> Note (LOCK §B): every rank/recent/participant helper GROUPs/DISTINCTs on the NUMERIC `user_id` and JOINs `user` to also surface `platform_id`. The enrage batch ZADDs `platform_id` into the pool; any contribution writeback uses the numeric `user_id`. `resolveUserIds` is the settlement reverse-map and SKIPS deleted accounts (no `user` row) so a grant never mis-credits. There is no `MinigameLevel`-based resolution anywhere in this module.

- [ ] **Step 4: Run the test and confirm it PASSES.** `cd app && yarn test -- src/model/application/__tests__/WorldBossLog.helpers.test.js`. Expect: 8 passing, exit 0. If `getDamageRank` returns a `user_id` that is a string or a `total_damage` not numeric, that is a driver coercion detail — the test already `Number(...)`s the sum and compares `user_id` to the captured `uidA`/`uidB` (which come from the same insert, so the types match). If `getSupportRatio` returns a string, confirm the `Number(...)` wraps on both count rows.

- [ ] **Step 5: Lint, then commit.** `cd app && yarn lint -- src/model/application/WorldBossLog.js src/model/application/__tests__/WorldBossLog.helpers.test.js` (expect 0 errors).

```bash
git add app/src/model/application/WorldBossLog.js \
        app/src/model/application/__tests__/WorldBossLog.helpers.test.js
git commit -m "feat(worldboss): WorldBossLog query helpers — role/contribution + rank/recent/ratio/resolve (LOCK §E)"
```

---

### Task 11 — Model: `WorldBossEvent` lifecycle helpers (API LOCK §E — M1 SOLE owner)

> **Why this task is M1's (LOCK §A/§E/§G):** the lifecycle scan (M6) and settlement (M7) both need to read/transition events, and the LOCK explicitly forbids them from redefining model methods. M1 owns the schema (Task 1) and the fillable (Task 7), so it also owns these reader/CAS helpers. M6's `createDailyBoss`/`advance` CALL `getActive`/`getKilledUnsettled`/`getOverdueActive`/`casStatus`; M7's `settleEvent` CALLS `findRaw`/`markSettled`. This task adds NO scheduling, NO reward, NO combat logic — only the model methods. `findRaw` exists because the existing `find` (line 44) INNER-JOINs `world_boss`, so it can't read an event whose template was deleted and would mangle column names; `findRaw` is join-free.

**Files:**
- Modify: `app/src/model/application/WorldBossEvent.js` — append six new `exports.*` after `exports.destroy`. Do NOT touch the existing `all`/`find`/`create`/`update`/`destroy`/`worldBoss`/`histories`.
- Create test: `app/src/model/application/__tests__/WorldBossEvent.lifecycle.test.js`

**Interfaces:**
- Consumes (from Task 1): columns `status`/`killed_at`/`settled_at`. Consumes (from Task 7): the widened `fillable` (so the seed `create({..., status})` in the test persists `status`).
- Consumes (existing): the `TABLE` const and the shared `mysql` instance already `require`d at the top of the module.
- Produces (LOCK §E — exact signatures; M6/M7 call these verbatim):
  - `getActive() => Promise<row|null>` — `status='active'` AND now BETWEEN `start_time`/`end_time` (the single holding event).
  - `getKilledUnsettled() => Promise<row[]>` — `status='killed'` AND `settled_at IS NULL`.
  - `getOverdueActive() => Promise<row[]>` — `status='active'` AND `end_time < now`.
  - `casStatus(eventId, fromStatus, toStatus, extra = {}) => Promise<boolean>` — `UPDATE ... SET status=to, ...extra WHERE id=? AND status=from`; `true` iff exactly one row changed.
  - `findRaw(id) => Promise<row|undefined>` — join-free `mysql("world_boss_event").where({id}).first()` (do NOT use `find()`, which INNER-JOINs `world_boss`).
  - `markSettled(eventId) => Promise<boolean>` — `UPDATE ... SET settled_at=now() WHERE id=? AND settled_at IS NULL`; `true` iff exactly one row claimed (atomic).

**Prerequisite:** `make infra` running (real-DB test). Strict TDD — write the failing test first.

- [ ] **Step 1: Write the FULL failing test.** Create `app/src/model/application/__tests__/WorldBossEvent.lifecycle.test.js`. Real-DB pattern + connectivity guard. The test seeds a `world_boss` template and creates events at various statuses/times via the model (relying on the Task-7 fillable), then asserts each helper. `jest.unmock` precedes the model `require`:

```js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossEvent = require("../WorldBossEvent");

let dbUp = true;
let bossId;

async function seed({ status, startOffsetMin, endOffsetMin, killedAt, settledAt }) {
  const [id] = await mysql("world_boss_event").insert({
    world_boss_id: bossId,
    announcement: "t",
    start_time: mysql.raw("now() + interval ? minute", [startOffsetMin]),
    end_time: mysql.raw("now() + interval ? minute", [endOffsetMin]),
    status,
    killed_at: killedAt || null,
    settled_at: settledAt || null,
  });
  return id;
}

describe("WorldBossEvent lifecycle helpers (LOCK §E)", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      // eslint-disable-next-line no-console
      console.warn(
        'SKIP: WorldBossEvent lifecycle tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_event").delete();
    await mysql("world_boss").where({ name: "T-WBEL" }).delete();
    [bossId] = await mysql("world_boss").insert({ name: "T-WBEL", hp: 1000 });
  });

  afterAll(() => mysql.destroy());

  test("getActive returns the active event whose window contains now", async () => {
    if (!dbUp) return;
    const activeId = await seed({ status: "active", startOffsetMin: -60, endOffsetMin: 60 });
    await seed({ status: "active", startOffsetMin: 60, endOffsetMin: 120 }); // not yet started
    await seed({ status: "killed", startOffsetMin: -60, endOffsetMin: 60 }); // not active
    const row = await WorldBossEvent.getActive();
    expect(row).not.toBeNull();
    expect(row.id).toBe(activeId);
  });

  test("getActive returns null when none active in window", async () => {
    if (!dbUp) return;
    await seed({ status: "expired", startOffsetMin: -120, endOffsetMin: -60 });
    const row = await WorldBossEvent.getActive();
    expect(row).toBeNull();
  });

  test("getKilledUnsettled returns killed rows with settled_at IS NULL only", async () => {
    if (!dbUp) return;
    const a = await seed({ status: "killed", startOffsetMin: -60, endOffsetMin: 60 });
    await seed({
      status: "killed",
      startOffsetMin: -60,
      endOffsetMin: 60,
      settledAt: mysql.raw("now()"),
    });
    const rows = await WorldBossEvent.getKilledUnsettled();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(a);
  });

  test("getOverdueActive returns active rows past end_time", async () => {
    if (!dbUp) return;
    const overdue = await seed({ status: "active", startOffsetMin: -120, endOffsetMin: -10 });
    await seed({ status: "active", startOffsetMin: -60, endOffsetMin: 60 }); // still in window
    const rows = await WorldBossEvent.getOverdueActive();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(overdue);
  });

  test("casStatus transitions only when from matches; returns true once, false on retry", async () => {
    if (!dbUp) return;
    const id = await seed({ status: "active", startOffsetMin: -60, endOffsetMin: 60 });
    const first = await WorldBossEvent.casStatus(id, "active", "killed", {
      killed_at: mysql.raw("now()"),
    });
    expect(first).toBe(true);
    const second = await WorldBossEvent.casStatus(id, "active", "killed");
    expect(second).toBe(false);
    const row = await mysql("world_boss_event").where({ id }).first();
    expect(row.status).toBe("killed");
    expect(row.killed_at).not.toBeNull();
  });

  test("findRaw reads an event even when its world_boss template is gone", async () => {
    if (!dbUp) return;
    const id = await seed({ status: "killed", startOffsetMin: -60, endOffsetMin: 60 });
    await mysql("world_boss").where({ id: bossId }).delete(); // orphan the event
    const raw = await WorldBossEvent.findRaw(id);
    expect(raw).not.toBeUndefined();
    expect(raw.id).toBe(id);
    expect(raw.status).toBe("killed");
  });

  test("markSettled claims once (true), then false on a second call", async () => {
    if (!dbUp) return;
    const id = await seed({ status: "killed", startOffsetMin: -60, endOffsetMin: 60 });
    expect(await WorldBossEvent.markSettled(id)).toBe(true);
    expect(await WorldBossEvent.markSettled(id)).toBe(false);
    const row = await mysql("world_boss_event").where({ id }).first();
    expect(row.settled_at).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** `cd app && yarn test -- src/model/application/__tests__/WorldBossEvent.lifecycle.test.js`. Expect FAIL: `WorldBossEvent.getActive is not a function` (helpers not yet defined). Red state confirmed. (A SKIP warning with 0 assertions means infra is down — run `make infra`.)

- [ ] **Step 3: Append the six helpers.** In `app/src/model/application/WorldBossEvent.js`, after `exports.destroy` (line 70) and before the `function worldBoss(...)` declaration, append (the module already `require`s `mysql` and defines `TABLE` at the top — reuse them; do NOT add a second `require`):

```js
/**
 * 取得當前進行中的世界王 (status=active 且 now 落在 start_time~end_time)
 * @returns {Promise<Object|null>}
 */
exports.getActive = async () => {
  const row = await mysql(TABLE)
    .select("*")
    .where({ status: "active" })
    .andWhere("start_time", "<=", mysql.raw("now()"))
    .andWhere("end_time", ">=", mysql.raw("now()"))
    .orderBy("id", "desc")
    .first();
  return row || null;
};

/**
 * 取得已擊殺但尚未結算的活動 (status=killed 且 settled_at IS NULL)
 * @returns {Promise<Array<Object>>}
 */
exports.getKilledUnsettled = async () => {
  return await mysql(TABLE).select("*").where({ status: "killed" }).whereNull("settled_at");
};

/**
 * 取得逾時但仍為 active 的活動 (status=active 且 end_time < now)
 * @returns {Promise<Array<Object>>}
 */
exports.getOverdueActive = async () => {
  return await mysql(TABLE)
    .select("*")
    .where({ status: "active" })
    .andWhere("end_time", "<", mysql.raw("now()"));
};

/**
 * 原子狀態轉移: UPDATE ... SET status=to, ...extra WHERE id=? AND status=from
 * @param {Number} eventId
 * @param {String} fromStatus
 * @param {String} toStatus
 * @param {Object} [extra] 額外要一併寫入的欄位 (例如 killed_at)
 * @returns {Promise<Boolean>} 受影響列數為 1 時為 true (本呼叫贏得競態)
 */
exports.casStatus = async (eventId, fromStatus, toStatus, extra = {}) => {
  const affected = await mysql(TABLE)
    .where({ id: eventId, status: fromStatus })
    .update(Object.assign({ status: toStatus }, extra));
  return affected === 1;
};

/**
 * 不 JOIN world_boss 的單筆查詢 (find() 會 INNER JOIN, 無法讀孤兒活動)
 * @param {Number} id
 * @returns {Promise<Object|undefined>}
 */
exports.findRaw = async id => {
  return await mysql(TABLE).where({ id }).first();
};

/**
 * 原子標記結算完成: UPDATE ... SET settled_at=now() WHERE id=? AND settled_at IS NULL
 * @param {Number} eventId
 * @returns {Promise<Boolean>} 受影響列數為 1 時為 true (本呼叫取得結算權)
 */
exports.markSettled = async eventId => {
  const affected = await mysql(TABLE)
    .where({ id: eventId })
    .whereNull("settled_at")
    .update({ settled_at: mysql.raw("now()") });
  return affected === 1;
};
```

> Notes (LOCK §E/§G, addendum §5): `casStatus` is for atomic transitions (`active→killed`, `active→expired`) AND may carry an `extra` stamp (e.g. `{ killed_at: mysql.raw("now()") }`) in the SAME update. M6's expire path passes `extra = {}` (per §G — `settled_at` is owned by `markSettled`, and `killed_at` stays null for an expiry). `markSettled` is the idempotent settlement claim M7 uses so a re-run does not double-stamp. `findRaw` is join-free precisely because the existing `find` INNER-JOINs `world_boss` and would fail on an orphaned event. None of these add scheduling or reward logic.

- [ ] **Step 4: Run the test and confirm it PASSES.** `cd app && yarn test -- src/model/application/__tests__/WorldBossEvent.lifecycle.test.js`. Expect: 7 passing, exit 0. If `casStatus`'s "second call false" fails, confirm the `WHERE ... AND status=from` clause is present (a second call finds `status=killed`, not `active`, so 0 rows update). If `markSettled`'s second call returns true, confirm the `.whereNull("settled_at")` guard is on the update.

- [ ] **Step 5: Lint, then commit.** `cd app && yarn lint -- src/model/application/WorldBossEvent.js src/model/application/__tests__/WorldBossEvent.lifecycle.test.js` (expect 0 errors).

```bash
git add app/src/model/application/WorldBossEvent.js \
        app/src/model/application/__tests__/WorldBossEvent.lifecycle.test.js
git commit -m "feat(worldboss): WorldBossEvent lifecycle helpers — getActive/cas/markSettled/findRaw (LOCK §E)"
```

---

### Task 12 — Full-migration smoke + final M1 verification

**Files:** none (verification only).

**Interfaces:** confirms all of Tasks 1–11 land together on a clean DB.

**Prerequisite (explicit):** This is the manual integration gate — it REQUIRES `make infra` running (MySQL on `localhost:3306`). It is not a mock-only run and is not expected to pass in a CI box without infra; it is run by the implementer/verifier on a machine with infra up. If `yarn migrate` errors with `ECONNREFUSED`/`ER_ACCESS_DENIED`, infra is down — start it and retry.

- [ ] **Step 1: Roll all M1 migrations back to the pre-M1 baseline.** Run `cd app && yarn knex migrate:rollback` repeatedly until the five M1 migrations (`alter_world_boss_event_add_lifecycle`, `alter_world_boss_event_log_add_role_contribution`, `add_enhance_level_to_player_equipment`, `create_world_boss_role`, `create_world_boss_reward_log`) are all rolled back. After each rollback the command prints which file it reverted; stop once the M1 set is exhausted (the next file named would be a pre-M1 migration).

- [ ] **Step 2: Re-apply forward in one shot.** `cd app && yarn migrate`. Expect all five M1 files in the batch, in the Task 1→5 order, exit 0. This proves a fresh deploy applies M1 cleanly.

- [ ] **Step 3: Run all five model test files together.** `cd app && yarn test -- src/model/application/__tests__/WorldBossEvent.test.js src/model/application/__tests__/WorldBossRole.test.js src/model/application/__tests__/WorldBossRewardLog.test.js src/model/application/__tests__/WorldBossLog.helpers.test.js src/model/application/__tests__/WorldBossEvent.lifecycle.test.js`. Expect: 27 passing total (3 + 4 + 5 + 8 + 7), exit 0. (If you see SKIP warnings and 0 real assertions, infra is not up — start `make infra` and rerun; a green-but-skipped run does NOT satisfy this gate.)

- [ ] **Step 4: Config sanity re-check (single-owner shape).** `cd app && node -e "const c=require('config'); console.log(JSON.stringify(c.get('worldboss'))); console.log(JSON.stringify(c.get('items')))"`. Confirm the `worldboss` output contains both the legacy keys (`daily_limit`, `penalty_rate`, `manual`) AND the new keys (`enhance`, `reward`, `enrage_threshold_pct`, `reselect_stone_cost`, `open_hour`, `boss_pool`, `enhancement_material_item_id`), and that `items` is the object shape `{ goddess_stone: { itemId: 999, name }, enhancement_material: { itemId: 1001, name } }` — NOT a scalar. A missing key means Task 6's merge dropped something, or a parallel milestone re-wrote the block with the wrong shape — fix before declaring M1 done.

- [ ] **Step 5: Confirm the model helpers all export (the §E surface every later milestone calls).** Run:

```bash
cd app && node -e "const l=require('./src/model/application/WorldBossLog'); const e=require('./src/model/application/WorldBossEvent'); ['createWithRole','getRecentAttackers','getSupportRatio','getDamageRank','getContributionRank','getParticipants','resolveUserIds'].forEach(n=>{ if(typeof l[n]!=='function') throw new Error('WorldBossLog.'+n+' missing'); }); ['getActive','getKilledUnsettled','getOverdueActive','casStatus','findRaw','markSettled'].forEach(n=>{ if(typeof e[n]!=='function') throw new Error('WorldBossEvent.'+n+' missing'); }); console.log('OK')"
```

Expect `OK`. Then `cd app && grep -n "settled_at" src/model/application/WorldBossEvent.js` (expect a hit inside the `fillable` array AND inside `markSettled`), and `cd app && grep -n "contribution" src/model/application/WorldBossLog.js` (expect it inside the `exports.model` fillable AND inside `createWithRole`/`getContributionRank`). This re-asserts the addendum-§5 blocker fix and the LOCK-§E helper surface survived.

- [ ] **Step 6: No further commit needed** (Tasks 1–11 already committed). If `git status` shows anything uncommitted, it indicates an accidental edit — review and either commit with a descriptive message or discard.

---

**M1 done-criteria (for the verifier):** with `make infra` running — `cd app && yarn migrate` applies clean from baseline; `yarn knex migrate:rollback` cleanly reverses each M1 file; all five model test files pass (27 real, non-skipped assertions); `WorldBossEvent` `fillable` includes `status`/`killed_at`/`settled_at` (addendum §5) and a `create` without `status` still defaults to `active`; the LOCK-§E model surface is fully present and exported with EXACT names — `WorldBossLog.{createWithRole,getRecentAttackers,getSupportRatio,getDamageRank,getContributionRank,getParticipants,resolveUserIds}` (rank/recent helpers return BOTH `user_id` numeric AND `platform_id`; `resolveUserIds` returns `Map<numericId,platformId>` skipping missing ids) and `WorldBossEvent.{getActive,getKilledUnsettled,getOverdueActive,casStatus,findRaw,markSettled}` (`casStatus`/`markSettled` are atomic and return true exactly once); `config.get("worldboss.enhance.cost_base")` → `8`, `config.get("worldboss.reselect_stone_cost")` → `5000`, `config.get("worldboss.open_hour")` → `4`, `config.get("items.enhancement_material.itemId")` → `1001`, and `config.get("items")` is the object shape (not scalar); M1 is the SOLE writer of `worldboss.*`/`items` (no M2/M3/M4 config edits) AND the SOLE definer of these model helpers (no M4–M7 redefinition); equipment-attribute FRACTION convention (addendum §2) documented; pool identity = `platform_id` (LOCK §B) honored by the helper return shapes; no commit touched `main`. Downstream M2–M10 can now `require` `WorldBossRole`/`WorldBossRewardLog`, rely on the widened `WorldBossEvent` fillable, CALL every §E helper without redefining it, and `config.get` every `worldboss.*`/`items.*` value without re-adding any key.

---

Key file paths produced/modified by this milestone (all absolute):
- `/home/hanshino/workspace/redive_linebot/app/migrations/<ts>_alter_world_boss_event_add_lifecycle.js`
- `/home/hanshino/workspace/redive_linebot/app/migrations/<ts>_alter_world_boss_event_log_add_role_contribution.js`
- `/home/hanshino/workspace/redive_linebot/app/migrations/<ts>_add_enhance_level_to_player_equipment.js`
- `/home/hanshino/workspace/redive_linebot/app/migrations/<ts>_create_world_boss_role.js`
- `/home/hanshino/workspace/redive_linebot/app/migrations/<ts>_create_world_boss_reward_log.js`
- `/home/hanshino/workspace/redive_linebot/app/config/default.json` (modified — sole owner of `worldboss.*` + `items`)
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/WorldBossEvent.js` (modified — fillable widened per addendum §5 + lifecycle helpers per LOCK §E)
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/WorldBossLog.js` (modified — fillable widened + query helpers per LOCK §E)
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/WorldBossRole.js`
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/WorldBossRewardLog.js`
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/__tests__/WorldBossEvent.test.js`
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/__tests__/WorldBossEvent.lifecycle.test.js`
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/__tests__/WorldBossRole.test.js`
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/__tests__/WorldBossRewardLog.test.js`
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/__tests__/WorldBossLog.helpers.test.js`

---

## Milestone M2: Role system + base-gear grant

**Goal:** Players pick one of three World Boss roles (`dps`/`healer`/`tank`) via LINE command or LIFF; the choice persists in `world_boss_role`, defaults lazily to `dps` for legacy players, gives every player exactly one free reselect then charges 女神石 (atomically, debit + role-update in ONE `mysql.transaction`), and on first selection auto-grants AND auto-equips the +0 three-piece role gear set idempotently (D4/D5/D27/D29). Combat reads `role`, not the legacy job enum.

> **Inherited global constraints (a reviewer rejects any task that violates one):** Backend is CommonJS (`require`/`module.exports`). ESLint: double quotes, es5 trailing commas, 100-char width. Money is the Inventory append-ledger; `inventory.decreaseGodStone({ userId, amount, note, trx })` keys on the LINE **platform_id** string and accepts an optional `trx`. Ledger signs: a SPEND (reselect cost) is a NEGATIVE `itemAmount` insert — `decreaseGodStone` already negates internally (addendum §13). `world_boss_role` PK is platform_id. Base-gear grant copies `EquipmentService.addToInventory` semantics with unique-collision = idempotent skip. Migrations created ONLY via `cd app && yarn knex migrate:make <name>` (then edit the generated file). Jest config has `transform:{}` so **every `jest.mock(...)` MUST appear before any `require()` of the mocked module**. Run tests with `cd app && yarn test -- <path>`. Branch `feat/worldboss-redesign`; never commit to main.

**Single-owner / dependency notes for this milestone (read before drafting — these resolve cross-milestone collisions flagged in review):**

- **`world_boss_role` table** is created by **M1** (the schema milestone). M2 does NOT create the table migration and does NOT re-test the table. M2 only creates `app/src/model/application/WorldBossRole.js` (the model wrapper) and consumes the table. There is exactly ONE `WorldBossRole.js` file and ONE test for it, both owned by M2 (per the contract File-Structure table). If an M1 draft also created `WorldBossRole.js` or a model test, that is a duplicate — M2 is the single owner of the model; M1 owns only the migration.
- **`default.json` is owned by M3** (per addendum §10 / contract File-Structure: M3 owns the `worldboss.*` config block + `WorldBossConfig` accessors). M2 **only READS** `config.get("worldboss.reselect_stone_cost")` and **never adds or edits** any config key. M2 ships only a read-only test that asserts the key M3 provides is present and numeric; if that test fails, the fix belongs in M3, not here.
- **Equipment attribute unit convention (locked, addendum §2):** `atk_percent` is a **fraction**, not a percentage-point: live code does `damage = Math.floor(damage * (1 + atk_percent))` (`WorldBossController.js:535-545`) and `getEquipmentBonuses` (`EquipmentService.js:107-128`) SUMS the raw stored value. So `atk_percent: 0.05` means +5% damage. M2 base gear MUST seed fractions, NOT integer points. The earlier M2/M4 review blocker (a seeded `5` becoming `6×` damage) is killed by seeding fractions here.
- **`support_power`/`block_power` are INTEGER people-counts (addendum §2/§14), inert until M4.** Verified: `getEquipmentBonuses` (`EquipmentService.js:110-127`) currently only sums `atk_percent`/`crit_rate`/`cost_reduction`/`exp_bonus`/`gold_bonus`; it ignores `support_power`/`block_power`. M4 extends the bonus key set to read them and to apply the enhance multiplier (and `Math.floor` for the integer attrs). M2's job is only to WRITE these attributes onto the seeded healer/tank gear so they are correct the moment M4 lands — **as small integer counts** (`1`/`1`/`1`), matching the "people-count" unit, NOT fractions. This is a documented soft dependency; M2 does not need M4 to ship.

**Identity boundary (addendum §4) — why M2 stays in platform_id space.** Role gating happens entirely at the LINE/LIFF layer where the inbound id is the **platform_id** string (`context.event.source.userId`). `world_boss_role.user_id` is platform_id; `EquipmentService` / `inventory` / `player_equipment` all key on platform_id. M2 therefore NEVER resolves the numeric `user.id` and never touches `world_boss_event_log`. (The numeric-id boundary lives only in M5/M6/M7 combat/settlement; resolution there is via the `user` table JOIN, NOT the minigame service — addendum §4 — but that is out of scope for M2.)

M2's base-gear grant calls `EquipmentService.addToInventory(platformId, equipmentId)` (verified at `app/src/service/EquipmentService.js:92-101`; throws `Error("已擁有此裝備")` on dup, `Error("裝備不存在")` if id missing) and then auto-equips each newly granted piece via `EquipmentService.equip(platformId, equipmentId)` (verified at `:56-70`; resolves the slot from the equipment row, unequips the same slot first via `PlayerEquipmentModel.unequipSlot`, then `equipItem`, then `redis.del('playerEquipment:${userId}')` so combat sees the new bonuses). M2 produces `WorldBossRole` model + `WorldBossRoleService.{getRole,chooseRole,reselectRole}` consumed by M5 (combat), M7 (settlement role-aware), M8 (REST `/role`), M9 (LINE `#職業`).

Confirmed facts from the codebase (do not re-derive):
- `context.event.source.userId` is the LINE **platform_id**; role gating uses platform_id, so `world_boss_role.user_id` = platform_id.
- `equipment` schema (`app/migrations/20260227090000_create_equipment.js:13`): `rarity enum("common","rare","epic","legendary") notNullable defaultTo("common")`. **`"R"` is NOT a member** — seeding it fails strict-mode INSERT (addendum §9). Base gear MUST use `"common"`. `attributes` is a JSON column; `equipment` fillable is `["name","slot","job_id","rarity","attributes","description","image_url"]`. `slot` enum is `["weapon","armor","accessory"]`.
- `EquipmentService.addToInventory(userId, equipmentId)` (`:92`) → `Error("已擁有此裝備")` if owned (idempotent skip), `Error("裝備不存在")` if id missing (rethrow). `EquipmentService.equip(userId, equipmentId)` (`:56`) → resolves slot from the equipment row, calls `PlayerEquipmentModel.unequipSlot` then `equipItem`, then invalidates the `playerEquipment:${userId}` redis cache; throws `Error("裝備不存在")`/`Error("無效的裝備欄位")`.
- `inventory.decreaseGodStone({ userId, amount, note, trx })` (`Inventory.js:120-123`) — `const db = trx ? trx(this.table) : this.knex;` then `db.insert([{ userId, itemId: 999, itemAmount: \`${-amount}\`, note }])`. Accepts a trx (the `trx` callback param from `mysql.transaction`, used as `trx(tableName)`). `inventory.getUserMoney(userId)` (`:82-84`) → `getUserOwnCountByItemId(userId, 999)` → `{ amount }` (null for a user with no rows → guard with `|| 0`).
- **`Base.update(id, attrs, options)` only reads `options.pk` — it does NOT honor `options.trx` (`base.js:160-170`).** Transactions on a Base model are carried by the INSTANCE via `setTransaction(trx)` (`base.js:31-33`); `get knex()` then routes through `this.trx(this.table)` while the trx is open (`base.js:16-22`). So a transactional role update must call `model.setTransaction(trx)` around the `update`, NOT pass `{ trx }` into the options bag. **This corrects the earlier draft, which passed `{ trx }` into base options where it was silently ignored — the role UPDATE would have run OUTSIDE the transaction, defeating atomicity.**
- `mysql.transaction(async trx => { ... })` is available (used in `JankenRewardService.js:83`); `require("../util/mysql")`. The `trx` arg is itself callable as `trx(tableName)`.
- `DefaultLogger` is `require("../util/Logger").DefaultLogger` (verified at `JankenRewardService.js:6`).
- Seeder pattern: a file in `app/seeds/` exports `buildRows()`/`seed(knex)`; a migration `require`s `buildRows` and inserts (verified at `app/migrations/20260423155152_create_prestige_trials.js:2,21`).

---

### Task 1 — `WorldBossRole` model (CRUD over `world_boss_role`, trx-aware update)

> M2 is the SOLE owner of `WorldBossRole.js` and its test. M1 owns only the table migration. There is exactly one model file and one test file, at the paths below.

**Files:**
- Create: `app/src/model/application/WorldBossRole.js`
- Test: `app/__tests__/model/application/WorldBossRole.test.js`

**Interfaces:**
- Consumes from M1: table `world_boss_role` — columns `user_id` (PK, platform_id `string(33)`), `role` enum `["dps","healer","tank"]`, `chosen_at`, `reselect_count int default 0`.
- Produces for Task 3 (service):
  ```js
  exports.model;                                                  // Base instance, table "world_boss_role"
  exports.find = (userId) => Promise<row|undefined>;              // first({ filter: { user_id } })
  exports.create = (attrs) => Promise<insertId>;                  // base.create, fillable-picked
  exports.update = (userId, attrs, opts = {}) => Promise<number>; // base.update with { pk: "user_id" }; opts.trx -> setTransaction
  ```
  `update` forwards an optional `opts.trx` by toggling the Base instance transaction (`setTransaction(trx)` before the update, `setTransaction(null)` after) — because `Base.update` ignores an `options.trx` key.

Steps:

- [ ] **Step 1: Write the failing model test.** Create `app/__tests__/model/application/WorldBossRole.test.js`. The test mocks `app/src/model/base.js` so no DB is touched, and asserts each exported function delegates to the right Base method with the right args — including that a transactional `update` toggles `setTransaction`. Every `jest.mock` is declared BEFORE the `require` of the module under test (`transform:{}` → not hoisted).

  ```js
  const mockFirst = jest.fn();
  const mockCreate = jest.fn();
  const mockUpdate = jest.fn();
  const mockSetTransaction = jest.fn();

  // jest.config has transform:{} -> jest.mock is NOT hoisted; declare before require.
  jest.mock("../../../src/model/base", () => {
    return jest.fn().mockImplementation(function (opts) {
      this.table = opts.table;
      this.fillable = opts.fillable;
      this.first = mockFirst;
      this.create = mockCreate;
      this.update = mockUpdate;
      this.setTransaction = mockSetTransaction;
    });
  });

  const WorldBossRole = require("../../../src/model/application/WorldBossRole");

  describe("WorldBossRole model", () => {
    beforeEach(() => {
      mockFirst.mockReset();
      mockCreate.mockReset();
      mockUpdate.mockReset();
      mockSetTransaction.mockReset();
    });

    test("model is built with the world_boss_role table and platform_id fillable", () => {
      expect(WorldBossRole.model.table).toBe("world_boss_role");
      expect(WorldBossRole.model.fillable).toEqual([
        "user_id",
        "role",
        "chosen_at",
        "reselect_count",
      ]);
    });

    test("find filters by user_id (platform_id)", async () => {
      mockFirst.mockResolvedValue({ user_id: "U123", role: "dps", reselect_count: 0 });
      const row = await WorldBossRole.find("U123");
      expect(mockFirst).toHaveBeenCalledWith({ filter: { user_id: "U123" } });
      expect(row).toEqual({ user_id: "U123", role: "dps", reselect_count: 0 });
    });

    test("create delegates to base.create", async () => {
      mockCreate.mockResolvedValue(1);
      await WorldBossRole.create({ user_id: "U123", role: "healer", reselect_count: 0 });
      expect(mockCreate).toHaveBeenCalledWith({
        user_id: "U123",
        role: "healer",
        reselect_count: 0,
      });
    });

    test("update keys on user_id, not id, and does not toggle a transaction when none given", async () => {
      mockUpdate.mockResolvedValue(1);
      await WorldBossRole.update("U123", { role: "tank", reselect_count: 1 });
      expect(mockUpdate).toHaveBeenCalledWith(
        "U123",
        { role: "tank", reselect_count: 1 },
        { pk: "user_id" }
      );
      expect(mockSetTransaction).not.toHaveBeenCalled();
    });

    test("update with opts.trx toggles the instance transaction around the update then clears it", async () => {
      const FAKE_TRX = { __isTrx: true };
      const order = [];
      mockSetTransaction.mockImplementation(v => order.push(["set", v]));
      mockUpdate.mockImplementation(async () => {
        order.push(["update"]);
        return 1;
      });

      await WorldBossRole.update("U123", { role: "healer", reselect_count: 2 }, { trx: FAKE_TRX });

      // setTransaction(trx) BEFORE update, setTransaction(null) AFTER update.
      expect(order).toEqual([["set", FAKE_TRX], ["update"], ["set", null]]);
      // trx is NOT leaked into base.update options (base.update ignores it anyway).
      expect(mockUpdate).toHaveBeenCalledWith(
        "U123",
        { role: "healer", reselect_count: 2 },
        { pk: "user_id" }
      );
    });

    test("update clears the instance transaction even if the update throws", async () => {
      const FAKE_TRX = { __isTrx: true };
      mockUpdate.mockRejectedValue(new Error("db down"));

      await expect(
        WorldBossRole.update("U123", { role: "tank", reselect_count: 2 }, { trx: FAKE_TRX })
      ).rejects.toThrow("db down");

      expect(mockSetTransaction).toHaveBeenNthCalledWith(1, FAKE_TRX);
      expect(mockSetTransaction).toHaveBeenLastCalledWith(null);
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS.** Run `cd app && yarn test -- __tests__/model/application/WorldBossRole.test.js`. Expected failure: `Cannot find module '../../../src/model/application/WorldBossRole'` — the module does not exist yet.

- [ ] **Step 3: Implement the model.** Create `app/src/model/application/WorldBossRole.js`. The trx-aware update toggles the instance transaction (because `Base.update` ignores `options.trx`) and clears it in a `finally` so a thrown update never leaves the instance pinned to a completed trx.

  ```js
  const Base = require("../base");

  const TABLE = "world_boss_role";

  const model = new Base({
    table: TABLE,
    fillable: ["user_id", "role", "chosen_at", "reselect_count"],
  });

  exports.table = TABLE;
  exports.model = model;

  exports.find = userId => model.first({ filter: { user_id: userId } });

  exports.create = attrs => model.create(attrs);

  // Base.update honors only options.pk; a transaction is carried by the instance via
  // setTransaction(trx) (base.js get knex() routes through this.trx while open). So a
  // transactional update toggles the instance trx around the call rather than passing it
  // into the options bag (where it would be silently ignored).
  exports.update = async (userId, attrs, opts = {}) => {
    const { trx } = opts;
    if (!trx) {
      return model.update(userId, attrs, { pk: "user_id" });
    }
    model.setTransaction(trx);
    try {
      return await model.update(userId, attrs, { pk: "user_id" });
    } finally {
      model.setTransaction(null);
    }
  };
  ```

- [ ] **Step 4: Run the test and confirm it PASSES.** Run `cd app && yarn test -- __tests__/model/application/WorldBossRole.test.js`. Expected: 6 passing tests.

- [ ] **Step 5: Commit.**
  ```bash
  cd /home/hanshino/workspace/redive_linebot && git add app/src/model/application/WorldBossRole.js app/__tests__/model/application/WorldBossRole.test.js && git commit -m "feat(worldboss): add WorldBossRole model (platform_id keyed CRUD, trx-aware update via setTransaction)"
  ```

---

### Task 2 — base-gear seeder + migration (D29)

This seeds the +0 base gear rows into the `equipment` 圖鑑 so Task 3's grant has equipment ids to hand out. We seed a three-piece set for all three roles (dps/healer/tank) so a brand-new player who picks any role isn't empty-handed. The seeder is **idempotent**: it keys rows by a sentinel `name` and inserts only the missing ones.

**Three corrections baked in from review / the addendum:**
1. `rarity` MUST be `"common"` (addendum §9) — the column enum is `["common","rare","epic","legendary"]`; `"R"` would fail the INSERT and break `yarn migrate`.
2. `atk_percent` (dps gear) is a **fraction** (addendum §2): `0.05/0.03/0.02`. Live combat does `damage * (1 + atk_percent)`.
3. `support_power`/`block_power` (healer/tank gear) are **integer people-counts** (addendum §2/§14), NOT fractions: seed `1/1/1` per role. M4 sums these and `Math.floor`s the enhanced value; they are inert until M4 extends `getEquipmentBonuses`.

**Files:**
- Create: `app/seeds/WorldBossBaseGearSeeder.js`
- Create: `app/migrations/<ts>_seed_world_boss_base_gear.js` (generated by `yarn knex migrate:make`)
- Test: `app/__tests__/seeds/WorldBossBaseGearSeeder.test.js`

**Interfaces:**
- Consumes from existing: `equipment` table, fillable `["name","slot","job_id","rarity","attributes","description","image_url"]`, `attributes` JSON column, `rarity` enum (use `"common"`), `slot` enum `["weapon","armor","accessory"]`.
- Produces for Task 3:
  ```js
  exports.ROLE_GEAR;        // { dps:[{name,slot,attributes}...], healer:[...], tank:[...] } — 3 slots each
  exports.buildRows = () => Array<equipmentRow>;   // 9 rows (3 roles x 3 slots), attributes JSON-stringified, rarity "common"
  exports.seed = async (knex) => void;             // idempotent insert by name
  exports.getRoleGearIds = async (knex, role) => Promise<number[]>;  // resolve seeded names -> equipment ids
  ```
- Attribute keys per role (D29): dps gear → `atk_percent` (fraction); healer gear → `support_power` (integer people-count, inert until M4); tank gear → `block_power` (integer people-count, inert until M4).

Steps:

- [ ] **Step 1: Write the failing seeder test.** Create `app/__tests__/seeds/WorldBossBaseGearSeeder.test.js`. No `jest.mock` is needed for the pure helpers; `getRoleGearIds` is tested against a mocked knex builder.

  ```js
  const Seeder = require("../../seeds/WorldBossBaseGearSeeder");

  describe("WorldBossBaseGearSeeder", () => {
    test("ROLE_GEAR covers 3 slots for each of the 3 roles", () => {
      const slots = ["weapon", "armor", "accessory"];
      for (const role of ["dps", "healer", "tank"]) {
        const pieces = Seeder.ROLE_GEAR[role];
        expect(pieces).toHaveLength(3);
        expect(pieces.map(p => p.slot).sort()).toEqual([...slots].sort());
      }
    });

    test("healer gear carries support_power, tank gear carries block_power, dps carries atk_percent", () => {
      const hasKey = (role, key) =>
        Seeder.ROLE_GEAR[role].some(p => Object.prototype.hasOwnProperty.call(p.attributes, key));
      expect(hasKey("healer", "support_power")).toBe(true);
      expect(hasKey("tank", "block_power")).toBe(true);
      expect(hasKey("dps", "atk_percent")).toBe(true);
    });

    test("dps atk_percent values are fractions (<= 1), matching the live damage*(1+atk_percent) convention", () => {
      for (const piece of Seeder.ROLE_GEAR.dps) {
        const v = piece.attributes.atk_percent;
        expect(typeof v).toBe("number");
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1); // fraction, not percentage-point
      }
    });

    test("healer/tank support_power/block_power are positive INTEGER people-counts (addendum §2)", () => {
      for (const piece of Seeder.ROLE_GEAR.healer) {
        const v = piece.attributes.support_power;
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
      }
      for (const piece of Seeder.ROLE_GEAR.tank) {
        const v = piece.attributes.block_power;
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
      }
    });

    test("buildRows returns 9 rows with stringified attributes, valid enum rarity, and a stable sentinel name", () => {
      const rows = Seeder.buildRows();
      expect(rows).toHaveLength(9);
      for (const row of rows) {
        expect(typeof row.name).toBe("string");
        expect(row.name.startsWith("[世界王]")).toBe(true);
        expect(typeof row.attributes).toBe("string");
        expect(() => JSON.parse(row.attributes)).not.toThrow();
        expect(["weapon", "armor", "accessory"]).toContain(row.slot);
        // rarity MUST be a valid enum member or the INSERT fails in strict mode (addendum §9).
        expect(["common", "rare", "epic", "legendary"]).toContain(row.rarity);
        expect(row.rarity).toBe("common");
      }
    });

    test("getRoleGearIds queries equipment by the seeded names for the role", async () => {
      const whereIn = jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }, { id: 13 }]);
      const select = jest.fn().mockReturnValue({ whereIn });
      const knex = jest.fn().mockReturnValue({ select });

      const ids = await Seeder.getRoleGearIds(knex, "healer");

      expect(knex).toHaveBeenCalledWith("equipment");
      expect(select).toHaveBeenCalledWith("id");
      const names = Seeder.ROLE_GEAR.healer.map(p => p.name);
      expect(whereIn).toHaveBeenCalledWith("name", names);
      expect(ids).toEqual([11, 12, 13]);
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS.** Run `cd app && yarn test -- __tests__/seeds/WorldBossBaseGearSeeder.test.js`. Expected failure: `Cannot find module '../../seeds/WorldBossBaseGearSeeder'`.

- [ ] **Step 3: Implement the seeder.** Create `app/seeds/WorldBossBaseGearSeeder.js`. Each piece has a unique sentinel `name` (the dedupe key for idempotent seeding AND the lookup key in `getRoleGearIds`). `attributes` is JSON-stringified (the `equipment.attributes` column stores JSON). `rarity` is `"common"`.

  ```js
  // D29 base gear: +0 three-piece starter set per World Boss role.
  // dps -> atk_percent (FRACTION); healer -> support_power; tank -> block_power.
  // atk_percent is a fraction (0.05 = +5%) to match the live convention
  // (WorldBossController applies damage = Math.floor(damage * (1 + atk_percent));
  //  getEquipmentBonuses sums the raw stored value — addendum §2).
  // support_power / block_power are INTEGER people-counts (addendum §2/§14), not fractions;
  // they are inert until M4 teaches getEquipmentBonuses to sum + Math.floor them.
  // rarity is "common" — the equipment.rarity enum has no "R" member; any other value fails the
  // INSERT (addendum §9). Names are stable sentinels: used as the idempotent insert key AND id lookup key.
  const ROLE_GEAR = {
    dps: [
      { name: "[世界王]輸出者之劍", slot: "weapon", attributes: { atk_percent: 0.05 } },
      { name: "[世界王]輸出者之甲", slot: "armor", attributes: { atk_percent: 0.03 } },
      { name: "[世界王]輸出者之飾", slot: "accessory", attributes: { atk_percent: 0.02 } },
    ],
    healer: [
      { name: "[世界王]治療者之杖", slot: "weapon", attributes: { support_power: 1 } },
      { name: "[世界王]治療者之袍", slot: "armor", attributes: { support_power: 1 } },
      { name: "[世界王]治療者之飾", slot: "accessory", attributes: { support_power: 1 } },
    ],
    tank: [
      { name: "[世界王]守護者之盾", slot: "weapon", attributes: { block_power: 1 } },
      { name: "[世界王]守護者之甲", slot: "armor", attributes: { block_power: 1 } },
      { name: "[世界王]守護者之飾", slot: "accessory", attributes: { block_power: 1 } },
    ],
  };

  function buildRows() {
    const rows = [];
    for (const role of Object.keys(ROLE_GEAR)) {
      for (const piece of ROLE_GEAR[role]) {
        rows.push({
          name: piece.name,
          slot: piece.slot,
          job_id: null,
          rarity: "common",
          attributes: JSON.stringify(piece.attributes),
          description: `世界王${role}基礎裝備`,
          image_url: "",
        });
      }
    }
    return rows;
  }

  // Idempotent: insert only rows whose sentinel name is not already present.
  async function seed(knex) {
    const rows = buildRows();
    const names = rows.map(r => r.name);
    const existing = await knex("equipment").select("name").whereIn("name", names);
    const existingNames = new Set(existing.map(r => r.name));
    const toInsert = rows.filter(r => !existingNames.has(r.name));
    if (toInsert.length > 0) {
      await knex("equipment").insert(toInsert);
    }
  }

  async function getRoleGearIds(knex, role) {
    const names = ROLE_GEAR[role].map(p => p.name);
    const found = await knex("equipment").select("id").whereIn("name", names);
    return found.map(r => r.id);
  }

  exports.ROLE_GEAR = ROLE_GEAR;
  exports.buildRows = buildRows;
  exports.seed = seed;
  exports.getRoleGearIds = getRoleGearIds;
  ```

- [ ] **Step 4: Run the test and confirm it PASSES.** Run `cd app && yarn test -- __tests__/seeds/WorldBossBaseGearSeeder.test.js`. Expected: 6 passing tests.

- [ ] **Step 5: Generate the migration that runs the seeder.** Run `cd app && yarn knex migrate:make seed_world_boss_base_gear`. This creates a timestamped file under `app/migrations/` (NEVER hand-author the timestamp). Open the generated file and replace its body with (note: `down` removes only the sentinel rows by name, so it never touches player-created equipment):

  ```js
  // eslint-disable-next-line no-unused-vars
  const { Knex } = require("knex");
  const { buildRows } = require("../seeds/WorldBossBaseGearSeeder");

  /**
   * @param {Knex} knex
   * @returns {Promise<void>}
   */
  exports.up = async function (knex) {
    const rows = buildRows();
    const names = rows.map(r => r.name);
    const existing = await knex("equipment").select("name").whereIn("name", names);
    const existingNames = new Set(existing.map(r => r.name));
    const toInsert = rows.filter(r => !existingNames.has(r.name));
    if (toInsert.length > 0) {
      await knex("equipment").insert(toInsert);
    }
  };

  /**
   * @param {Knex} knex
   * @returns {Promise<void>}
   */
  exports.down = async function (knex) {
    const names = buildRows().map(r => r.name);
    await knex("equipment").whereIn("name", names).del();
  };
  ```

- [ ] **Step 6: Run the migration locally.** Run `cd app && yarn migrate`. Expected: `Batch N run: 1 migrations` listing your `seed_world_boss_base_gear` file, **no enum-truncation / strict-mode error** (this is the blocker the `rarity:"common"` fix prevents — addendum §9). If it errors on `rarity`, the seeder still has a bad enum value — fix it before proceeding.

- [ ] **Step 7: Commit.**
  ```bash
  cd /home/hanshino/workspace/redive_linebot && git add app/seeds/WorldBossBaseGearSeeder.js app/migrations/*_seed_world_boss_base_gear.js app/__tests__/seeds/WorldBossBaseGearSeeder.test.js && git commit -m "feat(worldboss): seed +0 role base-gear set (D29, common rarity, fraction atk_percent + integer support/block, idempotent by name)"
  ```

---

### Task 3 — `WorldBossRoleService` (getRole / chooseRole / reselectRole + idempotent gear grant + auto-equip + atomic paid reselect)

This is the core of M2. `getRole` returns the lazy default `dps` for legacy players (no row). `chooseRole` is first-time selection (free, grants AND auto-equips base gear). `reselectRole` changes an existing role: the first reselect is free (`reselect_count` 0→1 — this is D27's "every player gets one free reselect"); subsequent reselects cost `config.worldboss.reselect_stone_cost` 女神石 — **the debit and the role update run in ONE `mysql.transaction` so a failed update never leaves the user charged** (review major fix; debit is a negative ledger insert per addendum §13). Gear grant is idempotent: "already owned" is swallowed as a skip; granted gear is **auto-equipped** so healer/tank stats function immediately (role fantasy requires the stats to be active without a manual `#裝備`; `equip` also invalidates the equipment redis cache, addendum §3).

**D27 lazy-default vs one-free-reselect interaction (coverage gap, resolved per addendum §14/§70):**
- D27 = "lazy default: no `world_boss_role` row ⇒ treated as `dps`, `reselect_count=0`. One free reselect = the first role CHANGE costs 0 when `reselect_count==0`, then increments; later changes cost 女神石." No mandatory backfill migration — lazy `getRole` COALESCE-on-read covers correctness, so **M2 ships NO backfill migration** (the contract's optional `<ts>_backfill_world_boss_role_dps.js` is intentionally omitted; if a future op wants it, it ONLY inserts `dps` rows with `reselect_count=0` and must NOT pre-spend the free reselect).
- Resolved interaction for an auto-defaulted (rowless) player: a rowless player is *implicitly* `dps`. If they then issue `#職業 dps` (re-affirming dps) we treat it as a first `chooseRole` (create row, grant+equip dps gear, `reselect_count=0`) — the free reselect is **NOT** consumed, because no role actually changed. If a rowless player issues `#職業 tank` it is likewise a first `chooseRole` (create row at `reselect_count=0`, grant+equip tank gear) — again the free reselect is preserved for their NEXT change. So an existing player's guaranteed-one-free reselect is honored: the first row write is the free *choose* (grants gear), and `reselect_count` only increments on a subsequent `reselectRole`. The free reselect is therefore the FIRST change *after* a row exists. This is the explicit D27 contract and is asserted in tests below.

**Files:**
- Create: `app/src/service/WorldBossRoleService.js`
- Test: `app/__tests__/service/WorldBossRoleService.test.js`

**Interfaces:**
- Consumes from Task 1: `WorldBossRole.{find,create,update}` — `update(userId, attrs, { trx })` toggles the model transaction.
- Consumes from Task 2: `WorldBossBaseGearSeeder.getRoleGearIds(mysql, role)` and `WorldBossBaseGearSeeder.ROLE_GEAR`. `mysql` is the shared connection (`require("../util/mysql")`), passed straight in as the knex callable.
- Consumes from existing code: `EquipmentService.addToInventory(platformId, equipmentId)` (dup → `已擁有此裝備` skip; missing → `裝備不存在` rethrow); `EquipmentService.equip(platformId, equipmentId)` (auto-equip after grant; invalidates redis cache); `inventory.decreaseGodStone({userId, amount, note, trx})`; `inventory.getUserMoney(userId) -> {amount}`; `config.get("worldboss.reselect_stone_cost")` (key owned by M3); `mysql.transaction(fn)`.
- Produces for M5/M7/M8/M9 (exact contract signatures):
  ```js
  exports.VALID_ROLES = ["dps", "healer", "tank"];
  exports.getRole = async (platformId) => "dps"|"healer"|"tank";   // null row -> "dps" (lazy default, D27)
  exports.chooseRole = async (platformId, role) =>
    { role, granted_gear: number[] };          // first choose; idempotent grant + auto-equip
  exports.reselectRole = async (platformId, role) =>
    { role, free_used: boolean };              // first reselect free; later costs stones atomically (D5/D27)
  ```
  Errors thrown (for the LINE/REST layer to catch): `Error("無效的職業")` bad role; `Error("尚未選擇職業")` reselect with no row; `Error("女神石不足")` paid reselect unaffordable.

Steps:

- [ ] **Step 1: Write the failing service test.** Create `app/__tests__/service/WorldBossRoleService.test.js`. Every `jest.mock(...)` is declared BEFORE the `require` of the service (`transform:{}` — not hoisted). We mock the model, the seeder, `EquipmentService` (incl. `equip`), the Inventory singleton, `config`, `mysql` (so `mysql.transaction` runs the callback with a fake trx), and `Logger`.

  ```js
  // --- mocks MUST precede the require of the module under test (transform:{} = no hoist) ---
  const mockRoleFind = jest.fn();
  const mockRoleCreate = jest.fn();
  const mockRoleUpdate = jest.fn();
  jest.mock("../../src/model/application/WorldBossRole", () => ({
    find: (...a) => mockRoleFind(...a),
    create: (...a) => mockRoleCreate(...a),
    update: (...a) => mockRoleUpdate(...a),
  }));

  const mockGetRoleGearIds = jest.fn();
  jest.mock("../../seeds/WorldBossBaseGearSeeder", () => ({
    ROLE_GEAR: {
      dps: [{ name: "d1" }, { name: "d2" }, { name: "d3" }],
      healer: [{ name: "h1" }, { name: "h2" }, { name: "h3" }],
      tank: [{ name: "t1" }, { name: "t2" }, { name: "t3" }],
    },
    getRoleGearIds: (...a) => mockGetRoleGearIds(...a),
  }));

  const mockAddToInventory = jest.fn();
  const mockEquip = jest.fn();
  jest.mock("../../src/service/EquipmentService", () => ({
    addToInventory: (...a) => mockAddToInventory(...a),
    equip: (...a) => mockEquip(...a),
  }));

  const mockDecreaseGodStone = jest.fn();
  const mockGetUserMoney = jest.fn();
  jest.mock("../../src/model/application/Inventory", () => ({
    inventory: {
      decreaseGodStone: (...a) => mockDecreaseGodStone(...a),
      getUserMoney: (...a) => mockGetUserMoney(...a),
    },
  }));

  jest.mock("config", () => ({
    get: key => {
      const table = { "worldboss.reselect_stone_cost": 5000 };
      return table[key];
    },
  }));

  // mysql: an opaque knex token passed into getRoleGearIds, PLUS a transaction() that runs the
  // callback with a fake trx so we can assert the debit+update happen inside it.
  const FAKE_TRX = { __isTrx: true };
  const mockTransaction = jest.fn(async fn => fn(FAKE_TRX));
  jest.mock("../../src/util/mysql", () => {
    const m = jest.fn(() => ({ __isQueryBuilder: true }));
    m.__isMysql = true;
    m.transaction = (...a) => mockTransaction(...a);
    return m;
  });

  // Logger is harmless but mock it to keep output clean.
  jest.mock("../../src/util/Logger", () => ({ DefaultLogger: { debug: jest.fn() } }));

  const mysql = require("../../src/util/mysql");
  const service = require("../../src/service/WorldBossRoleService");

  describe("WorldBossRoleService", () => {
    beforeEach(() => {
      mockRoleFind.mockReset();
      mockRoleCreate.mockReset();
      mockRoleUpdate.mockReset();
      mockGetRoleGearIds.mockReset();
      mockAddToInventory.mockReset();
      mockEquip.mockReset();
      mockDecreaseGodStone.mockReset();
      mockGetUserMoney.mockReset();
      mockTransaction.mockClear();
    });

    describe("getRole", () => {
      test("returns the stored role", async () => {
        mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 0 });
        await expect(service.getRole("U1")).resolves.toBe("tank");
      });

      test("legacy player with no row defaults to dps (D27, lazy)", async () => {
        mockRoleFind.mockResolvedValue(undefined);
        await expect(service.getRole("U1")).resolves.toBe("dps");
      });
    });

    describe("chooseRole", () => {
      test("rejects an invalid role without writing", async () => {
        await expect(service.chooseRole("U1", "ranger")).rejects.toThrow("無效的職業");
        expect(mockRoleCreate).not.toHaveBeenCalled();
      });

      test("first choice creates the row at reselect_count 0, grants AND auto-equips the gear set", async () => {
        mockRoleFind.mockResolvedValue(undefined);
        mockGetRoleGearIds.mockResolvedValue([21, 22, 23]);
        mockAddToInventory.mockResolvedValue({});
        mockEquip.mockResolvedValue({});
        mockRoleCreate.mockResolvedValue(1);

        const result = await service.chooseRole("U1", "healer");

        expect(mockRoleCreate).toHaveBeenCalledWith({
          user_id: "U1",
          role: "healer",
          reselect_count: 0,
        });
        // seeder receives the shared mysql knex callable
        expect(mockGetRoleGearIds).toHaveBeenCalledWith(mysql, "healer");
        expect(mockAddToInventory.mock.calls.map(c => c[1])).toEqual([21, 22, 23]);
        // each granted (not skipped) piece is auto-equipped
        expect(mockEquip.mock.calls.map(c => c[1])).toEqual([21, 22, 23]);
        expect(result).toEqual({ role: "healer", granted_gear: [21, 22, 23] });
      });

      test("already-owned gear is swallowed as an idempotent skip and not re-equipped", async () => {
        mockRoleFind.mockResolvedValue(undefined);
        mockGetRoleGearIds.mockResolvedValue([21, 22, 23]);
        mockRoleCreate.mockResolvedValue(1);
        mockAddToInventory
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(new Error("已擁有此裝備"))
          .mockResolvedValueOnce({});
        mockEquip.mockResolvedValue({});

        const result = await service.chooseRole("U1", "healer");

        expect(result.granted_gear).toEqual([21, 23]); // 22 skipped, not thrown
        expect(mockEquip.mock.calls.map(c => c[1])).toEqual([21, 23]); // only granted pieces equipped
      });

      test("a non-ownership equipment error propagates", async () => {
        mockRoleFind.mockResolvedValue(undefined);
        mockGetRoleGearIds.mockResolvedValue([99]);
        mockRoleCreate.mockResolvedValue(1);
        mockAddToInventory.mockRejectedValue(new Error("裝備不存在"));

        await expect(service.chooseRole("U1", "dps")).rejects.toThrow("裝備不存在");
      });

      test("choosing when a row already exists routes to reselect (no duplicate create)", async () => {
        mockRoleFind.mockResolvedValue({ user_id: "U1", role: "dps", reselect_count: 0 });
        mockRoleUpdate.mockResolvedValue(1);

        const result = await service.chooseRole("U1", "tank");

        expect(mockRoleCreate).not.toHaveBeenCalled();
        expect(mockRoleUpdate).toHaveBeenCalled();
        expect(result.role).toBe("tank");
        expect(result.granted_gear).toEqual([]);
      });
    });

    describe("reselectRole", () => {
      test("throws when no existing role row (D27: free reselect is the first CHANGE after a row exists)", async () => {
        mockRoleFind.mockResolvedValue(undefined);
        await expect(service.reselectRole("U1", "tank")).rejects.toThrow("尚未選擇職業");
      });

      test("rejects an invalid role", async () => {
        mockRoleFind.mockResolvedValue({ user_id: "U1", role: "dps", reselect_count: 0 });
        await expect(service.reselectRole("U1", "ranger")).rejects.toThrow("無效的職業");
      });

      test("first reselect is free, increments reselect_count to 1, no stone charge, no trx", async () => {
        mockRoleFind.mockResolvedValue({ user_id: "U1", role: "dps", reselect_count: 0 });
        mockRoleUpdate.mockResolvedValue(1);

        const result = await service.reselectRole("U1", "tank");

        expect(mockDecreaseGodStone).not.toHaveBeenCalled();
        expect(mockTransaction).not.toHaveBeenCalled(); // free path is a plain update
        expect(mockRoleUpdate).toHaveBeenCalledWith("U1", { role: "tank", reselect_count: 1 });
        expect(result).toEqual({ role: "tank", free_used: true });
      });

      test("second reselect charges stones inside a transaction when affordable", async () => {
        mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
        mockGetUserMoney.mockResolvedValue({ amount: 6000 });
        mockRoleUpdate.mockResolvedValue(1);

        const result = await service.reselectRole("U1", "healer");

        expect(mockTransaction).toHaveBeenCalledTimes(1);
        // debit passes the trx from mysql.transaction (negative ledger insert handled inside decreaseGodStone)
        expect(mockDecreaseGodStone).toHaveBeenCalledWith({
          userId: "U1",
          amount: 5000,
          note: "world_boss_role_reselect",
          trx: FAKE_TRX,
        });
        // role update happens inside the same trx (model toggles setTransaction internally)
        expect(mockRoleUpdate).toHaveBeenCalledWith(
          "U1",
          { role: "healer", reselect_count: 2 },
          { trx: FAKE_TRX }
        );
        expect(result).toEqual({ role: "healer", free_used: false });
      });

      test("paid reselect at EXACTLY the cost is allowed (boundary)", async () => {
        mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
        mockGetUserMoney.mockResolvedValue({ amount: 5000 });
        mockRoleUpdate.mockResolvedValue(1);

        const result = await service.reselectRole("U1", "healer");

        expect(mockTransaction).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ role: "healer", free_used: false });
      });

      test("second reselect throws 女神石不足 when too poor; never opens a trx, never charges, never updates", async () => {
        mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
        mockGetUserMoney.mockResolvedValue({ amount: 100 });

        await expect(service.reselectRole("U1", "healer")).rejects.toThrow("女神石不足");
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(mockDecreaseGodStone).not.toHaveBeenCalled();
        expect(mockRoleUpdate).not.toHaveBeenCalled();
      });

      test("getUserMoney returning null amount is guarded as 0 (poor)", async () => {
        mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
        mockGetUserMoney.mockResolvedValue({ amount: null });

        await expect(service.reselectRole("U1", "healer")).rejects.toThrow("女神石不足");
        expect(mockTransaction).not.toHaveBeenCalled();
      });

      test("if the role update throws inside the trx, the transaction rejects (debit rolls back)", async () => {
        mockRoleFind.mockResolvedValue({ user_id: "U1", role: "tank", reselect_count: 1 });
        mockGetUserMoney.mockResolvedValue({ amount: 6000 });
        mockDecreaseGodStone.mockResolvedValue([1]);
        mockRoleUpdate.mockRejectedValue(new Error("db down"));

        await expect(service.reselectRole("U1", "healer")).rejects.toThrow("db down");
        // both ran inside the SAME transaction call, so a real DB would roll the debit back
        expect(mockTransaction).toHaveBeenCalledTimes(1);
        expect(mockDecreaseGodStone).toHaveBeenCalledWith(
          expect.objectContaining({ trx: FAKE_TRX })
        );
        expect(mockRoleUpdate).toHaveBeenCalledWith(
          "U1",
          { role: "healer", reselect_count: 2 },
          { trx: FAKE_TRX }
        );
      });
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS.** Run `cd app && yarn test -- __tests__/service/WorldBossRoleService.test.js`. Expected failure: `Cannot find module '../../src/service/WorldBossRoleService'`.

- [ ] **Step 3: Implement the service.** Create `app/src/service/WorldBossRoleService.js`. The paid-reselect path wraps the debit + role update in one `mysql.transaction`; both receive the trx (`decreaseGodStone` via its `trx` arg, the role update via `WorldBossRole.update(..., { trx })` which toggles `setTransaction` internally — Task 1). A failed update rejects the whole transaction so the debit rolls back. First-choice gear is granted (idempotent skip on dup) AND auto-equipped.

  ```js
  const config = require("config");
  const mysql = require("../util/mysql");
  const WorldBossRole = require("../model/application/WorldBossRole");
  const WorldBossBaseGearSeeder = require("../../seeds/WorldBossBaseGearSeeder");
  const EquipmentService = require("./EquipmentService");
  const { inventory } = require("../model/application/Inventory");
  const { DefaultLogger } = require("../util/Logger");

  const VALID_ROLES = ["dps", "healer", "tank"];
  const DEFAULT_ROLE = "dps";
  const ALREADY_OWNED = "已擁有此裝備";

  function assertValidRole(role) {
    if (!VALID_ROLES.includes(role)) {
      throw new Error("無效的職業");
    }
  }

  // Lazy default (D27): legacy players have no row and read as dps.
  async function getRole(platformId) {
    const row = await WorldBossRole.find(platformId);
    return row ? row.role : DEFAULT_ROLE;
  }

  // Grant the +0 base gear set and auto-equip each granted piece so role stats
  // (atk_percent / support_power / block_power) are active without a manual #裝備.
  // EquipmentService.equip also invalidates the playerEquipment redis cache (addendum §3).
  // "Already owned" is an idempotent skip; other errors propagate.
  async function grantBaseGear(platformId, role) {
    const ids = await WorldBossBaseGearSeeder.getRoleGearIds(mysql, role);
    const granted = [];
    for (const equipmentId of ids) {
      try {
        await EquipmentService.addToInventory(platformId, equipmentId);
      } catch (err) {
        if (err && err.message === ALREADY_OWNED) {
          DefaultLogger.debug(
            `[WorldBossRoleService] ${platformId} already owns gear ${equipmentId}, skip`
          );
          continue;
        }
        throw err;
      }
      // Auto-equip only freshly granted pieces (already-owned ones may be equipped elsewhere).
      await EquipmentService.equip(platformId, equipmentId);
      granted.push(equipmentId);
    }
    return granted;
  }

  async function chooseRole(platformId, role) {
    assertValidRole(role);
    const existing = await WorldBossRole.find(platformId);
    // If a row already exists, this is a re-pick, not a first choose.
    if (existing) {
      const result = await reselectRole(platformId, role);
      return { role: result.role, granted_gear: [] };
    }
    await WorldBossRole.create({ user_id: platformId, role, reselect_count: 0 });
    const granted = await grantBaseGear(platformId, role);
    return { role, granted_gear: granted };
  }

  async function reselectRole(platformId, role) {
    assertValidRole(role);
    const existing = await WorldBossRole.find(platformId);
    if (!existing) {
      throw new Error("尚未選擇職業");
    }

    const free = existing.reselect_count === 0;
    const nextCount = existing.reselect_count + 1;

    if (free) {
      // Free path (D27 one-free-reselect): a single update, no money movement, no transaction.
      await WorldBossRole.update(platformId, { role, reselect_count: nextCount });
      return { role, free_used: true };
    }

    // Paid path: affordability check first, then debit + update atomically so a failed
    // update never leaves the player charged. decreaseGodStone writes a NEGATIVE ledger row.
    const cost = config.get("worldboss.reselect_stone_cost");
    const { amount } = await inventory.getUserMoney(platformId);
    if ((amount || 0) < cost) {
      throw new Error("女神石不足");
    }

    await mysql.transaction(async trx => {
      await inventory.decreaseGodStone({
        userId: platformId,
        amount: cost,
        note: "world_boss_role_reselect",
        trx,
      });
      await WorldBossRole.update(platformId, { role, reselect_count: nextCount }, { trx });
    });

    return { role, free_used: false };
  }

  exports.VALID_ROLES = VALID_ROLES;
  exports.getRole = getRole;
  exports.chooseRole = chooseRole;
  exports.reselectRole = reselectRole;
  ```

- [ ] **Step 4: Run the test and confirm it PASSES.** Run `cd app && yarn test -- __tests__/service/WorldBossRoleService.test.js`. Expected: all describe blocks pass (getRole 2, chooseRole 5, reselectRole 7). Then re-run the Task 1 model test to confirm the trx-aware `update` still passes: `cd app && yarn test -- __tests__/model/application/WorldBossRole.test.js`.

- [ ] **Step 5: Lint the new files.** Run `cd app && yarn lint -- src/service/WorldBossRoleService.js src/model/application/WorldBossRole.js seeds/WorldBossBaseGearSeeder.js`. Expected: no errors (double quotes, es5 trailing commas, ≤100 cols).

- [ ] **Step 6: Commit.**
  ```bash
  cd /home/hanshino/workspace/redive_linebot && git add app/src/service/WorldBossRoleService.js app/__tests__/service/WorldBossRoleService.test.js && git commit -m "feat(worldboss): WorldBossRoleService choose/reselect + idempotent gear grant + auto-equip + atomic paid reselect (D4/D5/D27/D29)"
  ```

---

### Task 4 — verify the M3-owned reselect config key is present (read-only)

> M2 does NOT add or edit `default.json` (M3 owns the entire `worldboss.*` block per addendum §10 / contract File-Structure). This task only LOCKS that the key M2's service reads actually exists. If the test fails, the fix belongs in M3.

**Files:**
- Test only: `app/__tests__/config/worldbossRoleConfig.test.js`
- (No source/config file is modified by M2.)

**Interfaces:**
- Consumes from M3: `config.get("worldboss.reselect_stone_cost")` — must be a positive number.

Steps:

- [ ] **Step 1: Write the config-presence test.** Create `app/__tests__/config/worldbossRoleConfig.test.js`. Reads the REAL config (no mock).

  ```js
  const config = require("config");

  describe("worldboss role config (owned by M3, consumed by M2)", () => {
    test("reselect_stone_cost is a positive number", () => {
      const cost = config.get("worldboss.reselect_stone_cost");
      expect(typeof cost).toBe("number");
      expect(cost).toBeGreaterThan(0);
    });
  });
  ```

- [ ] **Step 2: Run the test.** Run `cd app && yarn test -- __tests__/config/worldbossRoleConfig.test.js`.
  - If M3 has already landed its `worldboss.*` block: **PASSES** — the key is present. Done.
  - If M3 has NOT landed yet: the `config` package throws `Configuration property "worldboss.reselect_stone_cost" is not defined`. **Do NOT add the key in M2.** Record a hard dependency: M2 Task 3's runtime paid-reselect path is blocked on M3 shipping `worldboss.reselect_stone_cost` (value `5000`). M2's unit tests mock `config` and pass regardless, but the runtime path needs M3's key. Coordinate so M3 lands before M2 is deployed.

- [ ] **Step 3: Commit (test only).**
  ```bash
  cd /home/hanshino/workspace/redive_linebot && git add app/__tests__/config/worldbossRoleConfig.test.js && git commit -m "test(worldboss): lock M3-owned reselect_stone_cost config key consumed by role reselect"
  ```

---

### Task 5 — run the full M2 suite + lint as a verification gate

**Files:** none modified (verification only).

Steps:

- [ ] **Step 1: Run all M2 tests together.** Run `cd app && yarn test -- __tests__/model/application/WorldBossRole.test.js __tests__/seeds/WorldBossBaseGearSeeder.test.js __tests__/service/WorldBossRoleService.test.js __tests__/config/worldbossRoleConfig.test.js`. Expected: all suites green, 0 failures (the config test is green only if M3 has landed — see Task 4).

- [ ] **Step 2: Lint the whole milestone surface.** Run `cd app && yarn lint`. Expected: 0 errors. Fix any quote/comma/width violations before proceeding.

- [ ] **Step 3: Confirm the new migration is the latest batch.** Run `cd app && yarn knex migrate:status | tail -5` — the `seed_world_boss_base_gear` migration shows as `Up`, with no `rarity` enum error. (`down` is reversible: it deletes only the sentinel rows by name.)

- [ ] **Step 4: Hand-off note for M9/M8 drafters (no code).** Record that `WorldBossRoleService.chooseRole/reselectRole` throw user-facing Chinese errors (`無效的職業`, `尚未選擇職業`, `女神石不足`, plus equipment `裝備不存在`); the LINE controller (M9) and REST handler (M8) must `try/catch` these and surface `err.message` as immediate personal feedback (bypassing the 5-min batch per global constraint 3a). Also record: (a) base gear is **auto-equipped on first role choice** (no manual `#裝備`); (b) `support_power`/`block_power` are **integer people-counts** that only take combat effect once M4 extends `getEquipmentBonuses` (addendum §2); (c) D27 free reselect is the FIRST role CHANGE after a row exists (`reselect_count==0`), NOT the initial `chooseRole` — a rowless player's first pick is a free *choose* (grants gear) and preserves their one free reselect. No commit for this step.

---

**M2 deliverables summary (for reviewers):**
- `app/src/model/application/WorldBossRole.js` — platform_id-keyed CRUD over `world_boss_role` (M2 is the sole owner; M1 owns only the table migration). `update(userId, attrs, { trx })` toggles the Base instance transaction via `setTransaction` (because `Base.update` honors only `options.pk`, NOT `options.trx`).
- `app/seeds/WorldBossBaseGearSeeder.js` + `app/migrations/<ts>_seed_world_boss_base_gear.js` — idempotent +0 role gear, `rarity:"common"` (valid enum, addendum §9), **fraction** `atk_percent` and **integer** `support_power`/`block_power` (addendum §2), D29.
- `app/src/service/WorldBossRoleService.js` — `getRole` (lazy `dps` default, D27), `chooseRole` (free, idempotent grant + **auto-equip**, D29), `reselectRole` (first free, then **atomic** `decreaseGodStone`+update in one `mysql.transaction`, D5; negative ledger insert per addendum §13).
- `app/__tests__/config/worldbossRoleConfig.test.js` — read-only lock on the **M3-owned** `worldboss.reselect_stone_cost` key. **M2 does NOT write `default.json`.**
- Tests colocated under `app/__tests__/{model,seeds,service,config}/`.

Every signature matches the locked contract/addendum: `getRole(platformId) -> role`, `chooseRole(platformId, role) -> { role, granted_gear }`, `reselectRole(platformId, role) -> { role, free_used }`. Combat (M5) and settlement (M7) read role via `WorldBossRoleService.getRole`; no job enum is touched. M2 stays entirely in platform_id space — the numeric `user.id` identity boundary (addendum §4) is confined to M5/M6/M7.

---

## Milestone M3: Equipment enhancement layer

**Goal:** Add a deterministic equipment-enhancement sink (D8/D9/D20): one universal material, `+1` per use at `cost(L) = L * cost_base` materials (default `cost_base = 8`), hard cap `+10`, no RNG / no downgrade. The enhance multiplier scales a piece's role-combat attributes by `1 + 0.05 * enhance_level` (a full `+10` weapon ⇒ `×1.5`). `atk_percent` is a FRACTION (`0.05` ⇒ +5%, applied by combat as `Math.floor(damage * (1 + atk_percent))`); `support_power` / `block_power` are INTEGER people-counts (`Math.floor` after the multiplier). Extend the equipment-bonus read so combat consumes the enhanced role attributes; add `support_power` / `block_power` as new bonus keys. Insufficient material is rejected (no partial consume). Material decrement (negative ledger insert) + level bump run in ONE transaction with an in-trx negative-balance guard (no double-spend).

> **Milestone-naming note for the implementer/reviewer:** the locked contract file-structure table calls this cluster "M4 — Equipment enhancement layer". The drafting prompt labels it **M3**. They are the *same* work; this document uses **M3** per the prompt. The migration for `enhance_level` (`add_enhance_level_to_player_equipment`) is listed under the schema foundation (contract M1) but is re-stated and owned by this milestone's Task 1 so this milestone is independently buildable. If the foundation migration already shipped that column, Task 1's migration step is a no-op verification — see Task 1, Step 0.

### Decisions locked by this milestone (verified against the live repo; downstream milestones MUST conform)

1. **`atk_percent` unit = FRACTION (verified blocker fix; addendum §2).** Verified against the live controller: `damage = Math.floor(damage * (1 + equipBonuses.atk_percent))` and the display does `ATK+${Math.round(atk_percent * 100)}%` (`WorldBossController.js:535-536, 614-615`). So a stored `atk_percent` of `0.05` means **+5%**. Combat applies `base * (1 + atk_percent)` (NOT `/100`). This milestone keeps that convention and pins it with a test in Task 4.

2. **`support_power` / `block_power` are INTEGER people-counts, NOT fractions (verified blocker fix; addendum §2).** `support_power` is the healer revive/shield count `K`; `block_power` is the tank block strength — both are integers consumed downstream as counts (M5 `getReviveCountK`/`getShieldCountK`-style usage). When the enhance multiplier is applied to these keys the result MUST be `Math.floor`-ed back to an integer. A `+0` `support_power: 2` stays `2`; a `+10` `support_power: 2` becomes `Math.floor(2 * 1.5) = 3`. `atk_percent` is NOT floored (it is a fraction). Task 4 pins both behaviors.

3. **Enhance multiplier scales ONLY the role-combat attributes (`atk_percent`, `support_power`, `block_power`) — NOT `crit_rate` / `cost_reduction` / `exp_bonus` / `gold_bonus` (addendum §2 "effective attribute value", spec D9/D20 "strengthen your role's corresponding attribute").** Non-combat utility attributes are summed at face value with NO enhance multiplier. This is encoded by an explicit `SCALABLE_KEYS` set in `getEquipmentBonuses` and locked by a test that puts BOTH `atk_percent` and `exp_bonus` on one `+5` item and asserts only `atk_percent` is multiplied.

4. **`getEquipmentBonuses` returns a 7-key SUPERSET** (`atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus, support_power, block_power`). The existing 5-key callers (`WorldBossController.js:535/540/581/614`, `handler/Equipment/player.js`) keep working unchanged — the two extra keys default to `0` and are additive. The function is rewritten by adding keys + the per-key scaling/floor decision, preserving the existing cache structure (it reads through `getPlayerEquipment`, which keeps its 1-hour Redis cache).

5. **Equipment Redis cache invalidation (verified blocker fix; addendum §3).** `getPlayerEquipment(userId)` caches `playerEquipment:${userId}` for 1 hour (`EquipmentService.js:31-49`) and `getEquipmentBonuses` reads through it. The cached object now carries `enhance_level`, so `enhanceEquipment(...)` MUST `await redis.del(\`playerEquipment:${userId}\`)` after persisting the new `enhance_level`, mirroring the existing `redis.del` at `:67`/`:79`, or combat keeps reading stale bonuses. Task 5 pins this with a test.

6. **`default.json` config ownership (single owner).** This milestone (M3) is the **sole owner** of the `worldboss.enhance` block, the full set of `worldboss.*` combat/lifecycle tunables consumed by M5/M7/M10, and the top-level `items` block. M1, M2, M4–M10 MUST only **READ** these keys — no other milestone re-adds `worldboss.enhance`, `items`, `reselect_stone_cost`, or `cold_start_max_hp`. The existing `worldboss` object (verified: `daily_limit`, `penalty_rate`, `money_revoke_attack_cost`, `revoke_charm`, `manual`) is **merged into**, never replaced.

7. **`items` block shape = object `{ itemId, name }`.** `items.goddess_stone = { itemId: 999, name: "女神石" }`, `items.enhancement_material = { itemId: 1001, name: "強化素材" }`. There are NO `worldboss.stone_item_id` scalar keys. The canonical numeric ids live as hardcoded constants in `WorldBossConfig` (`GODDESS_STONE_ITEM_ID = 999`, `ENHANCEMENT_MATERIAL_ITEM_ID = 1001`); the `items` block is documentation/registry only.

8. **`WorldBossConfig` exposes the FULL accessor surface with ONE naming convention.** Global tunables → plain `get*()` getters. Dead-column-with-fallback readers (D25; read a value off the boss row, fall back to config) → `read*(boss)`. Every combat/lifecycle milestone (M5/M7/M10) MUST call exactly these names. The complete list is implemented in Task 2 so combat tests bind to real functions, not phantom mocks. (Dead-column mapping per addendum §7: `attack`→enrage counter rate %, `defense`→entry-batch size N, `speed`→enrage HP threshold %, `luck`→natural-recovery minutes; `gold`→abandoned.)

9. **Ledger signs (addendum §13).** Ledger balance = `SUM(itemAmount)`. A SPEND (enhance cost) is a NEGATIVE `itemAmount` insert; a GRANT would be positive. Enhancement is a SPEND, so its ledger row is negative. Mirror `Inventory.decreaseGodStone`'s exact format `itemAmount: \`${-cost}\`` (string), but write item `1001` (not `999`) directly via `trx("Inventory").insert([...])`.

### Inherited global constraints (a reviewer rejects any task that violates one)

- Backend is CommonJS (`require` / `module.exports`). ESLint: double quotes, `es5` trailing commas, 100-char print width.
- Migrations created ONLY via `cd app && yarn knex migrate:make <name>`, then edit the generated file. Never hand-author the timestamp/path.
- Money/material grants and decrements run through the `Inventory` append-ledger (`app/src/model/application/Inventory.js`; columns `userId`, `itemId`, `itemAmount`, `note`). `GODDESS_STONE_ITEM_ID = 999`; enhancement material `ENHANCEMENT_MATERIAL_ITEM_ID = 1001`.
- Jest in `app/` (`__tests__/` dirs). Run a single file: `cd app && yarn test -- <path>`. CRITICAL: `app/jest.config` has `transform: {}` → `jest.mock(...)` is NOT hoisted → every `jest.mock(...)` MUST appear BEFORE any `require()` of the mocked module.
- Branch `feat/worldboss-redesign`. Never commit to main.
- Config read pattern in this repo: `const config = require("config"); config.get("worldboss.enhance.max_level")`.
- `equipment.rarity` is the enum `["common","rare","epic","legendary"]` (migration `20260227090000`). Test fixtures use those strings — NEVER `"R"` and NEVER a numeric rarity (addendum §9).

---

### Task 1 — Migration: `enhance_level` column on `player_equipment`

**Files:**
- Create (via generator): `app/migrations/<ts>_add_enhance_level_to_player_equipment.js`
- Test: none (migrations are verified by running them; see Step 3).

**Interfaces:**
- Consumes: nothing.
- Produces: column `player_equipment.enhance_level` (`int`, `not null`, `default 0`) — consumed by Task 3 (model fillable) and Task 4 (`getWithEnhance` / `getByUserId` rows).

Steps:

- [ ] **Step 0: Check whether the column already exists (the schema foundation may have shipped it).** Run:
```
cd /home/hanshino/workspace/redive_linebot/app && node -e "const m=require('./src/util/mysql'); m.raw(\"SHOW COLUMNS FROM player_equipment LIKE 'enhance_level'\").then(([r])=>{console.log(r.length?'PRESENT':'ABSENT');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```
If it prints `PRESENT`, the foundation migration already added it — SKIP the rest of Task 1 and proceed to Task 2. If `ABSENT` (or the connection errors because infra is down — then run `make infra` first), continue at Step 1.
- [ ] **Step 1: Generate the migration file.** Run `cd /home/hanshino/workspace/redive_linebot/app && yarn knex migrate:make add_enhance_level_to_player_equipment`. Note the generated path printed by the command, e.g. `app/migrations/20260620XXXXXX_add_enhance_level_to_player_equipment.js`.
- [ ] **Step 2: Write the migration body.** Open the generated file and replace its entire contents with (mirrors the verified `20210728152528_add_columns_at_guild_table.js` and `20260227090001_create_player_equipment.js` patterns):
```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.table("player_equipment", function (table) {
    table
      .integer("enhance_level")
      .notNullable()
      .defaultTo(0)
      .comment("裝備強化等級，0~10，角色屬性 effective = base*(1+0.05*level)");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.table("player_equipment", function (table) {
    table.dropColumn("enhance_level");
  });
};
```
- [ ] **Step 3: Run the migration and verify the column lands.** Run `cd /home/hanshino/workspace/redive_linebot/app && yarn migrate`. Expect output ending in `Batch N run: 1 migrations`. Then verify the column exists using the repo's own connection:
```
cd /home/hanshino/workspace/redive_linebot/app && node -e "const m=require('./src/util/mysql'); m.raw(\"SHOW COLUMNS FROM player_equipment LIKE 'enhance_level'\").then(([r])=>{console.log(r);process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"
```
Expect one row with `Field: enhance_level`, `Type: int(...)`, `Default: 0`, `Null: NO`.
- [ ] **Step 4: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/migrations && git commit -m "feat(worldboss): add enhance_level column to player_equipment (D9)"
```

---

### Task 2 — Config knobs + shared item-id constants + full `WorldBossConfig` accessor surface

**Files:**
- Modify: `app/config/default.json` — MERGE `worldboss.enhance.*` + the `worldboss.*` combat/lifecycle tunables consumed downstream into the EXISTING `worldboss` object; add the top-level `items` block.
- Create: `app/src/service/WorldBossConfig.js` — item-id constants + the full accessor surface (global `get*()` + dead-column `read*(boss)`).
- Test: `app/src/service/__tests__/WorldBossConfig.test.js`

**Interfaces:**
- Consumes: nothing (reads the `config` package).
- Produces (consumed by Tasks 4/5 here, and by M5 combat / M7 lifecycle / M10 sim):
```js
// Item-id constants (canonical; config items block is documentation only)
exports.GODDESS_STONE_ITEM_ID;        // 999
exports.ENHANCEMENT_MATERIAL_ITEM_ID; // 1001

// Enhance (this milestone)
exports.getEnhanceMaxLevel();         // number, default 10
exports.getEnhancePerLevelPct();      // number, default 0.05
exports.getEnhanceCost(targetLevel);  // materials to reach targetLevel = targetLevel * cost_base

// Global combat/lifecycle tunables (plain getters) — consumed by M5/M7/M10
exports.getDailyLimit();              // default 100
exports.getNormalAttackCost();        // default 10
exports.getEnrageDamageMultiplier();  // default 2
exports.getEnrageContributionMultiplier(); // default 2
exports.getReviveCountK();            // default 2
exports.getShieldCountK();            // default 2
exports.getBlockWindowMinutes();      // default 5
exports.getReselectStoneCost();       // default 5000
exports.getOpenHour();                // default 4
exports.getBossPool();                // number[] (default [])
exports.getColdStartMaxHp();          // default 0 (M10 reads; M3 defines)
exports.getReward();                  // { participation, expired_participation, rank_bands, mvp_stones }

// Dead-column-with-fallback readers (D25; addendum §7): read off boss row, else config.
// `boss` may be undefined (then pure config default). read*(boss) NEVER throws on null boss.
exports.readEnrageThresholdPct(boss);    // boss.speed   || worldboss.enrage_threshold_pct (35)
exports.readEnrageBatchSize(boss);       // boss.defense || worldboss.enrage_batch_size (20)
exports.readEnrageRecentMinutes();       //              worldboss.enrage_recent_minutes (10) [no dead col]
exports.readEnrageCounterRate(boss);     // boss.attack  || worldboss.enrage_counter_rate (0.15)
exports.readNaturalRecoveryMinutes(boss);// boss.luck    || worldboss.natural_recovery_minutes (15)
```

Steps:

- [ ] **Step 1: Write the failing test FIRST.** Create `app/src/service/__tests__/WorldBossConfig.test.js`. No mocks needed (it reads the real `config` package, which loads `app/config/default.json`).
```js
const WorldBossConfig = require("../WorldBossConfig");

describe("WorldBossConfig", () => {
  it("exposes the canonical item ids", () => {
    expect(WorldBossConfig.GODDESS_STONE_ITEM_ID).toBe(999);
    expect(WorldBossConfig.ENHANCEMENT_MATERIAL_ITEM_ID).toBe(1001);
  });

  it("reads enhance tunables from config with the documented defaults", () => {
    expect(WorldBossConfig.getEnhanceMaxLevel()).toBe(10);
    expect(WorldBossConfig.getEnhancePerLevelPct()).toBeCloseTo(0.05, 5);
  });

  it("computes deterministic per-level cost = targetLevel * cost_base (8)", () => {
    expect(WorldBossConfig.getEnhanceCost(1)).toBe(8); // +0 -> +1
    expect(WorldBossConfig.getEnhanceCost(2)).toBe(16); // +1 -> +2
    expect(WorldBossConfig.getEnhanceCost(10)).toBe(80); // +9 -> +10
  });

  it("exposes the global combat/lifecycle getters with documented defaults", () => {
    expect(WorldBossConfig.getNormalAttackCost()).toBe(10);
    expect(WorldBossConfig.getEnrageDamageMultiplier()).toBe(2);
    expect(WorldBossConfig.getEnrageContributionMultiplier()).toBe(2);
    expect(WorldBossConfig.getReviveCountK()).toBe(2);
    expect(WorldBossConfig.getShieldCountK()).toBe(2);
    expect(WorldBossConfig.getBlockWindowMinutes()).toBe(5);
    expect(WorldBossConfig.getReselectStoneCost()).toBe(5000);
    expect(WorldBossConfig.getOpenHour()).toBe(4);
    expect(WorldBossConfig.getColdStartMaxHp()).toBe(0);
    expect(Array.isArray(WorldBossConfig.getBossPool())).toBe(true);
    expect(WorldBossConfig.getReward().participation).toBe(15);
    expect(WorldBossConfig.getReward().mvp_stones).toBe(30);
  });

  it("read*(boss) prefers the boss dead-column when truthy, else config fallback", () => {
    // pure config (no boss)
    expect(WorldBossConfig.readEnrageThresholdPct()).toBe(35);
    expect(WorldBossConfig.readEnrageBatchSize()).toBe(20);
    expect(WorldBossConfig.readEnrageCounterRate()).toBeCloseTo(0.15, 5);
    expect(WorldBossConfig.readNaturalRecoveryMinutes()).toBe(15);
    expect(WorldBossConfig.readEnrageRecentMinutes()).toBe(10);
    // boss dead-columns override
    const boss = { attack: 25, defense: 30, speed: 40, luck: 5 };
    expect(WorldBossConfig.readEnrageCounterRate(boss)).toBe(25);
    expect(WorldBossConfig.readEnrageBatchSize(boss)).toBe(30);
    expect(WorldBossConfig.readEnrageThresholdPct(boss)).toBe(40);
    expect(WorldBossConfig.readNaturalRecoveryMinutes(boss)).toBe(5);
    // zero/falsy dead-column falls back to config
    expect(WorldBossConfig.readEnrageBatchSize({ defense: 0 })).toBe(20);
  });
});
```
- [ ] **Step 2: Run it and confirm it FAILS.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/service/__tests__/WorldBossConfig.test.js`. Expect failure: `Cannot find module '../WorldBossConfig'`.
- [ ] **Step 3: Merge config keys into the EXISTING `worldboss` object.** Edit `app/config/default.json`. The `worldboss` object already exists (verified — it has `daily_limit`, `penalty_rate`, `money_revoke_attack_cost`, `revoke_charm`, `manual`). Do NOT replace it; ADD the keys below as new members of that SAME object. Insert them right after the existing `"daily_limit": 100,` line (each inserted line ends with a comma since `penalty_rate` follows the block):
```json
    "normal_attack_cost": 10,
    "enrage_threshold_pct": 35,
    "enrage_batch_size": 20,
    "enrage_recent_minutes": 10,
    "enrage_counter_rate": 0.15,
    "enrage_damage_multiplier": 2,
    "enrage_contribution_multiplier": 2,
    "natural_recovery_minutes": 15,
    "revive_count_k": 2,
    "shield_count_k": 2,
    "block_window_minutes": 5,
    "reselect_stone_cost": 5000,
    "enhance": { "max_level": 10, "per_level_pct": 0.05, "cost_base": 8 },
    "reward": {
      "participation": 15,
      "expired_participation": 5,
      "rank_bands": { "p1": 50, "p5": 35, "p20": 20, "rest": 8 },
      "mvp_stones": 30
    },
    "open_hour": 4,
    "cold_start_max_hp": 0,
    "boss_pool": [],
```
Then add a NEW top-level `"items"` object as a sibling of `"worldboss"` (top-level `items` is verified MISSING). Place it immediately after the closing `}` of the `worldboss` object:
```json
  "items": {
    "goddess_stone": { "itemId": 999, "name": "女神石" },
    "enhancement_material": { "itemId": 1001, "name": "強化素材" }
  },
```
> Single-owner reminder: NO other milestone re-adds any of these keys. `worldboss.cold_start_max_hp` is defined HERE (default `0`); M10 only READS it. `worldboss.reselect_stone_cost` is defined HERE; M2 only READS it. `worldboss.boss_pool` is the daily-rotation pool seeded/filled by M7 at deploy — default `[]` here.
- [ ] **Step 4: Validate the JSON parses and the merged keys resolve.** Run:
```
cd /home/hanshino/workspace/redive_linebot/app && node -e "const c=require('config'); console.log('cost_base', c.get('worldboss.enhance.cost_base')); console.log('daily_limit', c.get('worldboss.daily_limit')); console.log('penalty_rate', c.get('worldboss.penalty_rate')); console.log('mat', c.get('items.enhancement_material.itemId'));"
```
Expect `cost_base 8`, `daily_limit 100`, `penalty_rate 0.1` (proves the existing keys survived the merge), `mat 1001`. (A trailing-comma or brace mistake throws here.)
- [ ] **Step 5: Write the implementation.** Create `app/src/service/WorldBossConfig.js`:
```js
const config = require("config");

const GODDESS_STONE_ITEM_ID = 999;
const ENHANCEMENT_MATERIAL_ITEM_ID = 1001;

exports.GODDESS_STONE_ITEM_ID = GODDESS_STONE_ITEM_ID;
exports.ENHANCEMENT_MATERIAL_ITEM_ID = ENHANCEMENT_MATERIAL_ITEM_ID;

// --- Enhance ---
exports.getEnhanceMaxLevel = () => config.get("worldboss.enhance.max_level");
exports.getEnhancePerLevelPct = () => config.get("worldboss.enhance.per_level_pct");

/**
 * Materials required to enhance from (targetLevel - 1) to targetLevel.
 * Deterministic, no RNG: cost(L) = L * cost_base.
 * @param {Number} targetLevel the level being reached (1..max)
 * @returns {Number} material count
 */
exports.getEnhanceCost = targetLevel => {
  const costBase = config.get("worldboss.enhance.cost_base");
  return targetLevel * costBase;
};

// --- Global combat/lifecycle tunables (plain getters) ---
exports.getDailyLimit = () => config.get("worldboss.daily_limit");
exports.getNormalAttackCost = () => config.get("worldboss.normal_attack_cost");
exports.getEnrageDamageMultiplier = () => config.get("worldboss.enrage_damage_multiplier");
exports.getEnrageContributionMultiplier = () =>
  config.get("worldboss.enrage_contribution_multiplier");
exports.getReviveCountK = () => config.get("worldboss.revive_count_k");
exports.getShieldCountK = () => config.get("worldboss.shield_count_k");
exports.getBlockWindowMinutes = () => config.get("worldboss.block_window_minutes");
exports.getReselectStoneCost = () => config.get("worldboss.reselect_stone_cost");
exports.getOpenHour = () => config.get("worldboss.open_hour");
exports.getColdStartMaxHp = () => config.get("worldboss.cold_start_max_hp");
exports.getBossPool = () => config.get("worldboss.boss_pool");
exports.getReward = () => config.get("worldboss.reward");

// --- Dead-column-with-fallback readers (D25; addendum §7) ---
// boss may be undefined -> pure config default. A boss column counts only when truthy (> 0).
const deadColumn = (boss, col, configPath) => {
  const v = boss && boss[col];
  return v ? v : config.get(configPath);
};

exports.readEnrageThresholdPct = boss =>
  deadColumn(boss, "speed", "worldboss.enrage_threshold_pct");
exports.readEnrageBatchSize = boss => deadColumn(boss, "defense", "worldboss.enrage_batch_size");
exports.readEnrageCounterRate = boss => deadColumn(boss, "attack", "worldboss.enrage_counter_rate");
exports.readNaturalRecoveryMinutes = boss =>
  deadColumn(boss, "luck", "worldboss.natural_recovery_minutes");
// No dead column for recent-minutes; pure config.
exports.readEnrageRecentMinutes = () => config.get("worldboss.enrage_recent_minutes");
```
- [ ] **Step 6: Run the test and confirm it PASSES.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/service/__tests__/WorldBossConfig.test.js`. Expect `5 passed`.
- [ ] **Step 7: Lint.** `cd /home/hanshino/workspace/redive_linebot/app && yarn lint -- src/service/WorldBossConfig.js`. Expect no errors.
- [ ] **Step 8: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/config/default.json app/src/service/WorldBossConfig.js app/src/service/__tests__/WorldBossConfig.test.js && git commit -m "feat(worldboss): worldboss config (sole owner) + WorldBossConfig full accessor surface (D8/D25)"
```

---

### Task 3 — `PlayerEquipment` model: `enhance_level` fillable + `setEnhanceLevel` + `getWithEnhance`

**Files:**
- Modify: `app/src/model/application/PlayerEquipment.js` — add `enhance_level` to `fillable` (line 78); add `setEnhanceLevel` and `getWithEnhance` methods + exports.
- Test: `app/src/model/application/__tests__/PlayerEquipment.test.js`

**Interfaces:**
- Consumes: `player_equipment.enhance_level` (Task 1).
- Produces (consumed by Task 5):
```js
exports.setEnhanceLevel = (userId, equipmentId, level, trx) => Promise<number>; // rows updated
exports.getWithEnhance  = (userId, equipmentId) => Promise<row|undefined>;       // joined row incl. enhance_level + attributes
```

Steps:

- [ ] **Step 1: Write the failing test FIRST.** The model imports `../../util/mysql`, which opens a real DB pool; mock it so the test is pure-unit. Because `app/jest.config` has `transform: {}`, the `jest.mock` MUST come before the `require` of `PlayerEquipment`. Create `app/src/model/application/__tests__/PlayerEquipment.test.js`:
```js
// jest.mock is NOT hoisted in this repo (transform:{}) -> declare before requiring the SUT.
const mockKnex = {
  where: jest.fn().mockReturnThis(),
  update: jest.fn().mockResolvedValue(1),
  leftJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue({ equipment_id: 7, enhance_level: 3 }),
};
// mysql is called both as `mysql(table)` and as `mysql.fn.now()`.
const mockMysql = jest.fn(() => mockKnex);
mockMysql.fn = { now: jest.fn(() => "NOW()") };

jest.mock("../../../util/mysql", () => mockMysql);

const PlayerEquipment = require("../PlayerEquipment");

describe("PlayerEquipment enhance helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("setEnhanceLevel updates the matching owned row to the new level (no trx)", async () => {
    const updated = await PlayerEquipment.setEnhanceLevel("U123", 7, 4);
    expect(mockMysql).toHaveBeenCalledWith("player_equipment");
    expect(mockKnex.where).toHaveBeenCalledWith({ user_id: "U123", equipment_id: 7 });
    expect(mockKnex.update).toHaveBeenCalledWith(
      expect.objectContaining({ enhance_level: 4 })
    );
    expect(updated).toBe(1);
  });

  it("setEnhanceLevel uses the passed trx when provided", async () => {
    const trxKnex = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
    };
    const trx = jest.fn(() => trxKnex);
    await PlayerEquipment.setEnhanceLevel("U123", 7, 5, trx);
    expect(trx).toHaveBeenCalledWith("player_equipment");
    expect(trxKnex.update).toHaveBeenCalledWith(
      expect.objectContaining({ enhance_level: 5 })
    );
    // The default (non-trx) knex must NOT be touched for the update.
    expect(mockKnex.update).not.toHaveBeenCalled();
  });

  it("getWithEnhance returns the joined row including enhance_level", async () => {
    const row = await PlayerEquipment.getWithEnhance("U123", 7);
    expect(mockKnex.leftJoin).toHaveBeenCalledWith(
      "equipment",
      "player_equipment.equipment_id",
      "equipment.id"
    );
    expect(mockKnex.where).toHaveBeenCalledWith({
      "player_equipment.user_id": "U123",
      "player_equipment.equipment_id": 7,
    });
    expect(row).toEqual({ equipment_id: 7, enhance_level: 3 });
  });
});
```
- [ ] **Step 2: Run it and confirm it FAILS.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/model/application/__tests__/PlayerEquipment.test.js`. Expect failure: `PlayerEquipment.setEnhanceLevel is not a function`.
- [ ] **Step 3: Add `enhance_level` to fillable.** In `app/src/model/application/PlayerEquipment.js`, edit the `new PlayerEquipment({...})` fillable array (currently line 78):
```js
  fillable: ["user_id", "equipment_id", "slot", "is_equipped", "enhance_level"],
```
- [ ] **Step 4: Add the two methods to the class.** Insert these two methods into the `PlayerEquipment` class body, immediately after `hasItem` (after line 73, before the closing `}` of the class on line 74). NOTE: `setEnhanceLevel` resolves the table builder explicitly (`trx ? trx(TABLE) : mysql(TABLE)`) — it does NOT use `this.knex`, because the test asserts `mysql("player_equipment")` is called and because the enhancement runs in a one-shot per-call trx (using the shared `this.knex` singleton would risk a leaked transaction across requests):
```js
  async setEnhanceLevel(userId, equipmentId, level, trx) {
    const db = trx ? trx(TABLE) : mysql(TABLE);
    return await db
      .where({ user_id: userId, equipment_id: equipmentId })
      .update({ enhance_level: level, updated_at: mysql.fn.now() });
  }

  async getWithEnhance(userId, equipmentId) {
    return await mysql(TABLE)
      .select(...EQUIPMENT_COLUMNS)
      .leftJoin("equipment", "player_equipment.equipment_id", "equipment.id")
      .where({
        "player_equipment.user_id": userId,
        "player_equipment.equipment_id": equipmentId,
      })
      .first();
  }
```
> `EQUIPMENT_COLUMNS` already includes `player_equipment.*`, so `enhance_level` rides along in the joined row automatically once the column exists (Task 1).
- [ ] **Step 5: Add the exports.** At the bottom of the file, after the existing `exports.hasItem = ...` line (line 89), add:
```js
exports.setEnhanceLevel = (userId, equipmentId, level, trx) =>
  model.setEnhanceLevel(userId, equipmentId, level, trx);
exports.getWithEnhance = (userId, equipmentId) => model.getWithEnhance(userId, equipmentId);
```
- [ ] **Step 6: Run the test and confirm it PASSES.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/model/application/__tests__/PlayerEquipment.test.js`. Expect `3 passed`.
- [ ] **Step 7: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/src/model/application/PlayerEquipment.js app/src/model/application/__tests__/PlayerEquipment.test.js && git commit -m "feat(worldboss): PlayerEquipment enhance_level fillable + setEnhanceLevel/getWithEnhance (D9)"
```

---

### Task 4 — `EquipmentService.getEquipmentBonuses`: scale ONLY role attributes by enhance, floor integer counts, add `support_power` / `block_power`

**Files:**
- Modify: `app/src/service/EquipmentService.js` — carry `enhance_level` into the equipped-item shape in `getPlayerEquipment` (lines 40-46); add `support_power` / `block_power` keys to `getEquipmentBonuses`; apply `base * (1 + per_level_pct * enhance_level)` ONLY to the scalable role attributes, with `Math.floor` on the integer count attributes.
- Test: `app/src/service/__tests__/EquipmentService.bonuses.test.js`

**Interfaces:**
- Consumes: `WorldBossConfig.getEnhancePerLevelPct` (Task 2); `PlayerEquipmentModel.getByUserId` rows now carry `enhance_level` (the model does `select("player_equipment.*", ...)`, so it rides along after Task 1).
- Produces (consumed by Task 5 here + M5 combat):
```js
exports.getEquipmentBonuses = (userId) => Promise<{
  atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus, support_power, block_power
}>;
// atk_percent / crit_rate / cost_reduction / exp_bonus / gold_bonus are numbers (atk_percent is a
//   FRACTION; combat applies base*(1+atk_percent)).
// support_power / block_power are INTEGER people-counts (Math.floor after enhance scaling).
// Only atk_percent / support_power / block_power are scaled by enhance_level.
```

Steps:

- [ ] **Step 1: Write the failing test FIRST.** Mocks the model deps + `WorldBossConfig` + `redis`, declared before requiring the SUT (no hoisting). The test pins (a) the `atk_percent` FRACTION convention, (b) the integer-count nature of `support_power`/`block_power` with `Math.floor`, and (c) the scale-only-role-attributes decision. Fixtures use the real `rarity` enum string `"common"` (addendum §9). Create `app/src/service/__tests__/EquipmentService.bonuses.test.js`:
```js
// jest.mock NOT hoisted (transform:{}) -> all mocks before requiring EquipmentService.
jest.mock("../../model/application/PlayerEquipment", () => ({
  getByUserId: jest.fn(),
}));
jest.mock("../../model/application/Equipment", () => ({
  find: jest.fn(),
}));
jest.mock("../../util/redis", () => ({
  get: jest.fn().mockResolvedValue(null), // force a DB read path, never serve cache
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
}));
jest.mock("../WorldBossConfig", () => ({
  getEnhancePerLevelPct: jest.fn(() => 0.05),
}));

const PlayerEquipmentModel = require("../../model/application/PlayerEquipment");
const EquipmentService = require("../EquipmentService");

describe("EquipmentService.getEquipmentBonuses with enhance_level", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sums base FRACTION atk_percent when all gear is +0; new keys default to 0", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "weapon",
        equipment_id: 1,
        name: "w",
        rarity: "common",
        image_url: "",
        enhance_level: 0,
        attributes: JSON.stringify({ atk_percent: 0.1 }), // fraction = +10%
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    expect(b.atk_percent).toBeCloseTo(0.1, 5);
    expect(b.support_power).toBe(0);
    expect(b.block_power).toBe(0);
  });

  it("applies base*(1+0.05*level) to atk_percent: +10 weapon -> 1.5x the stored fraction", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "weapon",
        equipment_id: 1,
        name: "w",
        rarity: "common",
        image_url: "",
        enhance_level: 10,
        attributes: JSON.stringify({ atk_percent: 0.2 }), // +20% base
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    // 0.2 * (1 + 0.05*10) = 0.2 * 1.5 = 0.3 ; fractions are NOT floored
    expect(b.atk_percent).toBeCloseTo(0.3, 5);
  });

  it("scales ONLY role attributes (atk/support/block); leaves exp_bonus unscaled", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "weapon",
        equipment_id: 1,
        name: "w",
        rarity: "common",
        image_url: "",
        enhance_level: 5,
        // one item carrying BOTH a scalable role attr and a non-combat utility attr
        attributes: JSON.stringify({ atk_percent: 0.1, exp_bonus: 100 }),
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    // atk_percent scaled: 0.1 * (1 + 0.05*5) = 0.1 * 1.25 = 0.125
    expect(b.atk_percent).toBeCloseTo(0.125, 5);
    // exp_bonus NOT scaled: stays 100
    expect(b.exp_bonus).toBe(100);
  });

  it("support_power/block_power are INTEGER counts, floored after enhance scaling", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "accessory",
        equipment_id: 2,
        name: "staff",
        rarity: "rare",
        image_url: "",
        enhance_level: 10,
        // support_power is a people-count; 2 * (1 + 0.05*10) = 2 * 1.5 = 3 (exact int)
        attributes: JSON.stringify({ support_power: 2 }),
      },
      {
        slot: "armor",
        equipment_id: 3,
        name: "shield",
        rarity: "rare",
        image_url: "",
        enhance_level: 5,
        // block_power 3 * (1 + 0.05*5) = 3 * 1.25 = 3.75 -> Math.floor -> 3
        attributes: JSON.stringify({ block_power: 3 }),
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    expect(b.support_power).toBe(3);
    expect(Number.isInteger(b.support_power)).toBe(true);
    expect(b.block_power).toBe(3); // floored from 3.75
    expect(Number.isInteger(b.block_power)).toBe(true);
  });

  it("sums integer counts across pieces and floors each piece independently", async () => {
    PlayerEquipmentModel.getByUserId.mockResolvedValue([
      {
        slot: "accessory",
        equipment_id: 2,
        name: "staff",
        rarity: "common",
        image_url: "",
        enhance_level: 1,
        // 1 * (1 + 0.05*1) = 1.05 -> floor 1
        attributes: JSON.stringify({ support_power: 1 }),
      },
      {
        slot: "weapon",
        equipment_id: 4,
        name: "wand",
        rarity: "common",
        image_url: "",
        enhance_level: 0,
        attributes: JSON.stringify({ support_power: 2 }),
      },
    ]);
    const b = await EquipmentService.getEquipmentBonuses("U1");
    // floor(1.05)=1 plus 2 = 3 (NOT floor(1.05+2)=3 by coincidence; floor is per-piece)
    expect(b.support_power).toBe(3);
  });
});
```
- [ ] **Step 2: Run it and confirm it FAILS.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/service/__tests__/EquipmentService.bonuses.test.js`. Expect failures: `b.support_power` is `undefined`, and the `+10 atk_percent` case returns `0.2` not `0.3`.
- [ ] **Step 3: Carry `enhance_level` into the equipped-item shape.** In `app/src/service/EquipmentService.js`, in `getPlayerEquipment`, the loop builds `result[row.slot]` (lines 40-46). Add `enhance_level`:
```js
    result[row.slot] = {
      id: row.equipment_id,
      name: row.name,
      rarity: row.rarity,
      image_url: row.image_url,
      enhance_level: row.enhance_level || 0,
      attributes: attrs,
    };
```
> The Redis cache (`playerEquipment:{userId}`, 1h TTL, line 49) stores this object as JSON, so `enhance_level` is cached too. Task 5 invalidates that key after enhancing (addendum §3 — see Task 5 Step 4).
- [ ] **Step 4: Require `WorldBossConfig` at the top of the file.** After line 3 (`const redis = require("../util/redis");`) add:
```js
const WorldBossConfig = require("./WorldBossConfig");
```
- [ ] **Step 5: Rewrite `getEquipmentBonuses` (lines 103-131).** Replace the JSDoc block + the whole function body with the version below. It adds the two new keys, introduces an explicit `SCALABLE_KEYS` set (only role attributes get the enhance multiplier) and an `INTEGER_KEYS` set (counts are `Math.floor`-ed per piece), and preserves the read-through-cache structure (still calls `getPlayerEquipment`):
```js
// Only these role-combat attributes are scaled by enhance_level (D9/D20).
// Non-combat utility attrs (crit_rate, cost_reduction, exp_bonus, gold_bonus) are summed at face value.
const SCALABLE_KEYS = ["atk_percent", "support_power", "block_power"];
// These role attributes are INTEGER people-counts (addendum §2): floor after the enhance multiplier.
const INTEGER_KEYS = ["support_power", "block_power"];

/**
 * Calculate total equipment bonuses for a user.
 * atk_percent is a FRACTION (0.05 => +5%); combat applies base*(1+atk_percent).
 * support_power / block_power are INTEGER people-counts (floored after scaling).
 * Role attributes (atk_percent/support_power/block_power) are scaled by enhance_level:
 *   effective = base * (1 + per_level_pct * enhance_level), per piece.
 * Returns 7-key superset: { atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus,
 *   support_power, block_power }. The extra keys default to 0 so existing 5-key callers are safe.
 */
exports.getEquipmentBonuses = async userId => {
  const equipped = await exports.getPlayerEquipment(userId);
  const perLevelPct = WorldBossConfig.getEnhancePerLevelPct();

  const bonuses = {
    atk_percent: 0,
    crit_rate: 0,
    cost_reduction: 0,
    exp_bonus: 0,
    gold_bonus: 0,
    support_power: 0,
    block_power: 0,
  };

  for (const slot of VALID_SLOTS) {
    const item = equipped[slot];
    if (!item || !item.attributes) continue;
    const attrs = item.attributes;
    const level = item.enhance_level || 0;
    const multiplier = 1 + perLevelPct * level;

    for (const key of Object.keys(bonuses)) {
      if (!attrs[key]) continue;
      let value = SCALABLE_KEYS.includes(key) ? attrs[key] * multiplier : attrs[key];
      if (INTEGER_KEYS.includes(key)) value = Math.floor(value);
      bonuses[key] += value;
    }
  }

  return bonuses;
};
```
- [ ] **Step 6: Run the test and confirm it PASSES.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/service/__tests__/EquipmentService.bonuses.test.js`. Expect `5 passed`.
- [ ] **Step 7: Confirm no regression in existing 5-key callers.** Run any existing WorldBoss controller test suite to verify the additive keys did not break the controller display/damage path (the live `WorldBossController.js:535-536,614` reads `atk_percent` as a fraction — unchanged by this task):
```
cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/controller/application/__tests__/ 2>&1 | tail -20 || echo "no existing controller tests; manual review of WorldBossController.js:535-536,614 confirms atk_percent fraction usage unchanged"
```
- [ ] **Step 8: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/src/service/EquipmentService.js app/src/service/__tests__/EquipmentService.bonuses.test.js && git commit -m "feat(worldboss): scale role attrs by enhance_level (atk fraction, support/block int floor) + new bonus keys (D20)"
```

---

### Task 5 — `EquipmentService.enhanceEquipment`: deterministic `+1` sink with in-trx double-spend guard

**Files:**
- Modify: `app/src/service/EquipmentService.js` — add `enhanceEquipment(userId, equipmentId)` + `Inventory` / `mysql` requires.
- Test: `app/src/service/__tests__/EquipmentService.enhance.test.js`

**Interfaces:**
- Consumes: `PlayerEquipmentModel.getWithEnhance` / `setEnhanceLevel` (Task 3); `WorldBossConfig.getEnhanceMaxLevel` / `getEnhanceCost` / `ENHANCEMENT_MATERIAL_ITEM_ID` (Task 2); the `Inventory` append-ledger (`Inventory.inventory.getUserOwnCountByItemId` for the fast pre-check; a direct `trx("Inventory")` negative-`itemAmount` insert + in-trx re-sum for the spend).
- Produces (consumed by Task 6 controller + M8 REST):
```js
exports.enhanceEquipment = (userId, equipmentId) => Promise<{
  equipmentId, fromLevel, toLevel, cost, remainingMaterials
}>;
// throws Error("裝備不存在") | Error("已達強化上限") | Error("強化素材不足")
```

> **Cost / cap rules (deterministic, no RNG, no downgrade):** to go from `L` to `L+1`, cost `= getEnhanceCost(L+1) = (L+1) * 8` materials. Cap at `getEnhanceMaxLevel()` (10): at `+10`, throw `已達強化上限`. If owned material `<` cost, throw `強化素材不足` and consume nothing.
>
> **Atomicity + double-spend guard (no hand-wave):** the whole operation runs in ONE `mysql.transaction`. Inside the trx, in order: (1) insert the negative material ledger row via `trx("Inventory").insert([...])` (item `1001`, `itemAmount: \`${-cost}\``, addendum §9/§13 — a spend is negative); (2) re-sum the player's material balance **inside the same trx** by querying `trx("Inventory").sum(...)` directly (NOT a model `setTransaction` bind — the base-model `knex` getter calls `this.trx.isCompleted()`, which the trx callback object does not expose, so a direct `trx(...)` query is the robust path); (3) if that post-decrement balance is `< 0`, `throw` to roll the whole trx back (so two concurrent `#強化` cannot both pass — the second's post-insert sum sees both negatives and rolls itself back); (4) bump `setEnhanceLevel` inside the same trx. A cheap pre-check (sum BEFORE the trx, via `Inventory.inventory.getUserOwnCountByItemId`) runs first to fail fast with the friendly `強化素材不足` message without opening a trx in the common case. The authoritative guard is the in-trx re-sum. After the trx commits, invalidate `playerEquipment:{userId}` (addendum §3).

Steps:

- [ ] **Step 1: Write the failing test FIRST.** Mocks declared before requiring the SUT. We mock `PlayerEquipment`, `Inventory`, `WorldBossConfig`, `redis`, and `mysql` (for `mysql.transaction`). The trx is a callable builder: `trx("Inventory").insert(...)` for the spend, `trx("Inventory").sum(...).where(...).first()` for the in-trx re-sum; the pre-check uses `Inventory.inventory.getUserOwnCountByItemId`. Create `app/src/service/__tests__/EquipmentService.enhance.test.js`:
```js
// jest.mock NOT hoisted (transform:{}) -> declare ALL mocks before requiring EquipmentService.
jest.mock("../../model/application/PlayerEquipment", () => ({
  getWithEnhance: jest.fn(),
  setEnhanceLevel: jest.fn().mockResolvedValue(1),
}));
jest.mock("../../model/application/Equipment", () => ({
  find: jest.fn(),
}));
jest.mock("../../util/redis", () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
}));
jest.mock("../WorldBossConfig", () => ({
  ENHANCEMENT_MATERIAL_ITEM_ID: 1001,
  getEnhanceMaxLevel: jest.fn(() => 10),
  getEnhanceCost: jest.fn(target => target * 8),
  getEnhancePerLevelPct: jest.fn(() => 0.05),
}));

// The in-trx re-sum is a chained query: trx("Inventory").sum(...).where(...).first().
// The spend is trx("Inventory").insert([...]).
const sumChain = {
  sum: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
};
const insertChain = {
  insert: jest.fn().mockResolvedValue([1]),
};
// trx("Inventory") must satisfy BOTH the insert call and the sum chain.
const trxBuilder = Object.assign({}, insertChain, sumChain);
const trx = jest.fn(() => trxBuilder);
const mockMysql = jest.fn(() => ({}));
mockMysql.transaction = jest.fn(async cb => cb(trx));
jest.mock("../../util/mysql", () => mockMysql);

const PlayerEquipmentModel = require("../../model/application/PlayerEquipment");
const Inventory = require("../../model/application/Inventory");
const EquipmentService = require("../EquipmentService");

describe("EquipmentService.enhanceEquipment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trxBuilder.insert.mockResolvedValue([1]);
    trxBuilder.sum.mockReturnThis();
    trxBuilder.where.mockReturnThis();
    // pre-check sum (no trx) goes through the model helper.
    Inventory.inventory.getUserOwnCountByItemId = jest
      .fn()
      .mockResolvedValue({ amount: 100 });
    // default in-trx re-sum: plenty of material after the decrement.
    trxBuilder.first.mockResolvedValue({ amount: 92 });
  });

  it("rejects when the player does not own the equipment", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue(undefined);
    await expect(EquipmentService.enhanceEquipment("U1", 7)).rejects.toThrow("裝備不存在");
    expect(mockMysql.transaction).not.toHaveBeenCalled();
  });

  it("rejects when already at max level (+10)", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 10,
    });
    await expect(EquipmentService.enhanceEquipment("U1", 7)).rejects.toThrow("已達強化上限");
    expect(mockMysql.transaction).not.toHaveBeenCalled();
  });

  it("rejects on pre-check insufficient materials and consumes nothing", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 0,
    });
    // +0 -> +1 costs getEnhanceCost(1) = 8; owns only 5 (pre-check fails fast, no trx)
    Inventory.inventory.getUserOwnCountByItemId = jest
      .fn()
      .mockResolvedValue({ amount: 5 });
    await expect(EquipmentService.enhanceEquipment("U1", 7)).rejects.toThrow("強化素材不足");
    expect(mockMysql.transaction).not.toHaveBeenCalled();
    expect(trxBuilder.insert).not.toHaveBeenCalled();
    expect(PlayerEquipmentModel.setEnhanceLevel).not.toHaveBeenCalled();
  });

  it("rolls back when the in-trx re-sum goes negative (concurrent double-spend guard)", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 0,
    });
    // Pre-check sees enough (8), but the in-trx re-sum (a concurrent enhance already spent)
    // returns a negative post-decrement balance -> must throw + roll back.
    Inventory.inventory.getUserOwnCountByItemId = jest
      .fn()
      .mockResolvedValue({ amount: 8 });
    trxBuilder.first.mockResolvedValue({ amount: -4 });
    await expect(EquipmentService.enhanceEquipment("U1", 7)).rejects.toThrow("強化素材不足");
    // the negative ledger insert WAS attempted (inside trx) but the trx throws -> rolls back
    expect(trxBuilder.insert).toHaveBeenCalled();
    expect(PlayerEquipmentModel.setEnhanceLevel).not.toHaveBeenCalled();
  });

  it("enhances +0 -> +1: decrements 8 materials and bumps level, in one trx", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 0,
    });
    Inventory.inventory.getUserOwnCountByItemId = jest
      .fn()
      .mockResolvedValue({ amount: 50 }); // pre-check
    trxBuilder.first.mockResolvedValue({ amount: 42 }); // in-trx re-sum (post-decrement)

    const result = await EquipmentService.enhanceEquipment("U1", 7);

    expect(result).toEqual({
      equipmentId: 7,
      fromLevel: 0,
      toLevel: 1,
      cost: 8,
      remainingMaterials: 42,
    });
    // material decrement is a NEGATIVE ledger insert (string, mirrors decreaseGodStone; addendum §13)
    expect(trxBuilder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "U1",
        itemId: 1001,
        itemAmount: "-8",
        note: "world_boss_enhance",
      }),
    ]);
    // level set inside the same trx
    expect(PlayerEquipmentModel.setEnhanceLevel).toHaveBeenCalledWith("U1", 7, 1, trx);
    // cache invalidated so combat reads the new level (addendum §3)
    const redis = require("../../util/redis");
    expect(redis.del).toHaveBeenCalledWith("playerEquipment:U1");
  });

  it("cost scales with target level: +4 -> +5 costs getEnhanceCost(5)=40", async () => {
    PlayerEquipmentModel.getWithEnhance.mockResolvedValue({
      equipment_id: 7,
      enhance_level: 4,
    });
    Inventory.inventory.getUserOwnCountByItemId = jest
      .fn()
      .mockResolvedValue({ amount: 100 }); // pre-check
    trxBuilder.first.mockResolvedValue({ amount: 60 }); // in-trx re-sum

    const result = await EquipmentService.enhanceEquipment("U1", 7);
    expect(result.cost).toBe(40);
    expect(result.toLevel).toBe(5);
    expect(trxBuilder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 1001, itemAmount: "-40" }),
    ]);
  });
});
```
- [ ] **Step 2: Run it and confirm it FAILS.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/service/__tests__/EquipmentService.enhance.test.js`. Expect failure: `EquipmentService.enhanceEquipment is not a function`.
- [ ] **Step 3: Add the `Inventory` + `mysql` requires.** In `app/src/service/EquipmentService.js`, near the top (after the `WorldBossConfig` require added in Task 4 Step 4) add:
```js
const Inventory = require("../model/application/Inventory");
const mysql = require("../util/mysql");
```
- [ ] **Step 4: Implement `enhanceEquipment`.** Append to the end of `app/src/service/EquipmentService.js`. The in-trx guard re-sums the balance with a direct `trx("Inventory")` query (so the SUM sees the just-inserted negative row plus any concurrent uncommitted decrement under the engine's isolation), and throws `強化素材不足` to roll back if negative. The ledger row is written directly via `trx("Inventory").insert` (NOT `Inventory.inventory.decreaseGodStone`, which is hardcoded to item `999`); the negative string form mirrors `decreaseGodStone` exactly (addendum §9/§13). The cache is invalidated only after the trx commits (addendum §3):
```js
/**
 * Deterministically enhance one owned equipment by +1.
 * cost(target) = getEnhanceCost(target) materials (item 1001); cap at max level; no RNG, no downgrade.
 * Material decrement (NEGATIVE ledger insert), the in-trx negative-balance guard, and the level bump
 * all run in one transaction. A concurrent double-enhance is caught by the in-trx re-sum guard.
 * @param {String} userId platform_id
 * @param {Number} equipmentId
 * @returns {Promise<{equipmentId, fromLevel, toLevel, cost, remainingMaterials}>}
 */
exports.enhanceEquipment = async (userId, equipmentId) => {
  const owned = await PlayerEquipmentModel.getWithEnhance(userId, equipmentId);
  if (!owned) throw new Error("裝備不存在");

  const fromLevel = owned.enhance_level || 0;
  const maxLevel = WorldBossConfig.getEnhanceMaxLevel();
  if (fromLevel >= maxLevel) throw new Error("已達強化上限");

  const toLevel = fromLevel + 1;
  const cost = WorldBossConfig.getEnhanceCost(toLevel);
  const materialId = WorldBossConfig.ENHANCEMENT_MATERIAL_ITEM_ID;

  // Fast pre-check (no trx) for a friendly early rejection in the common case.
  const preRow = await Inventory.inventory.getUserOwnCountByItemId(userId, materialId);
  const preBalance = (preRow && preRow.amount) || 0;
  if (preBalance < cost) throw new Error("強化素材不足");

  let remainingMaterials;
  await mysql.transaction(async trx => {
    // 1. NEGATIVE ledger insert (spend; string form mirrors Inventory.decreaseGodStone).
    await trx("Inventory").insert([
      {
        userId,
        itemId: materialId,
        itemAmount: `${-cost}`,
        note: "world_boss_enhance",
      },
    ]);

    // 2. Authoritative double-spend guard: re-sum the balance INSIDE the trx (sees the negative row
    //    plus any concurrent uncommitted decrement under the engine's isolation).
    const postRow = await trx("Inventory")
      .sum({ amount: "itemAmount" })
      .where({ userId, itemId: materialId })
      .first();
    remainingMaterials = (postRow && postRow.amount) || 0;
    if (remainingMaterials < 0) throw new Error("強化素材不足");

    // 3. Bump level in the same trx; a thrown guard above already rolled the insert back.
    await PlayerEquipmentModel.setEnhanceLevel(userId, equipmentId, toLevel, trx);
  });

  // Invalidate the cached equipment so combat reads the new enhance_level (addendum §3).
  await redis.del(`playerEquipment:${userId}`);

  return { equipmentId, fromLevel, toLevel, cost, remainingMaterials };
};
```
- [ ] **Step 5: Run the test and confirm it PASSES.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/service/__tests__/EquipmentService.enhance.test.js`. Expect `6 passed`.
- [ ] **Step 6: Lint the modified service.** `cd /home/hanshino/workspace/redive_linebot/app && yarn lint -- src/service/EquipmentService.js`. Expect no errors (double quotes, es5 commas, ≤100 cols).
- [ ] **Step 7: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/src/service/EquipmentService.js app/src/service/__tests__/EquipmentService.enhance.test.js && git commit -m "feat(worldboss): EquipmentService.enhanceEquipment +1 sink with in-trx double-spend guard + cache bust (D8/D9)"
```

---

### Task 6 — `#強化` LINE command handler wiring (controller hook)

**Files:**
- Modify: `app/src/controller/application/WorldBossController.js` — add an exported `enhanceCmd` handler and register it on `.router` (the file already requires `EquipmentService` at line 11 and `text` from `bottender/router` at line 3).
- Test: `app/src/controller/application/__tests__/WorldBossController.enhance.test.js`

**Interfaces:**
- Consumes: `EquipmentService.enhanceEquipment` (Task 5).
- Produces: a Bottender handler `enhanceCmd(context)` reachable via `#強化 <equipmentId>`. (The full controller rewrite — postbacks, Flex card, role gating, batch-vs-immediate routing, `#夢幻回歸` removal, `destory→destroy` — is owned by the LINE-command milestone M9; this task only lands the command verb + handler so the enhancement feature is reachable from LINE and end-to-end testable. M9 will refine the reply into a Flex card.)

> **Constraint reminder (global constraint 3, exception (a)):** this is a *personal* action with personal feedback (success / insufficient-material / not-owned), so the reply is an **immediate `context.sendText`** — it does NOT go through the 5-min group batch (`handleKeepingMessage`). This task deliberately uses only the immediate-reply path, which has no Push-API risk.

Steps:

- [ ] **Step 1: Confirm the controller's current export + router shape.** Run `cd /home/hanshino/workspace/redive_linebot/app && sed -n '1,41p' src/controller/application/WorldBossController.js` and confirm: `EquipmentService` is required (line 11), `text` matcher is required (line 3), and `exports.router = [ ... ]` is the array at lines 30-41. New handlers read `context.event.message.text` and `context.event.source.userId` (the platform_id).
- [ ] **Step 2: Write the failing test FIRST.** Mock `EquipmentService` before requiring the controller. Because requiring the controller pulls in many real modules, also confirm the test only exercises `enhanceCmd`. Create `app/src/controller/application/__tests__/WorldBossController.enhance.test.js`:
```js
// jest.mock NOT hoisted (transform:{}) -> mock before requiring the controller.
jest.mock("../../../service/EquipmentService", () => ({
  enhanceEquipment: jest.fn(),
}));

const EquipmentService = require("../../../service/EquipmentService");
const { enhanceCmd } = require("../WorldBossController");

function makeContext(text) {
  return {
    event: { message: { text }, source: { userId: "U123" } },
    state: {},
    sendText: jest.fn(),
  };
}

describe("WorldBossController.enhanceCmd", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows a usage hint when no equipment id is supplied", async () => {
    const ctx = makeContext("#強化");
    await enhanceCmd(ctx);
    expect(EquipmentService.enhanceEquipment).not.toHaveBeenCalled();
    expect(ctx.sendText).toHaveBeenCalledWith(expect.stringContaining("請指定"));
  });

  it("calls enhanceEquipment with the platform id and parsed equipment id", async () => {
    EquipmentService.enhanceEquipment.mockResolvedValue({
      equipmentId: 7,
      fromLevel: 2,
      toLevel: 3,
      cost: 24,
      remainingMaterials: 100,
    });
    const ctx = makeContext("#強化 7");
    await enhanceCmd(ctx);
    expect(EquipmentService.enhanceEquipment).toHaveBeenCalledWith("U123", 7);
    expect(ctx.sendText).toHaveBeenCalledWith(expect.stringContaining("+3"));
  });

  it("surfaces the service rejection message to the player", async () => {
    EquipmentService.enhanceEquipment.mockRejectedValue(new Error("強化素材不足"));
    const ctx = makeContext("#強化 7");
    await enhanceCmd(ctx);
    expect(ctx.sendText).toHaveBeenCalledWith(expect.stringContaining("強化素材不足"));
  });
});
```
- [ ] **Step 3: Run it and confirm it FAILS.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/controller/application/__tests__/WorldBossController.enhance.test.js`. Expect failure: `enhanceCmd` is `undefined` (not exported yet).
- [ ] **Step 4: Implement and export `enhanceCmd`.** Add to `app/src/controller/application/WorldBossController.js` AFTER the `exports.router` array (function declarations are hoisted, so the array's reference to `enhanceCmd` resolves regardless of placement; existing handlers like `revokeCharm` are declared after the array too). `EquipmentService` is already required at line 11 — do NOT re-require it:
```js
/**
 * #強化 <equipmentId> — 強化一件已擁有的裝備 +1（個人即時回覆，不進群組批次）
 * @param {import("bottender").LineContext} context
 */
async function enhanceCmd(context) {
  const text = context.event.message.text || "";
  // "#強化 7" / "＃強化　7" -> 7 ; bare "#強化" -> usage hint
  const match = text.replace(/＃/g, "#").match(/^#強化(?:\s+(\d+))?$/);
  if (!match || !match[1]) {
    await context.sendText("請指定要強化的裝備編號，例如：#強化 7");
    return;
  }

  const equipmentId = parseInt(match[1], 10);
  const userId = context.event.source.userId;

  try {
    const result = await EquipmentService.enhanceEquipment(userId, equipmentId);
    await context.sendText(
      `強化成功！裝備 #${result.equipmentId} ` +
        `+${result.fromLevel} → +${result.toLevel}\n` +
        `消耗素材：${result.cost}（剩餘 ${result.remainingMaterials}）`
    );
  } catch (err) {
    await context.sendText(`強化失敗：${err.message}`);
  }
}

exports.enhanceCmd = enhanceCmd;
```
- [ ] **Step 5: Register the verb on the router.** In the `exports.router = [ ... ]` array (lines 30-41), add an entry alongside the other `text(...)` matchers (e.g. after the `#裝備` line). Use the `(\s+\d+)?` form so the bare `#強化` also reaches the handler (to show the usage hint):
```js
  text(/^[#＃]強化(\s+\d+)?$/, enhanceCmd),
```
- [ ] **Step 6: Run the test and confirm it PASSES.** `cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/controller/application/__tests__/WorldBossController.enhance.test.js`. Expect `3 passed`.
- [ ] **Step 7: Run the full M3 test set + lint to confirm no regressions.**
```
cd /home/hanshino/workspace/redive_linebot/app && yarn test -- src/service/__tests__/WorldBossConfig.test.js src/model/application/__tests__/PlayerEquipment.test.js src/service/__tests__/EquipmentService.bonuses.test.js src/service/__tests__/EquipmentService.enhance.test.js src/controller/application/__tests__/WorldBossController.enhance.test.js && yarn lint -- src/controller/application/WorldBossController.js
```
Expect all suites green and no lint errors.
- [ ] **Step 8: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/src/controller/application/WorldBossController.js app/src/controller/application/__tests__/WorldBossController.enhance.test.js && git commit -m "feat(worldboss): #強化 command surfacing enhanceEquipment (immediate reply) (D8)"
```

---

### Milestone exit criteria (reviewer checklist)

- `enhance_level` column exists on `player_equipment` (`int not null default 0`); existing gear is `+0`.
- `WorldBossConfig` exports `GODDESS_STONE_ITEM_ID=999`, `ENHANCEMENT_MATERIAL_ITEM_ID=1001`, `getEnhanceCost(L) === L*8`, AND the full global getter + `read*(boss)` dead-column accessor surface (so M5/M7/M10 bind to real functions). `default.json` parses; the EXISTING `worldboss` keys (`daily_limit`, `penalty_rate`, `money_revoke_attack_cost`, `revoke_charm`, `manual`) survived the merge.
- `default.json` config single-owner: M3 is the sole writer of `worldboss.enhance`, the new `worldboss.*` tunables, `worldboss.cold_start_max_hp`, `worldboss.reselect_stone_cost`, and the top-level `items` block (`{ itemId, name }` object shape). No other milestone re-adds these.
- **`atk_percent` unit = FRACTION** (addendum §2), matching the verified live controller (`damage*(1+atk_percent)`); a test pins it.
- **`support_power` / `block_power` are INTEGER people-counts** (addendum §2), `Math.floor`-ed per piece after the enhance multiplier; a test asserts integer results (e.g. `+5` `block_power: 3` → `3`).
- `getEquipmentBonuses` returns the 7-key superset (incl. `support_power`, `block_power`); the 5-key callers are unaffected. Enhance multiplier scales ONLY `atk_percent`/`support_power`/`block_power` (`base*(1+0.05*level)`, `+10` ⇒ `×1.5`); `crit_rate`/`cost_reduction`/`exp_bonus`/`gold_bonus` are NOT scaled — a test pins both behaviors on one mixed `+5` item.
- `enhanceEquipment` is deterministic (no `Math.random`), caps at `+10` (`已達強化上限`), pre-rejects insufficient material (`強化素材不足`) without opening a trx, and runs the NEGATIVE ledger insert (item `1001`, addendum §13) + **in-trx re-sum negative-balance guard** + `setEnhanceLevel` in ONE `mysql.transaction` (a concurrent double-spend rolls back via the guard), then invalidates `playerEquipment:{userId}` (addendum §3) AFTER the trx commits.
- `#強化 <id>` reaches `enhanceEquipment` with `(platform_id, equipmentId)` and replies immediately via `context.sendText` (NOT the group batch); service errors surface to the player; bare `#強化` shows the usage hint.
- All five test files pass via `cd app && yarn test -- <path>`; every `jest.mock(...)` precedes its `require`. All test fixtures use the real `rarity` enum strings (`"common"`/`"rare"`/`"epic"`/`"legendary"`) — never `"R"` or a numeric rarity (addendum §9).

---

**Files produced/modified by this milestone (all absolute):**
- `/home/hanshino/workspace/redive_linebot/app/migrations/<ts>_add_enhance_level_to_player_equipment.js` (create)
- `/home/hanshino/workspace/redive_linebot/app/config/default.json` (modify)
- `/home/hanshino/workspace/redive_linebot/app/src/service/WorldBossConfig.js` (create)
- `/home/hanshino/workspace/redive_linebot/app/src/model/application/PlayerEquipment.js` (modify)
- `/home/hanshino/workspace/redive_linebot/app/src/service/EquipmentService.js` (modify)
- `/home/hanshino/workspace/redive_linebot/app/src/controller/application/WorldBossController.js` (modify)
- Tests: `app/src/service/__tests__/WorldBossConfig.test.js`, `app/src/model/application/__tests__/PlayerEquipment.test.js`, `app/src/service/__tests__/EquipmentService.bonuses.test.js`, `app/src/service/__tests__/EquipmentService.enhance.test.js`, `app/src/controller/application/__tests__/WorldBossController.enhance.test.js`

**Two open coordination notes for downstream reviewers (not blocking this milestone):**
1. `ENHANCEMENT_MATERIAL_ITEM_ID = 1001` should be re-confirmed unused against the live `GachaPool` / item registry at deploy. If 1001 collides, change the single constant in `WorldBossConfig.js` + the `items.enhancement_material.itemId` value — nothing else references the literal.
2. The base-gear seeder (`support_power` / `block_power` healer/tank gear, D29) is owned by the role milestone (M2), NOT here. This milestone only makes those attribute keys *count* in `getEquipmentBonuses`. M2's seeder MUST (a) use the exact key names `support_power` / `block_power`, (b) seed them as **integer people-counts** (e.g. `support_power: 2`), NOT fractions — per the unit decision locked above (addendum §2) — and (c) use a valid `rarity` enum string. `atk_percent` DPS gear remains fractional (e.g. `0.05`).

---

## Milestone M4: Combat core: DPS + phases + enrage trigger

**Goal:** Create `app/src/util/worldBossRedis.js` (the eight `platform_id`-keyed pool / shield / block helpers in API LOCK §C — nothing else) and create `app/src/service/WorldBossCombatService.js` exporting `dpsAttack` per LOCK §D — the role-aware resolving hit: two-phase combat (calm/enrage), the threshold-crossing enrage trigger that batch-knocks the last-N recent attackers into the Redis pool (crediting any tank-block / shield owner), enrage ×2 damage+contribution for hits that START in the band, per-attack counter knockdown, kill CAS on the lethal hit, knocked-down rejection with no energy spent, and lazy natural recovery computed in the service via `poolScore`+`poolRemove`; then route the controller's DPS path through it.

> **OWNERSHIP (API LOCK §A.M4 — DEFINITIVE).** This milestone is the **SOLE CREATOR** of both `app/src/util/worldBossRedis.js` and `app/src/service/WorldBossCombatService.js`. It creates the eight Redis helpers (§C) and `dpsAttack` plus the internal enrage trigger / batch-knock / counter-knock / kill-CAS (§D). **M5 MODIFIES the same combat file** to ADD `tankBlock`/`healerRevive`/`healerShield` and the D30 cold-start scaling, and **USES** `worldBossRedis` (never re-creates it, never redefines `dpsAttack`). M4 is NOT "equipment" — that is M3. Any draft proposing a second `WorldBossCombatService.js` / `worldBossRedis.js`, a different helper API, a different `dpsAttack` signature, or a non-`platform_id` pool identity is rejected.

> **LOCKED CANONICAL DECISIONS — every downstream milestone conforms verbatim:**
> 1. **`worldBossRedis.js` exports EXACTLY eight members (LOCK §C):** `poolAdd`, `poolPopMin`, `poolScore`, `poolRemove`, `shieldSet`, `shieldConsume`, `blockSet`, `blockOwner`. The older names `addToPool` / `popFromPool` / `removeFromPool` / `isKnockedDown` / `recoverIfExpired` / `getBlockOwner` / `consumeShield` / `openBlockWindow` / `consumeBlockSlot` / `setShield` are **FORBIDDEN** — they must not appear anywhere. All members and owner values are LINE `platform_id` strings.
> 2. **Numeric id resolution is `UserModel.getId(platformId)` ONLY (LOCK §D; verified `UserModel.js:8-11` → numeric `user.id` or `null`).** There is **NO** `_resolveNumericId` — it is deleted. `dpsAttack` trusts the `numericUserId` the caller passes (M8/M9 resolve it via `UserModel.getId`, returning 409 on null per LOCK §F); the service self-resolves only an absorb-credit owner (off the hot path) via `UserModel.getId`, skipping the writeback when it returns null (never mis-credit, LOCK §B).
> 3. **Pool / shield / block identity = `platform_id` (LOCK §B — this overrides addendum §4).** `getRecentAttackers` (defined in M1) returns BOTH ids `{ user_id: <numeric>, platform_id: <string> }`; the trigger ZADDs `candidate.platform_id`. The LOG (`world_boss_event_log.user_id`) stays numeric `user.id`; any contribution writeback row uses the numeric `user_id` resolved via `UserModel.getId`.
> 4. **Damage formula = the real engine (addendum §1).** `makeCharacter(jobKey, { level }).getStandardDamage()` = `Math.floor(Math.pow(level, 2)) + level * 10` (verified `RPGCharacter.js:139-141`; lvl 50 → 3000). v1 DPS uses `getStandardDamage()` regardless of skill (skill-specific damage deferred to M9). Then `damage = Math.floor(damage * (1 + atk_percent))` where `atk_percent` is a **FRACTION** (addendum §2; `0.5` ⇒ +50%, NO `/100`), via `EquipmentService.getEquipmentBonuses(platformId)`. `contribution = damage` on the DPS board.
> 5. **Enrage crossing-hit rule (LOCK §D — LOCKED).** The hit that CROSSES from calm into enrage is **NOT doubled** (it is computed while still in the calm band) and it FIRES the trigger as a side effect (`didEnrageTrigger: true`, batch-knock recent attackers). Hits that START already in the enrage band get **×2 on BOTH `damage` AND `contribution`**, applied after equipment bonuses, at write time. M10's sim imports the real `dpsAttack` and inherits this.
> 6. **HP is dynamic — there is NO `remain_hp` column (addendum §6).** `WorldBossLog.getTotalDamageByEventId(eventId)` returns `{ total_damage }` (verified `WorldBossLog.js:146-152`). `remainHpBefore = event.hp - parseInt(total_damage || 0, 10)`. Phase: enraged when `remainHpBefore <= event.hp * thresholdPct/100`. Boards always read `SUM(...)` from the durable log; Redis never scores.

> **Scope boundaries (belong to other milestones; stated to close ownership):**
> - **D30 dynamic enrage-pressure scaling** (scale batch-N and counter-% DOWN as `getSupportRatio(eventId)` → 0) is **M5's** job (LOCK §A.M5, addendum §15). M4 reads the per-boss config knobs straight (with config fallback).
> - **Equipment Redis cache invalidation** on `enhanceEquipment` and the `getEquipmentBonuses` extension to return `support_power`/`block_power` (addendum §2/§3) are **M3's** jobs. Combat-core consumes only `{ atk_percent }`.
> - `createWithRole` / `getRecentAttackers` / `getTotalDamageByEventId` / `WorldBossEvent.getActive` / `WorldBossEvent.casStatus` are **M1's** — this milestone CALLS them, never defines them.

> **Inheritance — read before every task.** Backend is CommonJS (`require`/`module.exports`). ESLint: double quotes, es5 trailing commas, 100-char print width. Tests are Jest under `app/` (`__tests__/` dirs); run `cd app && yarn test -- <path>`. The app `jest.config` has `transform: {}`, so **`jest.mock(...)` is NOT hoisted** — every `jest.mock(...)` MUST appear textually BEFORE any `require()` of the mocked module. Branch is `feat/worldboss-redesign`; never commit to main. Migrations only via `cd app && yarn knex migrate:make` (none needed in M4). The redis client is node-redis v5.12 (verified) exporting camelCase methods: `zAdd(key, { score, value })` (verified `replyTokenQueue.js:13`), `zPopMin`, `zScore`, `zRem`, `set(key, val, { EX })` (verified `WorldBossController.js:185`), `get`, `getDel` (verified present on the v5 client).

> **Upstream this milestone consumes (mocked in M4's tests so M4 is independently verifiable):**
> - **M1 columns:** `world_boss_event_log.role` (enum `dps|healer|tank`, default `dps`), `world_boss_event_log.contribution` (int default 0); `world_boss_event.status` (`pending|active|killed|expired`), `killed_at`, `settled_at`.
> - **M1 `WorldBossLog` helpers (LOCK §E):** `createWithRole({ user_id /*numeric*/, world_boss_event_id, role, action_type, damage, cost, contribution }, trx?)`, `getRecentAttackers({ eventId, minutes, limit })` → `[{ user_id: <numeric>, platform_id: <string> }]`, and the existing `getTotalDamageByEventId(eventId)` → `{ total_damage }` (verified).
> - **M1 `WorldBossEvent` helpers (LOCK §E):** `getActive()` (the active row joined with its boss columns: `hp`, `status`, dead columns `attack`/`defense`/`speed`/`luck`), `casStatus(eventId, fromStatus, toStatus, extra = {})` → `Promise<boolean>` (atomic conditional UPDATE; `extra` stamps `killed_at`; `true` when this caller won the race).
> - **M3 `WorldBossConfig.js`** typed accessors + dead-column readers (each returns the config default when the dead column is 0/null, addendum §7): `normalAttackCost()`, `enrageDamageMultiplier()` (=2), `enrageContributionMultiplier()` (=2), `enrageThresholdPct(boss)` (`speed` col), `enrageBatchSize(boss)` (`defense` col, INTEGER), `enrageRecentMinutes(boss)`, `enrageCounterRate(boss)` (`attack` col, fraction), `naturalRecoveryMinutes(boss)` (`luck` col).
> - **M2 `WorldBossRoleService.getRole(platformId)`** → `"dps"|"healer"|"tank"|null`.
> - **M3 `EquipmentService.getEquipmentBonuses(platformId)`** — keyed on `platform_id` (verified: live `attackOnBoss` calls `getEquipmentBonuses(userId)` where `userId` is the LINE id, `WorldBossController.js:517`). Returns at least `{ atk_percent }` as a fraction.
> - **`UserModel.getId(platformId)`** (verified `UserModel.js:8-11`) → numeric `user.id` or `null`.
> - **`RPGCharacter`** (`app/src/model/application/RPGCharacter.js`): `const { make: makeCharacter, enumSkills } = require(...)`; `enumSkills.STANDARD === "standard"`, `enumSkills.SKILL_ONE === "skillOne"` (verified).

---

### Task 1: Redis key helpers (`worldBossRedis.js`) — the eight LOCK §C exports (pool / shield / block), all `platform_id`-keyed

**Files:**
- Create: `app/src/util/worldBossRedis.js`
- Test: `app/src/util/__tests__/worldBossRedis.test.js`

**Interfaces:**
- *Consumes:* the node-redis v5 client exported by `app/src/util/redis.js` (verified `module.exports = redisClient`; methods `zAdd(key, { score, value })`, `zPopMin(key, count)`, `zScore(key, member)`, `zRem(key, member)`, `set(key, val, { EX })`, `get(key)`, `getDel(key)`).
- *Produces (THE canonical helper API — EXACTLY the eight LOCK §C names; M5 reuses these verbatim; every member and owner value is a `platform_id` string):*
```js
exports.poolAdd       = async (eventId, platformId, ts) => void;            // ZADD score=ts
exports.poolPopMin    = async (eventId, count) => [platformId, ...];        // ZPOPMIN -> members ([] when empty; handle single-object return)
exports.poolScore     = async (eventId, platformId) => ts | null;          // ZSCORE (null if absent)
exports.poolRemove    = async (eventId, platformId) => void;               // ZREM
exports.shieldSet     = async (eventId, targetPlatformId, ownerPlatformId, ttlSec) => void;  // SET wb:shield:{event}:{target}=owner EX ttl
exports.shieldConsume = async (eventId, targetPlatformId) => ownerPlatformId | null;         // GETDEL; null if no shield
exports.blockSet      = async (eventId, ownerPlatformId, ttlSec) => void;  // SET wb:block:{event}=owner EX ttl
exports.blockOwner    = async (eventId) => ownerPlatformId | null;          // GET wb:block:{event}
```

> Owner values are stored as the **raw `platform_id` string** (NOT JSON) per LOCK §C `SET ... = ownerPlatformId`. `shieldConsume` uses GETDEL (atomic read-and-delete; the v5 client exposes `getDel`). There is NO `isKnockedDown` / lazy-recovery here — that lives in the combat service (Task 2) via `poolScore` + `poolRemove`.

Steps:

- [ ] **Step 1: Write the failing test file.** Create `app/src/util/__tests__/worldBossRedis.test.js` with the full content below. The `jest.mock` precedes the `require` of the module under test (which transitively requires `../redis`).

```js
jest.mock("../redis", () => ({
  zAdd: jest.fn(),
  zPopMin: jest.fn(),
  zScore: jest.fn(),
  zRem: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  getDel: jest.fn(),
}));

const redis = require("../redis");
const wbRedis = require("../worldBossRedis");

describe("worldBossRedis (LOCK §C — eight platform_id-keyed helpers)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("exports EXACTLY the eight LOCK §C names and no forbidden aliases", () => {
    expect(Object.keys(wbRedis).sort()).toEqual(
      [
        "blockOwner",
        "blockSet",
        "poolAdd",
        "poolPopMin",
        "poolRemove",
        "poolScore",
        "shieldConsume",
        "shieldSet",
      ].sort()
    );
    [
      "addToPool",
      "popFromPool",
      "isKnockedDown",
      "getBlockOwner",
      "consumeShield",
      "openBlockWindow",
      "setShield",
    ].forEach(forbidden => expect(wbRedis[forbidden]).toBeUndefined());
  });

  test("poolAdd ZADDs the platform_id member with score=ts", async () => {
    await wbRedis.poolAdd(7, "U123", 1000);
    expect(redis.zAdd).toHaveBeenCalledWith("wb:pool:7", { score: 1000, value: "U123" });
  });

  test("poolPopMin ZPOPMIN count and returns member strings", async () => {
    redis.zPopMin.mockResolvedValue([
      { value: "U1", score: 1 },
      { value: "U2", score: 2 },
    ]);
    const popped = await wbRedis.poolPopMin(7, 2);
    expect(redis.zPopMin).toHaveBeenCalledWith("wb:pool:7", 2);
    expect(popped).toEqual(["U1", "U2"]);
  });

  test("poolPopMin normalizes a single (non-array) reply", async () => {
    redis.zPopMin.mockResolvedValue({ value: "U1", score: 1 });
    expect(await wbRedis.poolPopMin(7, 1)).toEqual(["U1"]);
  });

  test("poolPopMin returns [] on empty reply", async () => {
    redis.zPopMin.mockResolvedValue(null);
    expect(await wbRedis.poolPopMin(7, 3)).toEqual([]);
  });

  test("poolScore returns number or null", async () => {
    redis.zScore.mockResolvedValueOnce(500);
    expect(await wbRedis.poolScore(7, "U1")).toBe(500);
    redis.zScore.mockResolvedValueOnce(null);
    expect(await wbRedis.poolScore(7, "U2")).toBeNull();
  });

  test("poolRemove ZREMs the platform_id member", async () => {
    await wbRedis.poolRemove(7, "U1");
    expect(redis.zRem).toHaveBeenCalledWith("wb:pool:7", "U1");
  });

  test("shieldSet SETs target key to owner platform_id with EX ttl", async () => {
    await wbRedis.shieldSet(7, "Utarget", "Uowner", 600);
    expect(redis.set).toHaveBeenCalledWith("wb:shield:7:Utarget", "Uowner", { EX: 600 });
  });

  test("shieldConsume GETDELs and returns the owner platform_id or null", async () => {
    redis.getDel.mockResolvedValueOnce("Uowner");
    expect(await wbRedis.shieldConsume(7, "Utarget")).toBe("Uowner");
    expect(redis.getDel).toHaveBeenCalledWith("wb:shield:7:Utarget");
    redis.getDel.mockResolvedValueOnce(null);
    expect(await wbRedis.shieldConsume(7, "Uother")).toBeNull();
  });

  test("blockSet SETs the block key to owner platform_id with EX ttl", async () => {
    await wbRedis.blockSet(7, "Uowner", 60);
    expect(redis.set).toHaveBeenCalledWith("wb:block:7", "Uowner", { EX: 60 });
  });

  test("blockOwner GETs the block key, returning owner or null", async () => {
    redis.get.mockResolvedValueOnce("Uowner");
    expect(await wbRedis.blockOwner(7)).toBe("Uowner");
    redis.get.mockResolvedValueOnce(null);
    expect(await wbRedis.blockOwner(7)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** Run `cd app && yarn test -- src/util/__tests__/worldBossRedis.test.js`. Expected: failure with `Cannot find module '../worldBossRedis'` (the module does not exist yet).

- [ ] **Step 3: Implement `worldBossRedis.js`.** Create `app/src/util/worldBossRedis.js` with the full content below.

```js
const redis = require("./redis");

const keys = {
  pool: eventId => `wb:pool:${eventId}`,
  shield: (eventId, platformId) => `wb:shield:${eventId}:${platformId}`,
  block: eventId => `wb:block:${eventId}`,
};

/**
 * 將玩家加入待救池（ZSET，score = 被擊倒的 timestamp ms）。member 一律為 platform_id。
 * @param {Number} eventId
 * @param {String} platformId
 * @param {Number} ts
 * @returns {Promise<void>}
 */
async function poolAdd(eventId, platformId, ts) {
  await redis.zAdd(keys.pool(eventId), { score: ts, value: platformId });
}

/**
 * 從待救池撈出最久未救的 count 人（ZPOPMIN），回傳 platform_id 字串陣列。
 * 空池回 []；單筆物件回傳時正規化為陣列。
 * @param {Number} eventId
 * @param {Number} count
 * @returns {Promise<String[]>}
 */
async function poolPopMin(eventId, count) {
  const reply = await redis.zPopMin(keys.pool(eventId), count);
  if (!reply) {
    return [];
  }
  const arr = Array.isArray(reply) ? reply : [reply];
  return arr.map(item => item.value);
}

/**
 * 取得玩家在待救池的 score（被擊倒的 ts），不存在回 null。
 * @param {Number} eventId
 * @param {String} platformId
 * @returns {Promise<Number|null>}
 */
async function poolScore(eventId, platformId) {
  const score = await redis.zScore(keys.pool(eventId), platformId);
  return score === null || score === undefined ? null : Number(score);
}

/**
 * 將玩家移出待救池（站起 / 被救 / 自然恢復）。
 * @param {Number} eventId
 * @param {String} platformId
 * @returns {Promise<void>}
 */
async function poolRemove(eventId, platformId) {
  await redis.zRem(keys.pool(eventId), platformId);
}

/**
 * 為某個被保護目標設置護盾 token，value = 發盾者 platform_id，EX ttlSec。
 * @param {Number} eventId
 * @param {String} targetPlatformId
 * @param {String} ownerPlatformId
 * @param {Number} ttlSec
 * @returns {Promise<void>}
 */
async function shieldSet(eventId, targetPlatformId, ownerPlatformId, ttlSec) {
  await redis.set(keys.shield(eventId, targetPlatformId), ownerPlatformId, { EX: ttlSec });
}

/**
 * 消耗某目標的護盾（GETDEL，原子讀取並刪除），回傳發盾者 platform_id 或 null。
 * @param {Number} eventId
 * @param {String} targetPlatformId
 * @returns {Promise<String|null>}
 */
async function shieldConsume(eventId, targetPlatformId) {
  const owner = await redis.getDel(keys.shield(eventId, targetPlatformId));
  return owner || null;
}

/**
 * 開啟格擋窗口，value = 坦克 owner platform_id，EX ttlSec。
 * @param {Number} eventId
 * @param {String} ownerPlatformId
 * @param {Number} ttlSec
 * @returns {Promise<void>}
 */
async function blockSet(eventId, ownerPlatformId, ttlSec) {
  await redis.set(keys.block(eventId), ownerPlatformId, { EX: ttlSec });
}

/**
 * 取得目前格擋窗口的擁有者 platform_id，不存在回 null。
 * @param {Number} eventId
 * @returns {Promise<String|null>}
 */
async function blockOwner(eventId) {
  const owner = await redis.get(keys.block(eventId));
  return owner || null;
}

module.exports = {
  poolAdd,
  poolPopMin,
  poolScore,
  poolRemove,
  shieldSet,
  shieldConsume,
  blockSet,
  blockOwner,
};
```

- [ ] **Step 4: Run it and confirm it PASSES.** Run `cd app && yarn test -- src/util/__tests__/worldBossRedis.test.js`. Expected: all assertions green, including the export-name guard.

- [ ] **Step 5: Commit.**
```bash
cd /home/hanshino/workspace/redive_linebot
git add app/src/util/worldBossRedis.js app/src/util/__tests__/worldBossRedis.test.js
git commit -m "feat(worldboss): worldBossRedis pool/shield/block helpers (LOCK §C, platform_id-keyed)"
```

---

### Task 2: `dpsAttack` skeleton — reject paths (status != active, knocked-down via `poolScore`+lazy recovery) with NO energy spent; numeric id only via `UserModel.getId`

**Files:**
- Create: `app/src/service/WorldBossCombatService.js`
- Test: `app/src/service/__tests__/WorldBossCombatService.dpsAttack.reject.test.js`

**Interfaces:**
- *Consumes:* Task 1 `worldBossRedis.poolScore`/`poolRemove`; M1 `WorldBossEvent.getActive`; M3 `WorldBossConfig.naturalRecoveryMinutes(boss)`; `UserModel.getId(platformId)` for the (rare) self-resolve when `numericUserId` is missing.
- *Produces (the CANONICAL LOCK §D signature — the ONLY `dpsAttack`, completed across Tasks 2–5):*
```js
exports.dpsAttack = async ({ platformId, numericUserId, eventId, attackType, level }) => ({
  damage, contribution, enraged, didEnrageTrigger, knockedBatch, selfKnocked, rejected, reason,
});
```
This task implements ONLY the two reject paths (`rejected: true`), returning before any log write. **There is NO `_resolveNumericId`** (LOCK §D) — numeric id comes from `UserModel.getId` when the caller did not supply one.

> **Knocked-down check (LOCK §C/§D — computed in the SERVICE, not the util):** read `poolScore(eventId, platformId)`; if a score exists AND `score + recoveryMinutes*60000 <= now` → `poolRemove(...)` and treat as recovered (NOT knocked); if a score exists and not yet recovered → knocked; absent → not knocked. There is NO `isKnockedDown` util export.

> **Reject contract (D24):** when `rejected: true`, NO `world_boss_event_log` row is written, so no energy/cost is consumed. `reason` is `"not_active"` (no active event / id mismatch / status != active) or `"knocked_down"`. The reply layer (Task 6 / M9) turns `reason` into the player-facing immediate `replyText`.

Steps:

- [ ] **Step 1: Write the failing test.** Create `app/src/service/__tests__/WorldBossCombatService.dpsAttack.reject.test.js`. All `jest.mock` calls precede the `require` of the service.

```js
jest.mock("../../model/application/UserModel", () => ({
  getId: jest.fn(),
}));
jest.mock("../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
  casStatus: jest.fn(),
}));
jest.mock("../../model/application/WorldBossLog", () => ({
  createWithRole: jest.fn(),
  getRecentAttackers: jest.fn(),
  getTotalDamageByEventId: jest.fn(),
}));
jest.mock("../../util/worldBossRedis", () => ({
  poolAdd: jest.fn(),
  poolPopMin: jest.fn(),
  poolScore: jest.fn(),
  poolRemove: jest.fn(),
  shieldSet: jest.fn(),
  shieldConsume: jest.fn(),
  blockSet: jest.fn(),
  blockOwner: jest.fn(),
}));
jest.mock("../EquipmentService", () => ({
  getEquipmentBonuses: jest.fn(),
}));
jest.mock("../WorldBossConfig", () => ({
  normalAttackCost: jest.fn(() => 10),
  enrageDamageMultiplier: jest.fn(() => 2),
  enrageContributionMultiplier: jest.fn(() => 2),
  enrageThresholdPct: jest.fn(() => 35),
  enrageBatchSize: jest.fn(() => 20),
  enrageRecentMinutes: jest.fn(() => 10),
  enrageCounterRate: jest.fn(() => 0.15),
  naturalRecoveryMinutes: jest.fn(() => 15),
}));

const UserModel = require("../../model/application/UserModel");
const WorldBossEvent = require("../../model/application/WorldBossEvent");
const WorldBossLog = require("../../model/application/WorldBossLog");
const wbRedis = require("../../util/worldBossRedis");
const combat = require("../WorldBossCombatService");

describe("WorldBossCombatService.dpsAttack — reject paths", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wbRedis.poolScore.mockResolvedValue(null);
  });

  test("rejects with not_active when there is no active event", async () => {
    WorldBossEvent.getActive.mockResolvedValue(null);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("not_active");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  test("rejects with not_active when the active event id differs", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 99, status: "active", hp: 1000 });
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("not_active");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  test("rejects with not_active when status is not active", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "killed", hp: 1000 });
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("not_active");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  test("rejects with knocked_down (still inside recovery window) without spending energy", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 1000, luck: 0 });
    // knocked at now-5min, recovery 15min -> still knocked
    wbRedis.poolScore.mockResolvedValue(Date.now() - 5 * 60000);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(wbRedis.poolScore).toHaveBeenCalledWith(7, "U1");
    expect(wbRedis.poolRemove).not.toHaveBeenCalled();
    expect(result.rejected).toBe(true);
    expect(result.reason).toBe("knocked_down");
    expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
  });

  test("lazy natural recovery: past the window the player is removed from the pool and NOT rejected", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 1000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 0 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    require("../EquipmentService").getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
    // knocked 16min ago, recovery 15min -> recovered
    wbRedis.poolScore.mockResolvedValue(Date.now() - 16 * 60000);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(wbRedis.poolRemove).toHaveBeenCalledWith(7, "U1");
    expect(result.rejected).toBe(false);
  });

  test("self-resolves numericUserId via UserModel.getId when the caller omits it", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 0 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    require("../EquipmentService").getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
    UserModel.getId.mockResolvedValue(4242);
    await combat.dpsAttack({
      platformId: "Uabc",
      numericUserId: undefined,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(UserModel.getId).toHaveBeenCalledWith("Uabc");
    expect(WorldBossLog.createWithRole.mock.calls[0][0].user_id).toBe(4242);
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** Run `cd app && yarn test -- src/service/__tests__/WorldBossCombatService.dpsAttack.reject.test.js`. Expected: `Cannot find module '../WorldBossCombatService'`.

- [ ] **Step 3: Implement the skeleton.** Create `app/src/service/WorldBossCombatService.js` with the full content below. (Damage/enrage logic is added in Tasks 3–5 within this milestone — this is the minimal code to pass the reject + lazy-recovery + self-resolve tests.)

```js
const UserModel = require("../model/application/UserModel");
const WorldBossEvent = require("../model/application/WorldBossEvent");
const WorldBossLog = require("../model/application/WorldBossLog");
const wbRedis = require("../util/worldBossRedis");
const EquipmentService = require("./EquipmentService");
const WorldBossConfig = require("./WorldBossConfig");
const { make: makeCharacter, enumSkills } = require("../model/application/RPGCharacter");

let rng = Math.random;

/**
 * 倒下狀態判定（含自然恢復的懶評估，LOCK §C/§D）。
 * 讀 poolScore；若已過恢復時間 → poolRemove 並視為站起（false）；
 * 仍在窗口內 → true；池中無此人 → false。
 * @param {Number} eventId
 * @param {String} platformId
 * @param {Number} recoveryMinutes
 * @param {Number} now ms timestamp
 * @returns {Promise<Boolean>}
 */
async function isKnockedDown(eventId, platformId, recoveryMinutes, now) {
  const score = await wbRedis.poolScore(eventId, platformId);
  if (score === null) {
    return false;
  }
  if (score + recoveryMinutes * 60000 <= now) {
    await wbRedis.poolRemove(eventId, platformId);
    return false;
  }
  return true;
}

/**
 * DPS 攻擊（解算刀）。所有副作用綁在此次出手。
 * 本檔為 WorldBossCombatService 的唯一建立者（M4，LOCK §A）；tank/healer 動詞由 M5「新增」，
 * 不重建本檔、不重定義 dpsAttack。數字 user.id 一律經 UserModel.getId（LOCK §D，無 _resolveNumericId）。
 * @param {Object} param0
 * @param {String} param0.platformId  LINE platform_id
 * @param {Number} param0.numericUserId  內部數字 user.id（缺漏時由 UserModel.getId 自解）
 * @param {Number} param0.eventId
 * @param {String} param0.attackType  "<jobKey>|<skill>"
 * @param {Number} param0.level  聊天等級
 * @returns {Promise<Object>}
 */
async function dpsAttack({ platformId, numericUserId, eventId, attackType, level }) {
  const event = await WorldBossEvent.getActive();
  if (!event || event.id !== eventId || event.status !== "active") {
    return reject("not_active");
  }

  const recoveryMinutes = WorldBossConfig.naturalRecoveryMinutes(event);
  const knocked = await isKnockedDown(eventId, platformId, recoveryMinutes, Date.now());
  if (knocked) {
    return reject("knocked_down");
  }

  const resolvedUserId =
    numericUserId === null || numericUserId === undefined
      ? await UserModel.getId(platformId)
      : numericUserId;

  // 傷害、狂暴帶與觸發解算於 Task 3-5 接續實作
  return resolveHit({
    platformId,
    numericUserId: resolvedUserId,
    eventId,
    attackType,
    level,
    event,
  });
}

/**
 * 統一駁回回傳（不寫 log、不扣精力）。
 * @param {String} reason
 * @returns {Object}
 */
function reject(reason) {
  return {
    damage: 0,
    contribution: 0,
    enraged: false,
    didEnrageTrigger: false,
    knockedBatch: [],
    selfKnocked: false,
    rejected: true,
    reason,
  };
}

/**
 * 實際命中解算（Task 3-5 接續實作）。
 */
async function resolveHit() {
  return reject("not_implemented");
}

module.exports = {
  dpsAttack,
  // 測試專用 RNG 注入縫（production 用 Math.random）
  _setRng: fn => {
    rng = fn;
  },
};
```

> Note: `rng`, `EquipmentService`, `makeCharacter`, and `enumSkills` are declared now so the file is complete; they are wired by Tasks 3–5 within this same milestone before the lint-gated commit (Task 5 Step 5). If lint flags them as unused before Task 3, proceed — they are consumed by the end of the milestone.

- [ ] **Step 4: Run it and confirm it PASSES.** Run `cd app && yarn test -- src/service/__tests__/WorldBossCombatService.dpsAttack.reject.test.js`. Expected: 6 tests green (the lazy-recovery and self-resolve tests pass because `resolveHit` returns a non-`rejected` shape only once Task 3 lands — until then they assert `rejected:false` against `reason:"not_implemented"`).

> **TDD honesty note:** the `lazy natural recovery` and `self-resolves numericUserId` tests assert `rejected: false` / `user_id`, which the stub `resolveHit` ("not_implemented", `rejected:true`, no log write) does NOT satisfy. That is intentional red-state for those two cases — they go green at **Task 3 Step 4** when `resolveHit` is implemented. Re-run this suite at Task 3 Step 4. The four pure reject/knock cases are green now.

- [ ] **Step 5: Commit.**
```bash
cd /home/hanshino/workspace/redive_linebot
git add app/src/service/WorldBossCombatService.js app/src/service/__tests__/WorldBossCombatService.dpsAttack.reject.test.js
git commit -m "feat(worldboss): dpsAttack skeleton + reject paths + lazy recovery via poolScore (UserModel.getId, no _resolveNumericId)"
```

---

### Task 3: `dpsAttack` calm-phase damage — `getStandardDamage` × equip (atk_percent fraction), log `{damage, contribution, role:'dps'}` with numeric `user_id`

**Files:**
- Modify: `app/src/service/WorldBossCombatService.js` (replace the `resolveHit` stub)
- Test: `app/src/service/__tests__/WorldBossCombatService.dpsAttack.calm.test.js`

**Interfaces:**
- *Consumes:* `makeCharacter(jobKey, { level })` → `.getStandardDamage()` (verified `Math.floor(Math.pow(level,2))+level*10`); `EquipmentService.getEquipmentBonuses(platformId)` returning `{ atk_percent }` as a **fraction**; `WorldBossConfig.normalAttackCost()`; M1 `WorldBossLog.createWithRole({ user_id /*numeric*/, world_boss_event_id, role, action_type, damage, cost, contribution })` and `WorldBossLog.getTotalDamageByEventId(eventId)` → `{ total_damage }`.
- *Produces (for Tasks 4/5):* in calm phase, `{ damage, contribution, enraged: false, didEnrageTrigger: false, knockedBatch: [], selfKnocked: false, rejected: false, reason: null }`. DPS `damage` drives HP and `contribution === damage` (DPS board mirror). Enrage ×2 is NOT yet applied (Task 4).

> **Damage formula (LOCK §D / addendum §1):** v1 DPS uses `getStandardDamage()` regardless of skill (skill-specific deferred to M9). Equip `atk_percent` is a fraction → `damage = Math.floor(damage * (1 + atk_percent))`. NO `/100`. The log's `user_id` is the NUMERIC `numericUserId` (LOCK §B); grants happen only at settlement (M7).
>
> **Phase decision (LOCK §D / addendum §6):** read `getTotalDamageByEventId(eventId)` → `{ total_damage }`; `remainHpBefore = event.hp - parseInt(total_damage || 0, 10)`. The hit STARTS in the enrage band when `remainHpBefore <= event.hp * thresholdPct/100`. This task computes the flag but only ships the calm path; `enraged` stays false in the calm tests.

Steps:

- [ ] **Step 1: Write the failing test.** Create `app/src/service/__tests__/WorldBossCombatService.dpsAttack.calm.test.js` (same mock block as Task 2, copied in full — `jest.mock` before requires).

```js
jest.mock("../../model/application/UserModel", () => ({
  getId: jest.fn(),
}));
jest.mock("../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
  casStatus: jest.fn(),
}));
jest.mock("../../model/application/WorldBossLog", () => ({
  createWithRole: jest.fn(),
  getRecentAttackers: jest.fn(),
  getTotalDamageByEventId: jest.fn(),
}));
jest.mock("../../util/worldBossRedis", () => ({
  poolAdd: jest.fn(),
  poolPopMin: jest.fn(),
  poolScore: jest.fn(),
  poolRemove: jest.fn(),
  shieldSet: jest.fn(),
  shieldConsume: jest.fn(),
  blockSet: jest.fn(),
  blockOwner: jest.fn(),
}));
jest.mock("../EquipmentService", () => ({
  getEquipmentBonuses: jest.fn(),
}));
jest.mock("../WorldBossConfig", () => ({
  normalAttackCost: jest.fn(() => 10),
  enrageDamageMultiplier: jest.fn(() => 2),
  enrageContributionMultiplier: jest.fn(() => 2),
  enrageThresholdPct: jest.fn(() => 35),
  enrageBatchSize: jest.fn(() => 20),
  enrageRecentMinutes: jest.fn(() => 10),
  enrageCounterRate: jest.fn(() => 0.15),
  naturalRecoveryMinutes: jest.fn(() => 15),
}));

const WorldBossEvent = require("../../model/application/WorldBossEvent");
const WorldBossLog = require("../../model/application/WorldBossLog");
const wbRedis = require("../../util/worldBossRedis");
const EquipmentService = require("../EquipmentService");
const combat = require("../WorldBossCombatService");

describe("WorldBossCombatService.dpsAttack — calm phase damage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    wbRedis.poolScore.mockResolvedValue(null);
    // calm: only a small amount of HP gone, well above the 35% threshold
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 1000 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
  });

  test("level-50 swordman standard hit = getStandardDamage (2500+500=3000)", async () => {
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // getStandardDamage(50) = floor(50^2) + 50*10 = 2500 + 500 = 3000
    expect(result.rejected).toBe(false);
    expect(result.enraged).toBe(false);
    expect(result.didEnrageTrigger).toBe(false);
    expect(result.damage).toBe(3000);
    expect(result.contribution).toBe(3000);
  });

  test("atk_percent equip bonus (fraction) multiplies damage", async () => {
    // atk_percent is a FRACTION (addendum §2): 0.5 => x1.5
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ atk_percent: 0.5 });
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // floor(3000 * 1.5) = 4500
    expect(result.damage).toBe(4500);
    expect(result.contribution).toBe(4500);
  });

  test("getEquipmentBonuses is keyed on platformId", async () => {
    await combat.dpsAttack({
      platformId: "Uabc",
      numericUserId: 42,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(EquipmentService.getEquipmentBonuses).toHaveBeenCalledWith("Uabc");
  });

  test("writes one dps log row with NUMERIC user_id and contribution=damage", async () => {
    await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 42,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(WorldBossLog.createWithRole).toHaveBeenCalledTimes(1);
    const arg = WorldBossLog.createWithRole.mock.calls[0][0];
    expect(arg).toMatchObject({
      user_id: 42,
      world_boss_event_id: 7,
      role: "dps",
      action_type: "swordman|standard",
      damage: 3000,
      cost: 10,
      contribution: 3000,
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** Run `cd app && yarn test -- src/service/__tests__/WorldBossCombatService.dpsAttack.calm.test.js`. Expected: failures — `resolveHit` currently returns `reason: "not_implemented"`, so `rejected` is true and `damage` is 0.

- [ ] **Step 3: Implement the calm-phase `resolveHit`.** In `app/src/service/WorldBossCombatService.js`, replace the entire `resolveHit` stub function with the version below.

```js
/**
 * 命中解算（calm 階段傷害；Task 4/5 補上狂暴 ×2、致命 CAS 與進場觸發）。
 * @param {Object} param0
 * @returns {Promise<Object>}
 */
async function resolveHit({ platformId, numericUserId, eventId, attackType, level, event }) {
  const jobKey = String(attackType).split("|")[0];
  const character = makeCharacter(jobKey, { level });
  // v1 DPS 一律使用 getStandardDamage（skill-specific 留待 M9，LOCK §D）
  let damage = character.getStandardDamage();

  // atk_percent 為「小數比例」（addendum §2），直接 *(1+atk_percent)
  const bonuses = await EquipmentService.getEquipmentBonuses(platformId);
  const atkPercent = bonuses && bonuses.atk_percent > 0 ? bonuses.atk_percent : 0;
  if (atkPercent > 0) {
    damage = Math.floor(damage * (1 + atkPercent));
  }

  const cost = WorldBossConfig.normalAttackCost();

  // 階段判定：剩餘血量是否已進狂暴帶（HP 動態計算，無 remain_hp 欄位，addendum §6）
  const { total_damage: totalDamage = 0 } = await WorldBossLog.getTotalDamageByEventId(eventId);
  const remainHpBefore = event.hp - parseInt(totalDamage || 0, 10);
  const enrageThreshold = (event.hp * WorldBossConfig.enrageThresholdPct(event)) / 100;
  const enraged = remainHpBefore <= enrageThreshold;

  const contribution = damage; // DPS 榜：contribution 鏡像 damage

  await WorldBossLog.createWithRole({
    user_id: numericUserId,
    world_boss_event_id: eventId,
    role: "dps",
    action_type: attackType,
    damage,
    cost,
    contribution,
  });

  return {
    damage,
    contribution,
    enraged,
    didEnrageTrigger: false,
    knockedBatch: [],
    selfKnocked: false,
    rejected: false,
    reason: null,
  };
}
```

- [ ] **Step 4: Run it and confirm it PASSES.** Run `cd app && yarn test -- src/service/__tests__/WorldBossCombatService.dpsAttack.calm.test.js`. Expected: 4 tests green. Re-run the reject suite — now ALL 6 are green (the lazy-recovery + self-resolve cases go green here because `resolveHit` no longer returns `not_implemented`): `cd app && yarn test -- src/service/__tests__/WorldBossCombatService.dpsAttack.reject.test.js`.

- [ ] **Step 5: Commit.**
```bash
cd /home/hanshino/workspace/redive_linebot
git add app/src/service/WorldBossCombatService.js app/src/service/__tests__/WorldBossCombatService.dpsAttack.calm.test.js
git commit -m "feat(worldboss): dpsAttack calm-phase damage via getStandardDamage + equip atk_percent (fraction)"
```

---

### Task 4: Enrage band (×2 damage + ×2 contribution) and kill CAS on the lethal hit

**Files:**
- Modify: `app/src/service/WorldBossCombatService.js` (extend the tail of `resolveHit`)
- Test: `app/src/service/__tests__/WorldBossCombatService.dpsAttack.enrageBand.test.js`

**Interfaces:**
- *Consumes:* `WorldBossConfig.enrageDamageMultiplier()` (= 2); M1 `WorldBossEvent.casStatus(eventId, "active", "killed", { killed_at })`.
- *Produces:* when the hit STARTS in the band (`remainHpBefore <= threshold`), `enraged: true` and the log row stores ×2 damage AND ×2 contribution (LOCK §D — applies to BOTH, after equipment, at write time). When `remainHpBefore - effectiveDamage <= 0` the hit is lethal → `casStatus(eventId, "active", "killed", { killed_at: <Date> })` (settlement is M7's job).

> **Crossing-hit rule (LOCK §D — LOCKED).** The ×2 applies ONLY to hits that START already enraged. The crossing hit (which starts in calm, `remainHpBefore > threshold`) is NOT doubled — it stays at its calm damage and instead fires the trigger (Task 5). So the doubling here is gated on the `enraged` flag computed in Task 3 (`remainHpBefore <= threshold`), which is exactly "started in the band."
>
> **Ordering (LOCK §D / addendum §1, §5):** ×2 is applied to the post-equip damage before the log write and the kill check. `contribution = damage` after ×2 — because the doubled value already reflects both the damage ×2 and the contribution ×2 (the two config knobs are equal), M4 multiplies once and does NOT re-apply `enrageContributionMultiplier()` (it remains a knob for a future divergence). Kill CAS happens AFTER the log write so the lethal damage is durable, and is best-effort idempotent: if `casStatus` returns false (someone else crossed the line first), we still return the computed result.

Steps:

- [ ] **Step 1: Write the failing test.** Create `app/src/service/__tests__/WorldBossCombatService.dpsAttack.enrageBand.test.js` (full mock block again; counter rate stubbed to 0 for determinism).

```js
jest.mock("../../model/application/UserModel", () => ({
  getId: jest.fn(),
}));
jest.mock("../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
  casStatus: jest.fn(),
}));
jest.mock("../../model/application/WorldBossLog", () => ({
  createWithRole: jest.fn(),
  getRecentAttackers: jest.fn(),
  getTotalDamageByEventId: jest.fn(),
}));
jest.mock("../../util/worldBossRedis", () => ({
  poolAdd: jest.fn(),
  poolPopMin: jest.fn(),
  poolScore: jest.fn(),
  poolRemove: jest.fn(),
  shieldSet: jest.fn(),
  shieldConsume: jest.fn(),
  blockSet: jest.fn(),
  blockOwner: jest.fn(),
}));
jest.mock("../EquipmentService", () => ({
  getEquipmentBonuses: jest.fn(),
}));
jest.mock("../WorldBossConfig", () => ({
  normalAttackCost: jest.fn(() => 10),
  enrageDamageMultiplier: jest.fn(() => 2),
  enrageContributionMultiplier: jest.fn(() => 2),
  enrageThresholdPct: jest.fn(() => 35),
  enrageBatchSize: jest.fn(() => 20),
  enrageRecentMinutes: jest.fn(() => 10),
  enrageCounterRate: jest.fn(() => 0), // disable counter so this suite is deterministic
  naturalRecoveryMinutes: jest.fn(() => 15),
}));

const WorldBossEvent = require("../../model/application/WorldBossEvent");
const WorldBossLog = require("../../model/application/WorldBossLog");
const wbRedis = require("../../util/worldBossRedis");
const EquipmentService = require("../EquipmentService");
const combat = require("../WorldBossCombatService");

describe("WorldBossCombatService.dpsAttack — enrage band", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wbRedis.poolScore.mockResolvedValue(null);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
    WorldBossEvent.casStatus.mockResolvedValue(true);
    combat._setRng(() => 0.99); // counter disabled
  });

  test("a hit that STARTS in the enrage band has damage and contribution doubled", async () => {
    // hp 100000, threshold 35% = 35000. Already 70000 done -> remainBefore 30000 <= 35000 -> enraged
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 70000 });

    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // base 3000, enrage x2 -> 6000
    expect(result.enraged).toBe(true);
    expect(result.didEnrageTrigger).toBe(false); // not a crossing hit; started in band
    expect(result.damage).toBe(6000);
    expect(result.contribution).toBe(6000);
    const logArg = WorldBossLog.createWithRole.mock.calls[0][0];
    expect(logArg.damage).toBe(6000);
    expect(logArg.contribution).toBe(6000);
  });

  test("lethal hit triggers casStatus active->killed after the log write", async () => {
    // remainBefore 5000, enraged; base 3000 x2 = 6000 >= 5000 -> lethal
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 95000 });

    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.damage).toBe(6000);
    expect(WorldBossLog.createWithRole).toHaveBeenCalledTimes(1);
    expect(WorldBossEvent.casStatus).toHaveBeenCalledWith(
      7,
      "active",
      "killed",
      expect.objectContaining({ killed_at: expect.any(Date) })
    );
  });

  test("non-lethal calm hit does NOT call casStatus and is not doubled", async () => {
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 1000 });

    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.damage).toBe(3000);
    expect(WorldBossEvent.casStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** Run `cd app && yarn test -- src/service/__tests__/WorldBossCombatService.dpsAttack.enrageBand.test.js`. Expected: the doubling and casStatus assertions fail (the current `resolveHit` never applies ×2 nor calls casStatus).

- [ ] **Step 3: Extend `resolveHit`.** In `app/src/service/WorldBossCombatService.js`, replace the section of `resolveHit` from `const contribution = damage;` through the final `return {...};` with the code below. The function head (jobKey / character / standard damage / equip / `enraged` computation) from Task 3 stays unchanged.

```js
  // 狂暴帶（本刀「開始時」就在帶內）：傷害 ×2（LOCK §D，於寫帳前套用）。
  // 跨越門檻的那一刀因起始在 calm（enraged=false）不在此放大——它改為觸發進場批次（Task 5）。
  if (enraged) {
    damage = damage * WorldBossConfig.enrageDamageMultiplier();
  }
  // contribution 鏡像 damage：狂暴時 damage 已含 ×2，等同 contribution 也 ×2（LOCK §D）。
  // enrageContributionMultiplier() 與 enrageDamageMultiplier() 相等，故僅套用一次、不二次相乘。
  const contribution = damage;

  await WorldBossLog.createWithRole({
    user_id: numericUserId,
    world_boss_event_id: eventId,
    role: "dps",
    action_type: attackType,
    damage,
    cost,
    contribution,
  });

  // 致命刀：剩餘血量扣掉本刀 <= 0 → CAS active→killed（結算交給 M7 cron，stamp killed_at）
  const remainHpAfter = remainHpBefore - damage;
  if (remainHpAfter <= 0) {
    await WorldBossEvent.casStatus(eventId, "active", "killed", { killed_at: new Date() });
  }

  return {
    damage,
    contribution,
    enraged,
    didEnrageTrigger: false,
    knockedBatch: [],
    selfKnocked: false,
    rejected: false,
    reason: null,
  };
```

- [ ] **Step 4: Run it and confirm it PASSES.** Run `cd app && yarn test -- src/service/__tests__/WorldBossCombatService.dpsAttack.enrageBand.test.js`. Expected: 3 tests green. Re-run calm + reject suites — still green.

- [ ] **Step 5: Commit.**
```bash
cd /home/hanshino/workspace/redive_linebot
git add app/src/service/WorldBossCombatService.js app/src/service/__tests__/WorldBossCombatService.dpsAttack.enrageBand.test.js
git commit -m "feat(worldboss): enrage band x2 damage/contribution + kill CAS on lethal hit"
```

---

### Task 5: Enrage TRIGGER — crossing-hit batch-knock of recent attackers (block/shield absorb + owner contribution writeback) and self counter-knockdown

**Files:**
- Modify: `app/src/service/WorldBossCombatService.js` (extend the tail of `resolveHit`; add `runEnrageBatch` + `writeAbsorbContribution` helpers; use the Task 2 RNG seam and `UserModel.getId`)
- Test: `app/src/service/__tests__/WorldBossCombatService.dpsAttack.enrageTrigger.test.js`

**Interfaces:**
- *Consumes:* M1 `WorldBossLog.getRecentAttackers({ eventId, minutes, limit })` → `[{ user_id: <numeric>, platform_id: <string> }]` (LOCK §B/§E — the trigger reads `candidate.platform_id` to ZADD into the pool, because pool identity = platform_id); Task 1 `worldBossRedis.blockOwner`, `shieldConsume`, `poolAdd`; `WorldBossConfig.enrageBatchSize(event)` (`defense` col, default 20, INTEGER), `WorldBossConfig.enrageRecentMinutes(event)` (default 10), `WorldBossConfig.enrageCounterRate(event)` (`attack` col fraction, default 0.15); M1 `WorldBossLog.createWithRole`; `UserModel.getId(platformId)` (to convert a credited block/shield owner's platform_id → numeric `user_id` before the writeback row, LOCK §B/§D).
- *Produces:* the FULL `dpsAttack` result. On the crossing hit (`remainHpBefore > threshold && remainHpAfter <= threshold && remainHpAfter > 0`): `didEnrageTrigger: true` and `knockedBatch: [platformId,...]`. For a hit that started in the band, each enraged hit rolls counter knockdown: `selfKnocked: true` adds the attacker (by `platformId`) to the pool.

> **Trigger algorithm (D13/D14/D16/D17 timing; LOCK §B/§D):**
> 1. Detect the *crossing* hit: `remainHpBefore > threshold && remainHpAfter <= threshold` — only the ONE hit that crosses triggers the batch; subsequent enraged hits do not re-trigger. Trigger only when `remainHpAfter > 0` (a dead boss has no battlefield to credit). The crossing hit is NOT doubled (Task 4 only doubles hits that started enraged).
> 2. Fetch `getRecentAttackers({ eventId, minutes: enrageRecentMinutes, limit: enrageBatchSize })` — last-N attack rows in the window (raw row count, no app-level dedupe). `limit` is the INTEGER `enrageBatchSize` config — NOT derived from any float equipment bonus.
> 3. For each candidate (read `candidate.platform_id`), in order: if a tank block window is open (`blockOwner(eventId)` returns an owner) AND the single v1 block slot remains → DO NOT pool them; the block owner earns +1 contribution (a `tank` `createWithRole` row whose `user_id` is `UserModel.getId(blockOwner)`). Else if `shieldConsume(eventId, candidate.platform_id)` returns a shield owner → DO NOT pool; the shield owner earns +1 contribution (a `healer` row whose `user_id` is `UserModel.getId(shieldOwner)`). Else → `poolAdd(eventId, candidate.platform_id, now)` and push to `knockedBatch`.
> 4. Counter knockdown (per enraged hit): if `enraged && rng() < enrageCounterRate(event)` → `poolAdd(eventId, platformId, now)`, `selfKnocked: true`.
>
> **Writeback identity (LOCK §B/§D).** Block/shield contribution rows credit an OWNER known only by `platform_id`; `world_boss_event_log.user_id` must be NUMERIC. M4 resolves the owner's numeric id locally via `UserModel.getId(platformId)` (NEVER minigame) and writes a numeric `user_id` directly. If the owner has no `user` row (`UserModel.getId` → null) the writeback row is SKIPPED (never mis-credit, LOCK §B). Boards still read `SUM(contribution)` from the durable log; Redis never scores.
>
> **Block-slot accounting (v1, minimal, D16):** the block window absorbs ONE candidate per open window — the first candidate is absorbed if a block owner exists, the owner gets +1, and `wb:block` is left to expire by TTL (no decrement bookkeeping). Multi-slot block (driven by floored integer `block_power`) is M5's tank work; this DPS-trigger credits at most one block absorption. Shields are per-target tokens consumed individually.
>
> **RNG seam:** `resolveHit` uses the module-level `rng` (defaults to `Math.random`) from Task 2; tests set it via `_setRng`.

Steps:

- [ ] **Step 1: Write the failing test.** Create `app/src/service/__tests__/WorldBossCombatService.dpsAttack.enrageTrigger.test.js`. `UserModel.getId` is mocked so the writeback rows assert a NUMERIC `user_id` (owners: `Utank`→900, `Uhealer`→901).

```js
jest.mock("../../model/application/UserModel", () => ({
  getId: jest.fn(),
}));
jest.mock("../../model/application/WorldBossEvent", () => ({
  getActive: jest.fn(),
  casStatus: jest.fn(),
}));
jest.mock("../../model/application/WorldBossLog", () => ({
  createWithRole: jest.fn(),
  getRecentAttackers: jest.fn(),
  getTotalDamageByEventId: jest.fn(),
}));
jest.mock("../../util/worldBossRedis", () => ({
  poolAdd: jest.fn(),
  poolPopMin: jest.fn(),
  poolScore: jest.fn(),
  poolRemove: jest.fn(),
  shieldSet: jest.fn(),
  shieldConsume: jest.fn(),
  blockSet: jest.fn(),
  blockOwner: jest.fn(),
}));
jest.mock("../EquipmentService", () => ({
  getEquipmentBonuses: jest.fn(),
}));
jest.mock("../WorldBossConfig", () => ({
  normalAttackCost: jest.fn(() => 10),
  enrageDamageMultiplier: jest.fn(() => 2),
  enrageContributionMultiplier: jest.fn(() => 2),
  enrageThresholdPct: jest.fn(() => 35),
  enrageBatchSize: jest.fn(() => 20),
  enrageRecentMinutes: jest.fn(() => 10),
  enrageCounterRate: jest.fn(() => 0.15),
  naturalRecoveryMinutes: jest.fn(() => 15),
}));

const UserModel = require("../../model/application/UserModel");
const WorldBossEvent = require("../../model/application/WorldBossEvent");
const WorldBossLog = require("../../model/application/WorldBossLog");
const wbRedis = require("../../util/worldBossRedis");
const EquipmentService = require("../EquipmentService");
const combat = require("../WorldBossCombatService");

describe("WorldBossCombatService.dpsAttack — enrage trigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wbRedis.poolScore.mockResolvedValue(null);
    wbRedis.blockOwner.mockResolvedValue(null);
    wbRedis.shieldConsume.mockResolvedValue(null);
    WorldBossLog.createWithRole.mockResolvedValue(1);
    EquipmentService.getEquipmentBonuses.mockResolvedValue({ atk_percent: 0 });
    WorldBossEvent.casStatus.mockResolvedValue(true);
    WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active", hp: 100000, luck: 0 });
    // owner platform_id -> numeric user.id
    UserModel.getId.mockImplementation(async pid =>
      ({ Utank: 900, Uhealer: 901 }[pid] || null)
    );
    combat._setRng(() => 0.99); // counter disabled by default in these cases
  });

  function crossing() {
    // hp 100000, threshold 35000. The crossing hit is computed in CALM (remainBefore > threshold)
    // so NO x2 this hit; damage=3000. remainBefore=36000 (>35000), remainAfter=33000 (<=35000).
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 64000 });
  }

  test("crossing hit pools the recent-N attackers (by platform_id) and sets didEnrageTrigger", async () => {
    crossing();
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { user_id: 10, platform_id: "Ua" },
      { user_id: 11, platform_id: "Ub" },
    ]);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.didEnrageTrigger).toBe(true);
    expect(result.enraged).toBe(false); // crossing hit started in calm -> not doubled
    expect(result.damage).toBe(3000);
    expect(WorldBossLog.getRecentAttackers).toHaveBeenCalledWith({
      eventId: 7,
      minutes: 10,
      limit: 20,
    });
    expect(wbRedis.poolAdd).toHaveBeenCalledWith(7, "Ua", expect.any(Number));
    expect(wbRedis.poolAdd).toHaveBeenCalledWith(7, "Ub", expect.any(Number));
    expect(result.knockedBatch).toEqual(["Ua", "Ub"]);
  });

  test("tank block absorbs first candidate and credits the block owner (numeric user_id)", async () => {
    crossing();
    wbRedis.blockOwner.mockResolvedValue("Utank");
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { user_id: 10, platform_id: "Ua" },
      { user_id: 11, platform_id: "Ub" },
    ]);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // Ua absorbed by the wall (not pooled), Ub pooled
    expect(result.knockedBatch).toEqual(["Ub"]);
    expect(wbRedis.poolAdd).not.toHaveBeenCalledWith(7, "Ua", expect.any(Number));
    // tank contribution writeback: a tank log row crediting Utank, resolved to numeric user_id 900
    const tankLog = WorldBossLog.createWithRole.mock.calls.find(c => c[0].role === "tank");
    expect(tankLog).toBeDefined();
    expect(tankLog[0]).toMatchObject({
      user_id: 900,
      world_boss_event_id: 7,
      role: "tank",
      contribution: 1,
      cost: 0,
    });
  });

  test("shield absorbs a candidate and credits the shield owner (healer writeback, numeric)", async () => {
    crossing();
    wbRedis.shieldConsume.mockImplementation(async (eventId, target) =>
      target === "Ua" ? "Uhealer" : null
    );
    WorldBossLog.getRecentAttackers.mockResolvedValue([
      { user_id: 10, platform_id: "Ua" },
      { user_id: 11, platform_id: "Ub" },
    ]);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.knockedBatch).toEqual(["Ub"]);
    const healerLog = WorldBossLog.createWithRole.mock.calls.find(c => c[0].role === "healer");
    expect(healerLog).toBeDefined();
    expect(healerLog[0]).toMatchObject({
      user_id: 901,
      world_boss_event_id: 7,
      role: "healer",
      contribution: 1,
      cost: 0,
    });
  });

  test("skips writeback when the credited owner has no user row", async () => {
    crossing();
    UserModel.getId.mockResolvedValue(null); // Utank resolves to null
    wbRedis.blockOwner.mockResolvedValue("Utank");
    WorldBossLog.getRecentAttackers.mockResolvedValue([{ user_id: 10, platform_id: "Ua" }]);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    // Ua still absorbed (not pooled), but no tank writeback row written
    expect(result.knockedBatch).toEqual([]);
    const tankLog = WorldBossLog.createWithRole.mock.calls.find(c => c[0].role === "tank");
    expect(tankLog).toBeUndefined();
  });

  test("counter knockdown pools the attacker (by platformId) when rng < counter_rate (enraged hit)", async () => {
    // already enraged (started in band), not a crossing hit
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 70000 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    combat._setRng(() => 0.05); // < 0.15 -> counter fires
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.enraged).toBe(true);
    expect(result.didEnrageTrigger).toBe(false); // not a crossing hit
    expect(result.selfKnocked).toBe(true);
    expect(wbRedis.poolAdd).toHaveBeenCalledWith(7, "U1", expect.any(Number));
  });

  test("no counter when rng >= counter_rate", async () => {
    WorldBossLog.getTotalDamageByEventId.mockResolvedValue({ total_damage: 70000 });
    WorldBossLog.getRecentAttackers.mockResolvedValue([]);
    combat._setRng(() => 0.5);
    const result = await combat.dpsAttack({
      platformId: "U1",
      numericUserId: 1,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
    expect(result.selfKnocked).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** Run `cd app && yarn test -- src/service/__tests__/WorldBossCombatService.dpsAttack.enrageTrigger.test.js`. Expected: failures — trigger/counter logic is absent (`didEnrageTrigger` stays false, `knockedBatch` empty, no writeback rows).

- [ ] **Step 3: Add the `UserModel` require, extend `resolveHit` with trigger + counter, and add the helpers.** `UserModel` is already required at the top of the file (Task 2). In `resolveHit`, the head and the ×2 + log-write block from Task 4 stay. Replace the tail of `resolveHit` — from `const remainHpAfter = remainHpBefore - damage;` through the final `return {...};` — with the block below, then add the two helpers immediately after `resolveHit`.

```js
  const remainHpAfter = remainHpBefore - damage;
  const now = Date.now();

  let didEnrageTrigger = false;
  let knockedBatch = [];
  let selfKnocked = false;

  // 致命刀：CAS active→killed（結算交給 M7，stamp killed_at）。死王不觸發進場批次（沒有戰場可信用）。
  if (remainHpAfter <= 0) {
    await WorldBossEvent.casStatus(eventId, "active", "killed", { killed_at: new Date() });
  } else {
    // 跨越門檻的那「一刀」觸發進場批次（之後的狂暴刀不再重觸發；此刀起始在 calm，故未被 ×2）。
    const crossed = remainHpBefore > enrageThreshold && remainHpAfter <= enrageThreshold;
    if (crossed) {
      didEnrageTrigger = true;
      knockedBatch = await runEnrageBatch({ eventId, event, now });
    }

    // 狂暴期持續反擊：本刀「開始時」就在狂暴帶且骰中反擊機率 → 自己被擊倒進池（member = platform_id）
    if (enraged && rng() < WorldBossConfig.enrageCounterRate(event)) {
      await wbRedis.poolAdd(eventId, platformId, now);
      selfKnocked = true;
    }
  }

  return {
    damage,
    contribution,
    enraged,
    didEnrageTrigger,
    knockedBatch,
    selfKnocked,
    rejected: false,
    reason: null,
  };
}

/**
 * 進場批次：撈最近 N 個攻擊者，逐一嘗試被坦克牆/護盾吸收，否則打進待救池。
 * 被吸收時為 owner 代寫一筆貢獻 LOG（LOCK §B/§D 落帳時序）。
 * pool / shield / block 的 member 與 owner 一律為 platform_id（LOCK §B）；
 * 代寫 LOG 前一律以 UserModel.getId 將 owner 的 platform_id 轉成數字 user_id（LOCK §D）；
 * 找不到 user 列（已刪帳號）則略過該筆代寫（不誤算）。
 * @param {Object} param0
 * @param {Number} param0.eventId
 * @param {Object} param0.event
 * @param {Number} param0.now
 * @returns {Promise<String[]>} 實際被打進池的 platformId 清單
 */
async function runEnrageBatch({ eventId, event, now }) {
  const minutes = WorldBossConfig.enrageRecentMinutes(event);
  const limit = WorldBossConfig.enrageBatchSize(event); // 整數，非任何浮點裝備值
  const candidates = await WorldBossLog.getRecentAttackers({ eventId, minutes, limit });

  const knockedBatch = [];
  let blockUsed = false;
  const owner = await wbRedis.blockOwner(eventId);

  for (const candidate of candidates) {
    const target = candidate.platform_id;

    // 坦克牆吸收（v1 單一名額）
    if (owner && !blockUsed) {
      blockUsed = true;
      await writeAbsorbContribution(eventId, "tank", "block_absorb", owner);
      continue;
    }

    // 護盾吸收（per-target token，GETDEL 消耗即刪）
    const shieldOwner = await wbRedis.shieldConsume(eventId, target);
    if (shieldOwner) {
      await writeAbsorbContribution(eventId, "healer", "shield_absorb", shieldOwner);
      continue;
    }

    // 沒被吸收 → 打進待救池（member = platform_id）
    await wbRedis.poolAdd(eventId, target, now);
    knockedBatch.push(target);
  }

  return knockedBatch;
}

/**
 * 為被吸收的擊倒代寫一筆 +1 貢獻 LOG。owner 以 platform_id 給入，於此處經 UserModel.getId
 * 轉數字 user_id；找不到 user 列則略過（LOCK §B/§D，不誤算）。
 * @param {Number} eventId
 * @param {String} role  "tank" | "healer"
 * @param {String} actionType
 * @param {String} ownerPlatformId
 * @returns {Promise<void>}
 */
async function writeAbsorbContribution(eventId, role, actionType, ownerPlatformId) {
  const ownerNumericId = await UserModel.getId(ownerPlatformId);
  if (ownerNumericId === null) {
    return;
  }
  await WorldBossLog.createWithRole({
    user_id: ownerNumericId,
    world_boss_event_id: eventId,
    role,
    action_type: actionType,
    damage: 0,
    cost: 0,
    contribution: 1,
  });
}
```

- [ ] **Step 4: Run it and confirm it PASSES.** Run `cd app && yarn test -- src/service/__tests__/WorldBossCombatService.dpsAttack.enrageTrigger.test.js`. Expected: all 6 tests green. Then run the whole combat suite for no regressions: `cd app && yarn test -- src/service/__tests__/WorldBossCombatService`. Expected: reject + calm + enrageBand + enrageTrigger all green.

- [ ] **Step 5: Lint the touched files.** Run `cd app && yarn lint -- src/service/WorldBossCombatService.js src/util/worldBossRedis.js`. Expected: no errors (double quotes, es5 trailing commas, 100-char width; `rng`/`makeCharacter`/`enumSkills`/`EquipmentService`/`UserModel` are all consumed by now — note `enumSkills` is referenced only in the head comment in v1; if ESLint flags it unused, drop it from the destructure: `const { make: makeCharacter } = require(...)`).

- [ ] **Step 6: Commit.**
```bash
cd /home/hanshino/workspace/redive_linebot
git add app/src/service/WorldBossCombatService.js app/src/service/__tests__/WorldBossCombatService.dpsAttack.enrageTrigger.test.js
git commit -m "feat(worldboss): enrage trigger batch-knock + block/shield contribution writeback (UserModel.getId numeric) + counter knockdown"
```

---

### Task 6: Route the controller's DPS `attackOnBoss` through `WorldBossCombatService.dpsAttack`, with immediate-reply on reject

**Files:**
- Modify: `app/src/controller/application/WorldBossController.js` — replace the body of `attackOnBoss` (defined at line 448 through its closing `};` at line 642, plus `exports.attackOnBoss = attackOnBoss;` at line 644) so DPS attacks delegate damage/phase/enrage to the service; the existing `attack` wrapper (lines 179–204) and `handleKeepingMessage` (defined at line 652) stay intact.
- Modify: `app/locales/zh_tw.json` — add new `message.world_boss.*` keys.
- Test: `app/src/controller/application/__tests__/WorldBossController.attackOnBoss.test.js`

**Interfaces:**
- *Consumes:* Tasks 2–5 `WorldBossCombatService.dpsAttack({ platformId, numericUserId, eventId, attackType, level })`; M2 `WorldBossRoleService.getRole(platformId)` → `"dps"|"healer"|"tank"|null`; the existing `minigameService.findByUserId(userId)` (returns `{ level, job_key }`) + `createByUserId`/`defaultData` (`{ level: 1, exp: 0 }`, has NO `job_key`); `enumSkills` (already required at line 18); the existing `handleKeepingMessage(worldBossEventId, context, text)` (reply-token bound, NO Push — verified `WorldBossController.js:652-700`).
- *Produces:* a thinner `attackOnBoss` that builds the canonical `attackType = "<jobKey>|<skill>"` from the player's job, calls `dpsAttack` with `numericUserId = context.event.source.id` (numeric `user.id`), and routes the result: (a) immediate `replyText` on `rejected` (bypass batch — D24); (b) success narration into `handleKeepingMessage` in groups / immediate reply in 1:1; (c) a one-time immediate enrage announce when `didEnrageTrigger` is true in a group.

> **No-push / batch contract (D24) — VERIFIED.** `handleKeepingMessage` batches via `context.state.worldBoss.lastSendTs` (5-minute window) and flushes through `context.reply*` (reply-token bound, NOT LINE Push). This task reuses it unchanged and introduces NO Push call. Routing:
> - `rejected` → immediate `context.replyText(...)`, bypass batch, no further work. `not_active` → `i18n.__("message.world_boss_event_no_ongoing")` (existing key); `knocked_down` → `i18n.__("message.world_boss.knocked_down")` (new).
> - success in a group → narration into `handleKeepingMessage` (5-min batch).
> - success in 1:1 → immediate `replyText`.
> - `didEnrageTrigger === true` in a group → one immediate `context.replyText(i18n.__("message.world_boss.enrage_announce"))` (bypass batch; once per event, because only the crossing hit sets the flag), IN ADDITION to the batched narration.

> **Scope guard (LOCK §A.M9).** This task ONLY rewires the DPS path of `attackOnBoss` to the new service and proves routing/reply branching. The full controller rewrite (verbs `#格擋`/`#復活`/`#護盾`/`#職業`, postback actions, report card, Flex board templates, `destory→destroy` fix, `#夢幻回歸` removal, daily-limit/`isUserCanAttack` consolidation, the `worldBossEventLogService` exp/penalty path, the `getTopTen`/`worldRank` JSON-dump fixes) is M9 — do NOT do it here. Tank/healer verbs route through M5's additions; this task keeps only the DPS path and rejects non-DPS callers with a clear message until M9 wires the rest.

Steps:

- [ ] **Step 1: Write the failing test.** Create `app/src/controller/application/__tests__/WorldBossController.attackOnBoss.test.js`. Mocks before requires.

```js
jest.mock("../../../service/WorldBossCombatService", () => ({
  dpsAttack: jest.fn(),
}));
jest.mock("../../../service/WorldBossRoleService", () => ({
  getRole: jest.fn(),
}));
jest.mock("../../../service/MinigameService", () => ({
  findByUserId: jest.fn(),
  createByUserId: jest.fn(),
  defaultData: { level: 1, exp: 0 },
}));
jest.mock("../../../service/AchievementEngine", () => ({
  evaluate: jest.fn(() => Promise.resolve({ unlocked: [] })),
}));
jest.mock("../../../service/achievementNotifier", () => ({
  notifyUnlocks: jest.fn(),
}));

const WorldBossCombatService = require("../../../service/WorldBossCombatService");
const WorldBossRoleService = require("../../../service/WorldBossRoleService");
const minigameService = require("../../../service/MinigameService");
const controller = require("../WorldBossController");

function makeContext({ type = "user" } = {}) {
  return {
    event: {
      isText: true,
      source: {
        type,
        id: 42,
        userId: "U1",
        displayName: "Tester",
        pictureUrl: "http://x/p.png",
        groupId: type === "group" ? "G1" : undefined,
      },
      message: { quoteToken: "qt" },
    },
    state: {},
    replyText: jest.fn(),
    reply: jest.fn(),
    setState: jest.fn(),
  };
}

describe("attackOnBoss DPS routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WorldBossRoleService.getRole.mockResolvedValue("dps");
    minigameService.findByUserId.mockResolvedValue({ level: 50, job_key: "swordman" });
  });

  test("builds canonical attackType from job + delegates to dpsAttack with both ids", async () => {
    WorldBossCombatService.dpsAttack.mockResolvedValue({
      rejected: false,
      damage: 3000,
      contribution: 3000,
      enraged: false,
      didEnrageTrigger: false,
      knockedBatch: [],
      selfKnocked: false,
    });
    const ctx = makeContext({ type: "user" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    expect(WorldBossCombatService.dpsAttack).toHaveBeenCalledWith({
      platformId: "U1",
      numericUserId: 42,
      eventId: 7,
      attackType: "swordman|standard",
      level: 50,
    });
  });

  test("rejected (knocked_down) replies immediately and never narrates", async () => {
    WorldBossCombatService.dpsAttack.mockResolvedValue({
      rejected: true,
      reason: "knocked_down",
      damage: 0,
    });
    const ctx = makeContext({ type: "user" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    expect(ctx.replyText).toHaveBeenCalledTimes(1);
  });

  test("1:1 success replies immediately with damage narration", async () => {
    WorldBossCombatService.dpsAttack.mockResolvedValue({
      rejected: false,
      damage: 3000,
      contribution: 3000,
      enraged: false,
      didEnrageTrigger: false,
      knockedBatch: [],
      selfKnocked: false,
    });
    const ctx = makeContext({ type: "user" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    expect(ctx.replyText).toHaveBeenCalled();
    const msg = ctx.replyText.mock.calls[0][0];
    expect(String(msg)).toContain("3000");
  });

  test("group enrage-trigger hit emits a one-time immediate enrage announce", async () => {
    WorldBossCombatService.dpsAttack.mockResolvedValue({
      rejected: false,
      damage: 3000,
      contribution: 3000,
      enraged: false,
      didEnrageTrigger: true,
      knockedBatch: ["Ua", "Ub"],
      selfKnocked: false,
    });
    const ctx = makeContext({ type: "group" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    // at least one immediate replyText for the enrage announce (bypassing the batch)
    expect(ctx.replyText).toHaveBeenCalled();
  });

  test("non-dps role is rejected with a clear message (M9 wires the rest)", async () => {
    WorldBossRoleService.getRole.mockResolvedValue("healer");
    const ctx = makeContext({ type: "user" });
    await controller.attackOnBoss(ctx, {
      payload: { worldBossEventId: 7, attackType: "standard" },
    });
    expect(WorldBossCombatService.dpsAttack).not.toHaveBeenCalled();
    expect(ctx.replyText).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS.** Run `cd app && yarn test -- src/controller/application/__tests__/WorldBossController.attackOnBoss.test.js`. Expected: failures — the current `attackOnBoss` (lines 448–642) calls `isUserCanAttack`/`getBossInformation`/`worldBossEventLogService` and never calls `WorldBossCombatService.dpsAttack`, so the delegation assertions fail.

- [ ] **Step 3: Add the new requires.** In `app/src/controller/application/WorldBossController.js`, after the existing require block (around the `redis`/`i18n`/`DefaultLogger` group at lines 19–22), add:

```js
const WorldBossCombatService = require("../../service/WorldBossCombatService");
const WorldBossRoleService = require("../../service/WorldBossRoleService");
```

- [ ] **Step 4: Replace `attackOnBoss`.** Replace the entire function from `const attackOnBoss = async (context, props) => {` (line 448) through its closing `};` (line 642), plus `exports.attackOnBoss = attackOnBoss;` (line 644), with the implementation below. It keeps only role gating, level/job fetch, the canonical `attackType` build, the achievement hook, and reply routing in the controller; damage/phase/enrage now live in the service. `numericUserId` is `context.event.source.id` (the numeric `user.id` the live handler already holds).

```js
const attackOnBoss = async (context, props) => {
  const { worldBossEventId, attackType = "standard" } = props.payload;
  const { displayName, id, userId } = context.event.source;
  const isGroup = context.event.source.type === "group";

  // 沒有會員 id，跳過不處理
  if (!id) {
    DefaultLogger.warn(`no member id ${userId}`);
    return;
  }

  // 角色 gating：未選 role 一律先當 dps（D27 向前相容）。補/坦動詞由 M9 接入。
  const role = (await WorldBossRoleService.getRole(userId)) || "dps";
  if (role !== "dps") {
    context.replyText(i18n.__("message.world_boss.wrong_role_for_attack"));
    return;
  }

  // 取得聊天等級與職業（defaultData 無 job_key，缺漏時退回 adventurer）
  let levelData = await minigameService.findByUserId(userId);
  if (!levelData) {
    await minigameService.createByUserId(userId, minigameService.defaultData);
    levelData = minigameService.defaultData;
  }
  const { level, job_key: jobKey = "adventurer" } = levelData;

  // 建立 canonical attackType "<jobKey>|<skill>"（skill 預設 standard）
  const [, rawSkill] = String(attackType).split("|");
  const skill = rawSkill === enumSkills.SKILL_ONE ? enumSkills.SKILL_ONE : enumSkills.STANDARD;
  const resolvedAttackType = `${jobKey}|${skill}`;

  // numericUserId = 既有 handler 已持有的數字 user.id（context.event.source.id）
  const result = await WorldBossCombatService.dpsAttack({
    platformId: userId,
    numericUserId: id,
    eventId: worldBossEventId,
    attackType: resolvedAttackType,
    level,
  });

  // 駁回（status≠active / 倒下）→ 即時回覆，bypass 批次，不扣精力（D24）
  if (result.rejected) {
    const rejectMessages = {
      not_active: i18n.__("message.world_boss_event_no_ongoing"),
      knocked_down: i18n.__("message.world_boss.knocked_down"),
    };
    context.replyText(
      rejectMessages[result.reason] || i18n.__("message.world_boss_event_no_ongoing")
    );
    return;
  }

  // 狂暴觸發 → 一次性即時公告（bypass 批次，一場王僅一次，因只有跨門檻刀會 true）
  if (result.didEnrageTrigger && isGroup) {
    context.replyText(i18n.__("message.world_boss.enrage_announce"));
  }

  // 成就：每刀照舊評估（沿用既有掛鉤）
  AchievementEngine.evaluate(userId, "boss_attack", {
    level,
    damage: result.damage,
    feature: "world_boss",
  })
    .then(({ unlocked }) => notifyUnlocks(context, userId, unlocked))
    .catch(() => {});

  const narration = i18n.__("message.world_boss.dps_hit", {
    display_name: displayName,
    damage: result.damage,
  });

  if (isGroup) {
    await handleKeepingMessage(worldBossEventId, context, narration);
  } else {
    context.replyText(narration);
  }
};

exports.attackOnBoss = attackOnBoss;
```

- [ ] **Step 5: Add the i18n message keys.** Edit `app/locales/zh_tw.json`. Under `message.world_boss` (the object that already holds `can_not_attack`, `request_too_quickly`, …), add the four new keys (mustache `{{ }}` interpolation, matching the existing style):

```json
    "knocked_down": "你已被擊倒，需等待救援或自然恢復後才能再次行動",
    "enrage_announce": "⚠️ 世界王進入狂暴狀態！最近出手的勇者被擊飛，傷害翻倍！",
    "wrong_role_for_attack": "你目前的職業無法直接攻擊，請改用對應的職業指令",
    "dps_hit": "{{display_name}} 造成了 {{damage}} 點傷害！"
```

- [ ] **Step 6: Run it and confirm it PASSES.** Run `cd app && yarn test -- src/controller/application/__tests__/WorldBossController.attackOnBoss.test.js`. Expected: 5 tests green.

- [ ] **Step 7: Run the full combat + controller suites + lint.** Run `cd app && yarn test -- src/service/__tests__/WorldBossCombatService src/controller/application/__tests__/WorldBossController.attackOnBoss.test.js` then `cd app && yarn lint -- src/controller/application/WorldBossController.js`. Expected: all green, no lint errors.

- [ ] **Step 8: Commit.**
```bash
cd /home/hanshino/workspace/redive_linebot
git add app/src/controller/application/WorldBossController.js app/src/controller/application/__tests__/WorldBossController.attackOnBoss.test.js app/locales/zh_tw.json
git commit -m "feat(worldboss): route DPS attackOnBoss through WorldBossCombatService with reject/enrage reply branching"
```

---

**Milestone M4 complete when:** all five test files pass — `cd app && yarn test -- src/util/__tests__/worldBossRedis.test.js src/service/__tests__/WorldBossCombatService src/controller/application/__tests__/WorldBossController.attackOnBoss.test.js` — `yarn lint` is clean on the touched source files, and:
- `app/src/util/worldBossRedis.js` exports EXACTLY the eight LOCK §C names (`poolAdd`/`poolPopMin`/`poolScore`/`poolRemove`/`shieldSet`/`shieldConsume`/`blockSet`/`blockOwner`), all `platform_id`-keyed, with NO forbidden aliases anywhere.
- `WorldBossCombatService.dpsAttack({ platformId, numericUserId, eventId, attackType, level })` returns the full LOCK §D shape `{ damage, contribution, enraged, didEnrageTrigger, knockedBatch, selfKnocked, rejected, reason }`, drives boss HP via the durable log (Redis never scores), resolves numeric ids ONLY via `UserModel.getId` (no `_resolveNumericId`), computes knocked-down/lazy-recovery in the service via `poolScore`+`poolRemove`, uses `platform_id` for all pool/shield/block members, doubles damage AND contribution only for hits that START in the enrage band, and lets the crossing hit (not doubled) fire `didEnrageTrigger` + the batch-knock — matching M10's cold-start gate and every downstream consumer (M8/M9 call `dpsAttack` with a pre-resolved `numericUserId`; M5 ADDS `tankBlock`/`healerRevive`/`healerShield` to this same file reusing these exact `worldBossRedis` names).

> **Drafter's note for the integrator / reviewers.** M4 is the SOLE creator of `WorldBossCombatService.js` and `worldBossRedis.js` (API LOCK §A). **M5 ADDS** `tankBlock`/`healerRevive`/`healerShield` to the combat file, reusing these exact eight `worldBossRedis` names and the `platform_id` pool identity; M5 also wraps the per-boss knobs with the D30 support-ratio scaling — M4 reads them straight. There is NO `_resolveNumericId` anywhere (LOCK §D); every numeric resolution goes through `UserModel.getId` (combat self-resolve fallback and absorb-credit owner). Knocked-down + lazy natural recovery live in the SERVICE (`poolScore`+`poolRemove`), not in a util export (no `isKnockedDown`). It depends on M1 (`WorldBossLog.createWithRole`/`getRecentAttackers` [shape `{user_id, platform_id}`]/`getTotalDamageByEventId`, `WorldBossEvent.getActive`/`casStatus`), M3 (`WorldBossConfig` accessors + dead-column readers, `EquipmentService.getEquipmentBonuses` returning `atk_percent` as a fraction), and M2 (`WorldBossRoleService.getRole`) — all mocked in M4's tests, so M4 is independently verifiable; true integration is locked by M10's Monte-Carlo cold-start gate, which imports the real `dpsAttack` and fakes `worldBossRedis` + `WorldBossLog` to exactly these §C/§E names. The `_setRng` seam is test-only.

---

## Milestone M5: Combat support: tank + healer + pool + cold-start

**Goal:** MODIFY the existing `app/src/service/WorldBossCombatService.js` (created by M4) to APPEND the three support actions — `tankBlock`, `healerRevive`, `healerShield` (lock §D signatures + result shapes) — plus the D30 cold-start scaling that shrinks M4's enrage knockdown batch-N and counter-% as the live support ratio approaches zero; `healerRevive` resolves its effect synchronously and writes its OWN contribution = the actual popped count, while `tankBlock`/`healerShield` only OPEN Redis windows (the absorb credit is written later by M4's enrage handler — the timing contract). No new combat files are created here.

> **Ownership (lock §A — read this before touching anything):** M3 is the **equipment enhancement** layer. M4 is the **combat core** and the **sole creator** of BOTH `app/src/util/worldBossRedis.js` AND `app/src/service/WorldBossCombatService.js` (it owns `dpsAttack`, the enrage trigger / batch-knock / counter-knock / kill-CAS, and the eight Redis helpers). **M5 (this milestone) is combat SUPPORT, APPENDED onto M4's files.** M5 **MODIFIES** `WorldBossCombatService.js` to add `tankBlock` / `healerRevive` / `healerShield` and the cold-start scaling; it **USES** `worldBossRedis` (created by M4) and **never re-creates** either combat file, never re-creates `worldBossRedis.js`, never redefines `dpsAttack`. Every "Create:" of a combat file is deleted from this milestone.

**Read this first (verified facts you build on — all confirmed against the repo + the lock):**

- **`worldBossRedis` (created by M4) exports EXACTLY these eight helpers, all keyed by `platform_id` strings (lock §B/§C). M5 uses ONLY these names — no other helper exists:**
  ```
  poolAdd(eventId, platformId, ts) => void                                  // ZADD score=ts
  poolPopMin(eventId, count) => [platformId, ...]                           // ZPOPMIN -> member strings ([] when empty; single-object tolerated)
  poolScore(eventId, platformId) => ts | null                              // ZSCORE (null if absent)
  poolRemove(eventId, platformId) => void                                   // ZREM
  shieldSet(eventId, targetPlatformId, ownerPlatformId, ttlSec) => void     // SET wb:shield:{event}:{target} = ownerPlatformId EX ttl
  shieldConsume(eventId, targetPlatformId) => ownerPlatformId | null        // GETDEL-style; null if no shield
  blockSet(eventId, ownerPlatformId, ttlSec) => void                        // SET wb:block:{event} = ownerPlatformId EX ttl
  blockOwner(eventId) => ownerPlatformId | null                            // GET wb:block:{event}
  ```
  The FORBIDDEN legacy names (`addToPool`, `popFromPool`, `popOldest`, `isKnockedDown`, `recoverIfExpired`, `openBlockWindow`, `consumeBlockSlot`, `setShield`, `consumeShield`, `getBlockOwner`, `poolMembersInRange`, `shieldOwner`, any key-builder) MUST NOT appear in M5. M5 reads `tankBlock` opens via `blockSet`; `healerShield` opens via `shieldSet`; `healerRevive` pops via `poolPopMin`. (lock §C, §D)
- **`WorldBossCombatService.dpsAttack` already exists (created by M4)** with the LOCKED signature `dpsAttack({ platformId, numericUserId, eventId, attackType, level })` and the internal enrage handler (`runEnrage`/batch-knock/counter-knock/kill-CAS). **M5 does NOT touch `dpsAttack` or the enrage handler** — M5 only feeds the enrage handler's scaling its input (the support ratio, §below) and appends the three new exports. The absorb credit (shield_absorb / block_absorb log rows credited to the OWNER's numeric id) is written by M4's enrage handler when it consumes a shield/block token — M5's `tankBlock`/`healerShield` just OPEN those windows (lock §D, the timing contract).
- **`WorldBossLog.getSupportRatio(eventId)` (M1, lock §E)** → `Promise<number>` = (# distinct users with ≥1 healer|tank action this event) / (# distinct users with ≥1 action this event); `0` when no actions. This is the SINGLE shared support-ratio definition (addendum §15): M5 (combat) scales M4's enrage batch-N and counter-% DOWN as the ratio → 0 (cold start); M7 (economy) scales support-board unit rewards UP as the ratio → 0 (scarcity premium). M5 does NOT define its own ratio — it calls this M1 helper.
- **`WorldBossLog.createWithRole({ user_id /*numeric*/, world_boss_event_id, role, action_type, damage, cost, contribution }, trx?)` (M1, lock §E)** inserts one log row. `user_id` is the **numeric** `user.id` of the player being CREDITED. `healerRevive` calls this with `role:"healer"` and `contribution = actual popped count`. M1 also adds `"role","contribution"` to the model's `fillable` (current `fillable` = `["world_boss_event_id","user_id","action_type","damage","cost"]`, verified `WorldBossLog.js:97`).
- **`WorldBossEvent.getActive()` (M1, lock §E)** → `Promise<row|null>` (status='active' AND now BETWEEN start_time/end_time). M5's three support actions reject with `reason:"not_active"` when this is null or its id mismatches `eventId`. (`WorldBossEvent` currently has NO `getActive` — M1 adds it; verified `WorldBossEvent.js` exports only `all/find/create/update/destroy`.)
- **Numeric id resolution is ONLY `UserModel.getId(platformId)` (verified `UserModel.js:8-11`: `mysql.select({id:"id"}).from("user").where({platform_id})` → numeric `user.id` or `null`).** There is NO `_resolveNumericId`. M5's support actions receive `numericUserId` already resolved by the caller (M8/M9) and trust it for the actor's own log row; they do NOT self-resolve on the hot path. (lock §D)
- **`EquipmentService.getEquipmentBonuses(platformId)` (extended in M3, addendum §2)** → `{ atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus, support_power, block_power }`. `support_power`/`block_power` are INTEGER people-counts (default `0`). `platformId` is the LINE platform_id string. `healerRevive`/`healerShield` use `support_power` to size K.
- **`WorldBossConfig` (M3) typed accessors used here — these exact names are LOCKED by M3:** `getReviveCountK()`, `getShieldCountK()`, `getBlockWindowMinutes()`, `getNormalAttackCost()`, `getNaturalRecoveryMinutes()`. M5 calls these; it does not redefine them.
- **`redis.js` is a node-redis v5 promise client** (`module.exports = redisClient`, verified `redis.js:15`); M5 never touches it directly — it goes through `worldBossRedis`.

**Identity rules used throughout M5 (LOCKED — reviewers enforce, lock §B/§D):**

- The rescue pool, shield tokens, and block owner ALL key on **`platform_id`** — one uniform key space. `healerRevive`'s `poolPopMin` returns `platform_id` strings; `healerShield`'s `shieldSet` stores `targetPlatformId` keyed + `ownerPlatformId` value; `tankBlock`'s `blockSet` stores `ownerPlatformId`. There is NO numeric-id-in-pool path. (lock §B overrides addendum §4.)
- The LOG (`world_boss_event_log.user_id`) stays the **numeric** `user.id`. `healerRevive` writes its own contribution row with `user_id = numericUserId` (the caller-resolved numeric id of the healer). The absorb-credit rows (shield_absorb / block_absorb) are written by M4's enrage handler, which converts the owner `platform_id` → numeric via `UserModel.getId` before crediting — that is M4's responsibility, not M5's.
- Absorb credit is written by M4's enrage handler (the timing contract). M5's `tankBlock`/`healerShield` only OPEN the windows so M4's handler can find them; they write NO contribution row themselves (contribution = 0 is implicit — no row).

**Result shapes — EXACTLY per lock §D/§F (callers M8/M9 read these field names verbatim):**
```js
exports.tankBlock    = async ({ platformId, numericUserId, eventId }) => ({ rejected, reason, windowMinutes });
exports.healerRevive = async ({ platformId, numericUserId, eventId }) => ({ rejected, reason, revived: [platformId...], contribution });
exports.healerShield = async ({ platformId, numericUserId, eventId }) => ({ rejected, reason, shielded: [platformId...], contribution });
```

**D30 cold-start scaling (the M5 combat consumer of the shared ratio, addendum §15):** the enrage batch-N and counter-% live in M4's enrage handler. M5 supplies the scaling input by calling `WorldBossLog.getSupportRatio(eventId)` and exposing a pure scaling helper M4's handler already consumes: `scaledBatch = Math.max(1, Math.round(baseBatch * (1 - supportRatio)))` and `scaledCounterRate = baseCounterRate * (1 - supportRatio)`. More active healers/tanks → smaller knockdown batch and lower self-counter chance, so an all-DPS server (ratio → 0) gets the FULL batch (no cold-start crush avoidance for them) while a balanced server (ratio → high) is shielded. M5 owns ONLY this pure helper + its wiring into M4's handler hook; it does not re-implement the batch-knock loop.

> **Coupling note (lock §A/§E):** M4 must land `WorldBossCombatService.js` + `worldBossRedis.js` (the eight helpers + `dpsAttack` + the enrage handler with an injectable scaling hook) and M1 must land `WorldBossLog.{createWithRole,getSupportRatio}` and `WorldBossEvent.getActive` BEFORE M5. M5 appends to the file M4 created and calls those M1 helpers.

---

### Task 1 — D30 cold-start scaling helper (pure, fed into M4's enrage handler)

M5 owns the pure scaling math that M4's enrage handler invokes. It computes the live support ratio from M1's `WorldBossLog.getSupportRatio(eventId)` and returns the scaled batch size and counter rate. This is appended to the M4-created `WorldBossCombatService.js` (M5 modifies, never creates).

**Files:**
- Modify: `app/src/service/WorldBossCombatService.js` (APPEND `getEnrageScaling`; M4 created the file)
- Test: `app/__tests__/service/WorldBossCombatService.coldStart.test.js`

**Interfaces:**
- Consumes: `WorldBossLog.getSupportRatio(eventId)` (M1, lock §E) → `Promise<number>` in `[0,1]`.
- Produces (M5-owned, consumed by M4's enrage handler):
  ```js
  // Given the M4 base knobs, scale DOWN by the live support ratio (D30 cold-start, addendum §15).
  exports.getEnrageScaling = async (eventId, { baseBatch, baseCounterRate }) =>
    ({ supportRatio, scaledBatch, scaledCounterRate });
  ```

**Steps:**

- [ ] **Step 1: Write the failing test.** Create `app/__tests__/service/WorldBossCombatService.coldStart.test.js` with this FULL content. `jest.mock` precedes the `require` of the service (NOT hoisted in this repo — `transform:{}`). Every M4/M1 collaborator the service file requires must be mocked so requiring the appended module does not pull real DB/Redis:

  ```js
  // jest.mock is NOT hoisted in this repo (jest.config transform:{}) — declare BEFORE requires.
  jest.mock("../../src/util/worldBossRedis", () => ({
    poolAdd: jest.fn(),
    poolPopMin: jest.fn(),
    poolScore: jest.fn(),
    poolRemove: jest.fn(),
    shieldSet: jest.fn(),
    shieldConsume: jest.fn(),
    blockSet: jest.fn(),
    blockOwner: jest.fn(),
  }));
  jest.mock("../../src/model/application/WorldBossLog", () => ({
    createWithRole: jest.fn(),
    getRecentAttackers: jest.fn(),
    getSupportRatio: jest.fn(),
    getTotalDamageByEventId: jest.fn(),
  }));
  jest.mock("../../src/model/application/WorldBossEvent", () => ({
    getActive: jest.fn(),
    casStatus: jest.fn(),
  }));
  jest.mock("../../src/model/application/UserModel", () => ({ getId: jest.fn() }));
  jest.mock("../../src/service/WorldBossEventLogService", () => ({ getRemainHpByEventId: jest.fn() }));
  jest.mock("../../src/model/application/RPGCharacter", () => ({ make: jest.fn() }));
  jest.mock("../../src/service/EquipmentService", () => ({ getEquipmentBonuses: jest.fn() }));
  jest.mock("../../src/service/WorldBossConfig", () => ({
    getReviveCountK: jest.fn(),
    getShieldCountK: jest.fn(),
    getBlockWindowMinutes: jest.fn(),
    getNormalAttackCost: jest.fn(),
    getNaturalRecoveryMinutes: jest.fn(),
  }));

  const WorldBossLog = require("../../src/model/application/WorldBossLog");
  const combat = require("../../src/service/WorldBossCombatService");

  describe("WorldBossCombatService.getEnrageScaling (D30 cold-start)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns full batch + counter when support ratio is 0 (all-DPS cold start)", async () => {
      WorldBossLog.getSupportRatio.mockResolvedValue(0);
      const out = await combat.getEnrageScaling(7, { baseBatch: 20, baseCounterRate: 0.15 });
      expect(out.supportRatio).toBe(0);
      expect(out.scaledBatch).toBe(20); // round(20 * (1 - 0)) = 20
      expect(out.scaledCounterRate).toBe(0.15); // 0.15 * (1 - 0)
      expect(WorldBossLog.getSupportRatio).toHaveBeenCalledWith(7);
    });

    it("scales batch + counter DOWN as the support ratio rises", async () => {
      WorldBossLog.getSupportRatio.mockResolvedValue(0.5);
      const out = await combat.getEnrageScaling(7, { baseBatch: 20, baseCounterRate: 0.15 });
      expect(out.supportRatio).toBe(0.5);
      expect(out.scaledBatch).toBe(10); // round(20 * 0.5)
      expect(out.scaledCounterRate).toBeCloseTo(0.075, 6); // 0.15 * 0.5
    });

    it("never lets the batch fall below 1 even at a near-total support ratio", async () => {
      WorldBossLog.getSupportRatio.mockResolvedValue(0.99);
      const out = await combat.getEnrageScaling(7, { baseBatch: 20, baseCounterRate: 0.15 });
      expect(out.scaledBatch).toBe(1); // max(1, round(20 * 0.01)=0) -> 1
      expect(out.scaledCounterRate).toBeCloseTo(0.0015, 6);
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS.** Run `cd app && yarn test -- __tests__/service/WorldBossCombatService.coldStart.test.js`. Expected: `combat.getEnrageScaling is not a function` (M4 created the file without this M5 export).

- [ ] **Step 3: Append `getEnrageScaling`** to the EXISTING `app/src/service/WorldBossCombatService.js` (the file M4 created). Add the require alongside M4's existing requires only if not already present, then append the helper:

  ```js
  // (require — only if M4's file does not already require it)
  const WorldBossLog = require("../model/application/WorldBossLog");
  ```

  ```js
  /**
   * D30 冷啟動壓力縮放（addendum §15 共用 support ratio）。
   * M4 的暴走處理器以 baseBatch / baseCounterRate 呼叫此函式，依「活躍補/坦比例」縮小批次與反擊率。
   * supportRatio 來自 M1 的 WorldBossLog.getSupportRatio（distinct-user 定義，與 M7 經濟層共用同一定義）。
   * @param {Number} eventId
   * @param {{baseBatch: Number, baseCounterRate: Number}} knobs M4 由 world_boss 死欄位/config 讀出的基礎值
   * @returns {Promise<{supportRatio: Number, scaledBatch: Number, scaledCounterRate: Number}>}
   */
  exports.getEnrageScaling = async (eventId, { baseBatch, baseCounterRate }) => {
    const supportRatio = await WorldBossLog.getSupportRatio(eventId);
    const scaledBatch = Math.max(1, Math.round(baseBatch * (1 - supportRatio)));
    const scaledCounterRate = baseCounterRate * (1 - supportRatio);
    return { supportRatio, scaledBatch, scaledCounterRate };
  };
  ```

  > **Wiring note (no extra task):** M4's enrage handler already calls a scaling hook before its batch-knock; M4 binds that hook to `WorldBossCombatService.getEnrageScaling(eventId, { baseBatch, baseCounterRate })` (the base knobs M4 read from `world_boss.defense` / `world_boss.attack` with config fallback, addendum §7). M5 owns ONLY the pure scaling math above; it does not re-implement M4's batch-knock loop, its `poolAdd` calls, or its self-counter — those stay in M4. The cold-start direction (ratio → 0 ⇒ full batch) is locked here and inherited by M10's sim (lock §A, M10).

- [ ] **Step 4: Run the test and confirm it PASSES.** Run `cd app && yarn test -- __tests__/service/WorldBossCombatService.coldStart.test.js`. Expected: all three cases green.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/service/WorldBossCombatService.js app/__tests__/service/WorldBossCombatService.coldStart.test.js
  git commit -m "feat(worldboss): D30 cold-start enrage scaling via shared support ratio (M5)"
  ```

---

### Task 2 — `healerRevive` (poolPopMin K; own contribution = actual popped count)

Revive contribution is written IMMEDIATELY because the effect (popping the pool) resolves synchronously (lock §D, addendum §11: healer `healerRevive` writes its OWN contribution = the actual popped count). It pops the K oldest knocked-down `platform_id`s from the rescue pool via `poolPopMin`, then writes a `role:"healer"` log row crediting itself with `contribution = popped.length`.

**Files:**
- Modify: `app/src/service/WorldBossCombatService.js` (APPEND `healerRevive`)
- Test: `app/__tests__/service/WorldBossCombatService.healerRevive.test.js`

**Interfaces:**
- Consumes: `worldBossRedis.poolPopMin(eventId, count)` (M4, lock §C) → `[platformId, ...]`; `EquipmentService.getEquipmentBonuses(platformId).support_power` (M3, integer); `WorldBossConfig.{getReviveCountK,getNormalAttackCost}` (M3); `WorldBossLog.createWithRole` (M1, lock §E); `WorldBossEvent.getActive` (M1, lock §E).
- Produces (lock §D shape — EXACT):
  ```js
  exports.healerRevive = async ({ platformId, numericUserId, eventId }) =>
    ({ rejected, reason, revived: [platformId...], contribution });
  ```

**K formula:** `K = getReviveCountK() + support_power` (geared healer revives more; default support_power 0). **Energy (D22):** a revive that pops 0 still consumes `getNormalAttackCost()` and writes a `contribution: 0` participation row (attempted action = effective action). The only no-cost / no-row rejection is `reason:"not_active"`.

**Steps:**

- [ ] **Step 1: Write the failing test.** Create `app/__tests__/service/WorldBossCombatService.healerRevive.test.js`:

  ```js
  // jest.mock NOT hoisted — declare BEFORE requiring the service.
  jest.mock("../../src/util/worldBossRedis", () => ({
    poolAdd: jest.fn(),
    poolPopMin: jest.fn(),
    poolScore: jest.fn(),
    poolRemove: jest.fn(),
    shieldSet: jest.fn(),
    shieldConsume: jest.fn(),
    blockSet: jest.fn(),
    blockOwner: jest.fn(),
  }));
  jest.mock("../../src/model/application/WorldBossLog", () => ({
    createWithRole: jest.fn(),
    getRecentAttackers: jest.fn(),
    getSupportRatio: jest.fn(),
    getTotalDamageByEventId: jest.fn(),
  }));
  jest.mock("../../src/model/application/WorldBossEvent", () => ({
    getActive: jest.fn(),
    casStatus: jest.fn(),
  }));
  jest.mock("../../src/model/application/UserModel", () => ({ getId: jest.fn() }));
  jest.mock("../../src/service/WorldBossEventLogService", () => ({ getRemainHpByEventId: jest.fn() }));
  jest.mock("../../src/model/application/RPGCharacter", () => ({ make: jest.fn() }));
  jest.mock("../../src/service/EquipmentService", () => ({ getEquipmentBonuses: jest.fn() }));
  jest.mock("../../src/service/WorldBossConfig", () => ({
    getReviveCountK: jest.fn(),
    getShieldCountK: jest.fn(),
    getBlockWindowMinutes: jest.fn(),
    getNormalAttackCost: jest.fn(),
    getNaturalRecoveryMinutes: jest.fn(),
  }));

  const wbRedis = require("../../src/util/worldBossRedis");
  const WorldBossLog = require("../../src/model/application/WorldBossLog");
  const WorldBossEvent = require("../../src/model/application/WorldBossEvent");
  const EquipmentService = require("../../src/service/EquipmentService");
  const WorldBossConfig = require("../../src/service/WorldBossConfig");
  const combat = require("../../src/service/WorldBossCombatService");

  describe("WorldBossCombatService.healerRevive", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active" });
      WorldBossConfig.getReviveCountK.mockReturnValue(2);
      WorldBossConfig.getNormalAttackCost.mockReturnValue(10);
      EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 0 });
      WorldBossLog.createWithRole.mockResolvedValue(1);
    });

    it("revives up to K (base + support_power) platform_ids; contribution = actual popped", async () => {
      EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 1 }); // K = 2 + 1 = 3
      wbRedis.poolPopMin.mockResolvedValue(["Uv1", "Uv2"]); // only 2 in pool
      const res = await combat.healerRevive({ platformId: "Uheal", numericUserId: 9, eventId: 7 });
      expect(wbRedis.poolPopMin).toHaveBeenCalledWith(7, 3);
      expect(res.revived).toEqual(["Uv1", "Uv2"]);
      expect(res.contribution).toBe(2); // actual popped count, not K
      expect(res.rejected).toBe(false);
      expect(res.reason).toBeNull();
      expect(WorldBossLog.createWithRole).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 9,
          world_boss_event_id: 7,
          role: "healer",
          action_type: "revive",
          damage: 0,
          contribution: 2,
          cost: 10,
        })
      );
    });

    it("writes a contribution=0 participation row (still charges cost) when pool empty (D22)", async () => {
      wbRedis.poolPopMin.mockResolvedValue([]);
      const res = await combat.healerRevive({ platformId: "Uheal", numericUserId: 9, eventId: 7 });
      expect(res.revived).toEqual([]);
      expect(res.contribution).toBe(0);
      expect(res.rejected).toBe(false);
      expect(WorldBossLog.createWithRole).toHaveBeenCalledWith(
        expect.objectContaining({ role: "healer", action_type: "revive", contribution: 0, cost: 10 })
      );
    });

    it("rejects with reason 'not_active' (no row, no cost) when no active event", async () => {
      WorldBossEvent.getActive.mockResolvedValue(null);
      const res = await combat.healerRevive({ platformId: "Uheal", numericUserId: 9, eventId: 7 });
      expect(res.rejected).toBe(true);
      expect(res.reason).toBe("not_active");
      expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
    });

    it("rejects with 'not_active' when the active event id mismatches the requested eventId", async () => {
      WorldBossEvent.getActive.mockResolvedValue({ id: 8, status: "active" });
      const res = await combat.healerRevive({ platformId: "Uheal", numericUserId: 9, eventId: 7 });
      expect(res.rejected).toBe(true);
      expect(res.reason).toBe("not_active");
      expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS.** Run `cd app && yarn test -- __tests__/service/WorldBossCombatService.healerRevive.test.js`. Expected: `combat.healerRevive is not a function`.

- [ ] **Step 3: Append the implementation** to the EXISTING `app/src/service/WorldBossCombatService.js`. Add these requires alongside M4's existing requires (only if not already present in M4's file):

  ```js
  const wbRedis = require("../util/worldBossRedis");
  const WorldBossEvent = require("../model/application/WorldBossEvent");
  const EquipmentService = require("./EquipmentService");
  const WorldBossConfig = require("./WorldBossConfig");
  ```

  Then append the method:

  ```js
  /**
   * 補師復活：從救援池 ZPOPMIN K 個最舊的擊倒玩家（platform_id），立刻寫入自己的 contribution。
   * K = getReviveCountK() + 裝備 support_power。即使救活 0 人仍計費並寫參與列（D22）。
   * 結果 shape 鎖定：{ rejected, reason, revived: [platformId...], contribution }（lock §D）。
   * @param {{platformId: String, numericUserId: Number, eventId: Number}} param0
   */
  exports.healerRevive = async ({ platformId, numericUserId, eventId }) => {
    const result = { rejected: false, reason: null, revived: [], contribution: 0 };

    const active = await WorldBossEvent.getActive();
    if (!active || active.id !== eventId) {
      result.rejected = true;
      result.reason = "not_active";
      return result;
    }

    const bonuses = await EquipmentService.getEquipmentBonuses(platformId);
    const k = WorldBossConfig.getReviveCountK() + (bonuses.support_power || 0);

    // poolPopMin returns platform_id strings ([] when empty); pool identity is platform_id (lock §B).
    const revived = await wbRedis.poolPopMin(eventId, k);
    result.revived = revived;
    result.contribution = revived.length; // contribution = ACTUAL popped count (resolve-time, addendum §11)

    // D22: attempted action always costs + writes a row, even when it revived nobody.
    await WorldBossLog.createWithRole({
      user_id: numericUserId, // numeric user.id of the healer (caller-resolved via UserModel.getId)
      world_boss_event_id: eventId,
      role: "healer",
      action_type: "revive",
      damage: 0,
      cost: WorldBossConfig.getNormalAttackCost(),
      contribution: revived.length,
    });

    return result;
  };
  ```

- [ ] **Step 4: Run the test and confirm it PASSES.** Run `cd app && yarn test -- __tests__/service/WorldBossCombatService.healerRevive.test.js`. Expected: all four cases green.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/service/WorldBossCombatService.js app/__tests__/service/WorldBossCombatService.healerRevive.test.js
  git commit -m "feat(worldboss): healerRevive poolPopMin K with popped-count contribution (M5)"
  ```

---

### Task 3 — `healerShield` (open immunity tokens; contribution back-credited by M4 on absorb)

`healerShield` OPENS shield tokens (`shieldSet`, owner = the healer's platform_id) on up to K recent knocked-vulnerable attackers. It writes NO contribution itself — the absorb credit is back-written by M4's enrage handler when a shield actually prevents a knockdown (lock §D timing contract; addendum §11: store the protected user as the key subject and the shielding healer as the value; credit goes to the shielding healer). A D22 participation row with `contribution: 0` (cost charged) IS written so the healer passes participation. `contribution` in the RESULT is 0 (this action's own immediate contribution is 0; the absorb credit lands later as separate log rows).

**Files:**
- Modify: `app/src/service/WorldBossCombatService.js` (APPEND `healerShield`)
- Test: `app/__tests__/service/WorldBossCombatService.healerShield.test.js`

**Interfaces:**
- Consumes: `worldBossRedis.shieldSet(eventId, targetPlatformId, ownerPlatformId, ttlSec)` (M4, lock §C); `WorldBossLog.{getRecentAttackers,createWithRole}` (M1, lock §E — `getRecentAttackers({ eventId, minutes, limit })` returns `[{ user_id /*numeric*/, platform_id }]`); `EquipmentService.getEquipmentBonuses(platformId).support_power` (M3); `WorldBossConfig.{getShieldCountK,getNormalAttackCost,getNaturalRecoveryMinutes}` (M3); `WorldBossEvent.getActive` (M1).
- Produces (lock §D shape — EXACT):
  ```js
  exports.healerShield = async ({ platformId, numericUserId, eventId }) =>
    ({ rejected, reason, shielded: [platformId...], contribution });
  ```

**Target selection:** take recent attackers from `getRecentAttackers` (each row has `platform_id`, lock §E), set tokens on up to `K = getShieldCountK() + support_power` of them. TTL = `getNaturalRecoveryMinutes() * 60` (a shield should not outlive a knockdown window). Owner stored = `platformId` so M4's enrage handler back-credits the healer. `contribution` in the result is always 0.

**Steps:**

- [ ] **Step 1: Write the failing test.** Create `app/__tests__/service/WorldBossCombatService.healerShield.test.js`:

  ```js
  jest.mock("../../src/util/worldBossRedis", () => ({
    poolAdd: jest.fn(),
    poolPopMin: jest.fn(),
    poolScore: jest.fn(),
    poolRemove: jest.fn(),
    shieldSet: jest.fn(),
    shieldConsume: jest.fn(),
    blockSet: jest.fn(),
    blockOwner: jest.fn(),
  }));
  jest.mock("../../src/model/application/WorldBossLog", () => ({
    createWithRole: jest.fn(),
    getRecentAttackers: jest.fn(),
    getSupportRatio: jest.fn(),
    getTotalDamageByEventId: jest.fn(),
  }));
  jest.mock("../../src/model/application/WorldBossEvent", () => ({ getActive: jest.fn(), casStatus: jest.fn() }));
  jest.mock("../../src/model/application/UserModel", () => ({ getId: jest.fn() }));
  jest.mock("../../src/service/WorldBossEventLogService", () => ({ getRemainHpByEventId: jest.fn() }));
  jest.mock("../../src/model/application/RPGCharacter", () => ({ make: jest.fn() }));
  jest.mock("../../src/service/EquipmentService", () => ({ getEquipmentBonuses: jest.fn() }));
  jest.mock("../../src/service/WorldBossConfig", () => ({
    getReviveCountK: jest.fn(),
    getShieldCountK: jest.fn(),
    getBlockWindowMinutes: jest.fn(),
    getNormalAttackCost: jest.fn(),
    getNaturalRecoveryMinutes: jest.fn(),
  }));

  const wbRedis = require("../../src/util/worldBossRedis");
  const WorldBossLog = require("../../src/model/application/WorldBossLog");
  const WorldBossEvent = require("../../src/model/application/WorldBossEvent");
  const EquipmentService = require("../../src/service/EquipmentService");
  const WorldBossConfig = require("../../src/service/WorldBossConfig");
  const combat = require("../../src/service/WorldBossCombatService");

  describe("WorldBossCombatService.healerShield", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active" });
      WorldBossConfig.getShieldCountK.mockReturnValue(2);
      WorldBossConfig.getNormalAttackCost.mockReturnValue(10);
      WorldBossConfig.getNaturalRecoveryMinutes.mockReturnValue(15);
      EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 0 });
      WorldBossLog.createWithRole.mockResolvedValue(1);
    });

    it("opens shields on up to K recent attackers (owner=platformId, TTL=recovery*60); contribution=0", async () => {
      WorldBossLog.getRecentAttackers.mockResolvedValue([
        { user_id: 11, platform_id: "U11" },
        { user_id: 12, platform_id: "U12" },
        { user_id: 13, platform_id: "U13" },
      ]);
      const res = await combat.healerShield({ platformId: "Ushield", numericUserId: 8, eventId: 7 });
      expect(res.shielded).toEqual(["U11", "U12"]); // K = 2
      expect(res.contribution).toBe(0); // own immediate contribution is 0; absorb credit lands later
      expect(res.rejected).toBe(false);
      expect(wbRedis.shieldSet).toHaveBeenCalledTimes(2);
      expect(wbRedis.shieldSet).toHaveBeenCalledWith(7, "U11", "Ushield", 900); // 15*60
      expect(wbRedis.shieldSet).toHaveBeenCalledWith(7, "U12", "Ushield", 900);
      expect(WorldBossLog.createWithRole).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 8,
          role: "healer",
          action_type: "shield",
          damage: 0,
          contribution: 0,
          cost: 10,
        })
      );
    });

    it("K scales with support_power; shields fewer when fewer recent attackers exist", async () => {
      EquipmentService.getEquipmentBonuses.mockResolvedValue({ support_power: 2 }); // K = 2 + 2 = 4
      WorldBossLog.getRecentAttackers.mockResolvedValue([
        { user_id: 11, platform_id: "U11" },
      ]);
      const res = await combat.healerShield({ platformId: "Ushield", numericUserId: 8, eventId: 7 });
      expect(res.shielded).toEqual(["U11"]);
      expect(wbRedis.shieldSet).toHaveBeenCalledTimes(1);
    });

    it("writes a D22 participation row even when there are no recent attackers to shield", async () => {
      WorldBossLog.getRecentAttackers.mockResolvedValue([]);
      const res = await combat.healerShield({ platformId: "Ushield", numericUserId: 8, eventId: 7 });
      expect(res.shielded).toEqual([]);
      expect(res.contribution).toBe(0);
      expect(wbRedis.shieldSet).not.toHaveBeenCalled();
      expect(WorldBossLog.createWithRole).toHaveBeenCalledWith(
        expect.objectContaining({ role: "healer", action_type: "shield", contribution: 0, cost: 10 })
      );
    });

    it("rejects with 'not_active' when no active event (no token, no row)", async () => {
      WorldBossEvent.getActive.mockResolvedValue(null);
      const res = await combat.healerShield({ platformId: "Ushield", numericUserId: 8, eventId: 7 });
      expect(res.rejected).toBe(true);
      expect(res.reason).toBe("not_active");
      expect(wbRedis.shieldSet).not.toHaveBeenCalled();
      expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS.** Run `cd app && yarn test -- __tests__/service/WorldBossCombatService.healerShield.test.js`. Expected: `combat.healerShield is not a function`.

- [ ] **Step 3: Append the implementation** to the EXISTING `app/src/service/WorldBossCombatService.js` (the requires from Task 2 are already present):

  ```js
  /**
   * 補師護盾：對最近的攻擊者開立免疫 token（shieldSet，owner = 補師 platform_id），最多 K 個。
   * 本動作不立刻寫貢獻——當護盾真的擋下擊倒時，由 M4 暴走處理器回寫貢獻並計給 OWNER（lock §D 時序契約）。
   * K = getShieldCountK() + 裝備 support_power。TTL = getNaturalRecoveryMinutes()*60。
   * 仍寫一筆 D22 參與列（contribution:0、計費），讓補師通過參與門檻。
   * 結果 shape 鎖定：{ rejected, reason, shielded: [platformId...], contribution }（lock §D）。
   * @param {{platformId: String, numericUserId: Number, eventId: Number}} param0
   */
  exports.healerShield = async ({ platformId, numericUserId, eventId }) => {
    const result = { rejected: false, reason: null, shielded: [], contribution: 0 };

    const active = await WorldBossEvent.getActive();
    if (!active || active.id !== eventId) {
      result.rejected = true;
      result.reason = "not_active";
      return result;
    }

    const bonuses = await EquipmentService.getEquipmentBonuses(platformId);
    const k = WorldBossConfig.getShieldCountK() + (bonuses.support_power || 0);
    const minutes = WorldBossConfig.getNaturalRecoveryMinutes();
    const ttlSec = minutes * 60;

    const recent = await WorldBossLog.getRecentAttackers({ eventId, minutes, limit: k });
    for (const row of recent) {
      // getRecentAttackers rows carry platform_id; pool/shield identity is platform_id (lock §B/§E).
      const target = row.platform_id;
      await wbRedis.shieldSet(eventId, target, platformId, ttlSec);
      result.shielded.push(target);
    }

    // D22 participation row. Absorb credit is back-written to the OWNER by M4's enrage handler.
    await WorldBossLog.createWithRole({
      user_id: numericUserId, // numeric user.id of the healer
      world_boss_event_id: eventId,
      role: "healer",
      action_type: "shield",
      damage: 0,
      cost: WorldBossConfig.getNormalAttackCost(),
      contribution: 0,
    });

    return result;
  };
  ```

- [ ] **Step 4: Run the test and confirm it PASSES.** Run `cd app && yarn test -- __tests__/service/WorldBossCombatService.healerShield.test.js`. Expected: all four cases green.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/service/WorldBossCombatService.js app/__tests__/service/WorldBossCombatService.healerShield.test.js
  git commit -m "feat(worldboss): healerShield opens owner-tagged immunity tokens (M5)"
  ```

---

### Task 4 — `tankBlock` (open the block window; absorb credit deferred to M4's enrage handler)

`tankBlock` ONLY opens the single per-event block window (`blockSet`, owner = the tank's platform_id, TTL = `getBlockWindowMinutes() * 60`). It writes NO contribution and no participation row inside the service — the absorb credit (role:tank, contribution = absorbed count) is written by M4's enrage handler when it consumes the open block window (lock §D timing contract; addendum §11: tankBlock only opens a Redis block window; the credit is written later by the resolving hit the block absorbs). The tank's D22 participation/cost row is written by the M8/M9 action wrapper (the service stays Redis-only and deterministic).

**Files:**
- Modify: `app/src/service/WorldBossCombatService.js` (APPEND `tankBlock`)
- Test: `app/__tests__/service/WorldBossCombatService.tankBlock.test.js`

**Interfaces:**
- Consumes: `worldBossRedis.blockSet(eventId, ownerPlatformId, ttlSec)` (M4, lock §C); `WorldBossConfig.getBlockWindowMinutes` (M3); `WorldBossEvent.getActive` (M1).
- Produces (lock §D shape — EXACT):
  ```js
  exports.tankBlock = async ({ platformId, numericUserId, eventId }) =>
    ({ rejected, reason, windowMinutes });
  ```

**Steps:**

- [ ] **Step 1: Write the failing test.** Create `app/__tests__/service/WorldBossCombatService.tankBlock.test.js`:

  ```js
  jest.mock("../../src/util/worldBossRedis", () => ({
    poolAdd: jest.fn(),
    poolPopMin: jest.fn(),
    poolScore: jest.fn(),
    poolRemove: jest.fn(),
    shieldSet: jest.fn(),
    shieldConsume: jest.fn(),
    blockSet: jest.fn(),
    blockOwner: jest.fn(),
  }));
  jest.mock("../../src/model/application/WorldBossLog", () => ({
    createWithRole: jest.fn(),
    getRecentAttackers: jest.fn(),
    getSupportRatio: jest.fn(),
    getTotalDamageByEventId: jest.fn(),
  }));
  jest.mock("../../src/model/application/WorldBossEvent", () => ({ getActive: jest.fn(), casStatus: jest.fn() }));
  jest.mock("../../src/model/application/UserModel", () => ({ getId: jest.fn() }));
  jest.mock("../../src/service/WorldBossEventLogService", () => ({ getRemainHpByEventId: jest.fn() }));
  jest.mock("../../src/model/application/RPGCharacter", () => ({ make: jest.fn() }));
  jest.mock("../../src/service/EquipmentService", () => ({ getEquipmentBonuses: jest.fn() }));
  jest.mock("../../src/service/WorldBossConfig", () => ({
    getReviveCountK: jest.fn(),
    getShieldCountK: jest.fn(),
    getBlockWindowMinutes: jest.fn(),
    getNormalAttackCost: jest.fn(),
    getNaturalRecoveryMinutes: jest.fn(),
  }));

  const wbRedis = require("../../src/util/worldBossRedis");
  const WorldBossLog = require("../../src/model/application/WorldBossLog");
  const WorldBossEvent = require("../../src/model/application/WorldBossEvent");
  const WorldBossConfig = require("../../src/service/WorldBossConfig");
  const combat = require("../../src/service/WorldBossCombatService");

  describe("WorldBossCombatService.tankBlock", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      WorldBossEvent.getActive.mockResolvedValue({ id: 7, status: "active" });
      WorldBossConfig.getBlockWindowMinutes.mockReturnValue(5);
    });

    it("opens the block window storing owner=platformId with TTL=window*60; no log row", async () => {
      const res = await combat.tankBlock({ platformId: "Utank", numericUserId: 3, eventId: 7 });
      expect(wbRedis.blockSet).toHaveBeenCalledWith(7, "Utank", 300); // 5 * 60
      expect(res.windowMinutes).toBe(5);
      expect(res.rejected).toBe(false);
      expect(res.reason).toBeNull();
      // absorb credit is M4's enrage handler's job; tankBlock writes NO contribution row.
      expect(WorldBossLog.createWithRole).not.toHaveBeenCalled();
    });

    it("rejects with 'not_active' when no active event (no window opened)", async () => {
      WorldBossEvent.getActive.mockResolvedValue(null);
      const res = await combat.tankBlock({ platformId: "Utank", numericUserId: 3, eventId: 7 });
      expect(res.rejected).toBe(true);
      expect(res.reason).toBe("not_active");
      expect(wbRedis.blockSet).not.toHaveBeenCalled();
    });

    it("rejects with 'not_active' when the active event id mismatches", async () => {
      WorldBossEvent.getActive.mockResolvedValue({ id: 8, status: "active" });
      const res = await combat.tankBlock({ platformId: "Utank", numericUserId: 3, eventId: 7 });
      expect(res.rejected).toBe(true);
      expect(res.reason).toBe("not_active");
      expect(wbRedis.blockSet).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS.** Run `cd app && yarn test -- __tests__/service/WorldBossCombatService.tankBlock.test.js`. Expected: `combat.tankBlock is not a function`.

- [ ] **Step 3: Append `tankBlock`** to the EXISTING `app/src/service/WorldBossCombatService.js`:

  ```js
  /**
   * 坦克格擋：只開立本場唯一的格擋視窗（blockSet，owner = 坦克 platform_id，TTL = getBlockWindowMinutes()*60）。
   * 不寫任何貢獻列——格擋實際擋下擊倒時，由 M4 暴走處理器消費此視窗並把 contribution 回寫計給 OWNER（lock §D 時序契約）。
   * 坦克的 D22 參與/計費列由 M8/M9 動作包裝層寫入（本服務保持純 Redis、可決定性）。
   * 結果 shape 鎖定：{ rejected, reason, windowMinutes }（lock §D）。
   * @param {{platformId: String, numericUserId: Number, eventId: Number}} param0
   */
  exports.tankBlock = async ({ platformId, numericUserId, eventId }) => {
    const result = { rejected: false, reason: null, windowMinutes: 0 };

    const active = await WorldBossEvent.getActive();
    if (!active || active.id !== eventId) {
      result.rejected = true;
      result.reason = "not_active";
      return result;
    }

    const windowMinutes = WorldBossConfig.getBlockWindowMinutes();
    await wbRedis.blockSet(eventId, platformId, windowMinutes * 60);
    result.windowMinutes = windowMinutes;
    return result;
  };
  ```

  > **Note (D22 participation for tank):** `tankBlock` opens a window whose absorb credit may never materialize (the enrage trigger may not fire during the window). So the tank's energy/participation row (`role:"tank", action_type:"block", contribution:0, cost:getNormalAttackCost()`) is written by the **caller** (M8 REST / M9 LINE) as the cost-charging action row at command time — keeping `tankBlock` a pure Redis-only deterministic unit. This is exactly the lock §D split: `tankBlock` opens the window; the absorb credit is M4's; participation is the action wrapper's.

- [ ] **Step 4: Run the test and confirm it PASSES.** Run `cd app && yarn test -- __tests__/service/WorldBossCombatService.tankBlock.test.js`. Expected: all three cases green.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/service/WorldBossCombatService.js app/__tests__/service/WorldBossCombatService.tankBlock.test.js
  git commit -m "feat(worldboss): tankBlock opens block window (absorb credit deferred to enrage) (M5)"
  ```

---

### Task 5 — Lint + full-suite green gate

A reviewer rejects the milestone if lint fails or any pre-existing test regresses. M5 only APPENDED to M4's combat file and added four test files — no model or migration changes, so regression surface is small.

**Files:** No new source files (Tasks 1–4 only modified the M4-created `WorldBossCombatService.js`). Touches M5 files only if lint flags them.

**Steps:**

- [ ] **Step 1: Lint the modified service.** Run `cd app && yarn lint -- src/service/WorldBossCombatService.js`. Expected: zero errors. If Prettier complains (double quotes, es5 trailing commas, 100-char width), run `cd app && ./node_modules/.bin/prettier --write src/service/WorldBossCombatService.js` and re-lint.

- [ ] **Step 2: Run all M5 tests together.** Run `cd app && yarn test -- __tests__/service/WorldBossCombatService.coldStart.test.js __tests__/service/WorldBossCombatService.healerRevive.test.js __tests__/service/WorldBossCombatService.healerShield.test.js __tests__/service/WorldBossCombatService.tankBlock.test.js`. Expected: all four suites pass, 0 failed.

- [ ] **Step 3: Run the full combat suite + existing WorldBoss suites to confirm no regression.** Run `cd app && yarn test -- WorldBossCombatService` then `cd app && yarn test -- WorldBoss`. Expected: M4's `dpsAttack` suite still passes alongside M5's appended exports (M5 added exports without touching `dpsAttack` / the enrage handler — `getEnrageScaling` is a new pure helper M4's handler binds to), and pre-existing WorldBoss tests are unaffected.

- [ ] **Step 4: Commit any lint fixups (only if Step 1 changed files).**
  ```bash
  git add app/src/service/WorldBossCombatService.js
  git commit -m "style(worldboss): prettier format M5 combat support methods"
  ```

---

**M5 done-definition:** The M4-created `WorldBossCombatService.js` now ALSO exposes `tankBlock`, `healerRevive`, `healerShield` with the EXACT lock §D signatures (`{ platformId, numericUserId, eventId }`) and result shapes (`tankBlock:{rejected,reason,windowMinutes}`; `healerRevive:{rejected,reason,revived,contribution}`; `healerShield:{rejected,reason,shielded,contribution}`), plus the D30 cold-start `getEnrageScaling` helper. `healerRevive` pops the K oldest knocked-down `platform_id`s via `worldBossRedis.poolPopMin(eventId, K)` and writes its OWN contribution = the actual popped count via `WorldBossLog.createWithRole` (numeric `user_id`); `tankBlock` opens `worldBossRedis.blockSet`; `healerShield` opens `worldBossRedis.shieldSet` — and the absorb credit for both is written by M4's enrage handler (timing contract), never by M5. D30 scaling reads the SINGLE shared `WorldBossLog.getSupportRatio(eventId)` and scales M4's enrage batch-N and counter-% DOWN as the ratio → 0 (cold start). Pool/shield/block identity is uniformly `platform_id` (lock §B); numeric id resolution is ONLY `UserModel.getId` (no `_resolveNumericId`). M5 created neither combat file, never re-created `worldBossRedis.js`, never redefined `dpsAttack`. Only the eight `worldBossRedis` exports (`poolAdd/poolPopMin/poolScore/poolRemove/shieldSet/shieldConsume/blockSet/blockOwner`) are referenced — no forbidden legacy names. All four M5 test files green, lint clean, no regression.

**Hand-off downstream (frozen consumer contract, lock §F):**
- M8 (REST) and M9 (LINE) call `tankBlock/healerRevive/healerShield({ platformId, numericUserId, eventId })`, resolving `numericUserId` via `UserModel.getId(platformId)` (409 `no_user` on null). For `tankBlock` the caller ALSO writes the tank's `role:"tank", action_type:"block", contribution:0, cost:getNormalAttackCost()` participation row (the service is Redis-only; D22 participation lives in the action wrapper). M8 reads result fields `rejected`, `reason`, `revived`, `contribution`, `shielded`, `windowMinutes` verbatim.
- M4 owes M5: `worldBossRedis` (the eight §C helpers), the existing `dpsAttack` + the enrage handler with a scaling hook bound to `WorldBossCombatService.getEnrageScaling(eventId, { baseBatch, baseCounterRate })`, and the absorb-credit writer that consumes shield/block windows and credits the OWNER's numeric id via `UserModel.getId`.
- M1 owes M5: `WorldBossLog.{createWithRole,getRecentAttackers,getSupportRatio}` (lock §E — `getRecentAttackers` returns `[{ user_id /*numeric*/, platform_id }]`, `getSupportRatio` is the distinct-user ratio) and `WorldBossEvent.getActive`.
- M7 settlement reads the contribution boards via `getContributionRank({ role })` SUMming `contribution` — because absorb rows are credited to the OWNER's numeric id (by M4's handler), the tank/healer boards reward the protectors; the `contribution:0` revive/shield rows still satisfy participation. M7's scarcity premium consumes the SAME `WorldBossLog.getSupportRatio(eventId)` M5 uses, scaling rewards UP as the ratio → 0 (addendum §15).
- M10's Monte-Carlo gate imports the REAL `dpsAttack` (M4) inheriting the cold-start `getEnrageScaling` direction; if an all-DPS server stalls, tune the `worldboss` enrage knobs M4 reads, not M5's pure scaling math.

---

## Milestone M6: Lifecycle cron (daily rotation + status machine)

**Goal:** Build the per-minute cron worker (`bin/WorldBossAdvance.js`, mirroring `bin/RaceAdvance.js`) and the lifecycle service (`WorldBossLifecycleService.js`, exporting `createDailyBoss` + `advance`) that auto-opens one all-server daily boss at the configured hour, settles killed-but-unsettled events, atomically expires overdue-active events via `casStatus`, and hands reward payout to `WorldBossSettlementService.settleEvent` — open + settle/expire only, no push, no combat tick.

> **OWNERSHIP (lock §A / §G).** This milestone is the **SOLE owner** of `app/src/service/WorldBossLifecycleService.js` (`createDailyBoss` + the `advance` scan), `app/bin/WorldBossAdvance.js`, and the `"World Boss Advance"` crontab entry. It **does NOT** define `settleEvent`, `_computeFaucet`, or `grantOne` — those are M7's, owned solely by `WorldBossSettlementService.js`. `advance` and `createDailyBoss` CALL `require("./WorldBossSettlementService").settleEvent(eventId)` by name only. This milestone **does NOT** define any model method or query helper — it CALLS M1's `WorldBossEvent` helpers (`getActive`, `getKilledUnsettled`, `getOverdueActive`, `casStatus`, `create`) verbatim. There is exactly ONE `WorldBossLifecycleService.js` and ONE `bin/WorldBossAdvance.js` in the whole feature; M7 never re-creates either.

> **Prerequisites — consumed, never created here (lock §E / §G).** Bind by exact name; if any is absent, merge that milestone first.
> - **M1 — `WorldBossEvent.js` helpers (lock §E):** `getActive() => Promise<row|null>` (status='active' AND now BETWEEN start_time/end_time), `getKilledUnsettled() => Promise<row[]>` (status='killed' AND settled_at IS NULL), `getOverdueActive() => Promise<row[]>` (status='active' AND end_time<now), `casStatus(eventId, fromStatus, toStatus, extra = {}) => Promise<boolean>` (UPDATE … SET status=to, …extra WHERE id=? AND status=from; true iff affected===1). M1 also adds `"status","killed_at","settled_at"` to `fillable` so `create({status:"active",…})` is not silently dropped (current live `fillable = ["world_boss_id","announcement","start_time","end_time"]` drops it — addendum §5).
> - **M1 — config (lock §A / §G):** `config.get("worldboss.boss_pool")` (array of `world_boss` template ids) and `config.get("worldboss.open_hour")` (number). M1 owns the whole config layer; this milestone only reads via the `config` package (same pattern as `RaceAdvance.js`).
> - **M7 — `WorldBossSettlementService.js`:** `settleEvent(eventId) => Promise<void>` — idempotent (guards on `settled_at != null` via `markSettled`), stamps `settled_at` itself (lock §G). Until M7 lands, every test here mocks `settleEvent`, so M6 is blocked only on its name/signature, not its code.

> **No `remain_hp` — HP is dynamic (addendum §6).** This milestone never reads or writes a `remain_hp` column (none exists). Kill detection belongs to combat (M4): the fatal hit does `casStatus(active→killed)` + `killed_at` in the same trx as its final log insert. M6's cron only reacts to the resulting `status`/`end_time` state; it computes nothing from HP.

---

### Task 1 — `WorldBossLifecycleService.createDailyBoss`

**Goal:** Open at most one all-server daily boss, only at `config.worldboss.open_hour`, guarded by `getActive()` so a re-run inside the same hour (cron `immediate:true` + per-minute) never double-opens. Day-of-year rotation across `config.worldboss.boss_pool` for the every-day-a-different-boss feel (D25).

**Files:**
- Create: `app/src/service/WorldBossLifecycleService.js`
- Test: `app/src/service/__tests__/WorldBossLifecycleService.createDailyBoss.test.js` (new)

**Interfaces:**
- Consumes (lock §E / §G):
  - `WorldBossEvent.getActive()` → `Promise<row|null>` (M1).
  - `WorldBossEvent.create(attributes)` → `Promise<[insertId]>` (existing; `fillable` extended by M1 to include `status`).
  - `config.get("worldboss.open_hour")` → `Number`.
  - `config.get("worldboss.boss_pool")` → `Array<Number>` of `world_boss` template ids.
- Produces:
  ```js
  exports.createDailyBoss = async () => Promise<Number|null>;
  // returns the new event id, or null when: not the open hour, an active event already exists,
  // or the boss pool is empty. Picks a template id by day-of-year rotation across the pool.
  ```

Steps:

- [ ] **Step 1: Write the failing test.** Create `app/src/service/__tests__/WorldBossLifecycleService.createDailyBoss.test.js`. `jest.mock` is NOT hoisted (jest.config `transform:{}`) — every mock block goes BEFORE the `require`. Paste verbatim:

  ```js
  // jest.mock NOT hoisted (transform:{}). All mocks BEFORE requiring the service.
  jest.mock("../../model/application/WorldBossEvent", () => ({
    getActive: jest.fn(),
    create: jest.fn(),
  }));
  jest.mock("config", () => ({
    get: jest.fn(key => {
      if (key === "worldboss.open_hour") return 4;
      if (key === "worldboss.boss_pool") return [101, 102, 103];
      throw new Error(`unexpected config key: ${key}`);
    }),
  }));
  // settleEvent is unused by createDailyBoss but the service requires it at module load.
  jest.mock("../WorldBossSettlementService", () => ({ settleEvent: jest.fn() }));

  const WorldBossEvent = require("../../model/application/WorldBossEvent");
  const config = require("config");
  const Lifecycle = require("../WorldBossLifecycleService");

  // Real Date constructor captured before any spy replaces global.Date.
  const RealDate = Date;

  describe("WorldBossLifecycleService.createDailyBoss", () => {
    let nowSpy;

    afterEach(() => {
      if (nowSpy) {
        nowSpy.mockRestore();
        nowSpy = undefined;
      }
      jest.clearAllMocks();
    });

    function freezeNow(hour) {
      const fixed = new RealDate(2026, 5, 20, hour, 0, 0, 0); // 2026-06-20 local
      nowSpy = jest
        .spyOn(global, "Date")
        .mockImplementation((...args) => (args.length ? new RealDate(...args) : fixed));
      global.Date.now = RealDate.now;
    }

    it("returns null and creates nothing when the local hour is not the open hour", async () => {
      freezeNow(9); // 09:00, open hour is 4
      const result = await Lifecycle.createDailyBoss();
      expect(result).toBeNull();
      expect(WorldBossEvent.getActive).not.toHaveBeenCalled();
      expect(WorldBossEvent.create).not.toHaveBeenCalled();
    });

    it("returns null when an active event already exists (no double-open)", async () => {
      freezeNow(4);
      WorldBossEvent.getActive.mockResolvedValue({ id: 77, status: "active" });
      const result = await Lifecycle.createDailyBoss();
      expect(result).toBeNull();
      expect(WorldBossEvent.create).not.toHaveBeenCalled();
    });

    it("returns null when the boss pool is empty", async () => {
      freezeNow(4);
      WorldBossEvent.getActive.mockResolvedValue(null);
      config.get.mockImplementation(key => {
        if (key === "worldboss.open_hour") return 4;
        if (key === "worldboss.boss_pool") return [];
        throw new Error(`unexpected config key: ${key}`);
      });
      const result = await Lifecycle.createDailyBoss();
      expect(result).toBeNull();
      expect(WorldBossEvent.create).not.toHaveBeenCalled();
    });

    it("creates one active event at the open hour, status='active', 24h window, rotated template", async () => {
      freezeNow(4);
      WorldBossEvent.getActive.mockResolvedValue(null);
      WorldBossEvent.create.mockResolvedValue([555]);
      const result = await Lifecycle.createDailyBoss();
      expect(result).toBe(555);
      expect(WorldBossEvent.create).toHaveBeenCalledTimes(1);
      const arg = WorldBossEvent.create.mock.calls[0][0];
      expect(arg.status).toBe("active");
      expect([101, 102, 103]).toContain(arg.world_boss_id);
      expect(arg.start_time).toBeInstanceOf(Date);
      expect(arg.end_time).toBeInstanceOf(Date);
      // 24h window
      expect(arg.end_time.getTime() - arg.start_time.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it("returns null when create resolves an empty insert result", async () => {
      freezeNow(4);
      WorldBossEvent.getActive.mockResolvedValue(null);
      WorldBossEvent.create.mockResolvedValue([]);
      const result = await Lifecycle.createDailyBoss();
      expect(result).toBeNull();
    });
  });
  ```

  > The `freezeNow` helper stubs `global.Date` so `new Date()` (no args) inside the service returns a fixed instant — making `getHours()` and the day-of-year math deterministic — while `new Date(args)` (the window arithmetic and `new Date(year,0,0)`) still builds real dates via the captured `RealDate`.

- [ ] **Step 2: Run the test and confirm it FAILS.** `cd app && yarn test -- src/service/__tests__/WorldBossLifecycleService.createDailyBoss.test.js`. Expected: `Cannot find module '../WorldBossLifecycleService'`.

- [ ] **Step 3: Implement `createDailyBoss`.** Create `app/src/service/WorldBossLifecycleService.js`:

  ```js
  const config = require("config");
  const WorldBossEvent = require("../model/application/WorldBossEvent");
  const settlement = require("./WorldBossSettlementService");

  const EVENT_WINDOW_HOURS = 24;

  /**
   * 每日自動開一隻全服共王（D12）。只在設定的 worldboss.open_hour 開，且最多一隻。
   * 以「年度第幾天」對 worldboss.boss_pool 取模做輪替，達成每日換王的圖鑑感（D25）。
   * cron 為每分鐘且 immediate:true，故必須用 getActive() 守門，避免同一小時內重複開。
   * @returns {Promise<Number|null>} 新事件 id；非開王時段 / 已有進行中事件 / 王池為空時回傳 null
   */
  exports.createDailyBoss = async () => {
    const now = new Date();
    if (now.getHours() !== config.get("worldboss.open_hour")) {
      return null;
    }

    const active = await WorldBossEvent.getActive();
    if (active) {
      return null;
    }

    const pool = config.get("worldboss.boss_pool");
    if (!Array.isArray(pool) || pool.length === 0) {
      return null;
    }

    const dayOfYear = Math.floor(
      (now - new Date(now.getFullYear(), 0, 0)) / (24 * 60 * 60 * 1000)
    );
    const worldBossId = pool[dayOfYear % pool.length];

    const startTime = now;
    const endTime = new Date(now.getTime() + EVENT_WINDOW_HOURS * 60 * 60 * 1000);

    const [eventId] = await WorldBossEvent.create({
      world_boss_id: worldBossId,
      status: "active",
      start_time: startTime,
      end_time: endTime,
    });

    return eventId || null;
  };
  ```

  > `WorldBossEvent.create` does `pick(attributes, fillable)`; per addendum §5 M1 MUST have added `"status"` to `fillable` or the explicit `status:"active"` is silently dropped (the migration `defaultTo("active")` still keeps the row correct, but the explicit field is the §G contract).

- [ ] **Step 4: Run the test and confirm it PASSES.** `cd app && yarn test -- src/service/__tests__/WorldBossLifecycleService.createDailyBoss.test.js`. Expected: 5 `it`s green. If the rotation assertion is flaky, confirm the day-of-year math uses `new Date(year,0,0)` (real Date) and not the frozen instant.

- [ ] **Step 5: Lint.** `cd app && yarn lint -- src/service/WorldBossLifecycleService.js`. Resolve double-quote / es5-trailing-comma / 100-char findings.

- [ ] **Step 6: Commit.**
  ```bash
  git add app/src/service/WorldBossLifecycleService.js \
          app/src/service/__tests__/WorldBossLifecycleService.createDailyBoss.test.js
  git commit -m "feat(worldboss): WorldBossLifecycleService.createDailyBoss (daily rotation, open-hour + active guard)"
  ```

---

### Task 2 — `WorldBossLifecycleService.advance` (the status-machine scan)

**Goal:** The per-minute reconciliation pass: settle every killed-but-unsettled event, then atomically expire every overdue-active event via `casStatus(active→expired,{})` and settle the ones this tick won. Idempotency is delegated to `settleEvent` (guards on `settled_at != null`); the expire CAS guarantees exactly one tick wins the transition. One settlement failure never aborts the rest of the batch.

**Files:**
- Modify: `app/src/service/WorldBossLifecycleService.js` (add `exports.advance`)
- Test: `app/src/service/__tests__/WorldBossLifecycleService.advance.test.js` (new)

**Interfaces:**
- Consumes (lock §E / §G):
  - `WorldBossEvent.getKilledUnsettled()` → `Promise<row[]>` (status='killed' AND settled_at IS NULL).
  - `WorldBossEvent.getOverdueActive()` → `Promise<row[]>` (status='active' AND end_time<now).
  - `WorldBossEvent.casStatus(eventId, fromStatus, toStatus, extra = {})` → `Promise<boolean>` (atomic; true iff exactly one row transitioned).
  - `require("./WorldBossSettlementService").settleEvent(eventId)` → `Promise<void>` (M7; idempotent, stamps `settled_at`).
- Produces:
  ```js
  exports.advance = async () => Promise<{ settledKilled: Number, expired: Number }>;
  // settledKilled = count of killed-unsettled events handed to settleEvent;
  // expired       = count of overdue-active events this tick won the active->expired CAS for (and then settled).
  ```

> **Expire-CAS contract (lock §G).** The `active→expired` transition passes `extra = {}` — NOT `{killed_at:null}` and NOT `{settled_at:…}`. `settled_at` is owned exclusively by `settleEvent.markSettled`; `killed_at` stays NULL for a boss that expired without being killed. A winning expire CAS → the same tick calls `settleEvent(event.id)`. A losing CAS (another worker/tick won) skips settlement (the winner already triggered it). Killed events skip CAS entirely — their `active→killed` transition already happened on the fatal hit (M4); the cron just calls the idempotent `settleEvent`.

Steps:

- [ ] **Step 1: Write the failing test.** Create `app/src/service/__tests__/WorldBossLifecycleService.advance.test.js`. Mocks BEFORE require. Paste verbatim:

  ```js
  // jest.mock NOT hoisted (transform:{}). All mocks BEFORE requiring the service.
  jest.mock("../../model/application/WorldBossEvent", () => ({
    getActive: jest.fn(),
    create: jest.fn(),
    getKilledUnsettled: jest.fn(),
    getOverdueActive: jest.fn(),
    casStatus: jest.fn(),
  }));
  jest.mock("config", () => ({
    get: jest.fn(key => {
      if (key === "worldboss.open_hour") return 4;
      if (key === "worldboss.boss_pool") return [101];
      throw new Error(`unexpected config key: ${key}`);
    }),
  }));
  jest.mock("../WorldBossSettlementService", () => ({
    settleEvent: jest.fn(() => Promise.resolve()),
  }));

  const WorldBossEvent = require("../../model/application/WorldBossEvent");
  const settlement = require("../WorldBossSettlementService");
  const Lifecycle = require("../WorldBossLifecycleService");

  describe("WorldBossLifecycleService.advance", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      WorldBossEvent.getKilledUnsettled.mockResolvedValue([]);
      WorldBossEvent.getOverdueActive.mockResolvedValue([]);
      WorldBossEvent.casStatus.mockResolvedValue(true);
    });

    it("settles every killed-unsettled event (no CAS — kill CAS already happened on the fatal hit)", async () => {
      WorldBossEvent.getKilledUnsettled.mockResolvedValue([{ id: 10 }, { id: 11 }]);
      const result = await Lifecycle.advance();
      expect(settlement.settleEvent).toHaveBeenCalledWith(10);
      expect(settlement.settleEvent).toHaveBeenCalledWith(11);
      // killed path must NOT touch casStatus
      expect(WorldBossEvent.casStatus).not.toHaveBeenCalled();
      expect(result.settledKilled).toBe(2);
    });

    it("expires an overdue active event via casStatus(active->expired,{}) then settles it", async () => {
      WorldBossEvent.getOverdueActive.mockResolvedValue([{ id: 20 }]);
      WorldBossEvent.casStatus.mockResolvedValue(true);
      const result = await Lifecycle.advance();
      expect(WorldBossEvent.casStatus).toHaveBeenCalledWith(20, "active", "expired", {});
      expect(settlement.settleEvent).toHaveBeenCalledWith(20);
      expect(result.expired).toBe(1);
    });

    it("does NOT settle an overdue event whose expire-CAS it lost (another tick won)", async () => {
      WorldBossEvent.getOverdueActive.mockResolvedValue([{ id: 30 }]);
      WorldBossEvent.casStatus.mockResolvedValue(false);
      const result = await Lifecycle.advance();
      expect(WorldBossEvent.casStatus).toHaveBeenCalledWith(30, "active", "expired", {});
      expect(settlement.settleEvent).not.toHaveBeenCalled();
      expect(result.expired).toBe(0);
    });

    it("expire CAS passes empty extra — never killed_at:null and never settled_at", async () => {
      WorldBossEvent.getOverdueActive.mockResolvedValue([{ id: 40 }]);
      await Lifecycle.advance();
      const extra = WorldBossEvent.casStatus.mock.calls[0][3];
      expect(extra).toEqual({});
      expect(extra).not.toHaveProperty("killed_at");
      expect(extra).not.toHaveProperty("settled_at");
    });

    it("one settleEvent rejection does not abort the rest of the killed batch", async () => {
      WorldBossEvent.getKilledUnsettled.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      settlement.settleEvent.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce();
      const result = await Lifecycle.advance();
      expect(settlement.settleEvent).toHaveBeenCalledTimes(2);
      expect(result.settledKilled).toBe(1); // only the successful one counted
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS.** `cd app && yarn test -- src/service/__tests__/WorldBossLifecycleService.advance.test.js`. Expected: `Lifecycle.advance is not a function`.

- [ ] **Step 3: Implement `advance`.** Append to `app/src/service/WorldBossLifecycleService.js` (after `createDailyBoss`):

  ```js
  /**
   * 每分鐘生命週期掃描（對齊 RaceAdvance）。只做兩件事，符合「cron 不打人、不推播」：
   *   1. 撈 status='killed' AND settled_at IS NULL → 交給 settleEvent 發擊殺獎（致命刀已在 M4 做過
   *      active→killed CAS，故此處不再 CAS，直接結算；settleEvent 以 settled_at 做冪等守衛）。
   *   2. 撈 status='active' AND end_time<now → casStatus(active→expired, {}) 原子過期；贏得轉移者才
   *      呼叫 settleEvent 發參與獎。extra={}：settled_at 由 settleEvent 寫、killed_at 對逾時王維持 NULL。
   * 單筆結算失敗不中斷整批（下一分鐘重試；settleEvent 冪等）。
   * @returns {Promise<{settledKilled: Number, expired: Number}>}
   */
  exports.advance = async () => {
    let settledKilled = 0;
    let expired = 0;

    const killed = await WorldBossEvent.getKilledUnsettled();
    for (const event of killed) {
      try {
        await settlement.settleEvent(event.id);
        settledKilled += 1;
      } catch (err) {
        console.error(`[WorldBoss] settle killed event #${event.id} failed:`, err);
      }
    }

    const overdue = await WorldBossEvent.getOverdueActive();
    for (const event of overdue) {
      try {
        const won = await WorldBossEvent.casStatus(event.id, "active", "expired", {});
        if (!won) {
          continue;
        }
        await settlement.settleEvent(event.id);
        expired += 1;
      } catch (err) {
        console.error(`[WorldBoss] expire+settle event #${event.id} failed:`, err);
      }
    }

    return { settledKilled, expired };
  };
  ```

- [ ] **Step 4: Run the test and confirm it PASSES.** `cd app && yarn test -- src/service/__tests__/WorldBossLifecycleService.advance.test.js`. Expected: 5 `it`s green. If the "rejection does not abort" case fails, confirm the `try/catch` is INSIDE each loop body, not wrapping the whole loop.

- [ ] **Step 5: Lint.** `cd app && yarn lint -- src/service/WorldBossLifecycleService.js`. Resolve findings.

- [ ] **Step 6: Commit.**
  ```bash
  git add app/src/service/WorldBossLifecycleService.js \
          app/src/service/__tests__/WorldBossLifecycleService.advance.test.js
  git commit -m "feat(worldboss): WorldBossLifecycleService.advance (settle killed / expire+settle overdue via casStatus)"
  ```

---

### Task 3 — `bin/WorldBossAdvance.js` cron entry + crontab registration

**Goal:** The per-minute cron worker (modelled on `bin/RaceAdvance.js`, `module.exports = async function () {...}`) that the `yarn worker` scheduler invokes: it calls `createDailyBoss()` then `advance()`, each wrapped in its own `try/catch` so one bad call never blocks the other and the scheduler tick is crash-proof. Plus the `crontab.config.js` entry that wires it in.

**Files:**
- Create: `app/bin/WorldBossAdvance.js`
- Modify: `app/config/crontab.config.js` (append one job entry after the `Race Advance` entry, line 107)
- Test: `app/bin/__tests__/WorldBossAdvance.test.js` (new)

**Interfaces:**
- Consumes: `WorldBossLifecycleService.createDailyBoss()` (Task 1), `WorldBossLifecycleService.advance()` (Task 2).
- Produces (for `app/tasks.js` scheduler, via `crontab.config.js`):
  ```js
  module.exports = async function () => Promise<void>;  // never throws; logs and returns on error
  ```
- crontab entry (mirrors `Race Advance`):
  ```js
  {
    name: "World Boss Advance",
    description: "open daily boss / settle killed / expire+settle overdue (no push; reply/LIFF surfacing)",
    period: ["0", "*", "*", "*", "*", "*"], // every minute on second 0
    immediate: true,
    require_path: "./bin/WorldBossAdvance",
  }
  ```

Steps:

- [ ] **Step 1: Write the failing test.** Create `app/bin/__tests__/WorldBossAdvance.test.js`. Mocks BEFORE require. Paste verbatim:

  ```js
  // jest.mock NOT hoisted (transform:{}). Mock the lifecycle service BEFORE requiring the cron entry.
  jest.mock("../../src/service/WorldBossLifecycleService", () => ({
    createDailyBoss: jest.fn(() => Promise.resolve(null)),
    advance: jest.fn(() => Promise.resolve({ settledKilled: 0, expired: 0 })),
  }));

  const Lifecycle = require("../../src/service/WorldBossLifecycleService");
  const WorldBossAdvance = require("../WorldBossAdvance");

  describe("bin/WorldBossAdvance", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("calls createDailyBoss then advance once per tick", async () => {
      await WorldBossAdvance();
      expect(Lifecycle.createDailyBoss).toHaveBeenCalledTimes(1);
      expect(Lifecycle.advance).toHaveBeenCalledTimes(1);
    });

    it("calls createDailyBoss before advance (open before reconcile)", async () => {
      const order = [];
      Lifecycle.createDailyBoss.mockImplementation(() => {
        order.push("create");
        return Promise.resolve(null);
      });
      Lifecycle.advance.mockImplementation(() => {
        order.push("advance");
        return Promise.resolve({ settledKilled: 0, expired: 0 });
      });
      await WorldBossAdvance();
      expect(order).toEqual(["create", "advance"]);
    });

    it("does not throw when createDailyBoss rejects (still runs advance)", async () => {
      Lifecycle.createDailyBoss.mockRejectedValue(new Error("open failed"));
      await expect(WorldBossAdvance()).resolves.toBeUndefined();
      expect(Lifecycle.advance).toHaveBeenCalledTimes(1);
    });

    it("does not throw when advance rejects", async () => {
      Lifecycle.advance.mockRejectedValue(new Error("advance failed"));
      await expect(WorldBossAdvance()).resolves.toBeUndefined();
    });
  });
  ```

  > Even if `createDailyBoss` throws, `advance` must still run (a failed open must not block settling a killed boss). Each call is wrapped so the scheduler tick is crash-proof, matching `RaceAdvance.js`'s top-level `try/catch`.

- [ ] **Step 2: Run the test and confirm it FAILS.** `cd app && yarn test -- bin/__tests__/WorldBossAdvance.test.js`. Expected: `Cannot find module '../WorldBossAdvance'`.

- [ ] **Step 3: Implement the cron entry.** Create `app/bin/WorldBossAdvance.js`:

  ```js
  const Lifecycle = require("../src/service/WorldBossLifecycleService");

  /**
   * 世界王生命週期 cron（每分鐘，對齊 RaceAdvance）。
   * 只做：自動開每日王 → 結算已擊殺 / 過期未結算（不推播、不打人）。
   * 開王與結算各自獨立 try/catch，任一失敗不影響另一個、也不讓 scheduler tick 崩潰。
   * @returns {Promise<void>}
   */
  module.exports = async function () {
    try {
      const eventId = await Lifecycle.createDailyBoss();
      if (eventId) {
        console.log(`[WorldBoss] Opened daily boss event #${eventId}`);
      }
    } catch (err) {
      console.error("[WorldBoss] createDailyBoss error:", err);
    }

    try {
      const { settledKilled, expired } = await Lifecycle.advance();
      if (settledKilled || expired) {
        console.log(`[WorldBoss] Advanced: settledKilled=${settledKilled} expired=${expired}`);
      }
    } catch (err) {
      console.error("[WorldBoss] advance error:", err);
    }
  };
  ```

- [ ] **Step 4: Run the test and confirm it PASSES.** `cd app && yarn test -- bin/__tests__/WorldBossAdvance.test.js`. Expected: 4 `it`s green.

- [ ] **Step 5: Register the cron job.** Edit `app/config/crontab.config.js`. Insert this object immediately AFTER the `Race Advance` entry (the `},` closing it at line 107, before the `Auto Gacha` entry):

  ```js
    {
      name: "World Boss Advance",
      description: "open daily boss / settle killed / expire+settle overdue (no push; reply/LIFF surfacing)",
      period: ["0", "*", "*", "*", "*", "*"],
      immediate: true,
      require_path: "./bin/WorldBossAdvance",
    },
  ```

- [ ] **Step 6: Lint both touched files.** `cd app && yarn lint -- bin/WorldBossAdvance.js config/crontab.config.js`. Resolve findings.

- [ ] **Step 7: Commit.**
  ```bash
  git add app/bin/WorldBossAdvance.js \
          app/config/crontab.config.js \
          app/bin/__tests__/WorldBossAdvance.test.js
  git commit -m "feat(worldboss): WorldBossAdvance per-minute cron + crontab registration (no push)"
  ```

---

### Milestone exit checklist (verifier evidence)

- [ ] **Full-milestone regression run:** `cd app && yarn test -- src/service/__tests__/WorldBossLifecycleService.createDailyBoss.test.js src/service/__tests__/WorldBossLifecycleService.advance.test.js bin/__tests__/WorldBossAdvance.test.js`. Expected: 3 suites, all green. This is the milestone's exit evidence.
- [ ] **Single ownership (lock §A / §G):** exactly ONE `app/src/service/WorldBossLifecycleService.js` and ONE `app/bin/WorldBossAdvance.js` exist; this milestone creates both. `settleEvent`, `_computeFaucet`, `grantOne` are NOT defined here (referenced as M7-owned dependencies). `WorldBossSettlementService.js` is NOT created here. No model method or query helper is defined here — only M1's `getActive`/`getKilledUnsettled`/`getOverdueActive`/`casStatus`/`create` are CALLED.
- [ ] **Lifecycle decisions locked (§G):** `createDailyBoss` opens only at `config.worldboss.open_hour`, guarded by `getActive()`, day-of-year rotation over `config.worldboss.boss_pool`, 24h window, `status:"active"`. `advance` settles killed-unsettled (no CAS), and expires overdue-active via `casStatus(event.id, "active", "expired", {})` then settles — **`extra` is `{}`** (no `killed_at:null`, no `settled_at`; `settled_at` is written only by `settleEvent`).
- [ ] **No push / no tick:** the cron performs only open + settle/expire; it never replies to groups, never computes HP, never runs combat. No `setInterval`/per-tick damage.
- [ ] **No `remain_hp`:** no code in this milestone reads or writes a `remain_hp` column (addendum §6).
- [ ] **Crontab entry present** with `period: ["0","*","*","*","*","*"]`, `immediate: true`, `require_path: "./bin/WorldBossAdvance"`.
- [ ] No commits on `main`; all on `feat/worldboss-redesign`.

---

**Files produced by this milestone (absolute paths):**
- `/home/hanshino/workspace/redive_linebot/app/src/service/WorldBossLifecycleService.js` (new — `createDailyBoss` + `advance`)
- `/home/hanshino/workspace/redive_linebot/app/bin/WorldBossAdvance.js` (new — per-minute cron entry)
- `/home/hanshino/workspace/redive_linebot/app/config/crontab.config.js` (modified — `World Boss Advance` job appended after `Race Advance`)
- `/home/hanshino/workspace/redive_linebot/app/src/service/__tests__/WorldBossLifecycleService.createDailyBoss.test.js` (new)
- `/home/hanshino/workspace/redive_linebot/app/src/service/__tests__/WorldBossLifecycleService.advance.test.js` (new)
- `/home/hanshino/workspace/redive_linebot/app/bin/__tests__/WorldBossAdvance.test.js` (new)

---

## Milestone M7: Settlement & reward economy (GATE: resolveUserIds)

**Goal:** Build the durable settlement service — `WorldBossSettlementService.{settleEvent, _computeFaucet, grantOne}` — that, when called by M6's lifecycle scan, **atomically claims** the event (`WorldBossEvent.markSettled`, proceed iff `affected===1`), aggregates three boards from `world_boss_event_log`, reads each ranked player's `platform_id` straight off the aggregation rows, runs the `resolveUserIds` GATE only for participation-only ids that never reached a ranked board, computes the faucet (participation / percentile bands / shared-`getSupportRatio` scarcity premium / DPS-MVP stones), and grants enhancement materials + goddess stones **idempotently** with each per-user grant in its OWN `mysql.transaction` (the `world_boss_reward_log` `tryInsert` is the FIRST write and the dedupe key; a dup short-circuits before any ledger write; settlement is safely re-runnable). No LINE push; results surface only by calling `WorldBossReportService.setUnread(platformId)` (the single report-unread writer, created in M8). This milestone OWNS the D26 `boss_top_damage` repair (feeds `isTopDamage` into `AchievementEngine.evaluate`).

> **Inherited global constraints (a reviewer rejects any task violating one):** NO LINE Push API (M7 sets a report-unread flag via `WorldBossReportService.setUnread`; results surface on the player's next reply / LIFF pull); NO background combat tick and NO lifecycle scheduling in M7 (the per-minute cron + `createDailyBoss` + the `"World Boss Advance"` crontab entry live ONLY in M6's `WorldBossLifecycleService` — M7 owns settlement/economy alone, addendum §12 / lock §A); money = Inventory append-ledger, `GODDESS_STONE_ITEM_ID=999`, `ENHANCEMENT_MATERIAL_ITEM_ID=1001`; **ledger signs (addendum §13)** — a GRANT is a POSITIVE `itemAmount` insert (matching `increaseGodStone`'s `itemAmount: amount` numeric convention), a SPEND is a NEGATIVE insert; M7 only grants, so every `itemAmount` is a positive NUMBER (any test expecting a negative amount for a settlement grant is wrong); **settlement identity GATE (lock §B / addendum §4)** — `world_boss_event_log.user_id` is the numeric `user.id` (migration `20211019095909`), so the M1 board helpers GROUP BY that numeric id and JOIN `user` to ALSO return `platform_id`; ranked players read `platformId` off the row, participation-only ids are resolved via `WorldBossLog.resolveUserIds` BEFORE any grant; Inventory / `world_boss_reward_log` / AchievementEngine / `WorldBossReportService.setUnread` all key on the LINE `platform_id` string; **each per-user grant is its own transaction** (no whole-batch rollback — `settleEvent` is re-runnable, the reward-log unique key dedupes); CommonJS, double quotes, es5 trailing commas, 100-char width; Jest in `app/` with `jest.config transform:{}` so **every `jest.mock(...)` goes BEFORE any `require()` of the mocked module**; branch `feat/worldboss-redesign`, never commit to main.

> **D22 deferral (conscious omission, lock §H):** D22's "first-two-weeks healer/tank role-swap migration bonus" (`遷移頭兩週給補/坦轉職限時加成`) is **DEFERRED out of v1**. The 7:2:1 role anchor plus the `getSupportRatio` scarcity premium (Task 2) already rebalance roles toward support; the time-boxed launch promo is a nicety, not a correctness requirement. There is NO task for it in M7 — this is a deliberate decision, not a silent miss.

> **Upstream this milestone CALLS (already produced by M1/M2/M3/M6/M8 — exact names, never re-defined here):**
> - **M1 (sole owner of the whole model/migration/config layer, lock §A/§E):**
>   - tables/columns — `world_boss_event.{status,killed_at,settled_at}` (DB `defaultTo("active")` on `status`; `fillable` extended to include them per addendum §5), `world_boss_event_log.{role,contribution}` (added to its `fillable`), and `world_boss_reward_log` (unique `["user_id","world_boss_event_id"]`).
>   - new model `WorldBossRewardLog.tryInsert({ user_id, world_boss_event_id, materials, stones, board, rank, is_mvp }, trx) => Promise<boolean>` (mirrors `JankenDailyRewardLog.tryInsert` — verified `src/model/application/JankenDailyRewardLog.js:5-11`: `try { await db(TABLE).insert(...); return true; } catch (err) { if (err && err.code === "ER_DUP_ENTRY") return false; throw err; }`).
>   - `WorldBossLog.getDamageRank({ eventId, limit }) => Promise<[{ user_id /*numeric*/, platform_id, total_damage }]>` — `JOIN user`, `GROUP BY world_boss_event_log.user_id`, `ORDER BY SUM(damage) DESC`.
>   - `WorldBossLog.getContributionRank({ eventId, role, limit }) => Promise<[{ user_id, platform_id, total_contribution }]>` — same JOIN, `WHERE role`, `SUM(contribution)`.
>   - `WorldBossLog.getParticipants(eventId) => Promise<[{ user_id, platform_id }]>` — distinct users with ≥1 row.
>   - `WorldBossLog.resolveUserIds(numericIds /* number[] */) => Promise<Map<number,string>>` — `JOIN user`; SKIPS ids with no `user` row (deleted accounts). Used ONLY for participation-only ids that never reached a ranked board row.
>   - `WorldBossLog.getSupportRatio(eventId) => Promise<Number>` — the ONE shared definition (lock §E / addendum §15): `(# distinct users with ≥1 healer/tank action this event) / (# distinct users with ≥1 action this event)`; `0` when no actions. M5 scales batch-N / counter-% DOWN as ratio → 0; M7 scales support-board unit rewards UP as ratio → 0 (scarcity premium). Both consume this single method.
>   - `WorldBossEvent.findRaw(id) => Promise<row|undefined>` — **join-free** reader (`mysql("world_boss_event").where({id}).first()`); `settleEvent` MUST use this, NOT `find()` (which INNER-JOINs `world_boss`, colliding `id`/`status` and returning `undefined` on a deleted template row).
>   - `WorldBossEvent.markSettled(eventId) => Promise<boolean>` — **atomic settlement claim** (lock §E): `UPDATE world_boss_event SET settled_at=now() WHERE id=? AND settled_at IS NULL`, `true` iff `affected===1`. The real concurrency guard.
> - **M3:** `WorldBossConfig` accessors and all `worldboss.*` config keys; M3/M4 OWNS registration of item id `1001` in the item-master / `GachaPool` table (so the `world_boss_reward` ledger rows JOIN cleanly in `Inventory.getAllUserOwn`'s `.join("GachaPool","GachaPool.ID","itemId")`). M7 only GRANTS `1001`; it never registers it.
> - **M6 (sole owner of `WorldBossLifecycleService`, lock §A/§G):** the lifecycle scan calls `require("./WorldBossSettlementService").settleEvent(eventId)` for every `getKilledUnsettled()` and every expired (`casStatus(id,"active","expired",{})`) event. M7 does NOT define `createDailyBoss`, the cron, or the crontab entry; it only exposes `settleEvent`.
> - **M8:** `WorldBossReportService.setUnread(platformId) => Promise<void>` — the SINGLE writer of the report-unread flag (lock §F). M7 settlement calls it to surface the battle report. (M7 `require`s `WorldBossReportService`; at runtime both ship together.)
> - **Existing repo modules (verified):** `inventory` instance (`exports.inventory = new Inventory({ table: "Inventory", ... })`, `src/model/application/Inventory.js`): `inventory.increaseGodStone({ userId(platformId), amount, note, trx }) => db.insert([{ userId, itemId: 999, itemAmount: amount, note }])` where `db = trx ? trx(this.table) : this.knex` (accepts trx); `inventory.insertItems(params) => mysql.into("Inventory").insert(params)` (**NO trx param** — to stay inside the per-user trx, insert directly with `trx("Inventory").insert([...])`). `AchievementEngine.evaluate(userId(platformId), eventType, context = {}) => Promise<{ unlocked }>` (`src/service/AchievementEngine.js:202`; `boss_top_damage` is registered under `boss_attack` at `:84-88` and consumes `ctx.isTopDamage` at `:179`). `mysql` (knex instance, `mysql.transaction`, `mysql.fn.now`). `DefaultLogger` from `src/util/Logger`.

---

### Task 1 — `WorldBossSettlementService.settleEvent`: atomic claim + aggregation + identity GATE

**Files:**
- Create: `/home/hanshino/workspace/redive_linebot/app/src/service/WorldBossSettlementService.js`
- Test: `/home/hanshino/workspace/redive_linebot/app/__tests__/WorldBossSettlementService.settle.test.js`

**Interfaces:**
- *Consumes:* `WorldBossEvent.findRaw(id)`, `WorldBossEvent.markSettled(eventId) => Promise<boolean>`, `WorldBossLog.getDamageRank({eventId, limit})`, `WorldBossLog.getContributionRank({eventId, role, limit})`, `WorldBossLog.getParticipants(eventId)`, `WorldBossLog.resolveUserIds(numericIds) => Promise<Map>`, `WorldBossRewardLog.tryInsert(attrs, trx)`, `config`, `DefaultLogger`.
- *Produces (for Task 2/3, for M6's `advance`, for M8/M10):* `WorldBossSettlementService.settleEvent(eventId) => Promise<void>`.

This task builds the **claim + aggregation + identity-GATE skeleton** of `settleEvent`: (1) read via join-free `findRaw`; (2) **atomic claim** `markSettled` FIRST — bail if `affected !== 1` (already-settled or lost the race); (3) aggregate three boards, reading `platform_id` straight off each ranked row; (4) build the participation-only set and `resolveUserIds` ONLY for ids that never appeared on a ranked board. Faucet math (Task 2) and grant trx (Task 3) follow.

- [ ] **Step 1: Write the failing test for claim + aggregation + GATE.** Create `app/__tests__/WorldBossSettlementService.settle.test.js` with the FULL code below. Every `jest.mock` precedes every `require` (jest.config `transform:{}` = no hoisting).

```js
"use strict";

// --- mocks MUST precede requires (jest.config transform:{} -> no hoisting) ---
jest.mock("../src/model/application/WorldBossEvent");
jest.mock("../src/model/application/WorldBossLog");
jest.mock("../src/model/application/WorldBossRewardLog");
jest.mock("../src/model/application/Inventory");
jest.mock("../src/service/AchievementEngine");
jest.mock("../src/service/WorldBossReportService");
jest.mock("../src/util/mysql");

const WorldBossEvent = require("../src/model/application/WorldBossEvent");
const WorldBossLog = require("../src/model/application/WorldBossLog");
const WorldBossRewardLog = require("../src/model/application/WorldBossRewardLog");
const { inventory } = require("../src/model/application/Inventory");
const AchievementEngine = require("../src/service/AchievementEngine");
const WorldBossReportService = require("../src/service/WorldBossReportService");
const mysql = require("../src/util/mysql");
const SettlementService = require("../src/service/WorldBossSettlementService");

// mysql.transaction(cb) runs the callback with a fake trx (a function that
// returns a thenable query builder). We only need .insert() to resolve.
function makeTrx() {
  return jest.fn(() => ({ insert: jest.fn().mockResolvedValue([1]) }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mysql.transaction = jest.fn(async cb => cb(makeTrx()));
  WorldBossEvent.markSettled = jest.fn().mockResolvedValue(true);
  WorldBossLog.getContributionRank = jest.fn().mockResolvedValue([]);
  WorldBossLog.getParticipants = jest.fn().mockResolvedValue([]);
  WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());
  WorldBossLog.getSupportRatio = jest.fn().mockResolvedValue(0.3);
  WorldBossRewardLog.tryInsert = jest.fn().mockResolvedValue(true);
  inventory.increaseGodStone = jest.fn().mockResolvedValue([1]);
  AchievementEngine.evaluate = jest.fn().mockResolvedValue({ unlocked: [] });
  WorldBossReportService.setUnread = jest.fn().mockResolvedValue(undefined);
});

describe("WorldBossSettlementService.settleEvent - claim + aggregation + GATE", () => {
  test("missing event short-circuits with no throw, no claim, no aggregation", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue(undefined);
    WorldBossEvent.markSettled = jest.fn();
    WorldBossLog.getDamageRank = jest.fn();
    await expect(SettlementService.settleEvent(999)).resolves.toBeUndefined();
    expect(WorldBossEvent.markSettled).not.toHaveBeenCalled();
    expect(WorldBossLog.getDamageRank).not.toHaveBeenCalled();
  });

  test("lost the settlement claim (markSettled=false) -> no aggregation, no grant", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    WorldBossEvent.markSettled = jest.fn().mockResolvedValue(false); // another worker won
    WorldBossLog.getDamageRank = jest.fn();
    WorldBossLog.resolveUserIds = jest.fn();

    await SettlementService.settleEvent(7);

    expect(WorldBossEvent.markSettled).toHaveBeenCalledWith(7);
    expect(WorldBossLog.getDamageRank).not.toHaveBeenCalled();
    expect(WorldBossRewardLog.tryInsert).not.toHaveBeenCalled();
  });

  test("claim is the FIRST mutation, BEFORE any aggregation or grant", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    const order = [];
    WorldBossEvent.markSettled = jest.fn(async () => {
      order.push("claim");
      return true;
    });
    WorldBossLog.getDamageRank = jest.fn(async () => {
      order.push("aggregate");
      return [{ total_damage: 5000, user_id: 1, platform_id: "U1" }];
    });
    WorldBossRewardLog.tryInsert = jest.fn(async () => {
      order.push("grant");
      return true;
    });

    await SettlementService.settleEvent(7);

    expect(order[0]).toBe("claim");
    expect(order.indexOf("aggregate")).toBeLessThan(order.indexOf("grant"));
  });

  test("ranked players read platform_id off the row; resolveUserIds runs only for participation-only ids and skips unmapped", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    // numeric 1 & 2 landed damage and carry their own platform_id on the row.
    WorldBossLog.getDamageRank = jest.fn().mockResolvedValue([
      { total_damage: 5000, user_id: 1, platform_id: "U1" },
      { total_damage: 3000, user_id: 2, platform_id: "U2" },
    ]);
    // participants exactly match the ranked ids -> no participation-only remainder.
    WorldBossLog.getParticipants = jest.fn().mockResolvedValue([
      { user_id: 1, platform_id: "U1" },
      { user_id: 2, platform_id: "U2" },
    ]);
    WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());

    await SettlementService.settleEvent(7);

    // ranked players never need resolveUserIds for their grant identity.
    const inserted = WorldBossRewardLog.tryInsert.mock.calls.map(c => c[0].user_id);
    expect(inserted).toContain("U1");
    expect(inserted).toContain("U2");
    // unmapped ids never reach the ledger.
    expect(inserted).not.toContain(null);
    expect(inserted).not.toContain(undefined);
  });
});
```

- [ ] **Step 2: Run the test and confirm it FAILS** (module does not exist yet).
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn test -- __tests__/WorldBossSettlementService.settle.test.js
  ```
  Expected: `Cannot find module '../src/service/WorldBossSettlementService'` -> all tests fail.

- [ ] **Step 3: Write the minimal `settleEvent` skeleton (claim + aggregate + GATE).** Create `app/src/service/WorldBossSettlementService.js` with the FULL code below. `_computeFaucet` (Task 2) and the real grant trx + achievement/report (Task 3) follow; for now the loop grants with placeholder zeroed amounts so the claim/GATE/skip behavior is testable.

```js
const config = require("config");
const WorldBossEvent = require("../model/application/WorldBossEvent");
const WorldBossLog = require("../model/application/WorldBossLog");
const WorldBossRewardLog = require("../model/application/WorldBossRewardLog");
const { DefaultLogger } = require("../util/Logger");

const ENHANCEMENT_MATERIAL_ITEM_ID = 1001;

/**
 * Settle one world-boss event. Concurrency-safe: claims the settlement with an
 * atomic `UPDATE settled_at WHERE settled_at IS NULL` (markSettled) FIRST - only
 * the worker that gets affected===1 proceeds. Aggregates three boards by numeric
 * user.id (each ranked row already carries platform_id); participation-only ids
 * are resolved numeric->platform_id (GATE) before any grant. Reply-only: sets the
 * report unread flag via WorldBossReportService, never pushes.
 * @param {Number} eventId
 * @returns {Promise<void>}
 */
exports.settleEvent = async function (eventId) {
  // 1. join-free read (the JOINing find() collides id/status and breaks on a
  //    deleted template row - must NOT be used for lifecycle status reads).
  const event = await WorldBossEvent.findRaw(eventId);
  if (!event) {
    DefaultLogger.warn(`[WorldBossSettlement] settleEvent: event ${eventId} not found`);
    return;
  }

  // 2. ATOMIC CLAIM - the real concurrency guard. Two racing settleEvent calls:
  //    only one gets affected===1; the loser bails before any aggregation/grant.
  const claimed = await WorldBossEvent.markSettled(eventId);
  if (!claimed) {
    DefaultLogger.info(`[WorldBossSettlement] event ${eventId} already settled/claimed; skipping`);
    return;
  }

  // 3. aggregate three boards by NUMERIC user.id; each row carries platform_id.
  const dpsBoard = await WorldBossLog.getDamageRank({ eventId, limit: 100000 });
  const healerBoard = await WorldBossLog.getContributionRank({
    eventId,
    role: "healer",
    limit: 100000,
  });
  const tankBoard = await WorldBossLog.getContributionRank({
    eventId,
    role: "tank",
    limit: 100000,
  });

  // numeric user_id -> platform_id, read straight off the ranked rows.
  const idMap = new Map();
  const collect = rows => rows.forEach(r => idMap.set(r.user_id, r.platform_id));
  collect(dpsBoard);
  collect(healerBoard);
  collect(tankBoard);

  // 4. GATE - participation-only ids (none yet at the skeleton stage) are the only
  //    ones needing resolveUserIds; ranked players already have platform_id.
  const participationOnly = []; // populated in Task 2 from getParticipants set
  if (participationOnly.length > 0) {
    const resolved = await WorldBossLog.resolveUserIds(participationOnly);
    for (const [numericId, platformId] of resolved) idMap.set(numericId, platformId);
  }

  const isExpired = event.status === "expired";

  // faucet computed in Task 2; real grant trx in Task 3. Skeleton: grant zeroed.
  for (const [numericId, platformId] of idMap) {
    if (!platformId) {
      DefaultLogger.warn(
        `[WorldBossSettlement] event ${eventId}: numeric id ${numericId} has no platform_id; skipping`
      );
      continue;
    }
    await grantOne({
      eventId,
      platformId,
      materials: 0,
      stones: 0,
      board: "none",
      rank: null,
      isMvp: false,
    });
  }

  void config;
  void ENHANCEMENT_MATERIAL_ITEM_ID;
  void isExpired;
};

async function grantOne({ eventId, platformId, materials, stones, board, rank, isMvp }) {
  // replaced by the real idempotent per-user trx in Task 3.
  return WorldBossRewardLog.tryInsert({
    user_id: platformId,
    world_boss_event_id: eventId,
    materials,
    stones,
    board,
    rank,
    is_mvp: isMvp,
  });
}

exports._grantOne = grantOne;
```

- [ ] **Step 4: Run the test and confirm it PASSES.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn test -- __tests__/WorldBossSettlementService.settle.test.js
  ```
  Expected: 4 passing.

- [ ] **Step 5: Lint the new file.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn lint -- src/service/WorldBossSettlementService.js __tests__/WorldBossSettlementService.settle.test.js
  ```
  Expected: no errors (double quotes, es5 commas, <=100 cols).

- [ ] **Step 6: Commit.**
  ```
  cd /home/hanshino/workspace/redive_linebot && git add app/src/service/WorldBossSettlementService.js app/__tests__/WorldBossSettlementService.settle.test.js && git commit -m "feat(worldboss): settleEvent atomic claim + aggregation + identity GATE (M7)"
  ```

---

### Task 2 — `_computeFaucet`: percentile bands + shared-`getSupportRatio` scarcity premium + participation-only resolve

**Files:**
- Modify: `/home/hanshino/workspace/redive_linebot/app/src/service/WorldBossSettlementService.js` (add `_computeFaucet`; build the participation-only set from `getParticipants`; fetch `getSupportRatio`; wire all into `settleEvent`)
- Test: `/home/hanshino/workspace/redive_linebot/app/__tests__/WorldBossSettlementService.faucet.test.js`

**Interfaces:**
- *Consumes:* `config.get("worldboss.reward.*")`, the three boards from Task 1 (rows carry `user_id`/`platform_id`), `WorldBossLog.getParticipants(eventId)`, `WorldBossLog.getSupportRatio(eventId) => Promise<Number>` (lock §E / addendum §15 shared definition).
- *Produces (for Task 3):* `WorldBossSettlementService._computeFaucet({ dpsBoard, healerBoard, tankBoard, isExpired, supportRatio }) => { perUser: Map<numericId, { materials, stones, board, rank, isMvp }>, dpsMvpNumericId }`. Pure function (no I/O) so it's unit-testable in isolation; the live support ratio is fetched once by `settleEvent` and passed in.

Faucet rules:
- **Expired day** (`isExpired === true`): every participant gets `reward.expired_participation` (5) materials, no rank/MVP/stones.
- **Killed day:** base `reward.participation` (15) materials for everyone with ≥1 board row, PLUS a percentile-band bonus by rank within their best board: top 1% → `rank_bands.p1` (50), top 5% → `p5` (35), top 20% → `p20` (20), rest → `rest` (8). Bonus is ADDED to the 15 base.
- **Scarcity premium (D22, addendum §15 — uses the ONE shared `getSupportRatio`):** the healer/tank band bonus scales UP as the live support ratio → 0 (cold start). The 7:2:1 target ratio anchor means a healthy support share is `0.3` (3 support / 10 total). Multiplier = `clamp(SUPPORT_TARGET_SHARE / max(supportRatio, EPS), 1, 3)` (ratio at/above target ⇒ ×1, cold-start ratio→0 ⇒ ×3), applied to the band bonus only (not the base 15) for healer & tank board members, rounded to nearest int. This is the SAME `getSupportRatio` M5's enrage-pressure down-scaling consumes — no parallel proxy.
- **MVP:** rank-1 of each board gets `is_mvp=true`; the rank-1 of the **DPS** board additionally gets `reward.mvp_stones` (30) goddess stones (a POSITIVE grant — addendum §13) and is the `dpsMvpNumericId` fed to AchievementEngine's `isTopDamage`.

A player can appear on multiple boards; assign them to their single best board by highest score (DPS uses `total_damage`, healer/tank use `total_contribution`), so each player gets exactly one reward row.

- [ ] **Step 1: Write the failing faucet test.** Create `app/__tests__/WorldBossSettlementService.faucet.test.js`. (Rows use `user_id`/`platform_id` to match the M1 contract shape; `supportRatio` is passed in directly.)

```js
"use strict";

jest.mock("config");

const config = require("config");

const CFG = {
  "worldboss.reward.participation": 15,
  "worldboss.reward.expired_participation": 5,
  "worldboss.reward.rank_bands.p1": 50,
  "worldboss.reward.rank_bands.p5": 35,
  "worldboss.reward.rank_bands.p20": 20,
  "worldboss.reward.rank_bands.rest": 8,
  "worldboss.reward.mvp_stones": 30,
};

beforeEach(() => {
  jest.clearAllMocks();
  config.get = jest.fn(key => {
    if (key in CFG) return CFG[key];
    throw new Error(`unexpected config key ${key}`);
  });
});

const Settlement = require("../src/service/WorldBossSettlementService");

describe("_computeFaucet", () => {
  test("expired day: everyone gets expired_participation only, no rank/mvp/stones", () => {
    const out = Settlement._computeFaucet({
      dpsBoard: [{ user_id: 1, platform_id: "U1", total_damage: 9000 }],
      healerBoard: [{ user_id: 2, platform_id: "U2", total_contribution: 40 }],
      tankBoard: [],
      isExpired: true,
      supportRatio: 0.3,
    });
    const u1 = out.perUser.get(1);
    expect(u1).toEqual({ materials: 5, stones: 0, board: "dps", rank: null, isMvp: false });
    const u2 = out.perUser.get(2);
    expect(u2.materials).toBe(5);
    expect(u2.isMvp).toBe(false);
    expect(out.dpsMvpNumericId).toBeNull();
  });

  test("killed day: dps rank-1 gets base+p1 band + mvp stones, is dpsMvp", () => {
    // 100 dps players -> #1 top1% (p1), #2-5 top5% (p5), #6-20 top20% (p20), rest.
    const dpsBoard = [];
    for (let i = 0; i < 100; i++) {
      dpsBoard.push({ user_id: i + 1, platform_id: `U${i + 1}`, total_damage: (100 - i) * 10 });
    }
    const out = Settlement._computeFaucet({
      dpsBoard,
      healerBoard: [],
      tankBoard: [],
      isExpired: false,
      supportRatio: 0.3, // healthy -> no premium, but no support board here anyway
    });
    const top = out.perUser.get(1);
    expect(top.materials).toBe(15 + 50); // base + p1
    expect(top.stones).toBe(30); // dps mvp stones (positive grant)
    expect(top.isMvp).toBe(true);
    expect(top.rank).toBe(1);
    expect(out.dpsMvpNumericId).toBe(1);

    const second = out.perUser.get(2);
    expect(second.materials).toBe(15 + 35); // p5 band (rank 2 of 100 = top5%)
    expect(second.stones).toBe(0);
    expect(second.isMvp).toBe(false);

    const last = out.perUser.get(100);
    expect(last.materials).toBe(15 + 8); // rest band
  });

  test("scarcity premium uses shared getSupportRatio: at ratio->0 the healer band bonus is x3", () => {
    const dpsBoard = [];
    for (let i = 0; i < 30; i++) {
      dpsBoard.push({ user_id: i + 1, platform_id: `U${i + 1}`, total_damage: 100 });
    }
    const healerBoard = [
      { user_id: 201, platform_id: "U201", total_contribution: 50 }, // rank 1/2 -> p1=50
      { user_id: 202, platform_id: "U202", total_contribution: 10 }, // rank 2/2 -> rest=8
    ];
    // cold-start support ratio (almost no support actions) -> multiplier clamps to 3x.
    const out = Settlement._computeFaucet({
      dpsBoard,
      healerBoard,
      tankBoard: [],
      isExpired: false,
      supportRatio: 0.01,
    });
    const h1 = out.perUser.get(201);
    // base 15 + (band 50 * 3x scarcity) = 165, healer mvp (no stones - stones only dps)
    expect(h1.materials).toBe(15 + 150);
    expect(h1.board).toBe("healer");
    expect(h1.isMvp).toBe(true);
    expect(h1.stones).toBe(0);
    const h2 = out.perUser.get(202);
    expect(h2.materials).toBe(15 + 8 * 3); // rest band * 3x scarcity
  });

  test("healthy support ratio (>= target share) gives no premium (x1)", () => {
    const healerBoard = [{ user_id: 201, platform_id: "U201", total_contribution: 50 }];
    const out = Settlement._computeFaucet({
      dpsBoard: [{ user_id: 1, platform_id: "U1", total_damage: 100 }],
      healerBoard,
      tankBoard: [],
      isExpired: false,
      supportRatio: 0.5, // above the 0.3 target -> multiplier clamps to 1
    });
    // rank 1/1 healer -> p1=50 band, x1 -> base 15 + 50
    expect(out.perUser.get(201).materials).toBe(15 + 50);
  });

  test("multi-board player assigned to single best board", () => {
    // user 1 on dps (damage 1000) and healer (contribution 5) -> best = dps.
    const out = Settlement._computeFaucet({
      dpsBoard: [{ user_id: 1, platform_id: "U1", total_damage: 1000 }],
      healerBoard: [{ user_id: 1, platform_id: "U1", total_contribution: 5 }],
      tankBoard: [],
      isExpired: false,
      supportRatio: 0.3,
    });
    expect(out.perUser.size).toBe(1);
    expect(out.perUser.get(1).board).toBe("dps");
  });
});
```

- [ ] **Step 2: Run the test, confirm FAIL.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn test -- __tests__/WorldBossSettlementService.faucet.test.js
  ```
  Expected: `Settlement._computeFaucet is not a function`.

- [ ] **Step 3: Add `_computeFaucet` and wire it (plus `getSupportRatio` + the participation-only set) into `settleEvent`.** Insert the helpers into `WorldBossSettlementService.js` (after the `grantOne` export). FULL additions:

```js
// Healthy support share at the 7:2:1 target (3 support / 10 total) - the anchor
// for the D22 scarcity premium. Shared input is WorldBossLog.getSupportRatio.
const SUPPORT_TARGET_SHARE = 0.3;
const SUPPORT_RATIO_EPS = 0.001;

function bandForPercentile(rankIndex, total, bands) {
  // rankIndex is 0-based; percentile of position = (rankIndex+1)/total.
  const pct = (rankIndex + 1) / Math.max(total, 1);
  if (pct <= 0.01) return bands.p1;
  if (pct <= 0.05) return bands.p5;
  if (pct <= 0.2) return bands.p20;
  return bands.rest;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Scarcity multiplier for support boards (D22, addendum §15). Scales the band
 * bonus UP as the live support ratio -> 0 (cold start), x1 at/above the target
 * share, capped at x3. Consumes the SAME getSupportRatio M5 uses for enrage
 * down-scaling - no parallel proxy.
 * @param {Number} supportRatio
 * @returns {Number}
 */
function scarcityMultiplier(supportRatio) {
  return clamp(SUPPORT_TARGET_SHARE / Math.max(supportRatio, SUPPORT_RATIO_EPS), 1, 3);
}

/**
 * Pure faucet math. No I/O. Rows carry user_id (numeric); perUser keys on the
 * numeric id. supportRatio is supplied by settleEvent (WorldBossLog.getSupportRatio).
 * @returns {{ perUser: Map, dpsMvpNumericId: (Number|null) }}
 */
exports._computeFaucet = function ({ dpsBoard, healerBoard, tankBoard, isExpired, supportRatio }) {
  const participation = config.get("worldboss.reward.participation");
  const expiredParticipation = config.get("worldboss.reward.expired_participation");
  const bands = {
    p1: config.get("worldboss.reward.rank_bands.p1"),
    p5: config.get("worldboss.reward.rank_bands.p5"),
    p20: config.get("worldboss.reward.rank_bands.p20"),
    rest: config.get("worldboss.reward.rank_bands.rest"),
  };
  const mvpStones = config.get("worldboss.reward.mvp_stones");
  const supportMult = scarcityMultiplier(supportRatio);

  const perUser = new Map();
  let dpsMvpNumericId = null;

  // Assign each player to their single best board (highest score).
  const best = new Map(); // numericId -> { board, score, rankIndex, count }
  function consider(board, rows, scoreKey) {
    rows.forEach((r, i) => {
      const score = r[scoreKey] || 0;
      const prev = best.get(r.user_id);
      if (!prev || score > prev.score) {
        best.set(r.user_id, { board, score, rankIndex: i, count: rows.length });
      }
    });
  }
  consider("dps", dpsBoard, "total_damage");
  consider("healer", healerBoard, "total_contribution");
  consider("tank", tankBoard, "total_contribution");

  for (const [numericId, info] of best) {
    if (isExpired) {
      perUser.set(numericId, {
        materials: expiredParticipation,
        stones: 0,
        board: info.board,
        rank: null,
        isMvp: false,
      });
      continue;
    }

    const bandBonus = bandForPercentile(info.rankIndex, info.count, bands);
    let bonus = bandBonus;
    if (info.board === "healer" || info.board === "tank") {
      bonus = Math.round(bandBonus * supportMult);
    }
    const isMvp = info.rankIndex === 0;
    let stones = 0;
    if (info.board === "dps" && isMvp) {
      stones = mvpStones;
      dpsMvpNumericId = numericId;
    }
    perUser.set(numericId, {
      materials: participation + bonus,
      stones,
      board: info.board,
      rank: info.rankIndex + 1,
      isMvp,
    });
  }

  return { perUser, dpsMvpNumericId };
};
```

Then rewrite the body of `settleEvent` from the `isExpired` line onward (replacing the skeleton `participationOnly = []` block and the placeholder grant loop). The support ratio is fetched once and fed into `_computeFaucet`; the participation-only set is genuinely populated from `getParticipants` ids that never reached a ranked board row:

```js
  const isExpired = event.status === "expired";

  // shared support ratio (addendum §15) - the SAME value M5 uses for enrage
  // down-scaling; here it drives the D22 support-board scarcity premium.
  const supportRatio = await WorldBossLog.getSupportRatio(eventId);

  const { perUser, dpsMvpNumericId } = exports._computeFaucet({
    dpsBoard,
    healerBoard,
    tankBoard,
    isExpired,
    supportRatio,
  });

  // participation-only players: anyone with >=1 action (getParticipants) who never
  // reached a ranked board row. Their reward row is added at the base participation
  // tier, and their identity is resolved through the GATE (resolveUserIds skips
  // deleted accounts). Ranked players already carry platform_id in idMap.
  const participants = await WorldBossLog.getParticipants(eventId);
  const participationOnly = [];
  for (const p of participants) {
    if (!perUser.has(p.user_id)) {
      perUser.set(p.user_id, {
        materials: isExpired
          ? config.get("worldboss.reward.expired_participation")
          : config.get("worldboss.reward.participation"),
        stones: 0,
        board: "participation",
        rank: null,
        isMvp: false,
      });
    }
    if (!idMap.has(p.user_id)) {
      idMap.set(p.user_id, p.platform_id);
      if (!p.platform_id) participationOnly.push(p.user_id);
    }
  }
  if (participationOnly.length > 0) {
    const resolved = await WorldBossLog.resolveUserIds(participationOnly);
    for (const [numericId, platformId] of resolved) idMap.set(numericId, platformId);
  }

  const dpsMvpPlatformId = dpsMvpNumericId ? idMap.get(dpsMvpNumericId) : null;

  for (const [numericId, faucet] of perUser) {
    const platformId = idMap.get(numericId);
    if (!platformId) {
      DefaultLogger.warn(
        `[WorldBossSettlement] event ${eventId}: numeric id ${numericId} has no platform_id; skipping`
      );
      continue;
    }
    await grantOne({
      eventId,
      platformId,
      materials: faucet.materials,
      stones: faucet.stones,
      board: faucet.board,
      rank: faucet.rank,
      isMvp: faucet.isMvp,
    });
    void dpsMvpPlatformId; // wired to AchievementEngine in Task 3
  }
```

Also delete the now-obsolete trailing debug lines `void config;` and `void isExpired;` (both are genuinely used now). Keep `void ENHANCEMENT_MATERIAL_ITEM_ID;` only until Task 3 wires it.

> **Note on participation-only:** `getParticipants` returns `platform_id` directly off the JOIN, so a participant row whose `platform_id` is present is added to `idMap` immediately; only a row missing `platform_id` (an edge that should not normally occur, since `getParticipants` JOINs `user`) is pushed to `participationOnly` for an explicit `resolveUserIds` pass that skips deleted accounts. Task 1's GATE test asserts the skip-on-unmapped behavior; Task 4's non-tautological GATE forces a real unresolved participation-only id through. The call site stays so the GATE is wired, never dead.

- [ ] **Step 4: Run BOTH test files, confirm PASS.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn test -- __tests__/WorldBossSettlementService.faucet.test.js __tests__/WorldBossSettlementService.settle.test.js
  ```
  Expected: faucet 5 passing; settle 4 still passing (skeleton `grantOne` unchanged; the new `getParticipants` mock returns `[]` in the first three settle cases and the matching ids in the fourth, so no participation-only remainder leaks into the grant assertions).

- [ ] **Step 5: Lint.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn lint -- src/service/WorldBossSettlementService.js __tests__/WorldBossSettlementService.faucet.test.js
  ```

- [ ] **Step 6: Commit.**
  ```
  cd /home/hanshino/workspace/redive_linebot && git add app/src/service/WorldBossSettlementService.js app/__tests__/WorldBossSettlementService.faucet.test.js && git commit -m "feat(worldboss): faucet math + shared getSupportRatio scarcity premium + GATE wiring (M7)"
  ```

---

### Task 3 — Per-user idempotent grant transaction + D26 boss_top_damage + report unread flag

**Files:**
- Modify: `/home/hanshino/workspace/redive_linebot/app/src/service/WorldBossSettlementService.js` (rewrite `grantOne` as a per-user `mysql.transaction`; fire AchievementEngine with `isTopDamage`; call `WorldBossReportService.setUnread`)
- Test: `/home/hanshino/workspace/redive_linebot/app/__tests__/WorldBossSettlementService.grant.test.js`

**Interfaces:**
- *Consumes:* `mysql.transaction`, `WorldBossRewardLog.tryInsert(attrs, trx)`, `trx("Inventory").insert([{ userId, itemId, itemAmount, note }])` (positive NUMBER `itemAmount`), `inventory.increaseGodStone({ userId, amount, note, trx })`, `AchievementEngine.evaluate(platformId, "boss_attack", { feature, damage, isTopDamage })`, `WorldBossReportService.setUnread(platformId)`, `ENHANCEMENT_MATERIAL_ITEM_ID`.
- *Produces:* finalized `settleEvent` grant path. (Settlement is already CLAIMED in Task 1 via `markSettled`; there is NO settled-stamp here — `settled_at` is owned solely by `markSettled`, per lock §E.)

**Idempotency contract (reviewer-critical):** each player's grant runs in its OWN `mysql.transaction` (NOT one batch trx). Per-user order: (1) `WorldBossRewardLog.tryInsert(..., trx)` FIRST — if it returns `false` (dup), `return` from the trx callback with NO ledger write; (2) only if `true`, insert the materials ledger row (positive NUMBER `itemAmount` — addendum §13 grant sign), then stones if `>0`; (3) any throw rolls back ONLY that user's trx. Because the reward-log unique key dedupes, **re-running `settleEvent` re-grants only un-granted users** — a crash mid-loop leaves earlier users granted and is safely resumed by a re-run. (This is why settlement is re-runnable rather than whole-batch atomic.)

> **`insertItems` has NO trx parameter** (verified — `inventory.insertItems(params) => mysql.into("Inventory").insert(params)`). To stay inside the per-user trx, insert the material ledger row directly with the trx-bound builder: `trx("Inventory").insert([{ userId, itemId, itemAmount, note }])` with `itemAmount` a positive NUMBER (matching `increaseGodStone`'s `itemAmount: amount` numeric convention; addendum §13: grants are positive). `increaseGodStone` DOES accept `trx` (`const db = trx ? trx(this.table) : this.knex`) — use it for stones.

> **D26 boss_top_damage (addendum §14 — this is M7's deliverable; M9 only references the bug):** the achievement fires per granted player with `isTopDamage = (platformId === dpsMvpPlatformId)`. `boss_top_damage` is registered under `boss_attack` in `AchievementEngine` (`src/service/AchievementEngine.js:84-88`; the closure at `:179` reads `ctx.isTopDamage`), so this is the actual repair. The live attack path already calls `AchievementEngine.evaluate(userId, "boss_attack", {...})` (`WorldBossController.js:553`) — settlement reuses the same event type with `isTopDamage`. Achievements run OUTSIDE the per-user grant trx — best-effort, never block or roll back the ledger; notifications surface on the next pull (NO push).

> **No settled-stamp here (lock §E).** Settlement was already claimed atomically in Task 1 (`markSettled`, the only writer of `settled_at`). There is no second status/stamp write after the grant loop; the only post-loop side effect is the completion log.

- [ ] **Step 1: Write the failing grant test.** Create `app/__tests__/WorldBossSettlementService.grant.test.js`:

```js
"use strict";

jest.mock("../src/model/application/WorldBossEvent");
jest.mock("../src/model/application/WorldBossLog");
jest.mock("../src/model/application/WorldBossRewardLog");
jest.mock("../src/model/application/Inventory");
jest.mock("../src/service/AchievementEngine");
jest.mock("../src/service/WorldBossReportService");
jest.mock("../src/util/mysql");

const WorldBossEvent = require("../src/model/application/WorldBossEvent");
const WorldBossLog = require("../src/model/application/WorldBossLog");
const WorldBossRewardLog = require("../src/model/application/WorldBossRewardLog");
const { inventory } = require("../src/model/application/Inventory");
const AchievementEngine = require("../src/service/AchievementEngine");
const WorldBossReportService = require("../src/service/WorldBossReportService");
const mysql = require("../src/util/mysql");
const Settlement = require("../src/service/WorldBossSettlementService");

function makeTrx() {
  const insert = jest.fn().mockResolvedValue([1]);
  const trx = jest.fn(() => ({ insert }));
  trx.__insert = insert;
  return trx;
}

let lastTrx;

beforeEach(() => {
  jest.clearAllMocks();
  lastTrx = makeTrx();
  mysql.transaction = jest.fn(async cb => cb(lastTrx));
  WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
    id: 7,
    status: "killed",
    settled_at: null,
  });
  WorldBossEvent.markSettled = jest.fn().mockResolvedValue(true);
  WorldBossEvent.casStatus = jest.fn().mockResolvedValue(true);
  WorldBossLog.getDamageRank = jest
    .fn()
    .mockResolvedValue([{ user_id: 1, total_damage: 5000, platform_id: "U1" }]);
  WorldBossLog.getContributionRank = jest.fn().mockResolvedValue([]);
  WorldBossLog.getParticipants = jest
    .fn()
    .mockResolvedValue([{ user_id: 1, platform_id: "U1" }]);
  WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());
  WorldBossLog.getSupportRatio = jest.fn().mockResolvedValue(0.3);
  WorldBossRewardLog.tryInsert = jest.fn().mockResolvedValue(true);
  inventory.increaseGodStone = jest.fn().mockResolvedValue([1]);
  AchievementEngine.evaluate = jest.fn().mockResolvedValue({ unlocked: [] });
  WorldBossReportService.setUnread = jest.fn().mockResolvedValue(undefined);
});

describe("settleEvent - per-user grant trx + achievement + unread flag", () => {
  test("dps mvp: reward-log first, then material ledger (number itemAmount), then stones, in one trx", async () => {
    await Settlement.settleEvent(7);

    expect(WorldBossRewardLog.tryInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "U1",
        world_boss_event_id: 7,
        is_mvp: true,
        board: "dps",
        rank: 1,
      }),
      lastTrx
    );
    // material ledger via trx-bound builder; item 1001; positive NUMBER amount.
    expect(lastTrx).toHaveBeenCalledWith("Inventory");
    const insertedRows = lastTrx.__insert.mock.calls[0][0];
    expect(insertedRows[0]).toEqual(
      expect.objectContaining({
        userId: "U1",
        itemId: 1001,
        note: "world_boss_reward",
      })
    );
    expect(typeof insertedRows[0].itemAmount).toBe("number");
    expect(insertedRows[0].itemAmount).toBeGreaterThan(0);
    // mvp stones via increaseGodStone with trx (positive grant).
    expect(inventory.increaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "U1", amount: 30, note: "world_boss_mvp", trx: lastTrx })
    );
  });

  test("duplicate reward-log (tryInsert=false) skips all ledger writes for that user", async () => {
    WorldBossRewardLog.tryInsert.mockResolvedValue(false);
    await Settlement.settleEvent(7);
    expect(lastTrx).not.toHaveBeenCalled(); // no Inventory insert
    expect(inventory.increaseGodStone).not.toHaveBeenCalled();
  });

  test("settlement is claimed via markSettled; D26 achievement fires with isTopDamage; report flag set", async () => {
    await Settlement.settleEvent(7);
    expect(WorldBossEvent.markSettled).toHaveBeenCalledWith(7);
    expect(AchievementEngine.evaluate).toHaveBeenCalledWith(
      "U1",
      "boss_attack",
      expect.objectContaining({ feature: "world_boss", isTopDamage: true })
    );
    expect(WorldBossReportService.setUnread).toHaveBeenCalledWith("U1");
  });
});
```

- [ ] **Step 2: Run, confirm FAIL.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn test -- __tests__/WorldBossSettlementService.grant.test.js
  ```
  Expected: fails — `WorldBossReportService.setUnread` not called, no trx-bound ledger insert, no AchievementEngine call (skeleton `grantOne` only calls `tryInsert`).

- [ ] **Step 3: Rewrite `grantOne` as a per-user transaction and finalize the grant loop.** Add the `mysql`, `inventory`, `AchievementEngine`, `WorldBossReportService` requires at the top, replace `grantOne`, and replace the in-loop `void dpsMvpPlatformId;` with the real achievement + flag calls.

Add to the require block at the top of the file (alongside the existing requires):
```js
const mysql = require("../util/mysql");
const { inventory } = require("../model/application/Inventory");
const AchievementEngine = require("./AchievementEngine");
const WorldBossReportService = require("./WorldBossReportService");
```

Replace the entire `grantOne` function (and its `exports._grantOne`) with:
```js
/**
 * Grant one player's reward in its OWN transaction. Idempotency: reward-log
 * tryInsert is the FIRST write and the dedupe key - a dup (false) short-circuits
 * before any ledger write; any throw rolls back ONLY this user's trx. settleEvent
 * is therefore re-runnable: a re-run re-grants only un-granted users (the unique
 * key on world_boss_reward_log dedupes the rest). itemAmount is a positive NUMBER
 * (addendum §13 - grants are positive; matching increaseGodStone's convention).
 */
async function grantOne({ eventId, platformId, materials, stones, board, rank, isMvp }) {
  await mysql.transaction(async trx => {
    const inserted = await WorldBossRewardLog.tryInsert(
      {
        user_id: platformId,
        world_boss_event_id: eventId,
        materials,
        stones,
        board,
        rank,
        is_mvp: isMvp,
      },
      trx
    );
    if (!inserted) return; // duplicate - already granted; no ledger writes.

    if (materials > 0) {
      // insertItems has NO trx param; use the trx-bound builder. itemId 1001 is
      // registered by M3/M4's seeded item-master migration (M7 only grants it).
      await trx("Inventory").insert([
        {
          userId: platformId,
          itemId: ENHANCEMENT_MATERIAL_ITEM_ID,
          itemAmount: materials,
          note: "world_boss_reward",
        },
      ]);
    }
    if (stones > 0) {
      await inventory.increaseGodStone({
        userId: platformId,
        amount: stones,
        note: "world_boss_mvp",
        trx,
      });
    }
  });
}
```

Remove the now-unused `void ENHANCEMENT_MATERIAL_ITEM_ID;` line from `settleEvent` (the constant is now genuinely used by `grantOne`).

Inside the grant loop, replace the `void dpsMvpPlatformId;` line (after the `await grantOne({...})` call) with the real best-effort D26 achievement + unread-flag calls. These run OUTSIDE the per-user grant trx — achievements / report flag are best-effort and never block or roll back the ledger:
```js
    // best-effort, non-transactional: D26 boss_top_damage repair + report unread
    // flag (M8's WorldBossReportService). NO LINE push - surfaces on next reply /
    // LIFF pull.
    const userDamage = dpsBoard.find(r => r.user_id === numericId);
    await AchievementEngine.evaluate(platformId, "boss_attack", {
      feature: "world_boss",
      damage: userDamage ? userDamage.total_damage : 0,
      isTopDamage: platformId === dpsMvpPlatformId,
    });
    await WorldBossReportService.setUnread(platformId);
```

After the loop closes, add the completion log. There is NO settled-stamp call here — settlement was claimed in Task 1:
```js
  DefaultLogger.info(
    `[WorldBossSettlement] settled event ${eventId}: ${perUser.size} participants`
  );
```

- [ ] **Step 4: Run ALL three test files, confirm PASS.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn test -- __tests__/WorldBossSettlementService.grant.test.js __tests__/WorldBossSettlementService.faucet.test.js __tests__/WorldBossSettlementService.settle.test.js
  ```
  Expected: grant 3, faucet 5, settle 4 — all passing. (Task-1's GATE/skip assertions still hold: `grantOne` only runs for ids resolved to a platformId.)

- [ ] **Step 5: Lint.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn lint -- src/service/WorldBossSettlementService.js __tests__/WorldBossSettlementService.grant.test.js
  ```

- [ ] **Step 6: Commit.**
  ```
  cd /home/hanshino/workspace/redive_linebot && git add app/src/service/WorldBossSettlementService.js app/__tests__/WorldBossSettlementService.grant.test.js && git commit -m "feat(worldboss): per-user idempotent grant trx + D26 boss_top_damage + report flag (M7)"
  ```

---

### Task 4 — Verification pass: non-tautological GATE + idempotency under retry

**Files:**
- Test: `/home/hanshino/workspace/redive_linebot/app/__tests__/WorldBossSettlementService.idempotent.test.js`

**Interfaces:**
- *Consumes:* the finished `settleEvent` (Tasks 1–3) and the verified M1 `getDamageRank`/`getParticipants`/`resolveUserIds`/`getSupportRatio` contract.
- *Produces:* evidence (re-run safety + a NON-tautological GATE proof) that the M7 deliverable satisfies the idempotency + identity constraints. No production code changes; if a test fails, fix the offending Task and re-run.

This is the evidence-gathering task the global verification protocol requires. Two proofs:
1. **Idempotency under retry:** calling `settleEvent` twice grants each user exactly once (the per-user reward-log unique key dedupes; the second run is also blocked at the `markSettled` claim).
2. **NON-tautological GATE:** the meaningful GATE case is a **participation-only** id (no ranked row, and a `getParticipants` row whose `platform_id` is missing — a deleted account) that fails to resolve. The ranked id carries `platform_id` straight off the aggregation row (the verified M1 `getDamageRank` shape, lock §E), so it is granted WITHOUT the resolver. The participation-only id is FORCED through `resolveUserIds`, which returns an empty Map (deleted account, skipped per lock §B / addendum §4), and must be skipped — the numeric-vs-platform distinction is real, so the skip proves the GATE rather than the loop's own guard.
   - **Cross-milestone note (M1 owns the other half):** M1 ships a companion test proving `getDamageRank`/`getContributionRank` genuinely SELECT `world_boss_event_log.user_id` (numeric) JOINed to `user.platform_id`, and that `resolveUserIds` skips ids with no `user` row. Until those M1 tests pass, the end-to-end GATE is marked UNVERIFIED.

- [ ] **Step 1: Write the idempotency + non-tautological GATE test.** Create `app/__tests__/WorldBossSettlementService.idempotent.test.js`:

```js
"use strict";

jest.mock("../src/model/application/WorldBossEvent");
jest.mock("../src/model/application/WorldBossLog");
jest.mock("../src/model/application/WorldBossRewardLog");
jest.mock("../src/model/application/Inventory");
jest.mock("../src/service/AchievementEngine");
jest.mock("../src/service/WorldBossReportService");
jest.mock("../src/util/mysql");

const WorldBossEvent = require("../src/model/application/WorldBossEvent");
const WorldBossLog = require("../src/model/application/WorldBossLog");
const WorldBossRewardLog = require("../src/model/application/WorldBossRewardLog");
const { inventory } = require("../src/model/application/Inventory");
const AchievementEngine = require("../src/service/AchievementEngine");
const WorldBossReportService = require("../src/service/WorldBossReportService");
const mysql = require("../src/util/mysql");
const Settlement = require("../src/service/WorldBossSettlementService");

// Simulate the unique-key behaviour of world_boss_reward_log across runs.
const granted = new Set();

function makeTrx() {
  return jest.fn(() => ({ insert: jest.fn().mockResolvedValue([1]) }));
}

beforeEach(() => {
  jest.clearAllMocks();
  granted.clear();
  mysql.transaction = jest.fn(async cb => cb(makeTrx()));
  WorldBossLog.getContributionRank = jest.fn().mockResolvedValue([]);
  WorldBossLog.getSupportRatio = jest.fn().mockResolvedValue(0.3);
  WorldBossRewardLog.tryInsert = jest.fn(async ({ user_id }) => {
    const key = `${user_id}:7`;
    if (granted.has(key)) return false;
    granted.add(key);
    return true;
  });
  inventory.increaseGodStone = jest.fn().mockResolvedValue([1]);
  AchievementEngine.evaluate = jest.fn().mockResolvedValue({ unlocked: [] });
  WorldBossReportService.setUnread = jest.fn().mockResolvedValue(undefined);
});

describe("settleEvent idempotency under retry", () => {
  test("two consecutive settleEvent runs grant each user exactly once", async () => {
    // markSettled returns true only the FIRST time (real atomic-claim behaviour).
    let claimed = false;
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    WorldBossEvent.markSettled = jest.fn(async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    });
    WorldBossLog.getDamageRank = jest.fn().mockResolvedValue([
      { user_id: 1, total_damage: 5000, platform_id: "U1" },
      { user_id: 2, total_damage: 3000, platform_id: "U2" },
    ]);
    WorldBossLog.getParticipants = jest.fn().mockResolvedValue([
      { user_id: 1, platform_id: "U1" },
      { user_id: 2, platform_id: "U2" },
    ]);
    WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());

    await Settlement.settleEvent(7);
    await Settlement.settleEvent(7); // second run blocked at the markSettled claim.

    // U1 (dps mvp) gets stones exactly once; U2 (non-mvp) never.
    const u1Stones = inventory.increaseGodStone.mock.calls.filter(c => c[0].userId === "U1");
    expect(u1Stones.length).toBe(1);
    const u2Stones = inventory.increaseGodStone.mock.calls.filter(c => c[0].userId === "U2");
    expect(u2Stones.length).toBe(0);
    // second run did not re-enter the grant loop at all.
    expect(WorldBossEvent.markSettled).toHaveBeenCalledTimes(2);
    expect(WorldBossLog.getDamageRank).toHaveBeenCalledTimes(1); // only the first (claimed) run
  });

  test("NON-tautological GATE: a participation-only numeric id that fails to resolve never reaches the ledger", async () => {
    WorldBossEvent.findRaw = jest.fn().mockResolvedValue({
      id: 7,
      status: "killed",
      settled_at: null,
    });
    WorldBossEvent.markSettled = jest.fn().mockResolvedValue(true);
    // Ranked row carries platform_id directly - resolves trivially (by design).
    WorldBossLog.getDamageRank = jest.fn().mockResolvedValue([
      { user_id: 1, total_damage: 5000, platform_id: "U1" },
    ]);
    // A participation-only id 99 with NO platform_id (deleted account). It is not on
    // any ranked board, so the service must resolve it via resolveUserIds - which
    // returns an EMPTY Map (skipped per lock §B / addendum §4) -> 99 stays unmapped.
    WorldBossLog.getParticipants = jest.fn().mockResolvedValue([
      { user_id: 1, platform_id: "U1" },
      { user_id: 99, platform_id: null },
    ]);
    WorldBossLog.resolveUserIds = jest.fn().mockResolvedValue(new Map());

    await Settlement.settleEvent(7);

    // resolveUserIds was called for the participation-only remainder (id 99).
    expect(WorldBossLog.resolveUserIds).toHaveBeenCalledWith(expect.arrayContaining([99]));
    const inserted = WorldBossRewardLog.tryInsert.mock.calls.map(c => c[0].user_id);
    // ranked U1 granted; unresolved 99 skipped - NOT keyed on the raw numeric id.
    expect(inserted).toContain("U1");
    expect(inserted).not.toContain(99);
    expect(inserted).not.toContain("99");
    expect(inserted).not.toContain(null);
    expect(inserted).not.toContain(undefined);
  });
});
```

> **Why this GATE is non-tautological:** the ranked id (`user_id:1`) carries its own `platform_id:"U1"` straight off the aggregation row — exactly the verified M1 `getDamageRank` shape (lock §E) — so it is granted WITHOUT needing the resolver. The id that exercises the GATE (`99`) is a participation-only id whose `getParticipants` row has a NULL `platform_id` (a deleted account); the service is FORCED to call `resolveUserIds([99])`, gets an empty Map (skipped per lock §B / addendum §4), and must skip it. The numeric-vs-platform distinction is real (99 has only a numeric id), so the skip proves the GATE, not the loop's own guard. The upstream half — that `getDamageRank` truly returns numeric `user_id` distinct from `platform_id`, and `resolveUserIds` skips deleted accounts — is pinned by M1's companion tests (referenced above).

- [ ] **Step 2: Run, confirm PASS** (these exercise existing Task 1–3 behavior).
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn test -- __tests__/WorldBossSettlementService.idempotent.test.js
  ```
  Expected: 2 passing. If FAIL, the defect is in Task 3's `grantOne` (dup short-circuit), Task 1's `markSettled` claim guard, or the Task-2 participation-only resolve wiring — fix there, re-run.

- [ ] **Step 3: Run the entire M7 test set as the final verification gate.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn test -- __tests__/WorldBossSettlementService.settle.test.js __tests__/WorldBossSettlementService.faucet.test.js __tests__/WorldBossSettlementService.grant.test.js __tests__/WorldBossSettlementService.idempotent.test.js
  ```
  Expected: settle 4, faucet 5, grant 3, idempotent 2 — all green. Record this output as the M7 completion evidence.

- [ ] **Step 4: Lint then commit.**
  ```
  cd /home/hanshino/workspace/redive_linebot/app && yarn lint -- __tests__/WorldBossSettlementService.idempotent.test.js
  cd /home/hanshino/workspace/redive_linebot && git add app/__tests__/WorldBossSettlementService.idempotent.test.js && git commit -m "test(worldboss): settlement idempotency-under-retry + non-tautological GATE (M7)"
  ```

---

**M7 hand-off notes for downstream milestones / reviewers:**
- `WorldBossSettlementService.{settleEvent, _computeFaucet, grantOne}` is the ONLY M7 deliverable. M6's `WorldBossLifecycleService.advance`/`createDailyBoss` call `require("./WorldBossSettlementService").settleEvent(eventId)`; M8's report card (`WorldBossReportService` reads `world_boss_reward_log` and the unread flag this milestone sets via `WorldBossReportService.setUnread`) and M10's cold-start gate consume the granted rows. M7 OWNS NO cron, NO `createDailyBoss`, NO `WorldBossLifecycleService`, NO `bin/WorldBossAdvance.js`, NO crontab entry — those are M6's (lock §A/§G, addendum §12).
- **Settlement is claimed, not self-CAS'd (lock §E).** The concurrency guard is `WorldBossEvent.markSettled(eventId)` (atomic `UPDATE settled_at WHERE settled_at IS NULL`, proceed iff `affected===1`) run as the FIRST mutation. `settled_at` has exactly one writer (`markSettled`); there is no second settled-stamp after the grant loop. Reviewers: reject any settled-stamp via a from==to CAS.
- **Lifecycle reads are join-free.** `settleEvent` reads via `WorldBossEvent.findRaw` (M1), NEVER the JOINing `find()` (which `worldBoss(query).join(...).first()` collides `id`/`status` with `world_boss` and returns `undefined` on a deleted template row).
- **No `remain_hp` (addendum §6).** HP is dynamic (`world_boss.hp - SUM(world_boss_event_log.damage)`); settlement reads no HP column. Whether the event was killed or expired is read from `event.status` off the join-free row.
- **Identity (lock §B / addendum §4).** Ranked players' `platform_id` is read straight off the M1 `getDamageRank`/`getContributionRank` rows (`{ user_id /*numeric*/, platform_id, total_* }`). `resolveUserIds` runs ONLY for participation-only ids whose `getParticipants` row lacked a `platform_id`, skips deleted-account ids (no `user` row), and unmapped ids are skipped with a warning (Task 1 + Task 4 non-tautological GATE). M1's companion tests prove `getDamageRank` returns numeric `user_id` distinct from `platform_id` and that `resolveUserIds` skips deleted accounts; until they pass the end-to-end GATE is UNVERIFIED.
- **Scarcity premium uses the ONE shared `getSupportRatio` (lock §E / addendum §15).** D22's support-board reward premium consumes `WorldBossLog.getSupportRatio(eventId)` — the SAME definition M5 uses for D30 enrage-pressure down-scaling. No parallel `dpsCount/boardCount` proxy. The multiplier scales the band bonus UP as the ratio → 0 (cold start, capped ×3) and is ×1 at/above the 0.3 target share (7:2:1 anchor).
- **D26 boss_top_damage repair is M7's (addendum §14).** Settlement fires `AchievementEngine.evaluate(platformId, "boss_attack", { feature:"world_boss", damage, isTopDamage })` with `isTopDamage = (platformId === dpsMvpPlatformId)`. `boss_top_damage` is registered under `boss_attack` (`AchievementEngine.js:84-88`; closure reads `ctx.isTopDamage` at `:179`). M9 only references the bug; M7 implements the fix.
- **Report surfaced via M8's single writer (lock §F).** Settlement calls `WorldBossReportService.setUnread(platformId)` — the ONE report-unread writer (created in M8). M7 does NOT call a `worldBossRedis.setReportUnread` (no such export). NO LINE push; the report surfaces on the player's next reply / LIFF pull.
- **Ledger signs (addendum §13):** every settlement grant is POSITIVE — materials via `trx("Inventory").insert([{ userId, itemId:1001, itemAmount:<positive number>, note:"world_boss_reward" }])`, stones via `inventory.increaseGodStone({ amount:<positive>, trx, ... })`. There is no negative/decrement in settlement; reviewers should not expect one.
- **Idempotency / transaction granularity:** each per-user grant is its OWN `mysql.transaction` with `WorldBossRewardLog.tryInsert` as the FIRST write/dedupe key. There is NO whole-batch rollback — `settleEvent` is safely re-runnable (a crash mid-loop resumes cleanly; a second full run is blocked at `markSettled`).
- **Item id 1001 registration is NOT M7's (M3/M4 ownership, addendum §10):** M7 grants `ENHANCEMENT_MATERIAL_ITEM_ID=1001` into the `Inventory` ledger with `note:"world_boss_reward"`. M3/M4 OWNS registering 1001 in the item-master / `GachaPool` table (seeded migration) so `Inventory.getAllUserOwn`'s `.join("GachaPool","GachaPool.ID","itemId")` resolves; if 1001 is intentionally display-excluded, M3/M4 documents the tolerant read path. M7 references but does not define the item.
- **D22 deferral (lock §H):** the first-two-weeks healer/tank role-swap migration bonus is consciously DEFERRED out of v1 — no task; the 7:2:1 anchor + `getSupportRatio` scarcity premium cover role rebalancing.

---

## Milestone M8: Realtime + LIFF + UX surfaces

**Goal:** Expose the World Boss as a live experience — a debounced Socket.IO `/world-boss` snapshot broadcast (~2-4 Hz), a player-gated REST surface that hits the SAME `WorldBossCombatService` (M5) the LINE commands use, a once-per-event battle-report card that rides the next interaction, and a LIFF page with an HP bar, three contribution boards, a role-gated action row, a scrolling feed and an enrage flash banner — all reply-only / pull-based / socket-pushed-to-already-connected-clients (NO LINE Push, GC#1).

**THREE VERIFIED GROUND-TRUTH FACTS this milestone depends on (addendum §1/§4/§6, re-confirmed against real source — do NOT regress them):**

1. **Identity (addendum §4 — the GATE).** `world_boss_event_log.user_id` is the INTERNAL numeric `user.id` (migration `20211019095909`). To get numeric `user.id` from a platform_id you query the `user` table — `UserModel.getId(platformId)` (verified `app/src/model/application/UserModel.js:8` → `SELECT id FROM user WHERE platform_id=?`, returns `user.id` or `null`). **DO NOT** use `MinigameService.findByUserId(platformId).id` — that is `minigame_level.id` (the minigame row PK, verified `app/src/service/MinigameService.js:5` re-exports `MinigameLevel.findByUserId`), NOT `user.id`. Use the minigame row ONLY for `level` (damage driver, GC#6). Writing `minigame_level.id` into the combat call corrupts every REST-driven action's attribution and drops/misroutes settlement rewards.

2. **Boards carry numeric + platform id (addendum §4 + global blocker).** M6's `getDamageRank` / `getContributionRank` do NOT reuse `getTopRank`'s lone `userId`-aliased-platform_id (verified `WorldBossLog.js:158-164`: `getTopRank` selects ONLY `user.platform_id AS userId`). They SELECT both `world_boss_event_log.user_id AS numericUserId` and `user.platform_id AS platformId`, GROUP BY `user_id`, JOINing `user` (skipping deleted-account rows). So every board row this milestone consumes is `{ total_damage|total_contribution, numericUserId, platformId }`. The snapshot/feed/status text render `platformId` (never a raw numeric DB id), and the feed carries an optional custom `message` (D23/D28).

3. **No `remain_hp` column (addendum §6).** Verified `app/migrations/20211019082725_create_world_boss.js` defines only `hp/attack/defense/speed/luck/exp/gold`; `world_boss_event` has no `remain_hp`. Live remaining HP = `boss.hp − SUM(damage)` via `WorldBossEventLogService.getRemainHpByEventId(eventId)` (= `WorldBossLog.getTotalDamageByEventId`, verified `WorldBossEventLogService.js:19` / `WorldBossLog.js:146`, returns `{ total_damage }`). `hpPct = round((hp − totalDamage)/hp*100)`. Phase = HP% vs `world_boss.speed` (dead-column enrage-threshold %, addendum §7) with `config.worldboss.enrage_threshold_pct` fallback when 0/null. `buildSnapshot` NEVER reads `event.remain_hp`.

**HARD PREREQUISITE — M3 config block.** Several M8 modules read `config.get("worldboss.*")` (`enrage_recent_minutes`, `enrage_threshold_pct`). M3 owns adding the `worldboss.*` block to `app/config/default.json`. M8 MUST NOT re-add config keys, and **every M8 module reads `config.get(...)` LAZILY inside its functions — never at module top level** — so requiring an M8 module (and therefore `socket.js`, which requires the broadcast service) never throws at import time and tests can mock `config` without the full global shape.

**`getActive()` shape contract (consumed from M6).** `WorldBossEvent.getActive()` returns the active `world_boss_event` row JOINed to its `world_boss` template, aliasing the event PK as `id` and exposing the template's `hp` and dead-column `speed` (M6 must alias `world_boss_event.id AS id` because the existing `worldBoss()` JOIN does `select("*")` and `world_boss.id` would otherwise clobber the event id — verified `WorldBossEvent.js:84`). M8 treats the `eventId` argument as the source of truth for the room/query and uses `event.hp`/`event.speed` from the joined row; it never relies on a possibly-clobbered `event.id` for equality. If no active boss, `getActive()` resolves `null`.

---

### Task 1 — Redis key helpers for broadcast snapshot + report-unread flag

These two keys (`wb:snapshot:{eventId}`, `wb:report_unread:{platformId}`) are M8-owned per the contract's Redis-key table (addendum §10: M5 owns `wb:pool`/`wb:shield`/`wb:block`). We add the two M8 accessors to the shared helper module so M5 and M8 import key builders from one place. **`reportUnreadKey` is the single canonical key builder for the report-unread flag — M7 settlement, the M8 report service, and any reader MUST go through it (see Task 4 single-writer note).** Note the flag key is keyed by `platformId` (the report card surfaces at the LINE layer where platform_id is known), distinct from the numeric-id-keyed combat keys M5 owns.

**Files:**
- Modify: `app/src/util/worldBossRedis.js` (created by M5 — append the two M8 key builders; if M5 has not landed yet, create the file with ONLY these two exports and M5 will add its keys to the same `module.exports`).
- Test: `app/src/util/__tests__/worldBossRedis.test.js` (append M8 cases; create file if absent).

**Interfaces:**
- Produces (consumed by Task 2 broadcast, Task 4 report service, M7 settlement):
  ```js
  exports.snapshotKey = (eventId) => `wb:snapshot:${eventId}`;             // STRING cached snapshot
  exports.reportUnreadKey = (platformId) => `wb:report_unread:${platformId}`; // STRING "1" flag
  ```

**Steps:**

- [ ] **Step 1: Write the failing test.** No mocks needed — pure string builders. Create/append `app/src/util/__tests__/worldBossRedis.test.js`:
  ```js
  const wbRedis = require("../worldBossRedis");

  describe("worldBossRedis M8 key helpers", () => {
    it("snapshotKey embeds the eventId", () => {
      expect(wbRedis.snapshotKey(42)).toBe("wb:snapshot:42");
    });

    it("reportUnreadKey embeds the platformId", () => {
      expect(wbRedis.reportUnreadKey("Ualice")).toBe("wb:report_unread:Ualice");
    });
  });
  ```

- [ ] **Step 2: Run it and watch it FAIL.** `cd app && yarn test -- src/util/__tests__/worldBossRedis.test.js`. Expected FAIL: `TypeError: wbRedis.snapshotKey is not a function` (or `Cannot find module '../worldBossRedis'` if M5 has not created it yet).

- [ ] **Step 3: Implement the helpers.** If the file does not exist, create `app/src/util/worldBossRedis.js`:
  ```js
  exports.snapshotKey = (eventId) => `wb:snapshot:${eventId}`;
  exports.reportUnreadKey = (platformId) => `wb:report_unread:${platformId}`;
  ```
  If M5 already created the file, append exactly those two `exports.` lines (do not touch M5's `poolKey`/`shieldKey`/`blockKey` or the addendum §10 helpers `addToPool`/`popOldest`/`isKnockedDown`/`recoverIfExpired`/`openBlockWindow`/`consumeBlockSlot`/`setShield`/`consumeShield`).

- [ ] **Step 4: Run it and watch it PASS.** `cd app && yarn test -- src/util/__tests__/worldBossRedis.test.js`. Expected: `2 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/util/worldBossRedis.js app/src/util/__tests__/worldBossRedis.test.js
  git commit -m "feat(worldboss): add snapshot + report-unread redis key helpers (M8)"
  ```

---

### Task 2 — `WorldBossBroadcastService`: debounced snapshot builder + emitter

The broadcast is debounced (~2-4 Hz = at most one emit every 250 ms per event), NOT per-action (D23). Combat actions call `requestBroadcast(eventId)`; the service coalesces a burst into a single `buildSnapshot` + `io.of("/world-boss").to(room).emit("snapshot", …)`. Enrage is a separate one-shot `emitEnrage`.

**HP is computed, not read (fact #3).** `buildSnapshot(eventId)` reads the active event (joined template gives `boss.hp` + dead-column `speed`), sums damage via `WorldBossEventLogService.getRemainHpByEventId(eventId)` → `{ total_damage }`, and derives `hpPct = max(0, round((boss.hp − totalDamage)/boss.hp*100))`. **No `remain_hp` column exists.**

**Boards & feed carry platform identity (fact #2).** `getDamageRank` / `getContributionRank` rows are `{ total_damage|total_contribution, numericUserId, platformId }`; `getRecentAttackers` rows are `{ user_id, platformId, message }` (M6 JOINs `user` + LEFT-JOINs the custom attack-message source per D28 — `message` may be `null`). The snapshot passes these through verbatim so the client renders `platformId`/`message`, never a raw numeric id.

**Config is read lazily.** `enrage_recent_minutes` / `enrage_threshold_pct` are read INSIDE the functions via `config.get(...)`.

**Files:**
- Create: `app/src/service/WorldBossBroadcastService.js`
- Test: `app/src/service/__tests__/WorldBossBroadcastService.test.js`

**Interfaces:**
- Consumes (M6): `WorldBossEvent.getActive()` (joined row → `hp` + dead-column `speed`, aliased `id`); `WorldBossLog.getDamageRank({ eventId, limit }) → [{ total_damage, numericUserId, platformId }]`; `WorldBossLog.getContributionRank({ eventId, role, limit }) → [{ total_contribution, numericUserId, platformId }]`; `WorldBossLog.getRecentAttackers({ eventId, minutes, limit }) → [{ user_id, platformId, message }]`; (`WorldBossEventLogService`) `getRemainHpByEventId(eventId) → { total_damage }`; (`app/src/util/connection`) `io`.
- Produces (consumed by Task 3 socket namespace, Task 5 combat-to-broadcast hooks, Task 7 surface service):
  ```js
  exports.buildSnapshot = async (eventId) =>
    { eventId, hpPct, phase: "calm"|"enrage", boards: { dps:[...], healer:[...], tank:[...] }, feed:[...] };
  exports.requestBroadcast = (eventId) => Promise<void>;   // debounced; schedules an emit; returns the in-flight flush Promise
  exports.emitEnrage = (eventId, knockedBatch) => void;    // one-shot on phase flip
  exports.roomName = (eventId) => `wb:${eventId}`;
  ```

**Steps:**

- [ ] **Step 1: Write the failing test.** Mocks BEFORE requires (jest.config `transform:{}` → no hoisting). The debounce test awaits the Promise `requestBroadcast` returns (no fragile fixed-tick draining). Create `app/src/service/__tests__/WorldBossBroadcastService.test.js`:
  ```js
  jest.mock("../../model/application/WorldBossLog", () => ({
    getDamageRank: jest.fn(),
    getContributionRank: jest.fn(),
    getRecentAttackers: jest.fn(),
  }));
  jest.mock("../../model/application/WorldBossEvent", () => ({
    getActive: jest.fn(),
  }));
  jest.mock("../WorldBossEventLogService", () => ({
    getRemainHpByEventId: jest.fn(),
  }));
  const mockEmit = jest.fn();
  const mockTo = jest.fn(() => ({ emit: mockEmit }));
  jest.mock("../../util/connection", () => ({
    io: { of: jest.fn(() => ({ to: mockTo })) },
  }));
  jest.mock("config", () => ({
    get: jest.fn((key) => {
      const map = {
        "worldboss.enrage_recent_minutes": 10,
        "worldboss.enrage_threshold_pct": 35,
      };
      if (!(key in map)) throw new Error(`Configuration property "${key}" is not defined`);
      return map[key];
    }),
  }));

  const WorldBossLog = require("../../model/application/WorldBossLog");
  const WorldBossEvent = require("../../model/application/WorldBossEvent");
  const WorldBossEventLogService = require("../WorldBossEventLogService");
  const svc = require("../WorldBossBroadcastService");

  describe("WorldBossBroadcastService", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("buildSnapshot computes hpPct from boss.hp minus summed damage; phase enrage at/under threshold", async () => {
      // boss.hp 1000, total damage 650 -> remain 350 -> 35% -> at threshold -> enrage
      WorldBossEvent.getActive.mockResolvedValue({ id: 7, hp: 1000, speed: 35 });
      WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 650 });
      WorldBossLog.getDamageRank.mockResolvedValue([
        { total_damage: 500, numericUserId: 1, platformId: "Ua" },
      ]);
      WorldBossLog.getContributionRank
        .mockResolvedValueOnce([{ total_contribution: 12, numericUserId: 2, platformId: "Ub" }]) // healer
        .mockResolvedValueOnce([{ total_contribution: 8, numericUserId: 3, platformId: "Uc" }]); // tank
      WorldBossLog.getRecentAttackers.mockResolvedValue([
        { user_id: 1, platformId: "Ua", message: "斬！" },
        { user_id: 2, platformId: "Ub", message: null },
      ]);

      const snap = await svc.buildSnapshot(7);
      expect(WorldBossEventLogService.getRemainHpByEventId).toHaveBeenCalledWith(7);
      expect(snap.eventId).toBe(7);
      expect(snap.hpPct).toBe(35);
      expect(snap.phase).toBe("enrage");
      expect(snap.boards.dps).toEqual([{ total_damage: 500, numericUserId: 1, platformId: "Ua" }]);
      expect(snap.boards.healer).toHaveLength(1);
      expect(snap.boards.tank).toHaveLength(1);
      expect(snap.feed).toHaveLength(2);
      expect(snap.feed[0].platformId).toBe("Ua");
    });

    it("phase is calm above the threshold; hpPct clamps at 0 floor", async () => {
      WorldBossEvent.getActive.mockResolvedValue({ id: 7, hp: 1000, speed: 35 });
      WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 100 });
      WorldBossLog.getDamageRank.mockResolvedValue([]);
      WorldBossLog.getContributionRank.mockResolvedValue([]);
      WorldBossLog.getRecentAttackers.mockResolvedValue([]);
      const snap = await svc.buildSnapshot(7);
      expect(snap.hpPct).toBe(90);
      expect(snap.phase).toBe("calm");
    });

    it("hpPct floors at 0 when summed damage exceeds boss.hp", async () => {
      WorldBossEvent.getActive.mockResolvedValue({ id: 7, hp: 1000, speed: 35 });
      WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 1500 });
      WorldBossLog.getDamageRank.mockResolvedValue([]);
      WorldBossLog.getContributionRank.mockResolvedValue([]);
      WorldBossLog.getRecentAttackers.mockResolvedValue([]);
      const snap = await svc.buildSnapshot(7);
      expect(snap.hpPct).toBe(0);
      expect(snap.phase).toBe("enrage");
    });

    it("falls back to config enrage_threshold_pct when boss.speed is 0/null", async () => {
      WorldBossEvent.getActive.mockResolvedValue({ id: 7, hp: 1000, speed: 0 });
      WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 700 }); // 30% remain
      WorldBossLog.getDamageRank.mockResolvedValue([]);
      WorldBossLog.getContributionRank.mockResolvedValue([]);
      WorldBossLog.getRecentAttackers.mockResolvedValue([]);
      const snap = await svc.buildSnapshot(7);
      expect(snap.hpPct).toBe(30);
      expect(snap.phase).toBe("enrage"); // 30 <= config 35
    });

    it("buildSnapshot returns an empty snapshot when no active boss", async () => {
      WorldBossEvent.getActive.mockResolvedValue(null);
      const snap = await svc.buildSnapshot(7);
      expect(snap).toEqual({
        eventId: 7,
        hpPct: 0,
        phase: "calm",
        boards: { dps: [], healer: [], tank: [] },
        feed: [],
      });
      expect(WorldBossEventLogService.getRemainHpByEventId).not.toHaveBeenCalled();
    });

    it("requestBroadcast coalesces a burst into ONE emit after the debounce window", async () => {
      WorldBossEvent.getActive.mockResolvedValue({ id: 7, hp: 1000, speed: 35 });
      WorldBossEventLogService.getRemainHpByEventId.mockResolvedValue({ total_damage: 500 });
      WorldBossLog.getDamageRank.mockResolvedValue([]);
      WorldBossLog.getContributionRank.mockResolvedValue([]);
      WorldBossLog.getRecentAttackers.mockResolvedValue([]);

      const p1 = svc.requestBroadcast(7);
      svc.requestBroadcast(7);
      svc.requestBroadcast(7); // three calls in the same window -> one scheduled flush
      expect(mockEmit).not.toHaveBeenCalled(); // not yet — still debouncing

      jest.advanceTimersByTime(300); // > debounce window (250ms)
      await p1; // awaitable flush

      expect(mockTo).toHaveBeenCalledWith("wb:7");
      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith("snapshot", expect.objectContaining({ eventId: 7 }));
    });

    it("emitEnrage fires a one-shot enrage event (platformId batch) to the room", () => {
      svc.emitEnrage(7, ["Ua", "Ub"]);
      expect(mockTo).toHaveBeenCalledWith("wb:7");
      expect(mockEmit).toHaveBeenCalledWith("enrage", { eventId: 7, knockedBatch: ["Ua", "Ub"] });
    });
  });
  ```

- [ ] **Step 2: Run it and watch it FAIL.** `cd app && yarn test -- src/service/__tests__/WorldBossBroadcastService.test.js`. Expected FAIL: `Cannot find module '../WorldBossBroadcastService'`.

- [ ] **Step 3: Implement the service.** Create `app/src/service/WorldBossBroadcastService.js`. `config` is read lazily inside functions; nothing at module load evaluates a `worldboss.*` key.
  ```js
  const { io } = require("../util/connection");
  const WorldBossLog = require("../model/application/WorldBossLog");
  const WorldBossEvent = require("../model/application/WorldBossEvent");
  const WorldBossEventLogService = require("./WorldBossEventLogService");
  const config = require("config");

  const NAMESPACE = "/world-boss";
  const DEBOUNCE_MS = 250; // ~4 Hz upper bound on emits per event (D23)
  const BOARD_LIMIT = 5;
  const FEED_LIMIT = 20;

  const pending = new Map(); // eventId -> { handle, promise } (promise is awaitable for tests)

  const roomName = (eventId) => `wb:${eventId}`;
  exports.roomName = roomName;

  const emptySnapshot = (eventId) => ({
    eventId: Number(eventId),
    hpPct: 0,
    phase: "calm",
    boards: { dps: [], healer: [], tank: [] },
    feed: [],
  });

  exports.buildSnapshot = async (eventId) => {
    const event = await WorldBossEvent.getActive();
    if (!event) return emptySnapshot(eventId);

    // HP is NOT a column — compute it: boss.hp - SUM(damage). (addendum §6: no remain_hp)
    const { total_damage: totalDamage } = await WorldBossEventLogService.getRemainHpByEventId(
      eventId
    );
    const maxHp = Number(event.hp) || 0;
    const remain = Math.max(0, maxHp - Number(totalDamage || 0));
    const hpPct = maxHp > 0 ? Math.max(0, Math.round((remain / maxHp) * 100)) : 0;

    // dead-column speed = enrage threshold % (addendum §7); lazy config fallback when 0/null.
    const threshold = Number(event.speed) || config.get("worldboss.enrage_threshold_pct");
    const phase = hpPct <= threshold ? "enrage" : "calm";

    const recentMinutes = config.get("worldboss.enrage_recent_minutes");
    const [dps, healer, tank, recent] = await Promise.all([
      WorldBossLog.getDamageRank({ eventId, limit: BOARD_LIMIT }),
      WorldBossLog.getContributionRank({ eventId, role: "healer", limit: BOARD_LIMIT }),
      WorldBossLog.getContributionRank({ eventId, role: "tank", limit: BOARD_LIMIT }),
      WorldBossLog.getRecentAttackers({ eventId, minutes: recentMinutes, limit: FEED_LIMIT }),
    ]);

    return {
      eventId: Number(eventId),
      hpPct,
      phase,
      boards: { dps, healer, tank },
      feed: recent,
    };
  };

  // Debounced; returns the in-flight flush Promise so callers/tests can await it.
  exports.requestBroadcast = (eventId) => {
    if (pending.has(eventId)) return pending.get(eventId).promise; // flush already scheduled
    let resolveFlush;
    const promise = new Promise((resolve) => {
      resolveFlush = resolve;
    });
    const handle = setTimeout(async () => {
      pending.delete(eventId);
      try {
        const snapshot = await exports.buildSnapshot(eventId);
        io.of(NAMESPACE).to(roomName(eventId)).emit("snapshot", snapshot);
      } catch (e) {
        console.error("[WorldBossBroadcast] snapshot emit failed", e);
      } finally {
        resolveFlush();
      }
    }, DEBOUNCE_MS);
    pending.set(eventId, { handle, promise });
    return promise;
  };

  exports.emitEnrage = (eventId, knockedBatch) => {
    io.of(NAMESPACE)
      .to(roomName(eventId))
      .emit("enrage", { eventId: Number(eventId), knockedBatch });
  };
  ```
  Note: `require("config")` evaluates no property at load — only the `config.get(...)` calls inside `buildSnapshot` do — so the module is import-safe before M3 lands, and the test's `jest.mock("config", …)` controls the values.

- [ ] **Step 4: Run it and watch it PASS.** `cd app && yarn test -- src/service/__tests__/WorldBossBroadcastService.test.js`. Expected: `7 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/service/WorldBossBroadcastService.js app/src/service/__tests__/WorldBossBroadcastService.test.js
  git commit -m "feat(worldboss): debounced snapshot broadcast, computed HP, platformId boards (M8)"
  ```

---

### Task 3 — Socket.IO `/world-boss` namespace

Register the namespace on the shared `io`. Auth via `socketSetProfile` (verified `app/src/middleware/validation.js:98-99`: reads `socket.handshake.query.token` → LINE profile). On connect, join the active event room and emit the current snapshot once. Public battle state only; private `/me` state is pulled via REST (Task 5/6).

**Files:**
- Modify: `app/src/router/socket.js` (verified full file: imports `io`/`socketSetProfile`/`socketVerifyAdmin`, declares `var onlineCounter = 0;`, registers `/admin/messages`, then the global `io.on("connection", …)`). Insert the `/world-boss` block between the `/admin/messages` block and the trailing `io.on("connection", …)`.
- Test: `app/src/router/__tests__/socket.worldboss.test.js`

**Interfaces:**
- Consumes: `WorldBossEvent.getActive()` (M6), `WorldBossBroadcastService.buildSnapshot/roomName` (Task 2), `socketSetProfile` (validation middleware), `io` (connection util).
- Produces: the live `/world-boss` namespace. Server emits `"snapshot"` and `"enrage"` (sent by Task 2). Client connects with `io("/world-boss", { query: { token } })` — `socketSetProfile` reads `handshake.query.token` (NOT `auth.token`).

**Steps:**

- [ ] **Step 1: Write the failing test.** Verifies the namespace is wired with `socketSetProfile` and the connection handler joins the room + emits a snapshot. Mocks BEFORE requires. The `/admin/messages` chain calls `.use(socketSetProfile).use(socketVerifyAdmin).on(...)`, so the fake namespace's `use` must return the namespace (chainable). Create `app/src/router/__tests__/socket.worldboss.test.js`:
  ```js
  // capture the connection handler registered on the /world-boss namespace
  let worldBossConnectionHandler;
  const makeNamespace = (name) => {
    const ns = {};
    ns.use = jest.fn(() => ns); // chainable
    ns.on = jest.fn((evt, cb) => {
      if (name === "/world-boss" && evt === "connection") worldBossConnectionHandler = cb;
      return ns;
    });
    return ns;
  };
  const namespaces = {};
  const ofMock = jest.fn((name) => {
    namespaces[name] = namespaces[name] || makeNamespace(name);
    return namespaces[name];
  });

  jest.mock("../../util/connection", () => ({
    io: { of: ofMock, on: jest.fn() },
  }));
  jest.mock("../../middleware/validation", () => ({
    socketSetProfile: jest.fn(),
    socketVerifyAdmin: jest.fn(),
  }));
  jest.mock("../../model/application/WorldBossEvent", () => ({
    getActive: jest.fn(),
  }));
  jest.mock("../../service/WorldBossBroadcastService", () => ({
    buildSnapshot: jest.fn(),
    roomName: jest.fn((id) => `wb:${id}`),
  }));

  const { socketSetProfile } = require("../../middleware/validation");
  const WorldBossEvent = require("../../model/application/WorldBossEvent");
  const Broadcast = require("../../service/WorldBossBroadcastService");

  describe("/world-boss socket namespace", () => {
    beforeAll(() => {
      require("../socket"); // registers all namespaces
    });

    it("registers /world-boss with socketSetProfile", () => {
      expect(ofMock).toHaveBeenCalledWith("/world-boss");
      expect(namespaces["/world-boss"].use).toHaveBeenCalledWith(socketSetProfile);
    });

    it("on connect joins the active event room and emits current snapshot", async () => {
      WorldBossEvent.getActive.mockResolvedValue({ id: 9 });
      Broadcast.buildSnapshot.mockResolvedValue({ eventId: 9, hpPct: 100 });

      const join = jest.fn();
      const emit = jest.fn();
      const socket = { join, emit, on: jest.fn() };

      await worldBossConnectionHandler(socket);

      expect(join).toHaveBeenCalledWith("wb:9");
      expect(Broadcast.buildSnapshot).toHaveBeenCalledWith(9);
      expect(emit).toHaveBeenCalledWith("snapshot", { eventId: 9, hpPct: 100 });
    });

    it("on connect with no active event emits nothing and does not join", async () => {
      WorldBossEvent.getActive.mockResolvedValue(null);
      const join = jest.fn();
      const emit = jest.fn();
      const socket = { join, emit, on: jest.fn() };

      await worldBossConnectionHandler(socket);

      expect(join).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run it and watch it FAIL.** `cd app && yarn test -- src/router/__tests__/socket.worldboss.test.js`. Expected FAIL: `expect(ofMock).toHaveBeenCalledWith("/world-boss")` → only `"/admin/messages"` was registered (the namespace block does not exist yet).

- [ ] **Step 3: Implement the namespace.** Edit `app/src/router/socket.js` — add two requires at the top and insert the `/world-boss` block before the final `io.on("connection", …)`. The file becomes exactly:
  ```js
  const { io } = require("../util/connection");
  const { socketSetProfile, socketVerifyAdmin } = require("../middleware/validation");
  const WorldBossEvent = require("../model/application/WorldBossEvent");
  const WorldBossBroadcastService = require("../service/WorldBossBroadcastService");
  var onlineCounter = 0;

  io.of("/admin/messages")
    .use(socketSetProfile)
    .use(socketVerifyAdmin)
    .on("connection", () => {
      console.log("進入管理頁面");
    });

  io.of("/world-boss")
    .use(socketSetProfile)
    .on("connection", async socket => {
      const event = await WorldBossEvent.getActive();
      if (!event) return;
      socket.join(WorldBossBroadcastService.roomName(event.id));
      const snapshot = await WorldBossBroadcastService.buildSnapshot(event.id);
      socket.emit("snapshot", snapshot);
    });

  io.on("connection", socket => {
    onlineCounter++;
    console.log(`線上人數：${onlineCounter}`);

    socket.on("disconnect", () => {
      onlineCounter--;
      console.log(`線上人數：${onlineCounter}`);
    });
  });
  ```

- [ ] **Step 4: Run it and watch it PASS.** `cd app && yarn test -- src/router/__tests__/socket.worldboss.test.js`. Expected: `3 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/router/socket.js app/src/router/__tests__/socket.worldboss.test.js
  git commit -m "feat(worldboss): /world-boss socket namespace with snapshot on connect (M8)"
  ```

---

### Task 4 — `WorldBossReportService`: battle-report card builder + unread-flag mgmt (SINGLE WRITER of the unread flag)

Per D11 / GC#3, after settlement a player's reward result surfaces on their next interaction (no push). **`WorldBossReportService.setUnread(platformId)` is the ONE-AND-ONLY setter of the report-unread flag.** Per the addendum and the M8/M7 ownership lock, M7 `settleEvent` MUST call `WorldBossReportService.setUnread(platformId)` for each rewarded player — it MUST NOT define or call any `worldBossRedis.setReportUnread`. Both setter and reader go through `worldBossRedis.reportUnreadKey(platformId)` (Task 1) so write and read use the identical key format.

This service reads `WorldBossRewardLog.getUnreadForUser` (M3), builds a Flex report card, and clears the flag ONLY after `markDelivered` is explicitly called (so a failed reply does not silently consume the card). Verified `app/src/util/redis.js` exports a node-redis v4 client (`.set(key, val, {EX})`, `.get(key)`, `.del(key)`).

**Files:**
- Create: `app/src/service/WorldBossReportService.js`
- Test: `app/src/service/__tests__/WorldBossReportService.test.js`

**Interfaces:**
- Consumes (M3): `WorldBossRewardLog.getUnreadForUser(user_id) → Promise<row|undefined>` (`user_id` = platform_id); (Task 1) `worldBossRedis.reportUnreadKey`; (`app/src/util/redis`) node-redis v4 client.
- Produces (consumed by Task 5 `/report` handler, Task 7 surface service, M7 settlement):
  ```js
  exports.setUnread = async (platformId) => void;           // SOLE setter; M7 settlement calls this (flag = "1", EX ~ 7d)
  exports.getUnreadReport = async (platformId) =>
    { hasReport: boolean, reward: row|null, card: FlexBubble|null }; // does NOT clear the flag
  exports.markDelivered = async (platformId) => void;       // clears the flag after a successful surface
  ```

**Steps:**

- [ ] **Step 1: Write the failing test.** Mocks BEFORE requires. Create `app/src/service/__tests__/WorldBossReportService.test.js`:
  ```js
  jest.mock("../../model/application/WorldBossRewardLog", () => ({
    getUnreadForUser: jest.fn(),
  }));
  jest.mock("../../util/redis", () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }));

  const WorldBossRewardLog = require("../../model/application/WorldBossRewardLog");
  const redis = require("../../util/redis");
  const svc = require("../WorldBossReportService");

  describe("WorldBossReportService", () => {
    beforeEach(() => jest.clearAllMocks());

    it("setUnread writes the flag with an expiry through reportUnreadKey", async () => {
      await svc.setUnread("Ualice");
      expect(redis.set).toHaveBeenCalledWith(
        "wb:report_unread:Ualice",
        "1",
        expect.objectContaining({ EX: expect.any(Number) })
      );
    });

    it("getUnreadReport returns no report when flag is absent", async () => {
      redis.get.mockResolvedValue(null);
      const out = await svc.getUnreadReport("Ualice");
      expect(out.hasReport).toBe(false);
      expect(out.card).toBeNull();
      expect(WorldBossRewardLog.getUnreadForUser).not.toHaveBeenCalled();
    });

    it("getUnreadReport builds a card from the reward row when flag is set (positive grant amounts)", async () => {
      redis.get.mockResolvedValue("1");
      WorldBossRewardLog.getUnreadForUser.mockResolvedValue({
        user_id: "Ualice",
        world_boss_event_id: 9,
        materials: 50, // grants are POSITIVE (addendum §13)
        stones: 30,
        board: "dps",
        rank: 1,
        is_mvp: 1,
      });
      const out = await svc.getUnreadReport("Ualice");
      expect(out.hasReport).toBe(true);
      expect(out.reward.materials).toBe(50);
      expect(out.card).toEqual(expect.objectContaining({ type: "bubble" }));
      // does NOT clear the flag here
      expect(redis.del).not.toHaveBeenCalled();
    });

    it("getUnreadReport returns no report when flag set but no row found", async () => {
      redis.get.mockResolvedValue("1");
      WorldBossRewardLog.getUnreadForUser.mockResolvedValue(undefined);
      const out = await svc.getUnreadReport("Ualice");
      expect(out.hasReport).toBe(false);
      expect(out.card).toBeNull();
    });

    it("markDelivered clears the flag through reportUnreadKey", async () => {
      await svc.markDelivered("Ualice");
      expect(redis.del).toHaveBeenCalledWith("wb:report_unread:Ualice");
    });
  });
  ```

- [ ] **Step 2: Run it and watch it FAIL.** `cd app && yarn test -- src/service/__tests__/WorldBossReportService.test.js`. Expected FAIL: `Cannot find module '../WorldBossReportService'`.

- [ ] **Step 3: Implement the service.** Create `app/src/service/WorldBossReportService.js`:
  ```js
  const redis = require("../util/redis");
  const { reportUnreadKey } = require("../util/worldBossRedis");
  const WorldBossRewardLog = require("../model/application/WorldBossRewardLog");

  const UNREAD_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d; report waits for the player's next interaction

  // SOLE setter of the report-unread flag (M7 settlement calls this — never a raw redis.set elsewhere).
  exports.setUnread = async (platformId) => {
    await redis.set(reportUnreadKey(platformId), "1", { EX: UNREAD_TTL_SECONDS });
  };

  const BOARD_LABELS = { dps: "輸出榜", healer: "治療榜", tank: "格擋榜", none: "參戰" };

  const buildCard = (reward) => {
    const boardLabel = BOARD_LABELS[reward.board] || "參戰";
    const rankLine = reward.rank ? `第 ${reward.rank} 名` : "參戰獎勵";
    const bodyContents = [
      { type: "text", text: "世界王戰報", weight: "bold", size: "lg" },
      { type: "text", text: `${boardLabel}・${rankLine}`, size: "sm", color: "#888888" },
      { type: "separator", margin: "md" },
      { type: "text", text: `強化素材 x${reward.materials}`, margin: "md" },
    ];
    if (reward.stones > 0) {
      bodyContents.push({ type: "text", text: `女神石 x${reward.stones}` });
    }
    if (reward.is_mvp) {
      bodyContents.push({
        type: "text",
        text: "★ MVP ★",
        weight: "bold",
        color: "#d4af37",
        margin: "md",
      });
    }
    return {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents: bodyContents },
    };
  };

  exports.getUnreadReport = async (platformId) => {
    const flag = await redis.get(reportUnreadKey(platformId));
    if (!flag) {
      return { hasReport: false, reward: null, card: null };
    }
    const reward = await WorldBossRewardLog.getUnreadForUser(platformId);
    if (!reward) {
      return { hasReport: false, reward: null, card: null };
    }
    return { hasReport: true, reward, card: buildCard(reward) };
  };

  exports.markDelivered = async (platformId) => {
    await redis.del(reportUnreadKey(platformId));
  };
  ```

- [ ] **Step 4: Run it and watch it PASS.** `cd app && yarn test -- src/service/__tests__/WorldBossReportService.test.js`. Expected: `5 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/service/WorldBossReportService.js app/src/service/__tests__/WorldBossReportService.test.js
  git commit -m "feat(worldboss): battle-report card service + single-writer unread flag (M8)"
  ```

> **Cross-milestone lock for M7 reviewers:** the report-unread flag has exactly ONE writer — `WorldBossReportService.setUnread`. M7 `settleEvent` MUST `require("./WorldBossReportService").setUnread(platformId)` for each rewarded player; it MUST NOT introduce `worldBossRedis.setReportUnread` or a raw `redis.set` on the unread key. Key format is owned by `worldBossRedis.reportUnreadKey` (Task 1).

---

### Task 5 — REST player handlers (`app/src/handler/WorldBoss/player.js`)

Player-gated handlers that hit the SAME `WorldBossCombatService` (M5) the LINE commands use — never reimplement combat (D23). `req.profile.userId` is the LINE `platformId`.

**IDENTITY (addendum §4 / fact #1 — the GATE):** combat needs `numericUserId = user.id`. Resolve it via `UserModel.getId(platformId)` (verified `app/src/model/application/UserModel.js:8` → returns `user.id` or `null`). Use `MinigameService.findByUserId(platformId)` ONLY for `level` (its `.id` is `minigame_level.id`, the WRONG value for the combat call). The combat services write `numericUserId` into `world_boss_event_log.user_id`, which settlement JOINs as `world_boss_event_log.user_id = user.id`; using `minigame_level.id` would corrupt attribution and drop rewards. If `UserModel.getId` returns `null` (no user row), the handler rejects with 409 `no_user` rather than writing a bad FK.

The combat service signatures match the addendum exactly: `dpsAttack({ platformId, numericUserId, eventId, attackType, level })`, `tankBlock/healerRevive/healerShield({ platformId, numericUserId, eventId })`. Action handlers convert the combat result into JSON for the LIFF and fire the debounced broadcast (+ one-shot enrage emit when `didEnrageTrigger`). The `knockedBatch` the combat result returns is already platform_id-mapped (addendum §4: M5 converts numeric→platform_id via `resolveUserIds` before returning), so `emitEnrage` forwards it verbatim.

**Files:**
- Create: `app/src/handler/WorldBoss/player.js`
- Modify: `app/src/handler/WorldBoss/index.js` (currently `exports.admin = require("./admin");` — append `exports.player`).
- Test: `app/src/handler/WorldBoss/__tests__/player.test.js`

**Interfaces:**
- Consumes (M5): `WorldBossCombatService.{dpsAttack,tankBlock,healerRevive,healerShield}`; (M6) `WorldBossEvent.getActive()`; (M2) `WorldBossRoleService.{getRole,chooseRole,reselectRole}`; (M4) `EquipmentService.enhanceEquipment(userId, equipmentId)`; (Task 2) `WorldBossBroadcastService.{requestBroadcast,emitEnrage}`; (Task 4) `WorldBossReportService.{getUnreadReport,markDelivered}`; (existing) `UserModel.getId` (numeric `user.id`), `MinigameService.findByUserId` (level only).
- Produces (consumed by Task 6 router):
  ```js
  exports.getSnapshot, exports.getMe, exports.attack, exports.block,
  exports.revive, exports.shield, exports.role, exports.enhance, exports.getReport
  ```

**Steps:**

- [ ] **Step 1: Write the failing test.** Mocks BEFORE requires. Includes a REGRESSION test asserting `dpsAttack` is called with `numericUserId` from `UserModel.getId` (NOT `minigame.id`) — deliberately different values (`getId → 555`, `minigame.id → 123`). Create `app/src/handler/WorldBoss/__tests__/player.test.js`:
  ```js
  jest.mock("../../../service/WorldBossCombatService", () => ({
    dpsAttack: jest.fn(),
    tankBlock: jest.fn(),
    healerRevive: jest.fn(),
    healerShield: jest.fn(),
  }));
  jest.mock("../../../service/WorldBossBroadcastService", () => ({
    buildSnapshot: jest.fn(),
    requestBroadcast: jest.fn(),
    emitEnrage: jest.fn(),
  }));
  jest.mock("../../../service/WorldBossReportService", () => ({
    getUnreadReport: jest.fn(),
    markDelivered: jest.fn(),
  }));
  jest.mock("../../../service/WorldBossRoleService", () => ({
    getRole: jest.fn(),
    chooseRole: jest.fn(),
    reselectRole: jest.fn(),
  }));
  jest.mock("../../../service/EquipmentService", () => ({
    enhanceEquipment: jest.fn(),
  }));
  jest.mock("../../../service/MinigameService", () => ({
    findByUserId: jest.fn(),
  }));
  jest.mock("../../../model/application/UserModel", () => ({
    getId: jest.fn(),
  }));
  jest.mock("../../../model/application/WorldBossEvent", () => ({
    getActive: jest.fn(),
  }));

  const Combat = require("../../../service/WorldBossCombatService");
  const Broadcast = require("../../../service/WorldBossBroadcastService");
  const Report = require("../../../service/WorldBossReportService");
  const RoleService = require("../../../service/WorldBossRoleService");
  const MinigameService = require("../../../service/MinigameService");
  const EquipmentService = require("../../../service/EquipmentService");
  const UserModel = require("../../../model/application/UserModel");
  const WorldBossEvent = require("../../../model/application/WorldBossEvent");
  const handler = require("../player");

  const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };

  describe("WorldBoss player handlers", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      WorldBossEvent.getActive.mockResolvedValue({ id: 9, hp: 1000, speed: 35 });
      // deliberately DIFFERENT values: user.id=555 (correct FK) vs minigame_level.id=123 (wrong)
      UserModel.getId.mockResolvedValue(555);
      MinigameService.findByUserId.mockResolvedValue({ id: 123, level: 40 });
      RoleService.getRole.mockResolvedValue("dps");
    });

    it("getSnapshot returns the broadcast snapshot", async () => {
      Broadcast.buildSnapshot.mockResolvedValue({ eventId: 9, hpPct: 60 });
      const req = { profile: { userId: "Ualice" } };
      const res = mockRes();
      await handler.getSnapshot(req, res);
      expect(Broadcast.buildSnapshot).toHaveBeenCalledWith(9);
      expect(res.json).toHaveBeenCalledWith({ eventId: 9, hpPct: 60 });
    });

    it("getSnapshot returns active:false when no active boss", async () => {
      WorldBossEvent.getActive.mockResolvedValue(null);
      const req = { profile: { userId: "Ualice" } };
      const res = mockRes();
      await handler.getSnapshot(req, res);
      expect(res.json).toHaveBeenCalledWith({ active: false });
    });

    it("getMe returns role + numericUserId(user.id) + level(minigame)", async () => {
      const req = { profile: { userId: "Ualice" } };
      const res = mockRes();
      await handler.getMe(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ role: "dps", numericUserId: 555, level: 40 })
      );
    });

    it("REGRESSION: attack passes numericUserId from UserModel.getId (user.id=555), NOT minigame.id", async () => {
      Combat.dpsAttack.mockResolvedValue({
        damage: 200, contribution: 200, enraged: false,
        didEnrageTrigger: false, knockedBatch: [], selfKnocked: false, rejected: false,
      });
      const req = { profile: { userId: "Ualice" }, body: { attackType: "normal" } };
      const res = mockRes();
      await handler.attack(req, res);
      expect(UserModel.getId).toHaveBeenCalledWith("Ualice");
      expect(Combat.dpsAttack).toHaveBeenCalledWith({
        platformId: "Ualice",
        numericUserId: 555, // user.id — NOT 123 (minigame_level.id)
        eventId: 9,
        attackType: "normal",
        level: 40,
      });
      expect(Broadcast.requestBroadcast).toHaveBeenCalledWith(9);
      expect(Broadcast.emitEnrage).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ damage: 200 }));
    });

    it("attack emits enrage one-shot (platformId batch) when combat reports a trigger", async () => {
      Combat.dpsAttack.mockResolvedValue({
        damage: 200, contribution: 400, enraged: true,
        didEnrageTrigger: true, knockedBatch: ["Ub", "Uc"], selfKnocked: false, rejected: false,
      });
      const req = { profile: { userId: "Ualice" }, body: {} };
      const res = mockRes();
      await handler.attack(req, res);
      expect(Broadcast.emitEnrage).toHaveBeenCalledWith(9, ["Ub", "Uc"]);
    });

    it("attack returns 409 when combat rejects (knocked_down) and does NOT broadcast", async () => {
      Combat.dpsAttack.mockResolvedValue({ rejected: true, reason: "knocked_down" });
      const req = { profile: { userId: "Ualice" }, body: {} };
      const res = mockRes();
      await handler.attack(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ rejected: true, reason: "knocked_down" });
      expect(Broadcast.requestBroadcast).not.toHaveBeenCalled();
    });

    it("attack returns 409 no_user when UserModel.getId is null (no bad FK written)", async () => {
      UserModel.getId.mockResolvedValue(null);
      const req = { profile: { userId: "Ughost" }, body: {} };
      const res = mockRes();
      await handler.attack(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ rejected: true, reason: "no_user" });
      expect(Combat.dpsAttack).not.toHaveBeenCalled();
    });

    it("block/revive/shield resolve numericUserId via UserModel.getId too", async () => {
      Combat.tankBlock.mockResolvedValue({ rejected: false, windowMinutes: 5 });
      Combat.healerRevive.mockResolvedValue({ rejected: false, revived: [], contribution: 0 });
      Combat.healerShield.mockResolvedValue({ rejected: false, shielded: [] });
      const req = { profile: { userId: "Ualice" }, body: {} };
      await handler.block(req, mockRes());
      await handler.revive(req, mockRes());
      await handler.shield(req, mockRes());
      expect(Combat.tankBlock).toHaveBeenCalledWith({ platformId: "Ualice", numericUserId: 555, eventId: 9 });
      expect(Combat.healerRevive).toHaveBeenCalledWith({ platformId: "Ualice", numericUserId: 555, eventId: 9 });
      expect(Combat.healerShield).toHaveBeenCalledWith({ platformId: "Ualice", numericUserId: 555, eventId: 9 });
    });

    it("getReport clears the unread flag only after returning a card", async () => {
      Report.getUnreadReport.mockResolvedValue({
        hasReport: true, reward: { materials: 10 }, card: { type: "bubble" },
      });
      const req = { profile: { userId: "Ualice" } };
      const res = mockRes();
      await handler.getReport(req, res);
      expect(res.json).toHaveBeenCalledWith({
        hasReport: true, reward: { materials: 10 }, card: { type: "bubble" },
      });
      expect(Report.markDelivered).toHaveBeenCalledWith("Ualice");
    });

    it("getReport does not clear the flag when there is no report", async () => {
      Report.getUnreadReport.mockResolvedValue({ hasReport: false, reward: null, card: null });
      const req = { profile: { userId: "Ualice" } };
      const res = mockRes();
      await handler.getReport(req, res);
      expect(Report.markDelivered).not.toHaveBeenCalled();
    });

    it("role with reselect=true calls reselectRole", async () => {
      RoleService.reselectRole.mockResolvedValue({ role: "tank", free_used: true });
      const req = { profile: { userId: "Ualice" }, body: { role: "tank", reselect: true } };
      const res = mockRes();
      await handler.role(req, res);
      expect(RoleService.reselectRole).toHaveBeenCalledWith("Ualice", "tank");
      expect(res.json).toHaveBeenCalledWith({ role: "tank", free_used: true });
    });

    it("enhance forwards to EquipmentService.enhanceEquipment", async () => {
      EquipmentService.enhanceEquipment.mockResolvedValue({ enhance_level: 3 });
      const req = { profile: { userId: "Ualice" }, body: { equipment_id: 55 } };
      const res = mockRes();
      await handler.enhance(req, res);
      expect(EquipmentService.enhanceEquipment).toHaveBeenCalledWith("Ualice", 55);
      expect(res.json).toHaveBeenCalledWith({ enhance_level: 3 });
    });
  });
  ```

- [ ] **Step 2: Run it and watch it FAIL.** `cd app && yarn test -- src/handler/WorldBoss/__tests__/player.test.js`. Expected FAIL: `Cannot find module '../player'`.

- [ ] **Step 3: Confirm the real source signatures before coding.** `cd app && sed -n '1,12p' src/model/application/UserModel.js && echo "---MINIGAME---" && sed -n '1,8p' src/service/MinigameService.js && echo "---HANDLER INDEX---" && cat src/handler/WorldBoss/index.js`. Confirmed at draft time: `UserModel.getId(platformId)` returns `user.id` or `null` (`UserModel.js:8`); `MinigameService.findByUserId` re-exports `MinigameLevel.findByUserId` whose row carries `id`(=`minigame_level.id`) + `level` (`MinigameService.js:5`); `handler/WorldBoss/index.js` is exactly `exports.admin = require("./admin");`.

- [ ] **Step 4: Implement the handlers.** Create `app/src/handler/WorldBoss/player.js`:
  ```js
  const WorldBossCombatService = require("../../service/WorldBossCombatService");
  const WorldBossBroadcastService = require("../../service/WorldBossBroadcastService");
  const WorldBossReportService = require("../../service/WorldBossReportService");
  const WorldBossRoleService = require("../../service/WorldBossRoleService");
  const EquipmentService = require("../../service/EquipmentService");
  const MinigameService = require("../../service/MinigameService");
  const UserModel = require("../../model/application/UserModel");
  const WorldBossEvent = require("../../model/application/WorldBossEvent");

  // Resolve the combat caller context shared by every action handler.
  // platformId -> numericUserId(=user.id) + chat/minigame level (level drives damage, GC#6).
  // IMPORTANT (addendum §4): numericUserId MUST be user.id (UserModel.getId), NOT minigame_level.id.
  // world_boss_event_log.user_id stores user.id, and settlement JOINs user_id = user.id.
  async function resolveCombatContext(platformId) {
    const event = await WorldBossEvent.getActive();
    if (!event) return { event: null, numericUserId: null, level: 1 };
    const [numericUserId, minigame] = await Promise.all([
      UserModel.getId(platformId), // user.id (the settlement FK) — NOT minigame.id
      MinigameService.findByUserId(platformId), // level source ONLY
    ]);
    return {
      event,
      numericUserId, // user.id or null
      level: minigame ? minigame.level : 1,
    };
  }

  exports.getSnapshot = async (req, res) => {
    try {
      const event = await WorldBossEvent.getActive();
      if (!event) return res.json({ active: false });
      const snapshot = await WorldBossBroadcastService.buildSnapshot(event.id);
      res.json(snapshot);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  };

  exports.getMe = async (req, res) => {
    try {
      const platformId = req.profile.userId;
      const { event, numericUserId, level } = await resolveCombatContext(platformId);
      const role = await WorldBossRoleService.getRole(platformId);
      res.json({
        active: !!event,
        eventId: event ? event.id : null,
        role,
        numericUserId,
        level,
      });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  };

  // Shared runner for the four combat actions.
  function makeCombatHandler(method, buildArgs) {
    return async (req, res) => {
      try {
        const platformId = req.profile.userId;
        const { event, numericUserId, level } = await resolveCombatContext(platformId);
        if (!event) return res.status(409).json({ rejected: true, reason: "no_active_boss" });
        if (numericUserId === null) {
          // no user row -> refuse rather than write a bad world_boss_event_log.user_id FK
          return res.status(409).json({ rejected: true, reason: "no_user" });
        }

        const result = await WorldBossCombatService[method](
          buildArgs({ platformId, numericUserId, eventId: event.id, level, body: req.body || {} })
        );

        if (result.rejected) {
          return res.status(409).json({ rejected: true, reason: result.reason });
        }

        WorldBossBroadcastService.requestBroadcast(event.id);
        if (result.didEnrageTrigger) {
          // knockedBatch is already platform_id-mapped by the combat service (addendum §4)
          WorldBossBroadcastService.emitEnrage(event.id, result.knockedBatch || []);
        }
        res.json(result);
      } catch (e) {
        res.status(500).json({ message: e.message });
      }
    };
  }

  exports.attack = makeCombatHandler("dpsAttack", ({ platformId, numericUserId, eventId, level, body }) => ({
    platformId,
    numericUserId,
    eventId,
    attackType: body.attackType || "normal",
    level,
  }));

  exports.block = makeCombatHandler("tankBlock", ({ platformId, numericUserId, eventId }) => ({
    platformId,
    numericUserId,
    eventId,
  }));

  exports.revive = makeCombatHandler("healerRevive", ({ platformId, numericUserId, eventId }) => ({
    platformId,
    numericUserId,
    eventId,
  }));

  exports.shield = makeCombatHandler("healerShield", ({ platformId, numericUserId, eventId }) => ({
    platformId,
    numericUserId,
    eventId,
  }));

  exports.role = async (req, res) => {
    try {
      const platformId = req.profile.userId;
      const { role, reselect } = req.body || {};
      const result = reselect
        ? await WorldBossRoleService.reselectRole(platformId, role)
        : await WorldBossRoleService.chooseRole(platformId, role);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  };

  exports.enhance = async (req, res) => {
    try {
      const platformId = req.profile.userId;
      const { equipment_id } = req.body || {};
      const result = await EquipmentService.enhanceEquipment(platformId, equipment_id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  };

  exports.getReport = async (req, res) => {
    try {
      const platformId = req.profile.userId;
      const report = await WorldBossReportService.getUnreadReport(platformId);
      res.json(report);
      if (report.hasReport) {
        await WorldBossReportService.markDelivered(platformId);
      }
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  };
  ```
  Note on `getReport` ordering: GC#3/D11 require the flag be cleared "only after actual delivery." For the REST/LIFF surface, returning the JSON in the same response IS the delivery, so `markDelivered` runs after `res.json`. The LINE piggyback (Task 7 `surfaceReportCard`) clears it only after a successful `replyFn`.

  Then edit `app/src/handler/WorldBoss/index.js` (currently `exports.admin = require("./admin");`) to add the player export:
  ```js
  exports.admin = require("./admin");
  exports.player = require("./player");
  ```

- [ ] **Step 5: Run it and watch it PASS.** `cd app && yarn test -- src/handler/WorldBoss/__tests__/player.test.js`. Expected: `12 passed`.

- [ ] **Step 6: Commit.**
  ```bash
  git add app/src/handler/WorldBoss/player.js app/src/handler/WorldBoss/index.js app/src/handler/WorldBoss/__tests__/player.test.js
  git commit -m "feat(worldboss): REST player handlers; numericUserId via UserModel.getId (M8)"
  ```

---

### Task 6 — Player REST router + registration in `api.js`

Wire the handlers under `/game/world-boss/*`, gated by `verifyToken` only, mirroring the existing `/game` PlayerEquipment pattern (verified `app/src/router/api.js:52` → `router.use("/game", verifyToken, PlayerEquipmentRouter);`).

**Files:**
- Create: `app/src/router/WorldBoss/player.js`
- Modify: `app/src/router/WorldBoss/index.js` (currently `exports.admin = AdminRouter;` — append `exports.player`).
- Modify: `app/src/router/api.js` (extend the existing WorldBoss import at line 27 + add the `/game` mount after line 52).
- Test: `app/src/router/WorldBoss/__tests__/player.router.test.js`

**Interfaces:**
- Consumes: Task 5 handlers (via `require("../../handler/WorldBoss").player`).
- Produces: `exports.player` = an Express router with:
  ```
  GET  /world-boss/snapshot
  GET  /world-boss/me
  POST /world-boss/attack
  POST /world-boss/block
  POST /world-boss/revive
  POST /world-boss/shield
  POST /world-boss/role
  POST /world-boss/enhance
  GET  /world-boss/report
  ```

**Steps:**

- [ ] **Step 0: Re-confirm the existing wiring + record line numbers.** `cd app && cat src/router/WorldBoss/index.js && echo "---API---" && grep -n 'require("./WorldBoss")\|router.use("/game"\|/game/world-boss/feature-messages' src/router/api.js`. Confirmed at draft time: `src/router/WorldBoss/index.js` = `exports.admin = AdminRouter;`; `api.js:27` = `const { admin: AdminWorldBossRouter } = require("./WorldBoss");`; `api.js:52` = `router.use("/game", verifyToken, PlayerEquipmentRouter);`. NOTE: `/game/world-boss/feature-messages` CRUD already exists registered directly via `router.post/get/...` (api.js:392-428) — leave those untouched; the new player router owns ONLY the nine action/query routes above (no collision: those paths are distinct from `feature-messages`). Record the actual line numbers; Step 4 edits the real lines.

- [ ] **Step 1: Write the failing test.** Verify the router registers each route to the right handler. Mock the handler module so we assert wiring, not behavior. Create `app/src/router/WorldBoss/__tests__/player.router.test.js`:
  ```js
  jest.mock("../../../handler/WorldBoss", () => ({
    admin: {},
    player: {
      getSnapshot: jest.fn(),
      getMe: jest.fn(),
      attack: jest.fn(),
      block: jest.fn(),
      revive: jest.fn(),
      shield: jest.fn(),
      role: jest.fn(),
      enhance: jest.fn(),
      getReport: jest.fn(),
    },
  }));

  const { player: playerRouter } = require("../index");

  function routesOf(router) {
    return router.stack
      .filter(l => l.route)
      .map(l => ({
        path: l.route.path,
        methods: Object.keys(l.route.methods).filter(m => l.route.methods[m]),
      }));
  }

  describe("WorldBoss player router", () => {
    it("registers the nine player routes under /world-boss", () => {
      const routes = routesOf(playerRouter);
      const byPath = (p, m) => routes.some(r => r.path === p && r.methods.includes(m));
      expect(byPath("/world-boss/snapshot", "get")).toBe(true);
      expect(byPath("/world-boss/me", "get")).toBe(true);
      expect(byPath("/world-boss/attack", "post")).toBe(true);
      expect(byPath("/world-boss/block", "post")).toBe(true);
      expect(byPath("/world-boss/revive", "post")).toBe(true);
      expect(byPath("/world-boss/shield", "post")).toBe(true);
      expect(byPath("/world-boss/role", "post")).toBe(true);
      expect(byPath("/world-boss/enhance", "post")).toBe(true);
      expect(byPath("/world-boss/report", "get")).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run it and watch it FAIL.** `cd app && yarn test -- src/router/WorldBoss/__tests__/player.router.test.js`. Expected FAIL: `playerRouter` is `undefined` (`index.js` does not export `player` yet) → `Cannot read properties of undefined (reading 'stack')`.

- [ ] **Step 3: Implement the router.** Create `app/src/router/WorldBoss/player.js` (match the existing `index.js` style — `require("express").Router`):
  ```js
  const PlayerRouter = require("express").Router();
  const { player: playerHandler } = require("../../handler/WorldBoss");

  PlayerRouter.get("/world-boss/snapshot", playerHandler.getSnapshot);
  PlayerRouter.get("/world-boss/me", playerHandler.getMe);
  PlayerRouter.post("/world-boss/attack", playerHandler.attack);
  PlayerRouter.post("/world-boss/block", playerHandler.block);
  PlayerRouter.post("/world-boss/revive", playerHandler.revive);
  PlayerRouter.post("/world-boss/shield", playerHandler.shield);
  PlayerRouter.post("/world-boss/role", playerHandler.role);
  PlayerRouter.post("/world-boss/enhance", playerHandler.enhance);
  PlayerRouter.get("/world-boss/report", playerHandler.getReport);

  exports.player = PlayerRouter;
  ```
  Edit `app/src/router/WorldBoss/index.js` to re-export the player router from this module (keep the existing admin export exactly as Step 0 showed it):
  ```js
  // ...existing AdminRouter setup + `exports.admin = AdminRouter;` unchanged...
  exports.player = require("./player").player;
  ```

- [ ] **Step 4: Register in `api.js`.** Using the real line numbers from Step 0, extend the existing admin import at line 27 to also pull `player`:
  ```js
  const { admin: AdminWorldBossRouter, player: PlayerWorldBossRouter } = require("./WorldBoss");
  ```
  And immediately after the existing `router.use("/game", verifyToken, PlayerEquipmentRouter);` (line 52) add:
  ```js
  router.use("/game", verifyToken, PlayerWorldBossRouter);
  ```

- [ ] **Step 5: Run it and watch it PASS.** `cd app && yarn test -- src/router/WorldBoss/__tests__/player.router.test.js`. Expected: `1 passed`.

- [ ] **Step 6: Commit.**
  ```bash
  git add app/src/router/WorldBoss/player.js app/src/router/WorldBoss/index.js app/src/router/api.js app/src/router/WorldBoss/__tests__/player.router.test.js
  git commit -m "feat(worldboss): register /game/world-boss player REST routes (M8)"
  ```

---

### Task 7 — `WorldBossSurfaceService`: `#世界王` pull text + immediate/batch routing + report-card surface helper

The M8-owned LINE surface helpers M9 imports into the controller rewrite: the pull-based `#世界王` status reply (D17), the routing helper that decides immediate `replyText` (personal status / one-time enrage announce) vs the 5-min batch (`handleKeepingMessage`), and the report-card piggyback helper (clears the unread flag only after a successful surface). M9 MUST import these rather than re-deriving the rules.

> **NO-PUSH / batch-flush note for M9 (GC#1/GC#3):** `classifyReply` only *classifies*; it does NOT flush. M9 owns the actual `handleKeepingMessage` integration and MUST verify (by grepping the real `WorldBossController.js`) that the existing batch mechanism flushes via a LINE **reply token** (`context.reply…`), never a Push API call, and that a valid reply token is available at flush time. If the batched flush cannot ride a live reply token it is a latent NO-PUSH violation and must be redesigned (fold the batched line into the next per-user reply). This helper routes only personal-status rejections and the one-time enrage announce to `immediate`; ordinary landed hits go to `batch` for M9 to flush within GC#3.

`buildStatusText` renders the snapshot's board tops using `platformId`-bearing rows (addendum §4): the dps top uses `total_damage`, healer/tank tops use `total_contribution`.

**Files:**
- Create: `app/src/service/WorldBossSurfaceService.js`
- Test: `app/src/service/__tests__/WorldBossSurfaceService.test.js`

**Interfaces:**
- Consumes: Task 2 `WorldBossBroadcastService.buildSnapshot`; Task 4 `WorldBossReportService.{getUnreadReport,markDelivered}`; (M5) combat result objects.
- Produces (consumed by M9 controller):
  ```js
  exports.buildStatusText = async (eventId, platformId) => string;  // #世界王 pull reply
  exports.classifyReply = (combatResult) =>
    { mode: "immediate"|"batch", reason: string|null }; // immediate for rejected/personal + enrage trigger
  exports.surfaceReportCard = async (platformId, replyFn) => boolean; // true if a card was delivered+cleared
  ```

**Steps:**

- [ ] **Step 1: Write the failing test.** Mocks BEFORE requires. Create `app/src/service/__tests__/WorldBossSurfaceService.test.js`:
  ```js
  jest.mock("../WorldBossBroadcastService", () => ({ buildSnapshot: jest.fn() }));
  jest.mock("../WorldBossReportService", () => ({
    getUnreadReport: jest.fn(),
    markDelivered: jest.fn(),
  }));

  const Broadcast = require("../WorldBossBroadcastService");
  const Report = require("../WorldBossReportService");
  const svc = require("../WorldBossSurfaceService");

  describe("WorldBossSurfaceService", () => {
    beforeEach(() => jest.clearAllMocks());

    it("buildStatusText renders HP%/phase/board tops", async () => {
      Broadcast.buildSnapshot.mockResolvedValue({
        eventId: 9,
        hpPct: 42,
        phase: "calm",
        boards: {
          dps: [{ total_damage: 500, numericUserId: 1, platformId: "Ua" }],
          healer: [{ total_contribution: 12, numericUserId: 2, platformId: "Ub" }],
          tank: [{ total_contribution: 8, numericUserId: 3, platformId: "Uc" }],
        },
        feed: [],
      });
      const text = await svc.buildStatusText(9, "Ualice");
      expect(text).toContain("42%");
      expect(text).toContain("平穩");
      expect(text).toContain("輸出");
      expect(text).toContain("500");
    });

    it("classifyReply -> immediate for a rejected (personal) result", () => {
      expect(svc.classifyReply({ rejected: true, reason: "knocked_down" }))
        .toEqual({ mode: "immediate", reason: "knocked_down" });
    });

    it("classifyReply -> immediate for an enrage trigger (one-time announce)", () => {
      expect(svc.classifyReply({ rejected: false, didEnrageTrigger: true }))
        .toEqual({ mode: "immediate", reason: "enrage_trigger" });
    });

    it("classifyReply -> batch for an ordinary landed hit", () => {
      expect(svc.classifyReply({ rejected: false, didEnrageTrigger: false, damage: 100 }))
        .toEqual({ mode: "batch", reason: null });
    });

    it("surfaceReportCard delivers the card then clears the flag", async () => {
      Report.getUnreadReport.mockResolvedValue({ hasReport: true, card: { type: "bubble" } });
      const replyFn = jest.fn().mockResolvedValue();
      const delivered = await svc.surfaceReportCard("Ualice", replyFn);
      expect(replyFn).toHaveBeenCalledWith({ type: "bubble" });
      expect(Report.markDelivered).toHaveBeenCalledWith("Ualice");
      expect(delivered).toBe(true);
    });

    it("surfaceReportCard does NOT clear the flag if reply throws", async () => {
      Report.getUnreadReport.mockResolvedValue({ hasReport: true, card: { type: "bubble" } });
      const replyFn = jest.fn().mockRejectedValue(new Error("reply failed"));
      const delivered = await svc.surfaceReportCard("Ualice", replyFn);
      expect(Report.markDelivered).not.toHaveBeenCalled();
      expect(delivered).toBe(false);
    });

    it("surfaceReportCard is a no-op when there is no unread report", async () => {
      Report.getUnreadReport.mockResolvedValue({ hasReport: false, card: null });
      const replyFn = jest.fn();
      const delivered = await svc.surfaceReportCard("Ualice", replyFn);
      expect(replyFn).not.toHaveBeenCalled();
      expect(Report.markDelivered).not.toHaveBeenCalled();
      expect(delivered).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run it and watch it FAIL.** `cd app && yarn test -- src/service/__tests__/WorldBossSurfaceService.test.js`. Expected FAIL: `Cannot find module '../WorldBossSurfaceService'`.

- [ ] **Step 3: Implement the service.** Create `app/src/service/WorldBossSurfaceService.js`:
  ```js
  const WorldBossBroadcastService = require("./WorldBossBroadcastService");
  const WorldBossReportService = require("./WorldBossReportService");

  exports.buildStatusText = async (eventId, platformId) => {
    const snap = await WorldBossBroadcastService.buildSnapshot(eventId);
    const phaseLabel = snap.phase === "enrage" ? "暴怒" : "平穩";
    const dpsTop = snap.boards.dps[0] ? snap.boards.dps[0].total_damage : 0;
    const healerTop = snap.boards.healer[0] ? snap.boards.healer[0].total_contribution : 0;
    const tankTop = snap.boards.tank[0] ? snap.boards.tank[0].total_contribution : 0;
    return [
      `世界王狀態：${phaseLabel}`,
      `剩餘血量：${snap.hpPct}%`,
      `輸出榜首：${dpsTop}`,
      `治療榜首：${healerTop}`,
      `格擋榜首：${tankTop}`,
    ].join("\n");
  };

  // Decide how the combat result is surfaced to the group (GC#3).
  // immediate: personal-status rejections AND the one-time-per-event enrage announce.
  // batch: an ordinary landed hit (goes into the 5-min handleKeepingMessage buffer; M9 flushes via reply token).
  exports.classifyReply = (combatResult) => {
    if (combatResult.rejected) {
      return { mode: "immediate", reason: combatResult.reason };
    }
    if (combatResult.didEnrageTrigger) {
      return { mode: "immediate", reason: "enrage_trigger" };
    }
    return { mode: "batch", reason: null };
  };

  // Surface the battle-report card via the provided reply function.
  // Clears the unread flag ONLY after the reply succeeds (GC#3 / D11).
  exports.surfaceReportCard = async (platformId, replyFn) => {
    const report = await WorldBossReportService.getUnreadReport(platformId);
    if (!report.hasReport || !report.card) return false;
    try {
      await replyFn(report.card);
    } catch (e) {
      return false; // do not clear; the player will see it on the next interaction
    }
    await WorldBossReportService.markDelivered(platformId);
    return true;
  };
  ```

- [ ] **Step 4: Run it and watch it PASS.** `cd app && yarn test -- src/service/__tests__/WorldBossSurfaceService.test.js`. Expected: `7 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  git add app/src/service/WorldBossSurfaceService.js app/src/service/__tests__/WorldBossSurfaceService.test.js
  git commit -m "feat(worldboss): pull-status text + immediate/batch routing + report-card surface (M8)"
  ```

---

### Task 8 — Frontend: `services/worldBoss.js` API client

The REST client the LIFF page (Task 10) and socket hook (Task 9) consume. Mirrors `frontend/src/services/janken.js` (uses the shared `api` axios instance with the LIFF Bearer token injected by `LiffProvider`).

**Files:**
- Create: `frontend/src/services/worldBoss.js`
- Test: none (frontend has no test runner per CLAUDE.md; verified by build in Task 11).

**Interfaces:**
- Consumes: `frontend/src/services/api.js` (default `api` axios instance).
- Produces (consumed by Task 9/10):
  ```js
  getSnapshot, getMe, postAttack, postBlock, postRevive, postShield, postRole, postEnhance, getReport
  ```

**Steps:**

- [ ] **Step 0: Confirm the shared axios instance + base path.** `cd frontend && sed -n '1,30p' src/services/api.js && echo "---JANKEN---" && sed -n '1,15p' src/services/janken.js`. Determine whether `api` already prefixes `/api` (Vite proxies `/api` → bot per CLAUDE.md). If `api.baseURL` already includes `/api`, the paths below must NOT repeat it. Adjust the URLs in Step 1 to match the real `janken.js` convention exactly.

- [ ] **Step 1: Create the client.** Create `frontend/src/services/worldBoss.js` (paths shown assuming `api` does NOT prefix `/api` — match what Step 0 found):
  ```js
  import api from "./api";

  export const getSnapshot = () => api.get("/api/game/world-boss/snapshot").then(r => r.data);
  export const getMe = () => api.get("/api/game/world-boss/me").then(r => r.data);
  export const postAttack = (attackType = "normal") =>
    api.post("/api/game/world-boss/attack", { attackType }).then(r => r.data);
  export const postBlock = () => api.post("/api/game/world-boss/block", {}).then(r => r.data);
  export const postRevive = () => api.post("/api/game/world-boss/revive", {}).then(r => r.data);
  export const postShield = () => api.post("/api/game/world-boss/shield", {}).then(r => r.data);
  export const postRole = (role, reselect = false) =>
    api.post("/api/game/world-boss/role", { role, reselect }).then(r => r.data);
  export const postEnhance = equipmentId =>
    api.post("/api/game/world-boss/enhance", { equipment_id: equipmentId }).then(r => r.data);
  export const getReport = () => api.get("/api/game/world-boss/report").then(r => r.data);
  ```

- [ ] **Step 2: Verify it lints cleanly.** `cd frontend && yarn lint src/services/worldBoss.js`. Expected: no lint errors.

- [ ] **Step 3: Commit.**
  ```bash
  git add frontend/src/services/worldBoss.js
  git commit -m "feat(worldboss): frontend REST client for world-boss endpoints (M8)"
  ```

---

### Task 9 — Frontend: `useWorldBossSocket` hook

Socket client for the `/world-boss` namespace. Connects with `query: { token: liff.getAccessToken() }` — the server's `socketSetProfile` reads `handshake.query.token` (verified `validation.js:99`), NOT `auth.token` (unlike the admin Messages page). Exposes the latest snapshot + a transient enrage flash signal.

**Files:**
- Create: `frontend/src/pages/WorldBoss/useWorldBossSocket.js`
- Test: none (no frontend runner; verified by build in Task 11).

**Interfaces:**
- Consumes: `socket.io-client` (`io`), `@line/liff` (`liff.getAccessToken`).
- Produces (consumed by Task 10):
  ```js
  useWorldBossSocket() -> { snapshot, enrageBatch, connected }
  ```

**Steps:**

- [ ] **Step 0: Confirm `socket.io-client` is a frontend dep + the existing connect convention.** `cd frontend && grep socket.io-client package.json && grep -rn "io(" src/pages/Admin/Messages.jsx | head`. Confirm `socket.io-client` is present (the admin Messages page uses `io`) and note that the admin page connects with `auth:{token}`; our new namespace deliberately uses `query:{token}` to match the server's `socketSetProfile`.

- [ ] **Step 1: Create the hook.** Create `frontend/src/pages/WorldBoss/useWorldBossSocket.js`:
  ```js
  import { useEffect, useState } from "react";
  import { io } from "socket.io-client";
  import liff from "@line/liff";

  export default function useWorldBossSocket() {
    const [snapshot, setSnapshot] = useState(null);
    const [enrageBatch, setEnrageBatch] = useState(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
      const socket = io("/world-boss", {
        // socketSetProfile reads socket.handshake.query.token (NOT auth.token)
        query: { token: liff.getAccessToken() },
      });

      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));
      socket.on("snapshot", snap => setSnapshot(snap));
      socket.on("enrage", payload => {
        setEnrageBatch(payload.knockedBatch || []);
        // auto-clear the flash after a few seconds
        setTimeout(() => setEnrageBatch(null), 4000);
      });

      return () => {
        socket.close();
      };
    }, []);

    return { snapshot, enrageBatch, connected };
  }
  ```

- [ ] **Step 2: Verify lint.** `cd frontend && yarn lint src/pages/WorldBoss/useWorldBossSocket.js`. Expected: no errors.

- [ ] **Step 3: Commit.**
  ```bash
  git add frontend/src/pages/WorldBoss/useWorldBossSocket.js
  git commit -m "feat(worldboss): LIFF socket hook for /world-boss snapshots (M8)"
  ```

---

### Task 10 — Frontend: LIFF World Boss page (`pages/WorldBoss/index.jsx`)

The LIFF page: big HP bar (calm green / enrage red), three contribution boards, a scrolling recent feed, role-aware action buttons that POST to the same combat endpoints, an enrage flash banner, and a battle-report card on open (via `getReport`). The boards render `total_damage`/`total_contribution` and the feed renders the `message`/`platformId`-bearing rows (D23/D28) — never a raw numeric DB id.

**Files:**
- Create: `frontend/src/pages/WorldBoss/index.jsx`
- Test: none (no frontend runner; verified by build in Task 11).

**Interfaces:**
- Consumes: Task 8 `services/worldBoss.js`, Task 9 `useWorldBossSocket`, MUI components, `LiffProvider` context for login state (mirror `Janken/index.jsx`).

**Steps:**

- [ ] **Step 1: Confirm the LIFF login hook.** `cd frontend && grep -rn "useLiff\|LiffContext\|isLoggedIn" src/context/LiffProvider.jsx src/pages/Janken/index.jsx | head`. Use whatever hook Janken uses to read login + access token so this page is consistent (assume `useLiff()` exposes `{ isLoggedIn }`; adjust the import to match).

- [ ] **Step 2: Create the page.** Create `frontend/src/pages/WorldBoss/index.jsx`:
  ```jsx
  import { useEffect, useState, useCallback } from "react";
  import {
    Container, Box, Typography, LinearProgress, Stack, Button, Card, CardContent,
    Divider, Alert, Chip,
  } from "@mui/material";
  import useWorldBossSocket from "./useWorldBossSocket";
  import {
    getMe, getReport, postAttack, postBlock, postRevive, postShield,
  } from "../../services/worldBoss";

  const ROLE_ACTIONS = {
    dps: [{ label: "攻擊", fn: () => postAttack("normal") }],
    tank: [{ label: "格擋", fn: postBlock }],
    healer: [
      { label: "復活", fn: postRevive },
      { label: "護盾", fn: postShield },
    ],
  };

  function Board({ title, rows, valueKey }) {
    return (
      <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>{title}</Typography>
          {rows.length === 0 && (
            <Typography variant="caption" color="text.secondary">尚無資料</Typography>
          )}
          {rows.map((r, i) => (
            <Box key={i} display="flex" justifyContent="space-between">
              <Typography variant="body2">#{i + 1}</Typography>
              <Typography variant="body2">{r[valueKey]}</Typography>
            </Box>
          ))}
        </CardContent>
      </Card>
    );
  }

  export default function WorldBoss() {
    const { snapshot, enrageBatch, connected } = useWorldBossSocket();
    const [me, setMe] = useState(null);
    const [report, setReport] = useState(null);
    const [actionMsg, setActionMsg] = useState(null);

    useEffect(() => {
      document.title = "世界王";
      getMe().then(setMe).catch(() => setMe(null));
      getReport().then(r => { if (r.hasReport) setReport(r); }).catch(() => {});
    }, []);

    const runAction = useCallback(async fn => {
      setActionMsg(null);
      try {
        const result = await fn();
        if (result.rejected) {
          setActionMsg({ severity: "warning", text: `無法行動：${result.reason}` });
        } else {
          setActionMsg({ severity: "success", text: "行動成功" });
        }
      } catch (e) {
        const reason = e.response?.data?.reason || e.response?.data?.message || "錯誤";
        setActionMsg({ severity: "error", text: `行動失敗：${reason}` });
      }
    }, []);

    const hpPct = snapshot?.hpPct ?? 100;
    const phase = snapshot?.phase ?? "calm";
    const enraged = phase === "enrage";
    const boards = snapshot?.boards ?? { dps: [], healer: [], tank: [] };
    const role = me?.role;
    const actions = role ? ROLE_ACTIONS[role] || [] : [];

    return (
      <Container maxWidth="md" sx={{ py: 2 }}>
        {!connected && <Alert severity="info" sx={{ mb: 1 }}>連線中…</Alert>}
        {enrageBatch && (
          <Alert severity="error" sx={{ mb: 1 }}>
            世界王暴怒！{enrageBatch.length} 名玩家被擊倒
          </Alert>
        )}
        {report?.card && (
          <Alert severity="success" sx={{ mb: 1 }} onClose={() => setReport(null)}>
            上一場戰報已送達：素材 x{report.reward?.materials ?? 0}
            {report.reward?.stones ? `、女神石 x${report.reward.stones}` : ""}
          </Alert>
        )}

        <Typography variant="h5" gutterBottom>世界王</Typography>
        <Box sx={{ mb: 1 }}>
          <Box display="flex" justifyContent="space-between">
            <Chip size="small" color={enraged ? "error" : "success"} label={enraged ? "暴怒" : "平穩"} />
            <Typography variant="body2">{hpPct}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={hpPct}
            color={enraged ? "error" : "success"}
            sx={{ height: 18, borderRadius: 1, mt: 0.5 }}
          />
        </Box>

        {actionMsg && <Alert severity={actionMsg.severity} sx={{ mb: 1 }}>{actionMsg.text}</Alert>}

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          {actions.length === 0 && (
            <Alert severity="info" sx={{ flex: 1 }}>請先在 LINE 以 #職業 選擇職業</Alert>
          )}
          {actions.map(a => (
            <Button key={a.label} variant="contained" onClick={() => runAction(a.fn)} fullWidth>
              {a.label}
            </Button>
          ))}
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
          <Board title="輸出榜" rows={boards.dps} valueKey="total_damage" />
          <Board title="治療榜" rows={boards.healer} valueKey="total_contribution" />
          <Board title="格擋榜" rows={boards.tank} valueKey="total_contribution" />
        </Stack>

        <Divider sx={{ mb: 1 }} />
        <Typography variant="subtitle2" gutterBottom>最近動態</Typography>
        <Stack spacing={0.5}>
          {(snapshot?.feed ?? []).map((f, i) => (
            <Typography key={i} variant="caption" color="text.secondary">
              {f.message || "有玩家對世界王發動了攻擊"}
            </Typography>
          ))}
        </Stack>
      </Container>
    );
  }
  ```
  Note (D23/D28): the feed renders the custom attack `message` carried by each `getRecentAttackers` row (M6 LEFT-JOINs the custom attack-message source) and falls back to a generic narration when `message` is `null` — it never prints a raw numeric `user_id`.

- [ ] **Step 3: Verify lint.** `cd frontend && yarn lint src/pages/WorldBoss/index.jsx`. Expected: no errors.

- [ ] **Step 4: Commit.**
  ```bash
  git add frontend/src/pages/WorldBoss/index.jsx
  git commit -m "feat(worldboss): LIFF page with HP bar, boards, role actions, enrage banner (M8)"
  ```

---

### Task 11 — Register the LIFF route + production build gate + M8 regression sweep

Wire the page into the kebab route table, prove the frontend builds with the new page tree, then run the full M8 backend suite.

**Files:**
- Modify: `frontend/src/App.jsx` (add import + `<Route path="world-boss" …>` inside the same LIFF-layout `<Route>` group that holds `janken`/`race`/`equipment`).
- Test: production build (no unit runner on the frontend) + M8 backend jest sweep.

**Interfaces:**
- Consumes: Task 10 page.
- Produces: the `world-boss` kebab route.

**Steps:**

- [ ] **Step 1: Confirm the route group + add the import.** `cd frontend && grep -n 'import Equipment\|path="equipment"\|path="janken"' src/App.jsx`. Then, alongside the other page imports, add:
  ```js
  import WorldBoss from "./pages/WorldBoss";
  ```

- [ ] **Step 2: Register the route.** Inside the LIFF-layout route group (the block containing `<Route path="equipment" element={<Equipment />} />`), add:
  ```jsx
  <Route path="world-boss" element={<WorldBoss />} />
  ```

- [ ] **Step 3: Production build gate.** `cd frontend && yarn build 2>&1 | tail -15`. Expected: build succeeds (`✓ built in …`), no unresolved-import or JSX errors. If it fails on a missing `useLiff`/context import, fix the import in `index.jsx` to match what Task 10 Step 1 found, then rebuild.

- [ ] **Step 4: Full M8 backend test sweep (regression gate).** Confirm the M8 backend additions did not break the suite: `cd app && yarn test -- src/handler/WorldBoss src/router/WorldBoss src/service/__tests__/WorldBossBroadcastService.test.js src/service/__tests__/WorldBossReportService.test.js src/service/__tests__/WorldBossSurfaceService.test.js src/router/__tests__/socket.worldboss.test.js src/util/__tests__/worldBossRedis.test.js`. Expected: all M8 suites green.

- [ ] **Step 5: Commit.**
  ```bash
  git add frontend/src/App.jsx
  git commit -m "feat(worldboss): register world-boss LIFF kebab route + build gate (M8)"
  ```

---

**M8 done-criteria (reviewer checklist):** (1) snapshot broadcast is debounced, never per-action — `requestBroadcast` coalesces and returns an awaitable flush Promise; (2) `buildSnapshot` computes HP as `boss.hp − SUM(damage)` via `getRemainHpByEventId`, floors at 0, and NEVER reads a `remain_hp` column (none exists — addendum §6); (3) REST action handlers call M5 `WorldBossCombatService`, never reimplement combat; (4) **`numericUserId` is resolved via `UserModel.getId(platformId)` (= `user.id`), and `MinigameService.findByUserId` is used ONLY for `level`** — a regression test pins `dpsAttack` receiving `user.id` (555), not `minigame_level.id` (123), and a null `getId` returns 409 `no_user` instead of writing a bad FK (addendum §4); (5) boards carry `{ total_damage|total_contribution, numericUserId, platformId }` and the feed carries `{ user_id, platformId, message }` — the snapshot/status text/LIFF render `platformId`/`message`, never a raw numeric id (addendum §4, global blocker); (6) the report-unread flag has exactly ONE writer (`WorldBossReportService.setUnread`) keyed through `worldBossRedis.reportUnreadKey`; M7 settlement calls that setter, not `worldBossRedis.setReportUnread`; (7) socket auth uses `socketSetProfile` via `handshake.query.token`, and the client hook passes `query:{token}` (not `auth:{token}`); (8) report card flag cleared ONLY after a successful surface (`markDelivered` after `res.json` / after `replyFn` resolves); (9) `classifyReply` routes rejected/personal + enrage-trigger to immediate, ordinary hits to batch — no LINE Push anywhere (GC#1); (10) every M8 module reads `config.get(...)` lazily inside functions; (11) every `jest.mock` precedes its `require`.

**Inter-milestone notes for reviewers:**
- M9's controller rewrite MUST import `WorldBossSurfaceService.{classifyReply,surfaceReportCard,buildStatusText}` rather than re-deriving batch-vs-immediate rules, and MUST verify the existing `handleKeepingMessage` batch flush rides a LINE reply token, never Push (Task 7 NO-PUSH note).
- **Single-writer lock:** M7 `settleEvent` sets the report-unread flag via `WorldBossReportService.setUnread(platformId)` — NOT `worldBossRedis.setReportUnread`. Both writer and reader use `worldBossRedis.reportUnreadKey`.
- **Identity lock (addendum §4, verified):** `world_boss_event_log.user_id = user.id`. The REST layer resolves it via `UserModel.getId`; M6's `getDamageRank`/`getContributionRank` return `{ ..., numericUserId, platformId }` (NOT `getTopRank`'s lone `userId`-aliased platform_id); M6's `getRecentAttackers` returns `{ user_id, platformId, message }` (JOIN `user`, LEFT-JOIN custom attack-message). The combat service's returned `knockedBatch` is already numeric→platform_id mapped before M8 forwards it to `emitEnrage`.
- Task 6 Step 0 must confirm the real path/line numbers of the existing admin WorldBoss router (`exports.admin = AdminRouter`), the `api.js` WorldBoss import (line 27) and `/game` mount (line 52), and that the existing `/game/world-boss/feature-messages` CRUD (api.js:392-428) is untouched. Task 8 Step 0 must confirm whether `services/api.js` already prefixes `/api`.

---

## Milestone M9: Cleanup & legacy removal

**Goal:** Remove the legacy 夢幻回歸 (dream-return) attack-revoke feature and its sort bug, fix the broken `getTopTen` reference and the raw-JSON-dump debug commands (`/worldrank` `/allevent` `/bosslist`), correct the `destory`→`destroy` typo with its admin caller, and harden `WorldBossUserAttackMessage.all()` (INNER→LEFT JOIN + `ONLY_FULL_GROUP_BY`-safe dedup) while KEEPING the custom-attack-message feature (D26/D28). Every change ships with a regression test.

> **Scope boundary:** This milestone touches ONLY the legacy/bug surface listed above. It does NOT add the new role/combat commands (`#攻擊` rework, `#格擋`, `#復活`, `#護盾`, `#強化`, `#職業`) — those belong to the combat-facing controller rewrite owned by the controller-rewrite portion of M9's contract entry but are NOT part of this cleanup pass. The new ranking board queries (`getDamageRank`/`getContributionRank`) are produced by **M6**; this milestone only *consumes* `WorldBossLog.getDamageRank` (the MODEL — see access-path lock below) to replace the dead `getTopTen` call.
>
> **NOT in M9 scope — `boss_top_damage` (part of D26):** per addendum §14, the D26 line "結算時把傷害榜 #1 當 `isTopDamage` 餵給 `AchievementEngine.evaluate`" is owned by **M7 settlement** (M7 passes `isTopDamage = (platformId === dpsBoardMvpPlatformId)` inside `settleEvent`). M9 owns ONLY the surface-level D26 fixes (`getTopTen` crash, `/allevent` + `/bosslist` retirement, `destory→destroy`). Do NOT implement any `isTopDamage` / achievement wiring in M9.

> **Global constraints inherited (verbatim):** NO LINE Push API — reply-only / LIFF / pull-based. NO background combat tick. Backend is CommonJS. ESLint: double quotes, es5 trailing commas, 100-char width. Jest in `app/`, run `cd app && yarn test -- <path>`. **`jest.config` has `transform:{}` → `jest.mock(...)` is NOT hoisted → place EVERY `jest.mock(...)` BEFORE any `require()` of the mocked module.** Branch `feat/worldboss-redesign`; never commit to main. Migrations only via `cd app && yarn knex migrate:make <name>`.

> **Cross-milestone ordering note (config ownership):** `app/config/default.json`'s `worldboss.*` block is OWNED by the config milestone (M3 per contract). M9 only *trims* the two orphaned legacy keys (`worldboss.money_revoke_attack_cost`, `worldboss.revoke_charm`) plus two `redis.keys.*`. **M9's `default.json` edits MUST land AFTER M3's `worldboss` block rewrite** so the block is stable when M9 trims it. Conversely, **no milestone may remove `worldboss.revoke_charm` from `default.json` until the controller route referencing it is deleted in the SAME change** — `WorldBossController.js:39` calls `config.get("worldboss.revoke_charm")` at MODULE LOAD, and the `config` package throws on `get()` of an undefined key, which would brick `app.js` startup. Task 3 removes the route line and the config key in one commit to satisfy this.

> **Test-infra facts (verified against `app/__tests__/setup.js`):** `setup.js` is loaded via `setupFiles` and GLOBALLY mocks `../src/util/redis`, `../src/util/connection`, `../src/middleware/validation`, `../src/util/mysql`, `bottender`, `bottender/router`, `imgur`, `../src/util/sqlite`, `../src/util/i18n`, `../src/util/Logger`, `../src/util/discord`. Verified specifics that drive the tests below:
> - The global mysql mock is ONE shared chainable builder `qb` (`qb = jest.fn(() => qb)`). Chain methods (`select`/`from`/`join`/`leftJoin`/`where`/`groupBy`/`orderBy`/`limit`…) return `qb`; terminal methods resolve to fixed stubs (`first→null`, `insert→[0]`, `update→0`, `del→0`, `delete→0`, `count→[{"count(*)":0}]`, `sum→[{sum:0}]`, `raw→[]`). **`qb.then = undefined`** (setup.js:114) so the builder itself is NOT awaitable. Therefore any model method that returns a BARE chain (e.g. `return await mysql(TABLE).delete().where(...)` or `mysql.select("*").from(TABLE).leftJoin(...).groupBy(...)`) never resolves under the global mock — those test files MUST declare their OWN `jest.mock("../../src/util/mysql", …)` BEFORE requiring the model (pattern from `app/__tests__/model/JankenRecords.test.js`).
> - `bottender/router`'s `text` is `jest.fn(() => jest.fn())` (setup.js:141). `getClient("line")` returns a stub with `getProfile`/`getGroupMemberProfile` (setup.js:124-125) but **NO `getUserProfile`** — so any test depending on `LineClient.getUserProfile` MUST mock it explicitly (do not rely on the global stub).
> - `exports.router` is built at controller MODULE-LOAD time and Jest caches the module per worker. **Router-registration assertions are unreliable** unless you require the controller inside `jest.isolateModules` after clearing `text.mock.calls`. Tasks 3–4 use that pattern with a positive control so a stale/empty mock array fails loudly instead of passing vacuously.

> **Access-path lock (resolves the two-callers ambiguity):** the damage-board query is called via the **MODEL** `WorldBossLog.getDamageRank` directly — the SAME path M8's broadcast service uses. The controller already imports it as `worldBossLogModel` (`WorldBossController.js:15`: `const { model: worldBossLogModel } = require("../../model/application/WorldBossLog");`). M9 `worldRank` calls `worldBossLogModel.getDamageRank({ eventId, limit })`. Do NOT add or call a `WorldBossEventLogService.getDamageRank` pass-through.

> **Rank-row shape lock (single source of truth with M6, per addendum §4 + global blocker):** the legacy `getTopRank` (`WorldBossLog.js:156`) selects `sum(damage) as total_damage, user.platform_id as userId` — i.e. it returns ONLY the LINE platform_id ALIASED as `userId`, with no numeric id. M6 SUPERSEDES this with `WorldBossLog.getDamageRank({ eventId, limit })` returning rows shaped **`{ total_damage, numericUserId, platformId }`** (numeric `world_boss_event_log.user_id AS numericUserId` + joined `user.platform_id AS platformId`, GROUP BY `user_id`). For the read-only `/worldrank` display, M9 uses `row.platformId` (the LINE id) for `LineClient.getUserProfile` and `row.total_damage` for the damage figure — no numeric→platform conversion is needed (display, not a grant; the settlement identity GATE does not apply here). **If M6 is unmerged when you start, do Task 5 last; the Task 5 test mocks the model against this exact `{ total_damage, numericUserId, platformId }` shape, so it is independent of M6's merge status.**

---

### Task 1 — Rename `WorldBoss.destory` → `destroy` (model + admin caller)

**Files:**
- Modify: `app/src/model/application/WorldBoss.js` (line 62 — `exports.destory`)
- Modify: `app/src/handler/WorldBoss/admin.js` (line 43 — `WorldBossModel.destory(id)`)
- Test (create): `app/__tests__/model/WorldBossDestroy.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (for callers): `WorldBoss.destroy(id) => Promise` — replaces the misspelled `destory`. Body unchanged: `mysql("world_boss").delete().where({ id })` (chain order verified `WorldBoss.js:62-64`: `.delete()` THEN `.where()`).

> **Scope correction (verified, addendum §8):** the typo lives in exactly TWO places — `WorldBoss.js:62` (the boss TEMPLATE model: `exports.destory`, body verified `mysql(TABLE).delete().where({ id })`) and `app/src/handler/WorldBoss/admin.js:43` (`WorldBossModel.destory(id)`, where `WorldBossModel = require("../../model/application/WorldBoss")`). `WorldBossEvent.js:68` ALREADY exports the correct `destroy` and is **NOT touched**. No other callers (`grep -rn "destory" src/` returns only these two).

Steps:

- [ ] **Step 1: Write the failing regression test.** Create `app/__tests__/model/WorldBossDestroy.test.js`. The model returns a bare chain the global mock cannot resolve, so this file declares its OWN mysql mock. The terminal-method order MUST mirror the real chain `.delete().where({ id })` — i.e. `.delete()` returns the builder, `.where()` resolves to the delete count. Full file:

```js
// jest.mock is NOT hoisted (transform:{}) — declare BEFORE requiring the model.
// Real chain (verified WorldBoss.js:62-64): mysql(TABLE).delete().where({ id })
//   -> .delete() returns the builder, .where() resolves to the affected-row count.
jest.mock("../../src/util/mysql", () => {
  const qb = {
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(1),
  };
  const knex = jest.fn(() => qb);
  knex.__qb = qb;
  return knex;
});

const mysql = require("../../src/util/mysql");
const WorldBoss = require("../../src/model/application/WorldBoss");

describe("WorldBoss model — destroy (renamed from destory)", () => {
  beforeEach(() => {
    mysql.__qb.delete.mockClear();
    mysql.__qb.where.mockClear();
  });

  it("exposes destroy() and no longer exposes the misspelled destory()", () => {
    expect(typeof WorldBoss.destroy).toBe("function");
    expect(WorldBoss.destory).toBeUndefined();
  });

  it("destroy(id) issues a delete scoped to that id (chain order .delete().where)", async () => {
    const result = await WorldBoss.destroy(7);
    expect(mysql).toHaveBeenCalledWith("world_boss");
    expect(mysql.__qb.delete).toHaveBeenCalledTimes(1);
    expect(mysql.__qb.where).toHaveBeenCalledWith({ id: 7 });
    expect(result).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it FAILS.** `cd app && yarn test -- __tests__/model/WorldBossDestroy.test.js`. Expected FAIL: `expect(typeof WorldBoss.destroy).toBe("function")` fails (export still named `destory` → `"undefined"`), and `WorldBoss.destory` is defined (not `undefined`).

- [ ] **Step 3: Rename the export in the model.** In `app/src/model/application/WorldBoss.js`, change lines 62-64:

```js
exports.destory = async id => {
  return await mysql(TABLE).delete().where({ id });
};
```
to:
```js
exports.destroy = async id => {
  return await mysql(TABLE).delete().where({ id });
};
```

- [ ] **Step 4: Update the admin caller.** In `app/src/handler/WorldBoss/admin.js`, change line 43 from:
```js
    await WorldBossModel.destory(id);
```
to:
```js
    await WorldBossModel.destroy(id);
```

- [ ] **Step 5: Run the test and confirm it PASSES.** `cd app && yarn test -- __tests__/model/WorldBossDestroy.test.js`. Expected: 2 passing. Then confirm no stray `destory` remains: `cd app && grep -rn "destory" src/` must return ZERO output.

- [ ] **Step 6: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/src/model/application/WorldBoss.js app/src/handler/WorldBoss/admin.js app/__tests__/model/WorldBossDestroy.test.js && git commit -m "fix(worldboss): rename WorldBoss.destory -> destroy + update admin caller (D26)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019S6Ho4Tu77orukvB73gZHV"
```

---

### Task 2 — Harden `WorldBossUserAttackMessage.all()`: INNER→LEFT JOIN + `ONLY_FULL_GROUP_BY`-safe dedup (KEEP the feature, D28)

**Files:**
- Modify: `app/src/model/application/WorldBossUserAttackMessage.js` (lines 7–16 — `exports.all`)
- Test (create): `app/__tests__/model/WorldBossUserAttackMessage.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `WorldBossUserAttackMessage.all() => Promise<Array<{ id, icon_url, template, creator_id, tag }>>` — now returns EVERY message row (LEFT JOIN, so untagged messages survive with `tag = null`) and never returns the same message id twice (a message mapped to multiple tags collapses to one row, with one representative tag). The controller's `worldBossUserAttackMessageService.all()` and the tag-filtered random sampler continue to work unchanged.

> **Why:** the current `.join(...)` (verified `WorldBossUserAttackMessage.js:11`) is an INNER JOIN against `attack_message_has_tags`, so any custom message NOT yet tagged silently disappears from the random pool, and any message with N tags appears N times (skewing the random weight). D28 keeps the custom-attack-message feature but fixes this.

> **`ONLY_FULL_GROUP_BY` correctness (verified concern):** MySQL 5.7+ defaults to `ONLY_FULL_GROUP_BY`, which REJECTS `SELECT *` with `GROUP BY <one column>` when the select list contains non-aggregated, non-grouped columns (e.g. the joined `tag`). A naive `select("*").groupBy("...id")` passes the mocked test but throws at runtime. The fix below selects the message table's columns explicitly (all functionally dependent on the grouped PK) and wraps the joined `tag` in `MAX(...)` so the query is `ONLY_FULL_GROUP_BY`-legal while still collapsing duplicates and keeping one representative tag.

> **Action item before merge:** run the rewritten query once against the dev DB (`make infra` up) to confirm it executes under the live `sql_mode`. The model columns selected below (`id, icon_url, template, creator_id`) are the verified `world_boss_user_attack_message` columns the controller's sampler reads; if the live schema has more columns the controller reads, add them to the explicit select list.

Steps:

- [ ] **Step 1: Write the failing regression test.** Create `app/__tests__/model/WorldBossUserAttackMessage.test.js`. The model uses the standalone form `mysql.select(...).from(TABLE)...`, and returns a bare chain the global mock cannot resolve, so this file declares its OWN mysql mock. Full file:

```js
// jest.mock is NOT hoisted (transform:{}) — declare BEFORE requiring the model.
jest.mock("../../src/util/mysql", () => {
  const qb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockResolvedValue([
      { id: 1, template: "t1", tag: "a" },
      { id: 2, template: "t2", tag: null },
    ]),
    raw: jest.fn(sql => ({ __raw: sql })),
  };
  const knex = jest.fn(() => qb);
  // Model uses the standalone form: mysql.select(...).from(TABLE)...
  knex.select = qb.select;
  knex.raw = qb.raw;
  knex.__qb = qb;
  return knex;
});

const mysql = require("../../src/util/mysql");
const model = require("../../src/model/application/WorldBossUserAttackMessage");

describe("WorldBossUserAttackMessage.all (D28: LEFT JOIN + ONLY_FULL_GROUP_BY-safe dedup)", () => {
  beforeEach(() => {
    Object.values(mysql.__qb).forEach(fn => fn.mockClear && fn.mockClear());
  });

  it("uses LEFT JOIN, never an INNER join, so untagged messages survive", async () => {
    await model.all();
    expect(mysql.__qb.leftJoin).toHaveBeenCalledTimes(1);
    expect(mysql.__qb.join).not.toHaveBeenCalled();
  });

  it("groups by the message id so a multi-tag message is not duplicated", async () => {
    await model.all();
    expect(mysql.__qb.groupBy).toHaveBeenCalledWith("world_boss_user_attack_message.id");
  });

  it("does not select('*') (ONLY_FULL_GROUP_BY would reject it); aggregates tag via raw", async () => {
    await model.all();
    // select is called with explicit columns, not the bare "*"
    const selectArgs = mysql.__qb.select.mock.calls.flat();
    expect(selectArgs).not.toContain("*");
    // tag is aggregated through a raw MAX(...) expression
    expect(mysql.__qb.raw).toHaveBeenCalled();
    const rawSql = mysql.__qb.raw.mock.calls.map(c => String(c[0])).join(" ");
    expect(rawSql.toLowerCase()).toContain("max");
  });

  it("returns one row per message including the untagged (tag=null) one", async () => {
    const rows = await model.all();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it FAILS.** `cd app && yarn test -- __tests__/model/WorldBossUserAttackMessage.test.js`. Expected FAIL: `leftJoin` never called (current code calls `join`); `groupBy` never called; `raw` never called; and the bare `.join(...)` chain (terminal) returns the builder, not the array, under this mock.

- [ ] **Step 3: Rewrite `all()` in the model.** In `app/src/model/application/WorldBossUserAttackMessage.js`, replace the existing `exports.all` (lines 7–16) with:

```js
exports.all = async () => {
  return await mysql
    .select(
      "world_boss_user_attack_message.id",
      "world_boss_user_attack_message.icon_url",
      "world_boss_user_attack_message.template",
      "world_boss_user_attack_message.creator_id",
      mysql.raw("MAX(`attack_message_has_tags`.`tag`) as `tag`")
    )
    .from(TABLE)
    .leftJoin(
      "attack_message_has_tags",
      "world_boss_user_attack_message.id",
      "attack_message_has_tags.attack_message_id"
    )
    .groupBy("world_boss_user_attack_message.id");
};
```

> `leftJoin` keeps messages that have no tag yet (`tag` comes back `null`). `groupBy` on the message PK collapses multi-tag duplicates to one row. Selecting the message columns explicitly (all functionally dependent on the grouped PK) plus `MAX(tag)` keeps the query legal under `ONLY_FULL_GROUP_BY` while still giving the controller's tag-filtered random sampler one representative tag per message.

- [ ] **Step 4: Run the test and confirm it PASSES.** `cd app && yarn test -- __tests__/model/WorldBossUserAttackMessage.test.js`. Expected: 4 passing.

- [ ] **Step 5 (manual DB smoke, before handoff): execute the real query once.** With infra up (`make infra`), run the rewritten `all()` against the dev DB and confirm it does not throw under the live `sql_mode`:
```
cd app && node -e "require('dotenv').config({path:'../.env'}); require('./src/model/application/WorldBossUserAttackMessage').all().then(r => { console.log('rows', r.length); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });"
```
Expected: prints `rows <n>` with exit 0 (no `ONLY_FULL_GROUP_BY` error). Record the result in the M9 handoff note.

- [ ] **Step 6: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/src/model/application/WorldBossUserAttackMessage.js app/__tests__/model/WorldBossUserAttackMessage.test.js && git commit -m "fix(worldboss): attack-message all() INNER->LEFT join + ONLY_FULL_GROUP_BY-safe dedup, keep feature (D28)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019S6Ho4Tu77orukvB73gZHV"
```

---

### Task 3 — Remove the 夢幻回歸 (revokeAttack) feature + its sort bug, atomically with its config keys (D28)

**Files (ALL edited in this single task/commit so route + config removal land atomically):**
- Modify: `app/src/controller/application/WorldBossController.js`
  - line 25 — `const { get, sample, sortBy, isNull } = require("lodash");` (drop now-unused `sortBy`)
  - lines 30–41 — `exports.router` (remove the `#夢幻回歸` route on line 37 and the `worldboss.revoke_charm` route on line 39)
  - lines 47–55 — `revokeCharm` function (delete; JSDoc starts at line 43)
  - lines 87–173 — `revokeAttack` function (delete; JSDoc starts at line 83; contains the sort bug at line 161 — `sortBy(todayLogs, ...)` references the *function* `todayLogs`, not its result)
- Modify: `app/src/middleware/umamiTrack.js` (line 48 — remove the `worldboss_revoke` tracker entry)
- Modify: `app/config/default.json` (remove `worldboss.money_revoke_attack_cost` (line 30), `worldboss.revoke_charm` (line 31), and the two orphaned `redis.keys.revokeHasCharm` (line 18) / `redis.keys.todayHasRevoke` (line 19))
- Test (create): `app/__tests__/controller/WorldBossRouterCleanup.test.js`
- Test (create): `app/__tests__/controller/WorldBossControllerLoads.test.js` (startup smoke test)

**Interfaces:**
- Consumes: nothing.
- Produces: `WorldBossController.router` no longer contains any revoke route; `revokeAttack`/`revokeCharm` no longer exist on the module. No new exports.

> **The sort bug being removed (verified, line 161):** `const sortedByDamage = sortBy(todayLogs, ["damage"]);` — `todayLogs` here is the imported *function reference* (defined at line 61), not the user's actual log array. `sortBy` on a function yields `[]`, so `sortedByDamage[0]` is `undefined` and `const { id: logId, damage } = sortedByDamage[0];` (line 162) throws `TypeError: Cannot destructure property 'id' of 'undefined'`. The whole feature is deleted per D28, so the bug evaporates with it.

> **Atomicity requirement (verified startup risk):** `WorldBossController.js:39` is `text(config.get("worldboss.revoke_charm"), revokeCharm)`, evaluated at MODULE LOAD. The `config` package throws on `get()` of an undefined key. If `worldboss.revoke_charm` were removed from `default.json` while the route line still referenced it, requiring the controller (and therefore `app.js`) would throw `Configuration property "worldboss.revoke_charm" is not defined` and brick startup. This task therefore removes the route line (Step 3) and the config key (Step 8) in the SAME commit, and Step 9 adds a smoke test that requires the controller and asserts no throw.

Steps:

- [ ] **Step 0: Verify the config key paths exist exactly (before any deletion).** Run:
```
cd app && node -e "const c=require('config'); console.log('revoke_charm', c.has('worldboss.revoke_charm'), '| money_revoke', c.has('worldboss.money_revoke_attack_cost'), '| revokeHasCharm', c.has('redis.keys.revokeHasCharm'), '| todayHasRevoke', c.has('redis.keys.todayHasRevoke'));"
```
Expected (verified): all four `true`. (If any prints `false`, M3's `worldboss` rewrite has not yet landed or moved a key — STOP and reconcile before deleting; see the cross-milestone ordering note above.)

- [ ] **Step 1: Write the failing regression test.** Create `app/__tests__/controller/WorldBossRouterCleanup.test.js`. Because `exports.router` is built at module-load and Jest caches the module, we require the controller inside `jest.isolateModules` AFTER clearing `text.mock.calls`, so the recorded calls are EXACTLY this controller's registrations. A positive control (a known-surviving verb) guards against a stale/empty mock array passing vacuously. Full file:

```js
// Global setup.js mocks bottender/router's text as jest.fn(() => jest.fn()), recording calls.
// We rely solely on the global setup mocks here.
const { text } = require("bottender/router");

/**
 * Load the controller in isolation and return the flattened list of verb
 * strings/patterns passed to text() during THIS load (not stale/cached calls).
 */
function loadControllerVerbs() {
  let controller;
  text.mockClear(); // wipe any calls recorded by earlier requires in this worker
  jest.isolateModules(() => {
    controller = require("../../src/controller/application/WorldBossController");
  });
  const flat = text.mock.calls
    .map(call => call[0])
    .flat()
    .map(v => (v instanceof RegExp ? v.source : String(v)));
  return { controller, flat };
}

describe("WorldBossController — 夢幻回歸 removal (D28)", () => {
  it("registers no #夢幻回歸 route", () => {
    const { flat } = loadControllerVerbs();
    expect(flat.some(v => v.includes("夢幻回歸"))).toBe(false);
  });

  it("registers no revoke-charm incantation route", () => {
    const { flat } = loadControllerVerbs();
    // the incantation string starts with 隱匿於夜
    expect(flat.some(v => v.includes("隱匿於夜"))).toBe(false);
  });

  it("no longer exports revokeAttack / revokeCharm", () => {
    const { controller } = loadControllerVerbs();
    expect(controller.revokeAttack).toBeUndefined();
    expect(controller.revokeCharm).toBeUndefined();
  });

  it("POSITIVE CONTROL: still registers the surviving routes (攻擊 / 世界王 / 冒險小卡)", () => {
    const { flat } = loadControllerVerbs();
    // If this fails, the mock array is stale/empty and the negative assertions above are vacuous.
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.some(v => v.includes("攻擊"))).toBe(true);
    expect(flat.some(v => v.includes("世界王") || v.includes("worldboss"))).toBe(true);
    expect(flat.some(v => v.includes("冒險小卡"))).toBe(true);
  });
});

module.exports = { loadControllerVerbs };
```

> Note: `revokeAttack`/`revokeCharm` are module-local `function` declarations, never exported, so the "no longer exports" test is a *guard* against anyone re-introducing them as exports. The load-time-failing assertions are the first two: they fail today because the routes ARE registered. The positive control makes the negatives meaningful. `loadControllerVerbs` is exported so Task 4 can reuse it.

- [ ] **Step 2: Run the test and confirm it FAILS.** `cd app && yarn test -- __tests__/controller/WorldBossRouterCleanup.test.js`. Expected FAIL: "registers no #夢幻回歸 route" fails (the string `"#夢幻回歸"` is in the captured calls), and "registers no revoke-charm incantation route" fails (the incantation from `config.get("worldboss.revoke_charm")` is registered). The positive control should PASS even now (routes load fine today).

- [ ] **Step 3: Remove the two revoke routes from the router.** In `app/src/controller/application/WorldBossController.js`, edit `exports.router` (lines 30–41). Delete these two lines:
```js
  text("#夢幻回歸", revokeAttack),
```
```js
  text(config.get("worldboss.revoke_charm"), revokeCharm),
```
The router becomes (note: `/bosslist` and `/allevent` are removed later in Task 4):
```js
exports.router = [
  text("#冒險小卡", myStatus),
  text("/bosslist", bosslist),
  text(["/worldboss", "#世界王"], bossEvent),
  text("/allevent", all),
  text("/worldrank", worldRank),
  text(/^[.#/](攻擊|attack)$/, withProps(attack, { attackType: "normal" })),
  text(/^[#]傷害[紀記]錄/, todayLogs),
  text(/^[#＃]裝備$/, showEquipment),
];
```

- [ ] **Step 4: Delete the `revokeCharm` function.** Remove its JSDoc block (lines 43–46) + the `async function revokeCharm(context) { … }` body (lines 47–55, ending at the closing brace before `todayLogs`'s JSDoc).

- [ ] **Step 5: Delete the `revokeAttack` function.** Remove its JSDoc block (lines 83–86) + the whole `async function revokeAttack(context) { … }` (lines 87–173, ending at the `}` before the `attack` JSDoc). This deletes the sort bug.

- [ ] **Step 6: Drop the now-unused `sortBy` import.** On line 25, change:
```js
const { get, sample, sortBy, isNull } = require("lodash");
```
to:
```js
const { get, sample, isNull } = require("lodash");
```
Confirm `sortBy` has no other use: `grep -n "sortBy" app/src/controller/application/WorldBossController.js` must return nothing after this edit.

- [ ] **Step 7: Remove the umami tracker entry.** In `app/src/middleware/umamiTrack.js`, delete line 48:
```js
  { pattern: /^#夢幻回歸$/, name: "worldboss_revoke", category: "application" },
```

- [ ] **Step 8: Remove the orphaned config keys (SAME commit as Step 3).** First confirm nothing else references the redis keys now that the controller functions are gone: `cd app && grep -rn "revokeHasCharm\|todayHasRevoke" src/` must be empty. Then, in `app/config/default.json`:
  - Under `worldboss` (verified lines 30–31), delete:
    ```jsonc
        "money_revoke_attack_cost": 10000,
        "revoke_charm": "隱匿於夜之黑暗，撫慰心靈的爆裂之炎，吾以幻夢之名，呼喚初晨的重生，在夢幻之境、遺落之地，引領破碎時光的歸來吧。",
    ```
    (The preceding `"penalty_rate": 0.1,` (line 29) keeps its trailing comma; the following `"manual"` (line 32) is unaffected — valid JSON.)
  - Under `redis.keys` (verified lines 18–19), delete:
    ```jsonc
          "revokeHasCharm": "revokeHasCharm:%s",
          "todayHasRevoke": "todayHasRevoke:%s:%s"
    ```
    **Trailing-comma fix (verified):** the line immediately before is `"groupSession": "group:session:%s",` (line 17, has a trailing comma). After deleting the two revoke keys, `"groupSession"` becomes the LAST key in the `redis.keys` object — remove its trailing comma so it reads `"groupSession": "group:session:%s"` before the closing `}`. (`default.json` is strict JSON, no trailing commas allowed.)
  - Validate JSON and confirm the keys are gone:
    ```
    cd app && node -e "require('./config/default.json'); console.log('json ok')" && node -e "const c=require('config'); console.log('after:', c.has('worldboss.revoke_charm'), c.has('worldboss.money_revoke_attack_cost'), c.has('redis.keys.revokeHasCharm'), c.has('redis.keys.todayHasRevoke'));"
    ```
    Expected: `json ok` then `after: false false false false`.

- [ ] **Step 9: Add a controller-loads smoke test.** Create `app/__tests__/controller/WorldBossControllerLoads.test.js` — requiring the controller must NOT throw (proves the route line and the config key were removed atomically; a missing config key would throw at load):

```js
// Relies on global setup.js mocks. config is the REAL package (not mocked),
// so a dangling config.get("worldboss.revoke_charm") at load WOULD throw here.
describe("WorldBossController module load (atomic config/route removal guard, D28)", () => {
  it("requires without throwing (no dangling config.get on removed keys)", () => {
    let controller;
    expect(() => {
      jest.isolateModules(() => {
        controller = require("../../src/controller/application/WorldBossController");
      });
    }).not.toThrow();
    expect(Array.isArray(controller.router)).toBe(true);
  });
});
```

- [ ] **Step 10: Run the tests and confirm they PASS.** `cd app && yarn test -- __tests__/controller/WorldBossRouterCleanup.test.js __tests__/controller/WorldBossControllerLoads.test.js`. Expected: 4 + 1 = 5 passing. Then lint: `cd app && yarn lint -- src/controller/application/WorldBossController.js` (no `no-unused-vars` for `sortBy`/`revokeAttack`/`revokeCharm`).

- [ ] **Step 11: Commit (route + config + umami + tests in ONE commit).**
```
cd /home/hanshino/workspace/redive_linebot && git add app/src/controller/application/WorldBossController.js app/src/middleware/umamiTrack.js app/config/default.json app/__tests__/controller/WorldBossRouterCleanup.test.js app/__tests__/controller/WorldBossControllerLoads.test.js && git commit -m "feat(worldboss): remove 夢幻回歸 revoke feature + its sortBy bug, drop orphaned config atomically (D28)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019S6Ho4Tu77orukvB73gZHV"
```

---

### Task 4 — Retire the raw-JSON-dump debug commands `/allevent` and `/bosslist` (D26)

**Files:**
- Modify: `app/src/controller/application/WorldBossController.js`
  - lines 30–41 — `exports.router` (remove the `/bosslist` route on line 32 and the `/allevent` route on line 34)
  - lines 332–339 — `all()` function (delete; JSDoc at lines 329–331; body `context.replyText(JSON.stringify(...))`)
  - lines 345–347 — `bosslist()` function (delete; JSDoc at lines 342–344; body `context.replyText(JSON.stringify(...))`)
  - line 6 — `const worldBossModel = require("../../model/application/WorldBoss");` (drop if `bosslist` was its only user — verify)
- Test (modify): `app/__tests__/controller/WorldBossRouterCleanup.test.js` (add assertions, reusing the exported `loadControllerVerbs`)

**Interfaces:**
- Consumes: nothing.
- Produces: `WorldBossController.router` no longer registers `/allevent` or `/bosslist`; `all`/`bosslist` functions removed. (`/worldrank` is *fixed*, not retired — Task 5.)

> **Why retire vs. rebuild:** `/allevent` (line 339) and `/bosslist` (line 347) are admin debug dumps (`JSON.stringify` straight to chat) with no player value; D26 says retire raw JSON dumps. The proper boss-status surface for players is `#世界王` (`bossEvent`, already a Flex carousel) and the proper ranking is `/worldrank` (fixed in Task 5). So `/allevent` and `/bosslist` are simply removed.

Steps:

- [ ] **Step 1: Add the failing assertions to the existing cleanup test.** In `app/__tests__/controller/WorldBossRouterCleanup.test.js`, import the exported helper at the top of the new block and append a new `describe`:

```js
const { loadControllerVerbs } = require("./WorldBossRouterCleanup.test");

describe("WorldBossController — raw JSON dump commands retired (D26)", () => {
  it("registers no /allevent route", () => {
    const { flat } = loadControllerVerbs();
    expect(flat.some(v => v.includes("/allevent"))).toBe(false);
  });

  it("registers no /bosslist route", () => {
    const { flat } = loadControllerVerbs();
    expect(flat.some(v => v.includes("/bosslist"))).toBe(false);
  });

  it("no longer exports all / bosslist debug handlers", () => {
    const { controller } = loadControllerVerbs();
    expect(controller.all).toBeUndefined();
    expect(controller.bosslist).toBeUndefined();
  });

  it("POSITIVE CONTROL: /worldrank survives (it is fixed, not retired)", () => {
    const { flat } = loadControllerVerbs();
    expect(flat.some(v => v.includes("/worldrank"))).toBe(true);
  });
});
```

> Since this block lives in the SAME file as the helper definition, `loadControllerVerbs` is already in lexical scope — the `require("./WorldBossRouterCleanup.test")` line is redundant if you append directly below the Task 3 block, so prefer appending the new `describe` in the same file body and dropping that import. Keep the helper-reuse: do NOT redefine it.

- [ ] **Step 2: Run and confirm FAIL.** `cd app && yarn test -- __tests__/controller/WorldBossRouterCleanup.test.js`. Expected FAIL: "registers no /allevent route" and "registers no /bosslist route" fail — both verbs are still in the captured calls. The positive control (`/worldrank` survives) PASSES.

- [ ] **Step 3: Remove the two routes from the router.** In `WorldBossController.js`, delete from `exports.router`:
```js
  text("/bosslist", bosslist),
```
```js
  text("/allevent", all),
```
Router now (after Task 3 + Task 4 removals):
```js
exports.router = [
  text("#冒險小卡", myStatus),
  text(["/worldboss", "#世界王"], bossEvent),
  text("/worldrank", worldRank),
  text(/^[.#/](攻擊|attack)$/, withProps(attack, { attackType: "normal" })),
  text(/^[#]傷害[紀記]錄/, todayLogs),
  text(/^[#＃]裝備$/, showEquipment),
];
```

- [ ] **Step 4: Delete the `all` function.** Remove its JSDoc (lines 329–331) + `async function all(context) { … }` (lines 332–340).

- [ ] **Step 5: Delete the `bosslist` function.** Remove its JSDoc (lines 342–344) + `async function bosslist(context) { … }` (lines 345–348).

- [ ] **Step 6: Drop the now-unused `worldBossModel` import.** `bosslist` was its only consumer (`worldBossModel.all()`, line 346). Verify: `grep -n "worldBossModel\b" app/src/controller/application/WorldBossController.js` — if no hits remain, delete line 6:
```js
const worldBossModel = require("../../model/application/WorldBoss");
```
(Note: `worldBossLogModel` on line 15 is a DIFFERENT import and stays.)

- [ ] **Step 7: Run and confirm PASS.** `cd app && yarn test -- __tests__/controller/WorldBossRouterCleanup.test.js __tests__/controller/WorldBossControllerLoads.test.js`. Expected: Task 3's 4 + Task 4's 4 in RouterCleanup + the 1 loads smoke = all passing. Lint: `cd app && yarn lint -- src/controller/application/WorldBossController.js` (no unused `worldBossModel`).

- [ ] **Step 8: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/src/controller/application/WorldBossController.js app/__tests__/controller/WorldBossRouterCleanup.test.js && git commit -m "feat(worldboss): retire /allevent + /bosslist raw JSON dump commands (D26)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019S6Ho4Tu77orukvB73gZHV"
```

---

### Task 5 — Fix `/worldrank`: replace the dead `getTopTen` call with the M6 `getDamageRank` board query + proper Flex (D26)

**Files:**
- Modify: `app/src/controller/application/WorldBossController.js`
  - lines 299–327 — `worldRank()` function (JSDoc at 299–301, body at 302–327; currently calls the non-existent `worldBossEventLogService.getTopTen` at line 315 and dumps `JSON.stringify` at line 326)
- Test (create): `app/__tests__/controller/WorldBossWorldRank.test.js`

**Interfaces:**
- Consumes:
  - `worldBossLogModel.getDamageRank({ eventId, limit }) => Promise<[{ total_damage, numericUserId, platformId }]>` (M6, MODEL — locked access path; already imported as `worldBossLogModel` at `WorldBossController.js:15`).
  - `worldBossEventService.getCurrentEvent() => Promise<Array<event>>` (existing, verified used at lines 304/355).
  - `worldBossTemplate.generateRankBox({ rank, name, damage })` (verified exported at `templates/application/WorldBoss.js:518`) + `worldBossTemplate.generateTopTenRank(rankBoxes)` (verified at `:456`).
  - `LineClient.getUserProfile(platformId)` (verified used by `bossEvent` at line 380); `context.replyFlex(altText, contents)` (verified the real Bottender LINE method, used at lines 293/426/441); `DefaultLogger` (verified imported, line 21); lodash `get` (line 25); `i18n` (line 20).
- Produces: `worldRank(context)` now replies a proper Flex ranking bubble (never raw JSON) and no longer references `getTopTen`. Newly EXPORTED as `exports.worldRank` so the test can drive it directly (mirrors `exports.attackOnBoss` at line 644).

> **The bug being fixed (verified):** `worldBossEventLogService.getTopTen` does NOT exist — the service exports only `getTopRank` (`WorldBossEventLogService.js:24`, which is `worldBossLogModel.getTopRank`). So `/worldrank` throws `TypeError: worldBossEventLogService.getTopTen is not a function` on every call (`WorldBossController.js:315`). D26 says fix it. We swap to M6's MODEL query `worldBossLogModel.getDamageRank({ eventId, limit })` and render with the SAME Flex builders `bossEvent` already uses (`generateRankBox` / `generateTopTenRank`, lines 401/409).

> **Identity-shape correctness (global blocker + addendum §4):** the legacy `bossEvent` path reads `data.userId`/`data.total_damage` because `getTopRank` aliases `platform_id AS userId`. M9 does NOT reuse that alias — it uses M6's `getDamageRank` whose rows are `{ total_damage, numericUserId, platformId }`. `worldRank` reads `row.platformId` for `LineClient.getUserProfile` and `row.total_damage` for the figure. This is a read-only DISPLAY (not a grant), so the settlement identity GATE (`resolveUserIds`) does NOT apply here — but the field NAME must match M6's shape exactly, or the profile lookup keys on `undefined`.

> **Symbol-availability check (verified — no missing requires):** `LineClient` (line 23), `DefaultLogger` (line 21), `worldBossTemplate` (line 12), `i18n` (line 20), `get` from lodash (line 25), and `worldBossLogModel` (line 15) are ALL already imported in the controller. `generateRankBox`/`generateTopTenRank` are exported by the template module (verified). `context.replyFlex(altText, contents)` is the real method used three times already in this file. No new `require` is needed for Task 5.

Steps:

- [ ] **Step 1: Write the failing regression test.** Create `app/__tests__/controller/WorldBossWorldRank.test.js`. Mock the event service, the LOG MODEL (`getDamageRank`), the template, and `LineClient.getUserProfile` explicitly (the global `getClient` stub has NO `getUserProfile`). Require the controller in `jest.isolateModules` so the build-time router registration in the same module does not leak across files. `jest.mock` BEFORE requires. Full file:

```js
// jest.mock is NOT hoisted (transform:{}) — every mock BEFORE requires.
// Global setup.js already mocks mysql/redis/i18n/bottender/router/Logger/connection.

jest.mock("../../src/service/WorldBossEventService", () => ({
  getCurrentEvent: jest.fn(),
}));

// The controller imports the MODEL as { model: worldBossLogModel } from WorldBossLog.
// Mock the model's getDamageRank (the locked access path; same as M8).
jest.mock("../../src/model/application/WorldBossLog", () => ({
  model: {
    getDamageRank: jest.fn(),
    // intentionally NO getTopTen — if the controller still calls it, it throws.
  },
}));

jest.mock("../../src/templates/application/WorldBoss", () => ({
  generateRankBox: jest.fn(args => ({ box: args })),
  generateTopTenRank: jest.fn(boxes => ({ type: "bubble", boxes })),
}));

// getClient("line") global stub lacks getUserProfile — define it explicitly.
const { getClient } = require("bottender");
const lineClient = getClient("line");
lineClient.getUserProfile = jest.fn();

const worldBossEventService = require("../../src/service/WorldBossEventService");
const { model: worldBossLogModel } = require("../../src/model/application/WorldBossLog");
const worldBossTemplate = require("../../src/templates/application/WorldBoss");

let controller;
jest.isolateModules(() => {
  controller = require("../../src/controller/application/WorldBossController");
});

function makeContext() {
  return {
    event: { source: { type: "group" } },
    replyText: jest.fn(),
    replyFlex: jest.fn(),
  };
}

describe("WorldBossController.worldRank (/worldrank fix, D26)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("replies a Flex ranking (never replyText) using getDamageRank with platformId", async () => {
    worldBossEventService.getCurrentEvent.mockResolvedValue([{ id: 42 }]);
    worldBossLogModel.getDamageRank.mockResolvedValue([
      { total_damage: 5000, numericUserId: 1, platformId: "Uaaa" },
      { total_damage: 3000, numericUserId: 2, platformId: "Ubbb" },
    ]);
    lineClient.getUserProfile.mockResolvedValue({ displayName: "Tester" });

    const context = makeContext();
    await controller.worldRank(context);

    // MODEL access path, correct args
    expect(worldBossLogModel.getDamageRank).toHaveBeenCalledWith({ eventId: 42, limit: 10 });
    // profile lookup keyed on the LINE platformId field (locked M6 shape)
    expect(lineClient.getUserProfile).toHaveBeenCalledWith("Uaaa");
    expect(lineClient.getUserProfile).toHaveBeenCalledWith("Ubbb");
    // one rank box per ranked player
    expect(worldBossTemplate.generateRankBox).toHaveBeenCalledTimes(2);
    // replies Flex, and NEVER dumps to replyText on the success path
    expect(context.replyFlex).toHaveBeenCalledTimes(1);
    expect(context.replyText).toHaveBeenCalledTimes(0);
  });

  it("falls back to 路人N when a profile lookup fails (does not crash the whole reply)", async () => {
    worldBossEventService.getCurrentEvent.mockResolvedValue([{ id: 7 }]);
    worldBossLogModel.getDamageRank.mockResolvedValue([
      { total_damage: 100, numericUserId: 9, platformId: "Uzzz" },
    ]);
    lineClient.getUserProfile.mockRejectedValue(new Error("not in group"));

    const context = makeContext();
    await controller.worldRank(context);

    expect(context.replyFlex).toHaveBeenCalledTimes(1);
    expect(worldBossTemplate.generateRankBox).toHaveBeenCalledWith(
      expect.objectContaining({ name: "路人1", damage: 100, rank: 1 })
    );
  });

  it("replies a plain message when no event is ongoing", async () => {
    worldBossEventService.getCurrentEvent.mockResolvedValue([]);
    const context = makeContext();
    await controller.worldRank(context);
    expect(worldBossLogModel.getDamageRank).not.toHaveBeenCalled();
    expect(context.replyText).toHaveBeenCalledTimes(1);
    expect(context.replyFlex).not.toHaveBeenCalled();
  });

  it("replies a plain message when multiple events are ongoing", async () => {
    worldBossEventService.getCurrentEvent.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const context = makeContext();
    await controller.worldRank(context);
    expect(worldBossLogModel.getDamageRank).not.toHaveBeenCalled();
    expect(context.replyText).toHaveBeenCalledTimes(1);
    expect(context.replyFlex).not.toHaveBeenCalled();
  });
});
```

> The success-path assertion is `replyText` called 0 times + `replyFlex` called once — this is a stronger guard than pattern-matching a dumped string (it catches any future regression that dumps an object or scalar to chat, not just arrays starting with `[`). `LineClient.getUserProfile` is mocked explicitly, not via the global `getClient` stub.

- [ ] **Step 2: Run and confirm FAIL.** `cd app && yarn test -- __tests__/controller/WorldBossWorldRank.test.js`. Expected FAIL: `controller.worldRank` is `undefined` (not yet exported) → "TypeError: controller.worldRank is not a function" on the first test.

- [ ] **Step 3: Rewrite `worldRank` and export it.** In `app/src/controller/application/WorldBossController.js`, replace the entire `worldRank` JSDoc + function (lines 299–327) with:

```js
/**
 * 顯示目前世界王的傷害排行榜（D26：取代失效的 getTopTen + JSON dump）
 * @param {Context} context
 */
async function worldRank(context) {
  const events = await worldBossEventService.getCurrentEvent();

  if (events.length > 1) {
    context.replyText(i18n.__("message.world_boss_event_multiple_ongoing"));
    return;
  } else if (events.length === 0) {
    context.replyText(i18n.__("message.world_boss_event_no_ongoing"));
    return;
  }

  const eventId = events[0].id;
  // MODEL access path (same as M8 broadcast). Rows: { total_damage, numericUserId, platformId }.
  const ranked = await worldBossLogModel.getDamageRank({ eventId, limit: 10 });

  const rankBoxes = await Promise.all(
    ranked.map(async (row, index) => {
      let displayName = `路人${index + 1}`;
      try {
        const profile = await LineClient.getUserProfile(row.platformId);
        displayName = get(profile, "displayName", displayName);
      } catch (e) {
        DefaultLogger.debug(`worldRank profile miss ${row.platformId}: ${e.message}`);
      }
      return worldBossTemplate.generateRankBox({
        name: displayName,
        damage: row.total_damage,
        rank: index + 1,
      });
    })
  );

  const rankBubble = worldBossTemplate.generateTopTenRank(rankBoxes);
  context.replyFlex("世界王傷害排行", rankBubble);
}

exports.worldRank = worldRank;
```

> Notes: (1) `getDamageRank` returns `platformId` (LINE id) per the locked M6 shape (addendum §4) — exactly what `LineClient.getUserProfile` expects; no numeric→platform conversion (read-only display, not a grant, so the settlement identity GATE does not apply). (2) Profile lookups are wrapped in try/catch so one un-fetchable user does not blow up the whole ranking (mirrors `bossEvent`'s `路人N` fallback at line 402). (3) `/worldrank` is pull-based → immediate `replyFlex` is correct and does NOT use the 5-min batch (the batch is only for the auto-broadcast path inside `attackOnBoss`/`handleKeepingMessage`).

- [ ] **Step 4: Run and confirm PASS.** `cd app && yarn test -- __tests__/controller/WorldBossWorldRank.test.js`. Expected: 4 passing.

- [ ] **Step 5: Run the whole M9 test set + lint as a regression sweep.**
```
cd app && yarn test -- __tests__/model/WorldBossDestroy.test.js __tests__/model/WorldBossUserAttackMessage.test.js __tests__/controller/WorldBossRouterCleanup.test.js __tests__/controller/WorldBossControllerLoads.test.js __tests__/controller/WorldBossWorldRank.test.js && yarn lint -- src/controller/application/WorldBossController.js src/model/application/WorldBoss.js src/model/application/WorldBossUserAttackMessage.js
```
Expected: all green, no lint errors.

- [ ] **Step 6: Commit.**
```
cd /home/hanshino/workspace/redive_linebot && git add app/src/controller/application/WorldBossController.js app/__tests__/controller/WorldBossWorldRank.test.js && git commit -m "fix(worldboss): /worldrank uses getDamageRank board + Flex, drop dead getTopTen (D26)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019S6Ho4Tu77orukvB73gZHV"
```

---

### Verification gate for M9 (before handing off)

- [ ] **All five new test files green:** `cd app && yarn test -- WorldBoss` (matches the `WorldBoss*` test files). Confirm zero failures.
- [ ] **No dangling references to removed symbols:**
```
cd app && grep -rn "destory\|getTopTen\|revokeAttack\|revokeCharm\|money_revoke_attack_cost\|revoke_charm\|todayHasRevoke\|revokeHasCharm\|worldboss_revoke" src/ config/
```
Expected: ZERO output.
- [ ] **`default.json` is valid JSON and the four keys are gone:** `cd app && node -e "require('./config/default.json'); console.log('ok')" && node -e "const c=require('config'); console.log(c.has('worldboss.revoke_charm'), c.has('worldboss.money_revoke_attack_cost'), c.has('redis.keys.revokeHasCharm'), c.has('redis.keys.todayHasRevoke'));"` → `ok` then `false false false false`.
- [ ] **Controller loads without throwing:** `cd app && yarn test -- __tests__/controller/WorldBossControllerLoads.test.js` green (proves atomic config/route removal).
- [ ] **`WorldBossUserAttackMessage.all()` real-DB smoke executed** (Task 2 Step 5) under live `sql_mode` — recorded in handoff note.
- [ ] **Lint clean on every touched file** (command in Task 5 Step 5).

---

**Findings the orchestrator should know (verified against source):**
- `getTopTen` is referenced ONLY at `WorldBossController.js:315` and is **defined nowhere** (`grep -rn "getTopTen" src/` returns only that line) — `/worldrank` is currently a hard runtime crash. Task 5 fixes it via M6's MODEL `WorldBossLog.getDamageRank` (locked access path = same as M8).
- **M6 rank-row shape is locked to `{ total_damage, numericUserId, platformId }`** (addendum §4 + global blocker), NOT `getTopRank`'s legacy `platform_id AS userId` alias. M9 reads `row.platformId` for the profile lookup. If M6 ships a different shape, M9 Task 5 + its test must be updated in lockstep.
- **`boss_top_damage` (D26) is NOT in M9 scope** — per addendum §14 it is owned by M7 settlement (`isTopDamage = (platformId === dpsBoardMvpPlatformId)` into `AchievementEngine.evaluate`). M9 owns only the surface D26 fixes.
- The 夢幻回歸 sort bug is real: `WorldBossController.js:161` does `sortBy(todayLogs, ["damage"])` where `todayLogs` is the *function* (line 61), not log data → guaranteed `TypeError` at line 162. Removed wholesale in Task 3.
- `destory` is misspelled in exactly TWO places (addendum §8): `WorldBoss.js:62` (def, chain `mysql(TABLE).delete().where({ id })`) and `handler/WorldBoss/admin.js:43` (caller). `WorldBossEvent.js:68` already has the correct `destroy` and is NOT touched. No other callers.
- `WorldBossUserAttackMessage.all()` (verified line 11) uses an INNER `.join` on `attack_message_has_tags`, dropping untagged messages and duplicating multi-tag ones. Task 2 switches to `leftJoin` + `groupBy("world_boss_user_attack_message.id")` with explicit message columns + `MAX(tag)` so it is `ONLY_FULL_GROUP_BY`-safe.
- Removing the revoke feature orphans 4 config keys (`worldboss.money_revoke_attack_cost`@L30, `worldboss.revoke_charm`@L31, `redis.keys.revokeHasCharm`@L18, `redis.keys.todayHasRevoke`@L19) and one umami tracker (`worldboss_revoke`@`umamiTrack.js:48`), ALL removed in Task 3 — the config-key removal lands in the SAME commit as the route removal (startup safety: `config.get` throws on undefined keys at module load).
- `redis.keys` trailing-comma fix required: `"groupSession"`@L17 becomes the last key after deletion → drop its trailing comma.
- Reply method `context.replyFlex(altText, contents)` is the REAL Bottender LINE method (verified used at `WorldBossController.js:293/426/441`) — Task 5 correctly uses it.
- `LineClient`, `DefaultLogger`, `worldBossTemplate`, `i18n`, lodash `get`, and `worldBossLogModel` are ALL already imported in the controller; `generateRankBox`@L518 / `generateTopTenRank`@L456 are exported by the template module — Task 5 needs no new `require`.
- Test infra (`app/__tests__/setup.js`, verified): global mocks for mysql/redis/i18n/bottender/router/Logger/connection/validation; `qb.then = undefined`@L114; terminal `delete→0`; `text`@L141 is `jest.fn(()=>jest.fn())`; `getClient("line")` stub has `getProfile`/`getGroupMemberProfile` but NO `getUserProfile`. Router-registration tests use `jest.isolateModules` + `text.mockClear()` + a positive control; the worldRank test mocks `getUserProfile` explicitly. Model methods returning bare query chains need a per-file `jest.mock("../../src/util/mysql", …)` (pattern from `__tests__/model/JankenRecords.test.js`).

---

## Milestone M10: Acceptance gate: Monte-Carlo cold-start sim

**Goal:** Ship a runnable acceptance GATE that drives the REAL `WorldBossCombatService.dpsAttack` (created M4) against in-memory fakes wired to the LOCK's exact collaborator names, proving an all-DPS server (zero healers, zero tanks) brings the daily boss HP to 0 under default `worldboss.*` knobs and cold-start scaling — and asserting the boss is NOT trivially killed in 1–2 hits.

> **Authoritative conformance (LOCK supersedes the addendum and the prior draft):**
> - **LOCK §C — `worldBossRedis` exports are exactly the eight names** `poolAdd / poolPopMin / poolScore / poolRemove / shieldSet / shieldConsume / blockSet / blockOwner`. The prior draft's `addToPool / popOldest / isKnockedDown / recoverIfExpired / openBlockWindow / consumeBlockSlot / setShield / consumeShield` are FORBIDDEN and removed. Lazy natural-recovery lives in the combat service (`poolScore` → if `score + recoveryMinutes*60000 <= now` then `poolRemove` and treat as recovered), NOT in the util — so the fake exposes `poolScore`/`poolRemove`, never a `recoverIfExpired`.
> - **LOCK §B — pool / shield / block identity = `platform_id`** (one uniform string key space). This CORRECTS addendum §4 ("numeric user.id for the pool" is overridden). The fake's pool/shield/block Maps are keyed by `platform_id` strings. Only the LOG (`world_boss_event_log.user_id`) and grants stay numeric.
> - **LOCK §D — `dpsAttack({ platformId, numericUserId, eventId, attackType, level })`** returns `{ damage, contribution, enraged, didEnrageTrigger, knockedBatch, selfKnocked, rejected, reason }`. `attackType` is the raw `"<jobKey>|<skill>"` string (e.g. `"swordman|skillOne"`). The service takes `level` DIRECTLY and does NOT call MinigameService — so the dead `MinigameService` mock from the prior draft is DROPPED.
> - **LOCK §D / addendum §1 — DPS damage** = `makeCharacter(jobKey, { level }).getStandardDamage()` = `Math.floor(Math.pow(level,2)) + level*10` (verified `RPGCharacter.js:139-141`; base formula not overridden in `Swordman`/`Mage`/`Thief`); then `damage = Math.floor(damage * (1 + atk_percent))` (`atk_percent` is a FRACTION, addendum §2). Real job keys are `swordman`/`mage`/`thief`/`adventurer` (`RPGCharacter.js:288-299`).
> - **LOCK §D / addendum §6 — no `remain_hp` column.** HP read = `WorldBossLog.getTotalDamageByEventId(eventId)` returning **`{ total_damage }`** (an OBJECT — verified real `.sum("damage as total_damage").first()` at `WorldBossLog.js:146-151`). `remainHpBefore = event.hp - parseInt(total_damage || 0, 10)`. The fake `createWithRole` records `damage` so HP actually drops.
> - **LOCK §E — `getRecentAttackers({ eventId, minutes, limit }) → [{ user_id, platform_id }]`** (both ids); `getSupportRatio(eventId) → 0` (all-DPS); both faked.
> - **LOCK §B / §D — numeric resolution is `UserModel.getId(platformId)`** (verified `src/model/application/UserModel.js:8`), used only for off-hot-path absorb credit; the gate passes an already-resolved `numericUserId` so this is faked but never exercised in an all-DPS run.
> - **Real-code gate, not a tautology.** The prior draft re-implemented combat math; this milestone imports and drives the REAL `dpsAttack`, inheriting the LOCKED enrage crossing-hit rule (the crossing hit is NOT doubled and fires the batch-knock side effect; hits that START in the enrage band get ×2 on both `damage` and `contribution`). The closed-form sweep is retained ONLY as labelled tuning tooling, with its `standardDamage()` test-pinned to the real `make` factory so it cannot diverge (addendum §16).

---

### Task 1: Pin the cold-start contract — canonical formula, LOCK collaborator names, knobs (read-only spike)

Produces no files; locks the exact numbers and the LOCK-conformant fake seams so the implementing engineer never reintroduces the old names. Confirm every fact against the repo before writing the gate.

**Files:**
- Read (no modify): `app/config/default.json` — the `worldboss.*` block (M1/M3 own it; M10 appends only `cold_start_max_hp` in Task 4).
- Read (no modify): `app/src/model/application/RPGCharacter.js:139-141` (`getStandardDamage`) and `:288-299` (`exports.make`, job keys `swordman`/`mage`/`thief`/`adventurer`).
- Read (no modify): `app/src/service/WorldBossCombatService.js` (created M4) — the real `dpsAttack` signature and every collaborator it `require()`s.
- Read (no modify): `app/src/util/worldBossRedis.js` (created M4) — the eight LOCK §C export names.
- Read (no modify): `app/src/model/application/WorldBossLog.js:146-151` — `getTotalDamageByEventId` returns `{ total_damage }` (object).
- Read (no modify): `app/src/model/application/UserModel.js:8-11` — `getId(platformId)` returns numeric `user.id` or `null`.
- Read (no modify): `app/src/service/__tests__/RaceSimulation.test.js:1-45` — the in-repo precedent for a config-driven simulation test.

**Interfaces:**
- Consumes (M1/M3 config, addendum §7): `worldboss.daily_limit` (100), `normal_attack_cost`, `enrage_threshold_pct`, `enrage_batch_size`, `enrage_counter_rate`, `enrage_damage_multiplier`, `enrage_contribution_multiplier`, `natural_recovery_minutes`, plus M10's `cold_start_max_hp` (added Task 4).
- Consumes (real source, LOCK §D / addendum §1): `getStandardDamage() = Math.floor(Math.pow(level,2)) + level*10`, via `makeCharacter(jobKey, { level })`.
- Consumes (M4, the code the gate drives): `WorldBossCombatService.dpsAttack({ platformId, numericUserId, eventId, attackType, level }) → { damage, contribution, enraged, didEnrageTrigger, knockedBatch, selfKnocked, rejected, reason }`.
- Consumes (M4 redis, LOCK §C — eight names ONLY): `poolAdd(eventId, platformId, ts)`, `poolPopMin(eventId, count)`, `poolScore(eventId, platformId)`, `poolRemove(eventId, platformId)`, `shieldSet(eventId, targetPlatformId, ownerPlatformId, ttlSec)`, `shieldConsume(eventId, targetPlatformId)`, `blockSet(eventId, ownerPlatformId, ttlSec)`, `blockOwner(eventId)`. All members are `platform_id` strings (LOCK §B).
- Produces (for Task 2+): the locked fact table + the exact LOCK-conformant collaborator list.

Steps:

- [ ] **Step 1: Confirm the canonical damage formula and factory.** Open `app/src/model/application/RPGCharacter.js:139-141`; confirm `getStandardDamage()` returns `Math.floor(Math.pow(this.level, 2)) + this.level * 10`. Run `grep -n "getStandardDamage" app/src/model/application/RPGCharacter.js` — it is defined ONCE on the base `Adventurer`; `Swordman`/`Mage`/`Thief` do NOT override it. Confirm `exports.make(jobKey, { level })` at `:288` switches on `Swordman.key`=`"swordman"`, `Mage.key`=`"mage"`, `Thief.key`=`"thief"`, default `"adventurer"`. At `level=50`: `2500 + 500 = 3000`; at `level=20`: `400 + 200 = 600`. This is the ONE formula M4 and this gate use; any `level*10`-only variant is a bug (addendum §1).

- [ ] **Step 2: Confirm the LOCK §C redis export names (NOT the old ones).** Open `app/src/util/worldBossRedis.js`. Confirm it exports EXACTLY `poolAdd`, `poolPopMin`, `poolScore`, `poolRemove`, `shieldSet`, `shieldConsume`, `blockSet`, `blockOwner` — and that there is NO `addToPool`/`popOldest`/`isKnockedDown`/`recoverIfExpired`/`openBlockWindow`/`consumeBlockSlot`/`setShield`/`consumeShield`/`getBlockOwner`/`consumeShield` (LOCK §C declares those FORBIDDEN). All members take/return `platform_id` strings (LOCK §B). If M4 has not landed, the require fails — that is the expected first failing state; do NOT stub M4.

- [ ] **Step 3: Map the real `dpsAttack` collaborators to fake — by LOCK name, platform_id identity.** Read `app/src/service/WorldBossCombatService.js` and list every module it `require()`s that touches Redis/DB/network. Per the LOCK the set and EXACT names are:
  - `app/src/util/worldBossRedis.js` (M4, LOCK §C) — the eight helpers above, keyed by `platform_id`. The combat service does lazy recovery itself via `poolScore`/`poolRemove`; the fake provides those, NOT a `recoverIfExpired`. **Fake:** Map-backed double implementing the eight names, keyed by `platform_id` strings, driven by an injected virtual clock so `poolScore` returns the knock timestamp.
  - `app/src/model/application/WorldBossLog.js` (helpers owned by M1) — `createWithRole({ user_id /*numeric*/, world_boss_event_id, role, action_type, damage, cost, contribution }, trx?)` records the row (damage drops HP); `getTotalDamageByEventId(eventId)` returns **`{ total_damage }`** (object, matching the real `.sum().first()` shape `dpsAttack` destructures); `getRecentAttackers({ eventId, minutes, limit }) → [{ user_id, platform_id }]`; `getSupportRatio(eventId) → 0`. **Fake:** in-memory array; HP-read derives `total_damage` from summed `damage`.
  - `app/src/model/application/WorldBossEvent.js` (helpers owned by M1) — `getActive()` and `casStatus(eventId, fromStatus, toStatus, extra)` (kill CAS `active→killed`, stamps `killed_at` via `extra`). **Fake:** in-memory event with `status`, `hp`, `killed_at`; NO `remain_hp` column.
  - `app/src/service/EquipmentService.js` (M3) — `getEquipmentBonuses(platformId)`. **Fake:** returns `{ atk_percent: 0, crit_rate: 0, cost_reduction: 0, exp_bonus: 0, gold_bonus: 0, support_power: 0, block_power: 0 }` (cold start = base gear). `atk_percent` is a FRACTION applied `Math.floor(damage * (1 + atk_percent))` (addendum §2).
  - `app/src/model/application/UserModel.js` (`getId`) — only used off the hot path for absorb-credit resolution (LOCK §B/§D). **Fake:** `getId: async (platformId) => <numeric>` derived from the roster map. In an all-DPS run no shield/block is ever set, so this is never exercised — fake it for require-safety.
  Write these down; Task 2 builds each fake to these EXACT names. The service takes `level` directly and does NOT call MinigameService — there is NO MinigameService mock (LOCK §D).

- [ ] **Step 4: Lock the gate model assumptions (paste as a comment block into the test).** The gate is a real-code integration driver, pessimistically configured:
  - Every simulated player is a DPS (zero healers, zero tanks) → enrage knockdowns are never revived and never absorbed (worst case the cold-start scaling must survive).
  - Each player has a fixed `level` drawn uniformly from `[levelMin, levelMax]` (default `[20, 60]`) via the injected seeded RNG, and a fixed `job_key` (`"adventurer"`; base damage is job-independent per Step 1). `attackType` is passed as `"adventurer|skillOne"` (the raw `"<jobKey>|<skill>"` form, LOCK §D).
  - Each player throws up to `floor(daily_limit / normal_attack_cost) = floor(100/10) = 10` hits/day. While knocked down (real combat-service check via the fake `poolScore`), the next `dpsAttack` returns `rejected:true reason:"knocked_down"` and consumes NO hit.
  - **Recovery uses the real lazy model.** The gate advances a virtual clock injected into the fake redis; the combat service's lazy recovery (`poolScore` → `score + natural_recovery_minutes*60000 <= now` ⇒ `poolRemove`, recovered) fires on the next action. The driver advances the clock by one recovery window per tick so knocked players become eligible — exercising the real recovery branch.
  - The driver stops when boss `status === "killed"` (real `casStatus` fired) or all players exhaust hits or a tick cap is reached.

---

### Task 2: Write the failing integration GATE test (RED)

The GATE drives the REAL `WorldBossCombatService.dpsAttack` against in-memory fakes. `app` jest has `transform:{}` (verified `jest.config.js:4`) → `jest.mock(...)` is NOT hoisted → EVERY `jest.mock(...)` MUST appear BEFORE any `require()` of the mocked module. The fakes are injected via `jest.mock` of `worldBossRedis` / `WorldBossLog` / `WorldBossEvent` / `EquipmentService` / `UserModel`, all declared before requiring `WorldBossCombatService`.

**Files:**
- Create: `app/__tests__/fakes/worldBossInMemory.js` — reusable in-memory fakes (redis pool/block/shield keyed by `platform_id`, log store, event without `remain_hp`, equipment, user-id resolver) + a virtual clock. Lives under `__tests__/fakes/`, NOT named `*.test.js`, so jest's `testMatch` (`<rootDir>/**/__tests__/**/*.test.js`) skips it.
- Create (Test): `app/__tests__/WorldBossColdStartSim.test.js` — the GATE (top-level `__tests__/`, beside `tasks.test.js`).

**Interfaces:**
- Consumes (from Task 1): locked knobs + canonical formula + the LOCK §C collaborator-fake list.
- Consumes (M4, the code under test): `WorldBossCombatService.dpsAttack`.
- Produces (downstream): the GO/NO-GO acceptance verdict.

Steps:

- [ ] **Step 1: Write the in-memory fakes FIRST.** Create `app/__tests__/fakes/worldBossInMemory.js`. It implements the EXACT LOCK §C helper names; the redis pool/block/shield are keyed by `platform_id` strings (LOCK §B); the event has NO `remain_hp` (HP derives from summed log damage, addendum §6); `getTotalDamageByEventId` returns `{ total_damage }` (object). CommonJS, double quotes, es5 commas, ≤100 cols.

  ```js
  /**
   * In-memory fakes for the World Boss cold-start integration gate.
   *
   * Back the REAL WorldBossCombatService.dpsAttack (M4) with Map-backed state so
   * the gate exercises actual combat code (enrage trigger, knockdown batch, lazy
   * recovery, kill CAS) with NO Redis/DB/network. A virtual clock (now/setNow/
   * advance) drives the service's lazy natural-recovery branch deterministically.
   *
   * LOCK conformance:
   *   §B  wb:pool / wb:shield / wb:block are keyed by platform_id STRINGS.
   *   §C  worldBossRedis exports EXACTLY the eight names poolAdd / poolPopMin /
   *       poolScore / poolRemove / shieldSet / shieldConsume / blockSet /
   *       blockOwner. No addToPool / popOldest / isKnockedDown / recoverIfExpired
   *       / openBlockWindow / consumeBlockSlot / setShield / consumeShield.
   *   §D  getTotalDamageByEventId returns { total_damage } (an OBJECT).
   *   §6  There is NO remain_hp column. Current HP = boss.hp - SUM(log.damage).
   *
   * If M4's real export names differ, update THESE (not M4) and flag the drift.
   */

  function createClock(startMs) {
    let nowMs = startMs || 0;
    return {
      now: () => nowMs,
      setNow: (ms) => {
        nowMs = ms;
      },
      advance: (ms) => {
        nowMs += ms;
      },
    };
  }

  // --- Fake worldBossRedis: pool ZSET + block/shield, keyed by platform_id (§B/§C) ---
  function createRedisFake(clock) {
    const pools = new Map(); // eventId -> Map(platformId -> knockedTsMs)
    const blocks = new Map(); // eventId -> { owner: platformId, expiresMs }
    const shields = new Map(); // `${eventId}:${targetPlatformId}` -> { owner, expiresMs }

    function pool(eventId) {
      const k = String(eventId);
      if (!pools.has(k)) pools.set(k, new Map());
      return pools.get(k);
    }

    return {
      _clock: clock,
      // ZADD member=platformId score=ts
      poolAdd: async (eventId, platformId, ts) => {
        pool(eventId).set(String(platformId), ts);
      },
      // ZPOPMIN -> member strings only ([] when empty)
      poolPopMin: async (eventId, count) => {
        const p = pool(eventId);
        const sorted = [...p.entries()].sort((a, b) => a[1] - b[1]);
        const popped = sorted.slice(0, count).map(([m]) => m);
        popped.forEach((m) => p.delete(m));
        return popped;
      },
      // ZSCORE -> ts | null
      poolScore: async (eventId, platformId) => {
        const score = pool(eventId).get(String(platformId));
        return score === undefined ? null : score;
      },
      // ZREM
      poolRemove: async (eventId, platformId) => {
        pool(eventId).delete(String(platformId));
      },
      // SET wb:shield:{event}:{target} = ownerPlatformId EX ttl
      shieldSet: async (eventId, targetPlatformId, ownerPlatformId, ttlSec) => {
        shields.set(`${eventId}:${targetPlatformId}`, {
          owner: String(ownerPlatformId),
          expiresMs: clock.now() + ttlSec * 1000,
        });
      },
      // GETDEL-style -> ownerPlatformId | null
      shieldConsume: async (eventId, targetPlatformId) => {
        const key = `${eventId}:${targetPlatformId}`;
        const s = shields.get(key);
        if (!s || s.expiresMs < clock.now()) {
          shields.delete(key);
          return null;
        }
        shields.delete(key);
        return s.owner;
      },
      // SET wb:block:{event} = ownerPlatformId EX ttl
      blockSet: async (eventId, ownerPlatformId, ttlSec) => {
        blocks.set(String(eventId), {
          owner: String(ownerPlatformId),
          expiresMs: clock.now() + ttlSec * 1000,
        });
      },
      // GET wb:block:{event} -> ownerPlatformId | null
      blockOwner: async (eventId) => {
        const b = blocks.get(String(eventId));
        if (!b || b.expiresMs < clock.now()) {
          blocks.delete(String(eventId));
          return null;
        }
        return b.owner;
      },
      _dump: () => ({ pools, blocks, shields }),
    };
  }

  // --- Fake WorldBossLog: log rows; HP read = { total_damage } object (§D/§6) ---
  function createLogFake() {
    const rows = [];
    return {
      _rows: rows,
      createWithRole: async (row) => {
        rows.push({ ...row, id: rows.length + 1 });
        return rows.length;
      },
      sumDamage: (eventId) =>
        rows
          .filter((r) => r.world_boss_event_id === eventId)
          .reduce((sum, r) => sum + (r.damage || 0), 0),
      // §D: real shape is .sum("damage as total_damage").first() -> { total_damage }.
      getTotalDamageByEventId: async function (eventId) {
        return { total_damage: this.sumDamage(eventId) };
      },
      // §E: both ids, created_at DESC within `minutes`, last `limit`.
      getRecentAttackers: async ({ eventId, limit }) =>
        rows
          .filter((r) => r.world_boss_event_id === eventId)
          .slice(-limit)
          .reverse()
          .map((r) => ({ user_id: r.user_id, platform_id: r.platform_id })),
      // §E: all-DPS server => zero support actions => ratio 0.
      getSupportRatio: async () => 0,
    };
  }

  // --- Fake WorldBossEvent: active read + kill CAS; §6 NO remain_hp column ---
  function createEventFake({ eventId, maxHp }) {
    const event = {
      id: eventId,
      world_boss_id: 1,
      status: "active",
      hp: maxHp,
      killed_at: null,
      settled_at: null,
    };
    return {
      _event: event,
      getActive: async () => (event.status === "active" ? { ...event } : null),
      // casStatus(eventId, from, to, extra) -> boolean (atomic active->killed)
      casStatus: async (id, from, to, extra) => {
        if (event.status !== from) return false;
        event.status = to;
        if (extra && extra.killed_at) event.killed_at = extra.killed_at;
        return true;
      },
    };
  }

  module.exports = {
    createClock,
    createRedisFake,
    createLogFake,
    createEventFake,
  };
  ```

- [ ] **Step 2: Write the GATE test (it FAILS — M4/M3 not yet landed, or fakes not yet wired through real `dpsAttack`).** Create `app/__tests__/WorldBossColdStartSim.test.js` with the FULL content below. ALL `jest.mock(...)` calls precede `require("../src/service/WorldBossCombatService")` (transform:{}). Note: there is NO MinigameService mock — `dpsAttack` takes `level` directly (LOCK §D). The `UserModel` mock covers only off-hot-path absorb credit.

  ```js
  /**
   * World Boss cold-start acceptance GATE (D30).
   *
   * INTEGRATION gate: drives the REAL WorldBossCombatService.dpsAttack (M4)
   * against in-memory fakes (LOCK §C redis pool/block/shield keyed by platform_id,
   * log store whose HP read returns { total_damage }, event with NO remain_hp
   * column, base-gear equipment). Proves an ALL-DPS server (zero healers, zero
   * tanks) can still bring the daily boss HP to 0 under the default enrage /
   * batch / counter / recovery knobs + cold-start scaling, exercising the real
   * enrage trigger, knockdown batch, lazy recovery and kill CAS -- NOT a
   * re-implemented model.
   *
   * Canonical damage (LOCK §D / addendum §1):
   *   makeCharacter(jobKey,{level}).getStandardDamage()
   *     = Math.floor(Math.pow(level,2)) + level*10.  level 50 = 3000, level 20 = 600.
   *   then damage = Math.floor(damage * (1 + atk_percent)) (atk_percent a FRACTION).
   *
   * attackType is the raw "<jobKey>|<skill>" string (LOCK §D), e.g. "adventurer|skillOne".
   * dpsAttack takes level DIRECTLY -- no MinigameService call -- so no MinigameService mock.
   *
   * If the boss survives, the all-DPS path is unkillable and the feature MUST NOT
   * ship: tune worldboss.* in app/config/default.json (D30 recovery + cold-start
   * scaling) until it passes. If WorldBossCombatService is missing, M4 has not
   * landed -- STOP and flag the dependency; do NOT stub the service.
   *
   * Seeded RNG => deterministic. transform:{} => every jest.mock precedes the
   * require of the module it mocks.
   */

  const config = require("config");
  const {
    createClock,
    createRedisFake,
    createLogFake,
    createEventFake,
  } = require("./fakes/worldBossInMemory");

  // ---- Per-run mutable fake handles, swapped in driveColdStart ----
  let activeRedis;
  let activeLog;
  let activeEvent;
  let activeNumericByPlatform = new Map(); // platformId -> numeric user.id

  // ---- Mock collaborators BEFORE requiring the service under test (LOCK §C names) ----
  jest.mock("../src/util/worldBossRedis", () =>
    new Proxy(
      {},
      {
        get: (_t, prop) => (...args) => activeRedis[prop](...args),
      }
    )
  );
  jest.mock("../src/model/application/WorldBossLog", () =>
    new Proxy(
      {},
      {
        get: (_t, prop) => (...args) => activeLog[prop](...args),
      }
    )
  );
  jest.mock("../src/model/application/WorldBossEvent", () =>
    new Proxy(
      {},
      {
        get: (_t, prop) => (...args) => activeEvent[prop](...args),
      }
    )
  );
  // Cold start = base gear, no enhancement; atk_percent is a FRACTION (addendum §2).
  jest.mock("../src/service/EquipmentService", () => ({
    getEquipmentBonuses: async () => ({
      atk_percent: 0,
      crit_rate: 0,
      cost_reduction: 0,
      exp_bonus: 0,
      gold_bonus: 0,
      support_power: 0,
      block_power: 0,
    }),
  }));
  // Off-hot-path absorb-credit resolution only (LOCK §B/§D); never hit in all-DPS.
  jest.mock("../src/model/application/UserModel", () => ({
    getId: async (platformId) => activeNumericByPlatform.get(platformId) || null,
  }));

  // require AFTER all mocks (transform:{} => no hoisting).
  const WorldBossCombatService = require("../src/service/WorldBossCombatService");

  const wb = config.get("worldboss");

  // Deterministic LCG so the gate never flakes across runs/machines.
  function makeLcg(seed) {
    let state = seed >>> 0;
    return function next() {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  /**
   * Drive the REAL dpsAttack until kill / hits exhausted / tick cap.
   * @returns {{ killed, finalHp, ticksUsed, totalHits, totalKnockdowns }}
   */
  async function driveColdStart({ players, levelMin, levelMax, maxHp, maxTicks, rng }) {
    const eventId = 1;
    const clock = createClock(0);
    activeRedis = createRedisFake(clock);
    activeLog = createLogFake();
    activeEvent = createEventFake({ eventId, maxHp });
    activeNumericByPlatform = new Map();

    const hitsPerDay = Math.floor(wb.daily_limit / wb.normal_attack_cost);
    const recoveryMs = wb.natural_recovery_minutes * 60000;

    const roster = [];
    for (let i = 0; i < players; i++) {
      const span = levelMax - levelMin + 1;
      const level = levelMin + Math.floor(rng() * span);
      const platformId = `U${String(i).padStart(6, "0")}`;
      const numericUserId = i + 1;
      activeNumericByPlatform.set(platformId, numericUserId);
      // base damage is job-independent (addendum §1); raw "<jobKey>|<skill>" form (§D).
      roster.push({
        platformId,
        numericUserId,
        level,
        attackType: "adventurer|skillOne",
        hitsLeft: hitsPerDay,
      });
    }

    let totalHits = 0;
    let totalKnockdowns = 0;
    let tick = 0;

    while (tick < maxTicks) {
      tick++;
      let anyActed = false;

      for (const p of roster) {
        if (activeEvent._event.status !== "active") break;
        if (p.hitsLeft <= 0) continue;

        const res = await WorldBossCombatService.dpsAttack({
          platformId: p.platformId,
          numericUserId: p.numericUserId,
          eventId,
          attackType: p.attackType,
          level: p.level,
        });

        if (res.rejected) {
          // knocked_down etc.: no hit consumed; retry next tick after recovery.
          continue;
        }
        p.hitsLeft--;
        totalHits++;
        anyActed = true;
        if (Array.isArray(res.knockedBatch)) totalKnockdowns += res.knockedBatch.length;
        if (res.selfKnocked) totalKnockdowns++;
      }

      if (activeEvent._event.status !== "active") break;
      // Advance the virtual clock one recovery window so the service's lazy
      // poolScore/poolRemove recovery branch fires on the next tick.
      clock.advance(recoveryMs);

      const anyHitsLeft = roster.some((pl) => pl.hitsLeft > 0);
      if (!anyHitsLeft && !anyActed) break;
    }

    const finalHp = maxHp - activeLog.sumDamage(eventId);
    return {
      killed: activeEvent._event.status === "killed",
      finalHp,
      ticksUsed: tick,
      totalHits,
      totalKnockdowns,
    };
  }

  async function runMonteCarlo({ trials, players, levelMin, levelMax, maxHp, maxTicks, seed }) {
    let kills = 0;
    for (let t = 0; t < trials; t++) {
      const r = await driveColdStart({
        players,
        levelMin,
        levelMax,
        maxHp,
        maxTicks,
        rng: makeLcg((seed || 1) + t),
      });
      if (r.killed) kills++;
    }
    return { trials, kills, killRate: kills / trials };
  }

  describe("World Boss cold-start (all-DPS) acceptance gate — drives real dpsAttack", () => {
    it("kills the daily boss with zero healers and zero tanks (representative server)", async () => {
      const result = await driveColdStart({
        players: 80,
        levelMin: 20,
        levelMax: 60,
        maxHp: wb.cold_start_max_hp,
        maxTicks: 50,
        rng: makeLcg(12345),
      });

      expect(result.killed).toBe(true);
      expect(result.finalHp).toBeLessThanOrEqual(0);
    });

    it("is NOT trivially weak: one low-level player cannot kill the boss in 1-2 hits", async () => {
      const result = await driveColdStart({
        players: 1,
        levelMin: 20,
        levelMax: 20,
        maxHp: wb.cold_start_max_hp,
        maxTicks: 1,
        rng: makeLcg(999),
      });

      // one lvl-20 getStandardDamage = 20^2 + 20*10 = 600, far below cold_start_max_hp,
      // and a single tick is capped at hitsPerDay=10 hits => <=6000 base damage.
      expect(result.killed).toBe(false);
      expect(result.finalHp).toBeGreaterThan(0);
      expect(result.totalHits).toBeLessThanOrEqual(Math.floor(wb.daily_limit / wb.normal_attack_cost));
    });

    it("Monte-Carlo: all-DPS server kills the boss in the large majority of seeded trials", async () => {
      const mc = await runMonteCarlo({
        trials: 100,
        players: 80,
        levelMin: 20,
        levelMax: 60,
        maxHp: wb.cold_start_max_hp,
        maxTicks: 50,
        seed: 1,
      });

      expect(mc.trials).toBe(100);
      // Cold-start safety valve (D30): the all-DPS path must reliably succeed.
      expect(mc.killRate).toBeGreaterThanOrEqual(0.95);
    });

    it("uses the locked default knobs from config (regression guard on gate inputs)", () => {
      expect(wb.enrage_threshold_pct).toBe(35);
      expect(wb.enrage_batch_size).toBe(20);
      expect(wb.enrage_counter_rate).toBe(0.15);
      expect(wb.enrage_damage_multiplier).toBe(2);
      expect(wb.enrage_contribution_multiplier).toBe(2);
      expect(wb.natural_recovery_minutes).toBe(15);
      expect(wb.daily_limit).toBe(100);
      expect(wb.normal_attack_cost).toBe(10);
      expect(wb.cold_start_max_hp).toBeGreaterThan(0);
    });
  });
  ```

- [ ] **Step 3: Run the GATE and confirm it FAILS for the right reason.** Run:
  ```
  cd app && yarn test -- __tests__/WorldBossColdStartSim.test.js
  ```
  Expected RED on one of: `Cannot find module '../src/service/WorldBossCombatService'` (M4 not landed — STOP, flag M4, do NOT stub it); `Configuration property 'worldboss.enrage_threshold_pct' is undefined` (M3 knobs not landed — flag M3, do NOT add them here); or a fake-helper-name mismatch (`activeRedis.poolAdd is not a function`) meaning M4 used different `worldBossRedis` export names than LOCK §C — fix the fake to M4's real names and flag the drift, NOT M4. Any of these is the correct first failing state.

- [ ] **Step 4: Commit the RED gate.**
  ```
  git add app/__tests__/WorldBossColdStartSim.test.js app/__tests__/fakes/worldBossInMemory.js
  git commit -m "test(worldboss): add cold-start acceptance gate driving real dpsAttack (D30, RED)

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019S6Ho4Tu77orukvB73gZHV"
  ```

---

### Task 3: Balance lower-bound sweep + formula-pin (GREEN support tooling)

A fast closed-form sweep for HP-tuning exploration ONLY. It is explicitly NOT the acceptance proof (Task 2's integration gate is). Its `standardDamage()` is pinned by test to equal `RPGCharacter.getStandardDamage()` via the real `make` factory, and its enrage knobs are read from config, so it cannot silently diverge from M4 (addendum §16).

**Files:**
- Create: `app/bin/WorldBossSim.js` — pure closed-form sweep; runnable as `node bin/WorldBossSim.js` (mirrors `RaceSimulation.test.js`'s config-driven precedent).
- Modify (Test): `app/__tests__/WorldBossColdStartSim.test.js` — append a `describe` block pinning the sweep's formula/knobs to the real source.

**Interfaces:**
- Produces: `module.exports = { simulateColdStart, runMonteCarlo, standardDamage, makeLcg }`.
  - `standardDamage(level)` — MUST equal `makeCharacter(jobKey, { level }).getStandardDamage()`.
  - `simulateColdStart(opts) -> { killed, finalHp, roundsUsed, totalHits, totalKnockdowns }`
  - `runMonteCarlo(opts) -> { trials, kills, killRate, avgRoundsToKill, avgFinalHpPct }`
- Consumes: `config.get("worldboss")` for ALL enrage/batch/counter knobs (never hard-coded).

Steps:

- [ ] **Step 1: Write the closed-form sweep.** Create `app/bin/WorldBossSim.js`. CommonJS, double quotes, es5 commas, ≤100 cols. Header states plainly it is a MODEL for HP tuning, NOT the acceptance proof. Enrage doubling is applied to the FINAL damage (LOCK §D / addendum §1).

  ```js
  /**
   * World Boss cold-start BALANCE sweep (HP-tuning model — NOT the gate).
   *
   * A fast closed-form lower-bound model of an ALL-DPS server, used to explore
   * cold_start_max_hp candidates before running the slow integration gate
   * (app/__tests__/WorldBossColdStartSim.test.js, which drives the REAL
   * WorldBossCombatService.dpsAttack). This file re-implements an IDEALIZED round
   * model and therefore proves nothing about the shipped combat code -- a passing
   * sweep is a balance sanity-check only. The integration gate is the authority.
   * standardDamage() below is pinned by test to equal RPGCharacter.getStandardDamage()
   * (via the real make factory); enrage knobs are read from config so the model
   * can never silently diverge from M4.
   *
   * Canonical formula (LOCK §D / addendum §1): floor(level^2) + level*10. level 50 = 3000.
   * Enrage doubles the FINAL per-hit damage.
   *
   * Pure compute. No DB / Redis / network. RNG injectable for determinism.
   * Run ad-hoc:  node bin/WorldBossSim.js
   */

  const config = require("config");

  // Canonical formula — MUST equal RPGCharacter.getStandardDamage()
  // (app/src/model/application/RPGCharacter.js:139-141, base formula not
  // overridden in any subclass). A test in WorldBossColdStartSim.test.js pins
  // this against the real make() factory.
  function standardDamage(level) {
    return Math.floor(Math.pow(level, 2)) + level * 10;
  }

  function knobs() {
    const wb = config.get("worldboss");
    return {
      enrageThresholdPct: wb.enrage_threshold_pct,
      enrageBatchSize: wb.enrage_batch_size,
      enrageCounterRate: wb.enrage_counter_rate,
      enrageDamageMultiplier: wb.enrage_damage_multiplier,
      dailyLimit: wb.daily_limit,
      normalAttackCost: wb.normal_attack_cost,
    };
  }

  function simulateColdStart(opts) {
    const cfg = knobs();
    const rng = opts.rng || Math.random;
    const players = opts.players;
    const levelMin = opts.levelMin;
    const levelMax = opts.levelMax;
    const maxHp = opts.maxHp;
    const maxRounds = opts.maxRounds;

    const hitsPerDay = Math.floor(cfg.dailyLimit / cfg.normalAttackCost);
    const enrageHpFloor = maxHp * (cfg.enrageThresholdPct / 100);

    const roster = [];
    for (let i = 0; i < players; i++) {
      const span = levelMax - levelMin + 1;
      const level = levelMin + Math.floor(rng() * span);
      roster.push({ level: level, hitsLeft: hitsPerDay, knockedThisRound: false });
    }

    let hp = maxHp;
    let enraged = false;
    let totalHits = 0;
    let totalKnockdowns = 0;
    let round = 0;

    while (hp > 0 && round < maxRounds) {
      round++;
      for (let i = 0; i < roster.length; i++) {
        roster[i].knockedThisRound = false;
      }

      for (let i = 0; i < roster.length; i++) {
        const p = roster[i];
        if (hp <= 0) break;
        if (p.hitsLeft <= 0) continue;
        if (p.knockedThisRound) continue;

        p.hitsLeft--;
        totalHits++;

        let dmg = standardDamage(p.level);
        // Crossing hit is computed in the calm band (NOT doubled); hits that START
        // already enraged get x2 (LOCK §D). Modelled by doubling only when already
        // enraged at the top of this hit.
        if (enraged) dmg *= cfg.enrageDamageMultiplier;
        hp -= dmg;

        if (!enraged && hp <= enrageHpFloor) {
          enraged = true;
          const start = Math.max(0, i - cfg.enrageBatchSize + 1);
          for (let j = start; j <= i; j++) {
            if (!roster[j].knockedThisRound) {
              roster[j].knockedThisRound = true;
              totalKnockdowns++;
            }
          }
        } else if (enraged && rng() < cfg.enrageCounterRate) {
          p.knockedThisRound = true;
          totalKnockdowns++;
        }
      }

      const anyHitsLeft = roster.some((p) => p.hitsLeft > 0);
      if (!anyHitsLeft) break;
    }

    return {
      killed: hp <= 0,
      finalHp: hp,
      roundsUsed: round,
      totalHits: totalHits,
      totalKnockdowns: totalKnockdowns,
    };
  }

  function makeLcg(seed) {
    let state = seed >>> 0;
    return function next() {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function runMonteCarlo(opts) {
    const trials = opts.trials;
    const baseSeed = opts.seed || 1;

    let kills = 0;
    let roundsSum = 0;
    let finalHpPctSum = 0;

    for (let t = 0; t < trials; t++) {
      const r = simulateColdStart({
        players: opts.players,
        levelMin: opts.levelMin,
        levelMax: opts.levelMax,
        maxHp: opts.maxHp,
        maxRounds: opts.maxRounds,
        rng: makeLcg(baseSeed + t),
      });
      if (r.killed) {
        kills++;
        roundsSum += r.roundsUsed;
      }
      finalHpPctSum += Math.max(0, r.finalHp) / opts.maxHp;
    }

    return {
      trials: trials,
      kills: kills,
      killRate: kills / trials,
      avgRoundsToKill: kills > 0 ? roundsSum / kills : null,
      avgFinalHpPct: finalHpPctSum / trials,
    };
  }

  module.exports = { simulateColdStart, runMonteCarlo, standardDamage, makeLcg };

  if (require.main === module) {
    const mc = runMonteCarlo({
      trials: 200,
      players: 80,
      levelMin: 20,
      levelMax: 60,
      maxHp: config.get("worldboss").cold_start_max_hp,
      maxRounds: 50,
      seed: 1,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(mc, null, 2));
  }
  ```

- [ ] **Step 2: Pin the sweep formula + knobs to the REAL source (prevents silent divergence).** Append a `describe` block to `app/__tests__/WorldBossColdStartSim.test.js`. It requires the REAL `RPGCharacter` `make` factory and asserts the sweep's `standardDamage` equals the constructed character's `getStandardDamage()` — using the SAME construction path M4 uses (`makeCharacter(jobKey, { level })`, factory `RPGCharacter.js:288`). The job keys are the verified `swordman`/`mage`/`thief`/`adventurer`. The `RPGCharacter` require is DB-free (the global `__tests__/setup.js` neutralizes incidental requires).

  ```js
  const { standardDamage } = require("../bin/WorldBossSim");
  const { make: makeCharacter } = require("../src/model/application/RPGCharacter");

  describe("balance-sweep formula is pinned to the real combat formula", () => {
    it.each([20, 30, 50, 60, 80])(
      "sweep standardDamage(%i) equals makeCharacter(...).getStandardDamage()",
      (level) => {
        const character = makeCharacter("adventurer", { level });
        expect(standardDamage(level)).toBe(character.getStandardDamage());
      }
    );

    it("base damage is job-independent (swordman/mage/thief do not override it)", () => {
      const level = 50;
      const expected = standardDamage(level);
      ["adventurer", "swordman", "mage", "thief"].forEach((jobKey) => {
        expect(makeCharacter(jobKey, { level }).getStandardDamage()).toBe(expected);
      });
    });

    it("level 50 = 3000 and level 20 = 600 (canonical curve, not a level*10 model)", () => {
      expect(standardDamage(50)).toBe(3000);
      expect(standardDamage(20)).toBe(600);
    });
  });
  ```

- [ ] **Step 3: Run the formula-pin + sweep.** Run:
  ```
  cd app && yarn test -- __tests__/WorldBossColdStartSim.test.js
  cd app && node bin/WorldBossSim.js
  ```
  Expected: the pin tests pass (sweep formula == real formula across all four job keys; 3000/600 hold). The integration-gate tests may still be RED if M4/M3 have not landed — that is expected; the sweep is independent tooling. The CLI prints `{ trials, kills, killRate, avgRoundsToKill, avgFinalHpPct }`.

- [ ] **Step 4: Commit the sweep + pin.**
  ```
  git add app/bin/WorldBossSim.js app/__tests__/WorldBossColdStartSim.test.js
  git commit -m "feat(worldboss): balance sweep + formula pin (sweep != gate; canonical level^2+level*10)

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019S6Ho4Tu77orukvB73gZHV"
  ```

---

### Task 4: Add `cold_start_max_hp` config field + wire M7 (single gate-derived knob)

The integration gate and the live boss must share ONE HP value so the gate validates the boss players actually fight. M1/M3 own the bulk of the `worldboss` block; M10 appends ONLY this one gate-derived field.

**Files:**
- Modify: `app/config/default.json` — add `"cold_start_max_hp"` inside `worldboss`. The current block ends at `"manual": [...]`; the M1/M3-added knobs (`normal_attack_cost`, `enrage_*`, `natural_recovery_minutes`, `boss_pool`, `open_hour`) land with those milestones. M10 inserts only the single field, after the M1/M3 knobs.

**Interfaces:**
- Consumes: `config.get("worldboss").cold_start_max_hp` (read by both the integration gate and the sweep).
- Produces (for M6, LOCK §G): `WorldBossLifecycleService.createDailyBoss()` (M6 owner) seeds the daily boss `world_boss.hp` from this value (or a documented multiple) so the live boss matches the gated balance. M6 owns lifecycle; this is a consumed knob, not a behaviour M10 implements.

Steps:

- [ ] **Step 1: Add the field.** Edit `app/config/default.json`, inside `"worldboss"`, after the last M1/M3 knob (place it just before `"boss_pool"` if present, else as the final key in the block — keep valid JSON, es5-trailing-comma rules do NOT apply to JSON):
  ```jsonc
  "natural_recovery_minutes": 15,
  "cold_start_max_hp": 2000000,
  "boss_pool": []
  ```

- [ ] **Step 2: Re-derive the HP value from the canonical curve (do not trust the placeholder 2,000,000).** Using the canonical formula, a level 20–60 roster averages `standardDamage(~40) ≈ 2000` per base hit; 80 players × 10 hits ≈ 800 base hits ≈ 1.6M raw damage before enrage doubling and before knockdown attrition. Run the sweep AND the integration gate at `cold_start_max_hp=2000000` and confirm both pass with margin. If the integration gate's `killRate < 0.95` or `finalHp > 0`, LOWER `cold_start_max_hp` (or, per D30, lower `natural_recovery_minutes` / `enrage_batch_size` in the M3 config) and re-run until green with headroom. If the "NOT trivially weak" assert fails (a single low-level player kills in 1–2 hits), RAISE `cold_start_max_hp`. The integration gate — not the sweep — is the authority for the final value.

- [ ] **Step 3: Re-run both gate and sweep against config-driven HP.**
  ```
  cd app && yarn test -- __tests__/WorldBossColdStartSim.test.js
  cd app && node bin/WorldBossSim.js
  ```
  Expected: with M4 + M3 landed, all integration-gate tests green; sweep `killRate ≥ 0.95` and `avgRoundsToKill` comfortably below the round cap (thin margin → lower HP).

- [ ] **Step 4: Commit the config field.**
  ```
  git add app/config/default.json
  git commit -m "feat(worldboss): add cold_start_max_hp gate knob (shared by integration gate + M6 boss HP)

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019S6Ho4Tu77orukvB73gZHV"
  ```

---

### Task 5: Full suite + lint + record the GATE verdict

**Files:** none (verification only).

**Interfaces:** Consumes everything above; produces the GO/NO-GO verdict for the feature.

Steps:

- [ ] **Step 1: Run the whole `app` suite (no regressions).** Run:
  ```
  cd app && yarn test
  ```
  Expected: full suite passes, including `WorldBossColdStartSim.test.js`. The gate's fakes keep it DB/Redis-free; the global `__tests__/setup.js` neutralizes incidental `config`/mysql/redis requires. `__tests__/fakes/worldBossInMemory.js` is not named `*.test.js`, so jest's `testMatch` (`<rootDir>/**/__tests__/**/*.test.js`) does not run it as a suite.

- [ ] **Step 2: Lint the new/changed app files.** Run:
  ```
  cd app && yarn lint bin/WorldBossSim.js __tests__/WorldBossColdStartSim.test.js __tests__/fakes/worldBossInMemory.js
  ```
  Expected: clean (double quotes, es5 commas, ≤100 cols). Break any >100-char line; do not add `eslint-disable` except the one already on the CLI `console.log`.

- [ ] **Step 3: Record the verdict (scoped honestly).** State explicitly in the PR/verification note, distinguishing the two checks:
  - "D30 GATE PASS (integration) — the REAL `WorldBossCombatService.dpsAttack`, driven against in-memory fakes (LOCK §C `worldBossRedis` pool/block/shield keyed by `platform_id`; HP read = `getTotalDamageByEventId` returning `{ total_damage }`, no `remain_hp`; base-gear `getEquipmentBonuses`; `attackType="adventurer|skillOne"`, `level` passed directly) for 80 all-DPS players (levels 20–60, default enrage/batch/counter/recovery knobs + cold-start scaling), brought a `cold_start_max_hp`=<value> boss to 0 with killRate=<value> over 100 seeded trials. The single-low-level not-trivially-weak assert holds (≤ hitsPerDay hits, finalHp > 0). This exercises M4's enrage trigger / knockdown batch / lazy recovery (`poolScore`/`poolRemove`) / kill `casStatus(active→killed)` — it is NOT a re-implemented model."
  - "Balance sweep (`WorldBossSim.js`) is a closed-form HP-tuning model only, pinned to the canonical `getStandardDamage()` formula via the real `make` factory across all job keys; it is NOT the acceptance proof and is not relied on for shipping."
  If the integration gate is RED, the feature is NOT shippable — loop back to Task 4 Step 2 and tune `worldboss.*` (or fix the M4 combat bug the gate just surfaced). A RED gate after M4 lands means a real combat defect, not a model mismatch — investigate `dpsAttack` (especially enrage ×2 on FINAL damage + contribution for hits that START enraged, the calm-band crossing-hit rule, threshold-cross detection, and the knockdown batch), not the sim.

---

**Key files (absolute):**
- Integration gate: `/home/hanshino/workspace/redive_linebot/app/__tests__/WorldBossColdStartSim.test.js`
- In-memory fakes: `/home/hanshino/workspace/redive_linebot/app/__tests__/fakes/worldBossInMemory.js`
- Balance sweep: `/home/hanshino/workspace/redive_linebot/app/bin/WorldBossSim.js`
- Config field: `/home/hanshino/workspace/redive_linebot/app/config/default.json` (`worldboss.cold_start_max_hp`)

**Cross-milestone notes for reviewers/drafters:**
- The acceptance GATE drives the REAL M4 `WorldBossCombatService.dpsAttack` against in-memory fakes — it does NOT re-implement combat math. M10 HARD-depends on M4 having landed; if M4 is absent the gate fails with `Cannot find module '../src/service/WorldBossCombatService'` (do not stub it).
- The fakes mirror M4's collaborators by their LOCK names: `worldBossRedis` exports the EIGHT LOCK §C names ONLY (`poolAdd/poolPopMin/poolScore/poolRemove/shieldSet/shieldConsume/blockSet/blockOwner`), keyed by `platform_id` (LOCK §B); `WorldBossLog.createWithRole` records damage and `getTotalDamageByEventId` returns `{ total_damage }` (object, no `remain_hp`); `getRecentAttackers → [{user_id, platform_id}]`; `getSupportRatio → 0`; `WorldBossEvent.casStatus(eventId, from, to, extra)` stamps `killed_at`; `UserModel.getId(platformId) → numeric` for off-hot-path absorb credit only. If M4's real names differ, the fakes — not M4 — are corrected and the drift flagged.
- `dpsAttack({ platformId, numericUserId, eventId, attackType, level })` takes `level` DIRECTLY; there is NO MinigameService mock (the prior draft's dead mocks are dropped). `attackType` is the raw `"<jobKey>|<skill>"` string (`"adventurer|skillOne"`).
- Damage is the single canonical `makeCharacter(jobKey, { level }).getStandardDamage()` = `floor(level^2)+level*10` (LOCK §D / addendum §1; level 50 = 3000, level 20 = 600). Real job keys are `swordman`/`mage`/`thief`/`adventurer`. The sweep's formula is test-pinned to the real factory across all job keys.
- Enrage rule (LOCK §D): the crossing hit is computed in the calm band (NOT doubled) and fires the batch-knock side effect; hits that START already enraged get ×2 on both `damage` and `contribution`. The gate validates this through the real `dpsAttack`; the verdict note flags it as a combat-bug surface if RED.
- M6's `createDailyBoss()` (LOCK §G) seeds the live boss HP from `worldboss.cold_start_max_hp` (or a documented multiple) so the gate validates the boss players actually fight. Lifecycle is M6; M10 only supplies the knob.

---

# Part 4 — Hard Acceptance Gates (recap)

1. **`resolveUserIds` settlement boundary** (M7) — settlement aggregates by numeric `user.id` and JOINs `user` to read `platform_id` off ranked rows; `resolveUserIds` (M1) covers participation-only ids. Gate test: a numeric id with no `user` row is SKIPPED, not mis-credited.
2. **Monte-Carlo cold-start simulation** (M10) — imports the REAL `WorldBossCombatService.dpsAttack`, fakes `worldBossRedis`/`WorldBossLog` to the locked names, models an all-DPS server, and asserts the daily boss HP reaches 0 (plus a not-trivially-weak sanity assert).

---

# Appendix A — Original Interface Contract (historical reference)

# World Boss Redesign — Implementation Contract (v1, locked)

> Single source of truth for 10 parallel milestone-drafters + 5 reviewers. Spec authority: `docs/superpowers/specs/2026-05-31-worldboss-redesign-brainstorm.md` (D1–D30). All paths verified against the repo. Branch: `feat/worldboss-redesign`.

---

## Global Constraints

Every milestone task inherits these verbatim. A reviewer rejects any task that violates one.

1. **NO LINE Push API.** Reply-only / LIFF / pull-based. cron settlement CANNOT notify groups. Boss-open / kill / reward results surface only on the player's *next* reply (battle-report card piggyback) or in LIFF.
2. **NO background combat tick.** Combat state changes resolve ONLY on (a) a player action — "the resolving hit" — or (b) a Redis TTL expiry observed lazily on next interaction. No `setInterval`, no per-tick cron damage. cron does ONLY: auto-open daily boss + settle (`killed`/`expired`).
3. **Group replies are batched (5-min `handleKeepingMessage`).** Battle-status broadcasts go INTO the batch. EXCEPTIONS that bypass with immediate `replyText`: (a) personal status feedback — knocked-down rejection / out-of-energy / no-role-selected; (b) ONE-TIME-per-event enrage announce on the triggering hit's group reply; (c) the once-per-day battle-report card riding on the first `#攻擊` of the new boss.
4. **Money = Inventory append-ledger.** `GODDESS_STONE_ITEM_ID=999`. EVERY grant is idempotent: copy `JankenDailyRewardLog.tryInsert()` (unique-key collision → return `false` → skip) + same-`mysql.transaction` ledger inserts; `reward_log` insert is the LAST step in the trx so any failure rolls back the whole batch (safe retry).
5. **Settlement identity boundary (BLOCKER).** `world_boss_event_log.user_id` stores the INTERNAL numeric `user.id`. Inventory / `player_equipment` / `AchievementEngine` / `world_boss_reward_log` ALL key on the LINE `platform_id` string. Settlement MUST run an explicit `resolveUserIds` JOIN (numeric `user.id` → `user.platform_id`) BEFORE any grant. Aggregation/ranking uses numeric id; every grant uses platform_id.
6. **Damage uses chat/minigame level** (`minigameService.findByUserId(userId).level`), NOT prestige/chat-exp directly.
7. **Migrations created ONLY via** `cd app && yarn knex migrate:make <name>` (generates the timestamped file you then edit). Never hand-author the timestamp/path.
8. **Backend is CommonJS** (`require`/`module.exports`). ESLint: double quotes, es5 trailing commas, 100-char print width.
9. **Jest in `app/`** (`__tests__/` dirs). Run: `cd app && yarn test -- <path>`. `jest.config` has `transform:{}` → `jest.mock(...)` is NOT hoisted → place EVERY `jest.mock(...)` BEFORE any `require()` of the mocked module.
10. **Branch `feat/worldboss-redesign`. Never commit to main.** Prod unreachable (no ssh/docker exec). Seeds/grants ship via migration or `npx knex seed:run` at deploy.
11. **Redis drives only real-time interaction, NEVER scoring.** All contribution scoring reads from `world_boss_event_log` (durable). Redis loss = lost live interaction only; landed contribution is never lost.

---

## File Structure

Exact repo paths. Files that change together are grouped under one milestone.

### M1 — Schema & migrations (foundation)
- `app/migrations/<ts>_alter_world_boss_event_add_lifecycle.js` — add `status`/`killed_at`/`settled_at` to `world_boss_event`.
- `app/migrations/<ts>_alter_world_boss_event_log_add_role_contribution.js` — add `role`/`contribution` + 5 indexes.
- `app/migrations/<ts>_add_enhance_level_to_player_equipment.js` — add `enhance_level int default 0`.
- `app/migrations/<ts>_create_world_boss_role.js` — new `world_boss_role` table.
- `app/migrations/<ts>_create_world_boss_reward_log.js` — new idempotent reward-log table.

### M2 — Role model + selection + migration backfill
- `app/src/model/application/WorldBossRole.js` — CRUD + `findOrCreate`/`reselect` for `world_boss_role`.
- `app/src/service/WorldBossRoleService.js` — role choose/reselect logic, free-reselect grace, base-gear grant on choose (D29).
- `app/migrations/<ts>_backfill_world_boss_role_dps.js` — backfill existing players to `role=dps` (D27).

### M3 — Reward-log model + enhancement item registration
- `app/src/model/application/WorldBossRewardLog.js` — `tryInsert` idempotent model (copy `JankenDailyRewardLog`).
- `app/config/default.json` — add `worldboss.*` tunables + `items.enhancement_material` id (MODIFY).
- `app/src/util/itemId.js` *(new, optional shared constants)* — export `GODDESS_STONE_ITEM_ID`, `ENHANCEMENT_MATERIAL_ITEM_ID` if a shared module is preferred; otherwise constants live in `WorldBossSettlementService`. **Decision: put them in config + re-export from `WorldBossConfig.js` (M3).**
- `app/src/service/WorldBossConfig.js` — typed accessors over `config.get("worldboss.*")` + boss-row dead-column readers (D25 knobs).

### M4 — Equipment enhancement layer
- `app/src/model/application/PlayerEquipment.js` — add `enhance_level` to fillable + `setEnhanceLevel`/`getWithEnhance` (MODIFY).
- `app/src/service/EquipmentService.js` — `enhanceEquipment(userId, equipmentId)`; apply `base*(1+0.05*enhance_level)` in `getEquipmentBonuses`; add `support_power`/`block_power` bonus keys (MODIFY).
- `app/seeds/WorldBossBaseGearSeeder.js` — seed healer/tank +0 base gear with `support_power`/`block_power` (D29).
- `app/src/controller/application/WorldBossController.js` — `#強化` command handler (MODIFY, see M9 too).

### M5 — Combat service (the three roles, contribution write-on-resolve)
- `app/src/service/WorldBossCombatService.js` — `dpsAttack`/`tankBlock`/`healerRevive`/`healerShield`; enrage CAS; pool/shield/block Redis ops; contribution write AFTER effect resolves.
- `app/src/util/worldBossRedis.js` — Redis key helpers for `wb:pool` / `wb:shield` / `wb:block` (ZSET/string + TTL).

### M6 — Model extensions for ranking & batch queries
- `app/src/model/application/WorldBossLog.js` — add `getDamageRank`/`getContributionRank(role)`/`getRecentAttackers`/`countActionsByDate`/`createWithRole`/`resolveUserIds` query helpers; fix INNER→ranking queries (MODIFY).
- `app/src/model/application/WorldBossEvent.js` — add `getActive`/`getKilledUnsettled`/`getExpiredUnsettled`/`casStatus` + lifecycle fillable (MODIFY).
- `app/src/service/WorldBossEventService.js` — wire status helpers + invalidate Redis cache on lifecycle change (MODIFY).

### M7 — Lifecycle cron + settlement (GATE: resolveUserIds)
- `app/bin/WorldBossAdvance.js` — per-minute cron: open daily boss / settle killed / expire+settle overdue (copy `RaceAdvance.js`).
- `app/src/service/WorldBossLifecycleService.js` — `createDailyBoss()` / `settleEvent(eventId)`; owns `resolveUserIds` + idempotent multi-item grant.
- `app/config/crontab.config.js` — register the cron job (MODIFY).
- `app/seeds/WorldBossScheduleSeeder.js` *(if a boss rotation pool is seeded)* — seed reusable `world_boss` templates with dead-column knobs.

### M8 — REST API + Socket.IO + battle report
- `app/src/router/api.js` — register `/game/world-boss/*` player routes (MODIFY).
- `app/src/handler/WorldBoss/player.js` — REST handlers: snapshot, my-status, action POSTs, report card.
- `app/src/router/socket.js` — add `/world-boss` namespace (MODIFY).
- `app/src/service/WorldBossBroadcastService.js` — debounced snapshot broadcaster (2–4 Hz) + enrage event.
- `app/src/service/WorldBossReportService.js` — build battle-report card + unread-flag mgmt (Redis).

### M9 — LINE command surface + controller rewrite
- `app/src/controller/application/WorldBossController.js` — rewrite `.router`: `#攻擊`/`#格擋`/`#復活`/`#護盾`/`#世界王`/`#強化`/`#職業`; postback actions; report-card piggyback; batch vs immediate routing; DELETE `#夢幻回歸` (D28); fix `getTopTen`/JSON-dump bugs (D26) (MODIFY).
- `app/src/templates/application/worldboss.js` *(new or MODIFY existing template file)* — Flex builders for status / three boards / report card.
- `app/src/app.js` — confirm `WorldBossController.router` spread + postback routing for new actions (MODIFY only if action names change).
- `app/src/model/application/WorldBoss.js` — rename `destory`→`destroy` (D26) (MODIFY).
- `app/src/handler/WorldBoss/admin.js` — update caller `destory`→`destroy` (MODIFY).

### M10 — Frontend LIFF + Monte-Carlo gate
- `frontend/src/pages/WorldBoss/index.jsx` — LIFF page: HP bar (calm/enrage color), three boards, scrolling feed, role-aware action buttons.
- `frontend/src/pages/WorldBoss/useWorldBossSocket.js` — socket client for `/world-boss` snapshot subscription.
- `frontend/src/App.jsx` — register kebab route `world-boss` (MODIFY).
- `app/__tests__/WorldBossColdStartSim.test.js` — **GATE**: Monte-Carlo all-DPS cold-start sim proving daily boss HP reaches 0 (D30).
- Per-service unit tests colocated under each owner module's `__tests__/` (every milestone ships its own tests).

---

## Migrations & Schema

All via `cd app && yarn knex migrate:make <name>`. Exact definitions:

### M1.a `world_boss_event` lifecycle (alterTable `world_boss_event`)
```js
table.enu("status", ["pending", "active", "killed", "expired"], {
  useNative: false, enumName: null,
}).notNullable().defaultTo("active");
table.datetime("killed_at").nullable();
table.datetime("settled_at").nullable();
table.index(["status", "settled_at"], "idx_wbe_status_settled");
table.index(["status", "end_time"], "idx_wbe_status_end");
```
> Existing in-flight events: legacy rows get `status='active'` (back-compat; cron will expire those past `end_time`).

### M1.b `world_boss_event_log` role + contribution (alterTable `world_boss_event_log`)
```js
table.enu("role", ["dps", "healer", "tank"]).notNullable().defaultTo("dps"); // D27
table.integer("contribution").notNullable().defaultTo(0);
table.index(["world_boss_event_id"], "idx_wbel_event");
table.index(["world_boss_event_id", "user_id"], "idx_wbel_event_user");
table.index(["world_boss_event_id", "role"], "idx_wbel_event_role");
table.index(["world_boss_event_id", "created_at"], "idx_wbel_event_created"); // enrage recent-N batch
table.index(["user_id", "created_at"], "idx_wbel_user_created");             // countCostByDate (no event_id; daily boss rotates)
```
> `damage` = ONLY damage to boss (non-zero for DPS, drives HP). `contribution` = points on the role's own board. Enrage ×2 applies to BOTH `damage` (DPS) and `contribution` simultaneously at write time.

### M1.c `player_equipment` enhance (alterTable `player_equipment`)
```js
table.integer("enhance_level").notNullable().defaultTo(0); // D9; existing gear all +0
```

### M1.d new `world_boss_role` (createTable)
```js
table.string("user_id", 33).notNullable().primary();        // LINE platform_id
table.enu("role", ["dps", "healer", "tank"]).notNullable();
table.timestamp("chosen_at").defaultTo(knex.fn.now());
table.integer("reselect_count").notNullable().defaultTo(0); // 0 = free reselect still available
```
> PK is platform_id string (role gating happens at the LINE layer where platform_id is known).

### M1.e new `world_boss_reward_log` (createTable; copy `JankenDailyRewardLog`)
```js
table.increments("id").primary();
table.string("user_id", 33).notNullable();      // platform_id (D-fix: grant identity)
table.integer("world_boss_event_id").notNullable();
table.integer("materials").notNullable().defaultTo(0);
table.integer("stones").notNullable().defaultTo(0);
table.enu("board", ["dps", "healer", "tank", "none"]).notNullable().defaultTo("none");
table.integer("rank").nullable();               // null = participation-only / expired
table.boolean("is_mvp").notNullable().defaultTo(false);
table.timestamp("created_at").defaultTo(knex.fn.now());
table.unique(["user_id", "world_boss_event_id"], "uniq_wbrl_user_event"); // one row per player per event
```

### Dead-column repurposed meanings (`world_boss` table — D25; values READ, schema unchanged)
| Column | New meaning | Fallback when 0/null |
|---|---|---|
| `attack` | enrage counter-attack knockdown chance % (per enrage attack) | `worldboss.enrage_counter_rate` (default 0.15) |
| `defense` | entry-batch size N (knocked-down on enrage trigger) | `worldboss.enrage_batch_size` (default 20) |
| `speed` | enrage HP threshold % | `worldboss.enrage_threshold_pct` (default 35) |
| `luck` | natural-recovery minutes override | `worldboss.natural_recovery_minutes` (default 15, D30 lowered) |
| `gold` | **abandoned** — settlement amounts live in config, not boss row |

---

## Canonical Interfaces

### Item ids & config (M3)
```js
// app/src/service/WorldBossConfig.js  (or app/src/util/itemId.js)
const GODDESS_STONE_ITEM_ID = 999;
const ENHANCEMENT_MATERIAL_ITEM_ID = 1001; // confirm unused at impl; register in config items
```
`config/default.json` additions under `worldboss`:
```jsonc
"worldboss": {
  "daily_limit": 100,
  "normal_attack_cost": 10,
  "enrage_threshold_pct": 35,
  "enrage_batch_size": 20,
  "enrage_recent_minutes": 10,
  "enrage_counter_rate": 0.15,
  "enrage_damage_multiplier": 2,
  "enrage_contribution_multiplier": 2,
  "natural_recovery_minutes": 15,
  "revive_count_k": 2,
  "shield_count_k": 2,
  "block_window_minutes": 5,
  "reselect_stone_cost": 5000,
  "enhance": { "max_level": 10, "per_level_pct": 0.05, "cost_base": 8 },
  "reward": {
    "participation": 15, "expired_participation": 5,
    "rank_bands": { "p1": 50, "p5": 35, "p20": 20, "rest": 8 },
    "mvp_stones": 30
  },
  "open_hour": 4,
  "boss_pool": [/* world_boss template ids for daily rotation */]
}
```
Effective-attr formula (M4, `getEquipmentBonuses`): `effective = base * (1 + 0.05 * enhance_level)` per attribute, capped at `enhance_level <= 10`.
Enhance cost: `cost(L) = (L) * config.worldboss.enhance.cost_base` to go from level `L-1`→`L` (i.e. +1 costs 8, +2 costs 16 … +10 costs 80; single item full = 440 materials).

### WorldBossRole model (M2) — `app/src/model/application/WorldBossRole.js`
```js
exports.model = new WorldBossRole({ table: "world_boss_role",
  fillable: ["user_id", "role", "chosen_at", "reselect_count"] });
exports.find = (userId) => model.first({ filter: { user_id: userId } }); // platform_id
exports.create = (attrs) => model.create(attrs);
exports.update = (userId, attrs) => model.update(userId, attrs, { pk: "user_id" });
```
`WorldBossRoleService` (M2):
```js
exports.getRole = async (platformId) => "dps"|"healer"|"tank"|null;
exports.chooseRole = async (platformId, role) =>
  { role, granted_gear: [equipmentId,...] }; // first choose free; grants +0 base gear (D29)
exports.reselectRole = async (platformId, role) =>
  { role, free_used: boolean }; // first reselect free; subsequent costs config.reselect_stone_cost (D27/D5)
```

### WorldBossRewardLog model (M3) — `app/src/model/application/WorldBossRewardLog.js`
```js
// Signature MUST mirror JankenDailyRewardLog.tryInsert
exports.tryInsert = async function (
  { user_id, world_boss_event_id, materials, stones, board, rank, is_mvp }, trx
) {
  const db = trx || mysql;
  try { await db("world_boss_reward_log").insert({ ... }); return true; }
  catch (err) { if (err && err.code === "ER_DUP_ENTRY") return false; throw err; }
};
exports.getByUserAndEvent = (user_id, world_boss_event_id, trx) => Promise<row|undefined>;
exports.getUnreadForUser = (user_id) => Promise<row|undefined>; // report-card source
```

### WorldBossLog model extensions (M6) — `app/src/model/application/WorldBossLog.js`
```js
exports.createWithRole = ({ user_id, world_boss_event_id, role, action_type, damage, cost, contribution }, trx) => Promise<insertId>;
exports.getDamageRank        = ({ eventId, limit }) => Promise<[{ total_damage, userId, platformId }]>; // GROUP BY user_id, JOIN user (replaces getTopRank, fixes getTopTen bug)
exports.getContributionRank  = ({ eventId, role, limit }) => Promise<[{ total_contribution, userId }]>; // WHERE role, SUM(contribution)
exports.getRecentAttackers   = ({ eventId, minutes, limit }) => Promise<[{ user_id }]>; // last N rows within window; enrage entry batch (raw row count, NO app-level dedupe)
exports.countActionsByDate   = (user_id, { startAt, endAt }) => Promise<{ count }>;       // role-aware effective-action count for participation eligibility
exports.resolveUserIds       = (numericIds) => Promise<Map<numericId, platformId>>;        // JOIN user; GATE for settlement
```

### WorldBossEvent extensions (M6) — `app/src/model/application/WorldBossEvent.js`
```js
exports.getActive          = () => Promise<event|null>;            // status='active' AND start<now<end
exports.getKilledUnsettled = () => Promise<[event]>;              // status='killed' AND settled_at IS NULL
exports.getExpiredUnsettled= () => Promise<[event]>;             // status='active' AND end_time<now
exports.casStatus = (eventId, fromStatus, toStatus, extra, trx) => Promise<boolean>; // atomic; sets killed_at/settled_at via extra
```

### WorldBossCombatService (M5) — `app/src/service/WorldBossCombatService.js`
All take Bottender-derived `{ platformId, numericUserId, eventId }`. Each writes its LOG row (with `contribution`) only AFTER its effect resolves, and returns a result for the reply layer.
```js
exports.dpsAttack    = async ({ platformId, numericUserId, eventId, attackType, level }) =>
  { damage, contribution, enraged, didEnrageTrigger, knockedBatch:[platformId,...], selfKnocked, rejected, reason };
  // 1. guard status==='active'; if knocked_down (ZSCORE wb:pool) & not lazily-recovered → rejected:true reason:"knocked_down", NO cost.
  // 2. compute base damage from minigame level; apply equip atk_percent.
  // 3. if enraged: damage*=2. write log {damage, contribution:damage, cost, role:'dps'}.
  // 4. HP CAS: if remainHp-damage<=0 → casStatus active→killed + killed_at SAME trx (kill trigger).
  // 5. if this hit crosses speed-threshold → enrage trigger: ZADD recent-N attackers to wb:pool (minus tank-blocked slots), didEnrageTrigger:true.
  // 6. if enraged & rand<counter_rate(scaled by D30 healer/tank ratio): selfKnocked → ZADD self to wb:pool.

exports.tankBlock    = async ({ platformId, numericUserId, eventId }) =>
  { windowMinutes, rejected, reason };
  // opens wb:block:{event} = {owner: platformId} EX=block_window_minutes*60. No contribution yet —
  // contribution is back-written by the enrage-trigger handler when it consumes blocked slots (D-fix timing contract).

exports.healerRevive = async ({ platformId, numericUserId, eventId }) =>
  { revived:[platformId,...], contribution, rejected, reason };
  // ZPOPMIN K from wb:pool (K from support_power/config). contribution = actual popped count. Write log {role:'healer', contribution, cost}.

exports.healerShield = async ({ platformId, numericUserId, eventId }) =>
  { shielded:[platformId,...], rejected, reason };
  // SET wb:shield:{event}:{target} = {owner: platformId} for K recent unshielded attackers.
  // contribution back-written when a shield actually absorbs a knockdown (D-fix timing). Records a base log row for participation.
```
**Contribution-on-resolve contract (D-fix):** revive contribution = real `ZPOPMIN` count, written immediately. Block/shield contribution is written by the enrage-trigger handler (`dpsAttack` step 5/6) when it consumes blocked slots / shield tokens — therefore `wb:block` and `wb:shield` values MUST store `owner_user_id` (platform_id) so the trigger knows whom to credit. Redis NEVER scores; boards read `SUM` from log.

### Redis keys (M5) — `app/src/util/worldBossRedis.js`
```
wb:pool:{eventId}            ZSET   member=platformId   score=knocked_ts(ms)   // ZADD on knockdown, ZPOPMIN on revive, ZSCORE on self-check, ZREM on lazy natural-recovery
wb:shield:{eventId}:{user}   STRING value=JSON{owner:platformId}  EX=event-remaining   // consumed (DEL) when a knockdown is absorbed
wb:block:{eventId}           STRING value=JSON{owner:platformId}  EX=block_window_minutes*60   // tank window; enrage trigger reads owner to credit absorbed slots
wb:snapshot:{eventId}        STRING cached debounced snapshot (broadcast throttle)
wb:report_unread:{user}      STRING flag; cleared only after report card actually delivered
```
Lazy natural recovery: on any action, if `ZSCORE wb:pool` exists and `score + recovery_minutes*60000 < now` → `ZREM` + treat as recovered (no cron).

### WorldBossLifecycleService (M7) — `app/src/service/WorldBossLifecycleService.js`
```js
exports.createDailyBoss = async () => Promise<eventId|null>;  // returns null if active event exists (getActive guard); picks from config.boss_pool; HP tuned to all-server kill
exports.settleEvent     = async (eventId) => Promise<void>;
// settleEvent algorithm (idempotency + identity GATE):
//   1. casStatus killed→killed? no — read event; if settled_at != null → return (idempotent guard).
//   2. aggregate three boards by NUMERIC user.id (getDamageRank / getContributionRank per role).
//   3. compute participation set = countActionsByDate>=1 (role-aware effective action).
//   4. resolveUserIds(allNumericIds) -> Map  ***GATE: no grant before this***.
//   5. mysql.transaction(async trx => { for each platformId:
//        const ok = await WorldBossRewardLog.tryInsert({user_id:platformId, world_boss_event_id, materials, stones, board, rank, is_mvp}, trx);
//        if (!ok) continue;
//        await inventory.insertItems([{userId:platformId, itemId:ENHANCEMENT_MATERIAL_ITEM_ID, itemAmount:materials, note:"world_boss_reward"}], trx);  // via trx
//        if (stones>0) await inventory.increaseGodStone({userId:platformId, amount:stones, note:"world_boss_mvp", trx});
//        // reward_log.tryInsert MUST be FIRST insert in the per-user sub-step so dup-key short-circuits before any ledger write
//      });
//   6. casStatus *→settled-marker: set settled_at = now (same/own trx).
//   7. AchievementEngine.evaluate(platformId,"boss_attack",{level, damage, feature:"world_boss", isTopDamage: (platformId === dpsBoardMvpPlatformId)})  // fixes boss_top_damage (D26)
//      + notifyUnlocks deferred to next pull (no push).
```
> `resolveUserIds(numericIds): Promise<Map<numericId, platformId>>` lives in `WorldBossLog` (M6), called by lifecycle. Reuses the `getTopRank` JOIN path (`world_boss_event_log.user_id = user.id`, select `user.platform_id`).

### Command verbs / postback actions (M9)
```js
exports.router = [
  text(/^[.#/](攻擊|attack)$/, withProps(attack, { attackType: "normal" })),
  text(/^[#＃](格擋|block)$/, tankBlockCmd),
  text(/^[#＃](復活|revive)$/, healerReviveCmd),
  text(/^[#＃](護盾|shield)$/, healerShieldCmd),
  text(["#世界王", "/worldboss"], bossStatus),     // HP%/phase/own contribution/three-board tops (pull-based)
  text(/^[#＃]強化$/, enhanceCmd),
  text(/^[#＃]職業$/, roleCmd),                     // choose/reselect role
  // REMOVED: #夢幻回歸 (D28)
];
// Postback actions (HandlePostback in app.js):
//   { action:"worldBossAttack", eventId, role }        -> attackOnBoss
//   { action:"worldBossBlock", eventId }
//   { action:"worldBossRevive", eventId }
//   { action:"worldBossShield", eventId }
//   { action:"worldBossChooseRole", role }
```

### REST routes (M8) — `app/src/router/api.js`, player-gated `verifyToken` only
```
GET  /api/game/world-boss/snapshot            -> public battle state (HP%, phase, three boards, recent feed)
GET  /api/game/world-boss/me                  -> own role / knocked-down / shield / today actions
POST /api/game/world-boss/attack              -> WorldBossCombatService.dpsAttack
POST /api/game/world-boss/block               -> tankBlock
POST /api/game/world-boss/revive              -> healerRevive
POST /api/game/world-boss/shield              -> healerShield
POST /api/game/world-boss/role                -> chooseRole / reselectRole
POST /api/game/world-boss/enhance             -> EquipmentService.enhanceEquipment
GET  /api/game/world-boss/report              -> unread battle-report card (clears flag)
```
Registered as: `router.use("/game", verifyToken, WorldBossPlayerRouter);` (mirrors existing `/game` PlayerEquipment pattern). Admin CRUD stays under existing `/admin` gate.

### Socket.IO (M8) — `app/src/router/socket.js`
```js
io.of("/world-boss").use(socketSetProfile).on("connection", socket => { /* join event room; emit current snapshot */ });
// Server emits (debounced 2-4 Hz from WorldBossBroadcastService):
//   "snapshot" -> { eventId, hpPct, phase:"calm"|"enrage", boards:{dps,healer,tank}, feed:[...] }
//   "enrage"   -> { eventId, knockedBatch:[...] }   // one-shot on phase flip
```
Auth via `socketSetProfile` (LIFF token in `socket.handshake.query.token`) — public battle state only; private state pulled via REST `/me`.

### Cron registration (M7) — `app/config/crontab.config.js`
```js
{
  name: "World Boss Advance",
  description: "open daily boss / settle killed / expire+settle overdue (no push; reply/LIFF surfacing)",
  period: ["0", "*", "*", "*", "*", "*"],   // every minute on second 0
  immediate: true,
  require_path: "./bin/WorldBossAdvance",
}
```

---

## Milestone Dependency Order

Confirmed M1→M10. Each line: **produces** (names downstream consumes) ← **consumes** (upstream names).

- **M1 Schema/migrations** — produces: all tables/columns/indexes. Consumes: nothing. *(Foundation; everyone waits on the column/table names here.)*
- **M2 Role model+service+backfill** — produces: `WorldBossRole`, `WorldBossRoleService.{getRole,chooseRole,reselectRole}`. Consumes: M1 `world_boss_role`; M4 base-gear grant (soft — choose calls `EquipmentService.addToInventory`; can stub until M4).
- **M3 Reward-log + item ids + config** — produces: `WorldBossRewardLog.tryInsert`, `ENHANCEMENT_MATERIAL_ITEM_ID`, all `worldboss.*` config, `WorldBossConfig` accessors + dead-column readers. Consumes: M1 `world_boss_reward_log`.
- **M4 Equipment enhancement** — produces: `EquipmentService.enhanceEquipment`, `getEquipmentBonuses` with `support_power`/`block_power` + `enhance_level` math, base-gear seeder. Consumes: M1 `enhance_level`, M3 item id + enhance config.
- **M5 Combat service** — produces: `WorldBossCombatService.{dpsAttack,tankBlock,healerRevive,healerShield}`, Redis key helpers, contribution-on-resolve + owner-tagged Redis values. Consumes: M3 config knobs, M4 `getEquipmentBonuses`, M6 `createWithRole`/`getRecentAttackers`/`casStatus` (M5 and M6 are tightly coupled — draft M6 model helpers first, then M5 service).
- **M6 Model extensions** — produces: `WorldBossLog.{createWithRole,getDamageRank,getContributionRank,getRecentAttackers,countActionsByDate,resolveUserIds}`, `WorldBossEvent.{getActive,getKilledUnsettled,getExpiredUnsettled,casStatus}`. Consumes: M1 columns/indexes.
- **M7 Lifecycle cron + settlement** — produces: `WorldBossLifecycleService.{createDailyBoss,settleEvent}`, `bin/WorldBossAdvance.js`, cron entry. Consumes: M2 roles, M3 reward-log + item ids, M6 ranking + `resolveUserIds` + `casStatus`, M4 (base gear already granted at role-choose). **GATE #1: settleEvent MUST call `resolveUserIds` before any grant — reviewer rejects any grant keyed on numeric user.id.**
- **M8 REST + Socket + report** — produces: `/game/world-boss/*` routes, `/world-boss` namespace, `WorldBossBroadcastService`, `WorldBossReportService`. Consumes: M5 combat service (shared with LINE), M3 reward-log unread source, M6 snapshot data.
- **M9 LINE command surface** — produces: rewritten `WorldBossController.router`, Flex templates, postback wiring, `#夢幻回歸` removal, `destory→destroy` + bug fixes (D26). Consumes: M2 role gating, M4 `#強化`, M5 combat service, M3 config, M8 report card.
- **M10 Frontend LIFF + cold-start gate** — produces: LIFF page + socket hook + kebab route; **`WorldBossColdStartSim.test.js`**. Consumes: M8 routes/socket, M5 combat numbers, M3 config knobs, M7 lifecycle HP tuning. **GATE #2: Monte-Carlo all-DPS sim (default counter/batch/recovery knobs, N players × ~10 hits) MUST show daily boss HP reaches 0 before M10 (and the whole feature) is accepted; if not, tune `worldboss.*` knobs (D30 dynamic-pressure scaling + lowered recovery) until it passes.**

Critical coupling note for drafters: **M5↔M6** share the combat-write/query boundary, and **M7** is the single place where the identity GATE lives — draft M6's `resolveUserIds`, `casStatus`, and `getRecentAttackers` signatures first so M5 and M7 align to exact names.

---

Files relevant to drafters (all absolute):
- Spec: `/home/hanshino/workspace/redive_linebot/docs/superpowers/specs/2026-05-31-worldboss-redesign-brainstorm.md`
- Idempotency template: `/home/hanshino/workspace/redive_linebot/app/src/model/application/JankenDailyRewardLog.js` + `/home/hanshino/workspace/redive_linebot/app/src/service/JankenRewardService.js`
- Lifecycle cron template: `/home/hanshino/workspace/redive_linebot/app/bin/RaceAdvance.js` + `/home/hanshino/workspace/redive_linebot/app/src/service/RaceService.js`
- Ledger: `/home/hanshino/workspace/redive_linebot/app/src/model/application/Inventory.js` (`increaseGodStone`/`insertItems`, both accept `trx`)
- Identity JOIN source: `/home/hanshino/workspace/redive_linebot/app/src/model/application/WorldBossLog.js:156-164` (`getTopRank`, `user.id→platform_id`)

---

*Plan generated 2026-06-20 from `docs/superpowers/specs/2026-05-31-worldboss-redesign-brainstorm.md` (D1–D30), corrected against verified codebase ground truth and a definitive API/ownership lock. Branch: `feat/worldboss-redesign`.*
