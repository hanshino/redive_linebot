# Mention-Keyword Achievement Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a data-driven `mention_keyword` event type to the achievement engine and an opt-in unlock-notification path that replies in-chat at zero LINE cost.

**Architecture:** Store per-achievement trigger data + notification toggle in new columns on `achievements` (`condition` JSON, `notify_on_unlock` boolean, `notify_message` text). `AchievementEngine.evaluate()` returns the list of newly unlocked achievements; a standalone `achievementNotifier` helper renders a template and emits through Bottender's batched reply queue (`_shouldBatch = true` defaults to one `client.reply` API call per event).

**Tech Stack:** Node.js + Bottender 1.5.5 + Knex + MySQL + Jest. CommonJS modules throughout.

**Spec reference:** `docs/superpowers/specs/2026-04-17-mention-keyword-achievement-trigger-design.md`

---

## File Structure

**New:**
- `app/migrations/<ts>_add_achievement_condition_and_notify.js` — adds 3 columns to `achievements`.
- `app/src/service/achievementNotifier.js` — renders + emits unlock messages.
- `app/__tests__/service/achievementNotifier.test.js` — notifier unit tests.

**Modified:**
- `app/src/service/AchievementEngine.js` — `evaluate()` returns `{ unlocked }`; add `mention_keyword` event type + `STRATEGIES.mentionKeyword`.
- `app/__tests__/service/AchievementEngine.test.js` — new assertions for return value and new strategy.
- `app/src/middleware/statistics.js` — fire `mention_keyword` + dispatch notifier.
- `app/src/controller/princess/gacha.js` — consume return value + notify.
- `app/src/controller/application/JankenController.js` — consume + notify (4 call sites at lines 267/268/436/437).
- `app/src/controller/application/SubscribeController.js` — consume + notify (2 call sites at lines 85/255).

---

## Task 1: Schema Migration

**Files:**
- Create: `app/migrations/<yarn-generated-ts>_add_achievement_condition_and_notify.js`

- [ ] **Step 1: Generate migration file**

Run from `app/`:
```bash
yarn knex migrate:make add_achievement_condition_and_notify
```

Expected: new file under `app/migrations/` with UTC timestamp prefix.

- [ ] **Step 2: Write migration contents**

