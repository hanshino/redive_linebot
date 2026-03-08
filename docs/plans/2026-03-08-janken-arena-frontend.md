# Janken Arena Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/janken` page with a battle feed marquee and ELO leaderboard, plus store user display names in the DB for efficient querying.

**Architecture:** Three migrations: (1) add `display_name` to `User` table, (2) add match detail columns to `janken_records`, (3) add `display_name` fillable to `janken_rating`. Profile middleware updates `User.display_name` on every webhook. Two new public API endpoints serve ranking and recent match data via JOINs against `User` table — no LINE API calls needed. `resolveMatch` is refactored to include `updateStreaks` and persist match details. React page with `BattleFeed` (single-card fade transition, 30s polling) and `RankingList` (top 20 cards).

**Tech Stack:** Knex migration, Express routes, React 19, MUI v7, CSS transitions.

---

### Task 1: Migration — add display_name to User table

**Files:**
- Create: `app/migrations/YYYYMMDD_add_display_name_to_user.js`

**Step 1: Create migration**

```bash
cd app && yarn knex migrate:make add_display_name_to_user
```

**Step 2: Write migration code**

```javascript
exports.up = function (knex) {
  return knex.schema.alterTable("User", table => {
    table.string("display_name", 100).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("User", table => {
    table.dropColumn("display_name");
  });
};
```

**Step 3: Commit**

```bash
git add app/migrations/*add_display_name_to_user*
git commit -m "feat: add display_name column to User table"
```

---

### Task 2: Migration — add match detail columns to janken_records

**Files:**
- Create: `app/migrations/YYYYMMDD_add_match_details_to_janken_records.js`

**Step 1: Create migration**

```bash
cd app && yarn knex migrate:make add_match_details_to_janken_records
```

**Step 2: Write migration code**

```javascript
exports.up = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table.string("p1_choice", 10).nullable();
    table.string("p2_choice", 10).nullable();
    table.integer("elo_change").nullable();
    table.integer("streak_broken").nullable();
    table.integer("bounty_won").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table.dropColumn("p1_choice");
    table.dropColumn("p2_choice");
    table.dropColumn("elo_change");
    table.dropColumn("streak_broken");
    table.dropColumn("bounty_won");
  });
};
```

**Step 3: Run both migrations**

```bash
cd app && yarn migrate
```

Expected: Both migrations complete successfully.

**Step 4: Commit**

```bash
git add app/migrations/*add_match_details*
git commit -m "feat(janken): add match detail columns to janken_records"
```

---

### Task 3: Update UserModel — add updateDisplayName method

**Files:**
- Modify: `app/src/model/application/UserModel.js`

**Step 1: Add method**

Add to the bottom of `app/src/model/application/UserModel.js`:

```javascript
exports.updateDisplayName = async (platformId, displayName) => {
  return mysql(USER_TABLE).where({ platformId }).update({ display_name: displayName });
};
```

**Step 2: Commit**

```bash
git add app/src/model/application/UserModel.js
git commit -m "feat: add updateDisplayName to UserModel"
```

---

### Task 4: Update profile middleware — persist display_name on webhook

**Files:**
- Modify: `app/src/middleware/profile.js`

**Step 1: Update setLineProfile function**

In `app/src/middleware/profile.js`, modify the `setLineProfile` function to also update the display name in the DB. After setting the state, call `UserModel.updateDisplayName`:

```javascript
function setLineProfile(context) {
  const { userDatas } = context.state;
  const { userId } = context.event.source;

  if (Object.prototype.hasOwnProperty.call(userDatas, userId) === true) return;

  return context.getUserProfile().then(profile => {
    let temp = { ...userDatas };
    temp[userId] = profile;
    context.setState({
      userDatas: temp,
    });

    // Best-effort update display_name in DB
    if (profile.displayName) {
      UserModel.updateDisplayName(userId, profile.displayName).catch(() => {});
    }
  });
}
```

**Step 2: Run tests**

```bash
cd app && yarn test
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git add app/src/middleware/profile.js
git commit -m "feat: persist user display_name to DB on webhook"
```

---

### Task 5: Update JankenRecords model — add new fillable fields + getRecentMatches

