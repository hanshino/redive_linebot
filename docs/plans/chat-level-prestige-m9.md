# M9 — Migration Script + Staging Rehearsal

**Goal:** Convert production data to the new prestige schema in a single, auditable, reversible step. Build the one-shot `migrate-prestige-system.js`, the matching `rollback-prestige-system.js`, and the T-0 runbook so the cut-over can be executed by a single operator with verifiable SQL evidence.

**Branch:** `feat/clp-m9` off `feat/chat-level-prestige`

## Context

- M1 already shipped the rename (`chat_user_data` → `chat_user_data_legacy_snapshot`) and recreates an **empty** new `chat_user_data` table (`app/migrations/20260423153346_rename_and_recreate_chat_user_data.js`). The new pipeline (`app/src/service/chatXp/pipeline.js`) auto-creates rows on first XP write via `ChatUserData.upsert`.
- M8 added the `CHAT_XP_PAUSED` Redis kill-switch — `EventDequeue.handleChatExp` short-circuits while it's set, so we can pause writes without taking the bot offline.
- The legacy snapshot inherits the production `chat_user_data` schema, which today carries a `platform_id` column (see `app/bin/TitleDelivery.js:32-37`); the original `migration/Princess.sql` dump (line 366-375) is stale on this point. The script must **defensively detect** which user-key column is present.
- Pioneer threshold per spec: `experience > 8,407,860` ≈ Lv.100 in the old curve; spec line 7 names ~82 candidates.
- `prestige_pioneer` achievement (key, id-via-cache) is already seeded by `app/migrations/20260424154256_seed_prestige_achievements.js`. Granting goes through `AchievementEngine.unlockByKey(userId, "prestige_pioneer")`, which is idempotent (`already_unlocked` is a no-op return).

## Architecture

### `migrate-prestige-system.js` — flow

1. **Pause guard** — read `CHAT_XP_PAUSED`. If not `"1"`, abort with non-zero exit. The runbook owns setting the flag; the script refuses to run without it because the new pipeline writing concurrently with the migration would corrupt the snapshot diff.
2. **Snapshot guard** — assert `chat_user_data_legacy_snapshot` exists and the new `chat_user_data` is present. If only the live `chat_user_data` exists with the legacy shape (operator forgot to run `yarn migrate`), abort with a remediation message rather than auto-renaming. Auto-renaming was in the original spec but is too risky as a side effect of a "data" script — keep schema mutations in knex migrations.
3. **Column detection** — `INFORMATION_SCHEMA.COLUMNS` lookup on `chat_user_data_legacy_snapshot`: prefer `platform_id`, fall back to `JOIN user ON user.id = chat_user_data_legacy_snapshot.id` for the `int id` form. Resolve once, reuse for both pioneer query and bulk seed.
4. **Pioneer query** — single `SELECT` returning `{platform_id, experience}` for rows where `experience > 8407860`. Order by `experience desc` so the audit log is human-readable (top whales first).
5. **Seed all rows** — drive a single `INSERT … ON DUPLICATE KEY UPDATE` against the new `chat_user_data` from the legacy snapshot, mapping every legacy user to `{user_id, prestige_count: 0, current_level: 0, current_exp: 0}`. `ON DUPLICATE` makes re-runs no-op (idempotent). Skip rows whose `platform_id` is null/empty (defensive against stale legacy data).
6. **Grant pioneer achievement** — for each pioneer, call `AchievementEngine.unlockByKey(platformId, "prestige_pioneer")` sequentially. We don't parallelize because:
   - 82 calls × ~10ms = under 1s; not worth a worker pool
   - Sequential preserves a deterministic audit log ordering
   - `unlockByKey` already handles the already-unlocked case gracefully
7. **Audit log** — emit JSON to stdout AND append to a timestamped file under `app/logs/migrate-prestige-${YYYYMMDD-HHmmss}.log`. Schema:
   ```json
   {
     "started_at": "...",
     "finished_at": "...",
     "snapshot_user_count": 22131,
     "seeded_count": 22131,
     "pioneer_threshold": 8407860,
     "pioneers": [{"user_id": "Uxxx", "experience": 12345678, "achievement_result": "unlocked|already_unlocked|error"}],
     "pioneer_count": 82,
     "achievement_unlocked": 80,
     "achievement_already_unlocked": 0,
     "achievement_errors": 2
   }
   ```
