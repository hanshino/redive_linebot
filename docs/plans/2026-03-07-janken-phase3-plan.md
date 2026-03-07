# Janken Phase 3 — ELO Rank System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ELO-based ranking to janken duels — K-factor scales by bet amount, rank displayed in results and queryable via `/猜拳段位`.

**Architecture:** Extend existing `JankenRating` model with ELO/sub-tier helpers, add `updateElo()` to `JankenService.resolveMatch`, build rank query command and Flex Message template.

**Tech Stack:** Node.js (CommonJS), Knex/MySQL, Redis, LINE Flex Messages, Jest

---

### Task 1: Add ELO config to default.json

**Files:**
- Modify: `app/config/default.json:42-70` (inside `minigame.janken`)

**Step 1: Add elo config block**

Add after the `streak` block (line 69) inside `minigame.janken`:

```json
"elo": {
  "initial": 1000,
  "kFactorTiers": [
    { "minBet": 10000, "k": 32 },
    { "minBet": 3000, "k": 16 },
    { "minBet": 500, "k": 8 },
    { "minBet": 0, "k": 2 }
  ]
},
"rankTiers": {
  "beginner": { "name": "見習者", "minElo": 0 },
  "challenger": { "name": "挑戰者", "minElo": 1200 },
  "fighter": { "name": "鬥士", "minElo": 1400 },
  "master": { "name": "大師", "minElo": 1600 },
  "legend": { "name": "傳說", "minElo": 1800 }
}
```

**Step 2: Commit**

```bash
git add app/config/default.json
git commit -m "feat(janken): add ELO and rank tier config"
```

---

### Task 2: Extend JankenRating model with sub-tier and K-factor helpers

**Files:**
- Modify: `app/src/model/application/JankenRating.js`
- Test: `app/__tests__/model/JankenRating.test.js`

**Step 1: Write failing tests**

Add to `app/__tests__/model/JankenRating.test.js`:

```js
describe("getSubTier", () => {
  it("returns 5 for initial elo 1000 (beginner)", () => {
    expect(JankenRating.getSubTier(1000)).toBe(5);
  });

  it("returns 4 for elo 1040", () => {
    expect(JankenRating.getSubTier(1040)).toBe(4);
  });

  it("returns 1 for elo 1160+", () => {
    expect(JankenRating.getSubTier(1160)).toBe(1);
    expect(JankenRating.getSubTier(1199)).toBe(1);
  });

  it("returns 5 for elo 1200 (challenger base)", () => {
    expect(JankenRating.getSubTier(1200)).toBe(5);
  });

  it("returns 1 for elo 1360 (challenger top)", () => {
    expect(JankenRating.getSubTier(1360)).toBe(1);
  });

  it("returns 5 for elo 1800 (legend base)", () => {
    expect(JankenRating.getSubTier(1800)).toBe(5);
  });

  it("returns 1 for elo 1960+ (legend top)", () => {
    expect(JankenRating.getSubTier(1960)).toBe(1);
  });

  it("handles elo below 1000", () => {
    expect(JankenRating.getSubTier(900)).toBe(5);
  });
});

describe("getKFactor", () => {
  it("returns 2 for bet < 500", () => {
    expect(JankenRating.getKFactor(10)).toBe(2);
    expect(JankenRating.getKFactor(499)).toBe(2);
  });

  it("returns 8 for bet 500-2999", () => {
    expect(JankenRating.getKFactor(500)).toBe(8);
    expect(JankenRating.getKFactor(2999)).toBe(8);
  });

  it("returns 16 for bet 3000-9999", () => {
    expect(JankenRating.getKFactor(3000)).toBe(16);
    expect(JankenRating.getKFactor(9999)).toBe(16);
  });

  it("returns 32 for bet >= 10000", () => {
    expect(JankenRating.getKFactor(10000)).toBe(32);
    expect(JankenRating.getKFactor(50000)).toBe(32);
  });
});

describe("getRankLabel", () => {
  it("returns Chinese name with sub-tier", () => {
    expect(JankenRating.getRankLabel(1000)).toBe("見習者 5");
    expect(JankenRating.getRankLabel(1280)).toBe("挑戰者 3");
    expect(JankenRating.getRankLabel(1800)).toBe("傳說 5");
  });
});

describe("getNextTierElo", () => {
  it("returns next major tier threshold", () => {
    expect(JankenRating.getNextTierElo(1000)).toBe(1200);
    expect(JankenRating.getNextTierElo(1350)).toBe(1400);
  });

  it("returns null for legend", () => {
    expect(JankenRating.getNextTierElo(1800)).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd app && yarn test __tests__/model/JankenRating.test.js
```

