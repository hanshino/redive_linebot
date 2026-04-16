# Achievement System Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old `advancement` system with two independent subsystems — permanent achievements and dynamic titles — including a new frontend achievement wall and redesigned LINE Flex Messages.

**Architecture:** Six new database tables, a central AchievementEngine service for evaluating unlocks (event-based + cron-based), new models/controller/templates following existing Bottender patterns, REST API endpoints for the React frontend, and a Steam-style grid wall page. The old advancement system is fully removed.

**Tech Stack:** Node.js (CommonJS), Knex (MySQL), Bottender (LINE), Express, React 17, Material-UI, axios

**Spec:** `docs/superpowers/specs/2026-04-15-achievement-system-revamp-design.md`

---

## File Structure

### New Files

```
app/
├── migrations/
│   ├── YYYYMMDD_create_achievement_categories_table.js
│   ├── YYYYMMDD_create_achievements_table.js
│   ├── YYYYMMDD_create_user_achievements_table.js
│   ├── YYYYMMDD_create_user_achievement_progress_table.js
│   ├── YYYYMMDD_create_titles_table.js
│   ├── YYYYMMDD_create_user_titles_table.js
│   ├── YYYYMMDD_seed_achievement_data.js
│   └── YYYYMMDD_drop_old_advancement_tables.js
├── src/
│   ├── model/application/
│   │   ├── AchievementCategory.js
│   │   ├── Achievement.js
│   │   ├── UserAchievement.js
│   │   ├── UserAchievementProgress.js
│   │   ├── Title.js
│   │   └── UserTitle.js
│   ├── controller/application/
│   │   └── AchievementController.js  (replace old)
│   ├── service/
│   │   └── AchievementEngine.js
│   └── templates/application/
│       └── Achievement.js  (replace old)
├── bin/
│   ├── AchievementCron.js
│   └── TitleDelivery.js
└── __tests__/
    ├── service/AchievementEngine.test.js
    └── model/Achievement.test.js

frontend/src/
├── pages/Achievement/
│   └── index.jsx
└── services/
    └── achievement.js
```

### Modified Files

```
app/src/app.js                          — Replace AdvancementController import/router
app/src/router/api.js                   — Add /api/achievements + /api/titles routes
app/src/controller/application/ChatLevelController.js  — Replace advancement with title
app/src/controller/princess/GachaController.js         — Add evaluate() call
app/src/controller/application/JankenController.js     — Add evaluate() call
app/src/middleware/umamiTrack.js         — Update tracking pattern
app/config/crontab.config.js            — Replace old cron entry
app/config/default.json                 — Add achievement config, keep title config
app/locales/zh_tw.json                  — Replace advancement i18n entries
frontend/src/App.jsx                    — Add /achievements route
```

### Deleted Files

```
app/src/model/application/Advancement.js
app/src/templates/application/Advancement.js
app/bin/AdvancementDelivery.js
```

---

## Task 1: Database Migrations — New Tables

**Files:**
- Create: `app/migrations/*_create_achievement_categories_table.js`
- Create: `app/migrations/*_create_achievements_table.js`
- Create: `app/migrations/*_create_user_achievements_table.js`
- Create: `app/migrations/*_create_user_achievement_progress_table.js`
- Create: `app/migrations/*_create_titles_table.js`
- Create: `app/migrations/*_create_user_titles_table.js`

- [ ] **Step 1: Create achievement_categories migration**

```bash
cd app && yarn knex migrate:make create_achievement_categories_table
```

Edit the generated file:

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("achievement_categories", table => {
    table.increments("id").primary();
    table.string("key", 50).notNullable().unique().comment("分類識別鍵");
    table.string("name", 50).notNullable().comment("顯示名稱");
    table.string("icon", 100).notNullable().comment("分類圖示");
    table.tinyint("order").notNullable().defaultTo(0).comment("排序");
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("achievement_categories");
};
```

- [ ] **Step 2: Create achievements migration**

```bash
cd app && yarn knex migrate:make create_achievements_table
```

Edit the generated file:

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("achievements", table => {
    table.increments("id").primary();
    table.integer("category_id").unsigned().notNullable().comment("分類 ID");
    table.string("key", 100).notNullable().unique().comment("成就識別鍵");
    table.string("name", 100).notNullable().comment("顯示名稱");
    table.string("description", 255).notNullable().comment("達成條件描述");
    table.string("icon", 100).notNullable().comment("成就圖示");
    table
      .enum("type", ["milestone", "challenge", "hidden", "social"])
      .notNullable()
      .comment("成就類型");
    table.tinyint("rarity").notNullable().defaultTo(0).comment("稀有度 0-3");
    table.integer("target_value").notNullable().defaultTo(1).comment("達成目標值");
    table.integer("reward_stones").notNullable().defaultTo(0).comment("獎勵女神石");
    table.tinyint("order").notNullable().defaultTo(0).comment("同分類內排序");
    table.timestamps(true, true);

    table.foreign("category_id").references("achievement_categories.id");
    table.index("category_id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("achievements");
};
```

- [ ] **Step 3: Create user_achievements migration**

```bash
cd app && yarn knex migrate:make create_user_achievements_table
```

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_achievements", table => {
    table.increments("id").primary();
    table.string("user_id", 50).notNullable().comment("LINE user ID");
    table.integer("achievement_id").unsigned().notNullable().comment("成就 ID");
    table.timestamp("unlocked_at").notNullable().defaultTo(knex.fn.now()).comment("解鎖時間");

    table.unique(["user_id", "achievement_id"]);
    table.index("user_id");
    table.foreign("achievement_id").references("achievements.id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_achievements");
};
```

- [ ] **Step 4: Create user_achievement_progress migration**

```bash
cd app && yarn knex migrate:make create_user_achievement_progress_table
```

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_achievement_progress", table => {
    table.increments("id").primary();
    table.string("user_id", 50).notNullable().comment("LINE user ID");
    table.integer("achievement_id").unsigned().notNullable().comment("成就 ID");
    table.integer("current_value").notNullable().defaultTo(0).comment("目前進度");
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now()).comment("最後更新");

    table.unique(["user_id", "achievement_id"]);
    table.index("user_id");
    table.foreign("achievement_id").references("achievements.id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_achievement_progress");
};
```

- [ ] **Step 5: Create titles migration**

