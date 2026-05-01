# TW Redive DB Obfuscation: Column Shuffle Discovery

## The Insight
TW Priconne's database obfuscation applies THREE transformations, not two:
1. Table names → `v1_<sha256>`
2. Column names → `<sha256>`
3. **Column ORDER is shuffled** (not preserved)

Any approach that assumes column position is stable will silently produce wrong mappings. The only reliable matching signal is the **data values themselves**.

## Why This Matters
If you assume column order is preserved (the natural assumption), you'll build a mapping that maps `unit_id` to `catch_copy` etc. — every column name points to the wrong data. Queries return garbage with no obvious error.

We burned 4+ iterations discovering this: structure fingerprint → lenient fingerprint → prefix matching → data matching, each failing because the fundamental assumption (position = identity) was wrong.

## Recognition Pattern
- Working with `tools/tw-redive-db-fetcher/` (rebuild_mapping.py, deobfuscate.py, mapping.json)
- `mapping.json` hash mismatches after a TW game update
- Deobfuscated tables have data in wrong columns
- `redive_tw.db` ends up empty (8KB) after deobfuscation

## The Approach
When rebuilding mapping.json:
1. **Table matching**: Compare rows as SETS of values (frozenset), not tuples. Use subset matching since new tables may have extra columns.
2. **Column matching**: For each old column, collect distinct values, then find the new column with the highest value overlap. Greedy match from most-unique columns first.
3. **Pre-filter**: Use sorted type signatures (order-independent) to reduce candidate search space before expensive data comparisons.
4. **Multi-pass**: Unique signature match → data disambiguation → broader column-count search. Each pass narrows candidates for the next.

## Key Files
- `tools/tw-redive-db-fetcher/rebuild_mapping.py` — auto-rebuilds mapping from old (clean) + new (obfuscated) DBs
- `tools/tw-redive-db-fetcher/mapping.json` — the clean→obfuscated name mapping (544 entries)
- `tools/tw-redive-db-fetcher/deobfuscate.py` — applies mapping to translate table/column names
- Old unobfuscated DB: git commit `c55a2de6` in Expugn/priconne-database (version 00180024)
