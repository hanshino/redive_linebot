# Janken Season Reset + Daily Rank Rewards + ELO Rebalance

**Date:** 2026-05-01
**Status:** Draft — pending implementation
**Branch:** `feat/janken-season-rewards` (planned)

## Context

Janken (`/猜拳`、`/決鬥`、`/猜拳擂台`) currently has an ELO ladder with 5 tiers (見習者/挑戰者/強者/達人/傳說) and a streak/bounty subsystem. After several months of operation the live data shows three structural problems:

| Problem | Evidence (live snapshot, 2026-05-01) |
|---|---|
| **No tier progression** — only 1 strong-tier player exists, 0 達人/傳說 | `janken_rating` distribution: 80 beginner / 11 challenger / 1 fighter / 0 master / 0 legend |
| **Self-collusion exploits the ladder** | Top-1 player has 74 bet matches in 30d against only **2 unique opponents** (74W/82% win rate, 100 max streak). Several others show 1–2 unique opponents over double-digit bet matches. |
| **No reset mechanism** — exploited ELO is permanent | Schema has no `season_id` concept; `janken_rating` is single-row-per-user, lifetime. |

Activity floor is small: **11 DAU / 31 WAU / 51 MAU** (counting users who initiated or received a bet match in the window). Of 47,130 total matches, only 2,583 (5.5%) carry bets — non-bet matches do not move ELO.

The user (chat owner) wants to (a) reset the ladder, (b) add a daily 女神石 reward to incentivise climbing the new ladder, and (c) loosen the ELO formula so honest play actually progresses through tiers within a reasonable time window.

## Goals

- Introduce a manually-triggered season system that snapshots top-50 standings, hard-resets per-season fields on `janken_rating`, and preserves a small set of lifetime fields.
- Add a daily cron-driven women-stone reward keyed to today's active-player ranking + tier, with config-driven amounts and a kill switch.
- Rebalance ELO thresholds and K-factor table so honest play (avg bet ≈289) progresses through tiers in O(weeks) rather than O(years).
- Lift bet/bounty caps roughly 2× to support higher-tier high-stakes play.
- Specify (without implementing) Phase 2 anti-farming rules so the season-end and daily-reward switches can be flipped on later.
- Operate the season reset via a Node CLI script (not a LINE admin command) so it cannot be triggered by accident.

## Non-Goals

- LINE push messages. The system is reply-only. Daily rewards are deposited via `inventory.increaseGodStone()`; users see them on next `/猜拳段位` call (rank card adds a "今日獎勵" line) — no push.
- Rebuilding the `janken_records`/`janken_result` schema. Records are kept lifetime; only the rating row's per-season fields rotate.
- Touching the bot's ratelimit, postback, or auto-fate subsystems beyond what the new fields require.
- Frontend redesign of `/janken`. New API endpoints are added; the existing page is updated minimally to surface the season number and current-season standings.
- Anti-farming **enforcement** at launch. The first season-end runs with rewards disabled because exploits exist. Phase 2 adds enforcement; rewards switch on after.

## Design

### 1. Schema

Three new tables and column additions to `janken_rating`. Migration files will be created via `yarn knex migrate:make`.

#### 1.1 `janken_seasons`

| Column | Type | Notes |
|---|---|---|
| `id` | int unsigned PK auto-inc | Reads as the season number ("第 N 賽季"). |
| `started_at` | datetime | Set when the season opens. |
| `ended_at` | datetime nullable | NULL while active; set when closed. |
| `status` | enum(`active`,`closed`) | Exactly one row has `active` at any time (enforced by app logic, not DB constraint). |
| `notes` | text nullable | Free-form admin note ("v1 啟動", "修復自刷後重啟"). |
| `created_at`, `updated_at` | timestamps | Standard. |

The CLI script that opens season N+1 wraps the close/open transition in a single MySQL transaction.

#### 1.2 `janken_season_snapshot`