```bash
cd app && yarn knex migrate:make create_titles_table
```

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("titles", table => {
    table.increments("id").primary();
    table.string("key", 100).notNullable().unique().comment("稱號識別鍵");
    table.string("name", 100).notNullable().comment("顯示名稱");
    table.string("description", 255).notNullable().comment("說明");
    table.string("icon", 100).notNullable().comment("圖示");
    table.tinyint("rarity").notNullable().defaultTo(0).comment("稀有度 0-3");
    table.tinyint("order").notNullable().defaultTo(0).comment("排序");
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("titles");
};
```

- [ ] **Step 6: Create user_titles migration**

```bash
cd app && yarn knex migrate:make create_user_titles_table
```

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_titles", table => {
    table.increments("id").primary();
    table.string("user_id", 50).notNullable().comment("LINE user ID");
    table.integer("title_id").unsigned().notNullable().comment("稱號 ID");
    table.timestamp("granted_at").notNullable().defaultTo(knex.fn.now()).comment("授予時間");

    table.unique(["user_id", "title_id"]);
    table.index("user_id");
    table.foreign("title_id").references("titles.id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_titles");
};
```

- [ ] **Step 7: Run migrations**

```bash
cd app && yarn migrate
```

Expected: All 6 tables created successfully.

- [ ] **Step 8: Commit**

```bash
git add app/migrations/
git commit -m "feat(achievement): create database tables for achievement and title systems"
```

---

## Task 2: Models

**Files:**
- Create: `app/src/model/application/AchievementCategory.js`
- Create: `app/src/model/application/Achievement.js` (new file, replaces old Advancement.js)
- Create: `app/src/model/application/UserAchievement.js`
- Create: `app/src/model/application/UserAchievementProgress.js`
- Create: `app/src/model/application/Title.js`
- Create: `app/src/model/application/UserTitle.js`

- [ ] **Step 1: Create AchievementCategory model**

Create `app/src/model/application/AchievementCategory.js`:

```javascript
const Base = require("../base");

const TABLE = "achievement_categories";
const fillable = ["key", "name", "icon", "order"];

class AchievementCategory extends Base {}

const model = new AchievementCategory({ table: TABLE, fillable });

exports.model = model;

exports.all = async () => {
  return model.all({ order: [{ column: "order", direction: "asc" }] });
};

exports.findByKey = async key => {
  return model.first({ filter: { key } });
};
```

- [ ] **Step 2: Create Achievement model**

Create `app/src/model/application/Achievement.js` (NEW file — the old `Advancement.js` is deleted in Task 10):

```javascript
const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "achievements";
const fillable = [
  "category_id",
  "key",
  "name",
  "description",
  "icon",
  "type",
  "rarity",
  "target_value",
  "reward_stones",
  "order",
];

class Achievement extends Base {}

const model = new Achievement({ table: TABLE, fillable });

exports.model = model;

exports.all = async (options = {}) => {
  return model.all(options);
};

exports.find = async id => {
  return model.find(id);
};

exports.findByKey = async key => {
  return model.first({ filter: { key } });
};

exports.allWithCategories = async () => {
  return mysql(TABLE)
    .join("achievement_categories", "achievements.category_id", "achievement_categories.id")
    .select(
      "achievements.*",
      "achievement_categories.key as category_key",
      "achievement_categories.name as category_name",
      "achievement_categories.icon as category_icon"
    )
    .orderBy([
      { column: "achievement_categories.order", order: "asc" },
      { column: "achievements.order", order: "asc" },
    ]);
};

exports.findByType = async type => {
  return model.all({ filter: { type } });
};

exports.getStats = async () => {
  const totalUsers = await mysql("user").count({ count: "*" }).first();
  const stats = await mysql("user_achievements")
    .select("achievement_id")
    .count({ unlock_count: "id" })
    .groupBy("achievement_id");

  return stats.map(s => ({
    achievement_id: s.achievement_id,
    unlock_count: s.unlock_count,
    total_users: totalUsers.count,
    unlock_rate: totalUsers.count > 0 ? (s.unlock_count / totalUsers.count) * 100 : 0,
  }));
};
```

- [ ] **Step 3: Create UserAchievement model**

Create `app/src/model/application/UserAchievement.js`:

```javascript
const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "user_achievements";
const fillable = ["user_id", "achievement_id", "unlocked_at"];

class UserAchievement extends Base {}

const model = new UserAchievement({ table: TABLE, fillable });

exports.model = model;

exports.findByUser = async userId => {
  return mysql(TABLE)
    .join("achievements", "user_achievements.achievement_id", "achievements.id")
    .join("achievement_categories", "achievements.category_id", "achievement_categories.id")
    .where("user_achievements.user_id", userId)
    .select(
      "achievements.*",
      "user_achievements.unlocked_at",
      "achievement_categories.key as category_key",
      "achievement_categories.name as category_name"
    )
    .orderBy("user_achievements.unlocked_at", "desc");
};

exports.isUnlocked = async (userId, achievementId) => {
  const row = await mysql(TABLE).where({ user_id: userId, achievement_id: achievementId }).first();
  return !!row;
};

exports.unlock = async (userId, achievementId) => {
  const existing = await mysql(TABLE)
    .where({ user_id: userId, achievement_id: achievementId })
    .first();
  if (existing) return;
  return mysql(TABLE).insert({ user_id: userId, achievement_id: achievementId });
};

exports.countByUser = async userId => {
  const result = await mysql(TABLE).where({ user_id: userId }).count({ count: "id" }).first();
  return result.count;
};

exports.getRecentByUser = async (userId, limit = 3) => {
  return mysql(TABLE)
    .join("achievements", "user_achievements.achievement_id", "achievements.id")
    .where("user_achievements.user_id", userId)
    .select("achievements.*", "user_achievements.unlocked_at")
    .orderBy("user_achievements.unlocked_at", "desc")
    .limit(limit);
};
```

- [ ] **Step 4: Create UserAchievementProgress model**

Create `app/src/model/application/UserAchievementProgress.js`:

```javascript
const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "user_achievement_progress";
const fillable = ["user_id", "achievement_id", "current_value"];

class UserAchievementProgress extends Base {}

const model = new UserAchievementProgress({ table: TABLE, fillable });

exports.model = model;

exports.getProgress = async (userId, achievementId) => {
  return mysql(TABLE).where({ user_id: userId, achievement_id: achievementId }).first();
};

exports.upsert = async (userId, achievementId, currentValue) => {
  const existing = await mysql(TABLE)
    .where({ user_id: userId, achievement_id: achievementId })
    .first();

  if (existing) {
    return mysql(TABLE)
      .where({ user_id: userId, achievement_id: achievementId })
      .update({ current_value: currentValue, updated_at: mysql.fn.now() });
  }

  return mysql(TABLE).insert({
    user_id: userId,
    achievement_id: achievementId,
    current_value: currentValue,
  });
};

exports.increment = async (userId, achievementId, amount = 1) => {
  const existing = await mysql(TABLE)
    .where({ user_id: userId, achievement_id: achievementId })
    .first();

  if (existing) {
    return mysql(TABLE)
      .where({ user_id: userId, achievement_id: achievementId })
      .update({
        current_value: mysql.raw("current_value + ?", [amount]),
        updated_at: mysql.fn.now(),
      });
  }

  return mysql(TABLE).insert({
    user_id: userId,
    achievement_id: achievementId,
    current_value: amount,
  });
};

exports.delete = async (userId, achievementId) => {
  return mysql(TABLE).where({ user_id: userId, achievement_id: achievementId }).delete();
};

exports.findByUser = async userId => {
  return mysql(TABLE)
    .join("achievements", "user_achievement_progress.achievement_id", "achievements.id")
    .where("user_achievement_progress.user_id", userId)
    .select("achievements.*", "user_achievement_progress.current_value");
};

exports.getNearCompletion = async (userId, limit = 2) => {
  return mysql(TABLE)
    .join("achievements", "user_achievement_progress.achievement_id", "achievements.id")
    .leftJoin("user_achievements", function () {
      this.on("user_achievements.user_id", "user_achievement_progress.user_id").andOn(
        "user_achievements.achievement_id",
        "user_achievement_progress.achievement_id"
      );
    })
    .whereNull("user_achievements.id")
    .where("user_achievement_progress.user_id", userId)
    .where("achievements.type", "!=", "hidden")
    .select(
      "achievements.*",
      "user_achievement_progress.current_value",
      mysql.raw(
        "ROUND(user_achievement_progress.current_value / achievements.target_value * 100) as percentage"
      )
    )
    .orderBy("percentage", "desc")
    .limit(limit);
};
```

- [ ] **Step 5: Create Title model**

Create `app/src/model/application/Title.js`:

```javascript
const Base = require("../base");

const TABLE = "titles";
const fillable = ["key", "name", "description", "icon", "rarity", "order"];

class Title extends Base {}

const model = new Title({ table: TABLE, fillable });

exports.model = model;

exports.all = async () => {
  return model.all({ order: [{ column: "order", direction: "asc" }] });
};

exports.findByKey = async key => {
  return model.first({ filter: { key } });
};
```

- [ ] **Step 6: Create UserTitle model**

Create `app/src/model/application/UserTitle.js`:

```javascript
const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "user_titles";
const fillable = ["user_id", "title_id", "granted_at"];

class UserTitle extends Base {}

const model = new UserTitle({ table: TABLE, fillable });

exports.model = model;

exports.findByUser = async userId => {
  return mysql(TABLE)
    .join("titles", "user_titles.title_id", "titles.id")
    .where("user_titles.user_id", userId)
    .select("titles.*", "user_titles.granted_at")
    .orderBy("titles.order", "asc");
};

exports.clearAll = async trx => {
  const db = trx || mysql;
  return db(TABLE).delete();
};

exports.grant = async (userId, titleId, trx) => {
  const db = trx || mysql;
  const existing = await db(TABLE).where({ user_id: userId, title_id: titleId }).first();
  if (existing) return;
  return db(TABLE).insert({ user_id: userId, title_id: titleId });
};

exports.grantByPlatformId = async (platformId, titleId, trx) => {
  const db = trx || mysql;
  return db(TABLE).insert({
    user_id: platformId,
    title_id: titleId,
  });
};
```

- [ ] **Step 7: Commit**

```bash
git add app/src/model/application/AchievementCategory.js \
       app/src/model/application/Achievement.js \
       app/src/model/application/UserAchievement.js \
       app/src/model/application/UserAchievementProgress.js \
       app/src/model/application/Title.js \
       app/src/model/application/UserTitle.js
git commit -m "feat(achievement): add models for achievement and title systems"
```

**Note:** The old `Advancement.js` model still exists at this point. It will be removed in Task 10. The new `Achievement.js` has a different name so there is no filename conflict.

---

## Task 3: AchievementEngine Service

**Files:**
- Create: `app/src/service/AchievementEngine.js`
- Create: `app/__tests__/service/AchievementEngine.test.js`

- [ ] **Step 1: Write AchievementEngine test**

Create `app/__tests__/service/AchievementEngine.test.js`:

```javascript
const AchievementEngine = require("../../src/service/AchievementEngine");

// Mock all model dependencies
jest.mock("../../src/model/application/Achievement", () => ({
  allWithCategories: jest.fn(),
  findByKey: jest.fn(),
  findByType: jest.fn(),
  getStats: jest.fn(),
}));
jest.mock("../../src/model/application/UserAchievement", () => ({
  findByUser: jest.fn(),
  isUnlocked: jest.fn(),
  unlock: jest.fn(),
  countByUser: jest.fn(),
  getRecentByUser: jest.fn(),
}));
jest.mock("../../src/model/application/UserAchievementProgress", () => ({
  getProgress: jest.fn(),
  upsert: jest.fn(),
  increment: jest.fn(),
  delete: jest.fn(),
  findByUser: jest.fn(),
  getNearCompletion: jest.fn(),
}));
jest.mock("../../src/model/application/AchievementCategory", () => ({
  all: jest.fn(),
}));
jest.mock("../../src/util/redis", () => ({
  get: jest.fn(),
  set: jest.fn(),
}));
jest.mock("../../src/util/mysql", () => {
  const knex = jest.fn(() => ({
    insert: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    first: jest.fn(),
    select: jest.fn().mockReturnThis(),
  }));
  knex.fn = { now: jest.fn() };
  knex.raw = jest.fn();
  return knex;
});

const AchievementModel = require("../../src/model/application/Achievement");
const UserAchievementModel = require("../../src/model/application/UserAchievement");
const UserProgressModel = require("../../src/model/application/UserAchievementProgress");
const CategoryModel = require("../../src/model/application/AchievementCategory");

describe("AchievementEngine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Populate the in-memory cache for tests
    AchievementEngine._setCache([
      { id: 1, key: "chat_100", type: "milestone", target_value: 100, reward_stones: 50 },
      { id: 2, key: "chat_1000", type: "milestone", target_value: 1000, reward_stones: 200 },
    ]);
  });

  describe("evaluate", () => {
    it("should skip if user already unlocked the achievement", async () => {
      UserAchievementModel.isUnlocked.mockResolvedValue(true);

      await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("should update progress and not unlock if below target", async () => {
      UserAchievementModel.isUnlocked.mockResolvedValue(false);
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 50 });
      UserProgressModel.upsert.mockResolvedValue();

      await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(UserProgressModel.upsert).toHaveBeenCalledWith("user1", 1, 51);
      expect(UserAchievementModel.unlock).not.toHaveBeenCalled();
    });

    it("should unlock when progress reaches target", async () => {
      UserAchievementModel.isUnlocked.mockResolvedValue(false);
      UserProgressModel.getProgress.mockResolvedValue({ current_value: 99 });
      UserProgressModel.upsert.mockResolvedValue();
      UserAchievementModel.unlock.mockResolvedValue();
      UserProgressModel.delete.mockResolvedValue();

      await AchievementEngine.evaluate("user1", "chat_message", {});

      expect(UserAchievementModel.unlock).toHaveBeenCalledWith("user1", 1);
      expect(UserProgressModel.delete).toHaveBeenCalledWith("user1", 1);
    });
  });

  describe("getUserSummary", () => {
    it("should return structured summary", async () => {
      AchievementModel.allWithCategories.mockResolvedValue([
        { id: 1, key: "chat_100", type: "milestone", name: "話匣子", category_key: "chat" },
        { id: 2, key: "chat_night_owl", type: "hidden", name: "夜貓子", category_key: "chat" },
      ]);
      CategoryModel.all.mockResolvedValue([{ id: 1, key: "chat", name: "聊天" }]);
      UserAchievementModel.findByUser.mockResolvedValue([
        { id: 1, key: "chat_100", name: "話匣子", unlocked_at: new Date() },
      ]);
      UserAchievementModel.countByUser.mockResolvedValue(1);
      UserProgressModel.findByUser.mockResolvedValue([]);
      UserAchievementModel.getRecentByUser.mockResolvedValue([]);
      UserProgressModel.getNearCompletion.mockResolvedValue([]);

      const summary = await AchievementEngine.getUserSummary("user1");

      expect(summary).toHaveProperty("total", 2);
      expect(summary).toHaveProperty("unlocked", 1);
      expect(summary).toHaveProperty("percentage", 50);
      expect(summary).toHaveProperty("categories");
      expect(summary).toHaveProperty("recentUnlocks");
      expect(summary).toHaveProperty("nearCompletion");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && yarn test __tests__/service/AchievementEngine.test.js
```

Expected: FAIL — `Cannot find module '../../src/service/AchievementEngine'`

- [ ] **Step 3: Write AchievementEngine service**

Create `app/src/service/AchievementEngine.js`:

```javascript
const AchievementModel = require("../model/application/Achievement");
const UserAchievementModel = require("../model/application/UserAchievement");
const UserProgressModel = require("../model/application/UserAchievementProgress");
const CategoryModel = require("../model/application/AchievementCategory");
const { DefaultLogger } = require("../util/Logger");
const mysql = require("../util/mysql");
const redis = require("../util/redis");

// --- In-memory cache for achievement definitions (24 rows, rarely changes) ---
let achievementCache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getCache() {
  if (achievementCache && Date.now() < cacheExpiry) return achievementCache;
  achievementCache = await AchievementModel.allWithCategories();
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return achievementCache;
}

// For testing: allow injecting cache directly
exports._setCache = (data) => {
  achievementCache = data;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
};

// Maps event types to achievement keys
const EVENT_ACHIEVEMENT_MAP = {
  chat_message: ["chat_100", "chat_1000", "chat_5000", "chat_night_owl", "chat_multi_group"],
  gacha_pull: ["gacha_first", "gacha_100", "gacha_500", "gacha_collector_50", "gacha_lucky"],
  janken_win: ["janken_first_win", "janken_win_50", "janken_streak_5", "janken_streak_10"],
  janken_lose: [],
  janken_draw: [],
  janken_challenge: ["janken_challenged_10"],
  boss_attack: ["boss_first_kill", "boss_level_10", "boss_level_50", "boss_top_damage"],
  command_use: ["social_first_command", "social_all_features"],
};

// --- Progress calculation strategies by achievement type ---
// Returns new progress value, or null to skip.

const STRATEGIES = {
  // Milestone: simple increment by 1 each event
  increment(currentValue) {
    return currentValue + 1;
  },

  // Instant: unlock immediately on first relevant event
  instant(currentValue, achievement) {
    return achievement.target_value;
  },

  // Context value: take a value directly from event context
  contextValue(currentValue, achievement, context, contextKey) {
    return context[contextKey] !== undefined ? context[contextKey] : currentValue;
  },

  // Threshold check: unlock if context value meets condition
  threshold(currentValue, achievement, context, contextKey, minValue) {
    return context[contextKey] >= minValue ? achievement.target_value : currentValue;
  },

  // Time check: unlock if current time matches condition
  timeWindow(currentValue, achievement, startHour, endHour) {
    const hour = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCHours(); // Asia/Taipei
    return hour >= startHour && hour < endHour ? achievement.target_value : currentValue;
  },
};

// Map each achievement key to its strategy call
const ACHIEVEMENT_STRATEGY = {
  chat_100: (cv, a) => STRATEGIES.increment(cv),
  chat_1000: (cv, a) => STRATEGIES.increment(cv),
  chat_5000: (cv, a) => STRATEGIES.increment(cv),
  chat_night_owl: (cv, a) => STRATEGIES.timeWindow(cv, a, 3, 4),
  chat_multi_group: "tracked_groups", // special: uses Redis tracking
  gacha_first: (cv, a) => STRATEGIES.instant(cv, a),
  gacha_100: (cv, a) => STRATEGIES.increment(cv),
  gacha_500: (cv, a) => STRATEGIES.increment(cv),
  gacha_collector_50: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "uniqueCount"),
  gacha_lucky: (cv, a, ctx) => STRATEGIES.threshold(cv, a, ctx, "threeStarCount", 3),
  janken_first_win: (cv, a) => STRATEGIES.instant(cv, a),
  janken_win_50: (cv, a) => STRATEGIES.increment(cv),
  janken_streak_5: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "streak"),
  janken_streak_10: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "streak"),
  janken_challenged_10: (cv, a) => STRATEGIES.increment(cv),
  boss_first_kill: (cv, a) => STRATEGIES.instant(cv, a),
  boss_level_10: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "level"),
  boss_level_50: (cv, a, ctx) => STRATEGIES.contextValue(cv, a, ctx, "level"),
  boss_top_damage: (cv, a, ctx) => ctx.isTopDamage ? a.target_value : cv,
  social_first_command: (cv, a) => STRATEGIES.instant(cv, a),
  social_all_features: "tracked_features", // special: uses Redis tracking
};

const REDIS_TTL = 90 * 24 * 60 * 60; // 90 days

/**
 * Evaluate achievements for a user after an event.
 * Fire-and-forget — errors are logged, never thrown.
 */
exports.evaluate = async (userId, eventType, context = {}) => {
  try {
    const achievementKeys = EVENT_ACHIEVEMENT_MAP[eventType];
    if (!achievementKeys || achievementKeys.length === 0) return;

    const cache = await getCache();

    for (const key of achievementKeys) {
      const achievement = cache.find(a => a.key === key);
      if (!achievement) continue;

      const alreadyUnlocked = await UserAchievementModel.isUnlocked(userId, achievement.id);
      if (alreadyUnlocked) continue;

      const newValue = await calculateProgress(userId, achievement, context);
      if (newValue === null) continue;

      await UserProgressModel.upsert(userId, achievement.id, newValue);

      if (newValue >= achievement.target_value) {
        await unlockAchievement(userId, achievement);
      }
    }
  } catch (err) {
    DefaultLogger.error("AchievementEngine.evaluate error:", err);
  }
};

async function calculateProgress(userId, achievement, context) {
  const progress = await UserProgressModel.getProgress(userId, achievement.id);
  const currentValue = progress ? progress.current_value : 0;

  const strategy = ACHIEVEMENT_STRATEGY[achievement.key];
  if (!strategy) return currentValue;

  // Special Redis-tracked achievements
  if (strategy === "tracked_groups") {
    return handleTrackedSet(userId, achievement.id, context.groupId, currentValue);
  }
  if (strategy === "tracked_features") {
    return handleTrackedSet(userId, achievement.id, context.feature, currentValue);
  }

  // Standard strategy function
  return strategy(currentValue, achievement, context);
}

// Shared handler for Redis-tracked unique sets (groups, features)
async function handleTrackedSet(userId, achievementId, newItem, currentValue) {
  if (!newItem) return currentValue;
  const redisKey = `achievement:tracked:${userId}:${achievementId}`;
  const data = await redis.get(redisKey);
  const items = data ? JSON.parse(data) : [];
  if (items.includes(newItem)) return currentValue;
  items.push(newItem);
  await redis.set(redisKey, JSON.stringify(items), { EX: REDIS_TTL });
  return currentValue + 1;
}

/**
 * Unlock an achievement and grant reward stones.
 */
async function unlockAchievement(userId, achievement) {
  await UserAchievementModel.unlock(userId, achievement.id);
  await UserProgressModel.delete(userId, achievement.id);

  if (achievement.reward_stones > 0) {
    // MySQL-compatible upsert for goddess stones
    const existing = await mysql("Inventory")
      .where({ userId, itemId: 999 })
      .first();
    if (existing) {
      await mysql("Inventory")
        .where({ userId, itemId: 999 })
        .update({ itemAmount: mysql.raw("itemAmount + ?", [achievement.reward_stones]) });
    } else {
      await mysql("Inventory")
        .insert({ userId, itemId: 999, itemAmount: achievement.reward_stones });
    }
  }

  DefaultLogger.info(
    `Achievement unlocked: ${achievement.key} for user ${userId} (+${achievement.reward_stones} stones)`
  );
}

// --- Query methods for controller/API ---

/**
 * Get full achievement summary for a user.
 */
exports.getUserSummary = async userId => {
  const [allAchievements, categories, unlocked, recentUnlocks, nearCompletion, progressList] =
    await Promise.all([
      AchievementModel.allWithCategories(),
      CategoryModel.all(),
      UserAchievementModel.findByUser(userId),
      UserAchievementModel.getRecentByUser(userId, 3),
      UserProgressModel.getNearCompletion(userId, 2),
      UserProgressModel.findByUser(userId),
    ]);

  const unlockedIds = new Set(unlocked.map(u => u.id));
  const progressMap = {};
  progressList.forEach(p => {
    progressMap[p.id] = p.current_value;
  });

  const total = allAchievements.length;
  const unlockedCount = unlocked.length;

  const categorySummary = categories.map(cat => {
    const catAchievements = allAchievements.filter(a => a.category_key === cat.key);
    const catUnlocked = catAchievements.filter(a => unlockedIds.has(a.id));
    return {
      ...cat,
      total: catAchievements.length,
      unlocked: catUnlocked.length,
      achievements: catAchievements.map(a => ({
        ...a,
        isUnlocked: unlockedIds.has(a.id),
        currentValue: progressMap[a.id] || 0,
        unlockedAt: unlocked.find(u => u.id === a.id)?.unlocked_at || null,
      })),
    };
  });

  return {
    total,
    unlocked: unlockedCount,
    percentage: total > 0 ? Math.round((unlockedCount / total) * 100) : 0,
    categories: categorySummary,
    recentUnlocks,
    nearCompletion,
  };
};

/**
 * Get global achievement stats (unlock rates).
 */
exports.getStats = async () => {
  return AchievementModel.getStats();
};

/**
 * Batch evaluate milestone achievements for all users (called by cron).
 * Uses batch queries to avoid N+1 problem.
 */
exports.batchEvaluate = async () => {
  DefaultLogger.info("AchievementEngine: starting batch evaluation");
  const cache = await getCache();

  // --- Chat milestones: batch query all users + all unlocks at once ---
  const chatAchievements = cache.filter(a =>
    ["chat_100", "chat_1000", "chat_5000"].includes(a.key)
  );
  if (chatAchievements.length > 0) {
    const chatUsers = await mysql("chat_user_data").select("platform_id", "talk_count");
    const chatAchievementIds = chatAchievements.map(a => a.id);

    // Batch fetch all existing unlocks for these achievements
    const existingUnlocks = await mysql("user_achievements")
      .whereIn("achievement_id", chatAchievementIds)
      .select("user_id", "achievement_id");
    const unlockedSet = new Set(existingUnlocks.map(u => `${u.user_id}:${u.achievement_id}`));

    for (const user of chatUsers) {
      const userId = user.platform_id;
      const count = user.talk_count || 0;
      for (const achievement of chatAchievements) {
        if (unlockedSet.has(`${userId}:${achievement.id}`)) continue;
        await UserProgressModel.upsert(userId, achievement.id, count);
        if (count >= achievement.target_value) {
          await unlockAchievement(userId, achievement);
        }
      }
    }
  }

  // --- Veteran achievement: batch check ---
  const veteranAchievement = cache.find(a => a.key === "social_veteran_30d");
  if (veteranAchievement) {
    const existingUnlocks = await mysql("user_achievements")
      .where("achievement_id", veteranAchievement.id)
      .select("user_id");
    const unlockedUserIds = new Set(existingUnlocks.map(u => u.user_id));

    const veterans = await mysql("user")
      .select("platform_id")
      .where("created_at", "<=", mysql.raw("DATE_SUB(NOW(), INTERVAL 30 DAY)"));

    for (const user of veterans) {
      if (unlockedUserIds.has(user.platform_id)) continue;
      await unlockAchievement(user.platform_id, veteranAchievement);
    }
  }

  DefaultLogger.info("AchievementEngine: batch evaluation complete");
};
```

- [ ] **Step 4: Run tests**

```bash
cd app && yarn test __tests__/service/AchievementEngine.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/service/AchievementEngine.js app/__tests__/service/AchievementEngine.test.js
git commit -m "feat(achievement): add AchievementEngine service with evaluate and batch logic"
```

---

## Task 4: Seed Data Migration

**Files:**
- Create: `app/migrations/*_seed_achievement_data.js`

- [ ] **Step 1: Create seed migration**

```bash
cd app && yarn knex migrate:make seed_achievement_data
```

Edit the generated file:

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const CATEGORIES = [
  { key: "chat", name: "聊天", icon: "💬", order: 1 },
  { key: "gacha", name: "轉蛋", icon: "🎰", order: 2 },
  { key: "janken", name: "猜拳", icon: "✊", order: 3 },
  { key: "world_boss", name: "世界王", icon: "👾", order: 4 },
  { key: "social", name: "社交", icon: "🌟", order: 5 },
];

const ACHIEVEMENTS = [
  // Chat
  { category: "chat", key: "chat_100", name: "話匣子", description: "累計發言 100 則", icon: "💬", type: "milestone", rarity: 0, target_value: 100, reward_stones: 50, order: 1 },
  { category: "chat", key: "chat_1000", name: "話題製造機", description: "累計發言 1,000 則", icon: "💬", type: "milestone", rarity: 1, target_value: 1000, reward_stones: 200, order: 2 },
  { category: "chat", key: "chat_5000", name: "鍵盤戰神", description: "累計發言 5,000 則", icon: "⌨️", type: "milestone", rarity: 2, target_value: 5000, reward_stones: 500, order: 3 },
  { category: "chat", key: "chat_night_owl", name: "夜貓子", description: "在凌晨 3-4 點發訊息", icon: "🦉", type: "hidden", rarity: 1, target_value: 1, reward_stones: 150, order: 4 },
  { category: "chat", key: "chat_multi_group", name: "社交蝴蝶", description: "在 5 個不同群組發言", icon: "🦋", type: "social", rarity: 1, target_value: 5, reward_stones: 200, order: 5 },

  // Gacha
  { category: "gacha", key: "gacha_first", name: "初次轉蛋", description: "第一次抽轉蛋", icon: "🎰", type: "milestone", rarity: 0, target_value: 1, reward_stones: 30, order: 1 },
  { category: "gacha", key: "gacha_100", name: "轉蛋達人", description: "累計抽 100 次", icon: "🎰", type: "milestone", rarity: 1, target_value: 100, reward_stones: 200, order: 2 },
  { category: "gacha", key: "gacha_500", name: "課金戰士", description: "累計抽 500 次", icon: "💎", type: "milestone", rarity: 2, target_value: 500, reward_stones: 500, order: 3 },
  { category: "gacha", key: "gacha_collector_50", name: "蒐藏新手", description: "收集 50 種不同角色", icon: "📦", type: "milestone", rarity: 1, target_value: 50, reward_stones: 200, order: 4 },
  { category: "gacha", key: "gacha_lucky", name: "歐洲人", description: "單次十連抽出 3 張以上 3★", icon: "🍀", type: "hidden", rarity: 3, target_value: 1, reward_stones: 300, order: 5 },

  // Janken
  { category: "janken", key: "janken_first_win", name: "出拳入門", description: "猜拳首勝", icon: "✊", type: "milestone", rarity: 0, target_value: 1, reward_stones: 30, order: 1 },
  { category: "janken", key: "janken_win_50", name: "猜拳好手", description: "累計贏 50 場", icon: "✊", type: "milestone", rarity: 1, target_value: 50, reward_stones: 200, order: 2 },
  { category: "janken", key: "janken_streak_5", name: "連勝新星", description: "連勝 5 場", icon: "🔥", type: "challenge", rarity: 1, target_value: 5, reward_stones: 200, order: 3 },
  { category: "janken", key: "janken_streak_10", name: "不敗拳王", description: "連勝 10 場", icon: "👑", type: "challenge", rarity: 2, target_value: 10, reward_stones: 500, order: 4 },
  { category: "janken", key: "janken_challenged_10", name: "眾矢之的", description: "被 10 個不同用戶挑戰", icon: "🎯", type: "social", rarity: 1, target_value: 10, reward_stones: 200, order: 5 },

  // World Boss
  { category: "world_boss", key: "boss_first_kill", name: "初陣", description: "第一次參與世界王", icon: "⚔️", type: "milestone", rarity: 0, target_value: 1, reward_stones: 50, order: 1 },
  { category: "world_boss", key: "boss_level_10", name: "見習勇者", description: "世界王等級達 10", icon: "🛡️", type: "milestone", rarity: 1, target_value: 10, reward_stones: 200, order: 2 },
  { category: "world_boss", key: "boss_level_50", name: "精英冒險者", description: "世界王等級達 50", icon: "⚔️", type: "milestone", rarity: 2, target_value: 50, reward_stones: 500, order: 3 },
  { category: "world_boss", key: "boss_top_damage", name: "一刀入魂", description: "任一場世界王戰鬥中傷害排名第一", icon: "💥", type: "hidden", rarity: 3, target_value: 1, reward_stones: 300, order: 4 },

  // Social
  { category: "social", key: "social_first_command", name: "指令新手", description: "第一次使用任何指令", icon: "📋", type: "milestone", rarity: 0, target_value: 1, reward_stones: 30, order: 1 },
  { category: "social", key: "social_all_features", name: "全能玩家", description: "使用過聊天/轉蛋/猜拳/世界王各一次", icon: "🏆", type: "challenge", rarity: 2, target_value: 4, reward_stones: 300, order: 2 },
  { category: "social", key: "social_veteran_30d", name: "老玩家", description: "註冊超過 30 天", icon: "📅", type: "milestone", rarity: 1, target_value: 1, reward_stones: 150, order: 3 },
  { category: "social", key: "social_invite_group", name: "推廣大使", description: "Bot 被邀請進群時你是群組成員", icon: "📢", type: "hidden", rarity: 1, target_value: 1, reward_stones: 200, order: 4 },
  { category: "social", key: "social_easter_egg", name: "彩蛋獵人", description: "觸發隱藏彩蛋指令", icon: "🥚", type: "hidden", rarity: 3, target_value: 1, reward_stones: 300, order: 5 },
];

const TITLES = [
  { key: "chat_king_1", name: "話語霸權", description: "聊天排名第一", icon: "👑", rarity: 2, order: 1 },
  { key: "chat_king_2", name: "話術小丑", description: "聊天排名第二", icon: "🤡", rarity: 1, order: 2 },
  { key: "chat_king_3", name: "話語大師", description: "聊天排名第三", icon: "🎓", rarity: 1, order: 3 },
  { key: "gacha_king_1", name: "轉蛋蒐藏家", description: "轉蛋收集排名第一", icon: "🎰", rarity: 2, order: 4 },
  { key: "gacha_king_2", name: "轉蛋藝術家", description: "轉蛋收集排名第二", icon: "🎨", rarity: 1, order: 5 },
  { key: "gacha_king_3", name: "轉蛋家", description: "轉蛋收集排名第三", icon: "🎲", rarity: 1, order: 6 },
  { key: "gacha_rich_1", name: "女神富豪", description: "女神石持有排名第一", icon: "💰", rarity: 2, order: 7 },
  { key: "gacha_rich_2", name: "女神貴族", description: "女神石持有排名第二", icon: "💎", rarity: 1, order: 8 },
  { key: "gacha_rich_3", name: "女神騎士", description: "女神石持有排名第三", icon: "🛡️", rarity: 1, order: 9 },
  { key: "janken_king", name: "拳王", description: "猜拳最高評分", icon: "👊", rarity: 2, order: 10 },
  { key: "janken_ruki", name: "猜拳小菜鳥", description: "猜拳新手", icon: "🐣", rarity: 0, order: 11 },
  { key: "janken_loser", name: "輸到脫褲", description: "猜拳最多敗場", icon: "😭", rarity: 0, order: 12 },
  { key: "janken_drawer", name: "平局高手", description: "猜拳最多平手", icon: "🤝", rarity: 0, order: 13 },
  { key: "progressors", name: "攻略組", description: "世界王等級前 1%", icon: "⚔️", rarity: 2, order: 14 },
  { key: "leechers", name: "躺分組", description: "世界王等級後 1%", icon: "😴", rarity: 0, order: 15 },
  { key: "system_manager", name: "至高神", description: "系統管理員", icon: "🌌", rarity: 3, order: 0 },
];

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  // Insert categories
  await knex("achievement_categories").insert(CATEGORIES);

  // Get category ID map
  const categories = await knex("achievement_categories").select("id", "key");
  const categoryMap = {};
  categories.forEach(c => {
    categoryMap[c.key] = c.id;
  });

  // Insert achievements
  const achievements = ACHIEVEMENTS.map(({ category, ...rest }) => ({
    ...rest,
    category_id: categoryMap[category],
  }));
  await knex("achievements").insert(achievements);

  // Insert titles
  await knex("titles").insert(TITLES);
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex("user_titles").delete();
  await knex("titles").delete();
  await knex("user_achievement_progress").delete();
  await knex("user_achievements").delete();
  await knex("achievements").delete();
  await knex("achievement_categories").delete();
};
```

- [ ] **Step 2: Run migration**

```bash
cd app && yarn migrate
```

Expected: Seed data inserted successfully.

- [ ] **Step 3: Commit**

```bash
git add app/migrations/
git commit -m "feat(achievement): seed initial achievement and title data"
```

---

## Task 5: Controller + LINE Templates

**Files:**
- Create: `app/src/controller/application/AchievementController.js` (new, replaces old)
- Create: `app/src/templates/application/Achievement.js` (new, replaces old)

- [ ] **Step 1: Write new Achievement template**

The old `app/src/templates/application/Advancement.js` will be deleted in Task 10. Create new template file at the same path (overwrite is fine since we're replacing it):

Create `app/src/templates/application/Achievement.js` as a NEW file — keep the old `Advancement.js` until Task 10:

```javascript
const RARITY_COLORS = {
  0: { bg: "#a0a0a0", text: "#ffffff" }, // Common
  1: { bg: "#6c5ce7", text: "#ffffff" }, // Rare
  2: { bg: "#ffd700", text: "#333333" }, // Epic
  3: { bg: "#fd79a8", text: "#ffffff" }, // Legendary
};

