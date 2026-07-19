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

function hasExactlyKeys(actualKeys, expectedKeys) {
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

async function assertInnoDbV1Tables(knex) {
  const tableEngines = await knex("information_schema.tables")
    .select({ tableName: "table_name", engine: "engine" })
    .whereRaw("table_schema = DATABASE()")
    .whereIn("table_name", V1_TABLES);
  const nonInnoDbTables = tableEngines.filter(table => table.engine !== "InnoDB");

  if (nonInnoDbTables.length) {
    throw new Error("Cannot teardown v1 World Boss: all v1 tables must use InnoDB.");
  }
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
    await assertInnoDbV1Tables(trx);
    const { metadataAlreadyPurged } = await getV1TeardownState(trx);

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
