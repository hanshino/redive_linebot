# 說話 XP 每日奇異天氣：設計規格

**Status:** Design / Spec
**Branch:** `feat/chat-xp-daily-weather`
**Date:** 2026-07-09
**Series:** chat-level-prestige (extension)

## 0. Decisions Locked (2026-07-09)

V1 scope trimmed after design review:

- **No `mixed` category in V1.** Only `buff` and `debuff`. Protection becomes all-or-nothing: a protected debuff day resets to fully neutral, so the hot path needs no per-field "cancel only the negative half" polarity logic. `mixed` returns in V1.1 once the pipeline is proven in prod.
- **Drop `diminish_threshold_mult`.** It is the only effect that would change the signature of a hot pure function (`applyDiminish`), for the sake of one weather. Deferred to V1.1.
- **Lazy generation only, no cron.** Lazy is needed anyway (fresh deploy / first access) and is the self-healing source of truth. Generation must be atomic — `INSERT IGNORE` then re-`SELECT` the winning row, because bot and worker are two processes that can race.
- **Do not denormalize `weather_key` into `chat_exp_daily`.** Weather is one global row per day; the join is free.
- Weights: `buff` 60% / `debuff` 40% (config-tunable).
- Weather is loaded once per batch and each user's protection once per user — never per event (avoids an N+1 in the XP hot path).

## 1. Problem

說話 XP 系統目前的成長邏輯穩定，但每天的體驗偏固定。玩家可以透過聊天累積 raw / effective XP、進入轉生與試煉循環，但缺少每天登入或打開狀態時能立刻感受到的「今日變化」。

女神石目前也缺少一個和說話系統自然連動的長期消耗點。直接販售 XP boost 會很像付費加速，容易讓說話等級變成單純買進度；更好的方向是把女神石用在「應對每天的環境」。

本設計加入「每日奇異天氣」：每天 UTC+8 會有一個全服天氣，天氣會以情境文字搭配明確數值，影響說話 XP pipeline。部分天氣有 debuff，玩家可以消費女神石購買今日防護道具，抵銷該 debuff。天氣也可以有純 buff 或混合效果，讓每天不只是被懲罰，而是有不同玩法。

## 2. Goals

- 每天產生一個可查詢、可展示、可追溯的天氣狀態。
- 天氣效果要進入 XP pipeline，並反映在 `chat_exp_events.modifiers` 與 XP history。
- 玩家可以用 `#今天天氣` 或同義指令查看今天的天氣、效果、防護狀態。
- 玩家可以花女神石購買今日防護，抵銷天氣的負面效果。
- 天氣池必須包含 buff 與 debuff，避免每天都像懲罰（mixed 於 V1.1 加入）。
- 防護道具是「今日啟用」，不做可囤貨 inventory item，避免未來設計被玩家庫存綁死。

## 3. Non-goals

- 不做直接購買 XP boost。
- 不做永久天氣抗性。
- 不做每個群組不同天氣。V1 是全服同一天氣。
- 不做多個天氣同時疊加。
- 不做玩家之間交易防護道具。
- 不讓防護抵銷天氣的正面效果；只抵銷負面部分。

## 4. Existing Data Path

```
LINE group message
  -> app/bin/EventDequeue.js#handleChatExp
       LPUSH CHAT_EXP_RECORD { userId, groupId, ts, timeSinceLastMsg, groupCount }
  -> app/bin/ChatExpUpdate.js
       RPOP CHAT_EXP_RECORD
  -> app/src/service/chatXp/pipeline.js#processBatch
       processUserEvents
         base / cooldown / group bonus / blessing
         honeymoon
         diminish
         trial / permanent
         catchup
       writeBatch
         upsert chat_user_data
         upsert chat_exp_daily
         insert chat_exp_events
```

Useful existing facts:

- `chat_exp_events` is already the right place to snapshot per-message modifiers.
- `chat_exp_daily` is already the right place to build daily XP history.
- `Inventory.decreaseGodStone({ userId, amount, note, trx })` already writes the 女神石 negative ledger row with `itemId: 999`.
- `processBatch` currently uses one UTC+8 `today` value per batch. V1 weather should use the same date so daily aggregate and weather display remain aligned.

## 5. Core Concept

Every day has one global weather:

```text
風異常的喧囂
風聲把話語吹散，你需要花費更多力氣才讓大家聽見。
效果：冷卻時間需求 +10%
防護：防風耳飾，30 女神石，今日有效
```

Weather has two layers:

1. **Flavor layer**: name, short description, display icon / color.
2. **Mechanic layer**: explicit numeric modifiers used by XP pipeline.

Weather categories:

| Category | Meaning | V1 weight |
|---|---|---:|
| `buff` | Only positive effects | 60% |
| `debuff` | Only negative effects, protectable | 40% |

`mixed` (positive + negative in the same day) is deferred to V1.1 — see §0. Most days are buff, so the system feels like daily variety, not daily tax; debuff days at 40% keep the 女神石 protection sink meaningful.

## 6. Weather Effects

V1 supports these effect fields:

| Field | Example | Meaning |
|---|---:|---|
| `cooldown_required_mult` | `1.10` | Cooldown windows become 10% longer. Negative when `> 1`. Positive when `< 1`. |
| `raw_xp_mult` | `0.90` | Multiplies raw XP after base / cooldown / group / blessing. |
| `effective_xp_mult` | `1.10` | Multiplies final effective XP near the end of the pipeline. |
| `group_bonus_mult` | `1.10` | Multiplies the computed group bonus. |

`diminish_threshold_mult` is deferred to V1.1: it is the only field that would change `applyDiminish`'s signature, for a single weather. V1 uses the four fields above.

V1 should avoid high variance or random-per-message effects. Those are fun later, but they make XP history harder to explain.

### 6.1 Protection Behavior

Only `debuff` weathers carry a `protection_type` in V1. Because a debuff weather is uniformly negative, protection is all-or-nothing:

- when a player buys the matching protection, every effect of that weather resets to its multiplicative identity (`1.0`) for that player — the day becomes fully neutral for them;
- protection applies only to events after purchase;
- protection expires at the end of that UTC+8 weather date.

`buff` weathers have no `protection_type` and nothing to cancel.

Examples:

- `cooldown_required_mult: 1.10` becomes `1.00` when protected.
- `raw_xp_mult: 0.90` becomes `1.00` when protected.

V1.1 (when `mixed` returns): protection cancels only the negative subset and keeps bonuses — e.g. a mixed weather with `cooldown_required_mult: 1.05` + `group_bonus_mult: 1.10` keeps the group bonus. That needs per-field polarity metadata, which V1 deliberately avoids.

## 7. V1 Weather Pool

| Key | Category | Name | Flavor | Effects | Protection |
|---|---|---|---|---|---|
| `noisy_wind` | debuff | 風異常的喧囂 | 風聲把話語吹散，你需要花費更多力氣才讓大家聽見。 | `cooldown_required_mult: 1.10` | 防風耳飾 |
| `silent_fog` | debuff | 沉默霧氣 | 霧氣吞掉句尾，話語抵達時少了一點重量。 | `raw_xp_mult: 0.90` | 破霧鈴 |
| `low_pressure` | debuff | 魔力低壓 | 空氣中的魔力變薄，聊天帶來的成長稍微遲鈍。 | `effective_xp_mult: 0.90` | 晴空護符 |
| `mana_tailwind` | buff | 魔力順風 | 話語順著魔力流動，今天的交流特別順。 | `effective_xp_mult: 1.10` | none |
| `clear_echo` | buff | 晴空回音 | 每句話都被清楚地接住。 | `cooldown_required_mult: 0.95` | none |
| `bustling_square` | buff | 熱鬧廣場 | 人越多越熱鬧，話題被氣氛推著跑。 | `group_bonus_mult: 1.10` | none |

Deferred to V1.1 (`mixed`): `festival_noise`, `drizzle_whisper`, `dry_echo`. `drizzle_whisper` also relied on `diminish_threshold_mult`.

Initial tuning constraints:

- Single effect magnitude should stay around 5% to 10%.
- A pure debuff weather must always have a matching protection.
- (V1.1) A mixed weather's positive side should be visible enough that players do not feel forced to buy protection.

## 8. XP Formula Integration

Weather should be explicit in the pipeline, not hidden inside existing functions.

Suggested order:

```
weather = today weather
protection = user's protection for weather date, if purchased before event.ts
effectiveWeather = cancelNegativeEffects(weather.effects, protection)

adjustedTimeSinceLastMsg =
  event.timeSinceLastMsg / effectiveWeather.cooldown_required_mult

cooldownRate = selectCooldownRate(adjustedTimeSinceLastMsg, state)

groupBonus =
  computeGroupBonus(event.groupCount, state)
  * effectiveWeather.group_bonus_mult

raw =
  computePerMsgXp(base, cooldownRate, groupBonus, state)
  * effectiveWeather.raw_xp_mult

afterDiminish =
  applyDiminish(raw * honeymoonMult, scaledBefore, state)
  // V1 does not touch applyDiminish; diminish_threshold_mult is V1.1.

afterTrialPermanent = applyTrialAndPermanent(afterDiminish, state)

finalEffective =
  afterTrialPermanent
  * catchupMult
  * effectiveWeather.effective_xp_mult

effectiveInt = round(finalEffective)
```

Cooldown implementation detail:

- Existing `selectCooldownRate(timeDiffMs, state)` compares message delta against cooldown thresholds.
- To make cooldown windows 10% longer, pass `timeDiffMs / 1.10`.
- This makes a 6.6s gap behave like a normal 6.0s gap.

## 9. Schema

### 9.1 `chat_daily_weather`

One row per UTC+8 date.

| Column | Type | Notes |
|---|---|---|
| `date` | date PK | UTC+8 date |
| `weather_key` | varchar | e.g. `noisy_wind` |
| `category` | varchar | `buff`, `mixed`, `debuff` |
| `name` | varchar | display snapshot |
| `flavor_text` | text | display snapshot |
| `effects` | json | numeric effect snapshot |
| `protection_type` | varchar nullable | e.g. `windproof` |
| `protection_name` | varchar nullable | e.g. `防風耳飾` |
| `protection_cost` | int unsigned nullable | 女神石 cost |
| `generated_at` | datetime | |
| `created_at` | datetime | |
| `updated_at` | datetime | |

Why snapshot text and effects:

- XP history must remain explainable even if future tuning changes weather config.
- The generated weather row is the historical source of truth for that date.

### 9.2 `user_weather_protections`

One row per user per weather date.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint unsigned PK | |
| `user_id` | varchar | LINE user id |
| `weather_date` | date | UTC+8 date |
| `weather_key` | varchar | snapshot |
| `protection_type` | varchar | snapshot |
| `protection_name` | varchar | snapshot |
| `stone_cost` | int unsigned | snapshot |
| `purchased_at` | datetime | protection starts here |
| `created_at` | datetime | |
| `updated_at` | datetime | |

Indexes:

- unique `(user_id, weather_date)`
- `(weather_date, weather_key)`

Purchase flow should run in a transaction:

1. Load today's weather row.
2. Reject if weather has no `protection_type`.
3. Reject if the user already has protection for the date.
4. Check 女神石 balance.
5. Insert negative inventory ledger via `Inventory.decreaseGodStone`.
6. Insert `user_weather_protections`.

### 9.3 `chat_exp_events`

Add columns:

| Column | Type | Notes |
|---|---|---|
| `weather_key` | varchar nullable | weather snapshot |
| `weather_effects` | json nullable | effective effects after protection |
| `weather_protected` | boolean not null default false | whether protection was active for this event |

Also extend `modifiers`:

```json
{
  "weather": {
    "key": "noisy_wind",
    "name": "風異常的喧囂",
    "category": "debuff",
    "effects": {
      "cooldown_required_mult": 1.1
    },
    "protected": true,
    "protection_type": "windproof",
    "protection_name": "防風耳飾"
  }
}
```

`chat_exp_daily` does not need new weather columns in V1. Daily history can join `chat_daily_weather` by date.

## 10. Backend Design

### 10.1 Model

Add:

- `app/src/model/application/ChatDailyWeather.js`
- `app/src/model/application/UserWeatherProtection.js`

Suggested helpers:

```js
ChatDailyWeather.findByDate(date)
ChatDailyWeather.upsertForDate(payload)
UserWeatherProtection.findByUserDate(userId, date)
UserWeatherProtection.createProtection(payload, trx)
```

### 10.2 Service

Add `app/src/service/ChatWeatherService.js`.

