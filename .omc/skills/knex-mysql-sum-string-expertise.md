# Knex MySQL SUM() Returns Strings

## The Insight
MySQL's aggregate functions (`SUM`, `COUNT`, `AVG`) return values as **strings** through the Knex/mysql2 driver in Node.js. When these values are used in JavaScript arithmetic via `reduce()` or direct operators, string concatenation silently replaces addition — producing astronomically wrong numbers with zero errors.

## Why This Matters
Symptom: calculated values are absurdly large (e.g., odds showing `9901090148515.84x` instead of `1.70x`). The code looks correct — `reduce((sum, r) => sum + r.total, 0)` — but `0 + "17010"` yields `"017010"` (string), then `"017010" + "5000"` yields `"0170105000"`. Division then produces nonsense.

## Recognition Pattern
- Arithmetic results from DB aggregates are impossibly large or clearly wrong
- `reduce()` accumulating values from Knex `.sum()` queries
- Any code doing math with Knex aggregate results (`sum`, `count`, `avg`)
- Files: `app/src/service/RaceService.js`, `app/src/model/application/RaceBet.js`

## The Approach
**Always wrap Knex aggregate results with `Number()` before arithmetic.** Don't trust `||` fallback alone — `"0" || 0` returns `"0"` (truthy string).

Audit pattern: search for `.sum(` in models, then trace where the result is used in calculations. Every `.reduce()`, multiplication, division, or comparison needs `Number()` wrapping.

## Example
```js
// BAD — string concatenation
const total = rows.reduce((sum, r) => sum + (r.total || 0), 0);

// GOOD — explicit Number conversion
const total = rows.reduce((sum, r) => sum + Number(r.total || 0), 0);
```

## Triggers
- "odds are wrong", "astronomical number", "huge payout"
- `reduce` + `sum` + knex
- SUM returns string, aggregate string concatenation
