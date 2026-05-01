---
name: controller-to-cron-multiplicity-expertise
description: When replacing a user-initiated action with an automated/cron path, enumerate the implicit "called N times by the user" multiplicity — otherwise cron silently ships the feature at 1/N of the intended volume.
triggers:
  - auto-action cron
  - service extracted from controller
  - runDailyDraw
  - runDaily*
  - cron invokes service once
  - subscriber auto
  - daily quota cron
  - AutoGacha
  - gacha_times
  - detectCanDaily
  - feature parity with manual command
---

# Controller-to-Cron Multiplicity

## The Insight

User-initiated flows have **implicit call-site multiplicity** that does not live in the extracted service. A controller function called `gacha()` that does one 10-連 pull is *actually* part of a daily-quota loop — the loop body is in the user's hands (they type `/抽` N times, guarded by `detectCanDaily`). When you extract a service from this controller and then wrap it in a cron that iterates targets, the cron *replaces the user as the loop driver* — but it only knows about one iteration of the inner body. If you don't explicitly ask "how many times per day does the user invoke this manually?", you ship 1/N of the intended behaviour.

This is the opposite of the classical N+1 query bug. It's an **N-1 semantics bug**: the loop existed in the UI/user behaviour layer, and nobody on the extraction path thought to lift it into the cron.

## Why This Matters

`GachaService.runDailyDraw` was extracted from `app/src/controller/princess/gacha.js::gacha()`. The controller's invariant was:

- Per-invocation: one 10-連 pull.
- Per-day per user: **base quota (1) + `gacha_times` effect from each active `subscribe_card`**. For a 月卡 holder that is 2; for 季卡 that is 3. The user enforces the upper bound by typing `/抽` until `detectCanDaily` returns `false`.

`AutoGacha.drawForUser` called `runDailyDraw` exactly once per target. Because the `auto_daily_gacha` effect is only seeded on 月卡/季卡, **every cron target is a subscriber** who was entitled to 2–3 pulls/day via the manual path. Cron silently shipped 1 pull and dropped the rest. The bug was invisible in unit tests (which mocked `runDailyDraw` and never asserted call count against quota), invisible in the RALPLAN-DR plan (AC-9 said "invokes runDailyDraw **for each** user" — "each user", not "each quota slot"), and only surfaced when the user asked "應該是執行下去要一次抽滿我的每日次數吧?"

The function name `runDailyDraw` actively misled review: it *sounds* like "execute the full daily draw", but it is really "execute one pull".

## Recognition Pattern

You are at risk of this bug when all three are true:

1. You are extracting a service method from a controller handler that represents a **user-initiated action** (a slash command, a button click, a form submit).
2. You are wiring a **new non-user driver** (cron, scheduled worker, webhook replay, backfill script) that iterates over a list of users/entities and calls the service once per entity.
3. The manual path has a **per-user / per-day / per-entity quota** that is *enforced by the caller looping* rather than by the service itself.

Other signals to watch for:

- A `detectCanDaily` / `canInvoke` / `isEligible` guard that returns a boolean after checking a count against a configured limit + per-user bonus.
- Config keys of the form `X.daily_limit` paired with an `X_times` effect on subscription cards.
- A service method whose name uses "daily" / "weekly" / "session" but takes only `userId` — the cadence noun is the call-site's property, not the service's.
- `gacha_record`, `event_center_log`, `signin_days`, or similar "one row per invocation" audit tables — their row counts *are* the quota ledger.

## The Approach

Before shipping the automation:

1. **List every call site of the to-be-extracted controller handler in git history.** Include the manual user path (webhook) AND any retry/replay/admin routes. Ask "how many times, in one natural user session, does this get invoked?"
2. **Find the per-invocation guard.** For `/抽` it is `detectCanDaily`. Read it line-by-line and write down the formula: `allowed = base_limit + Σ(subscription_bonus)`. That formula is the **quota contract**; it belongs to the feature, not to the controller.
3. **Promote the quota to the service.** Add a sibling helper (here: `GachaService.getRemainingDailyQuota(userId) → {total, used, remaining}`) so every caller — manual controller, cron, future admin "force-draw" endpoint — resolves quota from the same code path. Do *not* re-implement the math in the cron; do *not* trust `gacha_record` existence as a boolean "already drawn" check, because that short-circuits partial state (user drew 1/2, cron should still finish the other 1).
4. **Have cron drive the loop the user used to drive.** `for (let i = 0; i < quota.remaining; i++) await service()`. Aggregate the per-iteration results into a single audit row; do not upsert N rows keyed on `(user_id, run_date)`.
5. **Rename if the name misleads.** `runDailyDraw` → `runSingleDraw` / `performOnePull`. If the intent was "do the whole day in one call", build a separate `runFullDailyQuota(userId)` that internally loops and handles errors — but be deliberate about which of the two you are shipping.
6. **Add a test whose assertion is call count as a function of quota.** Not "mock runDailyDraw resolves → assert log row is success". The test that would have caught this: `getRemainingDailyQuota mocked to {remaining: 2}` → `expect(runDailyDraw).toHaveBeenCalledTimes(2)`.
7. **Add a "feature semantics" lane to code review.** Beyond reuse/quality/efficiency reviewers, add one explicit question: *"Is the automated path behaviourally identical to the manual path for a user who fully exercises it?"* None of the three agents I ran asked this — they all accepted the function-level contract and checked it in isolation.

## Example

The fix committed as `5975302`:

```js
// app/src/service/GachaService.js — new helper mirrors detectCanDaily
async function getRemainingDailyQuota(userId) {
  const base = config.get("gacha.daily_limit");           // 1
  const subs = await SubscribeUser.all({ ... }).join(...);
  const activeSubs = subs.filter(s => /* start<=now<end */);
  const bonus = activeSubs.reduce((acc, sub) => {
    const effects = parseEffects(sub.effects);
    const eff = effects.find(e => e?.type === "gacha_times");
    return acc + (eff?.value || 0);
  }, 0);
  const total = base + bonus;                             // 1 / 2 / 3
  const used = await countTodayGachaRecord(userId);
  return { total, used, remaining: Math.max(0, total - used) };
}

// app/bin/AutoGacha.js — cron drives the loop, aggregates audit
const quota = await GachaService.getRemainingDailyQuota(userId);
if (quota.remaining === 0) return skip("already_pulled");
const aggregated = emptyAggregate();
for (let i = 0; i < quota.remaining; i++) {
  accumulate(aggregated, await GachaService.runDailyDraw(userId));
}
return upsertLog(userId, runDate, {
  status: "success",
  pulls_made: aggregated.rewards.length,                  // 10 / 20 / 30
  reward_summary: { ...aggregated, rounds: quota.remaining, quota_total: quota.total },
});
```

The principle, distilled: **when you lift a user-driven loop into a scheduler, the scheduler inherits the responsibility to run the loop, not just the body.**