Expected: FAIL — `getSubTier`, `getKFactor`, `getRankLabel`, `getNextTierElo` not defined.

**Step 3: Implement the helpers**

In `app/src/model/application/JankenRating.js`, update `RANK_TIERS` and add new functions:

```js
const config = require("config");

const RANK_TIERS = [
  { key: "beginner", name: "見習者", minElo: 0 },
  { key: "challenger", name: "挑戰者", minElo: 1200 },
  { key: "fighter", name: "鬥士", minElo: 1400 },
  { key: "master", name: "大師", minElo: 1600 },
  { key: "legend", name: "傳說", minElo: 1800 },
];

exports.getRankTier = function (elo) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANK_TIERS[i].minElo) return RANK_TIERS[i].key;
  }
  return "beginner";
};

exports.getRankInfo = function (elo) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANK_TIERS[i].minElo) return RANK_TIERS[i];
  }
  return RANK_TIERS[0];
};

exports.getSubTier = function (elo) {
  const tier = exports.getRankInfo(elo);
  const offset = Math.max(0, elo - tier.minElo);
  return 5 - Math.min(4, Math.floor(offset / 40));
};

exports.getRankLabel = function (elo) {
  const tier = exports.getRankInfo(elo);
  const subTier = exports.getSubTier(elo);
  return `${tier.name} ${subTier}`;
};

exports.getKFactor = function (betAmount) {
  const tiers = config.get("minigame.janken.elo.kFactorTiers");
  for (const tier of tiers) {
    if (betAmount >= tier.minBet) return tier.k;
  }
  return 2;
};

exports.getNextTierElo = function (elo) {
  const currentKey = exports.getRankTier(elo);
  const idx = RANK_TIERS.findIndex(t => t.key === currentKey);
  if (idx >= RANK_TIERS.length - 1) return null;
  return RANK_TIERS[idx + 1].minElo;
};

exports.getRankImageKey = function (elo) {
  return `rank_${exports.getRankTier(elo)}`;
};
```

**Step 4: Run tests to verify they pass**

```bash
cd app && yarn test __tests__/model/JankenRating.test.js
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add app/src/model/application/JankenRating.js app/__tests__/model/JankenRating.test.js
git commit -m "feat(janken): add sub-tier, K-factor, rank label helpers to JankenRating"
```

---

### Task 3: Add ELO calculation to JankenService

**Files:**
- Modify: `app/src/service/JankenService.js`
- Test: `app/__tests__/service/JankenService.test.js`

**Step 1: Write failing tests**

Add to `app/__tests__/service/JankenService.test.js`:

```js
describe("calculateExpectedWinRate", () => {
  it("returns 0.5 for equal ratings", () => {
    expect(JankenService.calculateExpectedWinRate(1000, 1000)).toBeCloseTo(0.5);
  });

  it("returns higher rate for higher-rated player", () => {
    const rate = JankenService.calculateExpectedWinRate(1400, 1000);
    expect(rate).toBeGreaterThan(0.5);
    expect(rate).toBeLessThan(1);
  });

  it("returns lower rate for lower-rated player", () => {
    const rate = JankenService.calculateExpectedWinRate(1000, 1400);
    expect(rate).toBeLessThan(0.5);
    expect(rate).toBeGreaterThan(0);
  });
});

describe("calculateEloChange", () => {
  it("returns positive change for winner with equal elo", () => {
    const change = JankenService.calculateEloChange(1000, 1000, "win", 1000);
    expect(change).toBe(4); // K=8 for bet 1000, 8 * (1 - 0.5) = 4
  });

  it("returns negative change for loser with equal elo", () => {
    const change = JankenService.calculateEloChange(1000, 1000, "lose", 1000);
    expect(change).toBe(-4);
  });

  it("returns 0 for draw", () => {
    const change = JankenService.calculateEloChange(1000, 1000, "draw", 1000);
    expect(change).toBe(0);
  });

  it("winner gains less when much higher rated", () => {
    const change = JankenService.calculateEloChange(1400, 1000, "win", 1000);
    expect(change).toBeLessThan(4);
    expect(change).toBeGreaterThan(0);
  });

  it("loser loses more when much higher rated", () => {
    const change = JankenService.calculateEloChange(1400, 1000, "lose", 1000);
    expect(change).toBeLessThan(-4);
  });

  it("scales with bet amount K-factor", () => {
    const lowBet = JankenService.calculateEloChange(1000, 1000, "win", 100);
    const highBet = JankenService.calculateEloChange(1000, 1000, "win", 10000);
    expect(highBet).toBeGreaterThan(lowBet);
    expect(lowBet).toBe(1); // K=2, 2 * 0.5 = 1
    expect(highBet).toBe(16); // K=32, 32 * 0.5 = 16
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd app && yarn test __tests__/service/JankenService.test.js
```

Expected: FAIL — `calculateExpectedWinRate`, `calculateEloChange` not defined.

**Step 3: Implement ELO calculation functions**

Add to `app/src/service/JankenService.js`:

```js
exports.calculateExpectedWinRate = function (myElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
};

exports.calculateEloChange = function (myElo, opponentElo, result, betAmount) {
  if (result === "draw") return 0;
  const K = JankenRating.getKFactor(betAmount);
  const expected = exports.calculateExpectedWinRate(myElo, opponentElo);
  const actual = result === "win" ? 1 : 0;
  return Math.round(K * (actual - expected));
};
```

**Step 4: Run tests to verify they pass**

```bash
cd app && yarn test __tests__/service/JankenService.test.js
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add app/src/service/JankenService.js app/__tests__/service/JankenService.test.js
git commit -m "feat(janken): add ELO calculation functions"
```

---

### Task 4: Integrate ELO updates into resolveMatch

**Files:**
- Modify: `app/src/service/JankenService.js` — `resolveMatch` function (line 156-226)
- Modify: `app/src/service/JankenService.js` — add `updateElo` function

**Step 1: Add `updateElo` function to JankenService**

After `calculateEloChange`, add:

```js
exports.updateElo = async function (p1UserId, p2UserId, p1Result, betAmount) {
  if (p1Result === "draw" || !betAmount || betAmount <= 0) {
    return { p1EloChange: 0, p2EloChange: 0, p1NewElo: null, p2NewElo: null };
  }

  const mysql = require("../util/mysql");

  return mysql.transaction(async trx => {
    await Promise.all([
      JankenRating.findOrCreate(p1UserId, trx),
      JankenRating.findOrCreate(p2UserId, trx),
    ]);

    const [p1Rating, p2Rating] = await Promise.all([
      trx("janken_rating").where({ user_id: p1UserId }).forUpdate().first(),
      trx("janken_rating").where({ user_id: p2UserId }).forUpdate().first(),
    ]);

    const p1EloChange = exports.calculateEloChange(p1Rating.elo, p2Rating.elo, p1Result, betAmount);
    const p2Result = p1Result === "win" ? "lose" : "win";
    const p2EloChange = exports.calculateEloChange(p2Rating.elo, p1Rating.elo, p2Result, betAmount);

    const p1NewElo = Math.max(0, p1Rating.elo + p1EloChange);
    const p2NewElo = Math.max(0, p2Rating.elo + p2EloChange);

    const winKey = p1Result === "win" ? "win_count" : "lose_count";
    const loseKey = p1Result === "win" ? "lose_count" : "win_count";

    await Promise.all([
      trx("janken_rating").where({ user_id: p1UserId }).update({
        elo: p1NewElo,
        rank_tier: JankenRating.getRankTier(p1NewElo),
        [winKey]: trx.raw(`${winKey} + 1`),
      }),
      trx("janken_rating").where({ user_id: p2UserId }).update({
        elo: p2NewElo,
        rank_tier: JankenRating.getRankTier(p2NewElo),
        [loseKey]: trx.raw(`${loseKey} + 1`),
      }),
    ]);

    return {
      p1EloChange,
      p2EloChange,
      p1NewElo,
      p2NewElo,
      p1RankLabel: JankenRating.getRankLabel(p1NewElo),
      p2RankLabel: JankenRating.getRankLabel(p2NewElo),
    };
  });
};
```