**Files:**
- Modify: `app/src/model/application/JankenRecords.js`
- Create: `app/__tests__/model/JankenRecords.test.js`

**Step 1: Write the failing test**

Create `app/__tests__/model/JankenRecords.test.js`:

```javascript
const JankenRecords = require("../../src/model/application/JankenRecords");

jest.mock("../../src/util/mysql", () => {
  const mockQuery = {
    select: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    then: jest.fn(),
  };
  const knex = jest.fn(() => mockQuery);
  knex.raw = jest.fn(val => val);
  knex.__mockQuery = mockQuery;
  return knex;
});

describe("JankenRecords", () => {
  describe("getRecentMatches", () => {
    it("should be a function", () => {
      expect(typeof JankenRecords.getRecentMatches).toBe("function");
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd app && yarn test __tests__/model/JankenRecords.test.js
```

Expected: FAIL — `JankenRecords.getRecentMatches` is not a function.

**Step 3: Update model**

In `app/src/model/application/JankenRecords.js`:

Add to `fillable` array: `"p1_choice"`, `"p2_choice"`, `"elo_change"`, `"streak_broken"`, `"bounty_won"`.

Add new method at bottom:

```javascript
exports.getRecentMatches = async (limit = 20) => {
  return await mysql(TABLE)
    .select(
      `${TABLE}.id`,
      `${TABLE}.user_id as p1_user_id`,
      `${TABLE}.target_user_id as p2_user_id`,
      `${TABLE}.p1_choice`,
      `${TABLE}.p2_choice`,
      `${TABLE}.bet_amount`,
      `${TABLE}.elo_change`,
      `${TABLE}.streak_broken`,
      `${TABLE}.bounty_won`,
      `${TABLE}.created_at`,
      "r1.result as p1_result",
      "r2.result as p2_result",
      "u1.display_name as p1_display_name",
      "u2.display_name as p2_display_name"
    )
    .join("janken_result as r1", function () {
      this.on("r1.record_id", "=", `${TABLE}.id`).andOn(
        "r1.user_id",
        "=",
        `${TABLE}.user_id`
      );
    })
    .join("janken_result as r2", function () {
      this.on("r2.record_id", "=", `${TABLE}.id`).andOn(
        "r2.user_id",
        "=",
        `${TABLE}.target_user_id`
      );
    })
    .join("User as u1", "u1.platformId", `${TABLE}.user_id`)
    .join("User as u2", "u2.platformId", `${TABLE}.target_user_id`)
    .whereNotNull(`${TABLE}.p1_choice`)
    .orderBy(`${TABLE}.created_at`, "desc")
    .limit(limit);
};
```

**Note:** Use LEFT JOIN if users might not exist in User table. But since profile middleware creates User records, INNER JOIN should be safe.

**Step 4: Run test**

```bash
cd app && yarn test __tests__/model/JankenRecords.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add app/src/model/application/JankenRecords.js app/__tests__/model/JankenRecords.test.js
git commit -m "feat(janken): add getRecentMatches with User JOIN to JankenRecords"
```

---

### Task 6: Update JankenRating model — add getTopRankings with User JOIN

**Files:**
- Modify: `app/src/model/application/JankenRating.js`
- Modify: `app/__tests__/model/JankenRating.test.js`

**Step 1: Write the failing test**

Add to `app/__tests__/model/JankenRating.test.js`:

```javascript
describe("getTopRankings", () => {
  it("should be a function", () => {
    const JankenRating = require("../../src/model/application/JankenRating");
    expect(typeof JankenRating.getTopRankings).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd app && yarn test __tests__/model/JankenRating.test.js
```

Expected: FAIL

**Step 3: Add getTopRankings**

Add to bottom of `app/src/model/application/JankenRating.js`:

```javascript
exports.getTopRankings = async function (limit = 20) {
  return mysql(TABLE)
    .select(`${TABLE}.*`, "User.display_name")
    .join("User", "User.platformId", `${TABLE}.user_id`)
    .orderBy("elo", "desc")
    .limit(limit);
};
```

**Step 4: Run test**

