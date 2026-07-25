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
const TABLES = [
  "world_boss",
  "world_boss_season",
  "world_boss_round",
  "world_boss_contribution",
  "world_boss_season_reward",
];
const DROP_ORDER = [...TABLES].reverse();
const MAX_TITLE_ORDER = 127;
const TABLE_DEFINITION_COUNTS = {
  world_boss: 9,
  world_boss_season: 14,
  world_boss_round: 17,
  world_boss_contribution: 12,
  world_boss_season_reward: 12,
};
const COMMON_TABLE_SIGNATURES = [
  "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP",
  "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP",
  "PRIMARY KEY (`id`)",
];
const TABLE_SIGNATURES = {
  world_boss: [
    "`id` bigint unsigned NOT NULL AUTO_INCREMENT",
    "`name` varchar(64) NOT NULL",
    "`image` varchar(255) DEFAULT NULL",
    "`description` text",
    "`hp_weight` decimal(8,3) NOT NULL DEFAULT '1.000'",
    "CONSTRAINT `chk_wb_hp_weight_positive` CHECK",
    "ENGINE=InnoDB",
  ],
  world_boss_season: [
    "`id` bigint unsigned NOT NULL AUTO_INCREMENT",
    "`name` varchar(64) NOT NULL",
    "`announcement` text",
    "`status` enum('draft','active','settled') NOT NULL DEFAULT 'draft'",
    "`active_slot` int unsigned DEFAULT NULL",
    "`start_time` datetime DEFAULT NULL",
    "`end_time` datetime NOT NULL",
    "`settled_at` datetime DEFAULT NULL",
    "UNIQUE KEY `uq_wbs_active_slot` (`active_slot`)",
    "KEY `idx_wbs_settleable` (`status`,`end_time`)",
    "CONSTRAINT `chk_wbs_active_slot_status` CHECK",
    "ENGINE=InnoDB",
  ],
  world_boss_round: [
    "`id` bigint unsigned NOT NULL AUTO_INCREMENT",
    "`season_id` bigint unsigned NOT NULL",
    "`round_no` int unsigned NOT NULL",
    "`world_boss_id` bigint unsigned NOT NULL",
    "`max_hp` bigint unsigned NOT NULL",
    "`current_hp` bigint unsigned NOT NULL",
    "`status` enum('active','cleared') NOT NULL DEFAULT 'active'",
    "`active_slot` int unsigned DEFAULT NULL",
    "`cleared_at` datetime DEFAULT NULL",
    "UNIQUE KEY `uq_wbr_season_round` (`season_id`,`round_no`)",
    "UNIQUE KEY `uq_wbr_season_active_slot` (`season_id`,`active_slot`)",
    "CONSTRAINT `chk_wbr_active_slot_status` CHECK",
    "CONSTRAINT `chk_wbr_current_lte_max` CHECK",
    "CONSTRAINT `chk_wbr_max_hp_positive` CHECK",
    "ENGINE=InnoDB",
  ],
  world_boss_contribution: [
    "`id` bigint unsigned NOT NULL AUTO_INCREMENT",
    "`season_id` bigint unsigned NOT NULL",
    "`round_id` bigint unsigned NOT NULL",
    "`user_id` varchar(33) NOT NULL",
    "`damage` bigint unsigned NOT NULL",
    "`cost` int unsigned NOT NULL",
    "KEY `idx_wbc_season_user` (`season_id`,`user_id`)",
    "KEY `idx_wbc_round` (`round_id`)",
    "KEY `idx_wbc_user_created` (`user_id`,`created_at`)",
    "ENGINE=InnoDB",
  ],
  world_boss_season_reward: [
    "`id` bigint unsigned NOT NULL AUTO_INCREMENT",
    "`season_id` bigint unsigned NOT NULL",
    "`user_id` varchar(33) NOT NULL",
    "`ranking` int unsigned NOT NULL",
    "`total_damage` bigint unsigned NOT NULL",
    "`stone_amount` int unsigned NOT NULL DEFAULT '0'",
    "`title_key` varchar(64) DEFAULT NULL",
    "`paid_at` datetime DEFAULT NULL",
    "UNIQUE KEY `uq_wbsr_season_user` (`season_id`,`user_id`)",
    "ENGINE=InnoDB",
  ],
};

async function existingTables(knex) {
  const [rows] = await knex.raw(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)",
    [TABLES]
  );
  return rows.map(row => row.TABLE_NAME);
}

async function assertOwnedTables(knex, tables) {
  for (const table of tables) {
    const [rows] = await knex.raw("SHOW CREATE TABLE ??", [table]);
    const createSql = rows[0]["Create Table"];
    const definitionCount = createSql.split("\n").length - 2;
    const signatures = [...TABLE_SIGNATURES[table], ...COMMON_TABLE_SIGNATURES];
    if (
      definitionCount !== TABLE_DEFINITION_COUNTS[table] ||
      !signatures.every(fragment => createSql.includes(fragment))
    ) {
      throw new Error(`WORLD_BOSS_V2_SCHEMA_DRIFT:${table}`);
    }
  }
}

