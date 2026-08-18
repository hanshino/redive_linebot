const V1_ACHIEVEMENT_KEYS = [
  "boss_first_kill",
  "boss_level_10",
  "boss_level_50",
  "boss_top_damage",
];
const V1_TITLE_KEYS = ["progressors", "leechers"];
const V1_TABLES = [
  "attack_message_has_tags",
  "world_boss_event_log",
  "world_boss_event",
  "world_boss_user_attack_message",
  "world_boss",
];
const DROP_V1_TABLES_SQL = `DROP TABLE IF EXISTS ${V1_TABLES.map(table => `\`${table}\``).join(", ")}`;
const V1_TABLE_COLUMNS = {
  attack_message_has_tags: [
    ["id", "int", "int unsigned", "NO", null, "AUTO_INCREMENT", ""],
    ["attack_message_id", "int", "int unsigned", "NO", null, "", ""],
    ["tag", "varchar", "varchar(255)", "NO", null, "", ""],
  ],
  world_boss_event_log: [
    ["id", "int", "int unsigned", "NO", null, "AUTO_INCREMENT", ""],
    ["world_boss_event_id", "int", "int", "NO", null, "", ""],
    ["user_id", "int", "int", "NO", null, "", ""],
    ["action_type", "varchar", "varchar(255)", "NO", null, "", "攻擊類型"],
    ["damage", "int", "int", "NO", null, "", "傷害"],
    ["cost", "int", "int", "NO", "0", "", ""],
    ["created_at", "timestamp", "timestamp", "YES", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED", ""],
  ],
  world_boss_event: [
    ["id", "int", "int unsigned", "NO", null, "AUTO_INCREMENT", ""],
    ["world_boss_id", "int", "int", "NO", null, "", ""],
    ["announcement", "varchar", "varchar(255)", "NO", null, "", ""],
    ["start_time", "timestamp", "timestamp", "NO", null, "", ""],
    ["end_time", "timestamp", "timestamp", "NO", null, "", ""],
    ["created_at", "timestamp", "timestamp", "YES", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED", ""],
    ["updated_at", "timestamp", "timestamp", "YES", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED", ""],
  ],
  world_boss_user_attack_message: [
    ["id", "int", "int unsigned", "NO", null, "AUTO_INCREMENT", ""],
    ["icon_url", "varchar", "varchar(255)", "YES", null, "", "頭像 uri"],
    ["template", "varchar", "varchar(255)", "NO", null, "", "訊息樣板"],
    ["creator_id", "int", "int", "NO", null, "", "建立者 id"],
    ["created_at", "timestamp", "timestamp", "YES", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED", ""],
    ["updated_at", "timestamp", "timestamp", "YES", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED", ""],
  ],
  world_boss: [
    ["id", "int", "int unsigned", "NO", null, "AUTO_INCREMENT", ""],
    ["name", "varchar", "varchar(255)", "NO", null, "", ""],
    ["description", "varchar", "varchar(255)", "YES", null, "", ""],
    ["image", "varchar", "varchar(255)", "YES", null, "", ""],
    ["level", "int", "int", "NO", null, "", ""],
    ["hp", "int", "int", "NO", null, "", ""],
    ["attack", "int", "int", "NO", "0", "", ""],
    ["defense", "int", "int", "NO", "0", "", ""],
    ["speed", "int", "int", "NO", "0", "", ""],
    ["luck", "int", "int", "NO", "0", "", ""],
    ["exp", "int", "int", "NO", null, "", ""],
    ["gold", "int", "int", "NO", null, "", ""],
    ["created_at", "timestamp", "timestamp", "YES", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED", ""],
    ["updated_at", "timestamp", "timestamp", "YES", "CURRENT_TIMESTAMP", "DEFAULT_GENERATED", ""],
  ],
};

function hasExactlyKeys(actualKeys, expectedKeys) {
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function normalizeColumnDefault(value) {
  if (value === null) {
    return null;
  }

  const normalized = String(value).trim().toUpperCase().replace(/\s+/g, "");
  if (/^CURRENT_TIMESTAMP(?:\(0?\))?$/.test(normalized)) {
    return "CURRENT_TIMESTAMP";
  }
  return String(value);
}

function normalizeColumnExtra(value, columnDefault) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  if (columnDefault === "CURRENT_TIMESTAMP" && ["", "DEFAULT_GENERATED"].includes(normalized)) {
    return "DEFAULT_GENERATED";
  }
  return normalized;
}

function normalizeV1Column(column) {
  const columnDefault = normalizeColumnDefault(column.columnDefault);
  return [
    column.columnName,
    column.dataType.toLowerCase(),
    column.columnType.toLowerCase().replace(/\s+/g, " "),
    column.isNullable.toUpperCase(),
    columnDefault,
    normalizeColumnExtra(column.extra, columnDefault),
    column.columnComment,
  ];
}

async function assertExactV1TableSchemas(knex) {
  const columns = await knex("information_schema.columns")
    .select({
      tableName: "table_name",
      columnName: "column_name",
      dataType: "data_type",
      columnType: "column_type",
      isNullable: "is_nullable",
      columnDefault: "column_default",
      extra: "extra",
      columnComment: "column_comment",
    })
    .whereRaw("table_schema = DATABASE()")
    .whereIn("table_name", V1_TABLES)
    .orderBy("table_name")
    .orderBy("ordinal_position");

  for (const tableName of V1_TABLES) {
    const actual = columns.filter(column => column.tableName === tableName).map(normalizeV1Column);
    if (JSON.stringify(actual) !== JSON.stringify(V1_TABLE_COLUMNS[tableName])) {
      throw new Error(`Cannot teardown v1 World Boss: ${tableName} schema does not match v1.`);
    }
  }
}

async function assertInnoDbV1Tables(knex) {
  const tableEngines = await knex("information_schema.tables")
    .select({ tableName: "table_name", engine: "engine" })
    .whereRaw("table_schema = DATABASE()")
    .whereIn("table_name", V1_TABLES);
  const allV1TablesMissing = tableEngines.length === 0;
  const nonInnoDbTables = tableEngines.filter(table => table.engine !== "InnoDB");

  if (!allV1TablesMissing && tableEngines.length !== V1_TABLES.length) {
    throw new Error("Cannot teardown v1 World Boss: all v1 tables must exist.");
  }
  if (nonInnoDbTables.length) {
    throw new Error("Cannot teardown v1 World Boss: all v1 tables must use InnoDB.");
  }

  return { allV1TablesMissing };
}

async function getV1TeardownState(knex) {
  const expectedAchievementKeys = [...V1_ACHIEVEMENT_KEYS].sort();
  const expectedTitleKeys = [...V1_TITLE_KEYS].sort();
  const category = await knex("achievement_categories").where({ key: "world_boss" }).first("id");
  const achievementKeys = await knex("achievements")
    .whereIn("key", V1_ACHIEVEMENT_KEYS)
    .orderBy("key")
    .pluck("key");
  const titleKeys = await knex("titles").whereIn("key", V1_TITLE_KEYS).orderBy("key").pluck("key");

  if (!category) {
    if (!achievementKeys.length && !titleKeys.length) {
      return { metadataAlreadyPurged: true };
    }
    throw new Error("Cannot teardown v1 World Boss: v1 metadata is partially removed.");
  }

  const categoryAchievementKeys = await knex("achievements")
    .where({ category_id: category.id })
    .orderBy("key")
    .pluck("key");
  if (
    !hasExactlyKeys(categoryAchievementKeys, expectedAchievementKeys) ||
    !hasExactlyKeys(achievementKeys, expectedAchievementKeys) ||
    !hasExactlyKeys(titleKeys, expectedTitleKeys)
  ) {
    throw new Error("Cannot teardown v1 World Boss: world_boss metadata does not match v1.");
  }

  return { metadataAlreadyPurged: false };
}

async function createV1TableIfMissing(knex, tableName, createTable) {
  if (!(await knex.schema.hasTable(tableName))) {
    await knex.schema.createTable(tableName, createTable);
  }
}

async function createV1Tables(knex) {
  await createV1TableIfMissing(knex, "world_boss", table => {
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
  });
  await createV1TableIfMissing(knex, "world_boss_event", table => {
    table.increments("id").primary();
    table.integer("world_boss_id").notNullable();
    table.string("announcement").notNullable();
    table.timestamp("start_time").notNullable();
    table.timestamp("end_time").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
  await createV1TableIfMissing(knex, "world_boss_event_log", table => {
    table.increments("id").primary();
    table.integer("world_boss_event_id").notNullable();
    table.integer("user_id").notNullable();
    table.string("action_type").notNullable().comment("攻擊類型");
    table.integer("damage").notNullable().comment("傷害");
    table.integer("cost").notNullable().defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await createV1TableIfMissing(knex, "world_boss_user_attack_message", table => {
    table.increments("id").primary();
    table.string("icon_url").comment("頭像 uri");
    table.string("template").notNullable().comment("訊息樣板");
    table.integer("creator_id").notNullable().comment("建立者 id");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
  await createV1TableIfMissing(knex, "attack_message_has_tags", table => {
    table.increments("id").primary();
    table.integer("attack_message_id").unsigned().notNullable();
    table.string("tag").notNullable();
  });
}

exports.config = { transaction: false };

exports.up = async knex => {
  await knex.transaction(async trx => {
    const { allV1TablesMissing } = await assertInnoDbV1Tables(trx);
    if (!allV1TablesMissing) {
      await assertExactV1TableSchemas(trx);
    }
    const { metadataAlreadyPurged } = await getV1TeardownState(trx);

    if (allV1TablesMissing && !metadataAlreadyPurged) {
      throw new Error("Cannot teardown v1 World Boss: v1 tables and metadata are inconsistent.");
    }
    if (metadataAlreadyPurged) {
      return;
    }

    const achievementIds = (
      await trx("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS).select("id")
    ).map(row => row.id);
    await trx("user_achievement_progress").whereIn("achievement_id", achievementIds).del();
    await trx("user_achievements").whereIn("achievement_id", achievementIds).del();
    await trx("achievements").whereIn("id", achievementIds).del();
    await trx("achievement_categories").where({ key: "world_boss" }).del();

    const titleIds = (await trx("titles").whereIn("key", V1_TITLE_KEYS).select("id")).map(
      row => row.id
    );
    await trx("user_titles").whereIn("title_id", titleIds).del();
    await trx("titles").whereIn("id", titleIds).del();
  });

  await knex.raw(DROP_V1_TABLES_SQL);
};

exports.down = async knex => {
  // Restores schema only. Deleted v1 rows are not restored.
  await createV1Tables(knex);
};
