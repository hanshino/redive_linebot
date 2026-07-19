# 世界王 v2（全服共鬥賽季制）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拆除舊世界王功能全件，重建為全服共鬥賽季制 v2：手動開季、無限輪滾動王、on-hit 原子扣血、溢傷連清、賽季末冪等結算（女神石＋稱號）、聊天 Flex ＋ LIFF 戰況板。

**Architecture:** 五張新表（`world_boss` 圖鑑 / `world_boss_season` / `world_boss_round` / `world_boss_contribution` / `world_boss_season_reward` ledger）。戰鬥核心 `WorldBossBattleService.attack()` 在單一 DB 交易內 `SELECT ... FOR UPDATE` 鎖當前輪、扣血、清輪開新輪（溢傷 loop）、寫貢獻、發 RPG 職業經驗。賽季生命週期 `draft →(管理頁手動)→ active →(讀取推導 ended)→(cron)→ settled`，結算仿 Janken `tryInsert` + UNIQUE ledger 冪等。Spec: `docs/superpowers/specs/2026-07-19-worldboss-v2-design.md`。

**Tech Stack:** Bottender (LINE) + Express + Knex/MySQL + node-redis v4 + Jest（真實 DB 整合測試）；前端 React 19 + MUI 7 + axios-hooks + Vite。

## Global Constraints

- 分支 `feat/worldboss-v2`，**絕不 commit 到 main**。
- Husky pre-commit 已失效（不會自動 format）：**每次 commit 前**對改到的 `.js/.jsx` 跑 `app/node_modules/.bin/prettier --write <files>`，否則 CI `format:check` 會 fail。
- **無 LINE Push API**：所有結果只能靠 reply（下一次互動）與 LIFF 呈現，不得引入任何 push/multicast 呼叫。
- 所有 v2 新表的 `user_id` 一律存 **LINE platform userId**，`string(33)`（與 janken / inventory / user_titles 一致）。
- Migration 一律 `cd app && yarn knex migrate:make <name>` 產生，**不得手寫檔名**。
- `app/jest.config.js` 是 `transform: {}` → **`jest.mock(...)` 不會 hoist**：mock 宣告必須寫在 `require` 被 mock 模組之前（本 repo 既有慣例，見 `app/src/service/__tests__/ChatWeatherService.test.js`）。
- 整合測試打**本機真實 MySQL**（`make infra` 起的 Princess DB），測試自行清理自己的資料列；測試檔開頭載入根目錄 `.env`（同 ChatWeatherService.test.js 模式），`afterAll(() => mysql.destroy())`。
- **worldboss 測試落地後，全套測試一律 `yarn test -- --runInBand`**：`findActive`/`findSettleable` 是全域 DB 讀取，平行 jest worker 會互踩（A 檔 seed 的 active 賽季被 B 檔的結算掃走）。前提：本機 DB 不得有真實 active 賽季（測試 beforeEach 有防呆會直接 fail）。
- 分層鐵則：model 不懂遊戲規則、service 不懂 LINE（不 require bottender/context）、controller 不懂資料庫（不 require model）、template 只做純 Flex JSON。
- LIFF 前端路由一律小寫（戰況板 = `worldboss`），且後端 `getLiffUri(size, "/worldboss")` 字串必須與 `App.jsx` 的 route path 完全一致。
- 測試指令：`cd app && yarn test -- <path>`（單檔）、`yarn test`（全部）；lint：`cd app && yarn lint`、root `yarn lint:frontend`。
- Config 數值（HP tier、per_hit_exp、獎勵階梯）是**可調預設值**，上線前使用者可能再調 — 實作時照本計畫的數字寫，不要自行發明。

## File Structure（最終狀態）

```
app/
├── migrations/
│   ├── <ts>_drop_world_boss_v1.js            # Task 3：drop 舊 5 表 + 清成就/稱號資料列
│   └── <ts>_create_world_boss_v2.js          # Task 4：新 5 表 + 2 個 v2 賽季稱號資料列
├── seeds/WorldBossCatalogSeeder.js           # Task 4：圖鑑初始 4 隻王
├── config/default.json                       # Task 4：新 worldboss 區塊
├── config/crontab.config.js                  # Task 8：結算 cron 條目
├── bin/WorldBossSeasonSettle.js              # Task 8：唯一 cron script
└── src/
    ├── model/application/
    │   ├── WorldBoss.js                      # Task 5：圖鑑 CRUD（Base 薄殼）
    │   ├── WorldBossSeason.js                # Task 5：賽季 CRUD + findActive/findSettleable
    │   ├── WorldBossRound.js                 # Task 5：輪次 CRUD + FOR UPDATE 查詢
    │   ├── WorldBossContribution.js          # Task 5：貢獻 CRUD + 排名/每日 cost 聚合
    │   └── WorldBossSeasonReward.js          # Task 5：結算 ledger（tryInsert，仿 JankenDailyRewardLog）
    ├── service/
    │   ├── WorldBossBattleService.js         # Task 6：攻擊交易（唯一改王血的地方）+ hpForRound + 發職業經驗
    │   └── WorldBossSeasonService.js         # Task 7：開季/狀態/排名/冪等結算
    ├── controller/application/WorldBossController.js  # Task 10：薄殼（指令 + postback）
    ├── templates/application/WorldBoss.js    # Task 9：純 Flex builder
    ├── router/WorldBoss/index.js             # Task 11：admin + public express router
    └── handler/WorldBoss/{index,admin,public}.js      # Task 11
frontend/src/
    ├── pages/Admin/Worldboss.jsx             # Task 12：圖鑑 + 賽季管理（單頁）
    └── pages/Worldboss/index.jsx             # Task 13：LIFF 戰況板
```

拆除（Task 1–3）：舊 controller/services/models/template/router/handler/schema、`app.js`/`api.js`/`ajv.js`/`TitleDelivery.js`/`AchievementEngine.js`/`umamiTrack.js`/`zh_tw.json`/`default.json` 的世界王段落、前端 5 個 Admin 頁 + 路由 + NavDrawer、5 張舊表、舊成就/稱號資料列。

---

### Task 1: 後端拆除（程式碼）

**Files:**
- Delete（整檔/整目錄）:
  - `app/src/controller/application/WorldBossController.js`
  - `app/src/service/WorldBossEventService.js`
  - `app/src/service/WorldBossEventLogService.js`
  - `app/src/service/WorldBossUserAttackMessageService.js`
  - `app/src/model/application/WorldBoss.js`
  - `app/src/model/application/WorldBossEvent.js`
  - `app/src/model/application/WorldBossLog.js`
  - `app/src/model/application/WorldBossUserAttackMessage.js`
  - `app/src/model/application/AttackMessageTags.js`（注意：檔名不含 boss 字樣，別漏）
  - `app/src/templates/application/WorldBoss.js`
  - `app/src/router/WorldBoss/`、`app/src/router/WorldBossEvent/`（整目錄）
  - `app/src/handler/WorldBoss/`、`app/src/handler/WorldBossEvent/`（整目錄）
  - `app/src/schema/WorldBoss/`（整目錄）
  - `app/__tests__/api/admin/world-bosses.test.js`
  - `app/__tests__/api/admin/world-boss-events.test.js`
  - `app/__tests__/api/world-boss-messages.test.js`
- Modify: `app/src/app.js`、`app/src/router/api.js`、`app/src/util/ajv.js`、`app/bin/TitleDelivery.js`、`app/src/service/AchievementEngine.js`、`app/src/middleware/umamiTrack.js`、`app/locales/zh_tw.json`、`app/config/default.json`

**Interfaces:**
- Consumes: 無（純刪除）。
- Produces: 一個沒有任何世界王程式碼、lint/test 全綠的 backend。`AchievementEngine` 保留 `boss_attack: ["social_all_features"]` 事件（Task 10 的 v2 controller 會重新 emit，讓「全能玩家」成就存活）。`templates/common/theme.js` 的 `worldBoss: SEMANTIC.danger`（line 169）**保留**，Task 9 模板要用。

- [ ] **Step 1: 刪除整檔**

```bash
cd /home/hanshino/workspace/redive_linebot
git rm app/src/controller/application/WorldBossController.js \
  app/src/service/WorldBossEventService.js \
  app/src/service/WorldBossEventLogService.js \
  app/src/service/WorldBossUserAttackMessageService.js \
  app/src/model/application/WorldBoss.js \
  app/src/model/application/WorldBossEvent.js \
  app/src/model/application/WorldBossLog.js \
  app/src/model/application/WorldBossUserAttackMessage.js \
  app/src/model/application/AttackMessageTags.js \
  app/src/templates/application/WorldBoss.js \
  app/__tests__/api/admin/world-bosses.test.js \
  app/__tests__/api/admin/world-boss-events.test.js \
  app/__tests__/api/world-boss-messages.test.js
git rm -r app/src/router/WorldBoss app/src/router/WorldBossEvent \
  app/src/handler/WorldBoss app/src/handler/WorldBossEvent app/src/schema/WorldBoss
```

- [ ] **Step 2: `app/src/app.js` 移除 4 處**

1. line ~22：`const WorldBossController = require("./controller/application/WorldBossController");` — 整行刪。
2. line ~105：`if (!isExist && action !== "adminBossAttack") return;` → 改為 `if (!isExist) return;`
3. line ~108-111：postback route 整段刪：
```js
    route(
      () => action === "worldBossAttack",
      withProps(WorldBossController.attackOnBoss, { payload })
    ),
```
4. line ~163：OrderBased 中 `...WorldBossController.router,` — 整行刪。

- [ ] **Step 3: `app/src/router/api.js` 移除三組**

1. requires（line ~24, 28, 30）：`WorldBossController`、`AdminWorldBossRouter`、`AdminWorldBossEventRouter` 三行刪。
2. mounts（line ~47-48）：`router.use("/admin", AdminWorldBossRouter);` 與 `router.use("/admin", AdminWorldBossEventRouter);` 刪。
3. line ~391-433：整個 `/game/world-boss/feature-messages` 區塊（註解 + 5 條 CRUD route）刪。

- [ ] **Step 4: `app/src/util/ajv.js`**：刪 line 3 `require(".../schema/WorldBoss/userAttackMessage.json")` 與 line 14 `ajv.addSchema(userAttackSchema.create, "createUserAttackMessage")`。

- [ ] **Step 5: `app/bin/TitleDelivery.js`**：刪 line ~17 `await deliveryWorldBossTitles(trx);` 與整個 `deliveryWorldBossTitles` 函式（line ~89-130）。刪完檢查 `config` import 是否仍被其他函式使用（`deliveryGachaTitles`/`deliveryJankenTitles` 也讀 config 就保留；若 unused，eslint 會抓，刪 import）。**不要動** `crontab.config.js` 的 Title Delivery 條目（gacha/janken 稱號仍靠它）。

- [ ] **Step 6: `app/src/service/AchievementEngine.js`**

1. 事件表（line ~84-90）：`boss_attack` 陣列改為只剩共用成就：
```js
  boss_attack: ["social_all_features"],
```
2. 刪 `boss_first_kill` / `boss_level_10` / `boss_level_50` / `boss_top_damage` 四個 strategy handler（line ~176-179）。
3. 改完 `grep -n "boss_" app/src/service/AchievementEngine.js`，僅允許剩 `boss_attack` 一個 key。

- [ ] **Step 7: 其餘 partial edits**

1. `app/src/middleware/umamiTrack.js` line ~42-49：`// === application: world boss ===` 註解 + 7 個 tracking pattern 刪。
2. `app/locales/zh_tw.json` line ~71-92：`user_attack_on_world_boss`、`world_boss_event_multiple_ongoing`、`world_boss_event_no_ongoing`、巢狀 `"world_boss": {...}` 物件、`admin_attack_on_world_boss`、`world_boss_event_completed` 全刪（注意 JSON 逗號）。
3. `app/config/default.json`：刪 line ~12 `redis.keys.worldBossAttackMessageKeeping`、line ~27-40 頂層 `"worldboss"` 區塊、line ~240-251 `title_delivery.world_boss` 區塊（同樣注意逗號）。
4. `app/locales/zh_tw.json` 的 `template.*` 區塊（line ~27-34）：`attend_times`、`chaos_attack`、`money_attack`、`money_chaos_attack` 是 v1 世界王模板字串 — 刪除前 grep 確認已無引用（v1 template 刪掉後應為 0）；**`boss_name` 先 grep**，若公會戰模板仍引用就保留。
5. `app/src/service/topic/__tests__/query.integration.test.js:3` 註解含 "worldboss" 字樣 — 順手改寫該句註解（非功能性殘留，不影響測試）。
6. **不要碰**：`app/src/templates/common/theme.js:169`（`worldBoss` 色票保留）、`app/src/repositories/princess/guild/ConfigRepository.js`、`frontend` 的公主戰隊 `{week}周{boss}王` 相關（那是戰隊功能，不是世界王）。

- [ ] **Step 8: 驗證**

```bash
cd app && yarn lint && yarn test
grep -rin "worldboss\|world_boss" src/ bin/ config/ locales/ --include="*.js*" -l
```
Expected: lint/test 全綠；grep 只剩 `src/templates/common/theme.js`（色票）與 `src/service/AchievementEngine.js`（`boss_attack` key 不含 world 字樣，不應出現在此 grep 結果）。若出現其他檔案，回頭清乾淨。另跑 `node -e "JSON.parse(require('fs').readFileSync('locales/zh_tw.json'))" && node -e "JSON.parse(require('fs').readFileSync('config/default.json'))"` 確認 JSON 沒改壞。

- [ ] **Step 9: Commit**

```bash
cd /home/hanshino/workspace/redive_linebot
app/node_modules/.bin/prettier --write app/src/app.js app/src/router/api.js app/src/util/ajv.js app/bin/TitleDelivery.js app/src/service/AchievementEngine.js app/src/middleware/umamiTrack.js
git add -A && git commit -m "refactor(worldboss): tear down v1 backend (controllers, services, models, routes, wiring)"
```

---

### Task 2: 前端拆除

**Files:**
- Delete: `frontend/src/pages/Admin/Worldboss.jsx`、`WorldbossEvent.jsx`、`WorldbossMessage.jsx`、`WorldbossMessageCreate.jsx`、`WorldbossMessageUpdate.jsx`
- Modify: `frontend/src/App.jsx`（imports line ~40-44、routes line ~121-131）、`frontend/src/components/NavDrawer.jsx`（line ~73-75）、`frontend/src/pages/Achievement/index.jsx`（line ~66-69, 86）

**Interfaces:**
- Consumes: 無。
- Produces: `yarn build:frontend` 可過的乾淨前端；`admin/worldboss` 路徑空出來給 Task 12 重用。

- [ ] **Step 1: 刪頁面 + 斷路由**

```bash
git rm frontend/src/pages/Admin/Worldboss.jsx frontend/src/pages/Admin/WorldbossEvent.jsx \
  frontend/src/pages/Admin/WorldbossMessage.jsx frontend/src/pages/Admin/WorldbossMessageCreate.jsx \
  frontend/src/pages/Admin/WorldbossMessageUpdate.jsx
```
`App.jsx`：刪 5 個 `import AdminWorldboss*`（line ~40-44）與 5 條 `<Route path="admin/worldboss*">`（line ~121-131）。

