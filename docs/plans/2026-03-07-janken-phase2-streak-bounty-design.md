# Janken Phase 2 - Streak Bounty System

## Overview

Add a win streak tracking and bounty system to the janken feature. When a player wins consecutive matches, the system accumulates a bounty on their head. Whoever defeats the streak holder claims the bounty. This encourages players to challenge strong opponents rather than avoid them.

## Core Rules

### Streak Tracking
- Applies to both duel and arena modes
- Win increments `streak` by 1, updates `max_streak` if new record
- Loss resets `streak` to 0
- Draw does NOT break streak
- Uses existing `janken_rating.streak` / `max_streak` columns

### Bounty Accumulation
- Base: +50 goddess stones per win
- Milestone bonuses:
  - 3 wins: +100
  - 5 wins: +300
  - 7 wins: +500
  - 10 wins: +1000
  - 15 wins: +2000
  - 20 wins: +3000
- Cap: 10,000 goddess stones
- Bounty is system-funded (not taken from players)

### Bounty Payout
- When a streak holder loses, the winner receives the full accumulated bounty
- System deposits goddess stones directly to the winner's account
- Draw does not trigger payout

### Anti-Cheat
- Bet system is zero-sum with fee deduction — self-play loses money
- Bounty has a hard cap (10,000)
- Consider: consecutive matches against the same opponent count as 1 streak increment

## UI / Messaging

### Result Card
- Show winner's current streak count on the result card when streak >= 2

### Bounty Announcer (sender)
- Custom sender: `{ name: "bounty-announcer-name-TBD", iconUrl: "TBD" }`
- On continued streak: "{player} has won {N} consecutive matches! Current bounty: {amount} goddess stones. Who will take them down?"
- On streak broken: "{breaker} ended {holder}'s {N}-win streak! Claimed bounty: {amount} goddess stones!"
- All messages sent via reply (no push API)

## Config (app/config/default.json)

```json
{
  "minigame": {
    "janken": {
      "streak": {
        "baseReward": 50,
        "milestones": {
          "3": 100,
          "5": 300,
          "7": 500,
          "10": 1000,
          "15": 2000,
          "20": 3000
        },
        "maxBounty": 10000
      }
    }
  }
}
```

## Affected Files

- `app/src/service/JankenService.js` — streak update logic, bounty calculation, bounty payout
- `app/src/model/application/JankenRating.js` — streak query helpers
- `app/src/controller/application/JankenController.js` — integrate streak/bounty into resolve flow, send announcer messages
- `app/src/templates/application/Janken.js` — show streak on result card
- `app/config/default.json` — streak config
- `app/locales/zh_tw.json` — bounty announcer messages

## No New Migrations

Existing `janken_rating` table already has `streak` and `max_streak` columns. Bounty is calculated on-the-fly from streak count, not stored.
