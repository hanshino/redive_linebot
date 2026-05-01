# Princess Connect Re:Dive — Avatar ID Mapping

## The Insight
Game character avatar images follow a fixed ID scheme based on `unit_id` and star rarity. The avatar ID is NOT the same as the `unit_id` — it's `unit_id + (rarity_tier * 10)` where rarity tiers are 1, 3, 6.

## Why This Matters
If you use the raw `unit_id` as the avatar filename, you'll get 404s. The correct mapping is essential for displaying character portraits anywhere in the app (race, gacha, profile, etc.).

## Recognition Pattern
- Building character avatar URLs
- Seeding character data with portraits
- Avatar images returning 404
- Any feature that needs to display a character's face icon

## The Approach
1. Base URL: `https://chieru.hanshino.dev/assets/units/head/{avatarId}.png`
2. Avatar ID calculation:
   - **1-star**: `unit_id + 10` (e.g., 105801 → 105811)
   - **3-star**: `unit_id + 30` (e.g., 105801 → 105831)
   - **6-star**: `unit_id + 60` (e.g., 105801 → 105861)
3. Prefer the highest available rarity for best-looking portrait
4. Check `unit_rarity` table in `app/assets/redive_tw.db` for max rarity per character:
   ```sql
   SELECT unit_id, MAX(rarity) as max_rarity
   FROM unit_rarity
   WHERE unit_id >= 100000 AND unit_id < 200000
   GROUP BY unit_id
   ```
5. Full-body images follow the same pattern: `https://chieru.hanshino.dev/assets/units/full/{avatarId}.png`

## Data Sources
- `app/assets/redive_tw.db` — SQLite game database
  - `unit_profile`: `unit_id`, `unit_name` (all playable characters)
  - `unit_rarity`: `unit_id`, `rarity` (available star levels)
  - `unit_data`: `unit_id`, `unit_name`, `search_area_width` (position type)
- Config paths: `app/config/default.json` → `princess.image.head_image`, `princess.image.full_image`
