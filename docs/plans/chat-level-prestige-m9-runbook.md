# M9 — T-0 Cut-over Runbook

**Audience:** the operator running the cut-over (likely solo). This file is meant to be read top-to-bottom during the maintenance window with as little interpretation as possible.

**Companion docs:** [`chat-level-prestige.md`](./chat-level-prestige.md) (spec), [`chat-level-prestige-impl.md`](./chat-level-prestige-impl.md) (master plan), [`chat-level-prestige-m9.md`](./chat-level-prestige-m9.md) (M9 design).

---

## 0. Pre-flight (T-1 day)

- [ ] Confirm the `feat/chat-level-prestige` branch is merged into `main` and the new bot/worker/frontend stacks are built and ready to deploy.
- [ ] Confirm the production DB has a recent logical backup (mysqldump within the last 24h). The rollback script depends on the legacy snapshot table; the backup is the safety net for snapshot-table corruption.
- [ ] Confirm Redis flush is **not** part of any planned ops in the window — the migration depends on Redis state surviving (`CHAT_USER_STATE_*`, reply tokens, broadcast queue).
- [ ] Confirm the `prestige_pioneer` achievement row is seeded in `achievements`:
  ```sql
  SELECT id, key, name FROM achievements WHERE `key` = 'prestige_pioneer';
  ```
  Expect a single row (added by `app/migrations/20260424154256_seed_prestige_achievements.js`).

---

## 1. Staging dry-run (T-3 day, mandatory)

Use a recent prod dump restored to staging.

```bash
# 1. Restore prod snapshot to staging
mysql -h staging-host -u admin -p Princess < prod_snapshot.sql

# 2. Pause writes on staging (one-shot)
redis-cli -h staging-redis SET CHAT_XP_PAUSED 1

# 3. Run knex migrations (schema rebuild + 3-tier achievement grant in one pass)
docker exec staging-bot yarn migrate
# → final migration stdout includes:
#   [grant_legacy_tier_achievements] seeded=<N> prestige_pioneer=<lv100> legacy_lv80=<lv80> legacy_lv50=<lv50>

# 4. Verify (see Section 5 — same SQL block applies)

# 5. Run the rollback to confirm the reversal works
docker exec staging-bot node bin/rollback-prestige-system.js
# → expected stdout: "[rollback-prestige-system] done. revoked=<N> inventory=<N>"

# 6. Re-verify legacy schema is back:
mysql -h staging-host -e "DESCRIBE Princess.chat_user_data" \
  | grep -E "(experience|rank)"   # should show legacy columns
```

If any step deviates from expected output, **stop** and investigate before scheduling T-0. Do not proceed if `prestige_pioneer` count differs by more than ±5 from the spec's 82 (caused by drift since 2026-04-23 — acceptable; spike beyond ±20 means the threshold needs revisiting).

---

## 2. T-0 sequence (production)

Each step assumes the previous one succeeded. **Time-box: 30 minutes.** If any step blocks for more than 5 minutes, follow the abort path in Section 4.

### 2.1 Set the pause flag

```bash
redis-cli -h prod-redis SET CHAT_XP_PAUSED 1
redis-cli -h prod-redis GET CHAT_XP_PAUSED   # → "1"
```

`EventDequeue.handleChatExp` short-circuits at this point. Reply tokens, group joins, and bot commands all keep working — only XP records are skipped.

### 2.2 Drain in-flight XP (recommended ~2 min wait)

The pipeline runs every 5 minutes; with the pause flag set, the next pipeline tick drains whatever was already in `CHAT_EXP_RECORD` and finds nothing new. Wait for one tick to finish before snapshotting so the migration sees a quiesced legacy table.

```bash
redis-cli -h prod-redis LLEN CHAT_EXP_RECORD   # → 0 within ~5 min
```

### 2.3 Run knex migrations

```bash
docker exec redive_linebot-bot-1 yarn migrate
```

This executes 13 migrations in a single batch:

- `2026042315*.js` — schema rebuild (rename old `chat_user_data` → `chat_user_data_legacy_snapshot`, recreate empty new table, add trial / blessing / event tables, drop chat title tables, inline-seed `chat_exp_unit` / `prestige_trials` / `prestige_blessings` reference data).
- `20260424154256_seed_prestige_achievements.js` — seeds the 7 prestige + legacy-tier achievement rows.
- `20260501112206_add_xp_breakdown_columns_to_chat_exp_events.js` — adds breakdown columns to events table.
- `20260501150000_grant_legacy_tier_achievements.js` — **the data cut-over**: seeds 23k empty `chat_user_data` rows from the legacy snapshot, then grants 3-tier memorial achievements (`prestige_pioneer` Lv.100+, `legacy_lv80` Lv.80+, `legacy_lv50` Lv.50+) plus the matching `Inventory` ledger rows tagged with the sentinel note `成就獎勵 [legacy-tier-migration-2026-05-01]`. Wrapped in a single transaction so partial failure rolls everything back.