```bash
cd app && yarn test __tests__/model/JankenRating.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add app/src/model/application/JankenRating.js app/__tests__/model/JankenRating.test.js
git commit -m "feat(janken): add getTopRankings with User JOIN"
```

---

### Task 7: Update JankenService.resolveMatch — persist match details + absorb updateStreaks

**Files:**
- Modify: `app/src/service/JankenService.js`

**Step 1: Modify resolveMatch**

In `app/src/service/JankenService.js`, update `resolveMatch`:

1. Add `p1Choice` and `p2Choice` to the `JankenRecords.create` call:

```javascript
await JankenRecords.create({
  id: matchId,
  user_id: p1UserId,
  target_user_id: p2UserId,
  group_id: groupId,
  bet_amount: betAmount,
  bet_fee: betFee,
  p1_choice: p1Choice,
  p2_choice: p2Choice,
});
```

2. After `updateElo`, call `updateStreaks` and persist match details:

```javascript
const eloResult = await exports.updateElo(p1UserId, p2UserId, p1Result, betAmount);
const streakResult = await exports.updateStreaks(p1UserId, p2UserId, p1Result, { betAmount });

// Persist match details for frontend leaderboard
const matchDetails = {};
if (p1Result !== "draw") {
  matchDetails.elo_change = p1Result === "win" ? eloResult.p1EloChange : eloResult.p2EloChange;
}
if (streakResult.loserPreviousStreak > 0) {
  matchDetails.streak_broken = streakResult.loserPreviousStreak;
}
if (streakResult.loserBounty > 0) {
  matchDetails.bounty_won = streakResult.loserBounty;
}
if (Object.keys(matchDetails).length > 0) {
  await JankenRecords.update(matchId, matchDetails);
}

return { p1Result, p2Result, p1Choice, p2Choice, betFee, ...eloResult, ...streakResult };
```

**Step 2: Update JankenController — remove duplicate updateStreaks calls**

In `app/src/controller/application/JankenController.js`:

The `resolveMatch` return value now includes streak data (`winnerStreak`, `winnerBounty`, `loserPreviousStreak`, `loserBounty`).

At **line ~241** (in `decide` function), remove:
```javascript
const { winnerStreak, winnerBounty, loserPreviousStreak, loserBounty } =
    await JankenService.updateStreaks(userId, targetUserId, p1Result, { betAmount });
```

Replace with destructuring from the existing `matchResult`:
```javascript
const { winnerStreak, winnerBounty, loserPreviousStreak, loserBounty } = matchResult;
```

Do the same at **line ~402** (in `challenge` function), remove:
```javascript
const { winnerStreak, winnerBounty, loserPreviousStreak, loserBounty } =
      await JankenService.updateStreaks(holderUserId, challengerUserId, p1Result);
```

Replace with:
```javascript
const { winnerStreak, winnerBounty, loserPreviousStreak, loserBounty } = arenaMatchResult;
```

**Step 3: Run tests**

```bash
cd app && yarn test
```

Expected: All tests pass. Some existing tests may need mock updates for the new `JankenRecords.create` fields and `resolveMatch` return shape.

**Step 4: Commit**

```bash
git add app/src/service/JankenService.js app/src/controller/application/JankenController.js
git commit -m "feat(janken): persist match details in resolveMatch and remove duplicate updateStreaks"
```

---

### Task 8: Add API controller methods + routes

**Files:**
- Modify: `app/src/controller/application/JankenController.js`
- Modify: `app/src/router/api.js`

**Step 1: Add API methods to JankenController**

Add at the bottom of `app/src/controller/application/JankenController.js`:

```javascript
exports.api = {};

exports.api.rankings = async (req, res) => {
  try {
    const JankenRating = require("../../model/application/JankenRating");
    const ratings = await JankenRating.getTopRankings(20);

    const result = ratings.map((r, index) => {
      const total = r.win_count + r.lose_count + r.draw_count;
      const winRate = total > 0 ? Math.round((r.win_count / total) * 1000) / 10 : 0;

      return {
        rank: index + 1,
        displayName: r.display_name || `玩家${index + 1}`,
        rankLabel: JankenRating.getRankLabel(r.elo),
        rankTier: r.rank_tier,
        elo: r.elo,
        winCount: r.win_count,
        loseCount: r.lose_count,
        drawCount: r.draw_count,
        winRate,
        streak: r.streak,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[Janken Rankings API]", err);
    res.status(500).json({ message: "Failed to fetch rankings" });
  }
};

exports.api.recentMatches = async (req, res) => {
  try {
    const JankenRecords = require("../../model/application/JankenRecords");
    const matches = await JankenRecords.getRecentMatches(20);
    const resultMap = { 1: "win", 2: "lose", 0: "draw" };
    const choiceMap = { rock: "石頭", paper: "布", scissors: "剪刀" };

    const result = matches.map(m => ({
      id: m.id,
      player1: {
        displayName: m.p1_display_name || "未知玩家",
        choice: choiceMap[m.p1_choice] || m.p1_choice,
        result: resultMap[m.p1_result] || "draw",
      },
      player2: {
        displayName: m.p2_display_name || "未知玩家",
        choice: choiceMap[m.p2_choice] || m.p2_choice,
        result: resultMap[m.p2_result] || "draw",
      },
      betAmount: m.bet_amount || 0,
      eloChange: m.elo_change || 0,
      streakBroken: m.streak_broken || null,
      bountyWon: m.bounty_won || null,
      createdAt: m.created_at,
    }));

    res.json(result);
  } catch (err) {
    console.error("[Janken Recent Matches API]", err);
    res.status(500).json({ message: "Failed to fetch recent matches" });
  }
};
```

**Note:** Check existing imports in JankenController.js — if `JankenRecords` or `JankenRating` are already imported at the top, use those instead of inline requires.

**Step 2: Register routes**

In `app/src/router/api.js`, add before `router.all("*", ...)` (line 354):

```javascript
const JankenController = require("../controller/application/JankenController");

router.get("/janken/rankings", JankenController.api.rankings);
router.get("/janken/recent-matches", JankenController.api.recentMatches);
```

**Step 3: Run tests**

```bash
cd app && yarn test
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add app/src/controller/application/JankenController.js app/src/router/api.js
git commit -m "feat(janken): add rankings and recent-matches API endpoints"
```

---

### Task 9: Frontend — janken API service

**Files:**
- Create: `frontend/src/services/janken.js`

**Step 1: Create service file**

```javascript
import api from "./api";

export const getRankings = () => api.get("/api/janken/rankings").then(r => r.data);
export const getRecentMatches = () => api.get("/api/janken/recent-matches").then(r => r.data);
```

**Step 2: Commit**

```bash
git add frontend/src/services/janken.js
git commit -m "feat(janken): add frontend janken API service"
```

---

### Task 10: Frontend — BattleFeed component

**Files:**
- Create: `frontend/src/pages/Janken/BattleFeed.jsx`

**Step 1: Create BattleFeed component**