- [ ] **Step 2: NavDrawer 與成就頁**

1. `NavDrawer.jsx` line ~73-75：刪 `世界王設定`、`世界王活動`、`世界王訊息` 三個 adminItems。
2. `pages/Achievement/index.jsx`：刪 line ~66-69 的 `boss_first_kill/boss_level_10/boss_level_50/boss_top_damage` icon 映射與 line ~86 的 `world_boss: ShieldIcon,` 類別 icon（若 `ShieldIcon` 因此 unused，刪 import）。

- [ ] **Step 3: 驗證**

```bash
yarn lint:frontend && yarn build:frontend
grep -rin "worldboss" frontend/src/
```
Expected: lint/build 綠、grep 0 hits（公主戰隊頁的 `boss` 單字不在此 pattern 內）。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(worldboss): tear down v1 admin frontend pages and routes"
```

---

### Task 3: DB 拆除 migration

**Files:**
- Create: `app/migrations/<timestamp>_drop_world_boss_v1.js`（用 `yarn knex migrate:make drop_world_boss_v1` 產生）

**Interfaces:**
- Consumes: Task 1/2 已移除所有引用（表此刻無人使用）。
- Produces: 5 張舊表消失；舊成就（4 筆）與 category、progressors/leechers 稱號及其使用者資料列消失。`world_boss` 表名空出來給 Task 4 的新圖鑑表。**Task 4 依賴本 task 先跑完**。

- [ ] **Step 1: 產生 migration**

```bash
cd app && yarn knex migrate:make drop_world_boss_v1
```

- [ ] **Step 2: 填入內容**

```js
/**
 * World Boss v2 teardown: drop all v1 tables and purge v1 achievement/title rows.
 * Irreversible by design (v2 is a greenfield rewrite; spec docs/superpowers/specs/2026-07-19-worldboss-v2-design.md).
 */
const V1_TABLES = [
  "world_boss_event_log",
  "world_boss_event",
  "world_boss_user_attack_message",
  "attack_message_has_tags",
  "world_boss",
];

const V1_ACHIEVEMENT_KEYS = ["boss_first_kill", "boss_level_10", "boss_level_50", "boss_top_damage"];
const V1_TITLE_KEYS = ["progressors", "leechers"];