**Step 2: Update `resolveMatch` return value**

In `resolveMatch` (line 156), after the existing `EventCenterService.add` calls, before the `return` statement, add:

```js
const eloResult = await exports.updateElo(p1UserId, p2UserId, p1Result, betAmount);
```

Change the return to:

```js
return { p1Result, p2Result, p1Choice, p2Choice, betFee, ...eloResult };
```

**Step 3: Also update draw counts**

In `updateElo`, handle draw for win/lose/draw count tracking. Add a separate path at the top:

```js
if (p1Result === "draw") {
  if (betAmount > 0) {
    const mysql = require("../util/mysql");
    await mysql.transaction(async trx => {
      await Promise.all([
        JankenRating.findOrCreate(p1UserId, trx),
        JankenRating.findOrCreate(p2UserId, trx),
      ]);
      await Promise.all([
        trx("janken_rating").where({ user_id: p1UserId }).update({ draw_count: trx.raw("draw_count + 1") }),
        trx("janken_rating").where({ user_id: p2UserId }).update({ draw_count: trx.raw("draw_count + 1") }),
      ]);
    });
  }
  return { p1EloChange: 0, p2EloChange: 0, p1NewElo: null, p2NewElo: null };
}
```

**Step 4: Run all tests**

```bash
cd app && yarn test
```

**Step 5: Commit**

```bash
git add app/src/service/JankenService.js
git commit -m "feat(janken): integrate ELO updates into resolveMatch"
```

---

### Task 5: Pass ELO data through controller to result card

**Files:**
- Modify: `app/src/controller/application/JankenController.js`

**Step 1: Update `decide` handler (line 118)**

After `resolveMatch` call (line 169), extract ELO data:

```js
const { p1Result, betFee, p1EloChange, p2EloChange, p1NewElo, p2NewElo } = matchResult;
```

Pass to `generateResultCard`:

```js
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
  p1EloChange,
  p2EloChange,
  p1NewElo,
  p2NewElo,
});
```

**Step 2: Update `challenge` handler (line 271)**

Same pattern — extract ELO data from `arenaMatchResult` and pass to `generateResultCard`. Note: arena has `betAmount: 0` so ELO values will be null/0.

**Step 3: Commit**

```bash
git add app/src/controller/application/JankenController.js
git commit -m "feat(janken): pass ELO data to result card template"
```

---

### Task 6: Update result card template with rank display

**Files:**
- Modify: `app/src/templates/application/Janken.js` — `generateResultCard` function (line 401)

**Step 1: Update `generateResultCard` signature**

Add new params: `p1EloChange`, `p2EloChange`, `p1NewElo`, `p2NewElo`.

**Step 2: Add rank icon next to player names**

Import `JankenRating` at the top:

```js
const JankenRating = require("../../model/application/JankenRating");
```

When `p1NewElo` is not null, add rank icon image above each player's name in the result card, and add ELO change text at the bottom.

For each player column, add rank icon:

```js
{
  type: "image",
  url: `${baseUrl}/assets/janken/${JankenRating.getRankImageKey(p1NewElo)}.png`,
  size: "40px",
  aspectMode: "fit",
}
```

Add rank label below the name:

```js
{
  type: "text",
  text: JankenRating.getRankLabel(p1NewElo),
  align: "center",
  color: "#B0B0B0",
  size: "xxs",
}
```

**Step 3: Add ELO change line at bottom**

After the winner text and bet text, when `p1NewElo` is not null:

```js
if (p1NewElo !== null && p1NewElo !== undefined) {
  const p1Sign = p1EloChange >= 0 ? "+" : "";
  const p2Sign = p2EloChange >= 0 ? "+" : "";
  bodyContents.push({
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: `${p1Name}: ${p1Sign}${p1EloChange}`,
        align: "center",
        color: p1EloChange >= 0 ? "#4CAF50" : "#F44336",
        size: "xs",
        flex: 1,
      },
      {
        type: "text",
        text: `${p2Name}: ${p2Sign}${p2EloChange}`,
        align: "center",
        color: p2EloChange >= 0 ? "#4CAF50" : "#F44336",
        size: "xs",
        flex: 1,
      },
    ],
    margin: "md",
  });
}
```

**Step 4: Commit**

```bash
git add app/src/templates/application/Janken.js
git commit -m "feat(janken): display rank icons and ELO changes in result card"
```

---

### Task 7: Add `/猜拳段位` command — rank query template

**Files:**
- Modify: `app/src/templates/application/Janken.js` — add `generateRankCard` function

**Step 1: Implement `generateRankCard`**

```js
exports.generateRankCard = ({
  rankLabel,
  rankImageKey,
  elo,
  winCount,
  loseCount,
  drawCount,
  winRate,
  streak,
  maxStreak,
  bounty,
  eloToNext,
  serverRank,
  maxBet,
  baseUrl,
}) => {
  const bodyContents = [
    // Rank icon
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "filler" },
        {
          type: "image",
          url: `${baseUrl}/assets/janken/${rankImageKey}.png`,
          size: "100px",
          aspectMode: "fit",
          flex: 0,
        },
        { type: "filler" },
      ],
    },
    // Rank label + ELO
    {
      type: "text",
      text: rankLabel,
      align: "center",
      color: "#FFD700",
      weight: "bold",
      size: "xl",
    },
    {
      type: "text",
      text: `ELO: ${elo}`,
      align: "center",
      color: "#B0B0B0",
      size: "sm",
    },
    // Separator
    { type: "separator", color: "#3d3d6e", margin: "lg" },
    // Stats
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `${winCount} 勝`, align: "center", color: "#4CAF50", size: "sm", flex: 1 },
        { type: "text", text: `${loseCount} 敗`, align: "center", color: "#F44336", size: "sm", flex: 1 },
        { type: "text", text: `${drawCount} 平`, align: "center", color: "#4FC3F7", size: "sm", flex: 1 },
      ],
      margin: "lg",
    },
    {
      type: "text",
      text: `勝率：${winRate}%`,
      align: "center",
      color: "#ffffff",
      size: "sm",
      margin: "sm",
    },
    // Streak
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `連勝：${streak}`, align: "center", color: "#FF6B35", size: "sm", flex: 1 },
        { type: "text", text: `最高：${maxStreak}`, align: "center", color: "#FF6B35", size: "sm", flex: 1 },
      ],
      margin: "sm",
    },
    // Separator
    { type: "separator", color: "#3d3d6e", margin: "lg" },
    // Details
    {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "懸賞金", color: "#B0B0B0", size: "xs", flex: 1 },
            { type: "text", text: `${bounty} 女神石`, color: "#ffffff", size: "xs", align: "end", flex: 2 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "最大下注", color: "#B0B0B0", size: "xs", flex: 1 },
            { type: "text", text: `${maxBet} 女神石`, color: "#ffffff", size: "xs", align: "end", flex: 2 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "全服排名", color: "#B0B0B0", size: "xs", flex: 1 },
            { type: "text", text: `第 ${serverRank} 名`, color: "#ffffff", size: "xs", align: "end", flex: 2 },
          ],
        },
        ...(eloToNext !== null
          ? [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "距下一段位", color: "#B0B0B0", size: "xs", flex: 1 },
                  { type: "text", text: `還差 ${eloToNext} 分`, color: "#FFD700", size: "xs", align: "end", flex: 2 },
                ],
              },
            ]
          : []),
      ],
      margin: "lg",
      spacing: "sm",
    },
  ];

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1a1a2e",
      contents: bodyContents,
      paddingAll: "lg",
      spacing: "sm",
    },
  };
};
```

**Step 2: Commit**

