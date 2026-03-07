# Janken Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor janken into a clean Service architecture and add optional goddess stone betting to duels.

**Architecture:** Thin Controller delegates to JankenService for all game logic. Models extended with bet fields. New game-style Flex Messages using custom image assets. Express serves static images.

**Tech Stack:** Node.js, Bottender, Knex (MySQL), Redis, LINE Flex Message

**Design doc:** `docs/plans/2026-03-07-janken-enhancement-design.md`

---

### Task 1: Database Migrations

**Files:**
- Create: `app/migrations/<timestamp>_extend_janken_records.js` (via `yarn knex migrate:make`)
- Create: `app/migrations/<timestamp>_create_janken_rating.js` (via `yarn knex migrate:make`)

**Step 1: Create migration to extend janken_records**

Run from `app/`:
```bash
yarn knex migrate:make extend_janken_records
```

Edit the generated file:
```js
exports.up = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table.string("group_id", 33).after("target_user_id");
    table.integer("bet_amount").notNullable().defaultTo(0);
    table.integer("bet_fee").notNullable().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("janken_records", table => {
    table.dropColumn("group_id");
    table.dropColumn("bet_amount");
    table.dropColumn("bet_fee");
  });
};
```

**Step 2: Create migration for janken_rating**

```bash
yarn knex migrate:make create_janken_rating
```

Edit the generated file:
```js
exports.up = function (knex) {
  return knex.schema.createTable("janken_rating", table => {
    table.string("user_id", 33).primary();
    table.integer("elo").notNullable().defaultTo(1000);
    table.string("rank_tier", 20).notNullable().defaultTo("beginner");
    table.integer("win_count").notNullable().defaultTo(0);
    table.integer("lose_count").notNullable().defaultTo(0);
    table.integer("draw_count").notNullable().defaultTo(0);
    table.integer("streak").notNullable().defaultTo(0);
    table.integer("max_streak").notNullable().defaultTo(0);
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("janken_rating");
};
```

**Step 3: Commit**

```bash
git add app/migrations/
git commit -m "feat(janken): add migrations for bet columns and rating table"
```

---

### Task 2: Config & Static Assets

**Files:**
- Modify: `app/config/default.json`
- Modify: `app/server.js`
- Modify: `app/locales/zh_tw.json`

**Step 1: Add bet config to `app/config/default.json`**

Add inside `minigame.janken`:
```json
{
  "minigame": {
    "janken": {
      "paper": "...",
      "rock": "...",
      "scissors": "...",
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
      },
      "images": {
        "rock": "/assets/janken/rock.png",
        "scissors": "/assets/janken/scissors.png",
        "paper": "/assets/janken/paper.png",
        "win": "/assets/janken/win.png",
        "lose": "/assets/janken/lose.png",
        "draw": "/assets/janken/draw.png",
        "vs": "/assets/janken/vs.png"
      }
    }
  }
}
```

**Step 2: Add static file serving to `app/server.js`**

Add before the `server.use("/api", ...)` line:
```js
server.use("/assets", express.static(path.join(__dirname, "assets")));
```

**Step 3: Update i18n messages in `app/locales/zh_tw.json`**

Replace the `duel` block with:
```json
{
  "duel": {
    "usage": "使用方法：\n/猜拳 @玩家 [賭注金額]\n/決鬥 @玩家 [賭注金額]",
    "start": "{{{ displayName }}} 向 {{{ targetDisplayName }}} 發起了猜拳挑戰！",
    "start_with_bet": "{{{ displayName }}} 向 {{{ targetDisplayName }}} 發起了猜拳挑戰！\n賭注：{{ betAmount }} 女神石",
    "too_many_mentions": "請指定一個玩家",
    "only_in_group": "猜拳只能在群組中使用",
    "result": "{{{ displayName }}} 出 {{ p1Type }}，{{{ targetDisplayName }}} 出 {{ p2Type }}",
    "win_lose": "{{{ winner }}} 贏了！",
    "draw": "平手！",
    "bet_win": "{{{ winner }}} 贏得了 {{ amount }} 女神石！",
    "bet_draw": "平手！賭注已退回雙方。",
    "bet_insufficient": "餘額不足！需要 {{ amount }} 女神石",
    "bet_too_low": "最低賭注為 {{ min }} 女神石",
    "bet_too_high": "你的段位最高可下注 {{ max }} 女神石",
    "bet_escrow": "已預扣 {{ amount }} 女神石作為賭注",
    "paper": "布",
    "scissors": "剪刀",
    "rock": "石頭",
    "failed_to_get_user_id": "無法取得玩家ID",
    "failed_to_get_target_user_id": "無法取得對手玩家ID",
    "challenge_success": "{{{ displayName }}} 向 {{{ targetDisplayName }}} 發起了挑戰，等待對方出拳！",
    "holding_manual": "{{{ displayName }}} 正在舉辦猜拳擂台，任何人都可以向他挑戰！"
  }
}
```