Public methods:

- `getWeatherForDate(date)`  
  Returns existing row or lazily generates one.

- `generateWeatherForDate(date)`  
  Picks from configured weather pool by weight. Should avoid repeating yesterday's `weather_key` when possible.

- `getTodayStatus(userId, now)`  
  Returns today's weather, protection status, and user's 女神石 balance.

- `purchaseTodayProtection(userId, now)`  
  Deducts 女神石 and inserts `user_weather_protections`.

- `resolveEffectiveWeather({ userId, date, eventTs })`  
  Returns weather effects after protection cancellation.

- `cancelNegativeEffects(effects, protection)`  
  Pure helper used by pipeline tests.

### 10.3 Config

Add to `app/config/default.json`, nested inside the existing `chat_level` object as a sibling of `exp` (read via `config.get("chat_level.dailyWeather")` — the repo has no `chatXp` config key; the `chatXp` name is only the service directory):

```json
{
  "chat_level": {
    "dailyWeather": {
      "enabled": false,
      "purchaseEnabled": false,
      "weights": {
        "buff": 60,
        "debuff": 40
      },
      "defaultProtectionCost": 30,
      "pool": {
        "noisy_wind": {
          "category": "debuff",
          "name": "風異常的喧囂",
          "flavorText": "風聲把話語吹散，你需要花費更多力氣才讓大家聽見。",
          "effects": { "cooldown_required_mult": 1.1 },
          "protectionType": "windproof",
          "protectionName": "防風耳飾",
          "protectionCost": 30
        }
      }
    }
  }
}
```

## 11. Commands and API

### 11.1 Bot command

Add command aliases:

- `#今天天氣`
- `#天氣`
- `!天氣`

Response content:

- Weather name and flavor text.
- Numeric effects in plain language.
- Whether this weather has a protectable debuff.
- User's protection state:
  - not needed: pure buff day
  - available: show cost and CTA
  - active: show protection name and purchase time

Example text response:

```text
今日天氣：風異常的喧囂
風聲把話語吹散，你需要花費更多力氣才讓大家聽見。

效果：冷卻時間需求 +10%
防護：防風耳飾（30 女神石，今日有效）
狀態：尚未防護
```

V1 can use text first. A Flex card can follow after the logic stabilizes.

### 11.2 Purchase entry

Purchase should be available from:

- LIFF XP history / status UI button; or
- weather card postback / API call.

Do not require a text command for purchase in V1. It is easier to prevent accidental spending with a button confirmation.

### 11.3 API

#### `GET /api/me/chat-weather/today`

Returns:

```json
{
  "date": "2026-07-09",
  "weather": {
    "key": "noisy_wind",
    "category": "debuff",
    "name": "風異常的喧囂",
    "flavor_text": "風聲把話語吹散，你需要花費更多力氣才讓大家聽見。",
    "effects": { "cooldown_required_mult": 1.1 },
    "protection_type": "windproof",
    "protection_name": "防風耳飾",
    "protection_cost": 30
  },
  "protection": null,
  "god_stone_balance": 860
}
```

#### `POST /api/me/chat-weather/protection/purchase`

Responses:

- `200` purchased
- `400 { code: "NO_PROTECTION" }` today's weather has no protection
- `400 { code: "INSUFFICIENT_STONE" }` insufficient 女神石
- `400 { code: "ALREADY_PROTECTED" }` already protected
- `400 { code: "DISABLED" }` purchases disabled (flag off)

All business errors use HTTP 400 + a machine `code` (the repo has no 402/409 anywhere); this supersedes the earlier 402/409 draft.

## 12. XP History

XP history should make weather feel natural, not like a hidden tax.

Daily trend:

- Show weather badge on each day.
- Examples:
  - `風異常的喧囂 · cooldown +10%`
  - `魔力順風 · effective +10%`
  - `熱鬧祭典 · cooldown +5%, group +10%`

Event breakdown:

- Each event row reads `weather_key`, `weather_effects`, and `weather_protected`.
- Render chips:
  - `天氣：風異常的喧囂`
  - `冷卻 +10%`
  - `已防護：防風耳飾`

When protected:

- Show both original weather and the effective result.
- Example: `冷卻 +10% 已抵銷`.

