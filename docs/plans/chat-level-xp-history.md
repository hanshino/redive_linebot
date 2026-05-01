# Chat Level — XP Gain History

**Status:** Design / Spec
**Branch:** `feat/chat-level-prestige`
**Date:** 2026-05-01
**Series:** chat-level-prestige (extension)

## 1. Problem

Players cannot see why a given chat message awarded the XP it did. The pipeline already applies six independent multipliers (cooldown, group bonus, blessing 1, honeymoon, diminish tier, trial × permanent) but the result is opaque — `/me` shows current level and a daily raw counter, nothing else. When a player hits 200 raw daily and effective slows to a crawl, or a trial multiplier kicks in, they have no way to learn what is happening.

## 2. Goals

- Show the player a **per-message breakdown** of how raw XP became effective XP, with each multiplier visible.
- Show **daily trends** so players can read their own pacing across a prestige cycle.
- Make the breakdown faithful: numbers shown match what the pipeline actually applied at write time, not a recomputation that may drift if formulas change.
- Bound storage growth: per-event rows already retained 30 days (existing `ChatExpEventsPrune` job); long-term history rides on the existing daily aggregate.

## 3. Non-goals

- No comparison / leaderboard against other players. Self-view only in v1.
- No prediction ("if you got blessing X, you'd earn Y more") — out of scope.
- No analytics dashboard for admins; this is a player-facing surface.
- No real-time push when XP is gained; player pulls when they want to look.

## 4. Existing data path

```
Bottender msg event
  → recordLatestGroupUser (middleware)
  → Redis batch buffer
  → cron: bin/ChatExpUpdate.js (every minute)
  → service/chatXp/pipeline.js#processBatch
       perMsgXp → applyDiminish → applyTrialAndPermanent
       → INSERT INTO chat_exp_events (1 row per msg)
       → upsert chat_exp_daily (per user × date)
       → update chat_user_data (level / exp / trial progress)
  → 03:00 daily: bin/ChatExpEventsPrune.js → DELETE WHERE ts < NOW() - 30 DAY
```

Already-recorded fields on `chat_exp_events`:
`user_id, group_id, ts, raw_exp, effective_exp, cooldown_rate, group_bonus, modifiers (JSON)`.

The `modifiers` JSON currently carries **flags**, not numeric multipliers:
```json
{
  "honeymoon": true,
  "active_trial_id": 3,
  "active_trial_star": 5,
  "blessings": [1, 4],
  "permanent_xp_multiplier": 0.05
}
```

`chat_exp_daily` already aggregates `raw_exp / effective_exp / msg_count / honeymoon_active / trial_id` per user per day. Indices `(user_id, date)` exist.

## 5. Surfaces

### 5.1 Flex bubble — `#經驗歷程`

Three sections, no per-message list (LIFF handles that):

1. **Today summary** — raw → effective totals, message count, current daily-cap progress bar (re-uses tier1/tier2 caps from `resolveDiminishTiers`, same logic as `/me`).
2. **Last event** — single line: `HH:mm · 群組名 · raw N → eff M`, plus tag chips for any active modifiers (`蜜月` / `★3 試煉` / `祝福·暖流` / `已遞減`).
3. **CTA** — primary button to LIFF `/xp-history`, secondary text link to `/prestige`.

`/me` profile bubble adds one CTA button "查看經驗歷程" → opens LIFF (single addition; layout untouched). This handles users who don't know the text command.

### 5.2 LIFF page — `/xp-history`

New top-level route, peer of `/prestige`. Two tabs:

#### Tab 1 — 逐筆 (default)
- Default time range: today + yesterday (≤2 days). Date picker can scroll back 7 days; rows older than 30 days are gone (retention).
- Rows are auto-folded client-side by `(floor(ts to minute), group_id, modifier_hash)`, where `modifier_hash` is a stable hash of the multiplier set actually applied. Folded rows show `time · group · count · raw_total → eff_total · chips`. Click expands to per-message rows.
- Each row in expanded view shows the full multiplier chain:
  ```
  base 5.000 × cooldown 1.00 × group ×1.10 × blessing·激流 ×1.08
       → raw 5
       × honeymoon ×1.20
       × diminish 0.30  (tier 2: 480/1000)
       × trial    ×0.50  (★5)
       × permanent ×1.05
       → effective 1
  ```
- Values come straight from the row, not recomputed. Diminish tier label (tier 1/2/3) is derived from `diminish_factor` (1.0 → tier1, 0.3 → tier2, 0.03 → tier3) and rendered client-side. The `blessing·xxx` row collapses into the line label when `blessing1_mult === 1.000`.

#### Tab 2 — 每日趨勢
- Stacked bar per day: lower stack `effective_exp`, upper stack `raw_exp - effective_exp` (loss to diminish/trial). Hover/tap shows numeric tooltip.
- Each bar carries a small badge cluster underneath: `🌱 蜜月` if `honeymoon_active`, `⚔ ★N` if `trial_id` present that day.
- Default range: 30 days. Range picker: 7 / 30 / 90 / since-prestige (uses `chat_user_data.prestige_count` change date — out of scope to thread through, just expose 7/30/90/365).