**Step 4: Commit**

```bash
git add app/config/default.json app/server.js app/locales/zh_tw.json
git commit -m "feat(janken): add bet config, static assets serving, and i18n messages"
```

---

### Task 3: JankenRating Model

**Files:**
- Create: `app/src/model/application/JankenRating.js`
- Create: `app/__tests__/model/JankenRating.test.js`

**Step 1: Write the test**

```js
// app/__tests__/model/JankenRating.test.js
const JankenRating = require("../../src/model/application/JankenRating");

describe("JankenRating", () => {
  describe("getRankTier", () => {
    it("returns beginner for elo < 1200", () => {
      expect(JankenRating.getRankTier(1000)).toBe("beginner");
      expect(JankenRating.getRankTier(1199)).toBe("beginner");
    });

    it("returns challenger for elo 1200-1399", () => {
      expect(JankenRating.getRankTier(1200)).toBe("challenger");
      expect(JankenRating.getRankTier(1399)).toBe("challenger");
    });

    it("returns fighter for elo 1400-1599", () => {
      expect(JankenRating.getRankTier(1400)).toBe("fighter");
    });

    it("returns master for elo 1600-1799", () => {
      expect(JankenRating.getRankTier(1600)).toBe("master");
    });

    it("returns legend for elo >= 1800", () => {
      expect(JankenRating.getRankTier(1800)).toBe("legend");
      expect(JankenRating.getRankTier(2500)).toBe("legend");
    });
  });

  describe("getMaxBet", () => {
    it("returns max bet for rank tier", () => {
      expect(JankenRating.getMaxBet("beginner")).toBe(1000);
      expect(JankenRating.getMaxBet("legend")).toBe(50000);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd app && yarn test __tests__/model/JankenRating.test.js
```
Expected: FAIL — module not found

**Step 3: Write the model**

```js
// app/src/model/application/JankenRating.js
const mysql = require("../../util/mysql");
const { pick } = require("lodash");
const config = require("config");

const TABLE = "janken_rating";
const fillable = ["user_id", "elo", "rank_tier", "win_count", "lose_count", "draw_count", "streak", "max_streak"];

const RANK_TIERS = [
  { name: "beginner", minElo: 0 },
  { name: "challenger", minElo: 1200 },
  { name: "fighter", minElo: 1400 },
  { name: "master", minElo: 1600 },
  { name: "legend", minElo: 1800 },
];

exports.RANK_TIERS = RANK_TIERS;

exports.getRankTier = function (elo) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (elo >= RANK_TIERS[i].minElo) return RANK_TIERS[i].name;
  }
  return "beginner";
};

exports.getMaxBet = function (rankTier) {
  const maxByRank = config.get("minigame.janken.bet.maxAmountByRank");
  return maxByRank[rankTier] || maxByRank.beginner;
};

exports.find = async function (userId) {
  return mysql(TABLE).where({ user_id: userId }).first();
};

exports.findOrCreate = async function (userId) {
  let rating = await exports.find(userId);
  if (!rating) {
    await mysql(TABLE).insert({ user_id: userId });
    rating = await exports.find(userId);
  }
  return rating;
};

exports.update = async function (userId, attributes) {
  const data = pick(attributes, fillable);
  return mysql(TABLE).where({ user_id: userId }).update(data);
};
```

**Step 4: Run test to verify it passes**

