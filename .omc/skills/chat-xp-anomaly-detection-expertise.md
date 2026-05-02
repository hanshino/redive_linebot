# Chat XP Anomaly Detection

## The Insight
High `raw_exp` values are NOT inherently suspicious — they're expected in large groups due to the `group_bonus` multiplier. The real signal is `effective_exp` (which reflects actual level gain after diminishing returns) and whether `base_xp` or multipliers deviate from known baselines.

## Why This Matters
Without understanding the XP math, a raw_exp of 53,414 looks like a hack. With it, you can immediately calculate the implied group size and confirm it's legitimate. Chasing false positives wastes time; missing real anomalies is a trust issue.

## Recognition Pattern
- User reports possible XP farming or unusual level progression
- Admin wants to audit the fairness of the XP system
- A user's `current_exp` seems disproportionate to their activity

## The XP Math (memorise these numbers)

| Parameter | Value | Source |
|-----------|-------|--------|
| `base_xp` | **90** | `app/config/default.json` → `chat_level.exp.rate.default` |
| Honeymoon mult | **1.2×** | prestige_count == 0 |
| Tier 1 daily cap | 0–400 raw → **100%** effective | `diminishTier.js` |
| Tier 2 daily cap | 400–1000 raw → **30%** effective | |
| Tier 3 daily cap | >1000 raw → **3%** effective | |

**Per-message raw formula:**
```
raw = round(base_xp × cooldown_rate × group_bonus × blessing1_mult)
```

**Group bonus formula** (`groupBonus.js`):
```
bonus = memberCount < 5 ? 1.0 : 1 + (memberCount - 5) × 0.02
```
→ To reverse-engineer group size: `memberCount = (bonus - 1) / 0.02 + 5`

## Anomaly Checklist

Run these queries via `docker exec infra-mysql-1 bash -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" Princess -e "..."'`:

**1. Global stats sanity check**
```sql
SELECT COUNT(*) as users, MAX(current_exp) as max_exp, ROUND(AVG(current_exp)) as avg_exp
FROM chat_user_data;
```

**2. Daily aggregate per date (no user_id — avoids classifier)**
```sql
SELECT date, COUNT(*) as active_users, MAX(raw_exp) as max_raw,
       MAX(msg_count) as max_msgs, SUM(msg_count) as total_msgs
FROM chat_exp_daily GROUP BY date ORDER BY date DESC LIMIT 14;
```

**3. Verify base_xp not tampered via Redis**
```sql
SELECT base_xp, COUNT(*) as cnt FROM chat_exp_events
WHERE ts >= CURDATE() GROUP BY base_xp ORDER BY cnt DESC;
```
→ Should always be 90. Any other value means Redis `CHAT_GLOBAL_RATE` was set.

**4. Check multiplier anomalies**
```sql
SELECT base_xp, blessing1_mult, honeymoon_mult, trial_mult, permanent_mult, COUNT(*) as cnt
FROM chat_exp_events WHERE ts >= CURDATE()
GROUP BY base_xp, blessing1_mult, honeymoon_mult, trial_mult, permanent_mult
ORDER BY cnt DESC LIMIT 10;
```
→ Normal: base=90, blessing1=1.0, trial=1.0, permanent=1.0. Honeymoon=1.2 is expected for prestige_count=0.

## Normal vs Suspicious

| Observation | Verdict | Reason |
|-------------|---------|--------|
| raw_exp >> 10,000 in one day | **Normal** | Large group bonus (100+ members) |
| effective_exp ≈ 2,000–2,500 | **Normal** | Tier 3 cap (3%) limits gains |
| base_xp ≠ 90 | **Suspicious** | Redis override by admin |
| trial_mult or permanent_mult ≠ 1.0 | **Investigate** | Prestige system buff active |
| msg_count > 500/day | **Investigate** | Possible bot/script |
| effective_exp ≠ SUM(daily) | **Bug** | Data consistency issue |
