# World Boss v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拆除舊世界王全件，重建全服共鬥賽季制 v2：管理員立即開季、無限輪滾動王、原子攻擊與每日 quota、賽季末冪等結算、聊天 Flex 與 LIFF 戰況／個人結算結果。

**Architecture:** v2 使用五張新表：王圖鑑、賽季、輪次、貢獻、reward ledger。攻擊在單一 transaction 依序鎖 active season、玩家 `user` row、`minigame_level` 與 active round，權威判定每日 quota，扣血／開輪、寫貢獻與 RPG 職業 EXP 一起 commit；結算鎖同一個 season row，在單一 transaction 依 competition ranking `1,1,3` 完成 ledger、女神石、稱號後才標 settled。資料庫 UNIQUE active slot 保證全服最多一個 active season、每季最多一個 active round；聊天和 LIFF 都能同時顯示 active 戰況與玩家最近 settled reward。

**Tech Stack:** Bottender + Express + Knex/MySQL + Jest（真實 DB 整合測試）；React 19 + MUI 7 + axios-hooks + Vite。

## Global Constraints

- v2 greenfield：不搬 v1 資料、不向前相容；只退役 v1 controller 內的聊天指令 `#冒險小卡` 與 `#裝備`，Task 14 必須確認沒有殘留 chat route／copy／test expectation。獨立 Equipment API、LIFF 裝備頁、`EquipmentService` 與 RPG 裝備加成必須保留，v2 攻擊繼續使用。
- 手動開季立即生效：API 不收 future start；`openSeason()` 在 transaction 內以 server clock 寫 `start_time=now`，且只接受可解析、`end_time > now` 的 draft。
- 相同總傷害使用 competition ranking `1,1,3`；同 rank 寫相同 reward tier（石頭與稱號），接受同 tier 人數增加造成的少量額外發放。
- 無 LINE Push API：玩家下一次 `#世界王`／世界王攻擊聊天互動以及 LIFF 都要讀到最近 settled reward；不得引入 push/multicast。
- 所有 v2 `user_id` 都是 LINE platform userId，`string(33)`；RPG `minigame_level.user_id` 仍是內部 `user.id`。
- 所有 API datetime 都是 UTC ISO 8601（含 `Z`）；`app/knexfile.js` 的 mysql2 connection 固定 `timezone: "Z"`，server 以 UTC 儲存／比較並以真實 DB round-trip test 證明 instant 不漂移；frontend 只在顯示時 locale format。不得留下 datetime-local 字串直送或時區延期註記。
- Input validation 是 server/service 的責任：boss name `trim()` 後 1–64；`hp_weight` finite 且 `>0`；日期可解析且 `end_time>now`；attack type 只能 `standard|skill`，damage/cost/exp finite 且 `>0`；leaderboard limit 為 1–100 整數；產生輪次時 `maxHp>0`。
- Production active season slot 固定為 `1`。service 以 dependency injection 提供 test-only slot；整合測試使用自己的 slot，不能要求共享 DB 沒有真實 active season。
- 每日上限只能在 attack transaction 中判定：先 `FOR UPDATE` 鎖該玩家 `user` row（同時保護不存在時建立 `minigame_level`），再依 injected clock 計算台灣日界 `Asia/Taipei` 的 `[00:00, next 00:00)` UTC instants，於相同 trx 加總該半開區間 contribution；controller precheck 只改善 UX。禁止依 DB/session timezone 或 `DATE(created_at)` 猜「今日」。
- 攻擊與結算都 `FOR UPDATE` 鎖並重查同一個 season row；`now >= end_time` 時攻擊失敗、結算可執行，兩邊共用相同 boundary helper。
- 結算每季一個 transaction：對**每位 contributor**建立 authoritative reward ledger；無 configured tier 者也寫 `stone_amount=0,title_key=null,paid_at=clock()`。有獎者的 Inventory 女神石、UserTitle、`paid_at` 與 season settled 同生共死；付款失敗不得留下 ledger／付款或 settled，重試／併發不得 double-pay。
- Migration 必須由 `cd app && yarn knex migrate:make <name>` 產生。v1 teardown `down()` 必須重建空 v1 schema，不能空函式假裝成功；v2 `up()` 在任何 DDL 前檢查 title key collision 並拒絕覆用非本 migration 資料，`down()` 才能安全先刪依賴 v2 titles 的 `user_titles`、再刪自己建立的 titles 與 v2 tables。v1 資料不恢復是刻意限制，migration 前必須備份。
- 真實 DB 測試只能改 test-owned rows（`__wbtest_` prefix、注入 test slot），或在 transaction 中驗證後 rollback；不得 truncate、全表刪 `user_titles`、覆寫整張 boss catalog，或依賴全域空狀態。每個 suite 必須 deterministic cleanup 並 `afterAll(() => mysql.destroy())`。
- `app/jest.config.js` 為 `transform: {}`；`jest.mock(...)` 必須在被 mock module 的第一個 `require` 前。
- worldboss 測試落地後，窄測試用 `cd app && yarn test -- <path> --runInBand`；任何 full app suite 一律 `cd app && yarn test -- --runInBand`，不能使用裸 `yarn test`。
- 每個改 `.js/.jsx` 的 task 在 test/lint 與 commit 前，對該 task changed JS/JSX 跑 `app/node_modules/.bin/prettier --write <files>`。不得為追求 grep 0 改寫無關註解。
- Frontend 沒有 test runner：Task 12/13 以 lint + build +明列人工瀏覽器檢查驗收；真實 LINE E2E 需要 LIFF／reply token，標為不可自動化，不得宣稱已自動驗證。
- Task 14 只做 local verification 與 fresh review；不得 push、建立 PR 或部署，這些 outward-facing 行為另待使用者授權。

## File Structure（完成後）

```text
app/
├── migrations/
│   ├── <ts>_drop_world_boss_v1.js
│   └── <ts>_create_world_boss_v2.js
├── seeds/WorldBossCatalogSeeder.js
├── config/default.json
├── config/crontab.config.js
├── bin/WorldBossSeasonSettle.js
└── src/
    ├── model/application/
    │   ├── WorldBoss.js
    │   ├── WorldBossSeason.js
    │   ├── WorldBossRound.js
    │   ├── WorldBossContribution.js
    │   └── WorldBossSeasonReward.js
    ├── service/
    │   ├── WorldBossCatalogService.js
    │   ├── WorldBossBattleService.js
    │   └── WorldBossSeasonService.js
    ├── controller/application/WorldBossController.js
    ├── templates/application/WorldBoss.js
    ├── router/WorldBoss/index.js
    ├── handler/WorldBoss/{index,admin,public}.js
    └── __tests__/helpers/worldBossFixture.js
frontend/src/
├── pages/Admin/Worldboss.jsx
└── pages/Worldboss/index.jsx
```

Exact dependency order is Task 1 → … → Task 14. Do not start a task until the prior task has passed its gate and committed.

---

### Task 1: Retire World Boss v1 backend and its two commands

**Files:**
- Delete: `app/src/controller/application/WorldBossController.js`, v1 services/models/template/schema, `app/src/router/WorldBoss*`, `app/src/handler/WorldBoss*`, and v1 API tests listed below.
- Modify: `app/src/app.js`, `app/src/router/api.js`, `app/src/util/ajv.js`, `app/bin/TitleDelivery.js`, `app/src/service/AchievementEngine.js`, `app/src/middleware/umamiTrack.js`, `app/locales/zh_tw.json`, `app/config/default.json`.

**Interfaces:**
- Produces a backend with no v1 worldboss wiring. Keep `AchievementEngine` event `boss_attack: ["social_all_features"]` for Task 10 and keep `templates/common/theme.js` `FEATURE.worldBoss` for Task 9.
- Intentionally removes `text("#冒險小卡", ...)` and `text(/^[#＃]裝備$/, ...)`; no replacement is added in v2.

- [ ] **Step 1: Delete v1 files**

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

- [ ] **Step 2: Remove only the v1 call sites**

Remove these exact behaviors, without touching unrelated comments:

```text
app/src/app.js
- v1 WorldBossController require
- adminBossAttack bypass in HandlePostback
- worldBossAttack postback route
- ...WorldBossController.router

app/src/router/api.js
- v1 controller/admin router requires and mounts
- /game/world-boss/feature-messages CRUD block

app/src/util/ajv.js
- createUserAttackMessage schema require/register

app/bin/TitleDelivery.js
- deliveryWorldBossTitles call and function only; keep the gacha/janken title job

app/src/service/AchievementEngine.js
- boss_first_kill/boss_level_10/boss_level_50/boss_top_damage strategies
- keep boss_attack: ["social_all_features"]

app/src/middleware/umamiTrack.js, app/locales/zh_tw.json, app/config/default.json
- remove v1-only worldboss tracking/copy/config
```

- [ ] **Step 3: Format and verify**