8. **Exit code** — `0` on clean run; `1` on any pause-guard / snapshot-guard / DB error. Per-pioneer achievement errors do not fail the whole run (they're surfaced in the audit log) — by design, the migration's job is to seed the new state; achievement grants are a side-effect that can be reconciled later via re-run (idempotent).

### `rollback-prestige-system.js` — flow

1. **Pause guard** — same `CHAT_XP_PAUSED = "1"` assertion. Operator must pause again before rolling back.
2. **Snapshot guard** — assert `chat_user_data_legacy_snapshot` still exists. If the rollback window has passed and the snapshot was dropped (T+72h), abort.
3. **Schema swap** —
   - `DROP TABLE chat_user_data` (the new, post-migration empty/seeded one)
   - `RENAME TABLE chat_user_data_legacy_snapshot TO chat_user_data`
4. **Revoke pioneer achievement** — `DELETE FROM user_achievements WHERE achievement_id = (SELECT id FROM achievements WHERE key='prestige_pioneer')`. Single batch DELETE; no per-user loop needed.
5. **Audit log** — same JSON shape, file under `app/logs/rollback-prestige-${ts}.log`, with `revoked_count` from the DELETE result.

> **Out-of-band rollback considerations** that the script does NOT handle (operator's responsibility): redeploying the previous bot/worker code so it can read the legacy schema, and unsetting `CHAT_XP_PAUSED`. Both belong to the runbook, not the script — the script must stay focused on the data swap so the operator can run it surgically.

## Files

| File | Action |
|---|---|
| `app/bin/migrate-prestige-system.js` | New — one-shot migration |
| `app/bin/rollback-prestige-system.js` | New — reverse |
| `app/__tests__/bin/migrate-prestige-system.test.js` | New — unit tests for migration |
| `app/__tests__/bin/rollback-prestige-system.test.js` | New — unit tests for rollback |
| `docs/plans/chat-level-prestige-m9-runbook.md` | New — T-0 runbook + verify SQL |
| `docs/plans/chat-level-prestige-impl.md` | Update — tick M9 exit criteria |
| `~/.claude/projects/-home-hanshino-workspace-redive-linebot/memory/chat-level-prestige.md` | Update — M9 status note |

## Tasks

1. **`migrate-prestige-system.js`** — implement the 8-step flow above. Use `redis.get` directly (not `chatUserState`) to keep the dependency surface small. Use `mysql.transaction` only around the seed + pioneer-query block; achievement unlock is outside the trx because each `unlockByKey` call manages its own write.
2. **`rollback-prestige-system.js`** — implement the 5-step flow. The schema swap must happen in a `mysql.raw` block ordered: DROP first, then RENAME. If RENAME fails, the new table is already gone — operator must restore from a logical backup. Document this in the runbook.
3. **Tests** — for each script: pause guard (flag missing → abort; flag = "0" → abort), snapshot guard (missing → abort), happy path (sees pioneers in audit), idempotency (second run = `already_unlocked` for pioneers), achievement-error swallow (one pioneer's `unlockByKey` throws → others still get unlocked, audit reports the error). Mock `mysql`, `redis`, and `AchievementEngine` per the existing `ChatExpEventsPrune.test.js` pattern.
4. **Runbook** — `chat-level-prestige-m9-runbook.md` covers: T-0 sequence, verify SQL queries, rollback decision tree, T+72h cleanup. Embedded in plan = harder for an operator to grep mid-incident; keep it as a separate doc.
5. **Tracker** — tick M9 exit criteria, update memory marker.

## Exit Criteria

- [ ] `yarn lint` clean.
- [ ] `yarn test` green for new test files (and no regressions in existing bin tests; only pre-existing `images.test.js` Imgur leftover may fail — unrelated).
- [ ] `migrate-prestige-system.js` is idempotent: a second run produces zero new unlocks and zero seed inserts (every pioneer reports `already_unlocked`; every snapshot row reports unchanged).
- [ ] `rollback-prestige-system.js` restores `chat_user_data` to the legacy shape and zeroes the `prestige_pioneer` unlock count.
- [ ] Runbook lists the verify SQL queries from the impl plan (per-user spot check, `chat_exp_events` write check, `chat_exp_daily` accumulation check, LIFF `/prestige` reachability).
- [ ] Staging rehearsal recorded in the runbook as a checklist (the actual rehearsal run is a manual operator step performed against a staging dump; that execution is out of scope for this code change but the checklist must be ready).

## Out of Scope

- Actual staging dry-run execution. The plan calls for "Dump prod snapshot to staging DB → run script → verify → run rollback". That requires SSH + DB access against the staging environment; the script + runbook + tests are the M9 deliverable. The dry-run is performed by the operator before T-0 using these artifacts.
- T-0 / T+7 broadcast scheduling — owned by M10.
- Dropping `chat_user_data_legacy_snapshot` at T+72h — owned by M10. M9 only ships the rollback path that depends on the snapshot being present.

**Dependencies:** M1 (schema), M3 (PrestigeService achievement triggers — confirms the `unlockByKey` API contract), M5 (pioneer achievement seed), M8 (pause flag).