```bash
cd app && yarn test __tests__/model/JankenRating.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add app/src/model/application/JankenRating.js app/__tests__/model/JankenRating.test.js
git commit -m "feat(janken): add JankenRating model with rank tier logic"
```

---

### Task 4: JankenService — Core Game Logic

**Files:**
- Create: `app/src/service/JankenService.js`
- Create: `app/__tests__/service/JankenService.test.js`

**Step 1: Write the test**

```js
// app/__tests__/service/JankenService.test.js
const JankenService = require("../../src/service/JankenService");
const redis = require("../../src/util/redis");

describe("JankenService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("determineWinner", () => {
    it("rock beats scissors", () => {
      const [p1, p2] = JankenService.determineWinner("rock", "scissors");
      expect(p1).toBe("win");
      expect(p2).toBe("lose");
    });

    it("scissors beats paper", () => {
      const [p1, p2] = JankenService.determineWinner("scissors", "paper");
      expect(p1).toBe("win");
      expect(p2).toBe("lose");
    });

    it("paper beats rock", () => {
      const [p1, p2] = JankenService.determineWinner("paper", "rock");
      expect(p1).toBe("win");
      expect(p2).toBe("lose");
    });

    it("same choice is draw", () => {
      const [p1, p2] = JankenService.determineWinner("rock", "rock");
      expect(p1).toBe("draw");
      expect(p2).toBe("draw");
    });
  });

  describe("randomChoice", () => {
    it("returns rock, scissors, or paper", () => {
      const valid = ["rock", "scissors", "paper"];
      for (let i = 0; i < 20; i++) {
        expect(valid).toContain(JankenService.randomChoice());
      }
    });
  });

  describe("calculateBetSettlement", () => {
    it("winner gets 90% of total pot", () => {
      const result = JankenService.calculateBetSettlement(100, "win");
      expect(result.winnerGets).toBe(180);
      expect(result.fee).toBe(20);
    });

    it("draw refunds both", () => {
      const result = JankenService.calculateBetSettlement(100, "draw");
      expect(result.refundEach).toBe(100);
      expect(result.fee).toBe(0);
    });
  });

  describe("submitChoice", () => {
    it("stores choice in redis", async () => {
      redis.set.mockResolvedValue("OK");
      redis.get.mockResolvedValue(null);

      await JankenService.submitChoice("match-123", "user-1", "rock");

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining("match-123:user-1"),
        "rock",
        expect.objectContaining({ EX: 3600 })
      );
    });

    it("returns both choices when both submitted", async () => {
      redis.set.mockResolvedValue("OK");
      redis.get
        .mockResolvedValueOnce("rock")
        .mockResolvedValueOnce("scissors");

      const result = await JankenService.submitChoice("match-123", "user-2", "scissors", {
        p1UserId: "user-1",
        p2UserId: "user-2",
      });

      expect(result).toEqual({
        ready: true,
        p1Choice: "rock",
        p2Choice: "scissors",
      });
    });

    it("returns not ready when only one submitted", async () => {
      redis.set.mockResolvedValue("OK");
      redis.get
        .mockResolvedValueOnce("rock")
        .mockResolvedValueOnce(null);

      const result = await JankenService.submitChoice("match-123", "user-1", "rock", {
        p1UserId: "user-1",
        p2UserId: "user-2",
      });

      expect(result).toEqual({ ready: false });
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd app && yarn test __tests__/service/JankenService.test.js
```
Expected: FAIL — module not found

**Step 3: Write the service**

