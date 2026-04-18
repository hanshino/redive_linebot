# Subscriber Auto-Actions — Rollout Plan (Phase 8)

Phases 1-7 landed on branch `feat/subscriber-auto-actions`. This doc records
the staged rollout after merge.

## Feature flags (config/default.json)

| Key | Default | Flip to enable |
|---|---|---|
| `autoGacha.enabled` | `false` | production + staging |
| `autoGacha.concurrency` | `8` | keep (≤ knex pool.max - 2) |
| `autoGacha.schedule` | `["0","50","23","*","*","*"]` | keep unless collision |
| `autoJankenFate.enabled` | `false` | production + staging |

Override via NODE_CONFIG_DIR / custom-env / production.json as needed.

## Seed data prerequisite

After `yarn migrate` on prod DB, verify the seed migration ran:
```sql
SELECT key, JSON_EXTRACT(effects, '$[*].type') FROM subscribe_card WHERE key IN ('month','season');
-- expect auto_daily_gacha + auto_janken_fate in both cards
```

## Observability log lines

Structured lines to monitor (via DefaultLogger.info → worker logs):

- `cron.auto_gacha.start target_count=N`
- `cron.auto_gacha.complete duration_ms=X target_count=N success=S failed=F skipped=K`
- `[AutoGacha] draw failed for <userId>: <error>`
- `janken.auto_fate.submit match_id=<id> user_id=<id> role=p1|p2 choice=rock|paper|scissors`

Alert thresholds (suggested):
- `failed / target_count > 0.05` for 1 consecutive run
- `duration_ms > 300000` (5 min hard cap from AC-17)

## Staged rollout

1. **Day 0 — Deploy with flags OFF.** Ship code, run migrations. Confirm
   no cron rows get written (`SELECT COUNT(*) FROM auto_gacha_job_log
   WHERE run_date = CURDATE()` should stay 0).
2. **Day 1 — Internal canaries.** Manually set `auto_daily_gacha=1` on
   3 internal test users with active subscriptions. Flip
   `autoGacha.enabled=true` in a custom config. Watch logs for one
   nightly cycle. Expect 3 success rows.
3. **Day 2-7 — 10% cohort.** Pick 10% of active subscribers (by
   `user_id % 10 == 0`) and pre-set their `auto_daily_gacha=1`. Monitor
   failure rate and duration for one week.
4. **Day 8 — Full rollout.** Flip `autoGacha.enabled=true` globally.
   Monitor for 48h.
5. **Repeat 1-4 for `autoJankenFate.enabled` independently.**

## Rollback

- Flip the corresponding `enabled` flag to `false` via config change +
  worker restart. No code revert needed. Existing log rows preserved
  for audit.

## Out of scope follow-ups

- Arena auto-fate (only standard matches supported in v1).
- Push notification of auto-draw results (LINE Push API disabled per
  project policy; users see results via /auto-history LIFF or next
  manual interaction).
- `recharts`-powered history charts (deferred; list view shipped).
- Pre-fetching banners / shared draw-dispatch state for cron speedup
  (Phase 3 follow-up from architect review).