| Column | Type | Notes |
|---|---|---|
| `id` | int unsigned PK auto-inc | |
| `season_id` | int unsigned FK → `janken_seasons.id` | Indexed. |
| `rank` | smallint unsigned | 1-based, ordered by ELO desc at snapshot time. |
| `user_id` | varchar(33) | LINE user id. |
| `display_name` | varchar(255) nullable | Captured at snapshot via `user.display_name`; OK if NULL when not seen. |
| `elo` | int | |
| `rank_tier` | varchar(20) | |
| `win_count`, `lose_count`, `draw_count` | int | Per-season counters at snapshot. |
| `max_streak` | int | Carried for hall-of-fame display. |
| `created_at` | timestamp | |

Index: `(season_id, rank)`. Snapshot captures top 50 of each season (configurable; default 50). The frontend can later page across season snapshots.

#### 1.3 `janken_daily_reward_log`

| Column | Type | Notes |
|---|---|---|
| `id` | int unsigned PK auto-inc | |
| `user_id` | varchar(33) | |
| `reward_date` | date | The date the reward is for (cron run date in Asia/Taipei). |
| `season_id` | int unsigned | Snapshot of which season the reward came from. |
| `reward_type` | varchar(20) | `top1` / `top2` / `top3` / `top4_10` / `legend` / `master` / `fighter` / `challenger` / `beginner`. |
| `amount` | int | Women stones credited. |
| `created_at` | timestamp | |

Unique key: `(user_id, reward_date)`. Re-running the cron same day is a no-op (insert ignore). This table doubles as the source of truth for the rank-card "今日獎勵" line.

#### 1.4 `janken_rating` column additions

Migration adds three lifetime counters. Migration also resets nothing — existing data is preserved.

| Column | Type | Default | Purpose |
|---|---|---|---|
| `lifetime_win_count` | int | 0 | Sum of all per-season `win_count` rotations + current season's `win_count` after first reset. |
| `lifetime_lose_count` | int | 0 | Same. |
| `lifetime_draw_count` | int | 0 | Same. |

`max_streak` is preserved across seasons (not rotated). Other fields (`elo`, `rank_tier`, `win_count`, `lose_count`, `draw_count`, `streak`, `bounty`) are per-season and reset.

### 2. Season Reset Flow (Node CLI)

`app/bin/JankenSeasonEnd.js`, invoked as `node app/bin/JankenSeasonEnd.js [--note "..."] [--enable-rewards]`. Not registered in `crontab.config.js` and not invoked by the bot — only by ops.

Steps within a single MySQL transaction:

1. Resolve the active season row (`status='active'`, must be exactly one). Abort with non-zero exit if zero or more than one.
2. Snapshot top 50 rows from `janken_rating` (ordered by `elo` desc, ties broken by `win_count` desc) into `janken_season_snapshot` joined to `user.display_name` for display capture.
3. **(If `--enable-rewards` AND `enableSeasonEndRewards: true` in config)** call `JankenRewardService.payoutSeasonEnd(snapshot)` → credits via `inventory.increaseGodStone({ note: "janken_season_end_reward", ... })` and logs achievements. The first run will be invoked **without** `--enable-rewards`; this stub exists in code but is gated.
4. Update active season row → `status='closed'`, `ended_at=NOW()`.
5. Reset every `janken_rating` row:
   - `lifetime_win_count += win_count`, same for lose/draw
   - `elo = 1000`, `rank_tier = 'beginner'`
   - `win_count = lose_count = draw_count = 0`
   - `streak = 0`, `bounty = 0`
   - `max_streak` left untouched
6. Insert new `janken_seasons` row with `status='active'`, `started_at=NOW()`, optional note.
7. Commit. Print summary (season N closed, snapshot saved, M rows reset, season N+1 opened).

A subsequent rollback CLI (`node app/bin/JankenSeasonRollback.js`) is **not** in scope. If a reset goes wrong, ops restore from MySQL backup.

### 3. Daily Rank Reward Flow (cron)

