# Janken Economy: Anti-Inflation Bounty Design

## The Insight
In-game reward systems that create currency from nothing (minting) are exploitable through player collusion, regardless of claim restrictions. The principle: **any reward pool must be funded from existing currency flows (fees, taxes), not generated ex nihilo.** When the source is recycled money, the system is structurally deflationary — no guard rails needed against farming.

## Why This Matters
Real incident: players colluded to farm bounty by having one player intentionally lose repeatedly (building streak), then the accomplice breaks the streak to claim the bounty. The old `bountyRate: 0.5` created 500 godStone per 1000-bet win from nothing, while fees only destroyed 200. Net inflation per cycle was significant and repeatable.

Attempted fixes like "opponent diversity requirements" or "minimum claim bet ratios" add complexity but don't address the root cause — and in LINE group social dynamics, restricting who you can play against penalizes legitimate users who enjoy dueling the same friend.

## Recognition Pattern
- Any game feature where winning/streaking generates new currency
- `increaseGodStone` calls in reward paths without a corresponding `decreaseGodStone` source
- Bounty/reward pools that grow without being funded by fees or player payments
- Users reporting suspicious currency accumulation patterns

## The Approach
1. Identify all currency injection points in the feature (search for `increaseGodStone` without matching `decreaseGodStone`)
2. Trace where the reward money comes from — if it's `Math.floor(betAmount * rate)` without deducting from an existing pool, it's minting
3. Redirect the reward source to an existing deflationary mechanism (e.g., match fees via `FEE_RATE`)
4. Scale caps by rank tier using `maxBountyByRank` pattern (like `maxAmountByRank` for bets) to keep rewards meaningful at all levels

## Key Files
- `app/src/service/JankenService.js` — `updateStreaks()`, `calculateBountyIncrement()`
- `app/src/model/application/JankenRating.js` — `getMaxBounty()`
- `app/config/default.json` — `minigame.janken.streak.maxBountyByRank`

## Example
```javascript
// BAD: Bounty minted from nothing (inflationary)
const bountyIncrement = Math.floor(betAmount * BOUNTY_RATE); // creates new money

// GOOD: Bounty funded from match fee (zero inflation)
const bountyIncrement = fee; // fee already deducted from pot, just redirected
```