exports.up = async function (knex) {
  for (const table of V1_TABLES) {
    await knex.schema.dropTableIfExists(table);
  }

  const achievementIds = (
    await knex("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS).select("id")
  ).map(r => r.id);
  if (achievementIds.length > 0) {
    await knex("user_achievement_progress").whereIn("achievement_id", achievementIds).del();
    await knex("user_achievements").whereIn("achievement_id", achievementIds).del();
    await knex("achievements").whereIn("id", achievementIds).del();
  }
  await knex("achievement_categories").where({ key: "world_boss" }).del();

  const titleIds = (await knex("titles").whereIn("key", V1_TITLE_KEYS).select("id")).map(
    r => r.id
  );
  if (titleIds.length > 0) {
    await knex("user_titles").whereIn("title_id", titleIds).del();
    await knex("titles").whereIn("id", titleIds).del();
  }
};

exports.down = async function () {
  // v1 schemas remain in historical migrations; data teardown is intentionally irreversible.
};
```

- [ ] **Step 3: 執行並驗證**

```bash
cd app && yarn migrate
node -e "const k=require('knex')(require('./knexfile'));k.raw('SHOW TABLES LIKE \'world_boss%\'').then(([r])=>{console.log(r);return k.destroy()})"
```
Expected: migrate OK；SHOW TABLES 結果為空陣列。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(worldboss): drop v1 tables and purge v1 achievement/title rows"
```

---

### Task 4: v2 schema migration + config + 圖鑑 seed

**Files:**
- Create: `app/migrations/<timestamp>_create_world_boss_v2.js`（`yarn knex migrate:make create_world_boss_v2`）
- Create: `app/seeds/WorldBossCatalogSeeder.js`
- Modify: `app/config/default.json`（新 `worldboss` 區塊，插回原本 `redis` 區塊之後的位置）

**Interfaces:**
- Consumes: Task 3 已 drop 舊表（`world_boss` 表名可重用）。
- Produces: 5 張新表；`titles` 多 2 筆 `worldboss_annihilator`／`worldboss_vanguard`；config key `worldboss.daily_cost_limit`、`worldboss.attack_cooldown_seconds`、`worldboss.per_hit_exp`、`worldboss.hp_tiers`、`worldboss.season_rewards`。後續所有 task 依賴這些名字。

- [ ] **Step 1: 產生並填入 migration**

```bash
cd app && yarn knex migrate:make create_world_boss_v2
```

```js
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const V2_TITLES = [
  {
    key: "worldboss_annihilator",
    name: "殲滅之王",
    description: "世界王賽季總傷害第 1 名",
    icon: "👑",
    rarity: 3,
  },
  {
    key: "worldboss_vanguard",
    name: "討伐先鋒",
    description: "世界王賽季總傷害前 3 名",
    icon: "⚔️",
    rarity: 2,
  },
];

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable("world_boss", table => {
    table.bigIncrements("id").primary();
    table.string("name", 64).notNullable();
    table.string("image", 255).nullable().comment("Flex hero 圖 URL；null 時前端/模板用預設圖");
    table.text("description").nullable();
    table.float("hp_weight").notNullable().defaultTo(1).comment("個體血量權重，乘上 tier 公式");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("world_boss_season", table => {
    table.bigIncrements("id").primary();
    table.string("name", 64).notNullable();
    table.text("announcement").nullable();
    table
      .string("status", 16)
      .notNullable()
      .defaultTo("draft")
      .comment("draft | active | settled；ended 為讀取時推導（active 且 now > end_time）");
    table.datetime("start_time").nullable();
    table.datetime("end_time").nullable().comment("開季時必填；cron 依此判定到期");
    table.datetime("settled_at").nullable();
    table.timestamps(true, true);
    table.index(["status"], "idx_wbs_status");
  });

  await knex.schema.createTable("world_boss_round", table => {
    table.bigIncrements("id").primary();
    table.bigInteger("season_id").unsigned().notNullable();
    table.integer("round_no").unsigned().notNullable();
    table.bigInteger("world_boss_id").unsigned().notNullable();
    table.bigInteger("max_hp").notNullable();
    table.bigInteger("current_hp").notNullable().comment("唯一熱寫入欄位，只由攻擊交易更新");
    table.string("status", 16).notNullable().defaultTo("active").comment("active | cleared");
    table.datetime("cleared_at").nullable();
    table.timestamps(true, true);
    table.unique(["season_id", "round_no"], "uq_wbr_season_round");
    table.index(["season_id", "status"], "idx_wbr_season_status");
  });

  await knex.schema.createTable("world_boss_contribution", table => {
    table.bigIncrements("id").primary();
    table.bigInteger("season_id").unsigned().notNullable();
    table.bigInteger("round_id").unsigned().notNullable().comment("這一刀打在哪一輪（溢傷仍記在起始輪）");
    table.string("user_id", 33).notNullable().comment("LINE User ID");
    table.bigInteger("damage").unsigned().notNullable();
    table.integer("cost").unsigned().notNullable();
    table.timestamps(true, true);
    table.index(["season_id", "user_id"], "idx_wbc_season_user");
    table.index(["round_id"], "idx_wbc_round");
    table.index(["user_id", "created_at"], "idx_wbc_user_created");
  });

  await knex.schema.createTable("world_boss_season_reward", table => {
    table.bigIncrements("id").primary();
    table.bigInteger("season_id").unsigned().notNullable();
    table.string("user_id", 33).notNullable().comment("LINE User ID");
    table.integer("ranking").unsigned().notNullable().comment("賽季總傷排名（rank 是保留字，用 ranking）");
    table.bigInteger("total_damage").unsigned().notNullable();
    table.integer("stone_amount").unsigned().notNullable().defaultTo(0);
    table.string("title_key", 64).nullable();
    table.timestamps(true, true);
    table.unique(["season_id", "user_id"], "uq_wbsr_season_user");
  });

  const { m: maxOrder } = await knex("titles").max({ m: "order" }).first();
  await knex("titles").insert(
    V2_TITLES.map((t, i) => ({ ...t, order: (maxOrder || 0) + i + 1 }))
  );
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex("titles").whereIn("key", V2_TITLES.map(t => t.key)).del();
  for (const table of [
    "world_boss_season_reward",
    "world_boss_contribution",
    "world_boss_round",
    "world_boss_season",
    "world_boss",
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
};
```

- [ ] **Step 2: `app/config/default.json` 新增 v2 區塊**

插在 `"redis"` 區塊之後（v1 舊區塊原本的位置）。數值為可調預設值（Global Constraints）：

```json
"worldboss": {
  "daily_cost_limit": 100,
  "attack_cooldown_seconds": 5,
  "per_hit_exp": 120,
  "hp_tiers": [
    { "from_round": 1, "base_hp": 30000, "per_round": 15000 },
    { "from_round": 11, "base_hp": 200000, "per_round": 40000 },
    { "from_round": 31, "base_hp": 1200000, "per_round": 100000 },
    { "from_round": 61, "base_hp": 4500000, "per_round": 200000 }
  ],
  "season_rewards": [
    { "min_rank": 1, "max_rank": 1, "stone": 100, "title_key": "worldboss_annihilator" },
    { "min_rank": 2, "max_rank": 3, "stone": 60, "title_key": "worldboss_vanguard" },
    { "min_rank": 4, "max_rank": 10, "stone": 30, "title_key": null },
    { "min_rank": 11, "max_rank": 50, "stone": 10, "title_key": null }
  ]
},
```

血量公式（`hpForRound`，Task 6 實作）：取 `from_round <= round_no` 的**最後一段** tier，`hp = floor((base_hp + (round_no - from_round) * per_round) * hp_weight)`。round 1 = 30K（單一 Lv.100 玩家十刀內可清）、round 10 = 165K、round 11 跳 200K、round 30 = 960K。`per_hit_exp` 120 需在上線前對照 `minigame_level_unit` 曲線驗證手感——標記為待調參數，不阻塞實作。

- [ ] **Step 3: 圖鑑 seed `app/seeds/WorldBossCatalogSeeder.js`**

```js
const BOSSES = [
  { id: 1, name: "山嶺巨像", description: "盤踞於蘭德索爾山脈的古老魔像，行動遲緩卻堅不可摧。", hp_weight: 1.0, image: null },
  { id: 2, name: "深淵雙頭犬", description: "來自地底裂縫的看門猛獸，兩顆頭顱輪流值夜。", hp_weight: 0.9, image: null },
  { id: 3, name: "暴風飛龍", description: "翼展遮天的暴風化身，掠過之處寸草不生。", hp_weight: 1.1, image: null },
  { id: 4, name: "冥府騎士", description: "披著破碎鎧甲的無言騎士，任何攻擊都無法使其後退。", hp_weight: 1.25, image: null },
];

exports.buildRows = () => BOSSES;

exports.seed = async function (knex) {
  // 全量替換式 seeder：只在全新環境跑；prod 若管理員已自行建立圖鑑，切勿重跑
  await knex("world_boss").del();
  await knex("world_boss").insert(BOSSES);
};
```

- [ ] **Step 4: 執行並驗證**

```bash
cd app && yarn migrate && yarn knex seed:run --specific=WorldBossCatalogSeeder.js
node -e "const k=require('knex')(require('./knexfile'));Promise.all([k('world_boss').count({c:'*'}).first(),k('titles').whereIn('key',['worldboss_annihilator','worldboss_vanguard']).count({c:'*'}).first()]).then(r=>{console.log(r);return k.destroy()})"
```
Expected: migrate/seed OK；輸出 `[ { c: 4 }, { c: 2 } ]`。另跑 `node -e "console.log(require('config').get('worldboss.hp_tiers').length)"`（在 `app/` 下）expect `4`。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(worldboss): v2 schema (5 tables), season titles, config, catalog seeder"
```

---

### Task 5: Models（5 支）＋聚合/ledger 測試

**Files:**
- Create: `app/src/model/application/WorldBoss.js`
- Create: `app/src/model/application/WorldBossSeason.js`
- Create: `app/src/model/application/WorldBossRound.js`
- Create: `app/src/model/application/WorldBossContribution.js`
- Create: `app/src/model/application/WorldBossSeasonReward.js`
- Test: `app/src/model/application/__tests__/WorldBossModels.test.js`

**Interfaces:**
- Consumes: `app/src/model/base.js`（`qb(trx)` 慣例：**所有方法收 optional trailing `trx`**，交易由呼叫端 `mysql.transaction()` 開啟下傳；Base 沒有 setTransaction）；`app/src/util/date.js` 的 `todayUtc8()`。
- Produces（後續 task 依賴的精確簽名）:
  - `WorldBoss`: Base instance，`fillable: ["name", "image", "description", "hp_weight"]`
  - `WorldBossSeason.findActive(trx) → Promise<row|undefined>`；`findSettleable(trx) → Promise<row[]>`（active 且 end_time < now）
  - `WorldBossRound.findActiveForUpdate(seasonId, trx) → Promise<row|undefined>`（**必須在 trx 內呼叫**）；`findActiveBySeason(seasonId, trx)`
  - `WorldBossContribution.sumTodayCost(userId, trx) → Promise<number>`；`seasonRanking(seasonId, limit=50) → Promise<[{user_id, display_name, total_damage}]>`（`limit=null` 撈全部；`display_name` left join 自 `user` 表，可能 null）；`sumSeasonDamage(seasonId, userId, trx) → Promise<number>`
  - `WorldBossSeasonReward.tryInsert({season_id, user_id, ranking, total_damage, stone_amount, title_key}, trx) → Promise<boolean>`（false = ER_DUP_ENTRY 已發放）；`countBySeason(seasonId) → Promise<number>`

- [ ] **Step 1: 先寫 failing test**

`app/src/model/application/__tests__/WorldBossModels.test.js`（真實 DB；`__wbtest_` 前綴當測試資料標記）：

```js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");

const contributionModel = require("../WorldBossContribution");
const rewardModel = require("../WorldBossSeasonReward");

const U1 = "__wbtest_model_u1";
const U2 = "__wbtest_model_u2";
const SEASON_ID = 987654301;

async function cleanup() {
  await mysql("world_boss_contribution").where({ season_id: SEASON_ID }).del();
  await mysql("world_boss_season_reward").where({ season_id: SEASON_ID }).del();
}

describe("WorldBoss v2 models", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await mysql.destroy();
  });

  it("sumTodayCost sums only today's rows for the user", async () => {
    await contributionModel.create({ season_id: SEASON_ID, round_id: 1, user_id: U1, damage: 100, cost: 10 });
    await contributionModel.create({ season_id: SEASON_ID, round_id: 1, user_id: U1, damage: 100, cost: 15 });
    await contributionModel.create({ season_id: SEASON_ID, round_id: 1, user_id: U2, damage: 100, cost: 99 });
    // 一筆昨天的，不應被計入
    const [oldId] = await mysql("world_boss_contribution").insert({
      season_id: SEASON_ID, round_id: 1, user_id: U1, damage: 1, cost: 50,
    });
    await mysql("world_boss_contribution")
      .where({ id: oldId })
      .update({ created_at: new Date(Date.now() - 48 * 3600 * 1000) });

    expect(await contributionModel.sumTodayCost(U1)).toBe(25);
  });

  it("seasonRanking orders by total damage desc and respects limit", async () => {
    await contributionModel.create({ season_id: SEASON_ID, round_id: 1, user_id: U1, damage: 100, cost: 1 });
    await contributionModel.create({ season_id: SEASON_ID, round_id: 1, user_id: U1, damage: 50, cost: 1 });
    await contributionModel.create({ season_id: SEASON_ID, round_id: 2, user_id: U2, damage: 400, cost: 1 });

    const ranking = await contributionModel.seasonRanking(SEASON_ID, null);
    expect(ranking.map(r => r.user_id)).toEqual([U2, U1]);
    expect(Number(ranking[0].total_damage)).toBe(400);
    expect(Number(ranking[1].total_damage)).toBe(150);
    expect(await contributionModel.seasonRanking(SEASON_ID, 1)).toHaveLength(1);
  });

  it("tryInsert returns true once then false on duplicate (season_id, user_id)", async () => {
    const payload = { season_id: SEASON_ID, user_id: U1, ranking: 1, total_damage: 150, stone_amount: 100, title_key: null };
    expect(await rewardModel.tryInsert(payload)).toBe(true);
    expect(await rewardModel.tryInsert(payload)).toBe(false);
    expect(await rewardModel.countBySeason(SEASON_ID)).toBe(1);
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `cd app && yarn test -- src/model/application/__tests__/WorldBossModels.test.js`
Expected: FAIL — `Cannot find module '../WorldBossContribution'`。

- [ ] **Step 3: 實作 5 支 model**

`app/src/model/application/WorldBoss.js`:
```js
const Base = require("../base");

class WorldBoss extends Base {}

module.exports = new WorldBoss({
  table: "world_boss",
  fillable: ["name", "image", "description", "hp_weight"],
});
```

`app/src/model/application/WorldBossSeason.js`:
```js
const Base = require("../base");

class WorldBossSeason extends Base {
  /** 目前唯一 active 賽季（是否過期由 service 讀取推導） */
  findActive(trx) {
    return this.qb(trx).where({ status: "active" }).first();
  }

  /** 已到期未結算的賽季（結算 cron 的掃描對象） */
  findSettleable(trx) {
    return this.qb(trx).where({ status: "active" }).where("end_time", "<", new Date());
  }
}

module.exports = new WorldBossSeason({
  table: "world_boss_season",
  fillable: ["name", "announcement", "status", "start_time", "end_time", "settled_at"],
});
```

`app/src/model/application/WorldBossRound.js`:
```js
const Base = require("../base");

class WorldBossRound extends Base {
  /** 攻擊交易用：鎖住當前輪 row。必須在 trx 內呼叫。 */
  findActiveForUpdate(seasonId, trx) {
    return trx(this.table).where({ season_id: seasonId, status: "active" }).forUpdate().first();
  }

  findActiveBySeason(seasonId, trx) {
    return this.qb(trx).where({ season_id: seasonId, status: "active" }).first();
  }
}

module.exports = new WorldBossRound({
  table: "world_boss_round",
  fillable: ["season_id", "round_no", "world_boss_id", "max_hp", "current_hp", "status", "cleared_at"],
});
```

`app/src/model/application/WorldBossContribution.js`:
```js
const Base = require("../base");
const { todayUtc8 } = require("../../util/date");

class WorldBossContribution extends Base {
  /** 今日（UTC+8 日界）cost 加總，每日上限判定用 */
  async sumTodayCost(userId, trx) {
    const day = todayUtc8();
    const start = new Date(`${day}T00:00:00+08:00`);
    const end = new Date(`${day}T23:59:59.999+08:00`);
    const row = await this.qb(trx)
      .sum({ totalCost: "cost" })
      .where({ user_id: userId })
      .whereBetween("created_at", [start, end])
      .first();
    return Number(row.totalCost) || 0;
  }

  /**
   * 賽季排名：Σdamage desc ＋玩家暱稱（LIFF 排行榜用；結算忽略 display_name）。
   * 暱稱 join 抄 JankenRating.getTopRankings 的 user 表 max 子查詢 pattern。
   * limit=null 撈全部（結算用）。
   */
  seasonRanking(seasonId, limit = 50) {
    const users = this.connection("user")
      .select("platform_id")
      .max("display_name as display_name")
      .groupBy("platform_id")
      .as("u");
    const query = this.knex
      .select("user_id")
      .max({ display_name: "u.display_name" })
      .sum({ total_damage: "damage" })
      .leftJoin(users, "u.platform_id", `${this.table}.user_id`)
      .where({ season_id: seasonId })
      .groupBy("user_id")
      .orderBy("total_damage", "desc");
    return limit ? query.limit(limit) : query;
  }

  async sumSeasonDamage(seasonId, userId, trx) {
    const row = await this.qb(trx)
      .sum({ total: "damage" })
      .where({ season_id: seasonId, user_id: userId })
      .first();
    return Number(row.total) || 0;
  }
}

module.exports = new WorldBossContribution({
  table: "world_boss_contribution",
  fillable: ["season_id", "round_id", "user_id", "damage", "cost"],
});
```

`app/src/model/application/WorldBossSeasonReward.js`（仿 `JankenDailyRewardLog` 的 free-function 風格）:
```js
const mysql = require("../../util/mysql");

const TABLE = "world_boss_season_reward";

/**
 * 冪等結算 ledger：UNIQUE(season_id, user_id) 擋重複發放。
 * @returns {Promise<boolean>} true = 首次寫入（應發獎）；false = 已發放過
 */
exports.tryInsert = async function (
  { season_id, user_id, ranking, total_damage, stone_amount, title_key },
  trx
) {
  const db = trx || mysql;
  try {
    await db(TABLE).insert({ season_id, user_id, ranking, total_damage, stone_amount, title_key });
    return true;
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") return false;
    throw err;
  }
};

exports.findBySeasonUser = (seasonId, userId) =>
  mysql(TABLE).where({ season_id: seasonId, user_id: userId }).first();

exports.countBySeason = async seasonId => {
  const row = await mysql(TABLE).count({ c: "*" }).where({ season_id: seasonId }).first();
  return Number(row.c);
};
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `cd app && yarn test -- src/model/application/__tests__/WorldBossModels.test.js`
Expected: PASS（3 tests）。

- [ ] **Step 5: Commit**

```bash
app/node_modules/.bin/prettier --write app/src/model/application/WorldBoss*.js app/src/model/application/__tests__/WorldBossModels.test.js
git add -A && git commit -m "feat(worldboss): v2 models with ranking/daily-cost aggregates and idempotent reward ledger"
```

---

### Task 6: WorldBossBattleService（攻擊交易核心）

**Files:**
- Create: `app/src/service/WorldBossBattleService.js`
- Modify: `app/src/model/application/MinigameLevel.js`（`updateByUserId` 加 optional `trx`）
- Test: `app/src/service/__tests__/WorldBossBattleService.test.js`

**Interfaces:**
- Consumes: Task 5 全部 model；`MinigameService.findByUserId/createByUserId/updateByUserId/getLevelUnit/defaultData`（`app/src/service/MinigameService.js`，直接 re-export model 函式）；config `worldboss.hp_tiers`、`worldboss.daily_cost_limit`。
- Produces（Task 7/10 依賴）:
  - `class WorldBossError extends Error`，`err.code ∈ {"NO_ACTIVE_SEASON","SEASON_ENDED","NO_ACTIVE_ROUND","EMPTY_CATALOG","SEASON_NOT_FOUND","SEASON_NOT_DRAFT","ANOTHER_SEASON_ACTIVE","SEASON_NO_END_TIME"}`（後四個 Task 7 用）
  - `hpForRound(roundNo, hpWeight=1) → number`（純函式）
  - `createRound(trx, seasonId, roundNo, excludeBossId) → Promise<{id, season_id, round_no, world_boss_id, max_hp, current_hp, status, boss}>`
  - `attack({userId, damage, cost, exp}) → Promise<{season, round, boss, clearedRounds: [{round_no, world_boss_id}], damage, cost, levelResult, seasonTotalDamage}>`；`round` 為攻擊後的當前 active 輪（含最新 `current_hp`）；`seasonTotalDamage` = 該玩家本季累計傷害（spec §2.5 攻擊回覆要顯示）
  - `getRemainingDailyCost(userId) → Promise<{used, limit, remaining}>`
  - `applyJobExp(userId, earnedExp, trx) → Promise<{levelUp, levelUpCount, newLevel, newExp, earnedExp}>`
  - `MinigameLevel.updateByUserId(userId, attributes, trx)`（第三參數新增，不影響既有呼叫端）

- [ ] **Step 1: `MinigameLevel.updateByUserId` 加 trx**

`app/src/model/application/MinigameLevel.js`（現為 `mysql(TABLE)` 直連）改成：

```js
exports.updateByUserId = (userId, attributes, trx) => {
  attributes = pick(attributes, ["level", "exp"]);
  const query = (trx || mysql)(TABLE)
    .where({ user_id: getWhere(userId) })
    .update(attributes);
  return query;
};
```
（`getWhere(userId)` 是子查詢 builder，會被編進外層 SQL、在 trx 連線上執行，照舊即可。）

- [ ] **Step 2: 先寫 failing test**

`app/src/service/__tests__/WorldBossBattleService.test.js`。真實 DB；**mock `config`（tier 用小數值好算）與 `MinigameService`（職業經驗另以 applyJobExp 單元測，attack 整合測只驗有被呼叫且吃到 trx）**。`jest.mock` 不 hoist，必須放在 require service 之前：

```js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");

jest.mock("config", () => {
  const orig = jest.requireActual("config");
  return {
    get: jest.fn(key => {
      if (key.startsWith("worldboss.")) {
        const cfg = {
          "worldboss.daily_cost_limit": 100,
          "worldboss.hp_tiers": global.__WB_TIERS__,
        };
        if (key in cfg) return cfg[key];
      }
      return orig.get(key);
    }),
  };
});

jest.mock("../MinigameService", () => ({
  findByUserId: jest.fn(),
  createByUserId: jest.fn(),
  updateByUserId: jest.fn(),
  getLevelUnit: jest.fn(),
  defaultData: { level: 1, exp: 0 },
}));

const minigameService = require("../MinigameService");
const BattleService = require("../WorldBossBattleService");

const USER = "__wbtest_battle_u1";
const USER2 = "__wbtest_battle_u2";
const SEASON_NAME = "__wbtest_battle_season";

const DEFAULT_TIERS = [
  { from_round: 1, base_hp: 1000, per_round: 100 },
  { from_round: 11, base_hp: 5000, per_round: 500 },
];

let bossIds = [];
let bossWeightBackup = [];

async function cleanup() {
  const seasons = await mysql("world_boss_season").where({ name: SEASON_NAME }).select("id");
  const ids = seasons.map(r => r.id);
  if (ids.length) {
    await mysql("world_boss_contribution").whereIn("season_id", ids).del();
    await mysql("world_boss_round").whereIn("season_id", ids).del();
    await mysql("world_boss_season").whereIn("id", ids).del();
  }
}

async function seedSeason({ endInFuture = true, roundHp = 1000 } = {}) {
  const [seasonId] = await mysql("world_boss_season").insert({
    name: SEASON_NAME,
    status: "active",
    start_time: new Date(Date.now() - 3600 * 1000),
    end_time: new Date(Date.now() + (endInFuture ? 1 : -1) * 24 * 3600 * 1000),
  });
  const [roundId] = await mysql("world_boss_round").insert({
    season_id: seasonId,
    round_no: 1,
    world_boss_id: bossIds[0],
    max_hp: roundHp,
    current_hp: roundHp,
    status: "active",
  });
  return { seasonId, roundId };
}

describe("WorldBossBattleService", () => {
  beforeAll(async () => {
    // 圖鑑至少兩隻，測「換王不連重」
    const existing = await mysql("world_boss").select("id");
    bossIds = existing.map(r => r.id);
    while (bossIds.length < 2) {
      const [id] = await mysql("world_boss").insert({ name: `__wbtest_boss_${bossIds.length}`, hp_weight: 1 });
      bossIds.push(id);
    }
    // 血量斷言要可決定：seed 圖鑑帶混合 hp_weight（0.9/1.1/1.25），且 pickBoss 會換王，
    // 不正規化的話 round 2+ 的 max_hp 取決於隨機選到哪隻。備份後全設 1，afterAll 還原。
    bossWeightBackup = await mysql("world_boss").select("id", "hp_weight");
    await mysql("world_boss").update({ hp_weight: 1 });
  });

  beforeEach(async () => {
    global.__WB_TIERS__ = DEFAULT_TIERS;
    await cleanup();
    // 測試前提：本機 DB 不得有真實 active 賽季（findActive 是全域讀取，會撿到它而不是測試 seed 的）
    const stray = await mysql("world_boss_season").where({ status: "active" }).first();
    if (stray) throw new Error(`測試前提失敗：DB 存在真實 active 賽季 id=${stray.id}，先結束它再跑測試`);
    jest.clearAllMocks();
    minigameService.findByUserId.mockResolvedValue({ level: 10, exp: 0, job_key: "swordman" });
    minigameService.getLevelUnit.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({ level: i + 1, max_exp: 1000 }))
    );
    minigameService.updateByUserId.mockResolvedValue(1);
  });

  afterAll(async () => {
    await cleanup();
    for (const row of bossWeightBackup) {
      await mysql("world_boss").where({ id: row.id }).update({ hp_weight: row.hp_weight });
    }
    await mysql("world_boss").where("name", "like", "__wbtest_boss_%").del();
    await mysql.destroy();
  });

  describe("hpForRound", () => {
    it("uses the last tier whose from_round <= roundNo, with hp_weight", () => {
      expect(BattleService.hpForRound(1)).toBe(1000);
      expect(BattleService.hpForRound(10)).toBe(1000 + 9 * 100);
      expect(BattleService.hpForRound(11)).toBe(5000);
      expect(BattleService.hpForRound(12, 1.5)).toBe(Math.floor(5500 * 1.5));
    });
  });

  describe("attack", () => {
    it("decrements hp, records contribution, grants job exp in the same flow", async () => {
      const { seasonId, roundId } = await seedSeason({ roundHp: 1000 });
      const result = await BattleService.attack({ userId: USER, damage: 300, cost: 10, exp: 120 });

      expect(result.round.current_hp).toBe(700);
      expect(result.clearedRounds).toHaveLength(0);
      const dbRound = await mysql("world_boss_round").where({ id: roundId }).first();
      expect(Number(dbRound.current_hp)).toBe(700);
      const contrib = await mysql("world_boss_contribution").where({ season_id: seasonId, user_id: USER }).first();
      expect(Number(contrib.damage)).toBe(300);
      expect(Number(contrib.cost)).toBe(10);
      expect(Number(contrib.round_id)).toBe(roundId);
      expect(result.seasonTotalDamage).toBe(300);
      expect(minigameService.updateByUserId).toHaveBeenCalledWith(USER, { level: 10, exp: 120 }, expect.anything());
    });

    it("clears the round on lethal damage and spawns next round with a different boss and overflow hp", async () => {
      const { seasonId, roundId } = await seedSeason({ roundHp: 1000 });
      const result = await BattleService.attack({ userId: USER, damage: 1300, cost: 10, exp: 120 });

      expect(result.clearedRounds).toEqual([{ round_no: 1, world_boss_id: bossIds[0] }]);
      const cleared = await mysql("world_boss_round").where({ id: roundId }).first();
      expect(cleared.status).toBe("cleared");
      expect(Number(cleared.current_hp)).toBe(0);
      expect(cleared.cleared_at).not.toBeNull();

      const next = await mysql("world_boss_round").where({ season_id: seasonId, status: "active" }).first();
      expect(next.round_no).toBe(2);
      expect(Number(next.world_boss_id)).not.toBe(Number(bossIds[0]));
      // hp_weight 已於 beforeAll 正規化為 1：round 2 max = 1000 + 100 = 1100，溢傷 300 → 剩 800
      expect(Number(next.max_hp)).toBe(1100);
      expect(Number(next.current_hp)).toBe(800);
      expect(result.round.current_hp).toBe(800);
    });

    it("one hit can clear multiple low-hp rounds (overflow loop)", async () => {
      global.__WB_TIERS__ = [{ from_round: 1, base_hp: 100, per_round: 0 }];
      const { seasonId } = await seedSeason({ roundHp: 100 });
      const result = await BattleService.attack({ userId: USER, damage: 250, cost: 10, exp: 120 });

      expect(result.clearedRounds.map(r => r.round_no)).toEqual([1, 2]);
      const active = await mysql("world_boss_round").where({ season_id: seasonId, status: "active" }).first();
      expect(active.round_no).toBe(3);
      expect(Number(active.current_hp)).toBe(50);
    });

    it("rejects with NO_ACTIVE_SEASON when nothing is active", async () => {
      await expect(BattleService.attack({ userId: USER, damage: 1, cost: 1, exp: 1 })).rejects.toMatchObject({
        code: "NO_ACTIVE_SEASON",
      });
    });

    it("rejects with SEASON_ENDED when past end_time", async () => {
      await seedSeason({ endInFuture: false });
      await expect(BattleService.attack({ userId: USER, damage: 1, cost: 1, exp: 1 })).rejects.toMatchObject({
        code: "SEASON_ENDED",
      });
    });

    it("two concurrent attacks serialize on the row lock and both land", async () => {
      const { seasonId } = await seedSeason({ roundHp: 100000 });
      await Promise.all([
        BattleService.attack({ userId: USER, damage: 111, cost: 10, exp: 1 }),
        BattleService.attack({ userId: USER2, damage: 222, cost: 10, exp: 1 }),
      ]);
      const round = await mysql("world_boss_round").where({ season_id: seasonId, status: "active" }).first();
      expect(Number(round.current_hp)).toBe(100000 - 333);
      const rows = await mysql("world_boss_contribution").where({ season_id: seasonId });
      expect(rows).toHaveLength(2);
    });

    it("UNIQUE(season_id, round_no) blocks a duplicate round row (safety net)", async () => {
      const { seasonId } = await seedSeason();
      await expect(
        mysql("world_boss_round").insert({
          season_id: seasonId, round_no: 1, world_boss_id: bossIds[0], max_hp: 1, current_hp: 1,
        })
      ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    });
  });

  describe("applyJobExp", () => {
    it("carries exp across multiple level-ups", async () => {
      minigameService.findByUserId.mockResolvedValue({ level: 1, exp: 900, job_key: "mage" });
      const r = await BattleService.applyJobExp(USER, 2200, null);
      expect(r).toMatchObject({ levelUp: true, levelUpCount: 3, newLevel: 4, newExp: 100 });
    });

    it("caps at max level instead of crashing (v1 bug fixed)", async () => {
      minigameService.findByUserId.mockResolvedValue({ level: 100, exp: 500, job_key: "mage" });
      const r = await BattleService.applyJobExp(USER, 99999, null);
      expect(r).toMatchObject({ levelUp: false, newLevel: 100, newExp: 0 });
    });

    it("creates the minigame row for brand-new users", async () => {
      minigameService.findByUserId.mockResolvedValueOnce(null).mockResolvedValue({ level: 1, exp: 0, job_key: "adventurer" });
      await BattleService.applyJobExp(USER, 10, null);
      expect(minigameService.createByUserId).toHaveBeenCalledWith(USER, { level: 1, exp: 0 });
    });
  });
});
```

- [ ] **Step 3: 跑測試確認 fail**

Run: `cd app && yarn test -- src/service/__tests__/WorldBossBattleService.test.js`
Expected: FAIL — `Cannot find module '../WorldBossBattleService'`。

- [ ] **Step 4: 實作 `app/src/service/WorldBossBattleService.js`**

```js
const config = require("config");
const mysql = require("../util/mysql");
const seasonModel = require("../model/application/WorldBossSeason");
const roundModel = require("../model/application/WorldBossRound");
const contributionModel = require("../model/application/WorldBossContribution");
const bossModel = require("../model/application/WorldBoss");
const minigameService = require("./MinigameService");

class WorldBossError extends Error {
  constructor(code) {
    super(code);
    this.name = "WorldBossError";
    this.code = code;
  }
}

/**
 * 分段線性血量曲線：取 from_round <= roundNo 的最後一段 tier。
 * hp = floor((base_hp + (roundNo - from_round) * per_round) * hpWeight)
 */
function hpForRound(roundNo, hpWeight = 1) {
  const tiers = config.get("worldboss.hp_tiers");
  let tier = tiers[0];
  for (const t of tiers) {
    if (roundNo >= t.from_round) tier = t;
  }
  return Math.floor((tier.base_hp + (roundNo - tier.from_round) * tier.per_round) * hpWeight);
}

/** 隨機挑王，圖鑑 >1 隻時避免與上一輪重複 */
async function pickBoss(excludeBossId, trx) {
  const db = trx || mysql;
  let query = db("world_boss");
  if (excludeBossId) {
    const { c } = await db("world_boss").count({ c: "*" }).first();
    if (Number(c) > 1) query = query.whereNot({ id: excludeBossId });
  }
  const boss = await query.orderByRaw("RAND()").first();
  if (!boss) throw new WorldBossError("EMPTY_CATALOG");
  return boss;
}

async function createRound(trx, seasonId, roundNo, excludeBossId) {
  const boss = await pickBoss(excludeBossId, trx);
  const maxHp = hpForRound(roundNo, boss.hp_weight);
  const attributes = {
    season_id: seasonId,
    round_no: roundNo,
    world_boss_id: boss.id,
    max_hp: maxHp,
    current_hp: maxHp,
    status: "active",
  };
  const id = await roundModel.create(attributes, trx);
  return { id, ...attributes, boss };
}

/**
 * 發 RPG 職業經驗（v1 decideLevelResult 搬入 + 滿級封頂 guard）。
 * 職業等級是傷害公式的輸入，這裡是 v2 唯一的職業經驗來源。
 */
async function applyJobExp(userId, earnedExp, trx) {
  let levelData = await minigameService.findByUserId(userId);
  if (!levelData) {
    await minigameService.createByUserId(userId, minigameService.defaultData);
    levelData = await minigameService.findByUserId(userId);
  }
  const levelUnits = await minigameService.getLevelUnit();

  let newLevel = levelData.level;
  let newExp = levelData.exp + earnedExp;
  let levelUpCount = 0;

  let next = levelUnits.find(u => u.level === newLevel + 1);
  while (next && newExp >= next.max_exp) {
    newExp -= next.max_exp;
    newLevel++;
    levelUpCount++;
    next = levelUnits.find(u => u.level === newLevel + 1);
  }
  if (!next) newExp = 0; // 滿級：v1 在這裡會 crash（find 回 undefined），v2 直接封頂

  await minigameService.updateByUserId(userId, { level: newLevel, exp: newExp }, trx);
  return { levelUp: levelUpCount > 0, levelUpCount, newLevel, newExp, earnedExp };
}

/**
 * 攻擊交易（spec §4.1）：鎖當前輪 → 扣血 → 清輪開新輪（溢傷 loop）→ 寫貢獻 → 發職業經驗。
 * 傷害計算在 controller（LINE 層邊界），本函式只收計好的數字。
 */
async function attack({ userId, damage, cost, exp }) {
  return mysql.transaction(async trx => {
    const season = await seasonModel.findActive(trx);
    if (!season) throw new WorldBossError("NO_ACTIVE_SEASON");
    if (season.end_time && new Date(season.end_time) < new Date()) {
      throw new WorldBossError("SEASON_ENDED");
    }

    let round = await roundModel.findActiveForUpdate(season.id, trx);
    if (!round) throw new WorldBossError("NO_ACTIVE_ROUND");

    const hitRoundId = round.id;
    const clearedRounds = [];
    let remaining = damage;

    while (remaining >= Number(round.current_hp)) {
      remaining -= Number(round.current_hp);
      await roundModel.update(
        round.id,
        { current_hp: 0, status: "cleared", cleared_at: new Date() },
        {},
        trx
      );
      clearedRounds.push({ round_no: round.round_no, world_boss_id: round.world_boss_id });
      round = await createRound(trx, season.id, round.round_no + 1, round.world_boss_id);
    }
    if (remaining > 0) {
      const newHp = Number(round.current_hp) - remaining;
      await roundModel.update(round.id, { current_hp: newHp }, {}, trx);
      round = { ...round, current_hp: newHp };
    }

    await contributionModel.create(
      { season_id: season.id, round_id: hitRoundId, user_id: userId, damage, cost },
      trx
    );

    const levelResult = await applyJobExp(userId, exp, trx);
    const seasonTotalDamage = await contributionModel.sumSeasonDamage(season.id, userId, trx);
    const boss = round.boss || (await bossModel.find(round.world_boss_id, trx));

    return { season, round, boss, clearedRounds, damage, cost, levelResult, seasonTotalDamage };
  });
}

async function getRemainingDailyCost(userId) {
  const limit = config.get("worldboss.daily_cost_limit");
  const used = await contributionModel.sumTodayCost(userId);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

module.exports = {
  WorldBossError,
  hpForRound,
  pickBoss,
  createRound,
  applyJobExp,
  attack,
  getRemainingDailyCost,
};
```

- [ ] **Step 5: 跑測試確認 pass**

Run: `cd app && yarn test -- src/service/__tests__/WorldBossBattleService.test.js`
Expected: PASS（11 tests）。再跑 `yarn test -- --runInBand`（全套）確認 MinigameLevel 改動沒破壞既有測試。

- [ ] **Step 6: Commit**

```bash
app/node_modules/.bin/prettier --write app/src/service/WorldBossBattleService.js app/src/model/application/MinigameLevel.js app/src/service/__tests__/WorldBossBattleService.test.js
git add -A && git commit -m "feat(worldboss): battle service — atomic on-hit transaction with overflow rounds and job exp"
```

---

### Task 7: WorldBossSeasonService（開季／狀態／冪等結算）＋稱號保護

**Files:**
- Create: `app/src/service/WorldBossSeasonService.js`
- Modify: `app/src/model/application/UserTitle.js`（加 `clearAllExcept`）
- Modify: `app/bin/TitleDelivery.js`（`clearAll` → `clearAllExcept("worldboss_")`）
- Test: `app/src/service/__tests__/WorldBossSeasonService.test.js`

**Interfaces:**
- Consumes: Task 5/6 全部；`inventory.increaseGodStone({userId, amount, note, trx})`（`app/src/model/application/Inventory.js:117`，女神石 = itemId 999 ledger）；`UserTitleModel.grant(userId, titleId, trx)`（有防重複檢查；`user_titles.user_id` 存的就是 LINE platform id）；config `worldboss.season_rewards`。
- Produces（Task 8/10/11 依賴）:
  - `createSeason({name, announcement, start_time, end_time}) → Promise<seasonId>`（status=draft）
  - `openSeason(seasonId) → Promise<{seasonId, round}>`（draft→active + 建第 1 輪；違規丟 `WorldBossError`：`SEASON_NOT_FOUND`/`SEASON_NOT_DRAFT`/`ANOTHER_SEASON_ACTIVE`/`SEASON_NO_END_TIME`）
  - `getBattleStatus() → Promise<null | {season, round, boss, ended}>`（`ended` = active 但 now > end_time 的推導態）
  - `getRanking(seasonId, limit=50) → Promise<[{user_id, display_name, total_damage}]>`
  - `settleExpiredSeasons() → Promise<[{seasonId, granted}]>`（冪等；全數發完才標 settled）
  - `UserTitleModel.clearAllExcept(keyPrefix, trx)` — TitleDelivery 每日重算改用此函式，`worldboss_` 前綴稱號（永久性賽季獎勵）不再被每日清除
  - 女神石 note 固定字串：`"worldboss_season_reward"`

**🚩 本 task 修的隱藏地雷**：`bin/TitleDelivery.js` 每日 `UserTitleModel.clearAll(trx)` 會清空**整張** `user_titles` 再重發 gacha/janken 稱號 — 不改的話，v2 結算發的賽季稱號活不過下一次 cron。

- [ ] **Step 1: 先寫 failing test**

`app/src/service/__tests__/WorldBossSeasonService.test.js`：

```js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");

jest.mock("config", () => {
  const orig = jest.requireActual("config");
  return {
    get: jest.fn(key => {
      if (key === "worldboss.season_rewards") return global.__WB_REWARDS__;
      if (key === "worldboss.hp_tiers") return [{ from_round: 1, base_hp: 1000, per_round: 100 }];
      return orig.get(key);
    }),
  };
});

const SeasonService = require("../WorldBossSeasonService");
const UserTitleModel = require("../../model/application/UserTitle");

const SEASON_NAME = "__wbtest_season_svc";
const U = n => `__wbtest_ssvc_u${n}`;

async function cleanup() {
  const ids = (await mysql("world_boss_season").where({ name: SEASON_NAME }).select("id")).map(r => r.id);
  if (ids.length) {
    await mysql("world_boss_season_reward").whereIn("season_id", ids).del();
    await mysql("world_boss_contribution").whereIn("season_id", ids).del();
    await mysql("world_boss_round").whereIn("season_id", ids).del();
    await mysql("world_boss_season").whereIn("id", ids).del();
  }
  await mysql("inventory").where({ note: "worldboss_season_reward" }).where("userId", "like", "__wbtest_ssvc_%").del();
  await mysql("user_titles").where("user_id", "like", "__wbtest_ssvc_%").del();
}

async function seedContribution(seasonId, userId, damage) {
  await mysql("world_boss_contribution").insert({ season_id: seasonId, round_id: 1, user_id: userId, damage, cost: 10 });
}

describe("WorldBossSeasonService", () => {
  beforeAll(async () => {
    // openSeason → createRound → pickBoss 需要圖鑑至少一隻（全新 DB 也要能跑）
    const { c } = await mysql("world_boss").count({ c: "*" }).first();
    if (Number(c) === 0) {
      await mysql("world_boss").insert({ name: "__wbtest_boss_ssvc", hp_weight: 1 });
    }
  });
  beforeEach(async () => {
    global.__WB_REWARDS__ = [
      { min_rank: 1, max_rank: 1, stone: 100, title_key: "worldboss_annihilator" },
      { min_rank: 2, max_rank: 3, stone: 50, title_key: null },
    ];
    await cleanup();
    // 測試前提：DB 不得有真實 active 賽季（openSeason 的 ANOTHER_SEASON_ACTIVE 檢查與
    // settleExpiredSeasons 的全域掃描都會被它污染）
    const stray = await mysql("world_boss_season").where({ status: "active" }).first();
    if (stray) throw new Error(`測試前提失敗：DB 存在真實 active 賽季 id=${stray.id}，先結束它再跑測試`);
  });
  afterAll(async () => {
    await cleanup();
    await mysql("world_boss").where({ name: "__wbtest_boss_ssvc" }).del();
    await mysql.destroy();
  });

  it("openSeason activates a draft and creates round 1; only one active season allowed", async () => {
    const id = await SeasonService.createSeason({
      name: SEASON_NAME,
      announcement: "test",
      start_time: null,
      end_time: new Date(Date.now() + 24 * 3600 * 1000),
    });
    const { round } = await SeasonService.openSeason(id);
    expect(round.round_no).toBe(1);
    expect(Number(round.current_hp)).toBe(Number(round.max_hp));

    const season = await mysql("world_boss_season").where({ id }).first();
    expect(season.status).toBe("active");
    expect(season.start_time).not.toBeNull();

    const id2 = await SeasonService.createSeason({
      name: SEASON_NAME, announcement: null, start_time: null,
      end_time: new Date(Date.now() + 24 * 3600 * 1000),
    });
    await expect(SeasonService.openSeason(id2)).rejects.toMatchObject({ code: "ANOTHER_SEASON_ACTIVE" });
    await expect(SeasonService.openSeason(id)).rejects.toMatchObject({ code: "SEASON_NOT_DRAFT" });
  });

  it("settleExpiredSeasons pays stones/titles by rank, idempotently, then marks settled", async () => {
    const [seasonId] = await mysql("world_boss_season").insert({
      name: SEASON_NAME, status: "active",
      start_time: new Date(Date.now() - 48 * 3600 * 1000),
      end_time: new Date(Date.now() - 3600 * 1000),
    });
    await seedContribution(seasonId, U(1), 400);
    await seedContribution(seasonId, U(2), 300);
    await seedContribution(seasonId, U(3), 200);
    await seedContribution(seasonId, U(4), 100); // rank 4 → 超出階梯，無獎

    const results = await SeasonService.settleExpiredSeasons();
    expect(results.find(r => r.seasonId === seasonId)).toMatchObject({ seasonId, granted: 3 });

    const rewards = await mysql("world_boss_season_reward").where({ season_id: seasonId }).orderBy("ranking");
    expect(rewards.map(r => [r.user_id, r.ranking, r.stone_amount])).toEqual([
      [U(1), 1, 100],
      [U(2), 2, 50],
      [U(3), 3, 50],
    ]);

    const stones = await mysql("inventory").where({ note: "worldboss_season_reward" }).where("userId", "like", "__wbtest_ssvc_%");
    expect(stones).toHaveLength(3);

    const titles = await UserTitleModel.findByUser(U(1));
    expect(titles.map(t => t.key)).toContain("worldboss_annihilator");

    const season = await mysql("world_boss_season").where({ id: seasonId }).first();
    expect(season.status).toBe("settled");
    expect(season.settled_at).not.toBeNull();

    // settled 的賽季不會被再次撈起（狀態機：settled 不重結算）
    const again = await SeasonService.settleExpiredSeasons();
    expect(again.filter(r => r.seasonId === seasonId)).toEqual([]);

    // 冪等：即使被強制重跑（模擬中途 crash 後 status 還是 active）也不重複發
    await mysql("world_boss_season").where({ id: seasonId }).update({ status: "active" });
    const rerun = await SeasonService.settleExpiredSeasons();
    expect(rerun.find(r => r.seasonId === seasonId)).toMatchObject({ seasonId, granted: 0 });
    const stonesAfter = await mysql("inventory").where({ note: "worldboss_season_reward" }).where("userId", "like", "__wbtest_ssvc_%");
    expect(stonesAfter).toHaveLength(3);
  });

  it("clearAllExcept keeps worldboss_ titles and wipes the rest", async () => {
    const annihilator = await mysql("titles").where({ key: "worldboss_annihilator" }).first();
    const otherTitle = await mysql("titles").whereNot("key", "like", "worldboss_%").first();
    await UserTitleModel.grant(U(9), annihilator.id);
    await UserTitleModel.grant(U(9), otherTitle.id);

    await UserTitleModel.clearAllExcept("worldboss_");

    const kept = await mysql("user_titles").where({ user_id: U(9) });
    expect(kept).toHaveLength(1);
    expect(Number(kept[0].title_id)).toBe(Number(annihilator.id));
  });
});
```

⚠️ `clearAllExcept` 測試會清掉整張 `user_titles` 的非 worldboss 資料列 — 本機 DB 這張表每日由 TitleDelivery cron 重建，可接受；不要在意外環境跑。

- [ ] **Step 2: 跑測試確認 fail**

Run: `cd app && yarn test -- src/service/__tests__/WorldBossSeasonService.test.js`
Expected: FAIL — `Cannot find module '../WorldBossSeasonService'`。

- [ ] **Step 3: 實作**

`app/src/model/application/UserTitle.js` 加：

```js
/**
 * 清除 user_titles，但保留 key 以 keyPrefix 開頭的稱號（永久性稱號，例如 worldboss_ 賽季獎勵）。
 * TitleDelivery 每日重算用這支取代 clearAll。
 */
exports.clearAllExcept = async (keyPrefix, trx) => {
  const db = trx || mysql;
  return db(TABLE)
    .whereNotIn("title_id", db("titles").select("id").where("key", "like", `${keyPrefix}%`))
    .delete();
};
```

`app/bin/TitleDelivery.js` main() 內：

```js
    // worldboss_ 前綴 = 結算發放的永久性賽季稱號，不參與每日重算
    await UserTitleModel.clearAllExcept("worldboss_", trx);
```
（取代原本的 `await UserTitleModel.clearAll(trx);`）

`app/src/service/WorldBossSeasonService.js`：

```js
const config = require("config");
const mysql = require("../util/mysql");
const seasonModel = require("../model/application/WorldBossSeason");
const roundModel = require("../model/application/WorldBossRound");
const contributionModel = require("../model/application/WorldBossContribution");
const bossModel = require("../model/application/WorldBoss");
const rewardModel = require("../model/application/WorldBossSeasonReward");
const UserTitleModel = require("../model/application/UserTitle");
const { inventory } = require("../model/application/Inventory");
const BattleService = require("./WorldBossBattleService");
const { DefaultLogger } = require("../util/Logger");

const { WorldBossError } = BattleService;
const STONE_NOTE = "worldboss_season_reward";

function createSeason({ name, announcement, start_time, end_time }) {
  return seasonModel.create({ name, announcement, status: "draft", start_time, end_time });
}

/** 管理頁「開季」：draft → active + 建第 1 輪。系統唯一的手動生命週期動作。 */
async function openSeason(seasonId) {
  return mysql.transaction(async trx => {
    const season = await seasonModel.find(seasonId, trx);
    if (!season) throw new WorldBossError("SEASON_NOT_FOUND");
    if (season.status !== "draft") throw new WorldBossError("SEASON_NOT_DRAFT");
    if (!season.end_time) throw new WorldBossError("SEASON_NO_END_TIME");
    const active = await seasonModel.findActive(trx);
    if (active) throw new WorldBossError("ANOTHER_SEASON_ACTIVE");

    await seasonModel.update(
      seasonId,
      { status: "active", start_time: season.start_time || new Date() },
      {},
      trx
    );
    const round = await BattleService.createRound(trx, seasonId, 1, null);
    return { seasonId, round };
  });
}

/** 聊天卡／LIFF 用的當前戰況。null = 沒有 active 賽季。ended = 到期未結算（推導態）。 */
async function getBattleStatus() {
  const season = await seasonModel.findActive();
  if (!season) return null;
  const ended = Boolean(season.end_time && new Date(season.end_time) < new Date());
  const round = await roundModel.findActiveBySeason(season.id);
  const boss = round ? await bossModel.find(round.world_boss_id) : null;
  return { season, round, boss, ended };
}

function getRanking(seasonId, limit = 50) {
  return contributionModel.seasonRanking(seasonId, limit);
}

function rewardForRank(position) {
  const ladder = config.get("worldboss.season_rewards");
  return ladder.find(r => position >= r.min_rank && position <= r.max_rank) || null;
}

async function settleSeason(season) {
  const ranking = await contributionModel.seasonRanking(season.id, null);
  const titleRows = await mysql("titles").where("key", "like", "worldboss_%");
  const titleIdByKey = Object.fromEntries(titleRows.map(r => [r.key, r.id]));

  let granted = 0;
  for (let i = 0; i < ranking.length; i++) {
    const position = i + 1;
    const reward = rewardForRank(position);
    if (!reward) break; // ranking 依傷害 desc，超出階梯的名次都無獎

    const { user_id, total_damage } = ranking[i];
    await mysql.transaction(async trx => {
      const inserted = await rewardModel.tryInsert(
        {
          season_id: season.id,
          user_id,
          ranking: position,
          total_damage,
          stone_amount: reward.stone,
          title_key: reward.title_key || null,
        },
        trx
      );
      if (!inserted) return; // 重跑：這名玩家已發放過

      if (reward.stone > 0) {
        await inventory.increaseGodStone({ userId: user_id, amount: reward.stone, note: STONE_NOTE, trx });
      }
      if (reward.title_key && titleIdByKey[reward.title_key]) {
        await UserTitleModel.grant(user_id, titleIdByKey[reward.title_key], trx);
      }
      granted++;
    });
  }

  await seasonModel.update(season.id, { status: "settled", settled_at: new Date() });
  DefaultLogger.info(`[WorldBossSeason] season ${season.id} settled, ${granted} rewards granted`);
  return { seasonId: season.id, granted };
}

/** cron 進入點：掃到期賽季逐一結算。逐人小交易 + ledger 冪等，中途掛掉重跑即可。 */
async function settleExpiredSeasons() {
  const seasons = await seasonModel.findSettleable();
  const results = [];
  for (const season of seasons) {
    results.push(await settleSeason(season));
  }
  return results;
}

module.exports = {
  createSeason,
  openSeason,
  getBattleStatus,
  getRanking,
  settleExpiredSeasons,
};
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `cd app && yarn test -- src/service/__tests__/WorldBossSeasonService.test.js`
Expected: PASS（3 tests）。再全跑 `yarn test -- --runInBand` 確認 TitleDelivery/UserTitle 改動無回歸。

- [ ] **Step 5: Commit**

```bash
app/node_modules/.bin/prettier --write app/src/service/WorldBossSeasonService.js app/src/model/application/UserTitle.js app/bin/TitleDelivery.js app/src/service/__tests__/WorldBossSeasonService.test.js
git add -A && git commit -m "feat(worldboss): season lifecycle + idempotent settlement; protect permanent season titles from daily title sweep"
```

---

### Task 8: 結算 cron

**Files:**
- Create: `app/bin/WorldBossSeasonSettle.js`
- Modify: `app/config/crontab.config.js`（append 一個條目）

**Interfaces:**
- Consumes: `WorldBossSeasonService.settleExpiredSeasons()`（Task 7）。
- Produces: worker（`yarn worker`）每小時第 10 分自動結算到期賽季。薄殼不寫測試（邏輯已在 Task 7 測完）。

- [ ] **Step 1: `app/bin/WorldBossSeasonSettle.js`**（仿 `app/bin/AchievementCron.js` 骨架）

```js
const WorldBossSeasonService = require("../src/service/WorldBossSeasonService");
const { DefaultLogger } = require("../src/util/Logger");

module.exports = main;

async function main() {
  try {
    const results = await WorldBossSeasonService.settleExpiredSeasons();
    if (results.length > 0) {
      DefaultLogger.info(`World boss season settle: ${JSON.stringify(results)}`);
    }
  } catch (err) {
    DefaultLogger.error("World boss season settle failed:", err);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
```

- [ ] **Step 2: `app/config/crontab.config.js` 加條目**（陣列尾端 append，形狀比照既有條目）

```js
  {
    name: "World Boss Season Settle",
    description: "settle expired world boss seasons (idempotent reward ledger)",
    period: ["0", "10", "*", "*", "*", "*"],
    immediate: false,
    require_path: "./bin/WorldBossSeasonSettle",
  },
```

- [ ] **Step 3: 驗證（直接執行一次）**

```bash
cd app && node bin/WorldBossSeasonSettle.js
```
Expected: 正常結束（本機無到期賽季 → 無輸出、exit 0）。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(worldboss): hourly season settlement cron"
```

---

### Task 9: Flex 模板

**Files:**
- Create: `app/src/templates/application/WorldBoss.js`

**Interfaces:**
- Consumes: `app/src/templates/common/theme.js` 的 `{ SEMANTIC, SURFACE, FEATURE }`（`FEATURE.worldBoss = SEMANTIC.danger`，Task 1 特意保留）；config `defaultUserIcon`、`worldboss.attack_cooldown_seconds`。
- Produces（Task 10 依賴的簽名；純函式、不查資料、不 require model/service）:
  - `generateBattleStatusBubble({ season, round, boss, daily, liffUri }) → bubble`
  - `generateAttackResultBubble({ result, daily }) → bubble`（`result` = `BattleService.attack()` 回傳值）
  - `generateNoActiveSeasonBubble({ ended }) → bubble`（`ended=true` → 「賽季結算中」文案；否則「目前沒有進行中的賽季」）
  - 攻擊鈕 postback data = `JSON.stringify({ action: "worldBossAttack", attackType: "standard"|"skill", cooldown: <config 秒數> })` — `cooldown` 由 `app.js#HandlePostback` 的 redis SETNX 全域機制執行，controller 不用自己做冷卻。

- [ ] **Step 1: 實作 `app/src/templates/application/WorldBoss.js`**（風格仿 `templates/application/Weather.js`：theme 常數 + 小 helper + builder）

```js
const config = require("config");
const { SEMANTIC, SURFACE, FEATURE } = require("../common/theme");

const ACCENT = FEATURE.worldBoss || SEMANTIC.danger;
const BAR_TRACK = "#E0E0E0";

function textNode(text, extra = {}) {
  return { type: "text", text: String(text), wrap: true, size: "sm", color: SURFACE.text, ...extra };
}

/** LINE Flex 血條：外層當軌道、內層寬度百分比 + filler */
function hpBar(current, max) {
  const percent = Math.max(0, Math.min(100, Math.round((Number(current) / Number(max)) * 100)));
  return {
    type: "box",
    layout: "vertical",
    height: "8px",
    backgroundColor: BAR_TRACK,
    cornerRadius: "4px",
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: `${Math.max(percent, 1)}%`,
        backgroundColor: ACCENT,
        cornerRadius: "4px",
        contents: [{ type: "filler" }],
      },
    ],
  };
}

function attackPostback(label, attackType) {
  return {
    type: "button",
    style: attackType === "skill" ? "secondary" : "primary",
    height: "sm",
    color: attackType === "skill" ? undefined : ACCENT,
    action: {
      type: "postback",
      label,
      displayText: label,
      data: JSON.stringify({
        action: "worldBossAttack",
        attackType,
        cooldown: config.get("worldboss.attack_cooldown_seconds"),
      }),
    },
  };
}

function generateBattleStatusBubble({ season, round, boss, daily, liffUri }) {
  return {
    type: "bubble",
    size: "mega",
    hero: {
      type: "image",
      url: boss.image || config.get("defaultUserIcon"),
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        textNode(season.name, { size: "xs", color: SEMANTIC.primary }),
        textNode(`第 ${round.round_no} 輪 — ${boss.name}`, { size: "lg", weight: "bold" }),
        hpBar(round.current_hp, round.max_hp),
        textNode(
          `HP ${Number(round.current_hp).toLocaleString()} / ${Number(round.max_hp).toLocaleString()}`,
          { size: "xs", align: "end" }
        ),
        textNode(`今日 cost：${daily.used}/${daily.limit}`, { size: "xs" }),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        attackPostback("⚔️ 一般攻擊", "standard"),
        attackPostback("✨ 技能攻擊", "skill"),
        {
          type: "button",
          style: "link",
          height: "sm",
          action: { type: "uri", label: "📊 戰況板", uri: liffUri },
        },
      ],
    },
  };
}

function generateAttackResultBubble({ result, daily }) {
  const { damage, clearedRounds, round, boss, levelResult, seasonTotalDamage } = result;
  const contents = [
    textNode(`⚔️ 造成 ${Number(damage).toLocaleString()} 傷害！`, { size: "md", weight: "bold" }),
  ];
  for (const cleared of clearedRounds) {
    contents.push(
      textNode(`🎉 第 ${cleared.round_no} 輪討伐成功！`, { size: "sm", color: SEMANTIC.success })
    );
  }
  contents.push(
    textNode(`第 ${round.round_no} 輪 — ${boss.name}`, { size: "sm" }),
    hpBar(round.current_hp, round.max_hp),
    textNode(
      `剩餘 HP ${Number(round.current_hp).toLocaleString()} / ${Number(round.max_hp).toLocaleString()}`,
      { size: "xs", align: "end" }
    )
  );
  if (levelResult.levelUp) {
    contents.push(
      textNode(`🆙 職業等級提升至 Lv.${levelResult.newLevel}！`, {
        size: "sm",
        color: SEMANTIC.warning,
      })
    );
  }
  contents.push(
    textNode(`本季累計 ${Number(seasonTotalDamage).toLocaleString()} 傷害`, { size: "xxs" }),
    textNode(`今日 cost：${daily.used}/${daily.limit}`, { size: "xxs" })
  );

  return {
    type: "bubble",
    size: "kilo",
    body: { type: "box", layout: "vertical", spacing: "sm", contents },
  };
}

function generateNoActiveSeasonBubble({ ended = false } = {}) {
  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        textNode(ended ? "⏳ 本賽季已結束" : "💤 目前沒有進行中的賽季", {
          size: "md",
          weight: "bold",
        }),
        textNode(
          ended
            ? "結算作業進行中，獎勵稍後入帳，請留意下一季公告！"
            : "等待管理員開啟新賽季，敬請期待！",
          { size: "sm" }
        ),
      ],
    },
  };
}

module.exports = {
  generateBattleStatusBubble,
  generateAttackResultBubble,
  generateNoActiveSeasonBubble,
};
```

- [ ] **Step 2: 驗證（語法 + lint；外觀不寫測試，spec §7）**

```bash
cd app && node -e "const t=require('./src/templates/application/WorldBoss');console.log(Object.keys(t))" && yarn lint
```
Expected: 印出三個 builder 名稱、lint 綠。

- [ ] **Step 3: Commit**

```bash
app/node_modules/.bin/prettier --write app/src/templates/application/WorldBoss.js
git add -A && git commit -m "feat(worldboss): flex templates (battle status / attack result / no-season)"
```

---

### Task 10: Controller ＋ app.js 接線

**Files:**
- Create: `app/src/controller/application/WorldBossController.js`
- Modify: `app/src/app.js`（require + postback route + OrderBased spread，即 Task 1 拆掉的三個位置）
- Test: `app/src/controller/application/__tests__/WorldBossController.test.js`

**Interfaces:**
- Consumes: Task 6/7/9 全部；`makeCharacter`（`app/src/model/application/RPGCharacter.js` 的 `exports.make(jobKey, {level})`，純領域物件無 DB）；`EquipmentService.getEquipmentBonuses(userId) → {atk_percent, crit_rate, cost_reduction, exp_bonus, gold_bonus}`；`MinigameService.findByUserId/createByUserId/defaultData`；`notifyUnlocks`（`app/src/service/achievementNotifier`）；`commonTemplate.getLiffUri(type, path)`（`app/src/templates/common/index.js:105`）。
- Produces:
  - `exports.router = [text(/^[.#/](世界王|worldboss)$/i, showBattleStatus)]`
  - `exports.attackOnBoss(context, { payload })` — `payload.attackType ∈ {"standard","skill"}`
  - LIFF 路徑字串 **`"/worldboss"`**（與 Task 13 的 route path 完全一致 — 小寫，repo 慣例）
  - 攻擊冷卻：不自己實作 — postback payload 帶 `cooldown`（Task 9），由 `HandlePostback` 的 redis SETNX 執行；冷卻中重按 = 靜默忽略（與 janken 等既有 postback 一致）
  - 深意保留：v1 的 umami 追蹤條目不重加（v2 追蹤另議）；成就只重新 emit `boss_attack` + `feature: "world_boss"` 讓「全能玩家」存活（v2 專屬成就 out of scope）

- [ ] **Step 1: 先寫 failing test**

`app/src/controller/application/__tests__/WorldBossController.test.js`（mock 全部 service，用真模板驗 Flex 內容；`jest.mock` 不 hoist，全部放 require 前）：

```js
jest.mock("../../../service/WorldBossBattleService", () => {
  class WorldBossError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  return {
    WorldBossError,
    attack: jest.fn(),
    getRemainingDailyCost: jest.fn(),
  };
});
jest.mock("../../../service/WorldBossSeasonService", () => ({ getBattleStatus: jest.fn() }));
jest.mock("../../../service/MinigameService", () => ({
  findByUserId: jest.fn(),
  createByUserId: jest.fn(),
  defaultData: { level: 1, exp: 0 },
}));
jest.mock("../../../service/EquipmentService", () => ({ getEquipmentBonuses: jest.fn() }));
jest.mock("../../../service/achievementNotifier", () => ({ notifyUnlocks: jest.fn() }));
jest.mock("../../../service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));
jest.mock("config", () => {
  const orig = jest.requireActual("config");
  return {
    get: jest.fn(key => {
      const cfg = {
        "worldboss.per_hit_exp": 120,
        "worldboss.attack_cooldown_seconds": 5,
        defaultUserIcon: "https://example.com/icon.png",
      };
      if (key in cfg) return cfg[key];
      return orig.get(key);
    }),
  };
});

const BattleService = require("../../../service/WorldBossBattleService");
const SeasonService = require("../../../service/WorldBossSeasonService");
const minigameService = require("../../../service/MinigameService");
const EquipmentService = require("../../../service/EquipmentService");
const controller = require("../WorldBossController");

const USER = "U_test_wb_controller";

function makeContext() {
  return {
    event: { source: { userId: USER } },
    replyText: jest.fn(),
    replyFlex: jest.fn(),
  };
}

const STATUS = {
  season: { id: 1, name: "S1", end_time: null },
  round: { id: 9, round_no: 3, current_hp: 500, max_hp: 1000, world_boss_id: 2 },
  boss: { id: 2, name: "測試王", image: null, hp_weight: 1 },
  ended: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  SeasonService.getBattleStatus.mockResolvedValue(STATUS);
  BattleService.getRemainingDailyCost.mockResolvedValue({ used: 0, limit: 100, remaining: 100 });
  minigameService.findByUserId.mockResolvedValue({ level: 10, exp: 0, job_key: "swordman" });
  EquipmentService.getEquipmentBonuses.mockResolvedValue({
    atk_percent: 0, crit_rate: 0, cost_reduction: 0, exp_bonus: 0, gold_bonus: 0,
  });
  BattleService.attack.mockResolvedValue({
    season: STATUS.season,
    round: STATUS.round,
    boss: STATUS.boss,
    clearedRounds: [],
    damage: 123,
    cost: 10,
    levelResult: { levelUp: false, levelUpCount: 0, newLevel: 10, newExp: 120, earnedExp: 120 },
    seasonTotalDamage: 300,
  });
});

describe("showBattleStatus (#世界王)", () => {
  it("replies status bubble with LIFF uri /worldboss", async () => {
    const context = makeContext();
    await controller.showBattleStatus(context);
    expect(context.replyFlex).toHaveBeenCalled();
    const bubble = context.replyFlex.mock.calls[0][1];
    expect(JSON.stringify(bubble)).toContain("/worldboss");
    expect(JSON.stringify(bubble)).toContain("第 3 輪");
  });

  it("replies no-season bubble when nothing active", async () => {
    SeasonService.getBattleStatus.mockResolvedValue(null);
    const context = makeContext();
    await controller.showBattleStatus(context);
    const bubble = context.replyFlex.mock.calls[0][1];
    expect(JSON.stringify(bubble)).toContain("沒有進行中的賽季");
  });
});

describe("attackOnBoss", () => {
  it("computes damage/cost/exp and calls BattleService.attack", async () => {
    const context = makeContext();
    await controller.attackOnBoss(context, { payload: { attackType: "standard" } });
    // swordman Lv.10 標準攻擊由 RPGCharacter real 實作決定，這裡只驗結構
    expect(BattleService.attack).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, cost: 10, exp: 120 })
    );
    expect(context.replyFlex).toHaveBeenCalled();
    expect(JSON.stringify(context.replyFlex.mock.calls[0][1])).toContain("123");
  });

  it("blocks when daily cost exhausted", async () => {
    BattleService.getRemainingDailyCost.mockResolvedValue({ used: 100, limit: 100, remaining: 0 });
    const context = makeContext();
    await controller.attackOnBoss(context, { payload: { attackType: "standard" } });
    expect(BattleService.attack).not.toHaveBeenCalled();
    expect(context.replyText).toHaveBeenCalled();
  });

  it("replies friendly bubble on NO_ACTIVE_SEASON instead of throwing", async () => {
    BattleService.attack.mockRejectedValue(new BattleService.WorldBossError("NO_ACTIVE_SEASON"));
    const context = makeContext();
    await controller.attackOnBoss(context, { payload: { attackType: "standard" } });
    expect(context.replyFlex).toHaveBeenCalled();
    expect(JSON.stringify(context.replyFlex.mock.calls[0][1])).toContain("沒有進行中的賽季");
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `cd app && yarn test -- src/controller/application/__tests__/WorldBossController.test.js`
Expected: FAIL — `Cannot find module '../WorldBossController'`。

- [ ] **Step 3: 實作 `app/src/controller/application/WorldBossController.js`**

```js
const { text } = require("bottender/router");
const config = require("config");
const BattleService = require("../../service/WorldBossBattleService");
const SeasonService = require("../../service/WorldBossSeasonService");
const minigameService = require("../../service/MinigameService");
const EquipmentService = require("../../service/EquipmentService");
const AchievementEngine = require("../../service/AchievementEngine");
const { notifyUnlocks } = require("../../service/achievementNotifier");
const { make: makeCharacter } = require("../../model/application/RPGCharacter");
const worldBossTemplate = require("../../templates/application/WorldBoss");
const commonTemplate = require("../../templates/common");

const LIFF_PATH = "/worldboss"; // 必須與 frontend/src/App.jsx 的 route path 完全一致

/** `#世界王`：當前戰況快照卡 */
async function showBattleStatus(context) {
  const status = await SeasonService.getBattleStatus();
  if (!status || status.ended || !status.round) {
    return context.replyFlex(
      "世界王",
      worldBossTemplate.generateNoActiveSeasonBubble({ ended: Boolean(status && status.ended) })
    );
  }
  const { userId } = context.event.source;
  const daily = await BattleService.getRemainingDailyCost(userId);
  return context.replyFlex(
    "世界王戰況",
    worldBossTemplate.generateBattleStatusBubble({
      season: status.season,
      round: status.round,
      boss: status.boss,
      daily,
      liffUri: commonTemplate.getLiffUri("full", LIFF_PATH),
    })
  );
}

/**
 * 攻擊 postback。冷卻由 HandlePostback 的 redis SETNX（payload.cooldown）擋，
 * 這裡只做每日上限與傷害計算（LINE 邊界層），數字算好丟給 BattleService。
 */
async function attackOnBoss(context, { payload }) {
  const { userId } = context.event.source;
  if (!userId) return;

  const daily = await BattleService.getRemainingDailyCost(userId);
  if (daily.remaining <= 0) {
    return context.replyText(`今日的討伐 cost 已用完（${daily.used}/${daily.limit}），明天再來吧！`);
  }

  let levelData = await minigameService.findByUserId(userId);
  if (!levelData) {
    await minigameService.createByUserId(userId, minigameService.defaultData);
    levelData = await minigameService.findByUserId(userId);
  }
  const character = makeCharacter(levelData.job_key, { level: levelData.level });
  const equipBonuses = await EquipmentService.getEquipmentBonuses(userId);

  let damage;
  let cost;
  if (payload.attackType === "skill") {
    damage = character.getSkillOneDamage();
    cost = character.skillOne.cost;
  } else {
    damage = character.getStandardDamage();
    cost = 10;
  }
  if (equipBonuses.atk_percent > 0) damage = Math.floor(damage * (1 + equipBonuses.atk_percent));
  if (equipBonuses.cost_reduction > 0) cost = Math.max(1, cost - equipBonuses.cost_reduction);

  if (cost > daily.remaining) {
    return context.replyText(`cost 不足：本次攻擊需要 ${cost}，今日僅剩 ${daily.remaining}。`);
  }

  const exp = config.get("worldboss.per_hit_exp") + (equipBonuses.exp_bonus || 0);

  let result;
  try {
    result = await BattleService.attack({ userId, damage, cost, exp });
  } catch (err) {
    if (err instanceof BattleService.WorldBossError) {
      return context.replyFlex(
        "世界王",
        worldBossTemplate.generateNoActiveSeasonBubble({ ended: err.code === "SEASON_ENDED" })
      );
    }
    throw err;
  }

  const { unlocked } = await AchievementEngine.evaluate(userId, "boss_attack", {
    feature: "world_boss",
  }).catch(() => ({ unlocked: [] }));
  await notifyUnlocks(context, userId, unlocked);

  const dailyAfter = await BattleService.getRemainingDailyCost(userId);
  return context.replyFlex(
    "世界王攻擊結果",
    worldBossTemplate.generateAttackResultBubble({ result, daily: dailyAfter })
  );
}

exports.router = [text(/^[.#/](世界王|worldboss)$/i, showBattleStatus)];
exports.showBattleStatus = showBattleStatus;
exports.attackOnBoss = attackOnBoss;
```

- [ ] **Step 4: `app/src/app.js` 接回三個位置**（Task 1 拆掉的地方）

1. imports 區（其他 controller require 旁）:
```js
const WorldBossController = require("./controller/application/WorldBossController");
```
2. `HandlePostback` 的 `router([...])` 內（janken route 旁）:
```js
      route(
        () => action === "worldBossAttack",
        withProps(WorldBossController.attackOnBoss, { payload })
      ),
```
3. `OrderBased` 的 `router([...])` 內（其他 `.router` spread 旁）:
```js
      ...WorldBossController.router,
```

- [ ] **Step 5: 跑測試確認 pass**

Run: `cd app && yarn test -- src/controller/application/__tests__/WorldBossController.test.js`
Expected: PASS（5 tests）。接著 `yarn lint && yarn test -- --runInBand` 全綠，並啟動冒煙測試：`cd app && timeout 15 yarn dev` 看啟動 log 無 require error（Ctrl-C 或 timeout 自然結束）。

- [ ] **Step 6: Commit**

```bash
app/node_modules/.bin/prettier --write app/src/controller/application/WorldBossController.js app/src/app.js app/src/controller/application/__tests__/WorldBossController.test.js
git add -A && git commit -m "feat(worldboss): chat controller (#世界王 + attack postback) wired into bot"
```

---

### Task 11: Admin API ＋ LIFF 讀取 API

**Files:**
- Create: `app/src/router/WorldBoss/index.js`
- Create: `app/src/handler/WorldBoss/index.js`、`app/src/handler/WorldBoss/admin.js`、`app/src/handler/WorldBoss/public.js`
- Modify: `app/src/router/api.js`（掛回 admin router + 新增 public router）
- Modify: `app/src/model/application/WorldBossRound.js`（加 `countByBoss`）
- Test: `app/src/handler/WorldBoss/__tests__/handlers.test.js`

**Interfaces:**
- Consumes: Task 5/6/7 的 model/service；`api.js` 既有的 `router.use("/admin", verifyToken, verifyAdmin, verifyPrivilege(5))` 前置守門（admin 子 router 掛在其後即自動受保護）；`verifyToken`（`middleware/validation.js`，成功後 `req.profile = { userId, displayName, pictureUrl }`）。
- Produces（Task 12/13 前端依賴的 API 合約）:
  - `GET  /api/admin/world-bosses` → 圖鑑列表；`POST /api/admin/world-bosses` `{name, image?, description?, hp_weight?}` → `{id}`；`PUT /api/admin/world-bosses/:id`；`DELETE /api/admin/world-bosses/:id`（被任何輪次引用過 → 400 `{error:"BOSS_IN_USE"}`）
  - `GET  /api/admin/world-boss-seasons` → 賽季列表（desc）；`POST /api/admin/world-boss-seasons` `{name, announcement?, start_time?, end_time}` → `{id}`；`POST /api/admin/world-boss-seasons/:id/open` → `{seasonId, round}` 或 400 `{error:<WorldBossError.code>}`
  - `GET /api/world-boss/status`（verifyToken）→ `null | {season, round, boss, ended}`
  - `GET /api/world-boss/leaderboard?limit=50`（verifyToken）→ `[{user_id, display_name, total_damage}]`（limit 上限 100；`display_name` 可能為 null，前端 fallback「神秘冒險者」）
  - `GET /api/world-boss/me`（verifyToken）→ `null | {seasonId, totalDamage, daily:{used,limit,remaining}}`

- [ ] **Step 1: 先寫 failing test**

`app/src/handler/WorldBoss/__tests__/handlers.test.js`（fake req/res 直呼 handler，全 mock，不起 express）：

```js
jest.mock("../../../service/WorldBossSeasonService", () => ({
  getBattleStatus: jest.fn(),
  getRanking: jest.fn(),
  createSeason: jest.fn(),
  openSeason: jest.fn(),
}));
jest.mock("../../../service/WorldBossBattleService", () => {
  class WorldBossError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  return { WorldBossError, getRemainingDailyCost: jest.fn() };
});
jest.mock("../../../model/application/WorldBossContribution", () => ({
  sumSeasonDamage: jest.fn(),
}));
jest.mock("../../../model/application/WorldBoss", () => ({
  all: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}));
jest.mock("../../../model/application/WorldBossSeason", () => ({ all: jest.fn() }));
jest.mock("../../../model/application/WorldBossRound", () => ({ countByBoss: jest.fn() }));

const SeasonService = require("../../../service/WorldBossSeasonService");
const BattleService = require("../../../service/WorldBossBattleService");
const contributionModel = require("../../../model/application/WorldBossContribution");
const roundModel = require("../../../model/application/WorldBossRound");
const bossModel = require("../../../model/application/WorldBoss");
const adminHandler = require("../admin");
const publicHandler = require("../public");

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe("public handlers", () => {
  it("getStatus passes battle status through", async () => {
    const status = { season: { id: 1 }, round: {}, boss: {}, ended: false };
    SeasonService.getBattleStatus.mockResolvedValue(status);
    const res = makeRes();
    await publicHandler.getStatus({}, res);
    expect(res.json).toHaveBeenCalledWith(status);
  });

  it("getLeaderboard clamps limit to 100 and returns [] with no season", async () => {
    SeasonService.getBattleStatus.mockResolvedValue(null);
    let res = makeRes();
    await publicHandler.getLeaderboard({ query: {} }, res);
    expect(res.json).toHaveBeenCalledWith([]);

    SeasonService.getBattleStatus.mockResolvedValue({ season: { id: 7 } });
    SeasonService.getRanking.mockResolvedValue([]);
    res = makeRes();
    await publicHandler.getLeaderboard({ query: { limit: "9999" } }, res);
    expect(SeasonService.getRanking).toHaveBeenCalledWith(7, 100);
  });

  it("getMyStats reads userId from req.profile", async () => {
    SeasonService.getBattleStatus.mockResolvedValue({ season: { id: 7 } });
    contributionModel.sumSeasonDamage.mockResolvedValue(555);
    BattleService.getRemainingDailyCost.mockResolvedValue({ used: 10, limit: 100, remaining: 90 });
    const res = makeRes();
    await publicHandler.getMyStats({ profile: { userId: "Uxyz" } }, res);
    expect(contributionModel.sumSeasonDamage).toHaveBeenCalledWith(7, "Uxyz");
    expect(res.json).toHaveBeenCalledWith({
      seasonId: 7,
      totalDamage: 555,
      daily: { used: 10, limit: 100, remaining: 90 },
    });
  });
});

describe("admin handlers", () => {
  it("storeWorldBoss validates name", async () => {
    const res = makeRes();
    await adminHandler.storeWorldBoss({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    bossModel.create.mockResolvedValue(3);
    const ok = makeRes();
    await adminHandler.storeWorldBoss({ body: { name: "新王" } }, ok);
    expect(ok.json).toHaveBeenCalledWith({ id: 3 });
  });

  it("deleteWorldBoss refuses when referenced by rounds", async () => {
    roundModel.countByBoss.mockResolvedValue(2);
    const res = makeRes();
    await adminHandler.deleteWorldBoss({ params: { id: "1" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(bossModel.delete).not.toHaveBeenCalled();
  });

  it("openSeason maps WorldBossError to 400 with code", async () => {
    SeasonService.openSeason.mockRejectedValue(new BattleService.WorldBossError("ANOTHER_SEASON_ACTIVE"));
    const res = makeRes();
    await adminHandler.openSeason({ params: { id: "5" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "ANOTHER_SEASON_ACTIVE" });
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `cd app && yarn test -- src/handler/WorldBoss/__tests__/handlers.test.js`
Expected: FAIL — `Cannot find module '../admin'`。

- [ ] **Step 3: 實作**

先在 `app/src/model/application/WorldBossRound.js` 的 class 內加一個查詢（Task 5 的檔案）：

```js
  /** admin 刪圖鑑前的引用檢查 */
  async countByBoss(worldBossId, trx) {
    const row = await this.qb(trx).count({ c: "*" }).where({ world_boss_id: worldBossId }).first();
    return Number(row.c);
  }
```

`app/src/handler/WorldBoss/admin.js`:
```js
const bossModel = require("../../model/application/WorldBoss");
const seasonModel = require("../../model/application/WorldBossSeason");
const roundModel = require("../../model/application/WorldBossRound");
const SeasonService = require("../../service/WorldBossSeasonService");
const { WorldBossError } = require("../../service/WorldBossBattleService");

exports.getAllWorldBoss = async (req, res) => {
  const rows = await bossModel.all({ order: [{ column: "id", direction: "desc" }] });
  res.json(rows);
};

exports.storeWorldBoss = async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });
  const id = await bossModel.create(req.body);
  res.json({ id });
};

exports.updateWorldBoss = async (req, res) => {
  await bossModel.update(req.params.id, req.body || {});
  res.json({ id: Number(req.params.id) });
};

exports.deleteWorldBoss = async (req, res) => {
  const used = await roundModel.countByBoss(req.params.id);
  if (used > 0) return res.status(400).json({ error: "BOSS_IN_USE" });
  await bossModel.delete(req.params.id);
  res.json({ id: Number(req.params.id) });
};

exports.getAllSeasons = async (req, res) => {
  const rows = await seasonModel.all({ order: [{ column: "id", direction: "desc" }] });
  res.json(rows);
};

exports.storeSeason = async (req, res) => {
  const { name, end_time } = req.body || {};
  if (!name || !end_time) return res.status(400).json({ error: "NAME_AND_END_TIME_REQUIRED" });
  const id = await SeasonService.createSeason(req.body);
  res.json({ id });
};

exports.openSeason = async (req, res) => {
  try {
    const result = await SeasonService.openSeason(req.params.id);
    res.json(result);
  } catch (err) {
    if (err instanceof WorldBossError) return res.status(400).json({ error: err.code });
    res.status(500).json({ error: "INTERNAL" });
  }
};
```

`app/src/handler/WorldBoss/public.js`:
```js
const SeasonService = require("../../service/WorldBossSeasonService");
const BattleService = require("../../service/WorldBossBattleService");
const contributionModel = require("../../model/application/WorldBossContribution");

exports.getStatus = async (req, res) => {
  res.json(await SeasonService.getBattleStatus());
};

exports.getLeaderboard = async (req, res) => {
  const status = await SeasonService.getBattleStatus();
  if (!status) return res.json([]);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  res.json(await SeasonService.getRanking(status.season.id, limit));
};

exports.getMyStats = async (req, res) => {
  const status = await SeasonService.getBattleStatus();
  if (!status) return res.json(null);
  const { userId } = req.profile;
  const [totalDamage, daily] = await Promise.all([
    contributionModel.sumSeasonDamage(status.season.id, userId),
    BattleService.getRemainingDailyCost(userId),
  ]);
  res.json({ seasonId: status.season.id, totalDamage, daily });
};
```

`app/src/handler/WorldBoss/index.js`:
```js
exports.admin = require("./admin");
exports.public = require("./public");
```

`app/src/router/WorldBoss/index.js`:
```js
const createRouter = require("express").Router;
const { admin: adminHandler, public: publicHandler } = require("../../handler/WorldBoss");

const AdminRouter = createRouter();
AdminRouter.get("/world-bosses", adminHandler.getAllWorldBoss);
AdminRouter.post("/world-bosses", adminHandler.storeWorldBoss);
AdminRouter.put("/world-bosses/:id", adminHandler.updateWorldBoss);
AdminRouter.delete("/world-bosses/:id", adminHandler.deleteWorldBoss);
AdminRouter.get("/world-boss-seasons", adminHandler.getAllSeasons);
AdminRouter.post("/world-boss-seasons", adminHandler.storeSeason);
AdminRouter.post("/world-boss-seasons/:id/open", adminHandler.openSeason);

const PublicRouter = createRouter();
PublicRouter.get("/status", publicHandler.getStatus);
PublicRouter.get("/leaderboard", publicHandler.getLeaderboard);
PublicRouter.get("/me", publicHandler.getMyStats);

exports.admin = AdminRouter;
exports.public = PublicRouter;
```

`app/src/router/api.js` 接線：

1. require 區：
```js
const { admin: AdminWorldBossRouter, public: PublicWorldBossRouter } = require("./WorldBoss");
```
2. 在既有 `router.use("/admin", verifyToken, verifyAdmin, verifyPrivilege(5));` **之後**（其他 admin 子 router 旁）：
```js
router.use("/admin", AdminWorldBossRouter);
```
3. public 掛載（其他 `router.use` 區塊旁；`verifyToken` 已在 api.js scope）：
```js
router.use("/world-boss", verifyToken, PublicWorldBossRouter);
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `cd app && yarn test -- src/handler/WorldBoss/__tests__/handlers.test.js`
Expected: PASS（6 tests）。再 `yarn lint && yarn test` 全綠。

- [ ] **Step 5: Commit**

```bash
app/node_modules/.bin/prettier --write app/src/router/WorldBoss/index.js app/src/handler/WorldBoss app/src/router/api.js app/src/model/application/WorldBossRound.js
git add -A && git commit -m "feat(worldboss): admin CRUD/season API + LIFF read API"
```

---

### Task 12: 前端管理頁（圖鑑＋賽季）

**Files:**
- Create: `frontend/src/pages/Admin/Worldboss.jsx`
- Modify: `frontend/src/App.jsx`（import + route）、`frontend/src/components/NavDrawer.jsx`（adminItems 加一項）

**Interfaces:**
- Consumes: Task 11 的 admin API 合約；`useAxios`（axios-hooks，已全域綁定共用 axios instance，相對路徑 `/api/...` 即可）；`RequireAdmin` route guard（App.jsx 既有）。
- Produces: `/admin/worldboss` 單頁 = 圖鑑 CRUD ＋ 賽季建立/開季。無前端測試（repo 沒有 frontend test runner）— 驗收靠 lint + build + 手動冒煙。

- [ ] **Step 1: `frontend/src/pages/Admin/Worldboss.jsx`**

```jsx
import { useState } from "react";
import useAxios from "axios-hooks";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";

const EMPTY_BOSS = { name: "", image: "", description: "", hp_weight: 1 };
const EMPTY_SEASON = { name: "", announcement: "", start_time: "", end_time: "" };
const STATUS_CHIP = {
  draft: { label: "草稿", color: "default" },
  active: { label: "進行中", color: "success" },
  settled: { label: "已結算", color: "info" },
};

export default function AdminWorldboss() {
  const [{ data: bosses = [] }, refetchBosses] = useAxios("/api/admin/world-bosses");
  const [{ data: seasons = [] }, refetchSeasons] = useAxios("/api/admin/world-boss-seasons");
  const [, callApi] = useAxios({}, { manual: true });

  const [error, setError] = useState("");
  const [bossForm, setBossForm] = useState(null); // null = dialog closed；{...EMPTY_BOSS} or row
  const [seasonForm, setSeasonForm] = useState(null);

  const run = async (config, refetch) => {
    setError("");
    try {
      await callApi(config);
      await refetch();
      return true;
    } catch (e) {
      setError(e.response?.data?.error || "操作失敗");
      return false;
    }
  };

  const saveBoss = async () => {
    const { id, ...body } = bossForm;
    const ok = await run(
      id
        ? { url: `/api/admin/world-bosses/${id}`, method: "PUT", data: body }
        : { url: "/api/admin/world-bosses", method: "POST", data: body },
      refetchBosses
    );
    if (ok) setBossForm(null);
  };

  const deleteBoss = async id => {
    if (!window.confirm("確定刪除這隻王？（曾出場的王會被拒絕刪除）")) return;
    await run({ url: `/api/admin/world-bosses/${id}`, method: "DELETE" }, refetchBosses);
  };

  const saveSeason = async () => {
    const ok = await run(
      { url: "/api/admin/world-boss-seasons", method: "POST", data: seasonForm },
      refetchSeasons
    );
    if (ok) setSeasonForm(null);
  };

  const openSeason = async id => {
    if (!window.confirm("確定開啟這個賽季？開季後會立刻建立第 1 輪，全服開打。")) return;
    await run({ url: `/api/admin/world-boss-seasons/${id}/open`, method: "POST" }, refetchSeasons);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        世界王管理
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardHeader
          title="王圖鑑"
          action={<Button variant="contained" onClick={() => setBossForm({ ...EMPTY_BOSS })}>新增</Button>}
        />
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>名稱</TableCell>
                <TableCell>血量權重</TableCell>
                <TableCell>說明</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bosses.map(boss => (
                <TableRow key={boss.id}>
                  <TableCell>{boss.name}</TableCell>
                  <TableCell>{boss.hp_weight}</TableCell>
                  <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {boss.description}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => setBossForm(boss)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => deleteBoss(boss.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="賽季"
          action={<Button variant="contained" onClick={() => setSeasonForm({ ...EMPTY_SEASON })}>建立賽季</Button>}
        />
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>名稱</TableCell>
                <TableCell>狀態</TableCell>
                <TableCell>開始</TableCell>
                <TableCell>結束</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {seasons.map(season => {
                const chip = STATUS_CHIP[season.status] || STATUS_CHIP.draft;
                return (
                  <TableRow key={season.id}>
                    <TableCell>{season.name}</TableCell>
                    <TableCell>
                      <Chip size="small" label={chip.label} color={chip.color} />
                    </TableCell>
                    <TableCell>{season.start_time ? new Date(season.start_time).toLocaleString() : "-"}</TableCell>
                    <TableCell>{season.end_time ? new Date(season.end_time).toLocaleString() : "-"}</TableCell>
                    <TableCell align="right">
                      {season.status === "draft" && (
                        <Button size="small" variant="outlined" color="error" onClick={() => openSeason(season.id)}>
                          開季
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(bossForm)} onClose={() => setBossForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{bossForm?.id ? "編輯王" : "新增王"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="名稱" required value={bossForm?.name || ""} onChange={e => setBossForm(f => ({ ...f, name: e.target.value }))} />
            <TextField label="圖片 URL（可空）" value={bossForm?.image || ""} onChange={e => setBossForm(f => ({ ...f, image: e.target.value }))} />
            <TextField label="說明" multiline minRows={2} value={bossForm?.description || ""} onChange={e => setBossForm(f => ({ ...f, description: e.target.value }))} />
            <TextField label="血量權重" type="number" inputProps={{ step: 0.05, min: 0.1 }} value={bossForm?.hp_weight ?? 1} onChange={e => setBossForm(f => ({ ...f, hp_weight: Number(e.target.value) }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBossForm(null)}>取消</Button>
          <Button variant="contained" disabled={!bossForm?.name} onClick={saveBoss}>儲存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(seasonForm)} onClose={() => setSeasonForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>建立賽季（草稿）</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="名稱" required value={seasonForm?.name || ""} onChange={e => setSeasonForm(f => ({ ...f, name: e.target.value }))} />
            <TextField label="公告（可空）" multiline minRows={2} value={seasonForm?.announcement || ""} onChange={e => setSeasonForm(f => ({ ...f, announcement: e.target.value }))} />
            {/* ponytail: datetime-local 字串直送（MySQL 接受 T 分隔）；需要跨時區部署時再統一改 ISO+後端轉換 */}
            <TextField label="開始時間（可空＝開季當下）" type="datetime-local" InputLabelProps={{ shrink: true }} value={seasonForm?.start_time || ""} onChange={e => setSeasonForm(f => ({ ...f, start_time: e.target.value }))} />
            <TextField label="結束時間" required type="datetime-local" InputLabelProps={{ shrink: true }} value={seasonForm?.end_time || ""} onChange={e => setSeasonForm(f => ({ ...f, end_time: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeasonForm(null)}>取消</Button>
          <Button variant="contained" disabled={!seasonForm?.name || !seasonForm?.end_time} onClick={saveSeason}>建立</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

（送出時 `start_time` 空字串要轉 null：`saveSeason` 前處理 `data: { ...seasonForm, start_time: seasonForm.start_time || null }` — 實作時直接把 `data` 換成這個表達式。）

- [ ] **Step 2: 接線**

1. `frontend/src/App.jsx`：import 區加 `import AdminWorldboss from "./pages/Admin/Worldboss";`，`<Route element={<RequireAdmin />}>` 區塊內（其他 admin route 旁）加：
```jsx
<Route path="admin/worldboss" element={<AdminWorldboss />} />
```
2. `frontend/src/components/NavDrawer.jsx` 的 `adminItems` 陣列加（icon 依 Task 2 刪除情況補 import，例：`import PetsIcon from "@mui/icons-material/Pets";`）：
```js
{ label: "世界王管理", path: "/admin/worldboss", icon: PetsIcon },
```

- [ ] **Step 3: 驗證**

```bash
yarn lint:frontend && yarn build:frontend
```
Expected: 全綠。有起 dev 環境的話用瀏覽器開 `/admin/worldboss` 冒煙：列表載入、新增一隻王、建立草稿賽季。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(worldboss): admin page — boss catalog CRUD + season create/open"
```

---

### Task 13: LIFF 戰況板

**Files:**
- Create: `frontend/src/pages/Worldboss/index.jsx`
- Modify: `frontend/src/App.jsx`（import + route，**一般會員區**非 admin）、`frontend/src/components/NavDrawer.jsx`（一般選單加一項）

**Interfaces:**
- Consumes: Task 11 public API（`/api/world-boss/status`、`/leaderboard`、`/me`；token 由 LiffProvider 全域注入 axios instance）。
- Produces: route path **`worldboss`**（小寫，與 Task 10 controller 的 `LIFF_PATH = "/worldboss"` 完全一致 — 不一致 LIFF 會 404）。

- [ ] **Step 1: `frontend/src/pages/Worldboss/index.jsx`**

```jsx
import useAxios from "axios-hooks";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Container,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

const fmt = n => Number(n || 0).toLocaleString();
const MEDALS = ["🥇", "🥈", "🥉"];

export default function Worldboss() {
  const [{ data: status, loading }, refetchStatus] = useAxios("/api/world-boss/status");
  const [{ data: leaderboard = [] }, refetchBoard] = useAxios("/api/world-boss/leaderboard?limit=50");
  const [{ data: me }, refetchMe] = useAxios("/api/world-boss/me");

  const refreshAll = () => {
    refetchStatus();
    refetchBoard();
    refetchMe();
  };

  if (loading) return <LinearProgress />;

  if (!status || !status.round) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Card>
          <CardContent sx={{ textAlign: "center" }}>
            <Typography variant="h6">💤 目前沒有進行中的賽季</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              等待管理員開啟新賽季，敬請期待！
            </Typography>
          </CardContent>
        </Card>
      </Container>
    );
  }

  const { season, round, boss, ended } = status;
  const hpPercent = Math.max(0, Math.min(100, (Number(round.current_hp) / Number(round.max_hp)) * 100));

  return (
    <Container maxWidth="sm" sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">{season.name}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" color={ended ? "warning" : "success"} label={ended ? "結算中" : "進行中"} />
          <IconButton size="small" onClick={refreshAll} aria-label="重新整理">
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            第 {round.round_no} 輪
          </Typography>
          <Typography variant="h5" gutterBottom>
            {boss?.name || "???"}
          </Typography>
          <LinearProgress variant="determinate" color="error" value={hpPercent} sx={{ height: 10, borderRadius: 5 }} />
          <Typography variant="caption" display="block" align="right" sx={{ mt: 0.5 }}>
            HP {fmt(round.current_hp)} / {fmt(round.max_hp)}
          </Typography>
          {season.end_time && (
            <Typography variant="caption" color="text.secondary">
              賽季結束：{new Date(season.end_time).toLocaleString()}
            </Typography>
          )}
          {season.announcement && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              📢 {season.announcement}
            </Typography>
          )}
        </CardContent>
      </Card>

      {me && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              我的戰報
            </Typography>
            <Stack direction="row" spacing={3}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  本季總傷害
                </Typography>
                <Typography variant="h6">{fmt(me.totalDamage)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  今日 cost
                </Typography>
                <Typography variant="h6">
                  {me.daily.used}/{me.daily.limit}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            貢獻排行榜
          </Typography>
          <List dense disablePadding>
            {leaderboard.map((row, index) => (
              <ListItem key={row.user_id} disableGutters>
                <ListItemAvatar>
                  <Avatar sx={{ width: 32, height: 32, fontSize: 16 }}>
                    {MEDALS[index] || index + 1}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={row.display_name || "神秘冒險者"}
                  secondary={`${fmt(row.total_damage)} 傷害`}
                />
              </ListItem>
            ))}
            {leaderboard.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                還沒有人出手，快成為第一刀！
              </Typography>
            )}
          </List>
        </CardContent>
      </Card>
    </Container>
  );
}
```

- [ ] **Step 2: 接線**

1. `frontend/src/App.jsx`：`import Worldboss from "./pages/Worldboss";`，在 `<Route element={<MainLayout />}>` 內的**一般（非 RequireAdmin）**route 區加：
```jsx
<Route path="worldboss" element={<Worldboss />} />
```
2. `frontend/src/components/NavDrawer.jsx`：一般功能選單陣列（與猜拳/賽跑同一個 items 陣列）加一項，形狀照同陣列既有項目：
```js
{ label: "世界王", path: "/worldboss", icon: PetsIcon },
```

- [ ] **Step 3: 驗證**

```bash
yarn lint:frontend && yarn build:frontend
grep -n "worldboss" frontend/src/App.jsx app/src/controller/application/WorldBossController.js
```
Expected: build 綠；grep 顯示 App.jsx `path="worldboss"` 與 controller `LIFF_PATH = "/worldboss"` **字串一致**（route-path 慣例：小寫、不用 PascalCase）。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(worldboss): LIFF battle board (hp, my stats, season leaderboard)"
```

---

### Task 14: 收尾（全套驗證＋殘留掃描＋PR）

**Files:** 無新檔案 — 驗證與掃描。

- [ ] **Step 1: 全套測試/lint/build**

```bash
cd app && yarn lint && yarn test -- --runInBand
cd .. && yarn lint:frontend && yarn build:frontend
```
Expected: 全綠。任何紅的先修完才往下走。

- [ ] **Step 2: 殘留掃描（teardown 完整性）**

```bash
cd /home/hanshino/workspace/redive_linebot
grep -rin "worldBossAttackMessageKeeping\|adminBossAttack\|deliveryWorldBossTitles\|world-boss/feature-messages\|夢幻回歸" app/src app/bin app/config frontend/src
grep -rn "WorldBossEvent\|WorldBossLog\|AttackMessageTags\|WorldBossUserAttackMessage" app/src frontend/src
```
Expected: 兩個 grep 都 **0 hits**（v1 符號全數死透）。有 hit 就回對應 task 補刀。

- [ ] **Step 3: 冒煙（本機起服務）**

```bash
make infra   # 若未起
cd app && yarn dev   # 起 bot，看啟動 log 無錯後 Ctrl-C；或 timeout 20 yarn dev
node bin/WorldBossSeasonSettle.js   # cron 空跑
```
Expected: 無 require/wiring error。（完整 LINE 端對端需要 `make cf-go` + 真機，留給使用者驗收。）

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/worldboss-v2
gh pr create --title "feat(worldboss): v2 全服共鬥賽季制（拆除 v1 重寫）" --body "$(cat <<'EOF'
## Summary
- 拆除世界王 v1 全件（controller/services/models/templates/admin 頁/5 張表/舊成就稱號）
- v2 全服共鬥賽季制：手動開季 + cron 冪等結算、無限輪滾動王、on-hit 原子扣血、溢傷連清、每刀 RPG 職業經驗、賽季末女神石＋稱號
- 聊天 `#世界王` Flex 快照卡 + `/worldboss` LIFF 戰況板 + `/admin/worldboss` 管理頁
- Spec: docs/superpowers/specs/2026-07-19-worldboss-v2-design.md

## Test plan
- [ ] `cd app && yarn test`（battle/season/handler/controller/models 測試）
- [ ] `yarn build:frontend`
- [ ] 本機 LINE 冒煙：`#世界王` → 攻擊 → 清輪 → LIFF 戰況板

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: 部署備忘（寫進 PR 留言或交接）**

- prod 跑 `docker exec redive_linebot-bot-1 yarn migrate`（Task 3 + Task 4 兩支 migration）。
- 圖鑑：全新環境跑 `docker exec redive_linebot-bot-1 yarn knex seed:run --specific=WorldBossCatalogSeeder.js`，或由管理頁手動建立（**seeder 是全量替換，管理員建過資料後不可重跑**）。
- worker 重啟後 crontab 生效（結算每小時第 10 分）。
- 開季是手動動作：部署完成 ≠ 開打，管理員要在 `/admin/worldboss` 建賽季並按「開季」。
- 王圖片：`world_boss.image` 建議用 PictShare 上傳後填 URL；空值會 fallback `defaultUserIcon`。