const RARITY_NAMES = {
  0: "普通",
  1: "稀有",
  2: "史詩",
  3: "傳說",
};

/**
 * Generate the summary card Flex Message for .成就 command.
 */
exports.generateSummaryFlex = ({ total, unlocked, percentage, recentUnlocks, nearCompletion }) => {
  const contents = [
    generateHeaderSection(unlocked, total, percentage),
    { type: "separator", margin: "lg" },
  ];

  if (recentUnlocks.length > 0) {
    contents.push(generateRecentSection(recentUnlocks));
    contents.push({ type: "separator", margin: "lg" });
  }

  if (nearCompletion.length > 0) {
    contents.push(generateNearCompletionSection(nearCompletion));
    contents.push({ type: "separator", margin: "lg" });
  }

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "成就系統", weight: "bold", size: "xl", color: "#ffffff" },
      ],
      backgroundColor: "#6c5ce7",
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents,
      spacing: "lg",
      paddingAll: "lg",
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "查看所有成就 →",
            uri: `${process.env.FRONTEND_URL || "https://redive.hanshino.dev"}/achievements`,
          },
          style: "primary",
          color: "#6c5ce7",
        },
      ],
    },
  };
};

function generateHeaderSection(unlocked, total, percentage) {
  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `${unlocked} / ${total}`,
        size: "xxl",
        weight: "bold",
        align: "center",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "vertical",
            contents: [{ type: "filler" }],
            width: `${percentage}%`,
            backgroundColor: "#6c5ce7",
            height: "6px",
            cornerRadius: "3px",
          },
        ],
        backgroundColor: "#e0e0e0",
        height: "6px",
        cornerRadius: "3px",
        margin: "md",
      },
      {
        type: "text",
        text: `${percentage}% 完成`,
        size: "xs",
        color: "#888888",
        align: "center",
        margin: "sm",
      },
    ],
  };
}

