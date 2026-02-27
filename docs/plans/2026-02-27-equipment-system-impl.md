# Equipment System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an equipment system (weapon/armor/accessory) to the World Boss feature, allowing players to enhance combat attributes via LIFF UI.

**Architecture:** Two new DB tables (`equipment`, `player_equipment`) with JSON attributes for flexible stats. Backend follows existing model/service/handler/router pattern. Equipment bonuses injected into the existing damage calculation in `WorldBossController.attackOnBoss()`. LIFF page for equipment management, LINE chat only provides a link.

**Tech Stack:** Node.js, Knex (MySQL), Express, Redis caching, React (LIFF frontend), LINE LIFF SDK

**Design Doc:** `docs/plans/2026-02-27-equipment-system-design.md`

---

### Task 1: Create `equipment` table migration

**Files:**
- Create: `app/migrations/20260227090000_create_equipment.js`

**Step 1: Write the migration**

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("equipment", table => {
    table.increments("id").primary();
    table.string("name", 100).notNullable();
    table.enum("slot", ["weapon", "armor", "accessory"]).notNullable();
    table.integer("job_id").unsigned().nullable().defaultTo(null);
    table.enum("rarity", ["common", "rare", "epic", "legendary"]).notNullable().defaultTo("common");
    table.json("attributes").notNullable();
    table.text("description").nullable();
    table.string("image_url", 255).nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("equipment");
};
```

**Step 2: Commit**

```bash
git add app/migrations/20260227090000_create_equipment.js
git commit -m "feat: add equipment table migration"
```

---

### Task 2: Create `player_equipment` table migration

**Files:**
- Create: `app/migrations/20260227090001_create_player_equipment.js`

**Step 1: Write the migration**

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("player_equipment", table => {
    table.increments("id").primary();
    table.string("user_id", 50).notNullable();
    table.integer("equipment_id").unsigned().notNullable();
    table.enum("slot", ["weapon", "armor", "accessory"]).notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.unique(["user_id", "slot"]);
    table.foreign("equipment_id").references("id").inTable("equipment");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("player_equipment");
};
```

**Step 2: Commit**

```bash
git add app/migrations/20260227090001_create_player_equipment.js
git commit -m "feat: add player_equipment table migration"
```

---

### Task 3: Create Equipment model

**Files:**
- Create: `app/src/model/application/Equipment.js`

**Reference pattern:** `app/src/model/application/WorldBossLog.js` (class-based, extends base)

**Step 1: Write the model**

```javascript
const Base = require("../base");

const TABLE = "equipment";

class Equipment extends Base {
  async findBySlot(slot) {
    return await this.knex.select("*").where({ slot });
  }

  async findByJobId(jobId) {
    return await this.knex.select("*").where({ job_id: jobId });
  }

  async findAvailableForJob(jobId) {
    return await this.knex
      .select("*")
      .where({ job_id: jobId })
      .orWhereNull("job_id");
  }
}

const model = new Equipment({
  table: TABLE,
  fillable: ["name", "slot", "job_id", "rarity", "attributes", "description", "image_url"],
});

exports.table = TABLE;
exports.model = model;
exports.all = options => model.all(options);
exports.find = id => model.find(id);
exports.create = attributes => model.create(attributes);
exports.update = (id, attributes) => model.update(id, attributes);
exports.destroy = id => model.delete(id);
exports.findBySlot = slot => model.findBySlot(slot);
exports.findAvailableForJob = jobId => model.findAvailableForJob(jobId);
```

**Step 2: Commit**

```bash
git add app/src/model/application/Equipment.js
git commit -m "feat: add Equipment model"
```

---

### Task 4: Create PlayerEquipment model

**Files:**
- Create: `app/src/model/application/PlayerEquipment.js`

**Step 1: Write the model**

```javascript
const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "player_equipment";

class PlayerEquipment extends Base {
  async getByUserId(userId) {
    return await mysql(TABLE)
      .select("player_equipment.*", "equipment.name", "equipment.rarity", "equipment.attributes",
        "equipment.image_url", "equipment.job_id", "equipment.description")
      .leftJoin("equipment", "player_equipment.equipment_id", "equipment.id")
      .where("player_equipment.user_id", userId);
  }

  async getByUserIdAndSlot(userId, slot) {
    return await mysql(TABLE)
      .select("player_equipment.*", "equipment.name", "equipment.rarity", "equipment.attributes",
        "equipment.image_url", "equipment.job_id", "equipment.description")
      .leftJoin("equipment", "player_equipment.equipment_id", "equipment.id")
      .where({ "player_equipment.user_id": userId, "player_equipment.slot": slot })
      .first();
  }

  async equipItem(userId, equipmentId, slot) {
    const existing = await this.knex
      .where({ user_id: userId, slot })
      .first();

    if (existing) {
      return await this.knex
        .where({ user_id: userId, slot })
        .update({ equipment_id: equipmentId, updated_at: mysql.fn.now() });
    }

    return await this.knex.insert({
      user_id: userId,
      equipment_id: equipmentId,
      slot,
    });
  }

  async unequipSlot(userId, slot) {
    return await this.knex.where({ user_id: userId, slot }).del();
  }
}

const model = new PlayerEquipment({
  table: TABLE,
  fillable: ["user_id", "equipment_id", "slot"],
});

exports.table = TABLE;
exports.model = model;
exports.getByUserId = userId => model.getByUserId(userId);
exports.getByUserIdAndSlot = (userId, slot) => model.getByUserIdAndSlot(userId, slot);
exports.equipItem = (userId, equipmentId, slot) => model.equipItem(userId, equipmentId, slot);
exports.unequipSlot = (userId, slot) => model.unequipSlot(userId, slot);
```

**Step 2: Commit**

```bash
git add app/src/model/application/PlayerEquipment.js
git commit -m "feat: add PlayerEquipment model"
```

---

### Task 5: Create EquipmentService

**Files:**
- Create: `app/src/service/EquipmentService.js`

**Reference pattern:** `app/src/service/WorldBossEventService.js`

**Step 1: Write the service**

This service has two main responsibilities:
1. Admin CRUD delegation (pass-through to Equipment model)
2. Player equipment logic with caching (get bonuses for attack flow)

```javascript
const EquipmentModel = require("../model/application/Equipment");
const PlayerEquipmentModel = require("../model/application/PlayerEquipment");
const redis = require("../util/redis");
const get = require("lodash/get");

const VALID_SLOTS = ["weapon", "armor", "accessory"];
const CACHE_TTL = 60 * 60; // 1 hour

// --- Admin CRUD ---
exports.all = options => EquipmentModel.all(options);
exports.find = id => EquipmentModel.find(id);
exports.create = attributes => EquipmentModel.create(attributes);

exports.update = async (id, attributes) => {
  await redis.del(`equipment:${id}`);
  return EquipmentModel.update(id, attributes);
};

exports.destroy = async id => {
  await redis.del(`equipment:${id}`);
  return EquipmentModel.destroy(id);
};

// --- Player Equipment ---

/**
 * Get all equipped items for a user (3 slots), with caching.
 * Returns object: { weapon: {...} | null, armor: {...} | null, accessory: {...} | null }
 */
exports.getPlayerEquipment = async userId => {
  const cacheKey = `playerEquipment:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const rows = await PlayerEquipmentModel.getByUserId(userId);

  const result = { weapon: null, armor: null, accessory: null };
  for (const row of rows) {
    const attrs = typeof row.attributes === "string" ? JSON.parse(row.attributes) : row.attributes;
    result[row.slot] = {
      id: row.equipment_id,
      name: row.name,
      rarity: row.rarity,
      image_url: row.image_url,
      attributes: attrs,
    };
  }

  await redis.set(cacheKey, JSON.stringify(result), { EX: CACHE_TTL });
  return result;
};