```js
// app/src/service/JankenService.js
const redis = require("../util/redis");
const config = require("config");
const JankenRecords = require("../model/application/JankenRecords");
const JankenResult = require("../model/application/JankenResult");
const { inventory } = require("../model/application/Inventory");
const EventCenterService = require("./EventCenterService");
const { DefaultLogger } = require("../util/Logger");

const REDIS_PREFIX = config.get("redis.keys.jankenDecide");
const CHALLENGE_PREFIX = config.get("redis.keys.jankenChallenge");
const FEE_RATE = config.get("minigame.janken.bet.feeRate");
const MIN_BET = config.get("minigame.janken.bet.minAmount");

const RESULT_MAP = {
  rock: { rock: "draw", paper: "lose", scissors: "win" },
  paper: { rock: "win", paper: "draw", scissors: "lose" },
  scissors: { rock: "lose", paper: "win", scissors: "draw" },
};

/**
 * Determine winner between two choices
 * @returns {[string, string]} [p1Result, p2Result]
 */
exports.determineWinner = function (p1Choice, p2Choice) {
  return [RESULT_MAP[p1Choice][p2Choice], RESULT_MAP[p2Choice][p1Choice]];
};

/**
 * Random choice
 */
exports.randomChoice = function () {
  const choices = ["rock", "paper", "scissors"];
  return choices[Math.floor(Math.random() * choices.length)];
};

/**
 * Calculate bet settlement
 * @param {number} betAmount - per-player bet amount
 * @param {string} outcome - "win" or "draw"
 */
exports.calculateBetSettlement = function (betAmount, outcome) {
  if (outcome === "draw") {
    return { refundEach: betAmount, fee: 0 };
  }
  const totalPot = betAmount * 2;
  const fee = Math.floor(totalPot * FEE_RATE);
  const winnerGets = totalPot - fee;
  return { winnerGets, fee };
};

/**
 * Validate bet amount
 * @returns {{ valid: boolean, error?: string, errorParams?: object }}
 */
exports.validateBet = function (amount, maxBet) {
  if (amount < MIN_BET) {
    return { valid: false, error: "message.duel.bet_too_low", errorParams: { min: MIN_BET } };
  }
  if (amount > maxBet) {
    return { valid: false, error: "message.duel.bet_too_high", errorParams: { max: maxBet } };
  }
  return { valid: true };
};

/**
 * Escrow (deduct) bet amount from user
 */
exports.escrowBet = async function (userId, amount) {
  const { amount: balance } = (await inventory.getUserMoney(userId)) || { amount: 0 };
  if (balance < amount) {
    return { success: false, balance };
  }
  await inventory.decreaseGodStone({ userId, amount, note: "janken_bet_escrow" });
  return { success: true };
};

/**
 * Submit a choice for a match
 */
exports.submitChoice = async function (matchId, userId, choice, { p1UserId, p2UserId } = {}) {
  if (choice === "random") {
    choice = exports.randomChoice();
  }

  const key = `${REDIS_PREFIX}:${matchId}:${userId}`;
  await redis.set(key, choice, { EX: 3600 });

  DefaultLogger.info(`[Janken] ${userId} chose ${choice} for match ${matchId}`);

  if (!p1UserId || !p2UserId) {
    return { ready: false };
  }

  const [p1Choice, p2Choice] = await Promise.all([
    redis.get(`${REDIS_PREFIX}:${matchId}:${p1UserId}`),
    redis.get(`${REDIS_PREFIX}:${matchId}:${p2UserId}`),
  ]);

  if (!p1Choice || !p2Choice) {
    return { ready: false };
  }

  return { ready: true, p1Choice, p2Choice };
};

/**
 * Resolve a completed match: determine winner, settle bets, write to DB
 */
exports.resolveMatch = async function ({
  matchId,
  groupId,
  p1UserId,
  p2UserId,
  p1Choice,
  p2Choice,
  betAmount = 0,
}) {
  const [p1Result, p2Result] = exports.determineWinner(p1Choice, p2Choice);

  // Settle bet
  let betFee = 0;
  if (betAmount > 0) {
    if (p1Result === "draw") {
      // Refund both
      await Promise.all([
        inventory.increaseGodStone({ userId: p1UserId, amount: betAmount, note: "janken_bet_refund" }),
        inventory.increaseGodStone({ userId: p2UserId, amount: betAmount, note: "janken_bet_refund" }),
      ]);
    } else {
      const { winnerGets, fee } = exports.calculateBetSettlement(betAmount, "win");
      betFee = fee;
      const winnerId = p1Result === "win" ? p1UserId : p2UserId;
      await inventory.increaseGodStone({ userId: winnerId, amount: winnerGets, note: "janken_bet_win" });
    }
  }

  // Write to DB
  await JankenRecords.create({
    id: matchId,
    user_id: p1UserId,
    target_user_id: p2UserId,
    group_id: groupId,
    bet_amount: betAmount,
    bet_fee: betFee,
  });

  await JankenResult.insert([
    { record_id: matchId, user_id: p1UserId, result: JankenResult.resultMap[p1Result] },
    { record_id: matchId, user_id: p2UserId, result: JankenResult.resultMap[p2Result] },
  ]);

  // Clean up Redis
  await Promise.all([
    redis.del(`${REDIS_PREFIX}:${matchId}:${p1UserId}`),
    redis.del(`${REDIS_PREFIX}:${matchId}:${p2UserId}`),
  ]);

  // Trigger daily quest
  await Promise.all([
    EventCenterService.add(EventCenterService.getEventName("daily_quest"), { userId: p1UserId }),
    EventCenterService.add(EventCenterService.getEventName("daily_quest"), { userId: p2UserId }),
  ]);

  return { p1Result, p2Result, p1Choice, p2Choice, betFee };
};

/**
 * Store challenger's choice for arena mode
 */
exports.submitArenaChallenge = async function (groupId, holderUserId, challengerUserId, choice) {
  if (choice === "random") {
    choice = exports.randomChoice();
  }

  const redisKey = `${CHALLENGE_PREFIX}:${groupId}:${holderUserId}`;

  const hasSet = await redis.set(
    redisKey,
    JSON.stringify({ challengerUserId, choice }),
    { EX: 10 * 60, NX: true }
  );

  if (!hasSet) {
    // Check if same challenger updating their choice
    const existing = await redis.get(redisKey);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed.challengerUserId === challengerUserId) {
        await redis.set(redisKey, JSON.stringify({ challengerUserId, choice }));
        return { accepted: true, updated: true };
      }
    }
    return { accepted: false };
  }

  return { accepted: true, updated: false };
};

/**
 * Resolve arena: holder makes their choice
 */
exports.resolveArena = async function (groupId, holderUserId, holderChoice) {
  if (holderChoice === "random") {
    holderChoice = exports.randomChoice();
  }

  const redisKey = `${CHALLENGE_PREFIX}:${groupId}:${holderUserId}`;
  const content = await redis.get(redisKey);

  if (!content) {
    return null; // No challenger yet
  }

  const { challengerUserId, choice: challengerChoice } = JSON.parse(content);
  await redis.del(redisKey);

  return {
    challengerUserId,
    challengerChoice,
    holderChoice,
  };
};
```