```jsx
import { useState, useEffect, useRef } from "react";
import { Box, Card, Typography, Skeleton, useMediaQuery } from "@mui/material";

const BORDER_COLORS = {
  normal: "primary.main",
  streakBroken: "error.main",
  highStakes: "warning.main",
  draw: "grey.500",
};

function getCardType(match) {
  if (match.streakBroken) return "streakBroken";
  if (match.betAmount >= 10000) return "highStakes";
  if (match.player1.result === "draw") return "draw";
  return "normal";
}

function getResultText(match) {
  const { player1, player2 } = match;

  if (player1.result === "draw") {
    return `${player1.displayName} ${player1.choice} vs ${player2.choice} ${player2.displayName}｜平手`;
  }

  const winner = player1.result === "win" ? player1 : player2;
  const loser = player1.result === "win" ? player2 : player1;

  let text = `${winner.displayName} ${winner.choice} vs ${loser.choice} ${loser.displayName}｜${winner.displayName} 勝`;

  if (match.eloChange) {
    text += `｜+${match.eloChange} 分`;
  }

  return text;
}

function getSubText(match) {
  if (match.streakBroken) {
    return `終結 ${match.streakBroken} 連勝！獵殺懸賞 ${match.bountyWon?.toLocaleString() || 0}`;
  }
  if (match.betAmount > 0 && match.player1.result !== "draw") {
    const winnerGets = Math.floor(match.betAmount * 2 * 0.9);
    return `贏得 ${winnerGets.toLocaleString()} 女神石`;
  }
  return null;
}

export default function BattleFeed({ matches, loading }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Reset index when matches data changes
  useEffect(() => {
    setCurrentIndex(0);
    setVisible(true);
  }, [matches]);

  useEffect(() => {
    if (!matches || matches.length === 0) return;
    // Respect prefers-reduced-motion: no auto-rotation
    if (prefersReducedMotion) return;

    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % matches.length);
        setVisible(true);
      }, 400);
    }, 3500);

    return () => clearInterval(timerRef.current);
  }, [matches, prefersReducedMotion]);

  if (loading) {
    return <Skeleton variant="rounded" height={80} sx={{ mb: 3 }} />;
  }

  if (!matches || matches.length === 0) {
    return (
      <Card sx={{ p: 2, mb: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          尚無對戰紀錄
        </Typography>
      </Card>
    );
  }

  const safeIndex = currentIndex < matches.length ? currentIndex : 0;
  const match = matches[safeIndex];
  const cardType = getCardType(match);
  const subText = getSubText(match);

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        戰況播報
      </Typography>
      <Card
        aria-live="polite"
        aria-atomic="true"
        sx={{
          p: 2,
          borderLeft: 4,
          borderColor: BORDER_COLORS[cardType],
          opacity: prefersReducedMotion ? 1 : visible ? 1 : 0,
          transition: prefersReducedMotion ? "none" : "opacity 0.4s ease-in-out",
          minHeight: 72,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: cardType === "draw" ? 400 : 600,
            color: cardType === "draw" ? "text.secondary" : "text.primary",
          }}
        >
          {getResultText(match)}
        </Typography>
        {subText && (
          <Typography
            variant="caption"
            sx={{
              color: cardType === "streakBroken" ? "error.main" : "text.secondary",
              fontWeight: cardType === "streakBroken" ? 600 : 400,
              mt: 0.5,
              display: "block",
            }}
          >
            {subText}
          </Typography>
        )}
      </Card>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Janken/BattleFeed.jsx
git commit -m "feat(janken): add BattleFeed component with fade transition"
```

---

### Task 11: Frontend — RankingList component

**Files:**
- Create: `frontend/src/pages/Janken/RankingList.jsx`

**Step 1: Create RankingList component**

```jsx
import { Box, Card, Typography, Skeleton, Stack, Chip } from "@mui/material";

const MEDAL_COLORS = {
  1: "#FFD700",
  2: "#C0C0C0",
  3: "#CD7F32",
};

const TIER_COLORS = {
  beginner: "default",
  challenger: "info",
  fighter: "success",
  master: "warning",
  legend: "error",
};

export default function RankingList({ rankings, loading }) {
  if (loading) {
    return (
      <Stack spacing={1}>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} variant="rounded" height={64} />
        ))}
      </Stack>
    );
  }

  if (!rankings || rankings.length === 0) {
    return (
      <Card sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          尚無排名資料
        </Typography>
      </Card>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        ELO 排行榜
      </Typography>
      <Stack spacing={1}>
        {rankings.map(player => {
          const isTop3 = player.rank <= 3;
          const medalColor = MEDAL_COLORS[player.rank];

          return (
            <Card
              key={player.rank}
              sx={{
                p: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                borderLeft: isTop3 ? 4 : 0,
                borderColor: medalColor || "transparent",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  width: 36,
                  textAlign: "center",
                  fontWeight: 700,
                  color: medalColor || "text.secondary",
                }}
              >
                {player.rank}
              </Typography>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {player.displayName}
                  </Typography>
                  <Chip
                    label={player.rankLabel}
                    size="small"
                    color={TIER_COLORS[player.rankTier] || "default"}
                    variant="outlined"
                    sx={{ fontSize: "0.75rem", height: 22 }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {player.winCount}勝 {player.loseCount}負 {player.drawCount}平
                  {" / "}
                  勝率 {player.winRate}%
                  {player.streak > 0 && ` / ${player.streak} 連勝`}
                </Typography>
              </Box>

              <Typography
                variant="body2"
                sx={{ fontWeight: 700, color: "primary.main", whiteSpace: "nowrap" }}
              >
                {player.elo}
              </Typography>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Janken/RankingList.jsx
git commit -m "feat(janken): add RankingList component"
```