/**
 * Equip an item. Validates slot and job restriction.
 */
exports.equip = async (userId, equipmentId, jobId) => {
  const equipment = await EquipmentModel.find(equipmentId);
  if (!equipment) throw new Error("裝備不存在");

  const slot = equipment.slot;
  if (!VALID_SLOTS.includes(slot)) throw new Error("無效的裝備欄位");

  // Job restriction check
  if (equipment.job_id !== null && equipment.job_id !== jobId) {
    throw new Error("此裝備僅限特定職業使用");
  }

  await PlayerEquipmentModel.equipItem(userId, equipmentId, slot);
  await redis.del(`playerEquipment:${userId}`);

  return { slot, equipment };
};

/**
 * Unequip a slot.
 */
exports.unequip = async (userId, slot) => {
  if (!VALID_SLOTS.includes(slot)) throw new Error("無效的裝備欄位");

  await PlayerEquipmentModel.unequipSlot(userId, slot);
  await redis.del(`playerEquipment:${userId}`);
};

/**
 * Calculate total equipment bonuses for a user.
 * Returns: { atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus }
 */
exports.getEquipmentBonuses = async userId => {
  const equipped = await exports.getPlayerEquipment(userId);

  const bonuses = {
    atk_percent: 0,
    crit_rate: 0,
    cost_reduction: 0,
    exp_bonus: 0,
    gold_bonus: 0,
  };

  for (const slot of VALID_SLOTS) {
    const item = equipped[slot];
    if (!item || !item.attributes) continue;
    const attrs = item.attributes;

    for (const key of Object.keys(bonuses)) {
      if (attrs[key]) {
        bonuses[key] += attrs[key];
      }
    }
  }

  return bonuses;
};
```

**Step 2: Commit**

```bash
git add app/src/service/EquipmentService.js
git commit -m "feat: add EquipmentService with bonuses calculation"
```

---

### Task 6: Create Admin handler and router for Equipment CRUD

**Files:**
- Create: `app/src/handler/Equipment/admin.js`
- Create: `app/src/handler/Equipment/index.js`
- Create: `app/src/router/Equipment/index.js`

**Reference pattern:** `app/src/handler/WorldBoss/admin.js`, `app/src/router/WorldBoss/index.js`

**Step 1: Write admin handler**

`app/src/handler/Equipment/admin.js`:
```javascript
const EquipmentService = require("../../service/EquipmentService");
const i18n = require("../../util/i18n");

