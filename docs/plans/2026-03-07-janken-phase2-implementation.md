# Janken Phase 2 - Streak Bounty Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add win streak tracking and bounty hunter system to janken — winners accumulate a system-funded bounty, whoever defeats them claims it.

**Architecture:** Streak is tracked in `janken_rating.streak/max_streak` (already exists). Bounty is calculated on-the-fly from streak count via config. On match resolve, update streaks for both players, calculate bounty payout if streak broken, and send announcer messages via `sender`.

**Tech Stack:** Node.js, Knex/MySQL, Redis, LINE Messaging API (sender), Jest

---

### Task 1: Config — Add Streak Settings

**Files:**
- Modify: `app/config/default.json:41-66`

**Step 1: Add streak config under `minigame.janken`**

In `app/config/default.json`, add a `streak` key inside `minigame.janken` (after the `images` block):

```json
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
```

**Step 2: Commit**

```bash
git add app/config/default.json
git commit -m "feat(janken): add streak bounty config"
```

---

### Task 2: i18n — Add Bounty Announcer Messages

**Files:**
- Modify: `app/locales/zh_tw.json:127-149` (inside `duel` block)

**Step 1: Add streak/bounty messages at end of the `duel` block**

Add these keys inside `"duel": { ... }` before the closing `}`:

```json
"streak_continue": "{{{ displayName }}} 已經連勝 {{ streak }} 場！目前懸賞金：{{ bounty }} 女神石，快來終結他！",
"streak_broken": "{{{ breakerName }}} 終結了 {{{ holderName }}} 的 {{ streak }} 連勝！獲得懸賞金 {{ bounty }} 女神石！",
"insufficient_funds": "餘額不足！你目前只有 {{ balance }} 女神石"
```

**Step 2: Commit**

```bash
git add app/locales/zh_tw.json
git commit -m "feat(janken): add streak bounty i18n messages"
```

---

### Task 3: Service — Bounty Calculation Function

**Files:**
- Modify: `app/src/service/JankenService.js`
- Test: `app/__tests__/service/JankenService.test.js`

**Step 1: Write failing tests for `calculateBounty`**

Add to `app/__tests__/service/JankenService.test.js`:

```javascript
describe("calculateBounty", () => {
  it("returns 0 for streak 0", () => {
    expect(JankenService.calculateBounty(0)).toBe(0);
  });

  it("returns base reward for streak 1", () => {
    expect(JankenService.calculateBounty(1)).toBe(50);
  });

  it("returns cumulative base for streak 2", () => {
    expect(JankenService.calculateBounty(2)).toBe(100);
  });

  it("adds milestone bonus at streak 3", () => {
    // 3*50 + 100 = 250
    expect(JankenService.calculateBounty(3)).toBe(250);
  });

  it("adds milestone bonus at streak 5", () => {
    // 5*50 + 100 + 300 = 650
    expect(JankenService.calculateBounty(5)).toBe(650);
  });

  it("adds milestone bonus at streak 10", () => {
    // 10*50 + 100 + 300 + 500 + 1000 = 2400
    expect(JankenService.calculateBounty(10)).toBe(2400);
  });

  it("caps at maxBounty", () => {
    expect(JankenService.calculateBounty(100)).toBe(10000);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd app && yarn test -- --testPathPattern=JankenService --verbose
```

Expected: FAIL — `JankenService.calculateBounty is not a function`

**Step 3: Implement `calculateBounty`**

Add to `app/src/service/JankenService.js` (at the top, add config reads; then add the function):

```javascript
// Add near top with other config reads:
const STREAK_BASE_REWARD = config.get("minigame.janken.streak.baseReward");
const STREAK_MILESTONES = config.get("minigame.janken.streak.milestones");
const STREAK_MAX_BOUNTY = config.get("minigame.janken.streak.maxBounty");

// Add function:
exports.calculateBounty = function (streak) {
  if (streak <= 0) return 0;

  let bounty = streak * STREAK_BASE_REWARD;

  for (const [milestone, bonus] of Object.entries(STREAK_MILESTONES)) {
    if (streak >= parseInt(milestone, 10)) {
      bounty += bonus;
    }
  }

  return Math.min(bounty, STREAK_MAX_BOUNTY);
};
```

**Step 4: Run tests to verify they pass**

```bash
cd app && yarn test -- --testPathPattern=JankenService --verbose
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add app/src/service/JankenService.js app/__tests__/service/JankenService.test.js
git commit -m "feat(janken): add bounty calculation from streak count"
```

---

### Task 4: Service — Streak Update Logic

**Files:**
- Modify: `app/src/service/JankenService.js`
- Test: `app/__tests__/service/JankenService.test.js`

**Step 1: Write failing tests for `updateStreaks`**

Add mock for JankenRating at top of test file (after existing mocks):

```javascript
jest.mock("../../src/model/application/JankenRating", () => ({
  findOrCreate: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
  getRankTier: jest.fn(),
  getMaxBet: jest.fn(),
}));

const JankenRating = require("../../src/model/application/JankenRating");
```

