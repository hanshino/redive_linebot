# Janken Phase 3 — ELO Rank System Design

## Overview

Add an ELO-based ranking system to the janken (rock-paper-scissors) feature. ELO updates are triggered by bet-based duels, with K-factor scaled by bet amount. Players earn rank tiers displayed via Flex Message cards.

## Core Mechanics

### ELO Calculation

- **Trigger:** Only bet duels (betAmount > 0) with a non-draw result
- **Formula:** `newElo = oldElo + K * (actualResult - expectedWinRate)`
  - `expectedWinRate = 1 / (1 + 10^((opponentElo - myElo) / 400))`
  - Win: actualResult = 1, Lose: actualResult = 0
  - **Draw: no ELO change**
- **Initial ELO:** 1000

### K-Factor Tiers

| Bet Amount   | K-Factor | Approx change per win |
|-------------|----------|----------------------|
| < 500       | 2        | +/- 1                |
| 500 ~ 2,999 | 8        | +/- 4                |
| 3,000 ~ 9,999 | 16     | +/- 8                |
| 10,000+     | 32       | +/- 16               |

### Anti-Abuse

No additional restrictions. ELO's built-in mechanism handles this: high-rated players gain almost nothing from beating low-rated opponents and risk heavy losses.

## Rank System

### Tiers

5 major tiers, each with 5 sub-tiers (5 = lowest, 1 = highest):

| Tier       | Chinese | ELO Range     | Sub-tier width |
|-----------|---------|--------------|----------------|
| beginner  | 見習者   | 0 ~ 1199     | 40 (from 1000) |
| challenger | 挑戰者  | 1200 ~ 1399  | 40             |
| fighter   | 鬥士     | 1400 ~ 1599  | 40             |
| master    | 大師     | 1600 ~ 1799  | 40             |
| legend    | 傳說     | 1800+        | 40             |

### Sub-tier Formula

```
subTier = 5 - Math.min(4, Math.floor((elo - tierMinElo) / 40))
```

Example: ELO 1280 -> challenger tier, subTier = 5 - Math.min(4, Math.floor(80/40)) = 5 - 2 = 3 -> 挑戰者 3

### Demotion

No protection. ELO drops below tier threshold = immediate demotion.

### Rank Images

Already available at `app/assets/janken/`:
- `rank_beginner.png`, `rank_challenger.png`, `rank_fighter.png`, `rank_master.png`, `rank_legend.png`

## New Command

### `/猜拳段位` — Query own rank

Returns a Flex Message card showing:
- Rank icon + rank name with sub-tier (e.g. "鬥士 3")
- ELO score
- Win/Lose/Draw record + win rate
- Current streak / max streak
- Bounty amount
- ELO needed for next tier
- Server ranking
- Max bet allowance

## Result Card Changes

After a bet duel (non-draw), the result card adds:
- Rank icon + sub-tier next to each player's name
- ELO change line at bottom: e.g. "1420 -> 1428 (+8)"
- Only shown for bet matches

## Data Changes

### Database

`janken_rating` table already has all needed columns:
- `user_id`, `elo`, `rank_tier`, `win_count`, `lose_count`, `draw_count`, `streak`, `max_streak`, `bounty`

**No new migration needed.** Win/lose/draw counts are currently not being updated — Phase 3 will start updating them.

### Config

Add to `app/config/default.json` under `minigame.janken`:

```json
{
  "elo": {
    "initial": 1000,
    "kFactorTiers": [
      { "minBet": 10000, "k": 32 },
      { "minBet": 3000, "k": 16 },
      { "minBet": 500, "k": 8 },
      { "minBet": 0, "k": 2 }
    ]
  }
}
```

## File Changes

| File | Change |
|------|--------|
| `app/src/service/JankenService.js` | Add `calculateElo()`, `updateElo()`. Call from `resolveMatch` |
| `app/src/model/application/JankenRating.js` | Add `getSubTier()`, `getKFactor()`, update RANK_TIERS with Chinese names and sub-tier support |
| `app/src/controller/application/JankenController.js` | Add `/猜拳段位` route, pass rank info to result card |
| `app/src/templates/application/Janken.js` | Update `generateResultCard` with rank icons + ELO delta, add `generateRankCard` |
| `app/config/default.json` | Add `minigame.janken.elo` config |
| `app/locales/zh_tw.json` | Add rank-related i18n strings |