function generateRecentSection(recentUnlocks) {
  const items = recentUnlocks.map(achievement => {
    const rarity = RARITY_COLORS[achievement.rarity] || RARITY_COLORS[0];
    const rarityName = RARITY_NAMES[achievement.rarity] || "普通";
    const timeAgo = getTimeAgo(achievement.unlocked_at);

    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: achievement.icon, flex: 1, align: "center", gravity: "center" },
        {
          type: "box",
          layout: "vertical",
          flex: 6,
          contents: [
            { type: "text", text: achievement.name, size: "sm", weight: "bold" },
            { type: "text", text: timeAgo, size: "xxs", color: "#888888" },
          ],
        },
        {
          type: "text",
          text: `★ ${rarityName}`,
          size: "xxs",
          color: rarity.bg,
          flex: 2,
          align: "end",
          gravity: "center",
        },
      ],
      spacing: "sm",
    };
  });

  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "最近解鎖",
        size: "xs",
        color: "#888888",
        weight: "bold",
        margin: "md",
      },
      ...items,
    ],
    spacing: "md",
  };
}

function generateNearCompletionSection(nearCompletion) {
  const items = nearCompletion.map(achievement => {
    const pct = Math.min(
      Math.round((achievement.current_value / achievement.target_value) * 100),
      99
    );

    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: achievement.icon, flex: 1, align: "center", gravity: "center" },
        {
          type: "box",
          layout: "vertical",
          flex: 7,
          contents: [
            { type: "text", text: achievement.name, size: "sm" },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  contents: [{ type: "filler" }],
                  width: `${pct}%`,
                  backgroundColor: "#a29bfe",
                  height: "4px",
                  cornerRadius: "2px",
                },
              ],
              backgroundColor: "#e0e0e0",
              height: "4px",
              cornerRadius: "2px",
              margin: "sm",
            },
          ],
        },
        {
          type: "text",
          text: `${pct}%`,
          size: "xxs",
          color: "#888888",
          flex: 1,
          align: "end",
          gravity: "center",
        },
      ],
      spacing: "sm",
    };
  });

  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: "即將達成",
        size: "xs",
        color: "#888888",
        weight: "bold",
        margin: "md",
      },
      ...items,
    ],
    spacing: "md",
  };
}