Expected stdout near the end:

```
[grant_legacy_tier_achievements] seeded=23091 prestige_pioneer=82 legacy_lv80=~250 legacy_lv50=2240
```

The migration auto-skips on a fresh DB (no `chat_user_data_legacy_snapshot`) — safe to re-run on dev/CI without a legacy snapshot.

### 2.4 Deploy new code

Update the Portainer stack `redive_linebot` to the merged `main` image. This rolls bot + worker + frontend together. Wait for the stack to converge (`docker ps` shows all three at "Up" status).

### 2.5 Unset the pause flag

```bash
redis-cli -h prod-redis DEL CHAT_XP_PAUSED
redis-cli -h prod-redis GET CHAT_XP_PAUSED   # → (nil)
```

`EventDequeue.handleChatExp` resumes pushing to `CHAT_EXP_RECORD` immediately. The new pipeline (`app/src/service/chatXp/pipeline.js`) drains it on the next 5-minute tick.

---

## 3. Verify (T-0 + 15 min)

Run **all** of these. If any fails, jump to Section 4.

### 3.1 Pioneer count matches audit log

```sql
SELECT COUNT(*) FROM user_achievements
WHERE achievement_id = (SELECT id FROM achievements WHERE `key` = 'prestige_pioneer');
-- Expect: matches audit.achievement_unlocked + audit.achievement_already_unlocked (82 ± drift)
```

### 3.2 New chat_user_data is seeded

```sql
SELECT COUNT(*) AS total,
       COUNT(CASE WHEN current_exp = 0 AND current_level = 0 AND prestige_count = 0 THEN 1 END) AS zeroed
FROM chat_user_data;
-- Expect: total = legacy snapshot count, zeroed = total (everyone starts at 0)
```

### 3.3 New pipeline writes XP

Have a known test user send a message in any monitored group, then:

```sql
SELECT user_id, raw_exp, effective_exp, ts
FROM chat_exp_events
WHERE user_id = 'U<test-user-platform-id>'
ORDER BY ts DESC
LIMIT 5;
-- Expect: at least 1 row inserted in the last 5 min, raw_exp > 0
```

```sql
SELECT user_id, date, raw_exp, effective_exp
FROM chat_exp_daily
WHERE user_id = 'U<test-user-platform-id>'
  AND date = CURRENT_DATE();
-- Expect: 1 row, raw_exp ≈ sum of recent chat_exp_events.raw_exp for today
```

```sql
SELECT user_id, current_level, current_exp, prestige_count
FROM chat_user_data
WHERE user_id = 'U<test-user-platform-id>';
-- Expect: current_exp incremented from the messages sent
```

### 3.4 LIFF Prestige page renders

Open the LIFF prestige page (`/prestige`) on a phone with the LIFF app. For a pioneer test user, expect:
- Status card showing prestige_count = 0, current_level = 0
- Achievement page shows the new `prestige_pioneer` 🏛️ badge
- Trial select view shows ★1 trial as the only available option (others are locked behind it)

### 3.5 Spot check — random sample of 5 users

Pick 5 user_id values from the audit log (a mix of pioneers and non-pioneers) and verify:

```sql
SELECT user_id, current_level, current_exp, prestige_count, awakened_at, active_trial_id
FROM chat_user_data
WHERE user_id IN ('U…', 'U…', 'U…', 'U…', 'U…');
-- Expect: all rows show fresh state (level=0, exp=0, prestige=0, no active trial)
```

### 3.6 Cron jobs registered

```bash
docker logs redive_linebot-worker-1 --tail 30 | grep -E "(Trial Expiry|Broadcast Queue|Chat Exp Events Prune)"
# Expect: 3 cron job initialization lines
```

---

## 4. Abort / rollback decision tree

### 4.1 If `yarn migrate` aborts mid-batch

The grant-tier migration runs inside a single `knex.transaction`, so any failure
within `up` rolls back its own work. Earlier batch-115 migrations may already
have succeeded (knex commits each migration individually) — check the
`knex_migrations` table to see which point we stopped at.