**Step 4: Run test to verify it passes**

```bash
cd app && yarn test __tests__/service/JankenService.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add app/src/service/JankenService.js app/__tests__/service/JankenService.test.js
git commit -m "feat(janken): add JankenService with game logic and betting"
```

---

### Task 5: Flex Message Templates

**Files:**
- Create: `app/src/templates/application/Janken.js`

**Step 1: Write the new Flex Message template**

Create `app/src/templates/application/Janken.js` with:

- `generateDuelCard({ p1IconUrl, p2IconUrl, p1Name, p2Name, p1Uid, p2Uid, uuid, betAmount, title, baseUrl })` — duel start card with image buttons
- `generateArenaCard({ holderIconUrl, holderName, holderId, groupId, title, baseUrl })` — arena card
- `generateResultCard({ p1Name, p2Name, p1Choice, p2Choice, resultType, winnerName, betAmount, betSettlement, baseUrl })` — result display card

All images use `${baseUrl}/assets/janken/{name}.png`.

The template should use the game UI style:
- VS image between player avatars
- Rock/scissors/paper images as postback action buttons
- WIN/DRAW/LOSE result images
- Bet amount display with goddess stone icon

**Step 2: Commit**

```bash
git add app/src/templates/application/Janken.js
git commit -m "feat(janken): add game-style Flex Message templates"
```

---

### Task 6: Rewrite JankenController

**Files:**
- Rewrite: `app/src/controller/application/JankenController.js`
- Modify: `app/src/app.js` (postback routing — verify existing `janken` and `challenge` actions still work)

**Step 1: Rewrite the controller**

The new controller should be thin — parse commands, call JankenService, send Flex Messages.

