const crypto = require("crypto");
const knex = require("knex");

const dbConfig = require("../../knexfile");
const migration = require("../../migrations/20260719171943_drop_world_boss_v1");

const metadataMigrations = [
  require("../../migrations/20260416072625_create_achievement_categories_table"),
  require("../../migrations/20260416072628_create_achievements_table"),
  require("../../migrations/20260416072631_create_user_achievements_table"),
  require("../../migrations/20260416072635_create_user_achievement_progress_table"),
  require("../../migrations/20260416072638_create_titles_table"),
  require("../../migrations/20260416072644_create_user_titles_table"),
  require("../../migrations/20260417154659_add_achievement_condition_and_notify"),
];
const legacyMigrations = [
  require("../../migrations/20211019082725_create_world_boss"),
  require("../../migrations/20211019082811_create_world_boss_event"),
  require("../../migrations/20211019095909_create_world_boss_event_log"),
  require("../../migrations/20211023175905_create_world_boss_message"),
  require("../../migrations/20211218035345_add_world_boss_default_value"),
  require("../../migrations/20240904042536_add_cost_column_to_world_boss_event_log_table"),
  require("../../migrations/20240916025031_create_attack_message_has_tags_table"),
];

const V1_TABLES = [
  "attack_message_has_tags",
  "world_boss_event_log",
  "world_boss_event",
  "world_boss_user_attack_message",
  "world_boss",
];
const V1_ACHIEVEMENT_KEYS = [
  "boss_first_kill",
  "boss_level_10",
  "boss_level_50",
  "boss_top_damage",
];
const V1_TITLE_KEYS = ["progressors", "leechers"];
const FIXTURE_TABLES = [
  ...V1_TABLES,
  "achievement_categories",
  "achievements",
  "user_achievements",
  "user_achievement_progress",
  "titles",
  "user_titles",
];
const UNRELATED_ACHIEVEMENT_KEY = "__wbtest_unrelated_achievement";
const UNRELATED_TITLE_KEY = "__wbtest_unrelated_title";
const TEST_DATABASE = `Princess_wbtest_${process.pid}_${Date.now().toString(36)}_${crypto
  .randomBytes(4)
  .toString("hex")}`;
const adminConfig = {
  ...dbConfig,
  connection: {
    ...dbConfig.connection,
    user: "root",
    password: process.env.DB_PASSWORD,
  },
};
delete adminConfig.connection.database;

const admin = knex(adminConfig);
let database;
let expectedLegacyCreateSql;
let fixtureIds;

jest.setTimeout(120000);

async function createSchema(migrations) {
  for (const schemaMigration of migrations) {
    await schemaMigration.up(database);
  }
}

async function captureLegacyCreateSql() {
  const result = {};
  for (const table of V1_TABLES) {
    const [rows] = await database.raw(`SHOW CREATE TABLE \`${table}\``);
    result[table] = rows[0]["Create Table"];
  }
  return result;
}

async function seedLegacyRows() {
  const [worldBossId] = await database("world_boss").insert({
    name: "__wbtest_legacy_boss",
    description: "__wbtest_legacy_description",
    image: "__wbtest_legacy_image",
    level: 1,
    hp: 100,
    exp: 10,
    gold: 20,
  });
  const [eventId] = await database("world_boss_event").insert({
    world_boss_id: worldBossId,
    announcement: "__wbtest_legacy_announcement",
    start_time: new Date("2026-01-01T00:00:00.000Z"),
    end_time: new Date("2026-01-02T00:00:00.000Z"),
  });
  await database("world_boss_event_log").insert({
    world_boss_event_id: eventId,
    user_id: 1,
    action_type: "__wbtest_attack",
    damage: 10,
    cost: 5,
  });
  const [attackMessageId] = await database("world_boss_user_attack_message").insert({
    icon_url: "__wbtest_icon",
    template: "__wbtest_template",
    creator_id: 1,
  });
  await database("attack_message_has_tags").insert({
    attack_message_id: attackMessageId,
    tag: "__wbtest_tag",
  });
}