```bash
git add app/src/templates/application/Janken.js
git commit -m "feat(janken): add generateRankCard template"
```

---

### Task 8: Add server rank query to JankenRating model

**Files:**
- Modify: `app/src/model/application/JankenRating.js`

**Step 1: Add `getServerRank` function**

```js
exports.getServerRank = async function (userId) {
  const result = await mysql.raw(
    `SELECT COUNT(*) + 1 AS rank_position FROM ${TABLE} WHERE elo > (SELECT elo FROM ${TABLE} WHERE user_id = ?)`,
    [userId]
  );
  return result[0]?.[0]?.rank_position || 1;
};
```

**Step 2: Commit**

```bash
git add app/src/model/application/JankenRating.js
git commit -m "feat(janken): add server rank query"
```

---

### Task 9: Add `/猜拳段位` route in controller

**Files:**
- Modify: `app/src/controller/application/JankenController.js`

**Step 1: Add route**

In `exports.router` array (line 16), add:

```js
text(/^[.#/](猜拳段位|猜拳rank)/, queryRank),
```

**Step 2: Implement `queryRank` handler**

```js
async function queryRank(context) {
  const { userId } = context.event.source;

  if (!userId) {
    return;
  }

  const rating = await JankenRating.findOrCreate(userId);
  const rankLabel = JankenRating.getRankLabel(rating.elo);
  const rankImageKey = JankenRating.getRankImageKey(rating.elo);
  const rankTier = JankenRating.getRankTier(rating.elo);
  const maxBet = JankenRating.getMaxBet(rankTier);
  const nextTierElo = JankenRating.getNextTierElo(rating.elo);
  const eloToNext = nextTierElo !== null ? nextTierElo - rating.elo : null;
  const serverRank = await JankenRating.getServerRank(userId);

  const totalGames = rating.win_count + rating.lose_count + rating.draw_count;
  const winRate = totalGames > 0 ? Math.round((rating.win_count / totalGames) * 100) : 0;

  const rankCard = jankenTemplate.generateRankCard({
    rankLabel,
    rankImageKey,
    elo: rating.elo,
    winCount: rating.win_count,
    loseCount: rating.lose_count,
    drawCount: rating.draw_count,
    winRate,
    streak: rating.streak,
    maxStreak: rating.max_streak,
    bounty: rating.bounty,
    eloToNext,
    serverRank,
    maxBet,
    baseUrl,
  });

  await context.replyFlex("猜拳段位", rankCard);
}
```

**Step 3: Commit**

```bash
git add app/src/controller/application/JankenController.js
git commit -m "feat(janken): add /猜拳段位 rank query command"
```

---

### Task 10: Add i18n strings

**Files:**
- Modify: `app/locales/zh_tw.json`

**Step 1: Add rank-related strings**

Inside `"duel"` object (line 127), add:

```json
"rank_query_not_found": "你還沒有猜拳記錄，快去挑戰吧！",
"elo_change": "ELO: {{ before }} → {{ after }} ({{ change }})"
```

**Step 2: Commit**

```bash
git add app/locales/zh_tw.json
git commit -m "feat(janken): add rank i18n strings"
```

---

### Task 11: Run full test suite and manual verification

**Step 1: Run all tests**

```bash
cd app && yarn test
```

Expected: ALL PASS

**Step 2: Verify no lint errors**

```bash
cd app && yarn lint
```

**Step 3: Final commit if any fixes needed**

---

## Summary of all tasks

| # | Task | Files |
|---|------|-------|
| 1 | Add ELO config | `default.json` |
| 2 | Sub-tier + K-factor helpers | `JankenRating.js` + test |
| 3 | ELO calculation functions | `JankenService.js` + test |
| 4 | Integrate ELO into resolveMatch | `JankenService.js` |
| 5 | Pass ELO data through controller | `JankenController.js` |
| 6 | Update result card template | `Janken.js` template |
| 7 | Rank query card template | `Janken.js` template |
| 8 | Server rank query | `JankenRating.js` |
| 9 | `/猜拳段位` route | `JankenController.js` |
| 10 | i18n strings | `zh_tw.json` |
| 11 | Full test + lint | all |
