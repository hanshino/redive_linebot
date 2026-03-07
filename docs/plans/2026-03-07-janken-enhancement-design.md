# Janken Enhancement Design

## Overview

Refactor and enhance the rock-paper-scissors (janken) feature with betting, win streaks, and ELO ranking. Three phases, incremental delivery.

## Current State

- Two modes: duel (`/duel @player`) and arena (`/hold`)
- Single round, no stakes, no rewards beyond daily quest trigger
- Result stored in `janken_records` + `janken_result` tables
- Controller handles everything: business logic, Redis, LINE API, DB writes
- Duplicate code between duel and arena settlement
- Flex Messages use emoji text, no images

## Architecture: Incremental Refactor (Option A)

```
Controller (JankenController.js)
  - Command parsing, Flex Message sending
  - Delegates all logic to Service

Service (JankenService.js) [NEW]
  - Match lifecycle: create, submit choice, resolve
  - Betting: balance check, escrow, settlement
  - Win streak tracking (Phase 2)
  - ELO calculation (Phase 3)

Models
  - JankenRecords (existing, extended)
  - JankenResult (existing, extended)
  - JankenRating [NEW in Phase 1, populated in Phase 3]

Templates (Janken.js) [NEW, replaces janken parts of Minigame.js]
  - Game-style Flex Messages with custom image assets

Static Assets
  - app/assets/janken/*.png served via Express static
  - URL: https://{APP_DOMAIN}/assets/janken/{name}.png
```

## Command Design

| Command | Description |
|---------|-------------|
| `/janken @player` or `/duel @player` | 1v1 duel, no bet |
| `/janken @player 100` or `/duel @player 100` | 1v1 duel with 100 goddess stone bet |
| `/janken arena` or `/hold` | Open arena (no bet, streak rewards in Phase 2) |

Chinese aliases: `/duel` = `/duel`, `/janken arena` = `/janken擂台`, `/janken大賽`, `/hold`

Regex: preserve existing patterns plus unified `/janken` entry.

## Phase 1: Refactor + Betting System

### Service Layer — JankenService.js

```
startDuel(userId, targetUserId, groupId, betAmount?)
  - Validate group context
  - If bet: check initiator balance >= betAmount, escrow (deduct) initiator's stones
  - Return match metadata for Flex Message

submitChoice(matchId, userId, choice)
  - Store choice in Redis (TTL 1hr)
  - If bet and this is the opponent's first action: check & escrow opponent's stones
  - If both submitted: call resolveMatch()

resolveMatch(matchId)
  - Determine winner
  - Settle bet: winner gets (2 * betAmount * 0.9), draw refunds both
  - Write to janken_records + janken_result
  - Clean up Redis
  - Trigger daily quest event
  - Return result data for Flex Message

startArena(userId, groupId)
  - Store arena state in Redis
  - Return arena metadata for Flex Message

challengeArena(groupId, holderUserId, challengerUserId, choice)
  - Store challenger choice in Redis (TTL 10min, one at a time)

resolveArena(groupId, holderUserId, holderChoice)
  - Get challenger data from Redis
  - Resolve like duel (no bet)
  - Return result data
```

### Database Changes

**Extend `janken_records`:**

```sql
ALTER TABLE janken_records
  ADD COLUMN group_id VARCHAR(33) AFTER target_user_id,
  ADD COLUMN bet_amount INT NOT NULL DEFAULT 0,
  ADD COLUMN bet_fee INT NOT NULL DEFAULT 0;
```

**New table `janken_rating`:**

```sql
CREATE TABLE janken_rating (
  user_id VARCHAR(33) PRIMARY KEY,
  elo INT NOT NULL DEFAULT 1000,
  rank_tier VARCHAR(20) NOT NULL DEFAULT 'beginner',
  win_count INT NOT NULL DEFAULT 0,
  lose_count INT NOT NULL DEFAULT 0,
  draw_count INT NOT NULL DEFAULT 0,
  streak INT NOT NULL DEFAULT 0,
  max_streak INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Betting Flow

```
Initiator: /janken @opponent 100
  1. Check initiator balance >= 100
  2. Deduct 100 from initiator (escrow)
  3. Send duel Flex Message to group (shows bet: 100)