async function seedMetadata() {
  const [worldBossCategoryId] = await database("achievement_categories").insert({
    key: "world_boss",
    name: "__wbtest_world_boss_category",
    icon: "W",
  });
  const [unrelatedCategoryId] = await database("achievement_categories").insert({
    key: "__wbtest_unrelated_category",
    name: "__wbtest_unrelated_category",
    icon: "U",
  });

  for (const key of V1_ACHIEVEMENT_KEYS) {
    const [achievementId] = await database("achievements").insert({
      category_id: worldBossCategoryId,
      key,
      name: `__wbtest_${key}`,
      description: `__wbtest_${key}_description`,
      icon: "W",
      type: "challenge",
    });
    await database("user_achievements").insert({
      user_id: `__wbtest_${key}`,
      achievement_id: achievementId,
    });
    await database("user_achievement_progress").insert({
      user_id: `__wbtest_${key}`,
      achievement_id: achievementId,
      current_value: 1,
    });
  }

  const [unrelatedAchievementId] = await database("achievements").insert({
    category_id: unrelatedCategoryId,
    key: UNRELATED_ACHIEVEMENT_KEY,
    name: UNRELATED_ACHIEVEMENT_KEY,
    description: `${UNRELATED_ACHIEVEMENT_KEY}_description`,
    icon: "U",
    type: "challenge",
  });
  await database("user_achievements").insert({
    user_id: "__wbtest_unrelated_achievement_owner",
    achievement_id: unrelatedAchievementId,
  });
  await database("user_achievement_progress").insert({
    user_id: "__wbtest_unrelated_achievement_owner",
    achievement_id: unrelatedAchievementId,
    current_value: 2,
  });

  const titleIds = {};
  for (const key of V1_TITLE_KEYS) {
    const [titleId] = await database("titles").insert({
      key,
      name: `__wbtest_${key}`,
      description: `__wbtest_${key}_description`,
      icon: "W",
    });
    titleIds[key] = titleId;
    await database("user_titles").insert({
      user_id: `__wbtest_${key}`,
      title_id: titleId,
    });
  }

  const [unrelatedTitleId] = await database("titles").insert({
    key: UNRELATED_TITLE_KEY,
    name: UNRELATED_TITLE_KEY,
    description: `${UNRELATED_TITLE_KEY}_description`,
    icon: "U",
  });
  await database("user_titles").insert({
    user_id: "__wbtest_unrelated_title_owner",
    title_id: unrelatedTitleId,
  });

  return {
    unrelatedAchievementId,
    unrelatedCategoryId,
    unrelatedTitleId,
    worldBossCategoryId,
  };
}

