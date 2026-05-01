# Inventory Ledger UPDATE Hazard — Reward × N Leak

## The Insight
In this codebase, `Inventory` is a **multi-row append-only ledger**. Each (userId, itemId) pair has many rows; balance is computed as `SUM(itemAmount)` across them (see `GachaModel.getUserGodStoneCount`). This schema means **every `UPDATE Inventory … WHERE userId=? AND itemId=?` without a row-ID constraint silently multiplies the change by the user's row count** — `reward × N` instead of `reward × 1`. A user with 178 itemId=999 rows receiving a 30-stone achievement gets +5,340 instead of +30.

The principle: **if a table is an append-only ledger, all mutations must be INSERTs**. If you must UPDATE, the WHERE clause must pin a specific row (`WHERE ID = ?`). Treat `UPDATE Inventory` without a row-ID as a footgun on sight.

## Why This Matters
Bugs from this pattern are invisible in testing with fresh users (who have 0–1 rows, so `× N ≈ × 1`) and get worse the longer a user plays. They don't throw errors — they silently produce wrong balances that nobody notices until someone does the arithmetic. Real incident 2026-04-19: auto-gacha testing showed an observed balance change of −520 instead of the expected −5,830; trace pointed at `AchievementEngine.unlockAchievement` running `UPDATE Inventory SET itemAmount = itemAmount + 30 WHERE userId=? AND itemId=999` — gifting 30 × 178 = +5,340 extra stones on first ensure unlock.

## Recognition Pattern
- Any `mysql("Inventory").where({ userId, itemId }).update({ itemAmount: … })` — inspect the WHERE.
- Any `.update({ itemAmount: mysql.raw("itemAmount + ?", [x]) })` anywhere outside of a `WHERE ID = existing.ID` lookup.
- Reward-granting code paths that do a `SELECT ... .first()` to check existence, then UPDATE (the `.first()` is just existence-testing; it doesn't constrain the UPDATE).
- Observed balance deltas that don't match the log's `godStoneCost`, `reward`, or `itemAmount` fields.
- Features that "work" for new users but behave strangely for long-time players.

## The Approach
1. **Default to INSERT** for any currency credit/debit. GachaService already does this (`src/service/GachaService.js:183, 204` — debit and repeat-reward as separate ledger rows). Follow that pattern; don't reinvent.
2. **If you must UPDATE**, pin the row: use `existing.ID` from the pre-read, e.g. `.where({ ID: existing.ID }).update(…)`.
3. **Never trust `.first()` + `UPDATE` pairs** — the `.first()` usually exists to check "does any row exist?" but the subsequent UPDATE has wider reach than intended. If you find one, either convert to INSERT or fix the WHERE.
4. **Quota counters live in other tables**: `getRemainingDailyQuota` in `GachaService.js` counts `gacha_record` rows within the day, not `Inventory`. To bypass daily gacha quota for testing, delete today's `gacha_record` rows for the user (plus `gacha_record_detail` via FK cascade-delete); don't touch `auto_gacha_job_log` (it's just audit).
5. **Future refactor direction** (tracked in `memory/project_stone_ledger_refactor.md`): introduce `StoneLedgerService` with credit/debit/escrow/refund, enum `note`, and move reads to a cached balance row.

## Key Files
- `app/src/service/AchievementEngine.js:252-267` — the fixed reward credit path (single INSERT with `note="成就獎勵"`). Look here before changing reward code.
- `app/src/service/GachaService.js:182-210` — reference pattern for append-only ledger writes (cost debit + repeat reward as separate rows, both inside the same transaction).
- `app/src/model/princess/gacha/index.js` — `getUserGodStoneCount(userId)` is the authoritative balance reader; it uses `SUM(itemAmount) WHERE itemId=999`.
- `app/__tests__/service/AchievementEngine.test.js` — contains the regression test `credits reward_stones via a single INSERT row (never UPDATE across existing rows)`; keep it passing.

## Example
```javascript
// BAD (reward × N bug)
const existing = await mysql("Inventory").where({ userId, itemId: 999 }).first();
if (existing) {
  await mysql("Inventory")
    .where({ userId, itemId: 999 })          // ← no row-ID: updates every row
    .update({ itemAmount: mysql.raw("itemAmount + ?", [reward]) });
}

// GOOD (append a ledger row, consistent with GachaService)
await mysql("Inventory").insert({
  userId,
  itemId: 999,
  itemAmount: reward,
  note: "成就獎勵",
});
```