async function assertPartialTablesEmpty(knex, tables) {
  if (!tables.length || tables.length === TABLES.length) return;
  for (const table of tables) {
    const [{ rowCount }] = await knex(table).count({ rowCount: "*" });
    if (Number(rowCount) !== 0) {
      throw new Error(`WORLD_BOSS_V2_PARTIAL_STATE_HAS_DATA:${table}`);
    }
  }
}

async function preflightTitles(knex, allowOwnedKeys) {
  const existing = await knex("titles").whereIn("key", TITLE_KEYS);
  const existingByKey = new Map(existing.map(row => [row.key, row]));
  const ownedKeys = [];
  const collisions = [];
  for (const title of TITLES) {
    const row = existingByKey.get(title.key);
    if (!row) continue;
    if (
      allowOwnedKeys &&
      row.name === title.name &&
      row.description === title.description &&
      row.icon === title.icon &&
      Number(row.rarity) === title.rarity
    ) {
      ownedKeys.push(title.key);
    } else {
      collisions.push(title.key);
    }
  }
  if (collisions.length) {
    throw new Error(`WORLD_BOSS_TITLE_KEY_COLLISION:${collisions.join(",")}`);
  }

  const { maxOrder } = await knex("titles").max({ maxOrder: "order" }).first();
  const nextOrder = Number(maxOrder || 0) + 1;
  const missingCount = TITLES.length - ownedKeys.length;
  if (missingCount && nextOrder + missingCount - 1 > MAX_TITLE_ORDER) {
    throw new Error(`WORLD_BOSS_TITLE_ORDER_EXHAUSTED:max=${maxOrder}`);
  }

  return { ownedKeys, nextOrder };
}

async function createTable(knex, tableName) {
  switch (tableName) {
    case "world_boss":
      await knex.schema.createTable(tableName, table => {
        table.bigIncrements("id").primary();
        table.string("name", 64).notNullable();
        table.string("image", 255);
        table.text("description");
        table.decimal("hp_weight", 8, 3).notNullable().defaultTo(1);
        table.timestamps(true, true);
        table.check("?? > 0", ["hp_weight"], "chk_wb_hp_weight_positive");
      });
      break;
    case "world_boss_season":
      await knex.schema.createTable(tableName, table => {
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
          "(`status` = 'active' AND `active_slot` IS NOT NULL AND `active_slot` = 1) OR (`status` <> 'active' AND `active_slot` IS NULL)",
          [],
          "chk_wbs_active_slot_status"
        );
      });
      break;
    case "world_boss_round":
      await knex.schema.createTable(tableName, table => {
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
          "(`status` = 'active' AND `active_slot` IS NOT NULL AND `active_slot` = 1) OR (`status` = 'cleared' AND `active_slot` IS NULL)",
          [],
          "chk_wbr_active_slot_status"
        );
      });
      break;
    case "world_boss_contribution":
      await knex.schema.createTable(tableName, table => {
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
      break;
    case "world_boss_season_reward":
      await knex.schema.createTable(tableName, table => {
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
      break;
    default:
      throw new Error(`WORLD_BOSS_V2_UNKNOWN_TABLE:${tableName}`);
  }
}

exports.up = async knex => {
  const tables = await existingTables(knex);
  await assertOwnedTables(knex, tables);
  await assertPartialTablesEmpty(knex, tables);
  const { ownedKeys, nextOrder } = await preflightTitles(knex, tables.length === TABLES.length);
  if (tables.length === TABLES.length && ownedKeys.length === TITLES.length) return;

  for (const table of TABLES) {
    if (!tables.includes(table)) await createTable(knex, table);
  }

  const owned = new Set(ownedKeys);
  const missingTitles = TITLES.filter(title => !owned.has(title.key));
  if (missingTitles.length) {
    await knex("titles").insert(
      missingTitles.map((title, index) => ({
        ...title,
        order: nextOrder + index,
      }))
    );
  }
};

exports.down = async knex => {
  const tables = await existingTables(knex);
  await assertOwnedTables(knex, tables);

  const ownedTitles = await knex("titles").whereIn("key", TITLE_KEYS);
  const ownedIds = [];
  for (const title of ownedTitles) {
    const definition = TITLES.find(candidate => candidate.key === title.key);
    if (
      tables.length !== TABLES.length ||
      title.name !== definition.name ||
      title.description !== definition.description ||
      title.icon !== definition.icon ||
      Number(title.rarity) !== definition.rarity
    ) {
      throw new Error(`WORLD_BOSS_TITLE_KEY_COLLISION:${title.key}`);
    }
    ownedIds.push(title.id);
  }

  if (ownedIds.length) await knex("user_titles").whereIn("title_id", ownedIds).del();
  if (ownedIds.length) await knex("titles").whereIn("id", ownedIds).del();
  for (const table of DROP_ORDER) {
    if (tables.includes(table)) await knex.schema.dropTable(table);
  }
};

exports.config = { transaction: false };