### 5.3 Privacy

Self-view only. API enforces `req.userId === query.userId`. No leaderboard. No public link.

## 6. Schema changes

Add six `decimal(4,3)` columns to `chat_exp_events` (nullable, default null) so existing rows stay valid:

| column            | range examples           | source                                                   |
|-------------------|--------------------------|----------------------------------------------------------|
| `base_xp`         | 5.000 (config snapshot)  | `getBaseXp()` at batch time                              |
| `blessing1_mult`  | 1.000 / 1.080            | `1 + 0.08` if blessings includes id 1                    |
| `honeymoon_mult`  | 1.000 / 1.200            | `1.2` if `prestige_count === 0`                          |
| `diminish_factor` | 1.000 / 0.300 / 0.030    | from refactored `applyDiminish`                          |
| `trial_mult`      | 0.500 / 0.700 / 1.000    | from refactored `applyTrialAndPermanent`                 |
| `permanent_mult`  | 1.000 / 1.050            | `1 + permanent_xp_multiplier`                            |

Identity: `raw_exp ≈ round(base_xp × cooldown_rate × group_bonus × blessing1_mult)`
and `effective_exp ≈ round(raw_exp × honeymoon_mult × diminish_factor × trial_mult × permanent_mult)`.
Round-off lives at `raw_exp` and `effective_exp` (already smallint), so chain display rounds visually but never disagrees with the persisted result.

Storage cost: 6 × ~5 bytes ≈ 30 bytes/row. At 200 msgs/day × 30 days × 1k DAU ≈ 6M rows × 30 bytes ≈ 180 MB upper bound for the new columns; well within budget.