Overwrite the generated file with:

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable("achievements", table => {
    table.json("condition").nullable().comment("觸發條件資料，策略自行解析");
    table
      .boolean("notify_on_unlock")
      .notNullable()
      .defaultTo(false)
      .comment("解鎖時是否通知聊天室");
    table.text("notify_message").nullable().comment("通知模板，null 走預設");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable("achievements", table => {
    table.dropColumn("condition");
    table.dropColumn("notify_on_unlock");
    table.dropColumn("notify_message");
  });
};
```

- [ ] **Step 3: Run migration**

Run from `app/`:
```bash
yarn migrate
```

Expected: `Batch N run: 1 migrations` and no errors.

- [ ] **Step 4: Verify columns exist**

Run from `app/` inside a MySQL session (or via `make bash-redis`-equivalent MySQL shell):
```sql
DESCRIBE achievements;
```

Expected: `condition` (json, YES null), `notify_on_unlock` (tinyint(1), NO, default 0), `notify_message` (text, YES null).

- [ ] **Step 5: Commit**

```bash
git add app/migrations/
git commit -m "feat(achievement): add condition, notify_on_unlock, notify_message columns"
```

---

## Task 2: Engine Returns Unlocked Array — Failing Test

**Files:**
- Test: `app/__tests__/service/AchievementEngine.test.js`

- [ ] **Step 1: Add failing test for return value**

Append to the existing `describe("AchievementEngine", ...)` block in `app/__tests__/service/AchievementEngine.test.js`:

```js
describe("evaluate return value", () => {
  it("returns { unlocked: [] } when no achievement crosses threshold", async () => {
    AchievementEngine._setCache([
      {
        id: 1,
        key: "chat_100",
        target_value: 100,
        reward_stones: 0,
        notify_on_unlock: false,
        notify_message: null,
        condition: null,
      },
    ]);
    UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
    UserProgressModel.getProgress.mockResolvedValue({ current_value: 1 });
    UserProgressModel.upsert.mockResolvedValue();

    const result = await AchievementEngine.evaluate("user1", "chat_message", {});

    expect(result).toEqual({ unlocked: [] });
  });

  it("returns the unlocked achievement row when threshold is crossed", async () => {
    const achievement = {
      id: 2,
      key: "chat_100",
      target_value: 100,
      reward_stones: 50,
      notify_on_unlock: true,
      notify_message: null,
      condition: null,
      icon: "💬",
      name: "百句達人",
    };
    AchievementEngine._setCache([achievement]);
    UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
    UserProgressModel.getProgress.mockResolvedValue({ current_value: 99 });
    UserProgressModel.upsert.mockResolvedValue();
    UserAchievementModel.unlock.mockResolvedValue();
    UserProgressModel.delete.mockResolvedValue();
    mysql.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue(),
    });

    const result = await AchievementEngine.evaluate("user1", "chat_message", {});

    expect(result.unlocked).toHaveLength(1);
    expect(result.unlocked[0].key).toBe("chat_100");
  });

  it("returns { unlocked: [] } when inner error is swallowed", async () => {
    AchievementEngine._setCache([
      {
        id: 3,
        key: "chat_100",
        target_value: 100,
        reward_stones: 0,
        notify_on_unlock: false,
        notify_message: null,
        condition: null,
      },
    ]);
    UserAchievementModel.getUnlockedIds.mockRejectedValue(new Error("db down"));

    const result = await AchievementEngine.evaluate("user1", "chat_message", {});

    expect(result).toEqual({ unlocked: [] });
  });
});
```

> **Note:** The existing test file already imports `UserAchievementModel`, `UserProgressModel`, `mysql`, and has `AchievementEngine._setCache` usage. Reuse the existing `beforeEach` / mock setup.

- [ ] **Step 2: Run tests to verify they fail**

Run from `app/`:
```bash
yarn test -- AchievementEngine
```

Expected: The three new cases fail. Existing cases still pass. The failure messages say `expected { unlocked: [] }` but received `undefined`.

---

## Task 3: Engine Returns Unlocked Array — Implementation

**Files:**
- Modify: `app/src/service/AchievementEngine.js:96-134` (the `exports.evaluate` function)

- [ ] **Step 1: Update `evaluate` to accumulate and return unlocked**

Replace the body of `exports.evaluate` with:

```js
exports.evaluate = async (userId, eventType, context = {}) => {
  const unlocked = [];
  try {
    const achievementKeys = EVENT_ACHIEVEMENT_MAP[eventType];
    if (!achievementKeys || achievementKeys.length === 0) return { unlocked };

    const cache = await getCache();
    const achievements = achievementKeys.map(key => cache.find(a => a.key === key)).filter(Boolean);
    if (achievements.length === 0) return { unlocked };

    const unlockedIds = await UserAchievementModel.getUnlockedIds(
      userId,
      achievements.map(a => a.id)
    );

    const ctx = { ...context, _userId: userId };

    for (const achievement of achievements) {
      try {
        if (unlockedIds.has(achievement.id)) continue;

        const newValue = await calculateProgress(userId, achievement, ctx);
        if (newValue === null) continue;

        await UserProgressModel.upsert(userId, achievement.id, newValue);

        if (newValue >= achievement.target_value) {
          await unlockAchievement(userId, achievement);
          unlocked.push(achievement);
        }
      } catch (innerErr) {
        DefaultLogger.error(
          `AchievementEngine.evaluate error for key ${achievement.key}:`,
          innerErr
        );
      }
    }
  } catch (err) {
    DefaultLogger.error("AchievementEngine.evaluate error:", err);
  }
  return { unlocked };
};
```

- [ ] **Step 2: Run tests to verify they pass**

Run from `app/`:
```bash
yarn test -- AchievementEngine
```

Expected: all tests including the three new return-value cases pass.

- [ ] **Step 3: Commit**

```bash
git add app/src/service/AchievementEngine.js app/__tests__/service/AchievementEngine.test.js
git commit -m "feat(achievement): evaluate returns { unlocked } for caller-driven notification"
```

---

## Task 4: `mentionKeyword` Strategy — Failing Test

**Files:**
- Test: `app/__tests__/service/AchievementEngine.test.js`

- [ ] **Step 1: Add failing test cases for the new strategy**

Append to the test file:

```js
describe("mention_keyword event", () => {
  const baseAchievement = {
    id: 99,
    key: "mention_admin_hi",
    target_value: 1,
    reward_stones: 100,
    notify_on_unlock: true,
    notify_message: null,
    icon: "🫡",
    name: "管理員粉絲",
    condition: { targetUserIds: ["Uadmin"], keywords: ["大大好"] },
  };

  beforeEach(() => {
    AchievementEngine._setCache([baseAchievement]);
    UserAchievementModel.getUnlockedIds.mockResolvedValue(new Set());
    UserProgressModel.getProgress.mockResolvedValue(null);
    UserProgressModel.upsert.mockResolvedValue();
    UserAchievementModel.unlock.mockResolvedValue();
    UserProgressModel.delete.mockResolvedValue();
    mysql.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue(),
    });
  });

  it("unlocks when all target userIds are mentioned and all keywords are present", async () => {
    const ctx = { mentionedUserIds: ["Uadmin"], text: "嗨 大大好 今天過得如何" };

    const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

    expect(result.unlocked.map(a => a.key)).toEqual(["mention_admin_hi"]);
  });

  it("does not unlock when mention is missing", async () => {
    const ctx = { mentionedUserIds: [], text: "大大好" };

    const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

    expect(result.unlocked).toEqual([]);
  });

  it("does not unlock when keyword is missing", async () => {
    const ctx = { mentionedUserIds: ["Uadmin"], text: "嗨" };

    const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

    expect(result.unlocked).toEqual([]);
  });

  it("does not unlock when condition is null", async () => {
    AchievementEngine._setCache([{ ...baseAchievement, condition: null }]);
    const ctx = { mentionedUserIds: ["Uadmin"], text: "大大好" };

    const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

    expect(result.unlocked).toEqual([]);
  });

  it("requires ALL target userIds (not just one)", async () => {
    AchievementEngine._setCache([
      {
        ...baseAchievement,
        condition: { targetUserIds: ["Uadmin", "Umod"], keywords: ["大大好"] },
      },
    ]);
    const ctx = { mentionedUserIds: ["Uadmin"], text: "大大好" };

    const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

    expect(result.unlocked).toEqual([]);
  });

  it("requires ALL keywords (not just one)", async () => {
    AchievementEngine._setCache([
      {
        ...baseAchievement,
        condition: { targetUserIds: ["Uadmin"], keywords: ["大大好", "早安"] },
      },
    ]);
    const ctx = { mentionedUserIds: ["Uadmin"], text: "大大好" };

    const result = await AchievementEngine.evaluate("user1", "mention_keyword", ctx);

    expect(result.unlocked).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `app/`:
```bash
yarn test -- AchievementEngine
```

Expected: the six new cases all fail — the first one fails because the `mention_keyword` event type is not in `EVENT_ACHIEVEMENT_MAP`, so `evaluate` short-circuits before strategy runs.

---

## Task 5: `mentionKeyword` Strategy — Implementation

**Files:**
- Modify: `app/src/service/AchievementEngine.js:28-38` (`EVENT_ACHIEVEMENT_MAP`)
- Modify: `app/src/service/AchievementEngine.js:42-59` (`STRATEGIES`)
- Modify: `app/src/service/AchievementEngine.js:61-87` (`ACHIEVEMENT_STRATEGY`)

- [ ] **Step 1: Add the new event type**

Update `EVENT_ACHIEVEMENT_MAP` to include:

```js
const EVENT_ACHIEVEMENT_MAP = {
  chat_message: ["chat_100", "chat_1000", "chat_5000", "chat_night_owl", "chat_multi_group"],
  gacha_pull: ["gacha_first", "gacha_100", "gacha_500", "gacha_collector_50", "gacha_lucky"],
  janken_win: ["janken_first_win", "janken_win_50", "janken_streak_5", "janken_streak_10"],
  janken_lose: [],
  janken_draw: [],
  janken_challenge: ["janken_challenged_10"],
  boss_attack: ["boss_first_kill", "boss_level_10", "boss_level_50", "boss_top_damage"],
  command_use: ["social_first_command", "social_all_features"],
  subscribe: ["subscribe_first", "subscribe_3", "subscribe_6", "subscribe_12"],
  mention_keyword: ["mention_admin_hi"],
};
```

- [ ] **Step 2: Add the `mentionKeyword` reusable strategy**

Inside `STRATEGIES = { ... }`, add:

```js
  mentionKeyword(currentValue, achievement, context) {
    const condition = achievement.condition || {};
    const targetUserIds = Array.isArray(condition.targetUserIds) ? condition.targetUserIds : [];
    const keywords = Array.isArray(condition.keywords) ? condition.keywords : [];
    if (!targetUserIds.length || !keywords.length) return currentValue;

    const mentioned = Array.isArray(context.mentionedUserIds) ? context.mentionedUserIds : [];
    const text = typeof context.text === "string" ? context.text : "";

    const allTagged = targetUserIds.every(id => mentioned.includes(id));
    const allKeyword = keywords.every(k => text.includes(k));
    return allTagged && allKeyword ? achievement.target_value : currentValue;
  },
```

- [ ] **Step 3: Wire the per-key strategy**

Inside `ACHIEVEMENT_STRATEGY = { ... }`, append:

```js
  mention_admin_hi: (cv, a, ctx) => STRATEGIES.mentionKeyword(cv, a, ctx),
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `app/`:
```bash
yarn test -- AchievementEngine
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/service/AchievementEngine.js app/__tests__/service/AchievementEngine.test.js
git commit -m "feat(achievement): add mention_keyword trigger with all-match semantics"
```

---

## Task 6: Notifier Helper — Failing Tests

**Files:**
- Test: `app/__tests__/service/achievementNotifier.test.js`

- [ ] **Step 1: Create the test file**

Create `app/__tests__/service/achievementNotifier.test.js` with:

```js
jest.mock("../../src/util/mysql");
const mysql = require("../../src/util/mysql");
const { notifyUnlocks, renderTemplate } = require("../../src/service/achievementNotifier");

describe("achievementNotifier", () => {
  describe("renderTemplate", () => {
    it("uses the with-reward default when notify_message is null and reward > 0", () => {
      const out = renderTemplate(
        { name: "夜貓子", icon: "🌙", reward_stones: 50, notify_message: null },
        "Alice"
      );
      expect(out).toBe("🎉 Alice 解鎖成就「🌙 夜貓子」！獲得 50 顆女神石");
    });

    it("uses the no-reward default when notify_message is null and reward is 0", () => {
      const out = renderTemplate(
        { name: "彩蛋", icon: "🥚", reward_stones: 0, notify_message: null },
        "Bob"
      );
      expect(out).toBe("🎉 Bob 解鎖成就「🥚 彩蛋」！");
    });

    it("substitutes placeholders in a custom notify_message", () => {
      const out = renderTemplate(
        {
          name: "測試",
          icon: "🧪",
          reward_stones: 10,
          notify_message: "{user} -> {name} ({icon}) +{reward}",
        },
        "Carol"
      );
      expect(out).toBe("Carol -> 測試 (🧪) +10");
    });

    it("replaces repeated placeholders globally", () => {
      const out = renderTemplate(
        {
          name: "重複",
          icon: "🔁",
          reward_stones: 1,
          notify_message: "{user} {user} {name} {name}",
        },
        "Dan"
      );
      expect(out).toBe("Dan Dan 重複 重複");
    });
  });

  describe("notifyUnlocks", () => {
    let context;

    beforeEach(() => {
      context = { replyText: jest.fn() };
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ display_name: "Eve" }),
      });
    });

    it("does nothing when no achievement opts in", async () => {
      await notifyUnlocks(context, "user1", [
        { notify_on_unlock: false, name: "X", icon: "X", reward_stones: 0, notify_message: null },
      ]);
      expect(context.replyText).not.toHaveBeenCalled();
    });

    it("skips user lookup when list is empty", async () => {
      await notifyUnlocks(context, "user1", []);
      expect(context.replyText).not.toHaveBeenCalled();
      expect(mysql).not.toHaveBeenCalled();
    });

    it("replies once per opt-in achievement", async () => {
      await notifyUnlocks(context, "user1", [
        {
          notify_on_unlock: true,
          name: "A",
          icon: "🅰",
          reward_stones: 10,
          notify_message: null,
        },
        {
          notify_on_unlock: false,
          name: "B",
          icon: "🅱",
          reward_stones: 0,
          notify_message: null,
        },
        {
          notify_on_unlock: true,
          name: "C",
          icon: "🇨",
          reward_stones: 0,
          notify_message: null,
        },
      ]);
      expect(context.replyText).toHaveBeenCalledTimes(2);
      expect(context.replyText).toHaveBeenNthCalledWith(
        1,
        "🎉 Eve 解鎖成就「🅰 A」！獲得 10 顆女神石"
      );
      expect(context.replyText).toHaveBeenNthCalledWith(2, "🎉 Eve 解鎖成就「🇨 C」！");
    });

    it("uses fallback display name 玩家 when user row is missing", async () => {
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });
      await notifyUnlocks(context, "missing-user", [
        {
          notify_on_unlock: true,
          name: "Z",
          icon: "🅉",
          reward_stones: 0,
          notify_message: null,
        },
      ]);
      expect(context.replyText).toHaveBeenCalledWith("🎉 玩家 解鎖成就「🅉 Z」！");
    });

    it("swallows internal errors so the middleware chain never breaks", async () => {
      mysql.mockImplementation(() => {
        throw new Error("db down");
      });
      await expect(
        notifyUnlocks(context, "user1", [
          {
            notify_on_unlock: true,
            name: "A",
            icon: "🅰",
            reward_stones: 0,
            notify_message: null,
          },
        ])
      ).resolves.toBeUndefined();
      expect(context.replyText).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `app/`:
```bash
yarn test -- achievementNotifier
```

Expected: tests fail — the module does not exist yet.

---

## Task 7: Notifier Helper — Implementation

**Files:**
- Create: `app/src/service/achievementNotifier.js`

- [ ] **Step 1: Create the helper**

Create `app/src/service/achievementNotifier.js` with:

```js
const mysql = require("../util/mysql");
const { DefaultLogger } = require("../util/Logger");

const DEFAULT_TEMPLATE_WITH_REWARD =
  "🎉 {user} 解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石";
const DEFAULT_TEMPLATE_NO_REWARD = "🎉 {user} 解鎖成就「{icon} {name}」！";
const FALLBACK_NAME = "玩家";

async function getDisplayName(userId) {
  const row = await mysql("user")
    .where({ platform_id: userId })
    .select("display_name")
    .first();
  return (row && row.display_name) || FALLBACK_NAME;
}

function renderTemplate(achievement, userName) {
  const fallback =
    achievement.reward_stones > 0 ? DEFAULT_TEMPLATE_WITH_REWARD : DEFAULT_TEMPLATE_NO_REWARD;
  const tpl = achievement.notify_message || fallback;
  return tpl
    .replace(/\{user\}/g, userName)
    .replace(/\{name\}/g, achievement.name)
    .replace(/\{icon\}/g, achievement.icon)
    .replace(/\{reward\}/g, String(achievement.reward_stones));
}

async function notifyUnlocks(context, userId, achievements) {
  try {
    const toNotify = (achievements || []).filter(a => a && a.notify_on_unlock);
    if (!toNotify.length) return;
    const userName = await getDisplayName(userId);
    for (const a of toNotify) {
      context.replyText(renderTemplate(a, userName));
    }
  } catch (err) {
    DefaultLogger.error("achievementNotifier.notifyUnlocks error:", err);
  }
}

module.exports = { notifyUnlocks, renderTemplate };
```

- [ ] **Step 2: Run tests to verify they pass**

Run from `app/`:
```bash
yarn test -- achievementNotifier
```

Expected: all seven cases pass.

- [ ] **Step 3: Commit**

```bash
git add app/src/service/achievementNotifier.js app/__tests__/service/achievementNotifier.test.js
git commit -m "feat(achievement): add achievementNotifier with templated unlock replies"
```

---

## Task 8: Wire Notifier Into `statistics` Middleware

**Files:**
- Modify: `app/src/middleware/statistics.js`

- [ ] **Step 1: Add imports**

At the top of `app/src/middleware/statistics.js`, below the existing requires, add:

```js
const { get } = require("lodash");
const { notifyUnlocks } = require("../service/achievementNotifier");
```

> **Verify:** `lodash` is used elsewhere in the project (e.g. `app/src/controller/application/MarketController.js`), so the dependency is already present.

- [ ] **Step 2: Replace the `chat_message` block**

Replace the current `if (context.event.isText) { ... }` block with:

```js
if (context.event.isText) {
  const userId = context.event.source.userId;
  const groupId = context.event.source.groupId;
  if (userId) {
    const mentionees = get(context, "event.message.mention.mentionees", []) || [];
    const mentionedUserIds = mentionees.map(m => m && m.userId).filter(Boolean);
    const text = context.event.text || "";

    const tasks = [
      AchievementEngine.evaluate(userId, "chat_message", { groupId, text }).catch(() => ({
        unlocked: [],
      })),
    ];
    if (mentionedUserIds.length) {
      tasks.push(
        AchievementEngine.evaluate(userId, "mention_keyword", {
          mentionedUserIds,
          text,
        }).catch(() => ({ unlocked: [] }))
      );
    }

    const results = await Promise.all(tasks);
    const unlocked = results.flatMap(r => (r && r.unlocked) || []);
    await notifyUnlocks(context, userId, unlocked);
  }
}
```

- [ ] **Step 3: Lint**

Run from `app/`:
```bash
yarn lint
```

Expected: no errors for `src/middleware/statistics.js`.

- [ ] **Step 4: Run tests**

Run from `app/`:
```bash
yarn test
```

Expected: full suite passes.

- [ ] **Step 5: Commit**

```bash
git add app/src/middleware/statistics.js
git commit -m "feat(achievement): fire mention_keyword + notify unlocks from statistics"
```

---

## Task 9: Consume Notifier in `gacha.js`

**Files:**
- Modify: `app/src/controller/princess/gacha.js:476` (the `AchievementEngine.evaluate` call)

- [ ] **Step 1: Add import**

At the top of `app/src/controller/princess/gacha.js`, near the existing `AchievementEngine` require, add:

```js
const { notifyUnlocks } = require("../../service/achievementNotifier");
```

- [ ] **Step 2: Replace the evaluate call**

Replace lines around 476 (`AchievementEngine.evaluate(userId, "gacha_pull", { ... }).catch(() => {});`) with:

```js
const { unlocked } = await AchievementEngine.evaluate(userId, "gacha_pull", {
  threeStarCount: rareCount[3] || 0,
  uniqueCount: dailyResult.ownCharactersCount + dailyResult.newCharacters.length,
}).catch(() => ({ unlocked: [] }));
await notifyUnlocks(context, userId, unlocked);
```

> The original call was fire-and-forget; now it is awaited. If the surrounding function is not already `async`, verify before committing (it must be, because other awaits exist in this controller — grep `grep -n "async" app/src/controller/princess/gacha.js`).

- [ ] **Step 3: Lint**

Run from `app/`:
```bash
yarn lint
```

Expected: no errors.

- [ ] **Step 4: Run tests**

Run from `app/`:
```bash
yarn test
```

Expected: full suite passes.

- [ ] **Step 5: Commit**

```bash
git add app/src/controller/princess/gacha.js
git commit -m "feat(achievement): await gacha evaluate + notify unlocks"
```

---

## Task 10: Consume Notifier in `JankenController.js`

**Files:**
- Modify: `app/src/controller/application/JankenController.js:267-268` and `436-437`

- [ ] **Step 1: Add import**

At the top of `app/src/controller/application/JankenController.js`, near the existing `AchievementEngine` require, add:

```js
const { notifyUnlocks } = require("../../service/achievementNotifier");
```

- [ ] **Step 2: Replace the first pair of calls (lines ~267-268)**

Replace:

```js
AchievementEngine.evaluate(winnerId, "janken_win", { streak: winnerStreak }).catch(() => {});
AchievementEngine.evaluate(targetUserId, "janken_challenge", {}).catch(() => {});
```

With:

```js
const [winResult, challengeResult] = await Promise.all([
  AchievementEngine.evaluate(winnerId, "janken_win", { streak: winnerStreak }).catch(() => ({
    unlocked: [],
  })),
  AchievementEngine.evaluate(targetUserId, "janken_challenge", {}).catch(() => ({
    unlocked: [],
  })),
]);
await notifyUnlocks(context, winnerId, winResult.unlocked);
await notifyUnlocks(context, targetUserId, challengeResult.unlocked);
```

- [ ] **Step 3: Replace the second pair of calls (lines ~436-437)**

Apply the same transformation using the local variable names at that call site (`holderUserId` / `challengerUserId`). Use them in the `notifyUnlocks` call so the correct user's display name is looked up:

```js
const [winResult, challengeResult] = await Promise.all([
  AchievementEngine.evaluate(winnerId, "janken_win", { streak: winnerStreak }).catch(() => ({
    unlocked: [],
  })),
  AchievementEngine.evaluate(challengerUserId, "janken_challenge", {}).catch(() => ({
    unlocked: [],
  })),
]);
await notifyUnlocks(context, winnerId, winResult.unlocked);
await notifyUnlocks(context, challengerUserId, challengeResult.unlocked);
```

- [ ] **Step 4: Lint**

Run from `app/`:
```bash
yarn lint
```

Expected: no errors.

- [ ] **Step 5: Run tests**

Run from `app/`:
```bash
yarn test
```

Expected: full suite passes.

- [ ] **Step 6: Commit**

```bash
git add app/src/controller/application/JankenController.js
git commit -m "feat(achievement): await janken evaluate + notify unlocks"
```

---

## Task 11: Consume Notifier in `SubscribeController.js`

**Files:**
- Modify: `app/src/controller/application/SubscribeController.js:85` and `:255`

- [ ] **Step 1: Add import**

At the top of `app/src/controller/application/SubscribeController.js`, near the existing `AchievementEngine` require, add:

```js
const { notifyUnlocks } = require("../../service/achievementNotifier");
```

- [ ] **Step 2: Replace first call (line ~85)**

Replace:

```js
AchievementEngine.evaluate(userId, "subscribe").catch(() => {});
```

With:

```js
const { unlocked } = await AchievementEngine.evaluate(userId, "subscribe").catch(() => ({
  unlocked: [],
}));
await notifyUnlocks(context, userId, unlocked);
```

- [ ] **Step 3: Replace second call (line ~255)**

Apply the same replacement at the second occurrence. If the enclosing function lacks a `context` parameter, propagate it from the caller; grep the file to confirm the signature and adjust if necessary.

- [ ] **Step 4: Lint**

Run from `app/`:
```bash
yarn lint
```

Expected: no errors.

- [ ] **Step 5: Run tests**

Run from `app/`:
```bash
yarn test
```

Expected: full suite passes.

- [ ] **Step 6: Commit**

```bash
git add app/src/controller/application/SubscribeController.js
git commit -m "feat(achievement): await subscribe evaluate + notify unlocks"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

Run from `app/`:
```bash
yarn test
```

Expected: all tests pass.

- [ ] **Step 2: Lint full codebase**

Run from `app/`:
```bash
yarn lint
```

Expected: no new errors.

- [ ] **Step 3: Smoke-test a mention unlock locally**

Using the dev server (`yarn dev`) and a LINE test group:

1. Insert a test achievement row:
   ```sql
   INSERT INTO achievements
     (category_id, key, name, description, icon, type, rarity, target_value, reward_stones, `order`, `condition`, notify_on_unlock)
   VALUES
     ((SELECT id FROM achievement_categories WHERE `key`='social'),
      'mention_admin_hi', '管理員粉絲', '與管理員打招呼', '🫡',
      'hidden', 2, 1, 100, 99,
      JSON_OBJECT('targetUserIds', JSON_ARRAY('<your-admin-userId>'),
                  'keywords', JSON_ARRAY('大大好')),
      TRUE);
   ```
2. In a LINE group with the bot, @mention the admin userId and send the message `大大好`.
3. Confirm the bot replies with `🎉 <你的名字> 解鎖成就「🫡 管理員粉絲」！獲得 100 顆女神石`.
4. Confirm the achievement shows up as unlocked in the admin dashboard.

If the smoke test passes, proceed. If it fails, diagnose via `make logs` and `DefaultLogger` output.

- [ ] **Step 4: Merge / PR per repository convention**

Follow the project's PR workflow (see `docs/features/commit-and-pr.md` or equivalent). Do not self-merge.

---

## Self-Review Notes

- All spec sections are covered: schema (Task 1), engine return (Tasks 2-3), new trigger (Tasks 4-5), notifier (Tasks 6-7), dispatch + call-site updates (Tasks 8-11), verification (Task 12).
- No TBD/TODO placeholders; every code step contains the full code.
- Property names are consistent across tasks: `notify_on_unlock`, `notify_message`, `condition.targetUserIds`, `condition.keywords`, `{ unlocked }`.
- `condition.targetUserIds` and `condition.keywords` use `every` semantics throughout (Tasks 4-5 tests and strategy agree).
- Default fallback names consistent: `玩家` in both spec and Task 7 implementation + Task 6 tests.