Add test describe block:

```javascript
describe("updateStreaks", () => {
  it("increments winner streak and resets loser streak", async () => {
    JankenRating.findOrCreate
      .mockResolvedValueOnce({ user_id: "winner", streak: 2, max_streak: 5 })
      .mockResolvedValueOnce({ user_id: "loser", streak: 3, max_streak: 4 });

    const result = await JankenService.updateStreaks("winner", "loser", "win");

    expect(JankenRating.update).toHaveBeenCalledWith("winner", {
      streak: 3,
      max_streak: 5,
    });
    expect(JankenRating.update).toHaveBeenCalledWith("loser", {
      streak: 0,
      max_streak: 4,
    });
    expect(result).toEqual({
      winnerStreak: 3,
      loserPreviousStreak: 3,
      loserBounty: expect.any(Number),
    });
  });

  it("updates max_streak when new record", async () => {
    JankenRating.findOrCreate
      .mockResolvedValueOnce({ user_id: "winner", streak: 5, max_streak: 5 })
      .mockResolvedValueOnce({ user_id: "loser", streak: 0, max_streak: 2 });

    await JankenService.updateStreaks("winner", "loser", "win");

    expect(JankenRating.update).toHaveBeenCalledWith("winner", {
      streak: 6,
      max_streak: 6,
    });
  });

  it("does not change streaks on draw", async () => {
    const result = await JankenService.updateStreaks("p1", "p2", "draw");

    expect(JankenRating.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      winnerStreak: 0,
      loserPreviousStreak: 0,
      loserBounty: 0,
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd app && yarn test -- --testPathPattern=JankenService --verbose
```

Expected: FAIL — `JankenService.updateStreaks is not a function`

**Step 3: Implement `updateStreaks`**

Add to `app/src/service/JankenService.js`:

```javascript
// Add require at top if not already present:
const JankenRating = require("../model/application/JankenRating");

exports.updateStreaks = async function (p1UserId, p2UserId, p1Result) {
  if (p1Result === "draw") {
    return { winnerStreak: 0, loserPreviousStreak: 0, loserBounty: 0 };
  }

  const winnerId = p1Result === "win" ? p1UserId : p2UserId;
  const loserId = p1Result === "win" ? p2UserId : p1UserId;

  const [winnerRating, loserRating] = await Promise.all([
    JankenRating.findOrCreate(winnerId),
    JankenRating.findOrCreate(loserId),
  ]);

  const newStreak = winnerRating.streak + 1;
  const newMaxStreak = Math.max(newStreak, winnerRating.max_streak);
  const loserBounty = exports.calculateBounty(loserRating.streak);

  await Promise.all([
    JankenRating.update(winnerId, { streak: newStreak, max_streak: newMaxStreak }),
    JankenRating.update(loserId, { streak: 0, max_streak: loserRating.max_streak }),
  ]);

  return {
    winnerStreak: newStreak,
    loserPreviousStreak: loserRating.streak,
    loserBounty,
  };
};
```

**Step 4: Run tests to verify they pass**

```bash
cd app && yarn test -- --testPathPattern=JankenService --verbose
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add app/src/service/JankenService.js app/__tests__/service/JankenService.test.js
git commit -m "feat(janken): add streak update logic with bounty tracking"
```

---

### Task 5: Controller — Integrate Streak + Bounty into resolveMatch Flow

**Files:**
- Modify: `app/src/controller/application/JankenController.js:112-189` (the `decide` handler)
- Modify: `app/src/controller/application/JankenController.js:226-315` (the `challenge` handler)

**Step 1: Update the `decide` handler (duel mode)**

After `resolveMatch` returns (line ~170), add streak update and bounty announcer logic:

```javascript
// After: const { p1Result, betFee } = await JankenService.resolveMatch({ ... });
// Add:
const { winnerStreak, loserPreviousStreak, loserBounty } = await JankenService.updateStreaks(
  userId,
  targetUserId,
  p1Result
);

// Pay bounty if streak was broken
if (loserBounty > 0) {
  const bountyWinnerId = p1Result === "win" ? userId : targetUserId;
  await inventory.increaseGodStone({
    userId: bountyWinnerId,
    amount: loserBounty,
    note: "janken_bounty_claim",
  });
}
```

Add `inventory` import at top of file:

```javascript
const { inventory } = require("../../model/application/Inventory");
```

Update the `resultBubble` call to pass streak info:

```javascript
const resultBubble = jankenTemplate.generateResultCard({
  p1Name,
  p2Name,
  p1Choice,
  p2Choice,
  resultType: p1Result,
  winnerName,
  betAmount,
  betWinAmount,
  baseUrl,
  winnerStreak,
});
```

After `context.replyFlex(...)`, add bounty announcer messages:

```javascript
const BountySender = { name: "懸賞官", iconUrl: `${baseUrl}/assets/janken/bounty.png` };

if (p1Result !== "draw") {
  if (loserBounty > 0) {
    const breakerName = p1Result === "win" ? p1Name : p2Name;
    const holderName = p1Result === "win" ? p2Name : p1Name;
    await context.replyText(
      i18n.__("message.duel.streak_broken", {
        breakerName,
        holderName,
        streak: loserPreviousStreak,
        bounty: loserBounty,
      }),
      { sender: BountySender }
    );
  }

  const currentBounty = JankenService.calculateBounty(winnerStreak);
  if (winnerStreak >= 2) {
    await context.replyText(
      i18n.__("message.duel.streak_continue", {
        displayName: winnerName,
        streak: winnerStreak,
        bounty: currentBounty,
      }),
      { sender: BountySender }
    );
  }
}
```

**Step 2: Update the `challenge` handler (arena mode)**

Apply the same pattern after `resolveMatch` in the challenge handler (~line 287-313). The streak update and bounty announcer logic is identical — use `holderUserId` as p1 and `challengerUserId` as p2.

```javascript
// After: const { p1Result } = await JankenService.resolveMatch({ ... });
// Add:
const { winnerStreak, loserPreviousStreak, loserBounty } = await JankenService.updateStreaks(
  holderUserId,
  challengerUserId,
  p1Result
);

if (loserBounty > 0) {
  const bountyWinnerId = p1Result === "win" ? holderUserId : challengerUserId;
  await inventory.increaseGodStone({
    userId: bountyWinnerId,
    amount: loserBounty,
    note: "janken_bounty_claim",
  });
}
```

Update `generateResultCard` call to include `winnerStreak`.

Add the same announcer messages after `context.replyFlex(...)`:

```javascript
const BountySender = { name: "懸賞官", iconUrl: `${baseUrl}/assets/janken/bounty.png` };

if (p1Result !== "draw") {
  if (loserBounty > 0) {
    const breakerName = p1Result === "win" ? p1Name : p2Name;
    const holderName = p1Result === "win" ? p2Name : p1Name;
    await context.replyText(
      i18n.__("message.duel.streak_broken", {
        breakerName,
        holderName,
        streak: loserPreviousStreak,
        bounty: loserBounty,
      }),
      { sender: BountySender }
    );
  }

  const currentBounty = JankenService.calculateBounty(winnerStreak);
  if (winnerStreak >= 2) {
    await context.replyText(
      i18n.__("message.duel.streak_continue", {
        displayName: winnerName,
        streak: winnerStreak,
        bounty: currentBounty,
      }),
      { sender: BountySender }
    );
  }
}
```

**Step 3: Commit**

```bash
git add app/src/controller/application/JankenController.js
git commit -m "feat(janken): integrate streak tracking and bounty announcer into match flow"
```

---

### Task 6: Template — Show Streak on Result Card

**Files:**
- Modify: `app/src/templates/application/Janken.js:401-556` (`generateResultCard`)

**Step 1: Add `winnerStreak` parameter and streak display**

Update `generateResultCard` to accept `winnerStreak` param. After the `winnerText` line (~line 425), add streak badge to `bodyContents` when `winnerStreak >= 2`:

```javascript
// Add winnerStreak to destructured params:
exports.generateResultCard = ({
  p1Name, p2Name, p1Choice, p2Choice,
  resultType, winnerName,
  betAmount = 0, betWinAmount = 0,
  baseUrl, winnerStreak = 0,
}) => {
```

After the bet text block (around line 543), add:

```javascript
if (winnerStreak >= 2) {
  bodyContents.push({
    type: "text",
    text: `${winnerName} ${winnerStreak} 連勝中！`,
    align: "center",
    color: "#FF6B35",
    size: "sm",
    weight: "bold",
    margin: "md",
  });
}
```

**Step 2: Commit**

```bash
git add app/src/templates/application/Janken.js
git commit -m "feat(janken): display win streak on result card"
```

---

### Task 7: Bounty Icon Asset

**Files:**
- Create: `app/public/assets/janken/bounty.png`

**Step 1: Add a bounty icon**

Create or source a bounty/wanted-poster style icon for the announcer avatar. Place it at `app/public/assets/janken/bounty.png`. Size: 200x200px recommended.

**Step 2: Commit**

```bash
git add app/public/assets/janken/bounty.png
git commit -m "feat(janken): add bounty announcer icon"
```

---

### Task 8: Integration Test — Full Flow

**Step 1: Run all existing tests to confirm nothing is broken**

```bash
cd app && yarn test --verbose
```

Expected: ALL PASS

**Step 2: Manual test checklist**

- [ ] Duel: win a match -> result card shows "2 連勝中"
- [ ] Duel: win 3rd match -> announcer message with bounty amount (250)
- [ ] Duel: lose after streak -> opponent gets bounty, announcer announces
- [ ] Duel: draw -> streak not broken, no bounty message
- [ ] Arena: same streak tracking works
- [ ] Bounty caps at 10,000

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(janken): complete phase 2 streak bounty system"
```