| Symptom | Action |
|---|---|
| `cannot resolve user identity` | Legacy table has unexpected columns. STOP. Restore from pre-T-0 backup and investigate. |
| `achievements rows missing for keys: …` | The achievement-seed migration didn't run. Verify `20260424154256_seed_prestige_achievements.js` is in `knex_migrations`; if so, the row was deleted manually — re-seed and rerun `yarn migrate`. |
| Transaction rolled back mid-grant (e.g. DB connection lost) | Re-run `yarn migrate` — knex will retry the failed migration. INSERT IGNORE / NOT EXISTS gates make it idempotent. |
| Earlier batch-115 migration failed (schema rebuild) | STOP. Restore from pre-T-0 backup. Schema changes are not transactional in MySQL, so partial schema rollback is fragile. |

### 4.2 If verification fails (Section 3 fails any step)

1. Set `CHAT_XP_PAUSED = 1` again to stop further writes:
   ```bash
   redis-cli -h prod-redis SET CHAT_XP_PAUSED 1
   ```
2. Run the rollback script:
   ```bash
   docker exec redive_linebot-bot-1 node bin/rollback-prestige-system.js
   ```
   Expected: `[rollback-prestige-system] done. revoked=<lv50+lv80+lv100 sum> inventory=<sum>`. Both counts should be roughly equal (each grant inserted one user_achievements row + one Inventory ledger row).
3. Redeploy the previous bot/worker/frontend image (Portainer stack revert).
4. Unset `CHAT_XP_PAUSED`:
   ```bash
   redis-cli -h prod-redis DEL CHAT_XP_PAUSED
   ```
5. Verify legacy code reads `chat_user_data` (now restored from snapshot):
   ```sql
   DESCRIBE chat_user_data;   -- expect legacy columns: id, experience, modify_date, rank
   ```

### 4.3 If the rollback script itself fails after `dropTable` but before `renameTable`

The new `chat_user_data` is gone but the legacy snapshot still exists under its rename. Manually finish the rename:
```sql
RENAME TABLE chat_user_data_legacy_snapshot TO chat_user_data;
```
Then run the achievement + inventory revoke manually:
```sql
DELETE FROM user_achievements
WHERE achievement_id IN (
  SELECT id FROM achievements WHERE `key` IN ('prestige_pioneer', 'legacy_lv80', 'legacy_lv50')
);
DELETE FROM Inventory
WHERE note = '成就獎勵 [legacy-tier-migration-2026-05-01]';
```

If `chat_user_data_legacy_snapshot` is also gone (catastrophic), restore from the pre-T-0 logical backup.

---

## 5. T+72h cleanup (owned by M10, listed here for completeness)

After 72 hours of stable operation:

```sql
DROP TABLE chat_user_data_legacy_snapshot;
```

This closes the rollback window. From this point, rollback requires a logical-backup restore. M10's runbook owns this step; do not perform it during M9.

---

## Appendix A — legacy tier thresholds

The 3-tier memorial achievements are gated on cumulative XP in the legacy `chat_exp_unit` curve:

| Tier | Achievement key | XP threshold | Legacy level | 2026-05-01 prod count |
|---|---|---|---|---|
| Pioneer | `prestige_pioneer` | ≥ 8,407,860 | Lv.100 | 82 |
| Senior | `legacy_lv80` | ≥ 3,357,460 | Lv.80 | ~250 |
| Veteran | `legacy_lv50` | ≥ 200,860 | Lv.50 | 2,240 |

Thresholds live in `app/migrations/20260501150000_grant_legacy_tier_achievements.js` as `LEGACY_TIERS`. Tiers nest — a Lv.100+ user receives all three. Inserts use `INSERT IGNORE` (achievements) and `NOT EXISTS` gates (Inventory) so re-runs of the migration are no-ops.

## Appendix B — re-running the data cut-over

The cut-over now lives in a knex migration, so `yarn migrate` is the canonical entry point. To re-trigger after a partial failure:

```bash
docker exec redive_linebot-bot-1 yarn migrate
```

knex skips migrations already recorded in `knex_migrations`. The grant-tier migration's `up` is idempotent — `INSERT IGNORE` + `NOT EXISTS` gates make repeated execution safe even outside the knex tracker (e.g. if the row was manually removed from `knex_migrations`).

To roll back just the grant-tier migration in a non-prod environment (without touching schema):

```bash
docker exec redive_linebot-bot-1 yarn knex migrate:rollback --to=20260501150000_grant_legacy_tier_achievements.js
```

This invokes `down`, which deletes the 3-tier achievement rows + the sentinel-tagged Inventory rows. `chat_user_data` is **not** reverted — see §4.3 for the schema-level rollback path.

The script reads the same `.env` as the bot via `dotenv` (line 1-5 of the script). Confirm `DB_HOST` and `REDIS_HOST` resolve to the production endpoints from your shell.