/**
 * Generate Flex for title list (.稱號 command).
 */
exports.generateTitlesFlex = titles => {
  const rows = titles.map(title => {
    const rarity = RARITY_COLORS[title.rarity] || RARITY_COLORS[0];
    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: title.icon, flex: 1, align: "center", gravity: "center" },
        { type: "text", text: title.name, size: "sm", flex: 5, gravity: "center" },
        {
          type: "text",
          text: RARITY_NAMES[title.rarity] || "",
          size: "xxs",
          color: rarity.bg,
          flex: 2,
          align: "end",
          gravity: "center",
        },
      ],
      backgroundColor: `${rarity.bg}22`,
      paddingAll: "sm",
      cornerRadius: "md",
    };
  });

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "我的稱號", weight: "bold", size: "lg", color: "#ffffff" },
      ],
      backgroundColor: "#6c5ce7",
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: rows,
      spacing: "sm",
      paddingAll: "lg",
    },
  };
};

exports.generateNoDataText = () => "還沒有任何成就，快去探索各種功能吧！";
exports.generateNoTitlesText = () => "目前沒有持有任何稱號";

function getTimeAgo(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 週前`;
  return `${Math.floor(days / 30)} 月前`;
}
```

- [ ] **Step 2: Write new AchievementController**

Create `app/src/controller/application/AchievementController.js` (overwrite old file):

```javascript
// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const AchievementEngine = require("../../service/AchievementEngine");
const UserTitleModel = require("../../model/application/UserTitle");
const AchievementTemplate = require("../../templates/application/Achievement");

exports.router = [text(/^[.#/](成就|achievement|adv)$/, showAchievements)];

exports.titleRouter = [text(/^[.#/](稱號|title)$/, showTitles)];

exports.adminRouter = [];

/**
 * Show user's achievement summary.
 * @param {Context} context
 */
async function showAchievements(context) {
  const { userId } = context.event.source;
  const summary = await AchievementEngine.getUserSummary(userId);

  if (summary.unlocked === 0 && summary.nearCompletion.length === 0) {
    return context.replyText(AchievementTemplate.generateNoDataText());
  }

  const flex = AchievementTemplate.generateSummaryFlex(summary);
  return context.replyFlex("成就系統", flex);
}

/**
 * Show user's current titles.
 * @param {Context} context
 */
async function showTitles(context) {
  const { userId } = context.event.source;
  const titles = await UserTitleModel.findByUser(userId);

  if (titles.length === 0) {
    return context.replyText(AchievementTemplate.generateNoTitlesText());
  }

  const flex = AchievementTemplate.generateTitlesFlex(titles);
  return context.replyFlex("我的稱號", flex);
}

/**
 * API handlers for frontend.
 */
exports.api = {
  async getAll(req, res) {
    try {
      const AchievementModel = require("../../model/application/Achievement");
      const achievements = await AchievementModel.allWithCategories();
      res.json(achievements);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  async getUserAchievements(req, res) {
    try {
      const { userId } = req.params;
      const summary = await AchievementEngine.getUserSummary(userId);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  async getStats(req, res) {
    try {
      const stats = await AchievementEngine.getStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  async getUserTitles(req, res) {
    try {
      const { userId } = req.params;
      const titles = await UserTitleModel.findByUser(userId);
      res.json(titles);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add app/src/controller/application/AchievementController.js \
       app/src/templates/application/Achievement.js
git commit -m "feat(achievement): add controller and LINE Flex Message templates"
```

---

## Task 6: API Routes + App Wiring

**Files:**
- Modify: `app/src/router/api.js`
- Modify: `app/src/app.js`

- [ ] **Step 1: Add API routes**

In `app/src/router/api.js`, add before the `router.all("*", ...)` catch-all:

```javascript
const AchievementController = require("../controller/application/AchievementController");

router.get("/achievements", AchievementController.api.getAll);
router.get("/achievements/user/:userId", AchievementController.api.getUserAchievements);
router.get("/achievements/stats", AchievementController.api.getStats);
router.get("/titles/user/:userId", AchievementController.api.getUserTitles);
```

- [ ] **Step 2: Wire controller routers in app.js**

In `app/src/app.js`, replace the old AdvancementController references.

Find the import:
```javascript
const AdvancementController = require("./controller/application/AdvancementController");
```
Replace with:
```javascript
const AchievementController = require("./controller/application/AchievementController");
```

In the `OrderBased` router array, replace:
```javascript
...AdvancementController.router,
```
With:
```javascript
...AchievementController.router,
...AchievementController.titleRouter,
```

In the `AdminOrder` router array, replace:
```javascript
...AdvancementController.adminRouter,
```
With:
```javascript
...AchievementController.adminRouter,
```

- [ ] **Step 3: Commit**

```bash
git add app/src/router/api.js app/src/app.js
git commit -m "feat(achievement): wire API routes and controller into app"
```

---

## Task 7: Cron Jobs

**Files:**
- Create: `app/bin/AchievementCron.js`
- Create: `app/bin/TitleDelivery.js`
- Modify: `app/config/crontab.config.js`

- [ ] **Step 1: Create AchievementCron**

Create `app/bin/AchievementCron.js`:

```javascript
const AchievementEngine = require("../src/service/AchievementEngine");
const { DefaultLogger } = require("../src/util/Logger");

module.exports = main;

async function main() {
  DefaultLogger.info("Start achievement batch evaluation");
  try {
    await AchievementEngine.batchEvaluate();
    DefaultLogger.info("Achievement batch evaluation complete");
  } catch (err) {
    DefaultLogger.error("Achievement batch evaluation failed:", err);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
```

- [ ] **Step 2: Create TitleDelivery**

Create `app/bin/TitleDelivery.js`:

```javascript
const mysql = require("../src/util/mysql");
const config = require("config");
const { DefaultLogger } = require("../src/util/Logger");
const UserTitleModel = require("../src/model/application/UserTitle");

module.exports = main;

async function main() {
  DefaultLogger.info("Start title delivery");
  const trx = await mysql.transaction();

  try {
    // Clear all current titles
    await UserTitleModel.clearAll(trx);

    await deliveryChatTitles(trx);
    await deliveryGachaTitles(trx);
    await deliveryJankenTitles(trx);
    await deliveryWorldBossTitles(trx);

    await trx.commit();
    DefaultLogger.info("Title delivery complete");
  } catch (err) {
    await trx.rollback();
    DefaultLogger.error("Title delivery failed:", err);
    throw err;
  }
}

async function deliveryChatTitles(trx) {
  const titleKeys = ["chat_king_1", "chat_king_2", "chat_king_3"];
  const users = await trx
    .select("platform_id")
    .from("chat_user_data")
    .where("rank", ">=", 1)
    .where("rank", "<=", 3)
    .orderBy("rank", "asc")
    .limit(3);

  for (let i = 0; i < users.length; i++) {
    const title = await trx("titles").where("key", titleKeys[i]).first();
    if (title && users[i]) {
      await UserTitleModel.grantByPlatformId(users[i].platform_id, title.id, trx);
    }
  }
}

async function deliveryGachaTitles(trx) {
  // Gacha collectors (top 3 by unique item count)
  const collectKeys = ["gacha_king_1", "gacha_king_2", "gacha_king_3"];
  const collectUsers = await trx
    .select("userId")
    .from("Inventory")
    .count({ count: "itemId" })
    .whereNot("itemId", 999)
    .orderBy("count", "desc")
    .groupBy("userId")
    .limit(3);

  for (let i = 0; i < collectUsers.length; i++) {
    const title = await trx("titles").where("key", collectKeys[i]).first();
    const user = await trx("user").where("platform_id", collectUsers[i].userId).first();
    if (title && user) {
      await UserTitleModel.grantByPlatformId(user.platform_id, title.id, trx);
    }
  }

  // Gacha rich (top 3 by goddess stone amount)
  const richKeys = ["gacha_rich_1", "gacha_rich_2", "gacha_rich_3"];
  const richUsers = await trx
    .select("userId")
    .from("Inventory")
    .sum({ sum: "itemAmount" })
    .where("itemId", 999)
    .orderBy("sum", "desc")
    .groupBy("userId")
    .limit(3);

  for (let i = 0; i < richUsers.length; i++) {
    const title = await trx("titles").where("key", richKeys[i]).first();
    const user = await trx("user").where("platform_id", richUsers[i].userId).first();
    if (title && user) {
      await UserTitleModel.grantByPlatformId(user.platform_id, title.id, trx);
    }
  }
}

async function deliveryJankenTitles(trx) {
  // Read from janken_rating table for top/bottom performers
  // Janken titles are simpler — assigned based on specific criteria from janken_rating
  const titleMap = {
    janken_king: { column: "rating", order: "desc" },
    janken_loser: { column: "lose", order: "desc" },
    janken_drawer: { column: "draw", order: "desc" },
    janken_ruki: { column: "rating", order: "asc" },
  };

  for (const [titleKey, query] of Object.entries(titleMap)) {
    const title = await trx("titles").where("key", titleKey).first();
    if (!title) continue;

    const topUser = await trx("janken_rating")
      .select("user_id")
      .orderBy(query.column, query.order)
      .first();

    if (topUser) {
      await UserTitleModel.grantByPlatformId(topUser.user_id, title.id, trx);
    }
  }
}

async function deliveryWorldBossTitles(trx) {
  const progressorsConfig = config.get("advancement.world_boss.progressors");
  const leechersConfig = config.get("advancement.world_boss.leechers");

  const { count: userCount } = await trx.count({ count: "*" }).from("minigame_level").first();
  if (userCount === 0) return;

  const progressorsCount = Math.max(1, Math.ceil((userCount * progressorsConfig.limit) / 100));
  const leechersCount = Math.max(1, Math.ceil((userCount * leechersConfig.limit) / 100));

  // Progressors — top by level/exp
  // NOTE: minigame_level.user_id is an internal int ID, NOT a LINE platform_id.
  // Must join the user table to get platform_id.
  const progressorsTitle = await trx("titles").where("key", "progressors").first();
  if (progressorsTitle) {
    const topUsers = await trx("minigame_level")
      .join("user", "minigame_level.user_id", "user.id")
      .select("user.platform_id")
      .orderBy([
        { column: "minigame_level.level", order: "desc" },
        { column: "minigame_level.exp", order: "desc" },
      ])
      .limit(progressorsCount);
    for (const user of topUsers) {
      await UserTitleModel.grantByPlatformId(user.platform_id, progressorsTitle.id, trx);
    }
  }

  // Leechers — bottom by level/exp
  const leechersTitle = await trx("titles").where("key", "leechers").first();
  if (leechersTitle) {
    const bottomUsers = await trx("minigame_level")
      .join("user", "minigame_level.user_id", "user.id")
      .select("user.platform_id")
      .orderBy([
        { column: "minigame_level.level", order: "asc" },
        { column: "minigame_level.exp", order: "asc" },
      ])
      .limit(leechersCount);
    for (const user of bottomUsers) {
      await UserTitleModel.grantByPlatformId(user.platform_id, leechersTitle.id, trx);
    }
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
```

- [ ] **Step 3: Update crontab config**

In `app/config/crontab.config.js`, replace the old Advancement Delivery entry:

Find:
```javascript
  {
    name: "Advancement Delivery",
    description: "deliver achievement titles",
    period: ["0", "0", "3", "*", "*", "*"],
    immediate: false,
    require_path: "./bin/AdvancementDelivery",
  },
```

Replace with:
```javascript
  {
    name: "Achievement Batch Evaluation",
    description: "batch evaluate milestone achievements for all users",
    period: ["0", "0", "3", "*", "*", "*"],
    immediate: false,
    require_path: "./bin/AchievementCron",
  },
  {
    name: "Title Delivery",
    description: "reassign dynamic titles based on current rankings",
    period: ["0", "10", "3", "*", "*", "*"],
    immediate: false,
    require_path: "./bin/TitleDelivery",
  },
```

- [ ] **Step 4: Commit**

```bash
git add app/bin/AchievementCron.js app/bin/TitleDelivery.js app/config/crontab.config.js
git commit -m "feat(achievement): add cron jobs for batch evaluation and title delivery"
```

---

## Task 8: Integration Points

**Files:**
- Modify: `app/src/controller/princess/GachaController.js`
- Modify: `app/src/controller/application/JankenController.js`
- Modify: `app/src/controller/application/ChatLevelController.js`

This task adds `AchievementEngine.evaluate()` calls at the end of existing controller actions. Each call is fire-and-forget (no `await` in the main flow).

- [ ] **Step 1: Read GachaController to find the right insertion point**

Read `app/src/controller/princess/GachaController.js` and find where gacha results are returned. Add after the result is determined but before replying:

```javascript
const AchievementEngine = require("../../service/AchievementEngine");

// After gacha results are calculated, before reply:
AchievementEngine.evaluate(userId, "gacha_pull", {
  threeStarCount: results.filter(r => r.star === 3).length,
  uniqueCount: uniqueCharacterCount, // query this from Inventory
}).catch(() => {});
```

The exact insertion point depends on the controller's structure — read it first to find where `userId` and results are available.

- [ ] **Step 2: Read JankenController to find insertion point**

Read `app/src/controller/application/JankenController.js`. After a match resolves:

```javascript
const AchievementEngine = require("../../service/AchievementEngine");

// After match result is determined:
if (result === "win") {
  AchievementEngine.evaluate(winnerId, "janken_win", { streak: winnerStreak }).catch(() => {});
}
AchievementEngine.evaluate(challengerId, "janken_challenge", {}).catch(() => {});
```

- [ ] **Step 3: Add evaluate to ChatLevelController**

In `app/src/controller/application/ChatLevelController.js`, where chat messages are processed:

```javascript
const AchievementEngine = require("../../service/AchievementEngine");

// After chat exp is awarded:
const groupId = context.event.source.groupId;
AchievementEngine.evaluate(userId, "chat_message", { groupId }).catch(() => {});
```

Also replace the advancement model usage for status display. Find:
```javascript
AdvancementModel.findUserAdvancementsByPlatformId(userId),
```
Replace with:
```javascript
UserTitleModel.findByUser(userId),
```
And update the import accordingly.

- [ ] **Step 4: Commit**

```bash
git add app/src/controller/princess/GachaController.js \
       app/src/controller/application/JankenController.js \
       app/src/controller/application/ChatLevelController.js
git commit -m "feat(achievement): integrate AchievementEngine into existing controllers"
```

---

## Task 9: Frontend Achievement Wall

**Files:**
- Create: `frontend/src/pages/Achievement/index.jsx`
- Create: `frontend/src/services/achievement.js`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create achievement API service**

Create `frontend/src/services/achievement.js`:

```javascript
import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export const getAllAchievements = () => api.get("/achievements").then(res => res.data);

export const getUserAchievements = userId =>
  api.get(`/achievements/user/${userId}`).then(res => res.data);

export const getAchievementStats = () => api.get("/achievements/stats").then(res => res.data);

export const getUserTitles = userId => api.get(`/titles/user/${userId}`).then(res => res.data);
```

- [ ] **Step 2: Create Achievement page component**

Create `frontend/src/pages/Achievement/index.jsx`:

```javascript
import { useState, useEffect, useCallback } from "react";
import {
  Container,
  Typography,
  Tabs,
  Tab,
  Box,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Grid,
  Skeleton,
} from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { getUserAchievements, getAchievementStats } from "../../services/achievement";

// Colors chosen for WCAG 4.5:1 contrast against white backgrounds
const RARITY_CONFIG = {
  0: { label: "普通", color: "#757575" },
  1: { label: "稀有", color: "#6c5ce7" },
  2: { label: "史詩", color: "#b8860b" },
  3: { label: "傳說", color: "#d63384" },
};

export default function Achievement() {
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Get userId from URL search params (linked from LINE Flex Message)
  const [searchParams] = useSearchParams();
  const userId = searchParams.get("userId") || "";

  const fetchData = useCallback(async () => {
    if (!userId) {
      setError("請提供用戶 ID");
      setLoading(false);
      return;
    }
    try {
      const [summaryData, statsData] = await Promise.all([
        getUserAchievements(userId),
        getAchievementStats(),
      ]);
      setSummary(summaryData);
      setStats(statsData);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch achievements", err);
      setError("無法載入成就資料");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Skeleton variant="text" width={120} height={48} sx={{ mx: "auto" }} />
        <Skeleton variant="rectangular" height={8} sx={{ borderRadius: 4, my: 1 }} />
        <Grid container spacing={2} sx={{ mt: 3 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }
  if (error) return <Container sx={{ py: 4 }}><Typography color="error">{error}</Typography></Container>;
  if (!summary) return null;

  const filteredCategories =
    activeTab === "all"
      ? summary.categories
      : summary.categories.filter(c => c.key === activeTab);

  const statsMap = {};
  stats.forEach(s => {
    statsMap[s.achievement_id] = s;
  });

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ textAlign: "center", mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          {summary.unlocked} / {summary.total}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={summary.percentage}
          sx={{
            height: 8,
            borderRadius: 4,
            mt: 1,
            mb: 0.5,
            "& .MuiLinearProgress-bar": {
              background: "linear-gradient(90deg, #6c5ce7, #a29bfe)",
              borderRadius: 4,
            },
          }}
        />
        <Typography variant="body2" color="text.secondary">
          {summary.percentage}% 完成
        </Typography>
      </Box>

      {/* Category Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3 }}
      >
        <Tab label="全部" value="all" />
        {summary.categories.map(cat => (
          <Tab
            key={cat.key}
            label={`${cat.icon} ${cat.name} (${cat.unlocked}/${cat.total})`}
            value={cat.key}
          />
        ))}
      </Tabs>

      {/* Achievement Grid */}
      <Grid container spacing={2}>
        {filteredCategories.flatMap(cat =>
          cat.achievements.map(achievement => (
            <Grid item xs={12} sm={6} md={4} key={achievement.id}>
              <AchievementCard achievement={achievement} stats={statsMap[achievement.id]} />
            </Grid>
          ))
        )}
      </Grid>
    </Container>
  );
}

function AchievementCard({ achievement, stats }) {
  const rarity = RARITY_CONFIG[achievement.rarity] || RARITY_CONFIG[0];
  const isHidden = achievement.type === "hidden" && !achievement.isUnlocked;
  const progress =
    achievement.target_value > 0
      ? Math.min(Math.round((achievement.current_value / achievement.target_value) * 100), 100)
      : 0;
  const unlockRate = stats ? `${stats.unlock_rate.toFixed(1)}%` : null;

  return (
    <Card
      sx={{
        height: "100%",
        border: `2px solid ${achievement.isUnlocked ? rarity.color : "#e0e0e0"}`,
        boxShadow: achievement.isUnlocked ? `0 0 12px ${rarity.color}44` : "none",
        opacity: isHidden ? 0.5 : 1,
        transition: "all 0.2s",
      }}
    >
      <CardContent sx={{ textAlign: "center", py: 2 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          {isHidden ? "❓" : achievement.icon}
        </Typography>
        <Typography variant="body2" fontWeight="bold" noWrap>
          {isHidden ? "???" : achievement.name}
        </Typography>

        {achievement.isUnlocked ? (
          <Chip
            label="✓ 已解鎖"
            size="small"
            sx={{ mt: 1, bgcolor: rarity.color, color: "#fff", fontWeight: "bold" }}
          />
        ) : isHidden ? (
          <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: "block" }}>
            隱藏成就
          </Typography>
        ) : (
          <Box sx={{ mt: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 4,
                borderRadius: 2,
                "& .MuiLinearProgress-bar": { bgcolor: rarity.color },
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {achievement.current_value}/{achievement.target_value}
            </Typography>
          </Box>
        )}

        {unlockRate && !isHidden && (
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
            {unlockRate} 玩家已解鎖
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Add route to App.jsx**

In `frontend/src/App.jsx`, add import and route:

```javascript
import Achievement from "./pages/Achievement";

// Inside <Routes>, under the MainLayout route:
<Route path="achievements" element={<Achievement />} />
```

- [ ] **Step 4: Start dev server and verify the page loads**

```bash
cd frontend && yarn start
```

Open `http://localhost:3000/achievements?userId=<test_user_id>` and verify:
- Page loads without errors, skeleton cards show during loading
- Category tabs render and filter correctly
- Grid layout is responsive: single column on mobile (<600px), 2 columns on tablet, 3 on desktop
- Rarity colors have sufficient contrast against white card backgrounds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Achievement/ frontend/src/services/achievement.js frontend/src/App.jsx
git commit -m "feat(achievement): add frontend achievement wall page"
```

---

## Task 10: Remove Old System

**Files:**
- Delete: `app/src/model/application/Advancement.js`
- Delete: `app/src/templates/application/Advancement.js`
- Delete: `app/bin/AdvancementDelivery.js`
- Modify: `app/src/middleware/umamiTrack.js`
- Modify: `app/locales/zh_tw.json`
- Create: `app/migrations/*_drop_old_advancement_tables.js`

- [ ] **Step 1: Create migration to drop old tables**

```bash
cd app && yarn knex migrate:make drop_old_advancement_tables
```

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("user_has_advancements");
  await knex.schema.dropTableIfExists("advancement");
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.createTable("advancement", table => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("type").notNullable();
    table.string("description").notNullable();
    table.string("icon").notNullable();
    table.tinyint("order").notNullable();
    table.timestamps(true, true);
    table.index("name");
    table.unique(["name", "type"]);
  });
  await knex.schema.createTable("user_has_advancements", table => {
    table.increments("id").primary();
    table.integer("user_id").notNullable();
    table.integer("advancement_id").notNullable();
    table.timestamps(true, true);
    table.unique(["user_id", "advancement_id"]);
    table.index("user_id");
  });
};
```

- [ ] **Step 2: Run migration**

```bash
cd app && yarn migrate
```

- [ ] **Step 3: Delete old files**

```bash
rm app/src/model/application/Advancement.js
rm app/src/templates/application/Advancement.js
rm app/bin/AdvancementDelivery.js
```

- [ ] **Step 4: Update umami tracking**

In `app/src/middleware/umamiTrack.js`, find:
```javascript
{ pattern: /^[.#/](成就|稱號|adv)$/, name: "advancement", category: "application" },
```
Replace with:
```javascript
{ pattern: /^[.#/](成就|achievement|adv)$/, name: "achievement", category: "application" },
{ pattern: /^[.#/](稱號|title)$/, name: "title", category: "application" },
```

- [ ] **Step 5: Update i18n**

In `app/locales/zh_tw.json`, replace the `message.advancement` block with:

```json
"achievement": {
  "no_data": "還沒有任何成就，快去探索各種功能吧！",
  "no_titles": "目前沒有持有任何稱號"
}
```

Remove all `advancement.*` i18n keys that are no longer used.

- [ ] **Step 6: Grep for remaining references to old system**

```bash
cd app && grep -r "Advancement\|advancement\|AdvancementDelivery\|user_has_advancements" src/ bin/ config/ --include="*.js" --include="*.json" -l
```

Fix any remaining references found.

- [ ] **Step 7: Run tests to verify nothing is broken**

```bash
cd app && yarn test
cd app && yarn lint
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(achievement): remove old advancement system"
```

---

## Task 11: Config + Final Verification

**Files:**
- Modify: `app/config/default.json`

- [ ] **Step 1: Update config**

In `app/config/default.json`, the old `advancement.rarity_color` and `advancement.manual` can be removed. Keep `advancement.world_boss` since TitleDelivery still references it. Add new achievement config:

```json
"achievement": {
  "rarity_colors": {
    "0": "#a0a0a0",
    "1": "#6c5ce7",
    "2": "#ffd700",
    "3": "#fd79a8"
  }
}
```

- [ ] **Step 2: Full integration test**

```bash
cd app && yarn test
cd app && yarn lint
cd frontend && yarn build
```

All should pass without errors.

- [ ] **Step 3: Commit**

```bash
git add app/config/default.json
git commit -m "chore(achievement): update config for new achievement system"
```

---

## Summary of Commits

1. `feat(achievement): create database tables for achievement and title systems`
2. `feat(achievement): add models for achievement and title systems`
3. `feat(achievement): add AchievementEngine service with evaluate and batch logic`
4. `feat(achievement): seed initial achievement and title data`
5. `feat(achievement): add controller and LINE Flex Message templates`
6. `feat(achievement): wire API routes and controller into app`
7. `feat(achievement): add cron jobs for batch evaluation and title delivery`
8. `feat(achievement): integrate AchievementEngine into existing controllers`
9. `feat(achievement): add frontend achievement wall page`
10. `refactor(achievement): remove old advancement system`
11. `chore(achievement): update config for new achievement system`