The existing `modifiers` JSON column is **kept** (don't drop) — it still carries `active_trial_id`, `active_trial_star`, `blessings[]` which the new columns don't replace. The boolean / id payload feeds the chips on bubble + LIFF.

`raw_exp` and `effective_exp` stay `smallint unsigned`. Migration sets the new columns nullable with no backfill (rows older than the deploy stay legible as a degraded view — display falls back to `tag chips only` when numeric columns are null).

Migration name: `add_xp_breakdown_columns_to_chat_exp_events`.

## 7. Pipeline changes

`service/chatXp/diminishTier.js` — current signature returns `result` (post-diminish absolute value). Refactor to return `{ result, factor }` where `factor = result / incoming` (or `0` when `incoming === 0`). Pipeline persists `factor`.

`service/chatXp/trialAndPermanent.js` — current signature returns `effective * trialMult * (1 + permanent)`. Refactor to return `{ result, trialMult, permanentMult }` where `permanentMult = 1 + permanent`. Pipeline persists both.

`service/chatXp/perMsgXp.js` — refactor to return `{ raw, blessing1Mult }` (or accept an out-param object) so the pipeline can persist `blessing1_mult` alongside the other multipliers. The numeric value is `1 + 0.08` when blessing id 1 is owned, else `1.0`. Calling code that only wants the int continues to use `raw`.

`pipeline.js#processUserEvents` — extend the `eventRecords.push(...)` payload with the six new numeric fields. No other call-site change.

Tests:
- Existing pipeline tests must keep passing.
- New unit tests for the refactored `applyDiminish`, `applyTrialAndPermanent`, and `computePerMsgXp` covering the new return shapes (`{ result, factor }` / `{ result, trialMult, permanentMult }` / `{ raw, blessing1Mult }`).
- New pipeline integration test asserting that a single event row carries `base_xp / blessing1_mult / honeymoon_mult / diminish_factor / trial_mult / permanent_mult` and that `raw_exp ≈ round(base_xp × cooldown_rate × group_bonus × blessing1_mult)` and `effective_exp ≈ round(raw × honeymoon × diminish × trial × permanent)` (within rounding).

## 8. APIs

All under existing `/api` prefix, reusing the LIFF auth middleware (`validation.js` token). All require `userId` to match the authenticated user.

### `GET /api/me/xp-events`
Query: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (max 7-day window; default = today)
Response: `{ events: [{ id, ts, group_id, base_xp, cooldown_rate, group_bonus, honeymoon_mult, diminish_factor, trial_mult, permanent_mult, raw_exp, effective_exp, modifiers }] }`
Order: `ts DESC`, capped at 1000 rows per request. Pagination via `before` cursor (`ts`+`id`).

### `GET /api/me/xp-daily`
Query: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (max 365 days)
Response: `{ days: [{ date, raw_exp, effective_exp, msg_count, honeymoon_active, trial_id }] }`
Reads `chat_exp_daily` only. Cheap.

### `GET /api/me/xp-summary`
For the Flex bubble. Returns: `{ today: { raw, effective, msg_count, cap_progress, tier1_upper, tier2_upper }, last_event: { ts, group_id, raw, effective, chips: [...] } | null }`. Single round-trip so the bubble builds in one query phase.

Group display name resolution stays in front-end / template layer (controller already calls `LineClient.getGroupSummary`-style lookups elsewhere). API returns raw `group_id`.

## 9. Front-end

New page `frontend/src/pages/XpHistory/`:
- `index.jsx` — page shell with two MUI Tabs (`逐筆` / `每日趨勢`), date range picker per tab, follows the modern card layout pattern (see `Pages: Bag / Trade Manage / Battle Signin`).
- `EventList.jsx` — fetches `/api/me/xp-events`, performs client-side fold by `(minute, group, modifier_hash)`, renders collapsed/expanded rows.
- `BreakdownRow.jsx` — single-event detailed multiplier chain.
- `DailyTrend.jsx` — fetches `/api/me/xp-daily`, renders `recharts` `BarChart` with stacked `effective` + `loss` bars and badge cluster row.
- Auth flow re-uses `liff.init()` + existing utility (same as `Prestige` page).

Routing: add `/xp-history` to `App.jsx`; LIFF endpoint update is a config-only change in `make tunnel` (LIFF config holds a single endpoint base, sub-paths are routed by react-router).

Minimum desktop responsive layout (this branch's pages already follow this discipline — see `9c18a7b fix(prestige): LIFF UX polish`). 360px – 1280px supported.

## 10. Bot-side controllers / templates

- `app/src/controller/application/ChatLevelController.js`
  - Add `exports.showXpHistory(context)` for `#經驗歷程`. Calls `xpSummary` model helper, renders Flex.
  - Modify `showStatus` to embed the new CTA button in the existing `/me` bubble (template-level addition only).
- `app/src/templates/application/Me/Profile.js` — add CTA button slot.
- `app/src/templates/application/XpHistory/Bubble.js` — new template.
- `app/src/model/application/ChatExpEvent.js` — add `findRecentByUserId(userId, limit)` and `findInRange(userId, from, to)` helpers; today's-aggregate lookup goes through existing `ChatExpDaily`.
- `app/src/router/api.js` — wire the three new GETs.
- `app/src/app.js#OrderBased` — register the new `#經驗歷程` matcher.

## 11. Out-of-scope / explicit deferrals

- Group leaderboard / "compare with friend" (a2 / a3 from brainstorming).
- Predictive blessing impact ("if you had blessing X you'd get +Y").
- Per-message comparison vs. group average.
- "Since-prestige" timeline marker (only fixed 7/30/90/365 ranges in v1).
- Admin analytics dashboard.

## 12. Risks & mitigations

| risk                                                     | mitigation                                                                            |
|----------------------------------------------------------|---------------------------------------------------------------------------------------|
| Pipeline refactor breaks live XP write                   | Keep `applyDiminish` / `applyTrialAndPermanent` external behavior identical; unit tests assert old `result` value matches; new fields only consumed if present. |
| Old rows (pre-deploy) lack new numeric columns           | UI degrades gracefully: when any of the six new columns is null, hide the multiplier chain on that row, show only the chip-based summary. |
| Players spamming `#經驗歷程` to hit DB                   | Re-use the existing `rateLimit` middleware in `app.js` chain (already gates other commands).                                  |
| `chat_exp_events` index pressure from new range API      | Existing `idx_user_ts (user_id, ts)` covers the dominant access pattern. No new index needed for v1; revisit if queries slow down. |
| LIFF endpoint update missed during deploy                | LIFF endpoint base is unchanged; sub-route added via SPA. Only deploy concern is the new migration — same flow as the chat-level-prestige series. |

## 13. Acceptance criteria

- [ ] Migration adds the six columns; existing rows readable; `yarn lint` + `yarn test` clean in `app/`.
- [ ] Pipeline writes the six new numeric values; integration test passes.
- [ ] `#經驗歷程` returns the Flex bubble; `/me` shows the new CTA button.
- [ ] LIFF `/xp-history` renders both tabs against live data; ranges 7/30/90/365 work; auto-fold collapses correctly when ≥2 same-modifier events fall in the same `(minute, group)`.
- [ ] Privacy: an authenticated user cannot fetch another user's events / daily / summary (returns 403).
- [ ] Old rows missing numeric columns render in degraded mode without throwing.
- [ ] No regression in existing `/me` bubble (snapshot tests pass).
- [ ] Production deploy needs only the new migration; no seed required.

## 14. Implementation notes

- **Group display name resolution.** v1 does not cache group display names — front-end shows the last 4 chars of `group_id` as fallback ("…ab12") if name resolution fails. If the table grows churny we add a Redis cache later (1h TTL); not in scope for v1.
- **`modifier_hash` exact definition** for client-side fold key:
  `JSON.stringify({ honeymoon: !!m.honeymoon, trial: m.active_trial_star ?? 0, blessings: [...m.blessings].sort((a,b)=>a-b), perm: Number(m.permanent_xp_multiplier ?? 0).toFixed(2), tier: diminishFactor === 1.0 ? 1 : diminishFactor === 0.3 ? 2 : 3 })`. Tier is included so a minute that crosses a diminish boundary stays visibly split — preserves the educational value of the breakdown.
