# AutoGacha Mode Selection — Plan

Branch: `feat/auto-gacha-mode`

Extend the nightly auto-gacha cron so month/season-card subscribers can pick
_which_ draw mode the cron runs on their behalf, instead of always running the
free "normal" path.

## Current state (baseline)

- `user_auto_preference.auto_daily_gacha` is a boolean toggle only.
- `AutoGacha.drawForUser` calls `GachaService.runDailyDraw(userId)` with no
  opts → always produces the free _normal_ 10-pull.
- `runDailyDraw` already supports `{ pickup, ensure, europe }` opts (mutually
  exclusive). Each option costs godstones per 10-pull:
  - `pickup` → `gacha.pick_up_cost` (1500)
  - `ensure` → `gacha.ensure_cost`  (3000)
  - `europe` → `gacha.europe_cost`  (10000) _or_ `activeEuropeBanner.cost` when set
- `rate_up` banners are pool-level and stack freely with any mode.
- `europe` is **period-limited** — `controller/princess/gacha.js` blocks the
  command when `europeBanners.length === 0`; `GachaService` itself does not
  re-check, so the cron is responsible for this guard.

## Design decisions (already agreed)

| # | Question | Decision |
|---|---|---|
| 1 | Mode storage shape | Single `ENUM('normal','pickup','ensure','europe')` column, default `normal` |
| 2 | Behaviour when stone balance < full-day cost | Best-effort per 10-pull: run requested mode while affordable, fall back to `normal` for the remaining quota slots. Record `mode_breakdown` + `fallback_reason` in `reward_summary` |
| 3 | Expose `pickup` too? | Yes — rate_up banner stacks regardless; pickup cost is always active |
| 4 | Preference read timing | At cron execution time (23:50 local) — current behaviour, no change |
| 5 | Frontend UX | Show estimated daily cost per mode (cost × remaining quota). Non-blocking warning when projected cost > stone balance. Do **not** block the save |
| 6 | Stone check granularity | Re-read stone balance before each 10-pull (handles concurrent manual draws) |
| 7 | `europe` with no active banner | Downgrade whole day to `normal`, flag `fallback_reason: europe_unavailable` |

## Rollout: 3 PRs

### PR 1 — Schema + API (this doc's starting point)

Branch `feat/auto-gacha-mode`. Safe to deploy independently: cron still only
runs `normal` until PR 2 lands, so the new `auto_daily_gacha_mode` column is
read-but-inert.

- Migration `20260419110722_add_auto_daily_gacha_mode.js`:
  `user_auto_preference.auto_daily_gacha_mode ENUM('normal','pickup','ensure','europe') NOT NULL DEFAULT 'normal'`
- `UserAutoPreference.fillable` gains `auto_daily_gacha_mode`
- `AutoPreferenceController`:
  - `VALID_MODES` constant + validation in `setPreference` (400 on bad mode)
  - `loadPreference` returns `auto_daily_gacha_mode` (coerces invalid values to
    `normal`)
  - `loadGachaContext(userId)` adds `stone_balance`, `daily_quota`, per-mode
    `costs`, and `europe_banner_active` to `getPreference` / `setPreference`
    response — this is what the frontend needs to render the cost estimate
    without a second round trip
- Mode change requires **no** extra entitlement (the `auto_daily_gacha` toggle
  gate already covers subscription status)
- Tests: 14 new + existing cases in `__tests__/controller/AutoPreferenceController.test.js`

### PR 2 — Cron integration

Teach `app/bin/AutoGacha.js` to act on the mode.

- `loadTargets` SELECTs `uap.auto_daily_gacha_mode` into each row
- Before the per-user loop, batch-fetch active europe banner once (shared across
  the batch — avoids one banner query per user)
- `drawForUser` rewrite:
  ```
  mode = target.auto_daily_gacha_mode
  if mode == 'europe' && no active europe banner:
      fallback_reason = 'europe_unavailable'; mode = 'normal'

  breakdown = { normal:0, pickup:0, ensure:0, europe:0 }
  for i in 0..quota.remaining:
      stone = GachaModel.getUserGodStoneCount(userId)  # re-read: prior loop iteration may have spent
      cost = costForMode(mode)
      if cost == 0 || stone >= cost:
          runDailyDraw(userId, toOpts(mode));  breakdown[mode]++
      else:
          runDailyDraw(userId);  breakdown.normal++
          fallback_reason ||= 'insufficient_stone'
  ```
- Extend `reward_summary` JSON with `mode_requested`, `mode_breakdown`,
  `fallback_reason`
- Tests in `__tests__/bin/AutoGacha.test.js` cover:
  - each mode × sufficient stones
  - ensure × stones only cover 1 of 2 rounds → `{ensure:1, normal:1}` +
    `insufficient_stone`
  - europe × no active banner → all normal + `europe_unavailable`
  - mode field propagates through `loadTargets`

### PR 3 — Frontend AutoSettings UI

`frontend/src/pages/AutoSettings/index.jsx`:

- Under the "自動抽卡" toggle, render a `RadioGroup` of modes (disabled when
  toggle is off)
- For each mode row, render `每次 N 石 × 今日 K 次 = 預估 NK 石`
  (K = `gacha_context.daily_quota.total`, N = `gacha_context.costs[mode]`)
- When `gacha_context.europe_banner_active === false`, show europe option with
  a grey "歐派期間限定，目前無活動，將視為普通抽" tooltip (still selectable,
  cron handles fallback)
- When `estimate_for_selected_mode > gacha_context.stone_balance`, show an
  amber inline hint: `目前女神石不足以完成全天 K 次，執行時不足會自動降為普通抽`
  — non-blocking, no save-disable
- Stone balance + quota fetch once on page load; add a manual "重新整理" button
- History list rows show mode badge when `summary.reward_summary.mode_breakdown`
  is present; show red tooltip for `fallback_reason`

## Risks & notes

- **Cost drift**: costs come from `config.get('gacha.*')`. Frontend must pull
  them from `gacha_context` (not a hard-coded mirror). PR 1 already wires this.
- **Banner cost 0**: `activeEuropeBanner.cost === 0` is treated as "no override"
  and falls back to `config.gacha.europe_cost` — mirrors the existing
  `resolveCost` behaviour in `GachaService`.
- **Concurrent /抽 on cron night**: stone re-read per iteration handles this
  best-effort; if user burns stones between cron's quota computation and draw,
  worst case a slot falls back to `normal`. Documented, not blocking.
- **Quota reduction between loads**: `runDailyDraw` does not re-check quota
  internally — same risk exists today on the `normal` path, so not a
  regression.