`app/bin/JankenDailyRewards.js`, scheduled in `crontab.config.js` with `period: ["0","10","0","*","*","*"]` (00:10 Asia/Taipei daily — after the existing 00:05 trial-expiry check, before the rest of the day's traffic).

```text
1. reward_date := date_sub(NOW(), 1 day) in Asia/Taipei  // pay yesterday's standings
2. active := DISTINCT user_ids that initiated OR received a bet match
              with bet_amount > 0 AND created_at within reward_date (00:00–24:00 TPE)
3. If empty → log and exit.
4. ranked := JankenRating where user_id IN active ORDER BY elo DESC
5. For position p in [1..len(ranked)]:
     reward_type := bucketByPosition(p, rank_tier)
     amount := config.minigame.janken.daily_reward[reward_type]
     INSERT IGNORE INTO janken_daily_reward_log (user_id, reward_date, season_id, reward_type, amount)
     If insert affected 1 row AND amount > 0:
       inventory.increaseGodStone({ userId, amount, note: "janken_daily_rank_reward" })
6. Log totals: per-bucket counts and stone payout.
```

`bucketByPosition` (deterministic):

```js
function bucketByPosition(p, rank_tier) {
  if (p === 1) return "top1";
  if (p === 2) return "top2";
  if (p === 3) return "top3";
  if (p <= 10) return "top4_10";
  if (rank_tier === "legend")     return "legend";
  if (rank_tier === "master")     return "master";
  if (rank_tier === "fighter")    return "fighter";
  if (rank_tier === "challenger") return "challenger";
  return "beginner"; // amount=0 — log row still inserted to mark eligibility check
}
```

If `enableDailyRankReward: false` in config, the cron logs the candidates and computed buckets but skips both the INSERT and the stone credit. This lets us shadow-run before flipping the switch.

### 4. ELO Rebalance

#### 4.1 Tier thresholds

Updated values stored under `minigame.janken.elo.tiers` (new key — currently the array lives in code at `JankenRating.RANK_TIERS`). Code reads from config; the array becomes a fallback.

| Tier | Old `minElo` | New `minElo` |
|---|---|---|
| 見習者 (beginner) | 0 | 0 |
| 挑戰者 (challenger) | 1200 | **1100** |
| 強者 (fighter) | 1400 | **1250** |
| 達人 (master) | 1600 | **1400** |
| 傳說 (legend) | 1800 | **1550** |

Sub-tier formula (`getSubTier`) keeps the 5-step / 40-elo internal structure unchanged.

#### 4.2 K-factor table

| `minBet` | Old `k` | New `k` |
|---|---|---|
| 50000 | (n/a) | **80** *(new tier)* |
| 10000 | 40 | replaced by 5000:60 below |
| 5000 | (n/a) | **60** |
| 3000 | 24 | replaced by 1000:32 below |
| 1000 | (n/a) | **32** |
| 500 | 16 | replaced by 100:20 below |
| 100 | (n/a) | **20** |
| 0 | 8 | **12** |

Net effect: a 289-stone average bet now sits in K=20 (was K=8). Loss-factor 0.5 unchanged. Expected ELO/match in even matchups rises from +1 to +2.5; honest 1000→1250 path (fighter) drops from ~400 bet matches to ~100.

#### 4.3 Bet & bounty caps

| Tier | Old max bet | New max bet | Old max bounty | New max bounty |
|---|---|---|---|---|
| beginner | 20,000 | **50,000** | 10,000 | **20,000** |
| challenger | 50,000 | **100,000** | 25,000 | **50,000** |
| fighter | 100,000 | **200,000** | 50,000 | **100,000** |
| master | 200,000 | **500,000** | 80,000 | **200,000** |
| legend | 500,000 | **1,000,000** | 120,000 | **300,000** |

Stored in `minigame.janken.bet.maxAmountByRank` and `minigame.janken.streak.maxBountyByRank` — both already config-driven. No code change beyond editing `default.json`.

#### 4.4 Non-bet matches (Phase 2 toggle)

Currently `updateElo` returns 0 when `betAmount <= 0`. Phase 2 introduces `minigame.janken.elo.nonBetK` (default `0` = unchanged). When raised to e.g. `4`, `updateElo` runs the full ELO formula even on non-bet matches, with K=4. Default stays `0` until anti-farming Phase 2 ships, because non-bet matches are infinitely repeatable and would be the easiest farming surface.

### 5. Configuration Block

Final `default.json` shape under `minigame.janken`:

```jsonc
{
  "paper": "🖐️", "rock": "✊", "scissors": "✌️",

  "season": {
    "snapshotTopN": 50,
    "enableSeasonEndRewards": false,
    "endRewards": {
      "top1": 50000, "top2": 30000, "top3": 20000,
      "top4_10": 5000, "top11_50": 1000
    }
  },

  "daily_reward": {
    "enableDailyRankReward": false,
    "amounts": {
      "top1": 500, "top2": 300, "top3": 200,
      "top4_10": 50,
      "legend": 100, "master": 50, "fighter": 25,
      "challenger": 10, "beginner": 0
    }
  },

  "bet": {
    "minAmount": 10,
    "maxAmountByRank": {
      "beginner": 50000, "challenger": 100000, "fighter": 200000,
      "master": 500000, "legend": 1000000
    },
    "feeRate": 0.1
  },

  "streak": {
    "maxBountyByRank": {
      "beginner": 20000, "challenger": 50000, "fighter": 100000,
      "master": 200000, "legend": 300000
    },
    "bountyMinBet": 1000,
    "bountyClaimMultiplier": 5
  },

  "elo": {
    "initial": 1000,
    "tiers": [
      { "key": "beginner",   "name": "見習者", "minElo": 0    },
      { "key": "challenger", "name": "挑戰者", "minElo": 1100 },
      { "key": "fighter",    "name": "強者",   "minElo": 1250 },
      { "key": "master",     "name": "達人",   "minElo": 1400 },
      { "key": "legend",     "name": "傳說",   "minElo": 1550 }
    ],
    "kFactorTiers": [
      { "minBet": 50000, "k": 80 },
      { "minBet":  5000, "k": 60 },
      { "minBet":  1000, "k": 32 },
      { "minBet":   100, "k": 20 },
      { "minBet":     0, "k": 12 }
    ],
    "lossFactor": 0.5,
    "nonBetK": 0,
    "streakBonus": [
      { "minStreak": 7, "multiplier": 2.0 },
      { "minStreak": 5, "multiplier": 1.5 },
      { "minStreak": 3, "multiplier": 1.25 }
    ]
  },

  "images": { "...": "unchanged" }
}
```

### 6. Code Changes

**Models**

- `app/src/model/application/JankenSeason.js` — `getActive()`, `close(seasonId)`, `openNew(notes)`.
- `app/src/model/application/JankenSeasonSnapshot.js` — `bulkInsert(seasonId, rows)`, `getBySeason(seasonId)`.
- `app/src/model/application/JankenDailyRewardLog.js` — `tryInsert(...)`, `getByUserAndDate(userId, date)`.
- `app/src/model/application/JankenRating.js` —
  - Read tiers from config (fallback to existing constant).
  - New `getTopByElo(limit)` accepting transaction.
  - New `resetSeasonFields(trx)` updating every row to bump lifetime counters and zero per-season fields in one statement.

**Services**

- `app/src/service/JankenSeasonService.js` — orchestrates the CLI flow (steps 1–7 in §2). Pure logic, no Bottender import.
- `app/src/service/JankenRewardService.js` — `payoutDaily(rewardDate)` (cron) and `payoutSeasonEnd(snapshot)` (CLI). Both honor their respective config flags.

**Bin scripts**

- `app/bin/JankenSeasonEnd.js` — argv parsing (`--note`, `--enable-rewards`), invokes `JankenSeasonService.endCurrentAndOpenNext(...)`. Exits 0 on success, 1 on any failure.
- `app/bin/JankenDailyRewards.js` — registered in `app/config/crontab.config.js` with `period: ["0","10","0","*","*","*"]` (6-field [s m h dom mon dow], 00:10 daily, immediate=false).

**Controller / templates / API**

- `JankenController.queryRank`: extend rank-card payload with `seasonId`, `seasonStartedAt`, `lifetimeWLD`, and (if the user has a row in `janken_daily_reward_log` for today) `todayReward`.
- `templates/application/Janken.js#generateRankCard`: render the new lines (one extra row block, gated on data presence).
- `app/src/router/api.js` — three new routes:
  - `GET /api/janken/seasons` — list seasons (id, status, started_at, ended_at, notes).
  - `GET /api/janken/seasons/:id/top` — return `janken_season_snapshot` rows for that season.
  - `GET /api/janken/me/today-reward?userId=…` — driven from `janken_daily_reward_log`. (LIFF-authenticated by the existing `validation.js`.)
- Existing `/api/janken/rankings` adds `seasonId` to its response payload.

**Frontend**

- `frontend/src/pages/Janken/index.jsx`: add a small header chip "第 N 賽季 · 自 YYYY-MM-DD 開始".
- (Out of scope, optional v2) "歷代賽季" tab — list seasons and load snapshots on click.

### 7. Phase 2 — Anti-Farming (specified, not built)

The first season ends with `enableSeasonEndRewards=false` and `enableDailyRankReward=false` precisely because of the exploits found below. Phase 2 ships these enforcement rules in a follow-up PR; the spec captures the intent so the surface area is stable.

#### 7.1 Per-day, per-opponent ELO cap

Add `daily_elo_pairs` Redis hash, keyed `janken:elo_pair:<sortedUserPair>:<YYYYMMDD>`, with TTL 48h. Within `updateElo`:

```text
if redis.GET(`janken:elo_pair:${sortedUserPair}:${today}`) exists:
  K := 0   // repeat match against same opponent same day → no ELO movement
else:
  redis.SET(..., "1", EX=48h, NX=true)
  K := <as computed>
```

The settlement (women-stone payout, streak, bounty) still runs — ELO simply does not move on repeats.

#### 7.2 Daily ELO ceiling

`janken_rating` gains `daily_elo_gain` (int) and `daily_elo_gain_date` (date). On match:

```text
if daily_elo_gain_date != today:
  daily_elo_gain := 0; daily_elo_gain_date := today
delta := computed_delta
if delta > 0:
  remaining := 50 - daily_elo_gain
  delta := min(delta, max(0, remaining))
  daily_elo_gain += delta
elo := elo + delta
```

50 ELO per day cap is config-driven (`elo.dailyGainCap`).

#### 7.3 Diversity gate for daily reward eligibility

Replace "active = ≥1 bet match yesterday" with "active = ≥1 bet match yesterday AND ≥3 unique opponents over the trailing 7 days." The 7-day window prevents single-day farming dumps from qualifying for that day's reward. Threshold tunable.

#### 7.4 Suspect report

A weekly cron (`app/bin/JankenSuspectReport.js`) prints users with `unique_opponents/bet_matches < 0.2` over 30d; admins act manually. No automated punishment in this phase.

### 8. Economic Estimate

With current 11 DAU and the rebalanced thresholds, expected daily payout when rewards are flipped on:

```
top1 ........................500
top2 ........................300
top3 ........................200
top4..top10 (7 ppl) ..7×50 = 350
remaining (~1 person, mostly challenger) ............. ~10
                                  ─────
                  per day total ≈ 1,360
                  per month     ≈ 40,800
```

For comparison: the lifetime women-stone flow through bet matches is ~746K (2,583 bets × 289 avg). The daily reward injects ≈ 41K/month new mint into the economy — meaningful but not order-of-magnitude inflationary. If DAU climbs to 30, daily payout climbs to ~1,650; at 100 DAU, ~2,800. Numbers stay in O(1k–3k)/day across plausible growth.

If the user wants to dial this up later, all knobs are in `default.json#minigame.janken.daily_reward.amounts`. The spec recommends revisiting the dial after 2 full seasons of telemetry.

### 9. Testing

- **Unit tests** (Jest, alongside services) for: ELO change with new K table, tier resolution from new thresholds, `bucketByPosition`, `JankenSeasonService.endCurrentAndOpenNext` happy + failure paths, daily reward dedup via unique key.
- **Integration tests** (real MySQL via Knex) for: snapshot insertion, full reset transaction (rollback on partial failure), cron idempotency across two runs same day.
- **Manual QA** before flipping the switch:
  - Run `JankenSeasonEnd.js --note "dry-run"` against a staging DB clone, verify snapshot row count, lifetime fields advance, all per-season fields zeroed.
  - Run `JankenDailyRewards.js` cron with `enableDailyRankReward: false` for one day, eyeball the log, then flip on.

### 10. Rollout Order

1. Migrations: add tables and `lifetime_*` columns. `lifetime_*` default to 0 — **do not backfill from current per-season counts**; the first season-end reset's `lifetime_* += win_count/lose_count/draw_count` step naturally captures pre-v2 totals into lifetime, so backfilling would double-count. Insert season `id=1` row with `started_at = MIN(janken_records.created_at)` and `status='active'`.
2. Code: models, services, bin scripts, API routes, frontend chip.
3. Update `default.json` with the new tier thresholds, K table, and bet/bounty caps. Daily-reward and season-end-reward flags stay `false`.
4. Deploy bot + worker. Daily cron starts shadow-running (logs only, no payouts).
5. Run `node app/bin/JankenSeasonEnd.js --note "v1 啟動 — 修補刷分前重啟"` (no `--enable-rewards`). Season 1 closes, snapshot saved; season 2 opens with all ELO at 1000.
6. Phase 2 PR: ship anti-farming (§7), then flip `enableDailyRankReward: true`. Subsequent season-end reset can include `--enable-rewards`.

## Risks

- **Snapshot/reset transaction size.** ~92 rating rows is trivial; even at 10× growth it's a single statement. Low risk.
- **Cron run during reset.** If the season-end CLI runs at 00:09 and the daily cron at 00:10, both could be modifying state simultaneously. Mitigation: the season CLI prints a banner reminding ops to disable the worker for 1 minute. The daily cron also reads `JankenSeason.getActive()` and gracefully exits if it sees inconsistent state (no active season, or active season started < 1 minute ago).
- **`active_users` definition mismatch.** The spec defines "active" via `bet_amount > 0`. If at some point we want non-bet activity to count, `JankenDailyRewards` query needs revising — call out in code comment.
- **Lifetime backfill.** Migration 9.1 backfills lifetime fields from current per-season counts. If someone disputes, source of truth is `janken_records` (replayable). Document this in the migration's `up`.
- **First reset wipes the only fighter.** Intentional — the lone fighter is the confirmed self-collusion case. The reset is the cleanup.

## Open Questions

None at spec time. All user-facing decisions resolved during brainstorming on 2026-05-01:

- Cadence: **manual** (CLI).
- Reset scope: hard-reset per-season fields, preserve `max_streak`, add `lifetime_*` counters.
- Snapshot: top 50, kept indefinitely.
- Season-end reward: pyramid; **off** for first reset, opt-in via CLI flag thereafter.
- Daily reward: top-N + tier pyramid, gated on yesterday's bet activity, **off** until Phase 2 anti-farming is on.
- Anti-farming: specified here, implemented in Phase 2.
- ELO rebalance: tier thresholds compressed, K-table boosted, bet/bounty caps doubled.
- Admin surface: Node CLI only, no LINE command, no admin frontend button.