async function deleteV1MetadataDependencies() {
  await database("user_achievement_progress")
    .whereIn("achievement_id", function () {
      this.select("id").from("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS);
    })
    .del();
  await database("user_achievements")
    .whereIn("achievement_id", function () {
      this.select("id").from("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS);
    })
    .del();
  await database("user_titles")
    .whereIn("title_id", function () {
      this.select("id").from("titles").whereIn("key", V1_TITLE_KEYS);
    })
    .del();
}

async function recreateDatabase() {
  if (database) {
    await database.destroy();
    database = undefined;
  }
  await admin.raw(`DROP DATABASE IF EXISTS \`${TEST_DATABASE}\``);
  await admin.raw(
    `CREATE DATABASE \`${TEST_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
  );
  database = knex({
    ...dbConfig,
    connection: { ...adminConfig.connection, database: TEST_DATABASE },
  });
  await createSchema(metadataMigrations);
  await createSchema(legacyMigrations);
  expectedLegacyCreateSql = await captureLegacyCreateSql();
  await seedLegacyRows();
  fixtureIds = await seedMetadata();
}

async function expectNoV1Tables() {
  for (const table of V1_TABLES) {
    await expect(database.schema.hasTable(table)).resolves.toBe(false);
  }
}

async function snapshotFixtureState() {
  const createSql = {};
  const rows = {};
  for (const table of FIXTURE_TABLES) {
    if (!(await database.schema.hasTable(table))) {
      createSql[table] = null;
      rows[table] = null;
      continue;
    }
    const [createRows] = await database.raw(`SHOW CREATE TABLE \`${table}\``);
    createSql[table] = createRows[0]["Create Table"];
    rows[table] = await database(table).select("*").orderBy("id");
  }
  return { createSql, rows };
}

async function expectFixtureStateUnchanged(expected) {
  await expect(snapshotFixtureState()).resolves.toEqual(expected);
}

beforeEach(async () => {
  await recreateDatabase();
});

afterAll(async () => {
  try {
    if (database) {
      await database.destroy();
      database = undefined;
    }
  } finally {
    try {
      await admin.raw(`DROP DATABASE IF EXISTS \`${TEST_DATABASE}\``);
    } finally {
      await admin.destroy();
    }
  }
});

test("up removes only v1 metadata and dependencies before dropping the five legacy tables", async () => {
  await expect(migration.up(database)).resolves.toBeUndefined();

  await expectNoV1Tables();
  await expect(
    database("achievement_categories").where({ key: "world_boss" })
  ).resolves.toHaveLength(0);
  await expect(database("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS)).resolves.toHaveLength(
    0
  );
  await expect(database("titles").whereIn("key", V1_TITLE_KEYS)).resolves.toHaveLength(0);
  await expect(
    database("user_achievements").whereNot({ achievement_id: fixtureIds.unrelatedAchievementId })
  ).resolves.toHaveLength(0);
  await expect(
    database("user_achievement_progress").whereNot({
      achievement_id: fixtureIds.unrelatedAchievementId,
    })
  ).resolves.toHaveLength(0);
  await expect(
    database("user_titles").whereNot({ title_id: fixtureIds.unrelatedTitleId })
  ).resolves.toHaveLength(0);

  await expect(
    database("achievement_categories")
      .where({ id: fixtureIds.unrelatedCategoryId, key: "__wbtest_unrelated_category" })
      .first()
  ).resolves.toBeDefined();
  await expect(
    database("achievements")
      .where({ id: fixtureIds.unrelatedAchievementId, key: UNRELATED_ACHIEVEMENT_KEY })
      .first()
  ).resolves.toBeDefined();
  await expect(
    database("user_achievements")
      .where({ achievement_id: fixtureIds.unrelatedAchievementId })
      .first()
  ).resolves.toBeDefined();
  await expect(
    database("user_achievement_progress")
      .where({ achievement_id: fixtureIds.unrelatedAchievementId })
      .first()
  ).resolves.toBeDefined();
  await expect(
    database("titles").where({ id: fixtureIds.unrelatedTitleId, key: UNRELATED_TITLE_KEY }).first()
  ).resolves.toBeDefined();
  await expect(
    database("user_titles").where({ title_id: fixtureIds.unrelatedTitleId }).first()
  ).resolves.toBeDefined();

  await expect(migration.up(database)).resolves.toBeUndefined();
  await expectNoV1Tables();
  await expect(
    database("achievements").where({ id: fixtureIds.unrelatedAchievementId }).first()
  ).resolves.toBeDefined();
  await expect(
    database("titles").where({ id: fixtureIds.unrelatedTitleId }).first()
  ).resolves.toBeDefined();
});

const metadataDriftCases = [
  {
    name: "missing expected achievement",
    mutate: () => database("achievements").where({ key: V1_ACHIEVEMENT_KEYS[0] }).del(),
  },
  {
    name: "extra category achievement",
    mutate: () =>
      database("achievements").insert({
        category_id: fixtureIds.worldBossCategoryId,
        key: "__wbtest_extra_world_boss_achievement",
        name: "__wbtest_extra_world_boss_achievement",
        description: "__wbtest_extra_world_boss_achievement_description",
        icon: "E",
        type: "challenge",
      }),
  },
  {
    name: "wrong expected achievement category",
    mutate: () =>
      database("achievements")
        .where({ key: V1_ACHIEVEMENT_KEYS[0] })
        .update({ category_id: fixtureIds.unrelatedCategoryId }),
  },
  {
    name: "missing expected title",
    mutate: () => database("titles").where({ key: V1_TITLE_KEYS[0] }).del(),
  },
  {
    name: "missing world_boss category with owned keys remaining",
    mutate: async () => {
      await database("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS).del();
      await database("achievement_categories").where({ id: fixtureIds.worldBossCategoryId }).del();
      await database("achievements").insert({
        category_id: fixtureIds.unrelatedCategoryId,
        key: V1_ACHIEVEMENT_KEYS[0],
        name: "__wbtest_partial_metadata",
        description: "__wbtest_partial_metadata_description",
        icon: "P",
        type: "challenge",
      });
    },
  },
  {
    name: "world_boss category with all owned metadata removed",
    expectedMessage: "Cannot teardown v1 World Boss: world_boss metadata does not match v1.",
    mutate: async () => {
      await database("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS).del();
      await database("titles").whereIn("key", V1_TITLE_KEYS).del();
    },
  },
];

test.each(metadataDriftCases)(
  "metadata preflight rejects $name without mutating any table or row",
  async ({ expectedMessage, mutate }) => {
    await deleteV1MetadataDependencies();
    await mutate();
    const before = await snapshotFixtureState();

    await expect(migration.up(database)).rejects.toThrow(
      expectedMessage || /Cannot teardown v1 World Boss:/
    );

    await expectFixtureStateUnchanged(before);
  }
);

const tableSchemaDriftCases = [
  {
    name: "missing column",
    mutate: () => database.raw("ALTER TABLE `world_boss` DROP COLUMN `luck`"),
  },
  {
    name: "extra column",
    mutate: () =>
      database.raw("ALTER TABLE `world_boss` ADD COLUMN `legacy_drift` INT NULL AFTER `luck`"),
  },
  {
    name: "wrong column type",
    mutate: () => database.raw("ALTER TABLE `world_boss` MODIFY COLUMN `hp` BIGINT NOT NULL"),
  },
  {
    name: "wrong column default",
    mutate: () => database.raw("ALTER TABLE `world_boss` ALTER COLUMN `attack` SET DEFAULT 7"),
  },
  {
    name: "wrong historical column comment",
    mutate: () =>
      database.raw(
        "ALTER TABLE `world_boss_event_log` MODIFY COLUMN `action_type` VARCHAR(255) NOT NULL COMMENT 'drifted'"
      ),
  },
];

test.each(tableSchemaDriftCases)(
  "table schema preflight rejects $name without mutating metadata or legacy tables",
  async ({ mutate }) => {
    await mutate();
    const before = await snapshotFixtureState();

    await expect(migration.up(database)).rejects.toThrow(
      /Cannot teardown v1 World Boss: .*schema does not match v1/
    );

    await expectFixtureStateUnchanged(before);
  }
);

test.each([1, 2, 3, 4])(
  "%i of five legacy tables present is rejected before metadata deletion or remaining table drops",
  async presentTableCount => {
    for (const table of V1_TABLES.slice(presentTableCount)) {
      await database.schema.dropTable(table);
    }
    const before = await snapshotFixtureState();

    await expect(migration.up(database)).rejects.toThrow(
      "Cannot teardown v1 World Boss: all v1 tables must exist."
    );

    await expectFixtureStateUnchanged(before);
  }
);

const zeroTableMetadataDriftCases = [
  {
    name: "intact v1 metadata",
    expectedMessage: "Cannot teardown v1 World Boss: v1 tables and metadata are inconsistent.",
    mutate: async () => {},
  },
  {
    name: "missing expected achievement",
    expectedMessage: "Cannot teardown v1 World Boss: world_boss metadata does not match v1.",
    mutate: async () => {
      await deleteV1MetadataDependencies();
      await database("achievements").where({ key: V1_ACHIEVEMENT_KEYS[0] }).del();
    },
  },
  {
    name: "extra category achievement",
    expectedMessage: "Cannot teardown v1 World Boss: world_boss metadata does not match v1.",
    mutate: () =>
      database("achievements").insert({
        category_id: fixtureIds.worldBossCategoryId,
        key: "__wbtest_zero_table_extra_achievement",
        name: "__wbtest_zero_table_extra_achievement",
        description: "__wbtest_zero_table_extra_achievement_description",
        icon: "E",
        type: "challenge",
      }),
  },
  {
    name: "wrong expected achievement category",
    expectedMessage: "Cannot teardown v1 World Boss: world_boss metadata does not match v1.",
    mutate: () =>
      database("achievements")
        .where({ key: V1_ACHIEVEMENT_KEYS[0] })
        .update({ category_id: fixtureIds.unrelatedCategoryId }),
  },
  {
    name: "missing expected title",
    expectedMessage: "Cannot teardown v1 World Boss: world_boss metadata does not match v1.",
    mutate: async () => {
      await deleteV1MetadataDependencies();
      await database("titles").where({ key: V1_TITLE_KEYS[0] }).del();
    },
  },
  {
    name: "missing world_boss category with owned keys remaining",
    expectedMessage: "Cannot teardown v1 World Boss: v1 metadata is partially removed.",
    mutate: async () => {
      await deleteV1MetadataDependencies();
      await database("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS).del();
      await database("achievement_categories").where({ id: fixtureIds.worldBossCategoryId }).del();
      await database("achievements").insert({
        category_id: fixtureIds.unrelatedCategoryId,
        key: V1_ACHIEVEMENT_KEYS[0],
        name: "__wbtest_zero_table_partial_metadata",
        description: "__wbtest_zero_table_partial_metadata_description",
        icon: "P",
        type: "challenge",
      });
    },
  },
  {
    name: "world_boss category with all owned metadata removed",
    expectedMessage: "Cannot teardown v1 World Boss: world_boss metadata does not match v1.",
    mutate: async () => {
      await deleteV1MetadataDependencies();
      await database("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS).del();
      await database("titles").whereIn("key", V1_TITLE_KEYS).del();
    },
  },
];

test.each(zeroTableMetadataDriftCases)(
  "zero legacy tables with $name is rejected without mutating metadata",
  async ({ expectedMessage, mutate }) => {
    await database.raw(`DROP TABLE ${V1_TABLES.map(table => `\`${table}\``).join(", ")}`);
    await mutate();
    const before = await snapshotFixtureState();

    await expect(migration.up(database)).rejects.toThrow(expectedMessage);

    await expectFixtureStateUnchanged(before);
  }
);

test("zero legacy tables with fully purged v1 metadata is an unchanged no-op", async () => {
  await database.raw(`DROP TABLE ${V1_TABLES.map(table => `\`${table}\``).join(", ")}`);
  await deleteV1MetadataDependencies();
  await database("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS).del();
  await database("achievement_categories").where({ id: fixtureIds.worldBossCategoryId }).del();
  await database("titles").whereIn("key", V1_TITLE_KEYS).del();
  const before = await snapshotFixtureState();

  await expect(migration.up(database)).resolves.toBeUndefined();

  await expectFixtureStateUnchanged(before);
});

test("metadata transaction rolls back all deletes when a dependency rejects the purge", async () => {
  await database.schema.createTable("__wbtest_title_dependency", table => {
    table.increments("id").primary();
    table.integer("title_id").unsigned().notNullable();
    table.foreign("title_id").references("titles.id").onDelete("RESTRICT");
  });
  const [progressors] = await database("titles").where({ key: V1_TITLE_KEYS[0] }).select("id");
  await database("__wbtest_title_dependency").insert({ title_id: progressors.id });
  const before = await snapshotFixtureState();
  const beforeDependency = await database("__wbtest_title_dependency").select("*").orderBy("id");

  await expect(migration.up(database)).rejects.toMatchObject({ code: "ER_ROW_IS_REFERENCED_2" });

  await expectFixtureStateUnchanged(before);
  await expect(database("__wbtest_title_dependency").select("*").orderBy("id")).resolves.toEqual(
    beforeDependency
  );
  for (const table of V1_TABLES) {
    await expect(database.schema.hasTable(table)).resolves.toBe(true);
  }
});

test("failed atomic DROP leaves every legacy table but does not roll back committed metadata deletes", async () => {
  await database.schema.createTable("__wbtest_world_boss_dependency", table => {
    table.increments("id").primary();
    table.integer("world_boss_id").unsigned().notNullable();
    table.foreign("world_boss_id").references("world_boss.id").onDelete("RESTRICT");
  });
  const worldBoss = await database("world_boss").first("id");
  await database("__wbtest_world_boss_dependency").insert({ world_boss_id: worldBoss.id });

  await expect(migration.up(database)).rejects.toMatchObject({ code: "ER_FK_CANNOT_DROP_PARENT" });

  for (const table of V1_TABLES) {
    await expect(database.schema.hasTable(table)).resolves.toBe(true);
  }
  await expect(
    database("achievement_categories").where({ key: "world_boss" })
  ).resolves.toHaveLength(0);
  await expect(database("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS)).resolves.toHaveLength(
    0
  );
  await expect(database("titles").whereIn("key", V1_TITLE_KEYS)).resolves.toHaveLength(0);
  await expect(
    database("achievements").where({ id: fixtureIds.unrelatedAchievementId }).first()
  ).resolves.toBeDefined();
  await expect(
    database("titles").where({ id: fixtureIds.unrelatedTitleId }).first()
  ).resolves.toBeDefined();

  await database.schema.dropTable("__wbtest_world_boss_dependency");
  await expect(migration.up(database)).resolves.toBeUndefined();
  await expectNoV1Tables();
});

test("non-InnoDB legacy table is rejected before metadata or table mutation", async () => {
  await database.raw("ALTER TABLE `attack_message_has_tags` ENGINE = MyISAM");
  const [engineRows] = await database.raw(
    "SELECT ENGINE FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'attack_message_has_tags'"
  );
  expect(engineRows[0].ENGINE).toBe("MyISAM");
  const before = await snapshotFixtureState();

  await expect(migration.up(database)).rejects.toThrow(
    "Cannot teardown v1 World Boss: all v1 tables must use InnoDB."
  );

  await expectFixtureStateUnchanged(before);
});

test("down restores the exact empty final v1 schemas and is replay-safe without restoring rows", async () => {
  await migration.up(database);

  await expect(migration.down(database)).resolves.toBeUndefined();
  for (const table of V1_TABLES) {
    await expect(database(table)).resolves.toHaveLength(0);
  }
  await expect(captureLegacyCreateSql()).resolves.toEqual(expectedLegacyCreateSql);
  await expect(migration.down(database)).resolves.toBeUndefined();
  await expect(captureLegacyCreateSql()).resolves.toEqual(expectedLegacyCreateSql);
});

test("retry after committed metadata deletion drops all five tables without deleting unrelated rows", async () => {
  await database("user_achievement_progress")
    .whereNot({ achievement_id: fixtureIds.unrelatedAchievementId })
    .del();
  await database("user_achievements")
    .whereNot({ achievement_id: fixtureIds.unrelatedAchievementId })
    .del();
  await database("achievements").whereIn("key", V1_ACHIEVEMENT_KEYS).del();
  await database("achievement_categories").where({ id: fixtureIds.worldBossCategoryId }).del();
  await database("user_titles").whereNot({ title_id: fixtureIds.unrelatedTitleId }).del();
  await database("titles").whereIn("key", V1_TITLE_KEYS).del();

  await expect(migration.up(database)).resolves.toBeUndefined();

  await expectNoV1Tables();
  await expect(
    database("achievements").where({ id: fixtureIds.unrelatedAchievementId }).first()
  ).resolves.toBeDefined();
  await expect(
    database("titles").where({ id: fixtureIds.unrelatedTitleId }).first()
  ).resolves.toBeDefined();
});