Opponent clicks a choice button:
  4. Check opponent balance >= 100
  5. Deduct 100 from opponent (escrow)
  6. Store choice in Redis

Both choices submitted:
  7. Determine winner
  8. Win: winner receives 190 (200 * 0.9), 10 burned as fee
  9. Draw: refund 100 to each
  10. Send result Flex Message

Timeout (1 hour, no opponent action):
  11. Refund 100 to initiator via cron or TTL check
```

### Flex Message Design

**Duel Start Card:**
- Top: Player 1 avatar + name | VS image | Player 2 avatar + name
- Middle: Bet amount display (if applicable)
- Bottom: Rock/Scissors/Paper image buttons + "Leave it to fate" button

**Result Card:**
- Top: Large WIN/DRAW/LOSE image
- Middle: P1 choice image vs P2 choice image, with names
- Bottom: Bet settlement line (e.g., "+90 goddess stones" / "-100 goddess stones")

### Static File Serving

Add to `server.js`:
```js
server.use("/assets", express.static(path.join(__dirname, "assets")));
```

### Image Assets

Located in `app/assets/janken/`:
- `rock.png`, `scissors.png`, `paper.png` — hand gesture icons
- `win.png`, `draw.png`, `lose.png` — result badges
- `vs.png` — versus badge
- `rank_beginner.png` through `rank_legend.png` — rank badges (Phase 3)

### Config Changes

Add to `app/config/default.json`:
```json
{
  "minigame": {
    "janken": {
      "bet": {
        "minAmount": 10,
        "maxAmountByRank": {
          "beginner": 1000,
          "challenger": 5000,
          "fighter": 10000,
          "master": 30000,
          "legend": 50000
        },
        "feeRate": 0.1
      }
    }
  }
}
```

## Phase 2: Win Streak (High-Level)

- Track consecutive wins for arena holders in Redis
- Milestone rewards (system-issued goddess stones):
  - 3 wins: 1.5x base reward
  - 5 wins: 2.0x base reward
  - 10 wins: 3.0x base reward
- Group broadcast on streak milestones
- Loss or draw resets streak
- Store max streak in `janken_rating`

## Phase 3: ELO Ranking (High-Level)

- Standard ELO calculation (K-factor = 32 for beginners, 16 for masters+)
- All duel/arena matches update ELO
- Rank tiers based on ELO thresholds:
  - Beginner (見習者): < 1200
  - Challenger (挑戰者): 1200-1399
  - Fighter (強者): 1400-1599
  - Master (達人): 1600-1799
  - Legend (傳說): >= 1800
- Bet max amount unlocked by rank tier
- `/janken段位` command to query own rank (text reply)
- LIFF page for detailed stats, history, leaderboard
- Rank badge displayed in result Flex Message

## Files Changed (Phase 1)

| File | Action |
|------|--------|
| `app/src/service/JankenService.js` | NEW — core game logic |
| `app/src/controller/application/JankenController.js` | REWRITE — thin controller |
| `app/src/templates/application/Janken.js` | NEW — game-style Flex Messages |
| `app/src/templates/application/Minigame.js` | REMOVE janken functions (keep if other minigames use it) |
| `app/src/model/application/JankenRecords.js` | EXTEND |
| `app/src/model/application/JankenResult.js` | KEEP as-is |
| `app/src/model/application/JankenRating.js` | NEW |
| `app/server.js` | ADD static file serving |
| `app/config/default.json` | ADD bet config |
| `app/locales/zh_tw.json` | UPDATE duel messages |
| `app/migrations/YYYYMMDD_extend_janken_records.js` | NEW |
| `app/migrations/YYYYMMDD_create_janken_rating.js` | NEW |