## 13. Edge Cases

- **Queued events crossing midnight:** V1 uses the same `ctx.today` as current `chat_exp_daily` writes. If a message is processed after midnight, it belongs to the new processing date and weather. This matches the current batch architecture.
- **Protection purchased after speaking:** protection applies only when `event.ts >= purchased_at`. It should not retroactively protect earlier messages still in queue.
- **Weather generated late:** if no row exists at first access, generate lazily and persist. A future cron can pre-generate at 00:00 UTC+8.
- **Feature disabled:** if `chat_level.dailyWeather.enabled = false`, pipeline treats weather as neutral and commands can return "今日天氣觀測暫停".
- **Purchase disabled:** if `purchaseEnabled = false`, weather still displays and applies, but no new protections can be bought. Use only during staging or emergency rollback.
- **Insufficient 女神石:** no protection row is created.
- **Pure buff weather:** no protection purchase shown.

## 14. Testing

### Unit tests

- `generateWeatherForDate`
  - respects configured weights
  - avoids immediate repeat when alternatives exist
  - persists one row per date

- `cancelNegativeEffects` (V1: a protected debuff resets every effect to `1.0`)
  - `cooldown_required_mult: 1.10` → `1.00`
  - `raw_xp_mult: 0.90` → `1.00`
  - `effective_xp_mult: 0.90` → `1.00`
  - buff weather is never passed here (no protection to apply)
  - (V1.1) keeps positive effects when cancelling only the negative subset of a mixed weather

- `purchaseTodayProtection`
  - deducts 女神石 and creates protection in one transaction
  - rejects pure buff weather
  - rejects duplicate protection
  - rejects insufficient 女神石

### Pipeline tests

- `noisy_wind` lengthens cooldown and reduces effective XP for rapid messages.
- Protection cancels the cooldown penalty for events after `purchased_at`.
- (V1.1) Mixed weather keeps positive effects after protection.
- `chat_exp_events.modifiers.weather` snapshots weather name, effects, and protection state.
- XP history can render old rows with null weather fields.

### API / command tests

- `#今天天氣` returns today's weather and effect text.
- `GET /api/me/chat-weather/today` returns weather, protection, and balance.
- `POST /api/me/chat-weather/protection/purchase` returns 200 / 400 (with machine `code`) correctly.

## 15. Rollout Plan

1. Add migrations for `chat_daily_weather`, `user_weather_protections`, and `chat_exp_events` weather columns.
2. Add model + service + unit tests.
3. Add `#今天天氣` command and read-only API with `enabled = false`.
4. Enable command display in staging with neutral pipeline behavior.
5. Enable pipeline weather effects in staging using low-severity pool only.
6. Add protection purchase flow.
7. Enable production with:
   - `enabled = true`
   - `purchaseEnabled = true`
   - debuff weight at 40%
8. Review first 7 days of XP distribution and protection purchases before increasing effect variety.

Rollback:

- Set `chat_level.dailyWeather.enabled = false` to neutralize pipeline effects.
- Set `purchaseEnabled = false` to stop new purchases.
- Keep `#今天天氣` available if useful, but show observation paused.
- Do not delete historical weather rows; XP history depends on them.

## 16. Acceptance Criteria

- `#今天天氣` shows today's weather, flavor text, numeric effects, and protection state.
- XP pipeline applies today's weather when enabled.
- Weather effects are snapshotted into `chat_exp_events`.
- XP history can show daily weather badges and per-event weather chips.
- A player can buy today's protection when the weather has a protectable debuff.
- Buying protection deducts the configured 女神石 amount.
- Protection cancels only negative effects and only for future events.
- Pure buff weather never asks the player to buy protection.
- Existing XP pipeline tests continue passing.

## 17. Open Questions

- ~~Cron at 00:00 vs lazy generation for V1?~~ **Resolved: lazy only, atomic generation (§0).**
- Should weather be global forever, or should V2 allow event / season-specific weather pools? (Open — schema already supports it via `weather_key` + snapshot, no migration needed.)
- ~~Purchase via text command vs LIFF / postback?~~ **Resolved: LIFF / postback only (§11.2), to avoid accidental spend.**
- ~~Store `weather_key` in `chat_exp_daily`?~~ **Resolved: no, join by date (§0).**