```bash
app/node_modules/.bin/prettier --write \
  app/src/app.js app/src/router/api.js app/src/util/ajv.js app/bin/TitleDelivery.js \
  app/src/service/AchievementEngine.js app/src/middleware/umamiTrack.js
cd app
node -e "JSON.parse(require('fs').readFileSync('locales/zh_tw.json'));JSON.parse(require('fs').readFileSync('config/default.json'))"
yarn lint
yarn test -- --runInBand
cd ..
if rg -n 'adminBossAttack|deliveryWorldBossTitles|world-boss/feature-messages|#冒險小卡|\^\[#＃\]裝備' \
  app/src app/bin app/config app/locales; then
  echo "v1 worldboss backend residual found" >&2
  exit 1
fi
```

Expected: JSON parse, lint, and full suite pass; residual assertion exits 0 because it finds no hit. `app/src/templates/common/theme.js` remains unchanged.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(worldboss): retire v1 backend and commands"
```

---

### Task 2: Retire World Boss v1 frontend

**Files:**
- Delete: `frontend/src/pages/Admin/Worldboss.jsx`, `WorldbossEvent.jsx`, `WorldbossMessage.jsx`, `WorldbossMessageCreate.jsx`, `WorldbossMessageUpdate.jsx`.
- Modify: `frontend/src/App.jsx`, `frontend/src/components/NavDrawer.jsx`, `frontend/src/pages/Achievement/index.jsx`.

**Interfaces:**
- Produces clean route slots `/admin/worldboss` and `/worldboss` for Task 12/13.

- [ ] **Step 1: Delete pages and exact v1 routes/nav items**

```bash
git rm frontend/src/pages/Admin/Worldboss.jsx \
  frontend/src/pages/Admin/WorldbossEvent.jsx \
  frontend/src/pages/Admin/WorldbossMessage.jsx \
  frontend/src/pages/Admin/WorldbossMessageCreate.jsx \
  frontend/src/pages/Admin/WorldbossMessageUpdate.jsx
```

Remove their imports/routes, three v1 worldboss admin nav items, and four removed achievement icon mappings. Remove imports only if ESLint reports them unused.

- [ ] **Step 2: Format and verify**

```bash
app/node_modules/.bin/prettier --write frontend/src/App.jsx \
  frontend/src/components/NavDrawer.jsx frontend/src/pages/Achievement/index.jsx
yarn lint:frontend
yarn build:frontend
if rg -n 'WorldbossEvent|WorldbossMessage|boss_first_kill|boss_level_10|boss_level_50|boss_top_damage' frontend/src; then
  echo "v1 worldboss frontend residual found" >&2
  exit 1
fi
```

Expected: lint/build pass and the negative residual assertion exits 0 because it finds no hit.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(worldboss): retire v1 frontend"
```

---

### Task 3: Add truthful v1 teardown migration

**Files:**
- Create: `app/migrations/<timestamp>_drop_world_boss_v1.js` using `yarn knex migrate:make`.

**Interfaces:**
- `up()` drops the five still-live v1 tables and removes v1 achievement/title rows.
- `down()` recreates the five **empty** schemas at their final v1 shape. It does not restore deleted rows and says so in the migration comment.

- [ ] **Step 1: Back up before destructive migration and generate the file**

```bash
cd /home/hanshino/workspace/redive_linebot
make infra
stamp=$(date +%Y%m%d-%H%M%S)
backup="/tmp/Princess-before-worldboss-v2-${stamp}.sql"
docker compose exec -T mysql sh -c \
  'exec mysqldump --single-transaction --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" Princess' \
  > "$backup"
test -s "$backup"
sha256sum "$backup" > "${backup}.sha256"
sha256sum -c "${backup}.sha256"
cd app
yarn knex migrate:make drop_world_boss_v1
```

The host intentionally has no `mysqldump`; the client runs inside the MySQL container and shell redirection persists the dump at the absolute host path. Local restore drill/command (only after explicitly choosing to discard the current local DB state):

```bash
cd /home/hanshino/workspace/redive_linebot
sha256sum -c "${backup}.sha256"
docker compose exec -T mysql sh -c \
  'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" Princess' < "$backup"
```

Record the backup path in the task handoff. Do not run `up()` if `test -s` fails.

- [ ] **Step 2: Implement `up()` and complete empty-schema `down()`**

Use these exact final v1 shapes, preserving all columns added after initial creation:

```js
const V1_ACHIEVEMENT_KEYS = [
  "boss_first_kill",
  "boss_level_10",
  "boss_level_50",
  "boss_top_damage",
];
const V1_TITLE_KEYS = ["progressors", "leechers"];

function createV1Tables(knex) {
  return knex.schema
    .createTable("world_boss", table => {
      table.increments("id").primary();
      table.string("name").notNullable();
      table.string("description");
      table.string("image");
      table.integer("level").notNullable();
      table.integer("hp").notNullable();
      table.integer("attack").notNullable().defaultTo(0);
      table.integer("defense").notNullable().defaultTo(0);
      table.integer("speed").notNullable().defaultTo(0);
      table.integer("luck").notNullable().defaultTo(0);
      table.integer("exp").notNullable();
      table.integer("gold").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })
    .createTable("world_boss_event", table => {
      table.increments("id").primary();
      table.integer("world_boss_id").notNullable();
      table.string("announcement").notNullable();
      table.timestamp("start_time").notNullable();
      table.timestamp("end_time").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })
    .createTable("world_boss_event_log", table => {
      table.increments("id").primary();
      table.integer("world_boss_event_id").notNullable();
      table.integer("user_id").notNullable();
      table.string("action_type").notNullable();
      table.integer("damage").notNullable();
      table.integer("cost").notNullable().defaultTo(0);
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .createTable("world_boss_user_attack_message", table => {
      table.increments("id").primary();
      table.string("icon_url");
      table.string("template").notNullable();
      table.integer("creator_id").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    })
    .createTable("attack_message_has_tags", table => {
      table.increments("id").primary();
      table.integer("attack_message_id").unsigned().notNullable();
      table.string("tag").notNullable();
    });
}

exports.up = async knex => {
  for (const table of [
    "attack_message_has_tags",
    "world_boss_event_log",
    "world_boss_event",
    "world_boss_user_attack_message",
    "world_boss",
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
  const achievementIds = (
    await knex("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS).select("id")
  ).map(row => row.id);
  if (achievementIds.length) {
    await knex("user_achievement_progress").whereIn("achievement_id", achievementIds).del();
    await knex("user_achievements").whereIn("achievement_id", achievementIds).del();
    await knex("achievements").whereIn("id", achievementIds).del();
  }
  await knex("achievement_categories").where({ key: "world_boss" }).del();
  const titleIds = (await knex("titles").whereIn("key", V1_TITLE_KEYS).select("id")).map(
    row => row.id
  );
  if (titleIds.length) {
    await knex("user_titles").whereIn("title_id", titleIds).del();
    await knex("titles").whereIn("id", titleIds).del();
  }
};

exports.down = async knex => {
  // Restores schema only. v1 rows are intentionally recoverable only from the required backup.
  await createV1Tables(knex);
};
```

- [ ] **Step 3: Format, exercise up/down/up, and inspect tables**

```bash
app/node_modules/.bin/prettier --write app/migrations/*_drop_world_boss_v1.js
cd app
yarn migrate
yarn knex migrate:down
node -e "const k=require('knex')(require('./knexfile'));Promise.all(['world_boss','world_boss_event','world_boss_event_log','world_boss_user_attack_message','attack_message_has_tags'].map(t=>k.schema.hasTable(t))).then(x=>{if(x.some(v=>!v))process.exitCode=1;return k.destroy()})"
yarn migrate
```

Expected: down recreates all five empty schemas and exits 0; final migrate drops them again.

- [ ] **Step 4: Commit**

```bash
git add app/migrations/*_drop_world_boss_v1.js
git commit -m "refactor(worldboss): add reversible v1 schema teardown"
```

---

### Task 4: Create v2 schema, constraints, config, and non-destructive seed

**Files:**
- Create: `app/migrations/<timestamp>_create_world_boss_v2.js`, `app/seeds/WorldBossCatalogSeeder.js`.
- Modify: `app/config/default.json`, `app/knexfile.js`.
- Test: `app/__tests__/migration/worldBossV2Schema.test.js` (real DB constraint, title ownership, and UTC round-trip checks).

**Interfaces:**
- Five tables only. `world_boss_season.active_slot` is `1` for production active and null otherwise, UNIQUE globally. `world_boss_round.active_slot` is `1` for active and null for cleared, UNIQUE with `season_id`.
- Statuses use MySQL ENUM: season `draft|active|settled`, round `active|cleared`.
- Reward ledger includes `ranking`, `total_damage`, `stone_amount`, `title_key`, `paid_at`, UNIQUE `(season_id,user_id)`.

- [ ] **Step 1: Generate migration and write schema**

```bash
cd app && yarn knex migrate:make create_world_boss_v2
```

The migration must create these columns and constraints:

```js
const TITLES = [
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
const TITLE_KEYS = TITLES.map(title => title.key);

exports.up = async knex => {
  // These keys are owned by this migration. Refuse before DDL so down never deletes pre-existing data.
  const collisions = await knex("titles").whereIn("key", TITLE_KEYS).select("key");
  if (collisions.length) {
    throw new Error(`WORLD_BOSS_TITLE_KEY_COLLISION:${collisions.map(row => row.key).join(",")}`);
  }

  await knex.schema.createTable("world_boss", table => {
    table.bigIncrements("id").primary();
    table.string("name", 64).notNullable();
    table.string("image", 255);
    table.text("description");
    table.decimal("hp_weight", 8, 3).notNullable().defaultTo(1);
    table.timestamps(true, true);
    table.check("?? > 0", ["hp_weight"], "chk_wb_hp_weight_positive");
  });
  await knex.schema.createTable("world_boss_season", table => {
    table.bigIncrements("id").primary();
    table.string("name", 64).notNullable();
    table.text("announcement");
    table.enu("status", ["draft", "active", "settled"]).notNullable().defaultTo("draft");
    table.integer("active_slot").unsigned().nullable();
    table.datetime("start_time").nullable();
    table.datetime("end_time").notNullable();
    table.datetime("settled_at").nullable();
    table.timestamps(true, true);
    table.unique(["active_slot"], "uq_wbs_active_slot");
    table.index(["status", "end_time"], "idx_wbs_settleable");
    table.check(
      "(`status` = 'active' AND `active_slot` IS NOT NULL) OR (`status` <> 'active' AND `active_slot` IS NULL)",
      [],
      "chk_wbs_active_slot_status"
    );
  });
  await knex.schema.createTable("world_boss_round", table => {
    table.bigIncrements("id").primary();
    table.bigInteger("season_id").unsigned().notNullable();
    table.integer("round_no").unsigned().notNullable();
    table.bigInteger("world_boss_id").unsigned().notNullable();
    table.bigInteger("max_hp").unsigned().notNullable();
    table.bigInteger("current_hp").unsigned().notNullable();
    table.enu("status", ["active", "cleared"]).notNullable().defaultTo("active");
    table.integer("active_slot").unsigned().nullable();
    table.datetime("cleared_at").nullable();
    table.timestamps(true, true);
    table.unique(["season_id", "round_no"], "uq_wbr_season_round");
    table.unique(["season_id", "active_slot"], "uq_wbr_season_active_slot");
    table.check("?? > 0", ["max_hp"], "chk_wbr_max_hp_positive");
    table.check("?? <= ??", ["current_hp", "max_hp"], "chk_wbr_current_lte_max");
    table.check(
      "(`status` = 'active' AND `active_slot` = 1) OR (`status` = 'cleared' AND `active_slot` IS NULL)",
      [],
      "chk_wbr_active_slot_status"
    );
  });
  await knex.schema.createTable("world_boss_contribution", table => {
    table.bigIncrements("id").primary();
    table.bigInteger("season_id").unsigned().notNullable();
    table.bigInteger("round_id").unsigned().notNullable();
    table.string("user_id", 33).notNullable();
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
    table.string("user_id", 33).notNullable();
    table.integer("ranking").unsigned().notNullable();
    table.bigInteger("total_damage").unsigned().notNullable();
    table.integer("stone_amount").unsigned().notNullable().defaultTo(0);
    table.string("title_key", 64).nullable();
    table.datetime("paid_at").nullable();
    table.timestamps(true, true);
    table.unique(["season_id", "user_id"], "uq_wbsr_season_user");
  });

  const { maxOrder } = await knex("titles").max({ maxOrder: "order" }).first();
  await knex("titles").insert(
    TITLES.map((title, index) => ({
      ...title,
      order: Number(maxOrder || 0) + index + 1,
    }))
  );
};

exports.down = async knex => {
  const titleIds = (await knex("titles").whereIn("key", TITLE_KEYS).select("id")).map(r => r.id);
  if (titleIds.length) await knex("user_titles").whereIn("title_id", titleIds).del();
  await knex("titles").whereIn("key", TITLE_KEYS).del();
  for (const table of [
    "world_boss_season_reward",
    "world_boss_contribution",
    "world_boss_round",
    "world_boss_season",
    "world_boss",
  ]) await knex.schema.dropTableIfExists(table);
};
```

If the installed Knex version emits invalid MySQL SQL for named `table.check`, use `knex.raw("ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)")` with the same names and predicates; do not omit a constraint.

