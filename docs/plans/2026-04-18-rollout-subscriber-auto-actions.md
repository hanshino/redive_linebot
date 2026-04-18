# Subscriber Auto-Actions — Rollout Plan

Phases 1-7 landed on branch `feat/subscriber-auto-actions`. This doc records
the rollout after merge.

## Gating model

Auto-actions are gated by a single layer: **per-user opt-in**
(`user_auto_preference.auto_daily_gacha` / `auto_janken_fate` /
`auto_janken_fate_with_bet`, all default `0`). Users must open the LIFF
`/auto/settings` page and turn the toggle on themselves. The global feature
flags from earlier drafts were removed — with opt-in default OFF there was
no meaningful second gate.

## Config (config/default.json)

| Key | Default | Notes |
|---|---|---|
| `autoGacha.concurrency` | `8` | Keep ≤ knex `pool.max - 2`. |
| `autoGacha.schedule` | `["0","50","23","*","*","*"]` | 23:50 local. Adjust only if cron collision observed. |

## Seed data prerequisite

After `yarn migrate` on prod DB, verify the seed migration ran:
```sql
SELECT `key`, JSON_EXTRACT(effects, '$[*].type')
FROM subscribe_card WHERE `key` IN ('month','season');
-- expect auto_daily_gacha + auto_janken_fate in both cards
```

## Observability

Structured log lines (via `DefaultLogger.info` → worker logs):

- `cron.auto_gacha.start target_count=N`
- `cron.auto_gacha.complete duration_ms=X target_count=N success=S failed=F skipped=K`
- `[AutoGacha] draw failed for <userId>: <error>`
- `janken.auto_fate.submit match_id=<id> user_id=<id> role=p1|p2 choice=rock|paper|scissors`

Alert thresholds (suggested):
- `failed / target_count > 0.05` for 1 consecutive run
- `duration_ms > 300000` (5 min hard cap from AC-17)

## Go-live steps

1. **Deploy.** Merge PR, run `yarn migrate` on prod, restart bot + worker.
2. **Verify cron registered.** Worker logs should show the `AutoGacha` entry
   loaded. First live tick fires at the next 23:50.
3. **Internal canaries.** Ops manually flips `auto_daily_gacha=1` on 2-3
   internal test accounts that hold an active subscription. Wait for the
   next nightly cycle; confirm `auto_gacha_job_log` rows land with
   `status='success'` and the LIFF history page renders them.
4. **Announce.** Once canaries look healthy for at least one full day,
   announce the feature (LINE broadcast / release notes / Bahamut thread).
   Organic rollout happens user-by-user as subscribers visit
   `/自動設定`.

## Rollback

There is no single-config kill switch. If a serious bug surfaces:

- **Immediate (code revert).** Revert the feature branch commit on `main`,
  redeploy bot + worker. Cron entry disappears; janken hook becomes no-op.
- **Partial (disable cron only).** Comment out the `AutoGacha` line in
  `app/config/crontab.config.js`, redeploy worker. Janken hook still runs
  for opted-in users.
- **Per-user.** `UPDATE user_auto_preference SET auto_daily_gacha=0,
  auto_janken_fate=0 WHERE user_id IN (...)` for the affected cohort. Log
  rows preserved for audit.

## Out of scope follow-ups

- Arena auto-fate (only standard matches supported in v1).
- Push notification of auto-draw results (LINE Push API disabled per
  project policy; users see results via `/auto/history` LIFF or next
  manual interaction).
- `recharts`-powered history charts (deferred; list view shipped).
- Pre-fetching banners / shared draw-dispatch state for cron speedup
  (Phase 3 follow-up from architect review).
