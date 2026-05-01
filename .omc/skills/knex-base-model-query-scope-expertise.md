# Knex Base Model: .knex vs .connection Query Scope

## The Insight
In this codebase's base model (`app/src/model/base.js`), the `.knex` getter returns a **table-scoped query builder** (`mysql(this.table)`), not the raw Knex client. This means `.raw()`, `.schema`, and other Knex-level methods are NOT available on `model.knex`. The raw Knex client is exposed as `.connection`.

## Why This Matters
Using `model.knex.raw(...)` throws `TypeError: model.knex.raw is not a function` at runtime. This is subtle because `.knex` looks like it should be the Knex instance, and the error only surfaces when the code path is hit (e.g., a finished race with bets).

## Recognition Pattern
- You're writing a query that needs `knex.raw()` for expressions like `COUNT(*)`, `SUM(CASE WHEN ...)`, `COUNT(DISTINCT ...)`
- You're calling `.raw()` on a model instance's `.knex` property
- You see `TypeError: *.knex.raw is not a function`

## The Approach
When you need raw SQL expressions in queries built from model instances:

| Need | Use | Returns |
|------|-----|---------|
| Table-scoped queries (WHERE, SELECT, JOIN) | `model.knex` | Query builder for `model.table` |
| Raw SQL expressions, schema ops, raw knex | `model.connection` | Raw Knex client |

So the pattern for aggregate queries with raw expressions is:
```js
model.knex
  .where("race_id", raceId)
  .select(
    model.connection.raw("COUNT(*) as total"),
    model.connection.raw("COUNT(DISTINCT user_id) as unique_users")
  )
  .first();
```

## Key File
`app/src/model/base.js:16-28` — the `get knex()` and `get connection()` getters.