- [ ] **Step 2: Add config and an additive seed**

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
}
```

`WorldBossCatalogSeeder.js` exports four rows and inserts only missing stable IDs:

```js
const BOSSES = [
  { id: 1, name: "山嶺巨像", description: "盤踞於蘭德索爾山脈的古老魔像。", hp_weight: 1, image: null },
  { id: 2, name: "深淵雙頭犬", description: "來自地底裂縫的看門猛獸。", hp_weight: 0.9, image: null },
  { id: 3, name: "暴風飛龍", description: "翼展遮天的暴風化身。", hp_weight: 1.1, image: null },
  { id: 4, name: "冥府騎士", description: "披著破碎鎧甲的無言騎士。", hp_weight: 1.25, image: null },
];
exports.buildRows = () => BOSSES;
exports.seed = knex => knex("world_boss").insert(BOSSES).onConflict("id").ignore();
```

- [ ] **Step 3: Pin UTC and write failing real-schema tests**

Add `timezone: "Z"` to `app/knexfile.js`'s mysql2 connection. The real-DB test must:
- seed a pre-existing title with either reserved key, assert migration `up()` rejects **before any v2 table exists**, and prove the title plus its `user_titles` sentinel survives; remove the sentinel, then migrate successfully;
- inspect `SHOW CREATE TABLE` for both ENUM domains and every named UNIQUE/CHECK predicate, then attempt invalid inserts for non-positive `hp_weight/max_hp`, `current_hp>max_hp`, and status/active-slot mismatches and assert MySQL rejects them;
- insert a known JS `Date` instant, read it through Knex, and assert `toISOString()` exactly matches—this proves `timezone:"Z"`, not merely serializer formatting;
- run `down()` and prove only the two migration-owned title keys/dependent test rows are removed.

- [ ] **Step 4: Format and verify schema, UTC, and additive seed**

```bash
app/node_modules/.bin/prettier --write app/migrations/*_create_world_boss_v2.js \
  app/seeds/WorldBossCatalogSeeder.js app/config/default.json app/knexfile.js \
  app/__tests__/migration/worldBossV2Schema.test.js
cd app
yarn test -- __tests__/migration/worldBossV2Schema.test.js --runInBand
yarn migrate
yarn knex seed:run --specific=WorldBossCatalogSeeder.js
yarn knex seed:run --specific=WorldBossCatalogSeeder.js
node - <<'NODE'
const k=require('knex')(require('./knexfile'));
k('world_boss').whereIn('id',[1,2,3,4]).count({count:'id'}).first()
 .then(({count})=>{if(Number(count)!==4)throw new Error(`expected four bosses, got ${count}`);})
 .finally(()=>k.destroy());
NODE
```

Expected: ownership/invalid-insert/UTC tests pass, migration succeeds, and running seed twice leaves exactly the four stable IDs without overwriting admin rows.

- [ ] **Step 5: Commit**

```bash
git add app/migrations/*_create_world_boss_v2.js app/seeds/WorldBossCatalogSeeder.js \
  app/config/default.json app/knexfile.js app/__tests__/migration/worldBossV2Schema.test.js
git commit -m "feat(worldboss): add v2 schema and catalog"
```

---

### Task 5: Implement models, catalog validation, reward lookup, and isolated fixtures

**Files:**
- Create five model files under `app/src/model/application/`.
- Create `app/src/service/WorldBossCatalogService.js`.
- Create `app/src/__tests__/helpers/worldBossFixture.js`.
- Test: `app/src/model/application/__tests__/WorldBossModels.test.js`, `app/src/service/__tests__/WorldBossCatalogService.test.js`.

**Interfaces:**

```js
WorldBossCatalogService.normalizeBossInput(input)
WorldBossCatalogService.listBosses() // id ASC, deterministic admin order
WorldBossCatalogService.createBoss(input, trx)
WorldBossCatalogService.updateBoss(id, input, trx)
WorldBossCatalogService.deleteBoss(id, trx) // BOSS_IN_USE
WorldBossSeason.findActive(activeSlot = 1, trx)
WorldBossSeason.findActiveForUpdate(activeSlot, trx)
WorldBossSeason.findForUpdate(id, trx)
WorldBossSeason.findSettleable(now, activeSlot = 1, trx)
WorldBossRound.findActiveForUpdate(seasonId, trx)
WorldBossRound.findActiveBySeason(seasonId, trx)
WorldBossContribution.sumCostInRange(userId, startUtc, endUtc, trx)
WorldBossContribution.seasonRanking(seasonId, limit, trx) // public bounded 1..100
WorldBossContribution.seasonRankingAll(seasonId, trx)     // internal unbounded settlement query
WorldBossContribution.sumSeasonDamage(seasonId, userId, trx)
WorldBossSeasonReward.tryInsert(payload, trx)
WorldBossSeasonReward.findForUpdate(seasonId, userId, trx)
WorldBossSeasonReward.findLatestSettledByUser(userId, trx)
```

`seasonRanking` returns rows ordered by `total_damage DESC, user_id ASC`; service computes competition rank from equal adjacent `total_damage`. `findLatestSettledByUser` joins season/titles and returns `{rewardId, seasonId, seasonName, ranking, totalDamage, stoneAmount, titleKey, titleName, paidAt, settledAt}` only for `paid_at IS NOT NULL`, even if a newer active season exists. `rewardId` + `paidAt` are the client-visible proof that the result came from the authoritative reward ledger.

- [ ] **Step 1: Write failing tests using only test-owned rows**

The shared helper must:

```js
const PREFIX = "__wbtest_";
function slotFor(suiteNumber) { return 900000 + suiteNumber; }
async function cleanupByPrefix(mysql, prefix, slot) {
  const seasons = await mysql("world_boss_season").where({ active_slot: slot }).orWhere("name", "like", `${prefix}%`).select("id");
  const ids = seasons.map(r => r.id);
  if (ids.length) {
    await mysql("world_boss_season_reward").whereIn("season_id", ids).del();
    await mysql("world_boss_contribution").whereIn("season_id", ids).del();
    await mysql("world_boss_round").whereIn("season_id", ids).del();
    await mysql("world_boss_season").whereIn("id", ids).del();
  }
  await mysql("world_boss").where("name", "like", `${prefix}%`).del();
}
module.exports = { PREFIX, slotFor, cleanupByPrefix };
```

Tests must cover:
- catalog rejects `""`, 65 chars, `hp_weight` 0/negative/NaN/Infinity and trims a valid name; `listBosses()` returns deterministic `id ASC` rows;
- deleting an in-use boss returns `BOSS_IN_USE`;
- public ranking order and limit validation 1/100 accepted, 0/101/fraction/NaN rejected; internal `seasonRankingAll` returns **all** contributors (seed 101+, assert rank 101 exists) and has no public limit parameter;
- tied totals remain adjacent and deterministic;
- `sumCostInRange` uses `created_at >= startUtc AND created_at < endUtc`; seed just before, exactly at, and just after an `Asia/Taipei` midnight boundary and assert only the intended civil day is counted;
- reward duplicate returns false; latest settled lookup returns paid rank/stones/title from the latest settled season while a newer active row exists;
- fixture cleanup deletes only its prefix/slot and leaves a sentinel non-test row untouched.

- [ ] **Step 2: Run tests and confirm the missing-module failure**

```bash
cd app
yarn test -- src/model/application/__tests__/WorldBossModels.test.js \
  src/service/__tests__/WorldBossCatalogService.test.js --runInBand
```

Expected: FAIL because v2 model/service modules do not exist.

- [ ] **Step 3: Implement thin models and service validation**

All model methods accept a trailing `trx`; use `(trx || mysql)` consistently. Locking methods must use `.forUpdate()`. `findSettleable` uses `end_time <= now`. Catalog service owns all name/weight validation; handlers in Task 11 call it rather than calling Base directly. `listBosses()` delegates to the model and orders by `id ASC`. Quota range conversion is a pure helper in BattleService (Task 6); the model receives explicit UTC boundaries and never derives a timezone day itself.

Competition-rank helper used later must follow:

```js
function withCompetitionRank(rows) {
  let previousDamage = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const damage = Number(row.total_damage);
    const ranking = previousDamage === damage ? previousRank : index + 1;
    previousDamage = damage;
    previousRank = ranking;
    return { ...row, total_damage: damage, ranking };
  });
}
```

- [ ] **Step 4: Format and verify**

```bash
app/node_modules/.bin/prettier --write app/src/model/application/WorldBoss*.js \
  app/src/service/WorldBossCatalogService.js app/src/__tests__/helpers/worldBossFixture.js \
  app/src/model/application/__tests__/WorldBossModels.test.js \
  app/src/service/__tests__/WorldBossCatalogService.test.js
cd app
yarn test -- src/model/application/__tests__/WorldBossModels.test.js \
  src/service/__tests__/WorldBossCatalogService.test.js --runInBand
yarn lint
```

Expected: all named tests pass, sentinel survives, lint passes.

- [ ] **Step 5: Commit**

```bash
git add app/src/model/application/WorldBoss*.js app/src/service/WorldBossCatalogService.js \
  app/src/__tests__/helpers/worldBossFixture.js \
  app/src/model/application/__tests__/WorldBossModels.test.js \
  app/src/service/__tests__/WorldBossCatalogService.test.js
git commit -m "feat(worldboss): add models and catalog validation"
```

---

### Task 6: Implement atomic attack, quota, round recovery, and RPG EXP

**Files:**
- Create: `app/src/service/WorldBossBattleService.js`.
- Modify: `app/src/model/application/MinigameLevel.js`.
- Test: `app/src/service/__tests__/WorldBossBattleService.test.js`.

**Interfaces:**

```js
createBattleService({ activeSlot = 1, clock = () => new Date(), hooks = {} })
defaultService.attack({ userId, attackType, damage, cost, exp })
defaultService.getRemainingDailyCost(userId)
defaultService.hpForRound(roundNo, hpWeight)
defaultService.createRound(trx, seasonId, roundNo, excludeBossId)
defaultService.calculateJobExpTransition(progress, earnedExp, levelUnits)
defaultService.applyJobExp({ userId, progress, earnedExp, levelUnits, trx })
defaultService.taipeiDayRange(now) -> { startUtc, endUtc }
MinigameLevel.lockUserAndProgress(userId, defaults, trx)
MinigameLevel.updateByUserId(userId, attributes, trx)
```

Test-only hooks have exact signatures and production defaults are no-ops:

```js
onAttackStarted({ userId })
afterSeasonLock({ trx, userId, season })
beforeRoundInsert({ trx, seasonId, roundNo, payload })
onRoundConflict({ trx, seasonId, roundNo, error })
beforeExpUpdate({ trx, userId, progress, levelResult })
```

All hooks may return a Promise and are awaited. Tests coordinate deferred Promises/spies; they must not use sleeps or timing guesses.

Because both attacks first lock the same season row, they cannot both reach round insertion simultaneously. The deterministic test therefore starts two real `attack()` calls concurrently, pauses the first at `beforeRoundInsert`, proves the second call has started and is waiting on the season lock, then has the hook insert the competing next-round row **with the first attack's same trx** before normal insertion resumes. The normal insert hits the named UNIQUE, `onRoundConflict` observes recovery, and the second attack continues after the first commits. This avoids a test-only cross-transaction deadlock while exercising both real concurrent service calls and the actual recovery branch. Production still recovers only known `ER_DUP_ENTRY` for `uq_wbr_season_round|uq_wbr_season_active_slot`. `attack()` returns `{season, round, boss, clearedRounds, damage, cost, levelResult, seasonTotalDamage, daily}`.

- [ ] **Step 1: Write real-DB failing tests**

Use a dedicated slot from `slotFor(6)`, test-owned users/boss/seasons, and real `MinigameLevel` rows. Do not mock the EXP model. Cover:

1. normal hit atomically changes HP, inserts contribution, increments real job EXP, and returns daily;
2. `standard|skill` accepted; unknown attack type, damage/cost/exp 0/negative/NaN/Infinity rejected before DB writes;
3. `hpForRound` rejects non-finite/non-positive output and `createRound` rejects `maxHp<=0`;
4. `now === end_time` returns `SEASON_ENDED`, with no quota/HP/contribution/EXP changes;
5. forced `beforeExpUpdate` throw rolls back quota evidence (contribution), HP, round changes, and EXP;
6. brand-new player progress is created once in the same trx after locking the parent `user` row;
7. `taipeiDayRange()` and quota query include a contribution exactly at Taipei 00:00, exclude one immediately before and exactly at next 00:00, independent of MySQL/session TZ;
8. `calculateJobExpTransition` covers exact fixtures: `{level:1,exp:100}+200` with next threshold 1000 → `{newLevel:1,newExp:300,levelUpCount:0,nextLevelExp:1000}`; `{level:1,exp:900}+2200` with level-2/3/4 thresholds 1000/1000/1000 → `{newLevel:4,newExp:100,levelUpCount:3}`; `{level:maxLevel,exp:500}+120` → `{newLevel:maxLevel,newExp:620,levelUpCount:0,nextLevelExp:null}`. The pure function never dereferences a missing next row; `applyJobExp` persists that exact result to the already-locked progress row with the same trx.
9. near daily limit: seed cost 90, run two concurrent cost-10 attacks for the same user, assert exactly one fulfills, one rejects `DAILY_LIMIT_EXCEEDED`, total cost is 100, HP/EXP changed once;
10. start two lethal `attack()` calls without awaiting either, so they are separate concurrent service transactions. Pause the first in `beforeRoundInsert`, assert the second call has started but has not reached its post-season-lock hook, insert the competing next-round row with the first call's trx, then resume the normal insert. Assert the first catches the named `ER_DUP_ENTRY`, calls `onRoundConflict` once, reloads the sole active round, commits, and the second then completes against persisted state. Assert one active round, no duplicate `(season_id,round_no)`, and no lost contribution.

The test for item 10 must assert the first `beforeRoundInsert` hook and second-call-start signal both fired, `onRoundConflict` fired exactly once with the named constraint error, and the recovery branch returned the single persisted active round; a direct DB UNIQUE test does not satisfy this gate.

- [ ] **Step 2: Run and confirm failure**

```bash
cd app && yarn test -- src/service/__tests__/WorldBossBattleService.test.js --runInBand
```

Expected: FAIL because service/locking methods are missing.

- [ ] **Step 3: Add transactional minigame locking**

`lockUserAndProgress` must lock the parent user first so two first-ever attacks cannot create duplicate progress rows:

```js
exports.lockUserAndProgress = async (userId, defaults, trx) => {
  const user = await trx("user").where({ platform_id: userId }).forUpdate().first();
  if (!user) throw Object.assign(new Error("USER_NOT_FOUND"), { code: "USER_NOT_FOUND" });
  let row = await trx(TABLE).where({ user_id: user.id }).forUpdate().first();
  if (!row) {
    await trx(TABLE).insert({ user_id: user.id, level: defaults.level, exp: defaults.exp });
    row = await trx(TABLE).where({ user_id: user.id }).forUpdate().first();
  }
  return row;
};
```

Update `findByUserId`, `createByUserId`, and `updateByUserId` to accept optional `trx` without breaking existing callers. Implement the EXP transition as this pure function, then have `applyJobExp` update the already-locked row exactly once with the same trx:

```js
function calculateJobExpTransition(progress, earnedExp, levelUnits) {
  const thresholds = new Map(
    [...levelUnits]
      .sort((a, b) => Number(a.level) - Number(b.level))
      .map(row => [Number(row.level), Number(row.max_exp)])
  );
  let newLevel = Number(progress.level);
  let newExp = Number(progress.exp) + Number(earnedExp);
  let levelUpCount = 0;
  let nextLevelExp = thresholds.get(newLevel + 1) ?? null;
  while (nextLevelExp !== null && newExp >= nextLevelExp) {
    newExp -= nextLevelExp;
    newLevel += 1;
    levelUpCount += 1;
    nextLevelExp = thresholds.get(newLevel + 1) ?? null;
  }
  return {
    levelUp: levelUpCount > 0,
    newLevel,
    newExp,
    levelUpCount,
    nextLevelExp,
  };
}
```

Validate `progress.level`, `progress.exp`, `earnedExp`, every unit level, and every `max_exp` as finite non-negative integers (thresholds strictly `>0`); reject duplicate/missing current progression data with a domain error. At the highest configured level `nextLevelExp=null` and extra EXP remains in `newExp`.

- [ ] **Step 4: Implement attack lock order and recovery**

Inside one `mysql.transaction`:

```text
validate attack input
findActiveForUpdate(activeSlot, trx); recheck status and now < end_time
lockUserAndProgress(userId, defaultData, trx)
{startUtc,endUtc}=taipeiDayRange(now); sumCostInRange(userId,startUtc,endUtc,trx); reject when used + cost > limit
findActiveForUpdate(season.id, trx); verify max_hp > 0
apply damage; for lethal rounds clear with active_slot=null
create next round with active_slot=1
  on ER_DUP_ENTRY reload findActiveForUpdate(season.id, trx); throw if absent
insert contribution
applyJobExp using the already-locked progress row and same trx
read totals/daily using same trx
commit
```

Never catch and continue after a non-duplicate insert error. Both attack and settlement use `isExpired(season, now) => now >= end_time` semantics.

`taipeiDayRange(now)` needs no dependency: add eight hours to obtain the Taipei civil Y/M/D, construct UTC midnight for those fields, then subtract eight hours for `startUtc`; `endUtc` is exactly 24 hours later. Validate `now` is a finite Date. Taiwan has no current DST; this fixed UTC+8 rule is the product boundary. The test cases must use explicit UTC instants around 15:59:59.999Z/16:00:00.000Z.

- [ ] **Step 5: Format and verify narrow + full suite**

```bash
app/node_modules/.bin/prettier --write app/src/model/application/MinigameLevel.js \
  app/src/service/WorldBossBattleService.js \
  app/src/service/__tests__/WorldBossBattleService.test.js
cd app
yarn test -- src/service/__tests__/WorldBossBattleService.test.js --runInBand
yarn test -- --runInBand
yarn lint
```

Expected: concurrency, rollback, boundary, validation, and full suite pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/model/application/MinigameLevel.js \
  app/src/service/WorldBossBattleService.js \
  app/src/service/__tests__/WorldBossBattleService.test.js
git commit -m "feat(worldboss): add atomic attack and quota flow"
```

---

### Task 7: Implement draft CRUD, immediate open, ranking, and safe settlement

**Files:**
- Create: `app/src/service/WorldBossSeasonService.js`.
- Modify: `app/src/model/application/UserTitle.js`, `app/bin/TitleDelivery.js`.
- Test: `app/src/service/__tests__/WorldBossSeasonService.test.js`.

**Interfaces:**

```js
createSeasonService({ activeSlot = 1, clock = () => new Date(), hooks = {} })
// hooks.beforeOpenMutation({attempt,trx,season}) is awaited; production default is a no-op
listSeasons() -> rows ordered created_at DESC, id DESC
createSeason(input) -> seasonId
updateSeason(id, input) -> id                 // draft only
deleteSeason(id) -> id                        // draft only
openSeason(id) -> { seasonId, round }         // start_time = server now
getBattleStatus() -> null | {season,round,boss,ended}
getRanking(seasonId, limit) -> rows with competition ranking
getLatestSettledResult(userId) -> latest paid reward or null
settleSeason(id) -> {seasonId,contributors,rewarded,zeroTier}
settleExpiredSeasons() -> Array<{seasonId,contributors,rewarded,zeroTier}>
```

Errors include `SEASON_NOT_FOUND`, `SEASON_NOT_DRAFT`, `ANOTHER_SEASON_ACTIVE`, `INVALID_NAME`, `INVALID_END_TIME`, `SEASON_NOT_EXPIRED`, and `SETTLEMENT_INCOMPLETE`.

- [ ] **Step 1: Write isolated real-DB tests**

Use `createSeasonService({activeSlot: slotFor(7), clock})`. Cover:

- `listSeasons()` returns deterministic `created_at DESC, id DESC`; create/update/delete accept only draft; active and settled update/delete reject and rows remain unchanged;
- invalid/empty/65-char name, invalid date, `end_time<=now`, and caller-supplied future `start_time` handling: create ignores start_time and stores null; open always overwrites with exact injected server now;
- two drafts opened concurrently with the same injected slot: exactly one fulfills, one returns `ANOTHER_SEASON_ACTIVE`, exactly one season has that slot, and exactly one round is active;
- deadlock retry is deterministic: `beforeOpenMutation` records `attempt` and throws an error with `code="ER_LOCK_DEADLOCK"` on attempt 1 only; assert attempt 2 receives a different trx object, re-runs all reads/validation, commits one active season/round, and no driver error escapes. A second fixture throws on every attempt while a winner row is injected between attempts; after the two-attempt cap, service re-reads the slot and maps to `ANOTHER_SEASON_ACTIVE`;
- `now===end_time` reports ended and can settle;
- totals `[500,500,300]` produce ranks `[1,1,3]`; tied players receive exactly identical stone/title tier;
- seed 101+ contributors including rank 51; settlement uses unbounded ranking, creates a paid ledger for every contributor, rank 51 receives `stone_amount=0,title_key=null` while still being visible via latest reward, and the result counts satisfy `contributors === rewarded + zeroTier`;
- two concurrent `settleSeason(id)` calls produce one payment per player and one paid ledger per player;
- a player who already owns the same worldboss title settles successfully in a later season: title grant is idempotent, stones pay once, ledger becomes paid, no `ER_DUP_ENTRY` escapes;
- injected Inventory failure rolls back all reward rows, stones, titles, `paid_at`, and settled status;
- inject a pre-existing unpaid ledger for one test-owned player: settlement completes it once, requires **every contributor** row `paid_at != null`, then marks settled;
- latest settled lookup returns rank/stones/title/ledger proof after a newer active season is created;
- `UserTitle.clearAllExcept("worldboss_", trx)` is tested inside an explicit transaction that is rolled back in `finally`; assert test-owned rows inside trx, then assert shared sentinel rows are unchanged outside it. Never call the global delete and commit in a test.

- [ ] **Step 2: Run and confirm failure**

```bash
cd app && yarn test -- src/service/__tests__/WorldBossSeasonService.test.js --runInBand
```

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement validation, CRUD, and open locking**

`openSeason` transaction order:

```text
findForUpdate(id)
require draft
now = clock(); validate end_time parses and end_time > now
findActive(activeSlot, trx) and reject if found; do not FOR UPDATE a missing-key gap
update {status:'active',active_slot:activeSlot,start_time:now}
create round 1 with active_slot=1
commit
```

The UNIQUE `world_boss_season.active_slot` is the authoritative arbitration for concurrent open. Map named `ER_DUP_ENTRY` to `ANOTHER_SEASON_ACTIVE` after re-reading the winner. MySQL may choose `ER_LOCK_DEADLOCK` when two drafts are locked in opposite order: retry the **entire** transaction at most twice, then re-read `findActive(activeSlot)` and return `ANOTHER_SEASON_ACTIVE` if a winner exists; otherwise rethrow. Never continue a deadlocked transaction. `updateSeason` only permits `{name,announcement,end_time}`; no start_time/status/active_slot mass assignment.

- [ ] **Step 4: Implement one-transaction settlement**

`settleSeason(id)` must run one outer transaction:

```text
findForUpdate(id)
recheck status=active and clock() >= end_time
seasonRankingAll(season.id,trx), add competition ranks (never use public 1..100 limit)
for every contributor row:
  resolve configured tier or {stone:0,title_key:null}
  find ledger FOR UPDATE or insert UNIQUE unpaid ledger with rank/damage/tier values
  if unpaid and stone>0: increaseGodStone(...,trx)
  if unpaid and title_key: grant title idempotently in trx (existing same user/title is success)
  if unpaid: update paid_at=clock()
verify contributor count equals paid ledger count
update season {status:'settled',active_slot:null,settled_at:clock()}
commit
```

`hooks.beforePayment` provides the forced failure test. Do not use per-player nested transactions. Do not mark settled if any contributor ledger is absent/unpaid. Duplicate paid ledger means skip payment, not repay.

Add `UserTitle.grantByPlatformId(userId,titleId,trx)` transaction support and make it idempotent for the existing UNIQUE `(user_id,title_id)` constraint (`onConflict(["user_id","title_id"]).ignore()` or named duplicate handling). A pre-owned same title is success; other DB errors rethrow. Implement `clearAllExcept` with optional `trx` and change TitleDelivery to preserve `worldboss_`; production behavior stays the same for gacha/janken recalculation.

- [ ] **Step 5: Format and verify narrow + full suite**

```bash
app/node_modules/.bin/prettier --write app/src/service/WorldBossSeasonService.js \
  app/src/model/application/UserTitle.js app/bin/TitleDelivery.js \
  app/src/service/__tests__/WorldBossSeasonService.test.js
cd app
yarn test -- src/service/__tests__/WorldBossSeasonService.test.js --runInBand
yarn test -- --runInBand
yarn lint
```

Expected: CRUD, open concurrency, tie ranking, settlement concurrency/failure/retry, and shared-row sentinel tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/service/WorldBossSeasonService.js app/src/model/application/UserTitle.js \
  app/bin/TitleDelivery.js app/src/service/__tests__/WorldBossSeasonService.test.js
git commit -m "feat(worldboss): add season lifecycle and safe settlement"
```

---

### Task 8: Add cron with truthful nonzero CLI failure

**Files:**
- Create: `app/bin/WorldBossSeasonSettle.js`, `app/bin/__tests__/WorldBossSeasonSettle.test.js`.
- Modify: `app/config/crontab.config.js`.

**Interfaces:**
- Worker calls exported `main()` hourly at minute 10.
- Direct CLI calls exported `runCli(mainFn=main)`. Rejection is logged and sets exit code 1; success exits 0. No catch-and-exit-0 path.

- [ ] **Step 1: Write failing runnable CLI test**

Use `spawnSync(process.execPath, ["-e", script], {cwd: appRoot})` with:

```js
const cron = require("./bin/WorldBossSeasonSettle");
cron.runCli(async () => { throw new Error("forced cron failure"); });
```

Assert `status === 1` and stderr/log capture contains `forced cron failure`. Add a success spawn asserting status 0.

- [ ] **Step 2: Run and confirm failure**

```bash
cd app && yarn test -- bin/__tests__/WorldBossSeasonSettle.test.js --runInBand
```

Expected: FAIL because cron module is absent.

- [ ] **Step 3: Implement cron and schedule**

```js
const service = require("../src/service/WorldBossSeasonService");
const { DefaultLogger } = require("../src/util/Logger");

async function main() {
  const results = await service.settleExpiredSeasons();
  if (results.length) DefaultLogger.info(`World boss season settle: ${JSON.stringify(results)}`);
  return results;
}

function runCli(mainFn = main) {
  return Promise.resolve()
    .then(mainFn)
    .catch(err => {
      DefaultLogger.error("World boss season settle failed:", err);
      process.exitCode = 1;
    });
}

module.exports = main;
module.exports.main = main;
module.exports.runCli = runCli;
if (require.main === module) runCli();
```

Append crontab entry with `period: ["0","10","*","*","*","*"]`, `immediate:false`, `require_path:"./bin/WorldBossSeasonSettle"`.

- [ ] **Step 4: Format and verify**

```bash
app/node_modules/.bin/prettier --write app/bin/WorldBossSeasonSettle.js \
  app/bin/__tests__/WorldBossSeasonSettle.test.js app/config/crontab.config.js
cd app
yarn test -- bin/__tests__/WorldBossSeasonSettle.test.js --runInBand
node bin/WorldBossSeasonSettle.js
yarn lint
```

Expected: automated forced-failure subprocess exits 1, success exits 0, real empty run exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/bin/WorldBossSeasonSettle.js app/bin/__tests__/WorldBossSeasonSettle.test.js \
  app/config/crontab.config.js
git commit -m "feat(worldboss): add settlement cron failure contract"
```

---

### Task 9: Build Flex templates for active state and latest reward

**Files:**
- Create: `app/src/templates/application/WorldBoss.js`.
- Test: `app/src/templates/application/__tests__/WorldBoss.test.js` (structural content only, not pixel appearance).

**Interfaces:**

```js
generateBattleStatusBubble({season,round,boss,daily,liffUri})
generateAttackResultBubble({result,daily,latestReward})
generateLatestRewardBubble({reward,liffUri})
generateWorldBossReply({status,daily,latestReward,liffUri}) -> bubble or carousel
generateNoActiveSeasonBubble({ended,liffUri})
```

Latest reward copy must include season, `第 N 名`, stones (including `0`), title (or `無稱號`), total damage, ledger `rewardId`, paid timestamp `paidAt`, and a LIFF button. Label the proof fields in player-readable copy (for example `結算編號 #42`、`入帳時間 ...`); do not expose only an internal object property. `generateWorldBossReply` includes both active status and reward when both exist; without active it still returns latest reward; only when both absent does it return no-season.

- [ ] **Step 1: Write failing structural tests**

Assert serialized Flex JSON contains:
- active round/HP/attack buttons and URI `/worldboss`;
- latest reward fields `第 1 名`, `100`, `殲滅之王`, `結算編號 #42`, and the `paidAt` instant;
- zero-tier reward still shows rank, `0` stones, `無稱號`, rewardId, and paidAt;
- active + reward produces a carousel with two bubbles;
- invalid `max_hp=0` is rejected rather than yielding `NaN%`.

- [ ] **Step 2: Run and confirm failure**

```bash
cd app && yarn test -- src/templates/application/__tests__/WorldBoss.test.js --runInBand
```

- [ ] **Step 3: Implement pure builders**

Use `FEATURE.worldBoss`, `SEMANTIC`, and `SURFACE`; no model/service/context imports. Attack postback data includes `{action:"worldBossAttack",attackType:"standard"|"skill",cooldown:<config>}`. Keep each LINE Flex message within platform limits.

- [ ] **Step 4: Format and verify**

```bash
app/node_modules/.bin/prettier --write app/src/templates/application/WorldBoss.js \
  app/src/templates/application/__tests__/WorldBoss.test.js
cd app
yarn test -- src/templates/application/__tests__/WorldBoss.test.js --runInBand
yarn lint
```

- [ ] **Step 5: Commit**

```bash
git add app/src/templates/application/WorldBoss.js \
  app/src/templates/application/__tests__/WorldBoss.test.js
git commit -m "feat(worldboss): add battle and settlement flex cards"
```

---

### Task 10: Wire chat controller and show latest reward on next interaction

**Files:**
- Create: `app/src/controller/application/WorldBossController.js`.
- Modify: `app/src/app.js`.
- Reuse unchanged: `app/src/model/application/RPGCharacter.js`, `app/src/service/EquipmentService.js`, `app/src/service/MinigameService.js`.
- Test: `app/src/controller/application/__tests__/WorldBossController.test.js`.

**Interfaces:**
- Router only matches `/^[.#/](世界王|worldboss)$/i`; it does not restore `#冒險小卡` or `#裝備`.
- `showBattleStatus(context)` concurrently reads battle status, daily quota, and `getLatestSettledResult(userId)`, then calls `generateWorldBossReply`.
- `attackOnBoss(context,{payload})` validates `payload.attackType`, computes the exact RPG/equipment values below, calls `BattleService.attack({userId,attackType,damage,cost,exp})`, re-reads latest reward, and includes it in the reply.
- Load progress via `MinigameService.findByUserId(userId)` and bonuses via `EquipmentService.getEquipmentBonuses(userId)`. For a player without `minigame_level`, compute the first hit as default `{level:1,job_key:"adventurer"}` **without inserting**. BattleService creates/locks that row and grants EXP inside the attack transaction; controller must not call `createByUserId` before `attack()`.
- Build `character = RPGCharacter.make(job_key,{level})`. For `standard`, base damage is `character.getStandardDamage()` and base cost is `10`; for `skill`, base damage is `character.getSkillOneDamage()` and base cost is `character.skillOne.cost`. Final `damage = Math.floor(baseDamage * (1 + Math.max(0, Number(atk_percent)||0)))`; final `cost = Math.max(1, baseCost - Math.max(0, Number(cost_reduction)||0))`; final `exp = config.get("worldboss.per_hit_exp") + Math.max(0, Number(exp_bonus)||0)`. `crit_rate` and `gold_bonus` do not receive a second application here because RPGCharacter skill methods already own their critical behavior and per-hit EXP is fixed by spec.
- LIFF path constant is `"/worldboss"`.
- Preserve the 5-second cooldown through Redis `SET <worldboss-v2:userId> 1 EX config.worldboss.attack_cooldown_seconds NX`. A false result returns the friendly cooldown reply before damage/service work. Use a v2-specific key; do not restore v1 event IDs or let cooldown replace the transactional daily quota. Unexpected Redis errors rethrow rather than silently disabling the guard.

- [ ] **Step 1: Write failing controller tests with mocks before require**

Cover:
- active + latest reward gives both cards on the next `#世界王` interaction;
- no active + latest reward still shows rank/stones/title/rewardId/paidAt, including zero-tier results;
- neither gives no-season card;
- invalid attackType is rejected before damage calculation/service call;
- cooldown Redis NX success calls the service once, NX miss returns friendly reply with no damage/service work, and Redis rejection rethrows; assert the v2-specific key and configured 5-second TTL;
- controller daily precheck can short-circuit UX, but service `DAILY_LIMIT_EXCEEDED` is also mapped to friendly reply (race-safe authority remains service);
- standard and skill fixtures assert exact `RPGCharacter` method selection, base cost, `atk_percent`, `cost_reduction`, and `per_hit_exp + exp_bonus` values passed to `attack()`; include a negative/NaN bonus fixture proving bonuses never make values invalid;
- missing minigame data uses Lv.1 adventurer damage, does not call `createByUserId`, and leaves creation to the service transaction;
- expired/no-active errors map to Flex; unexpected errors rethrow.

- [ ] **Step 2: Run and confirm failure**

```bash
cd app && yarn test -- src/controller/application/__tests__/WorldBossController.test.js --runInBand
```

- [ ] **Step 3: Implement controller and three app.js wiring points**

Add require, postback route, and `...WorldBossController.router`. Do not add a generic LINE push/multicast or restore v1 commands. Achievement emission remains `boss_attack` with `{feature:"world_boss"}` after successful attack.

- [ ] **Step 4: Format and verify narrow + full suite + startup**

```bash
app/node_modules/.bin/prettier --write app/src/controller/application/WorldBossController.js \
  app/src/controller/application/__tests__/WorldBossController.test.js app/src/app.js
cd app
yarn test -- src/controller/application/__tests__/WorldBossController.test.js --runInBand
yarn test -- --runInBand
yarn lint
timeout 20 yarn dev
```

Expected: tests/lint pass; startup timeout may exit 124 but logs contain no require/wiring error.

- [ ] **Step 5: Commit**

```bash
git add app/src/controller/application/WorldBossController.js \
  app/src/controller/application/__tests__/WorldBossController.test.js app/src/app.js
git commit -m "feat(worldboss): wire chat battle and reward replies"
```

---

### Task 11: Add validated admin CRUD and public LIFF APIs

**Files:**
- Create: `app/src/router/WorldBoss/index.js`, `app/src/handler/WorldBoss/{index,admin,public}.js`.
- Modify: `app/src/router/api.js`.
- Test: `app/src/handler/WorldBoss/__tests__/handlers.test.js`.

**Interfaces:**

```text
GET    /api/admin/world-bosses
POST   /api/admin/world-bosses
PUT    /api/admin/world-bosses/:id
DELETE /api/admin/world-bosses/:id
GET    /api/admin/world-boss-seasons
POST   /api/admin/world-boss-seasons
PUT    /api/admin/world-boss-seasons/:id       draft only
DELETE /api/admin/world-boss-seasons/:id       draft only
POST   /api/admin/world-boss-seasons/:id/open  immediate server-now open
GET    /api/world-boss/status
GET    /api/world-boss/leaderboard?limit=50
GET    /api/world-boss/me
```

All routes use existing auth middleware. Response datetimes pass through one `toApiDto` helper that emits `date.toISOString()` with `Z`.

`GET /me` returns independently of active state:

```json
{
  "current": null,
  "latestReward": {
    "rewardId": 42,
    "seasonId": 1,
    "seasonName": "S1",
    "ranking": 1,
    "totalDamage": 500,
    "stoneAmount": 100,
    "titleKey": "worldboss_annihilator",
    "titleName": "殲滅之王",
    "paidAt": "2026-07-19T12:00:00.000Z",
    "settledAt": "2026-07-19T12:00:00.000Z"
  }
}
```

When active exists, `current` is `{seasonId,totalDamage,daily}` while `latestReward` remains present.

- [ ] **Step 1: Write failing handler tests**

Cover all routes and error mappings, including:
- boss name/weight invalid values rejected and service not called;
- season create/update invalid dates rejected; active/settled update/delete service errors map 409/400;
- create payload `start_time` is ignored/rejected and open writes no client time;
- leaderboard `1` and `100` accepted; missing defaults 50; `0`, `101`, `1.5`, `NaN`, `Infinity` return 400 rather than clamp;
- all datetime response fields are ISO strings ending `Z`;
- `/me` returns latest reward with no active and both current/reward with active.

- [ ] **Step 2: Run and confirm failure**

```bash
cd app && yarn test -- src/handler/WorldBoss/__tests__/handlers.test.js --runInBand
```

- [ ] **Step 3: Implement handlers through services**

Admin handler must call `WorldBossCatalogService.listBosses/createBoss/updateBoss/deleteBoss` and `WorldBossSeasonService.listSeasons/createSeason/updateSeason/deleteSeason/openSeason`; it must not call Base model CRUD directly. Assert both GET handlers delegate to their service list method and preserve deterministic order. Public handler calls `getBattleStatus`, `getRanking`, `getLatestSettledResult`, and battle daily helper. Centralize error→HTTP mapping and UTC DTO serialization.

Mount admin router only after existing `verifyToken, verifyAdmin, verifyPrivilege(5)` middleware; mount public router as `router.use("/world-boss", verifyToken, PublicWorldBossRouter)`.

- [ ] **Step 4: Format and verify narrow + full suite**

```bash
app/node_modules/.bin/prettier --write app/src/router/WorldBoss/index.js \
  app/src/handler/WorldBoss app/src/router/api.js \
  app/src/handler/WorldBoss/__tests__/handlers.test.js
cd app
yarn test -- src/handler/WorldBoss/__tests__/handlers.test.js --runInBand
yarn test -- --runInBand
yarn lint
```

- [ ] **Step 5: Commit**

```bash
git add app/src/router/WorldBoss app/src/handler/WorldBoss app/src/router/api.js
git commit -m "feat(worldboss): add admin and LIFF APIs"
```

---

### Task 12: Build admin catalog and complete draft-season CRUD UI

**Files:**
- Create: `frontend/src/pages/Admin/Worldboss.jsx`.
- Modify: `frontend/src/App.jsx`, `frontend/src/components/NavDrawer.jsx`.

**Interfaces:**
- `/admin/worldboss` supports boss create/edit/delete and season create/edit/delete/open.
- Edit/delete/open buttons appear only for draft seasons. Active/settled are read-only.
- Season form has no start-time field. End-time `datetime-local` is converted with `new Date(value).toISOString()` immediately before API submission; invalid/non-future value blocks submit client-side, while server remains authoritative.

- [ ] **Step 1: Implement API helpers and forms**

Use:

```jsx
const toUtcIso = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const seasonPayload = form => ({
  name: form.name.trim(),
  announcement: form.announcement.trim() || null,
  end_time: toUtcIso(form.end_time),
});
```

Boss form enforces trimmed name length ≤64 and finite positive weight for UX. Season edit uses PUT; delete uses DELETE after confirmation; open confirmation says it starts immediately at server time. Do not send `start_time`.

- [ ] **Step 2: Wire route and navigation**

Add `<Route path="admin/worldboss" element={<AdminWorldboss />} />` inside `RequireAdmin` and one `世界王管理` nav item.

- [ ] **Step 3: Format, lint, build, and perform manual browser checks**

```bash
app/node_modules/.bin/prettier --write frontend/src/pages/Admin/Worldboss.jsx \
  frontend/src/App.jsx frontend/src/components/NavDrawer.jsx
yarn lint:frontend
yarn build:frontend
```

Manual browser checks (record pass/fail in task report): create boss, reject invalid weight, edit/delete unused boss, create/edit/delete draft, open draft immediately, verify active edit/delete buttons absent, verify request JSON `end_time` ends `Z` and has no `start_time`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Admin/Worldboss.jsx frontend/src/App.jsx \
  frontend/src/components/NavDrawer.jsx
git commit -m "feat(worldboss): add catalog and season admin page"
```

---

### Task 13: Build LIFF battle board with latest settled reward

**Files:**
- Create: `frontend/src/pages/Worldboss/index.jsx`.
- Modify: `frontend/src/App.jsx`, `frontend/src/components/NavDrawer.jsx`.

**Interfaces:**
- Route is exactly `worldboss`; backend LIFF URI is exactly `/worldboss`.
- Page consumes status, leaderboard, and `/me`. It always renders `latestReward` when present, even if status/current is null or a newer season is active.
- Leaderboard uses server-provided `ranking`, so ties render `1,1,3`; do not derive rank from array index.

- [ ] **Step 1: Implement page states**

Render:
- loading/error/refresh;
- active card with season, boss, safe HP percent (`max_hp>0` guard), round, UTC API dates formatted with `toLocaleString()`;
- current personal damage/daily quota when available;
- latest settled reward card with rank, stones (including zero), title or `無稱號`, total damage, authoritative `rewardId` (`結算編號`) and `paidAt` (`入帳時間`); `settledAt` may be secondary but cannot replace payment proof;
- leaderboard with `row.ranking` and shared medal for equal ranks;
- when no active, keep reward card visible and show no-season copy below/above it.

- [ ] **Step 2: Wire route and navigation**

Add `<Route path="worldboss" element={<Worldboss />} />` in the normal `MainLayout` and one general `世界王` nav item.

- [ ] **Step 3: Format, lint, build, and perform manual browser checks**

```bash
app/node_modules/.bin/prettier --write frontend/src/pages/Worldboss/index.jsx \
  frontend/src/App.jsx frontend/src/components/NavDrawer.jsx
yarn lint:frontend
yarn build:frontend
rg -n 'path="worldboss"|LIFF_PATH = "/worldboss"' \
  frontend/src/App.jsx app/src/controller/application/WorldBossController.js
```

Manual browser checks: active+reward together, no-active+reward, zero-tier reward, no-active/no-reward, tied rows show 1/1/3, reward card visibly shows rewardId and paidAt (not only settledAt), locale date renders without invalid date, refresh updates all three calls.

Real LINE E2E (`#世界王` reply token, attack postback, LIFF auth) is explicitly not automatable in this repository; list it as pending human acceptance rather than marking it passed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Worldboss/index.jsx frontend/src/App.jsx \
  frontend/src/components/NavDrawer.jsx
git commit -m "feat(worldboss): add LIFF battle and reward board"
```

---

### Task 14: Local final verification, rollback checkpoint, and fresh review

**Files:** No product files unless a failing gate requires a scoped fix. No push/PR/deploy.

- [ ] **Step 1: Run format, lint, test, and build gates**

```bash
cd /home/hanshino/workspace/redive_linebot
yarn format:check
cd app
yarn lint
yarn test -- --runInBand
cd ..
yarn lint:frontend
yarn build:frontend
git diff --check main...HEAD
```

Expected: all exit 0. Fix failures in the owning task scope, format changed JS/JSX again, rerun the failed narrow test and then this whole gate.

- [ ] **Step 2: Run semantic teardown and placeholder scans**

```bash
cd /home/hanshino/workspace/redive_linebot
if rg -n 'adminBossAttack|deliveryWorldBossTitles|world-boss/feature-messages|WorldBossEvent|WorldBossLog|AttackMessageTags|WorldBossUserAttackMessage|#冒險小卡|\^\[#＃\]裝備' \
  app/src app/bin app/config frontend/src; then
  echo "v1 worldboss residual found" >&2
  exit 1
fi

added_js=$(mktemp)
git diff --unified=0 main...HEAD -- '*.js' '*.jsx' > "$added_js"
if rg '^\+.*(TODO|FIXME|test\.skip|test\.only|describe\.only|it\.only|NotImplemented|ponytail:)' "$added_js"; then
  echo "placeholder debt found" >&2
  rm -f "$added_js"
  exit 1
fi
# Collapse each added JS/JSX file before scanning so multiline `catch (...) {\n}` is detectable.
if git diff --name-only main...HEAD -- '*.js' '*.jsx' | while IFS= read -r file; do
  perl -0777 -ne 'exit 1 if /catch\s*(?:\([^)]*\))?\s*\{\s*\}/s' "$file" || exit 1
done; then
  :
else
  echo "empty catch found" >&2
  rm -f "$added_js"
  exit 1
fi
rm -f "$added_js"
```

Expected: v1 scan has 0 hits; added-line debt/empty-catch assertions exit 0. Do not modify unrelated comments to silence a broad grep—narrow the semantic pattern instead.

- [ ] **Step 3: Exercise runtime and cron failure contract**

```bash
make infra
cd app
timeout 20 yarn dev
node bin/WorldBossSeasonSettle.js
node -e 'const c=require("./bin/WorldBossSeasonSettle");c.runCli(async()=>{throw new Error("forced-final-gate")})'; test $? -ne 0
```

Expected: bot has no require/wiring error; cron empty run exits 0; forced run exits nonzero.

- [ ] **Step 4: Verify rollback with backups, without claiming data restoration**

Before production deployment, the deploy operator must create and verify a timestamped DB dump. For local migration rollback verification, use the Task 3 backup checkpoint, then:

```bash
cd app
yarn knex migrate:down   # removes v2: dependent user_titles first, then titles/tables
yarn knex migrate:down   # v1 teardown down: recreates five empty v1 schemas
node -e "const k=require('knex')(require('./knexfile'));Promise.all(['world_boss','world_boss_event','world_boss_event_log','world_boss_user_attack_message','attack_message_has_tags'].map(t=>k.schema.hasTable(t))).then(x=>{if(x.some(v=>!v))process.exitCode=1;return k.destroy()})"
yarn migrate
yarn knex seed:run --specific=WorldBossCatalogSeeder.js
node -e "const k=require('knex')(require('./knexfile'));k('world_boss').whereIn('id',[1,2,3,4]).count({n:'id'}).first().then(({n})=>{if(Number(n)!==4)process.exitCode=1}).finally(()=>k.destroy())"
```

Expected: rollback truthfully yields empty v1 schemas; migrate reapplies teardown+v2. The explicit reseed and assertion restore stable boss IDs 1–4 before any openSeason test or handoff; migration reapply does not run seeds automatically. Restore lost v1 data only from the verified backup; migration `down()` never claims to restore rows.

Production checkpoint for a **later authorized online-agent deployment** (not executable from this workstation):

```bash
# Discover Portainer containers by compose labels; do not assume generated suffixes.
bot=$(docker ps -q --filter label=com.docker.compose.project=redive_linebot \
  --filter label=com.docker.compose.service=bot)
worker=$(docker ps -q --filter label=com.docker.compose.project=redive_linebot \
  --filter label=com.docker.compose.service=worker)
mysql=$(docker ps -q --filter label=com.docker.compose.project=infra \
  --filter label=com.docker.compose.service=mysql)
test -n "$bot" && test -n "$worker" && test -n "$mysql"

# Persist on the host-mounted SSD, not inside an ephemeral container.
backup_dir=/mnt/storage/redive-backups/worldboss-v2
mkdir -p "$backup_dir"
backup="$backup_dir/Princess-before-worldboss-v2-$(date +%Y%m%d-%H%M%S).sql"
docker stop "$worker" "$bot"
docker exec "$mysql" sh -c \
  'exec mysqldump --single-transaction --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" Princess' \
  > "$backup"
test -s "$backup"
sha256sum "$backup" > "${backup}.sha256"
sha256sum -c "${backup}.sha256"

# Run migration/seed from a one-shot container while public bot and worker stay stopped.
image=$(docker inspect -f '{{.Config.Image}}' "$bot")
env_file=$(mktemp /tmp/redive-worldboss-env.XXXXXX)
chmod 600 "$env_file"
docker inspect "$bot" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$env_file"
docker run --rm --network infra --env-file "$env_file" "$image" yarn migrate
docker run --rm --network infra --env-file "$env_file" "$image" \
  yarn knex seed:run --specific=WorldBossCatalogSeeder.js
rm -f "$env_file"
docker start "$bot" "$worker"
docker ps --filter id="$bot" --filter id="$worker"

# Restore branch—run only after a separate explicit recovery decision.
docker stop "$worker" "$bot"
sha256sum -c "${backup}.sha256"
docker exec -i "$mysql" sh -c \
  'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" Princess' < "$backup"
docker start "$bot" "$worker"
```

The later deployment handoff must record discovered container IDs, exact absolute backup/checksum paths, nonempty/checksum results, stop/start output, migration/seed output, and a bot/worker health verification before completion. If the actual Portainer project labels differ, the online agent must report them and adjust discovery—not fall back to an unpersisted container-local dump.

- [ ] **Step 5: Fresh-context review**

Give a fresh verifier only this plan/spec and the branch diff. Acceptance requires:
- all Task 1–13 criteria and tests are present and passing;
- concurrent open/lethal/quota/settlement and forced rollback tests are real service/DB tests;
- shared sentinels survive;
- latest reward works chat + API + LIFF with/without active;
- tie rewards are identical;
- migration rollback and cron exit semantics are truthful;
- no placeholder debt or scope creep.

Verdict must be ACCEPT before completion. After fixes, send only the delta back to the same verifier.

- [ ] **Step 6: Stop locally and write handoff**

Record commits, test output, local backup path, manual browser checks, and the explicitly unautomated LINE E2E list. Do not push, create PR, post comments, or deploy; those actions require a later explicit user instruction.