---

### Task 12: Frontend — Janken page + routing + navigation

**Files:**
- Create: `frontend/src/pages/Janken/index.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/NavDrawer.jsx`

**Step 1: Create Janken page**

```jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Container, Typography, Divider, Alert } from "@mui/material";
import BattleFeed from "./BattleFeed";
import RankingList from "./RankingList";
import { getRankings, getRecentMatches } from "../../services/janken";

const MATCH_POLL_INTERVAL = 30000;
const RANKING_POLL_INTERVAL = 60000;

export default function Janken() {
  const [rankings, setRankings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [error, setError] = useState(null);
  const matchTimerRef = useRef(null);
  const rankingTimerRef = useRef(null);

  const fetchRankings = useCallback(async () => {
    try {
      const data = await getRankings();
      setRankings(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch rankings", err);
      if (!rankings.length) setError("無法載入排行榜資料");
    } finally {
      setLoadingRankings(false);
    }
  }, []);

  const fetchMatches = useCallback(async () => {
    try {
      const data = await getRecentMatches();
      setMatches(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch matches", err);
      if (!matches.length) setError("無法載入對戰紀錄");
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    matchTimerRef.current = setInterval(fetchMatches, MATCH_POLL_INTERVAL);
    rankingTimerRef.current = setInterval(fetchRankings, RANKING_POLL_INTERVAL);
  }, [fetchMatches, fetchRankings]);

  const stopPolling = useCallback(() => {
    clearInterval(matchTimerRef.current);
    clearInterval(rankingTimerRef.current);
  }, []);

  useEffect(() => {
    fetchRankings();
    fetchMatches();
    startPolling();

    // Pause polling when tab is hidden
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchRankings();
        fetchMatches();
        startPolling();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchRankings, fetchMatches, startPolling, stopPolling]);

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        猜拳競技場
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        即時對戰排行
      </Typography>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <BattleFeed matches={matches} loading={loadingMatches} />
      <Divider sx={{ my: 3 }} />
      <RankingList rankings={rankings} loading={loadingRankings} />
    </Container>
  );
}
```

**Step 2: Add route to App.jsx**

In `frontend/src/App.jsx`, add import:

```javascript
import Janken from "./pages/Janken";
```

Add route inside `<Route element={<MainLayout />}>`, after the rankings route:

```jsx
<Route path="janken" element={<Janken />} />
```

**Step 3: Add navigation item to NavDrawer.jsx**

In `frontend/src/components/NavDrawer.jsx`, add import and update `mainItems`:

```javascript
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";

const mainItems = [
  { label: "首頁", path: "/", icon: HomeIcon },
  { label: "排行榜", path: "/rankings", icon: EqualizerIcon },
  { label: "猜拳競技場", path: "/janken", icon: EmojiEventsIcon },
];
```

**Step 4: Commit**

```bash
git add frontend/src/pages/Janken/ frontend/src/App.jsx frontend/src/components/NavDrawer.jsx
git commit -m "feat(janken): add Janken arena page with routing and navigation"
```

---

### Task 13: Integration test — verify end-to-end

**Step 1: Start dev servers**

```bash
make run
```

**Step 2: Verify API endpoints**

```bash
curl http://localhost:5000/api/janken/rankings
curl http://localhost:5000/api/janken/recent-matches
```

Expected: Both return JSON arrays (may be empty if no data).

**Step 3: Verify frontend page**

Open `http://localhost:3000/janken` in browser. Verify:
- Page loads with title "猜拳競技場"
- BattleFeed shows "尚無對戰紀錄" or cycles through records
- RankingList shows "尚無排名資料" or displays top 20
- Navigation sidebar shows "猜拳競技場" link
- Responsive on mobile viewport

**Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix(janken): integration fixes for arena page"
```