Key changes:
- `duel(context)` — parse mention + optional bet amount, call `JankenService.escrowBet` if bet, send duel Flex
- `holdingChallenge(context)` — same as before but use new template
- `exports.decide` — call `JankenService.submitChoice`, if ready call `JankenService.resolveMatch`, send result Flex
- `exports.challenge` — call `JankenService.submitArenaChallenge` or `JankenService.resolveArena`, send result Flex

Router patterns stay the same:
```js
exports.router = [
  text(/^[.#/](決鬥|duel)/, duel),
  text(/^[.#/](猜拳(擂台|(大|比)賽)|hold)/, holdingChallenge),
  text(/^[.#/]猜拳\s+@/, duel),  // unified entry
];
```

**Step 2: Verify postback routing in `app/src/app.js`**

Existing routes should work as-is:
```js
route(() => action === "janken", withProps(JankenController.decide, { payload })),
route(() => action === "challenge", withProps(JankenController.challenge, { payload })),
```

**Step 3: Commit**

```bash
git add app/src/controller/application/JankenController.js
git commit -m "refactor(janken): rewrite controller as thin layer over JankenService"
```

---

### Task 7: Update JankenRecords Model

**Files:**
- Modify: `app/src/model/application/JankenRecords.js`

**Step 1: Add new fillable fields**

Add `group_id`, `bet_amount`, `bet_fee` to the `fillable` array:

```js
const fillable = ["id", "user_id", "target_user_id", "group_id", "bet_amount", "bet_fee"];
```

**Step 2: Commit**

```bash
git add app/src/model/application/JankenRecords.js
git commit -m "feat(janken): extend JankenRecords model with bet fields"
```

---

### Task 8: Clean Up Old Janken Code in Minigame.js

**Files:**
- Modify: `app/src/templates/application/Minigame.js`
- Modify: `app/src/controller/application/ChatLevelController.js`

**Step 1: Check what else uses Minigame.js**

`ChatLevelController.js` uses `MinigameTemplate.generateJankenGrade()` for the status card. Keep `generateJankenGrade` in Minigame.js (or move to Janken.js). Remove `generateJanken` and `generateJankenHolder` since they are replaced.

**Step 2: Move `generateJankenGrade` to `Janken.js`**

Add the function to the new template file, update the import in ChatLevelController.

**Step 3: Remove janken functions from Minigame.js**

Remove `generateJanken`, `generateJankenHolder` from Minigame.js. Keep `generateJankenGrade` only if other code depends on it.

**Step 4: Update ChatLevelController import**

Change:
```js
const MinigameTemplate = require("../../templates/application/Minigame");
```
to also import from Janken template where needed.

**Step 5: Commit**

```bash
git add app/src/templates/application/Minigame.js app/src/templates/application/Janken.js app/src/controller/application/ChatLevelController.js
git commit -m "refactor(janken): move janken templates to dedicated file, clean up Minigame.js"
```

---

### Task 9: Integration Testing

**Step 1: Run full test suite**

```bash
cd app && yarn test
```
Expected: All tests pass

**Step 2: Manual testing checklist**

- [ ] `/duel @player` sends duel Flex with image buttons
- [ ] `/duel @player 100` checks balance, escrows, shows bet amount
- [ ] Both players choose → result Flex with images
- [ ] `/猜拳擂台` opens arena with new template
- [ ] Arena challenge → result displayed correctly
- [ ] Bet win: winner gets 90% of pot
- [ ] Bet draw: both refunded
- [ ] Insufficient balance: error message
- [ ] `/猜拳 @player` works as alias for duel

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(janken): complete Phase 1 - refactor and betting system"
```

---

### Task Summary

| # | Task | Estimated Scope |
|---|------|----------------|
| 1 | Database migrations | 2 migration files |
| 2 | Config & static assets | 3 files modified |
| 3 | JankenRating model + test | 2 files |
| 4 | JankenService + test | 2 files |
| 5 | Flex Message templates | 1 file (large) |
| 6 | Rewrite controller | 1 file rewrite |
| 7 | Extend JankenRecords model | 1 file (small) |
| 8 | Clean up old code | 3 files |
| 9 | Integration testing | verification |

Dependencies: Task 1-2 can run in parallel. Task 3 and 4 can run in parallel. Tasks 5-8 are sequential. Task 9 is last.