exports.getAllEquipment = async (req, res) => {
  const equipment = await EquipmentService.all({
    sort: [{ column: "created_at", order: "desc" }],
  });
  res.json(equipment);
};

exports.getEquipmentById = async (req, res) => {
  const equipment = await EquipmentService.find(req.params.id);
  res.json(equipment);
};

exports.storeEquipment = async (req, res) => {
  try {
    await EquipmentService.create(req.body);
    res.json({});
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.updateEquipment = async (req, res) => {
  try {
    await EquipmentService.update(req.params.id, req.body);
    res.json({});
  } catch (e) {
    res.status(500).json({ message: i18n.t("api.error.unknown") });
  }
};

exports.deleteEquipment = async (req, res) => {
  try {
    await EquipmentService.destroy(req.params.id);
    res.json({});
  } catch (e) {
    res.status(500).json({ message: i18n.t("api.error.unknown") });
  }
};
```

`app/src/handler/Equipment/index.js`:
```javascript
exports.admin = require("./admin");
```

**Step 2: Write router**

`app/src/router/Equipment/index.js`:
```javascript
const createRouter = require("express").Router;
const AdminRouter = createRouter();
const { admin: adminHandler } = require("../../handler/Equipment");

AdminRouter.get("/Equipment", adminHandler.getAllEquipment);
AdminRouter.get("/Equipment/:id", adminHandler.getEquipmentById);
AdminRouter.post("/Equipment", adminHandler.storeEquipment);
AdminRouter.put("/Equipment/:id", adminHandler.updateEquipment);
AdminRouter.delete("/Equipment/:id", adminHandler.deleteEquipment);

exports.admin = AdminRouter;
```

**Step 3: Commit**

```bash
git add app/src/handler/Equipment/ app/src/router/Equipment/
git commit -m "feat: add Equipment admin handler and router"
```

---

### Task 7: Create Player Equipment API handler and routes

**Files:**
- Create: `app/src/handler/Equipment/player.js`
- Modify: `app/src/handler/Equipment/index.js`
- Modify: `app/src/router/Equipment/index.js`

**Step 1: Write player handler**

`app/src/handler/Equipment/player.js`:
```javascript
const EquipmentService = require("../../service/EquipmentService");
const MinigameService = require("../../service/MinigameService");

exports.getMyEquipment = async (req, res) => {
  try {
    const userId = req.profile.userId;
    const equipped = await EquipmentService.getPlayerEquipment(userId);
    const bonuses = await EquipmentService.getEquipmentBonuses(userId);
    res.json({ equipped, bonuses });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.equip = async (req, res) => {
  try {
    const userId = req.profile.userId;
    const { equipment_id } = req.body;

    // Get player's job for restriction check
    const levelData = await MinigameService.findByUserId(userId);
    const jobId = levelData ? levelData.job_id : null;

    const result = await EquipmentService.equip(userId, equipment_id, jobId);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.unequip = async (req, res) => {
  try {
    const userId = req.profile.userId;
    const { slot } = req.body;
    await EquipmentService.unequip(userId, slot);
    res.json({});
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
```

**Step 2: Update handler index**

Add to `app/src/handler/Equipment/index.js`:
```javascript
exports.admin = require("./admin");
exports.player = require("./player");
```

**Step 3: Update router**

Add player routes to `app/src/router/Equipment/index.js`:
```javascript
const createRouter = require("express").Router;
const AdminRouter = createRouter();
const PlayerRouter = createRouter();
const { admin: adminHandler, player: playerHandler } = require("../../handler/Equipment");

AdminRouter.get("/Equipment", adminHandler.getAllEquipment);
AdminRouter.get("/Equipment/:id", adminHandler.getEquipmentById);
AdminRouter.post("/Equipment", adminHandler.storeEquipment);
AdminRouter.put("/Equipment/:id", adminHandler.updateEquipment);
AdminRouter.delete("/Equipment/:id", adminHandler.deleteEquipment);

PlayerRouter.get("/Equipment/me", playerHandler.getMyEquipment);
PlayerRouter.post("/Equipment/equip", playerHandler.equip);
PlayerRouter.post("/Equipment/unequip", playerHandler.unequip);

exports.admin = AdminRouter;
exports.player = PlayerRouter;
```

**Step 4: Commit**

```bash
git add app/src/handler/Equipment/ app/src/router/Equipment/
git commit -m "feat: add player equipment API endpoints"
```

---

### Task 8: Register Equipment routes in api.js

**Files:**
- Modify: `app/src/router/api.js`

**Step 1: Add Equipment imports and route registration**

Find the existing WorldBoss router imports (around line 28-30) and add below them:
```javascript
const { admin: AdminEquipmentRouter, player: PlayerEquipmentRouter } = require("./Equipment");
```

Find the existing admin router registration (around line 43-44) and add:
```javascript
router.use("/Admin", AdminEquipmentRouter);
```

Find an appropriate location for game API routes and add:
```javascript
router.use("/Game", verifyToken, PlayerEquipmentRouter);
```

**Note:** Check how `verifyToken` middleware is applied for Game routes in the existing code. The player handler expects `req.profile.userId` — verify this is set by the existing auth middleware. If LIFF auth uses a different mechanism, adapt accordingly.

**Step 2: Commit**

```bash
git add app/src/router/api.js
git commit -m "feat: register equipment routes in api.js"
```

---

### Task 9: Integrate equipment bonuses into attack flow

**Files:**
- Modify: `app/src/controller/application/WorldBossController.js` (around lines 483-545)

This is the core integration. The `attackOnBoss` function needs to:
1. Load equipment bonuses after getting user data
2. Apply `atk_percent` to damage
3. Apply `crit_rate` to critical hit checks
4. Apply `cost_reduction` to cost
5. Apply `exp_bonus` and `gold_bonus` after exp/gold calculation

**Step 1: Add import at top of file**

```javascript
const EquipmentService = require("../../service/EquipmentService");
```

**Step 2: Load equipment bonuses (after line ~492, after getting `levelData`)**

After `const rpgCharacter = makeCharacter(jobKey, { level });`, add:
```javascript
const equipBonuses = await EquipmentService.getEquipmentBonuses(userId);
```

**Step 3: Apply ATK bonus to damage (after damage calculation, around line 505)**

After damage is calculated (both standard and skill), apply weapon bonus:
```javascript
damage = Math.floor(damage * (1 + (equipBonuses.atk_percent || 0)));
```

**Step 4: Apply crit_rate bonus**

Where critical hit is checked in RPGCharacter skill methods, the equipment crit bonus needs to be applied. The simplest approach: after calculating skill damage, add an additional crit roll for the equipment bonus:
```javascript
// After skill damage calculation, add equipment crit chance
if (equipBonuses.crit_rate > 0 && !alreadyCrit) {
  if (rpgCharacter.isCritical(equipBonuses.crit_rate * 100)) {
    damage = Math.floor(damage * 1.5); // Equipment crit: flat 1.5x
  }
}
```

**Alternative simpler approach:** Just apply `atk_percent` bonus and skip `crit_rate` for now (add it later). This avoids modifying the RPGCharacter crit flow.

**Step 5: Apply cost_reduction (where cost is used)**

Where `cost` is set (around line 505-507):
```javascript
cost = Math.max(1, cost - (equipBonuses.cost_reduction || 0));
```

**Step 6: Apply exp_bonus (after earnedExp calculation, around line 535)**

After `earnedExp` is calculated and penalties applied:
```javascript
earnedExp += equipBonuses.exp_bonus || 0;
```

**Step 7: Apply gold_bonus**

If gold is awarded on attack, add `equipBonuses.gold_bonus`. If gold is not currently awarded per attack, skip this for now — it becomes relevant when a gold-per-attack system exists.

**Step 8: Add equipment summary to attack response message**

In the message building section (around line 552-576), append equipment bonus info:
```javascript
// Add equipment bonus summary if player has equipment
if (equipBonuses.atk_percent > 0 || equipBonuses.cost_reduction > 0 || equipBonuses.exp_bonus > 0) {
  const bonusParts = [];
  if (equipBonuses.atk_percent > 0) bonusParts.push(`ATK+${Math.round(equipBonuses.atk_percent * 100)}%`);
  if (equipBonuses.cost_reduction > 0) bonusParts.push(`Cost-${equipBonuses.cost_reduction}`);
  if (equipBonuses.exp_bonus > 0) bonusParts.push(`EXP+${equipBonuses.exp_bonus}`);
  messages[0] += `\n_裝備加成: ${bonusParts.join(", ")}_`;
}
```

**Step 9: Commit**

```bash
git add app/src/controller/application/WorldBossController.js
git commit -m "feat: integrate equipment bonuses into world boss attack"
```

---

### Task 10: Add `#裝備` command routing

**Files:**
- Modify: `app/src/controller/application/WorldBossController.js` — add a handler that returns LIFF link
- Modify: `app/src/app.js` — register the `#裝備` text command

**Step 1: Add equipment command handler in WorldBossController**

Add a new exported function:
```javascript
const showEquipment = async context => {
  const liffUrl = config.get("liff.equipmentUrl"); // Configure in app/config/default.json
  await context.replyText(`裝備管理請點此連結：\n${liffUrl}`);
};
```

Or use a Flex Message with a button (better UX):
```javascript
const showEquipment = async context => {
  const liffUrl = config.get("liff.equipmentUrl");
  await context.replyFlex("裝備管理", {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "裝備管理", weight: "bold", size: "lg" },
        { type: "text", text: "點擊下方按鈕管理你的裝備", size: "sm", color: "#999999", margin: "md" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: { type: "uri", label: "開啟裝備頁面", uri: liffUrl },
          style: "primary",
        },
      ],
    },
  });
};
```

Add to the controller's router array export:
```javascript
text(/^[#＃]裝備$/, showEquipment),
```

**Step 2: Add LIFF URL to config**

Add to `app/config/default.json`:
```json
"liff": {
  "equipmentUrl": "https://liff.line.me/YOUR_LIFF_ID"
}
```

**Step 3: Register command in app.js**

The WorldBoss controller already exports a `router` array that's spread into `OrderBased`. Add the `#裝備` text route to that array in the controller file — it will automatically be included.

**Step 4: Commit**

```bash
git add app/src/controller/application/WorldBossController.js app/config/default.json
git commit -m "feat: add #裝備 command with LIFF link"
```

---

### Task 11: Run migrations and verify

**Step 1: Run migrations**

```bash
cd app && yarn migrate
```

Expected: Two tables created (`equipment`, `player_equipment`).

**Step 2: Verify tables exist**

```bash
# In MySQL or via knex
# Check that equipment and player_equipment tables exist
```

**Step 3: Seed test equipment data via Admin API or direct SQL**

```sql
INSERT INTO equipment (name, slot, job_id, rarity, attributes, description)
VALUES
  ('鐵劍', 'weapon', NULL, 'common', '{"atk_percent": 0.05, "crit_rate": 0.02}', '初學者的鐵劍'),
  ('皮甲', 'armor', NULL, 'common', '{"cost_reduction": 1, "exp_bonus": 10}', '輕便的皮甲'),
  ('銅戒指', 'accessory', NULL, 'common', '{"exp_bonus": 5, "gold_bonus": 50}', '簡單的銅戒指'),
  ('魔法杖', 'weapon', 3, 'rare', '{"atk_percent": 0.12, "crit_rate": 0.08}', '法師專屬魔法杖'),
  ('暗殺匕首', 'weapon', 4, 'rare', '{"atk_percent": 0.08, "crit_rate": 0.15}', '盜賊專屬匕首');
```

**Step 4: Commit (if seed file created)**

---

### Task 12: LIFF Frontend — Equipment management page

**Files:**
- Create: `frontend/src/components/Equipment/index.jsx`
- Create: `frontend/src/components/Equipment/EquipmentSlot.jsx`
- Create: `frontend/src/components/Equipment/BackpackItem.jsx`
- Modify: `frontend/src/App.js` — add route for equipment page

**This task requires LIFF setup and is the largest frontend task. Key implementation:**

1. Set up LIFF initialization (`liff.init()` with LIFF ID)
2. Get userId from `liff.getProfile()`
3. Call `GET /api/Game/Equipment/me` with LIFF access token
4. Display 3 equipment slots (weapon/armor/accessory) with current items
5. Display backpack items below
6. Tap to equip/unequip via `POST /api/Game/Equipment/equip` and `POST /api/Game/Equipment/unequip`
7. Show attribute summary

**Note:** The LIFF app ID needs to be registered in LINE Developers Console and configured. This task may be deferred until LIFF setup is confirmed.

**Step 1: Create minimal equipment page component**

**Step 2: Add route in App.js**

**Step 3: Commit**

```bash
git add frontend/src/components/Equipment/ frontend/src/App.js
git commit -m "feat: add LIFF equipment management page"
```

---

## Task Dependency Order

```
Task 1 (equipment migration)
Task 2 (player_equipment migration)
  ↓
Task 3 (Equipment model)
Task 4 (PlayerEquipment model)
  ↓
Task 5 (EquipmentService)
  ↓
Task 6 (Admin handler + router)
Task 7 (Player handler + router)
  ↓
Task 8 (Register routes in api.js)
  ↓
Task 9 (Integrate into attack flow)
Task 10 (Add #裝備 command)
  ↓
Task 11 (Run migrations + verify)
  ↓
Task 12 (LIFF frontend)
```

Tasks 1-2, 3-4, 6-7, 9-10 can be done in parallel within their groups.
