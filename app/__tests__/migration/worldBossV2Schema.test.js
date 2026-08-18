const knex = require("knex");

const dbConfig = require("../../knexfile");
const migration = require("../../migrations/20260719174434_create_world_boss_v2");
const foreignKeyMigration = require("../../migrations/20260720085307_add_world_boss_round_world_boss_foreign_key");
const seeder = require("../../seeds/WorldBossCatalogSeeder");
const config = require("../../config/default.json");

const TABLES = [
  "world_boss_season_reward",
  "world_boss_contribution",
  "world_boss_round",
  "world_boss_season_boss",
  "world_boss_season",
  "world_boss",
];
const TITLE_KEYS = ["worldboss_annihilator", "worldboss_vanguard"];
const COLLISION_KEY = TITLE_KEYS[0];
const SENTINEL_USER_ID = "__wbtest_title_owner";
const UNRELATED_TITLE_KEY = "__wbtest_unrelated_title";
const MAX_ORDER_TITLE_KEY = "__wbtest_max_order_title";
const UNRELATED_USER_ID = "__wbtest_unrelated_owner";
const MAX_ORDER_USER_ID = "__wbtest_max_order_owner";
const TEST_PREFIX = "__wbtest_";

const TEST_DATABASE = "Princess_worldboss_v2_test";
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

async function removeTestTitles() {
  const titles = await database("titles")
    .whereIn("key", [...TITLE_KEYS, UNRELATED_TITLE_KEY, MAX_ORDER_TITLE_KEY])
    .select("id");
  const ids = titles.map(title => title.id);
  if (ids.length) {
    await database("user_titles").whereIn("title_id", ids).del();
    await database("titles").whereIn("id", ids).del();
  }
}

async function resetV2Tables() {
  for (const table of TABLES) {
    await database.schema.dropTableIfExists(table);
  }
}

async function expectNoV2Tables() {
  for (const table of TABLES) {
    await expect(database.schema.hasTable(table)).resolves.toBe(false);
  }
}

beforeAll(async () => {
  await admin.raw(`DROP DATABASE IF EXISTS \`${TEST_DATABASE}\``);
  await admin.raw(
    `CREATE DATABASE \`${TEST_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
  );
  database = knex({
    ...dbConfig,
    connection: { ...adminConfig.connection, database: TEST_DATABASE },
  });
  await database.schema.createTable("titles", table => {
    table.increments("id").primary();
    table.string("key", 100).notNullable().unique();
    table.string("name", 100).notNullable();
    table.string("description", 255).notNullable();
    table.string("icon", 100).notNullable();
    table.tinyint("rarity").notNullable().defaultTo(0);
    table.tinyint("order").notNullable().defaultTo(0);
    table.timestamps(true, true);
  });
  await database.schema.createTable("user_titles", table => {
    table.increments("id").primary();
    table.string("user_id", 50).notNullable();
    table.integer("title_id").unsigned().notNullable();
    table.timestamp("granted_at").notNullable().defaultTo(database.fn.now());
    table.unique(["user_id", "title_id"]);
    table.index("user_id");
    table.foreign("title_id").references("titles.id");
  });
});

beforeEach(async () => {
  await resetV2Tables();
  await removeTestTitles();
});

afterAll(async () => {
  try {
    if (database) {
      await resetV2Tables();
      await removeTestTitles();
      await database.destroy();
    }
  } finally {
    await admin.raw(`DROP DATABASE IF EXISTS \`${TEST_DATABASE}\``);
    await admin.destroy();
  }
});

test("reserved title collision aborts before DDL and preserves dependent data", async () => {
  const [titleId] = await database("titles").insert({
    key: COLLISION_KEY,
    name: "__wbtest_collision_title",
    description: "__wbtest_collision_description",
    icon: "T",
    rarity: 0,
    order: 0,
  });
  await database("user_titles").insert({ user_id: SENTINEL_USER_ID, title_id: titleId });

  await expect(migration.up(database)).rejects.toThrow(
    "WORLD_BOSS_TITLE_KEY_COLLISION:worldboss_annihilator"
  );

  await expectNoV2Tables();
  await expect(database("titles").where({ id: titleId }).first()).resolves.toBeDefined();
  await expect(
    database("user_titles").where({ user_id: SENTINEL_USER_ID, title_id: titleId }).first()
  ).resolves.toBeDefined();

  await database("user_titles").where({ user_id: SENTINEL_USER_ID, title_id: titleId }).del();
  await database("titles").where({ id: titleId }).del();
  await expect(migration.up(database)).resolves.toBeUndefined();
});

test("matching reserved title without v2 tables remains an up collision", async () => {
  const [titleId] = await database("titles").insert({
    key: COLLISION_KEY,
    name: "殲滅之王",
    description: "世界王賽季總傷害第 1 名",
    icon: "👑",
    rarity: 3,
    order: 1,
  });
  await database("user_titles").insert({ user_id: SENTINEL_USER_ID, title_id: titleId });

  await expect(migration.up(database)).rejects.toThrow(
    "WORLD_BOSS_TITLE_KEY_COLLISION:worldboss_annihilator"
  );

  await expectNoV2Tables();
  await expect(database("titles").where({ id: titleId }).first()).resolves.toBeDefined();
  await expect(
    database("user_titles").where({ user_id: SENTINEL_USER_ID, title_id: titleId }).first()
  ).resolves.toBeDefined();
});

test("title order exhaustion aborts before DDL and preserves dependent data", async () => {
  const [titleId] = await database("titles").insert({
    key: MAX_ORDER_TITLE_KEY,
    name: "__wbtest_max_order_title",
    description: "__wbtest_max_order_description",
    icon: "M",
    rarity: 0,
    order: 127,
  });
  await database("user_titles").insert({ user_id: MAX_ORDER_USER_ID, title_id: titleId });

  await expect(migration.up(database)).rejects.toThrow("WORLD_BOSS_TITLE_ORDER_EXHAUSTED");

  await expectNoV2Tables();
  await expect(database("titles").where({ id: titleId }).first()).resolves.toBeDefined();
  await expect(
    database("user_titles").where({ user_id: MAX_ORDER_USER_ID, title_id: titleId }).first()
  ).resolves.toBeDefined();
});

test("a roster row pins its boss and blocks catalog deletion once the follow-up FK lands", async () => {
  await migration.up(database);
  await foreignKeyMigration.up(database);

  const [bossId] = await database("world_boss").insert({
    name: `${TEST_PREFIX}pinned`,
    hp_weight: 1,
  });
  const [seasonId] = await database("world_boss_season").insert({
    name: `${TEST_PREFIX}pinned-season`,
    status: "draft",
    end_time: new Date("2030-01-01T00:00:00.000Z"),
  });
  await database("world_boss_season_boss").insert({
    season_id: seasonId,
    position: 1,
    world_boss_id: bossId,
    name: `${TEST_PREFIX}pinned`,
    hp_weight: 1,
  });

  await expect(database("world_boss").where({ id: bossId }).del()).rejects.toThrow();
  // Deleting the season cascades the roster, which then frees the boss.
  await expect(database("world_boss_season").where({ id: seasonId }).del()).resolves.toBe(1);
  await expect(database("world_boss_season_boss").where({ season_id: seasonId })).resolves.toEqual(
    []
  );
  await expect(database("world_boss").where({ id: bossId }).del()).resolves.toBe(1);
});

test("schema exposes every required enum, unique, index, and check constraint", async () => {
  await migration.up(database);

  const createSql = {};
  for (const table of TABLES) {
    const [rows] = await database.raw(`SHOW CREATE TABLE \`${table}\``);
    createSql[table] = rows[0]["Create Table"];
  }

  expect(createSql.world_boss).toContain("chk_wb_hp_weight_positive");
  expect(createSql.world_boss_season).toContain("enum('draft','active','settled')");
  expect(createSql.world_boss_season).toContain("uq_wbs_active_slot");
  expect(createSql.world_boss_season).toContain("idx_wbs_settleable");
  expect(createSql.world_boss_season).toContain("chk_wbs_active_slot_status");
  expect(createSql.world_boss_season).toContain("`active_slot` = 1");
  expect(createSql.world_boss_season_boss).toContain("uq_wbsb_season_position");
  expect(createSql.world_boss_season_boss).toContain("uq_wbsb_season_boss");
  expect(createSql.world_boss_season_boss).toContain("chk_wbsb_position_range");
  expect(createSql.world_boss_season_boss).toContain("chk_wbsb_hp_weight_positive");
  expect(createSql.world_boss_season_boss).toContain("`position` between 1 and 5");
  expect(createSql.world_boss_season_boss).toContain(
    "CONSTRAINT `fk_wbsb_season` FOREIGN KEY (`season_id`) REFERENCES `world_boss_season` (`id`) ON DELETE CASCADE"
  );
  expect(createSql.world_boss_round).toContain("uq_wbr_season_boss_cycle");
  expect(createSql.world_boss_round).toContain("chk_wbr_cycle_no_positive");
  expect(createSql.world_boss_round).toContain("`cycle_no` >= 1");
  expect(createSql.world_boss_round).toContain("chk_wbr_max_hp_positive");
  expect(createSql.world_boss_round).toContain("chk_wbr_current_lte_max");
  expect(createSql.world_boss_round).toContain("chk_wbr_cleared_consistency");
  expect(createSql.world_boss_round).toContain(
    "CONSTRAINT `fk_wbr_season_boss` FOREIGN KEY (`season_boss_id`) REFERENCES `world_boss_season_boss` (`id`) ON DELETE RESTRICT"
  );
  expect(createSql.world_boss_round).not.toContain("`round_no`");
  expect(createSql.world_boss_round).not.toContain("`active_slot`");
  expect(createSql.world_boss_round).not.toContain("`status`");
  expect(createSql.world_boss_contribution).toContain("idx_wbc_season_user");
  expect(createSql.world_boss_contribution).toContain("idx_wbc_round");
  expect(createSql.world_boss_contribution).toContain("idx_wbc_user_created");
  expect(createSql.world_boss_season_reward).toContain("uq_wbsr_season_user");
});

test("follow-up migration rejects orphaned roster rows before DDL and restricts boss deletion", async () => {
  await migration.up(database);

  const [seasonId] = await database("world_boss_season").insert({
    name: `${TEST_PREFIX}foreign-key-season`,
    status: "draft",
    end_time: new Date("2030-01-01T00:00:00.000Z"),
  });
  const orphanIds = [];
  for (let position = 1; position <= 5; position += 1) {
    const [id] = await database("world_boss_season_boss").insert({
      season_id: seasonId,
      position,
      world_boss_id: 999990 + position,
      name: `${TEST_PREFIX}orphan_${position}`,
      hp_weight: 1,
    });
    orphanIds.push(id);
  }
  const [beforeCreateRows] = await database.raw("SHOW CREATE TABLE `world_boss_season_boss`");
  const beforeCreate = beforeCreateRows[0]["Create Table"];
  const expectedSample = orphanIds.map((seasonBossId, index) => ({
    seasonBossId,
    worldBossId: 999991 + index,
  }));

  await expect(foreignKeyMigration.up(database)).rejects.toMatchObject({
    code: "WORLD_BOSS_SEASON_BOSS_ORPHANS",
    orphanCount: 5,
    orphanSample: expectedSample,
  });
  await expect(database("world_boss_season_boss").whereIn("id", orphanIds)).resolves.toHaveLength(
    5
  );
  const [afterCreateRows] = await database.raw("SHOW CREATE TABLE `world_boss_season_boss`");
  expect(afterCreateRows[0]["Create Table"]).toBe(beforeCreate);
  await expect(
    database("information_schema.STATISTICS")
      .where({
        TABLE_SCHEMA: TEST_DATABASE,
        TABLE_NAME: "world_boss_season_boss",
        INDEX_NAME: "idx_wbsb_world_boss",
      })
      .first()
  ).resolves.toBeFalsy();

  await database("world_boss_season_boss").whereIn("id", orphanIds).del();
  await expect(foreignKeyMigration.up(database)).resolves.toBeUndefined();

  const [constraint] = await database("information_schema.REFERENTIAL_CONSTRAINTS")
    .where({
      CONSTRAINT_SCHEMA: TEST_DATABASE,
      TABLE_NAME: "world_boss_season_boss",
      CONSTRAINT_NAME: "fk_wbsb_world_boss",
    })
    .select("UNIQUE_CONSTRAINT_NAME", "DELETE_RULE");
  expect(constraint).toMatchObject({ UNIQUE_CONSTRAINT_NAME: "PRIMARY", DELETE_RULE: "RESTRICT" });

  const [bossId] = await database("world_boss").insert({
    name: `${TEST_PREFIX}foreign-key-boss`,
    hp_weight: 1,
  });
  const [rosterId] = await database("world_boss_season_boss").insert({
    season_id: seasonId,
    position: 1,
    world_boss_id: bossId,
    name: `${TEST_PREFIX}foreign-key-boss`,
    hp_weight: 1,
  });

  await expect(database("world_boss").where({ id: bossId }).del()).rejects.toThrow();
  await expect(database("world_boss").where({ id: bossId }).first()).resolves.toBeDefined();
  await expect(
    database("world_boss_season_boss").where({ id: rosterId }).first()
  ).resolves.toBeDefined();

  await foreignKeyMigration.down(database);
  await expect(
    database("information_schema.REFERENTIAL_CONSTRAINTS")
      .where({
        CONSTRAINT_SCHEMA: TEST_DATABASE,
        TABLE_NAME: "world_boss_season_boss",
        CONSTRAINT_NAME: "fk_wbsb_world_boss",
      })
      .first()
  ).resolves.toBeFalsy();
  await expect(
    database("information_schema.STATISTICS")
      .where({
        TABLE_SCHEMA: TEST_DATABASE,
        TABLE_NAME: "world_boss_season_boss",
        INDEX_NAME: "idx_wbsb_world_boss",
      })
      .first()
  ).resolves.toBeFalsy();
});

test("database rejects invalid catalog, season, roster, and round rows", async () => {
  await migration.up(database);

  const [bossId] = await database("world_boss").insert({
    name: `${TEST_PREFIX}constraint-boss`,
    hp_weight: 1,
  });
  const [seasonId] = await database("world_boss_season").insert({
    name: `${TEST_PREFIX}constraint-season`,
    status: "draft",
    end_time: new Date("2030-01-01T00:00:00.000Z"),
  });

  await expect(database("world_boss").insert({ name: "bad", hp_weight: 0 })).rejects.toThrow();
  await expect(
    database("world_boss_season").insert({
      name: "bad draft",
      status: "draft",
      active_slot: 1,
      end_time: new Date("2030-01-01T00:00:00.000Z"),
    })
  ).rejects.toThrow();
  await expect(
    database("world_boss_season").insert({
      name: "bad active",
      status: "active",
      active_slot: null,
      end_time: new Date("2030-01-01T00:00:00.000Z"),
    })
  ).rejects.toThrow();
  await expect(
    database("world_boss_season").insert({
      name: "bad active slot",
      status: "active",
      active_slot: 2,
      end_time: new Date("2030-01-01T00:00:00.000Z"),
    })
  ).rejects.toThrow();
  await expect(
    database("world_boss_season").insert({
      name: "bad enum",
      status: "scheduled",
      end_time: new Date("2030-01-01T00:00:00.000Z"),
    })
  ).rejects.toThrow();

  const roster = {
    season_id: seasonId,
    position: 1,
    world_boss_id: bossId,
    name: `${TEST_PREFIX}roster`,
    hp_weight: 1,
  };
  await expect(
    database("world_boss_season_boss").insert({ ...roster, position: 0 })
  ).rejects.toThrow();
  await expect(
    database("world_boss_season_boss").insert({ ...roster, position: 6 })
  ).rejects.toThrow();
  await expect(
    database("world_boss_season_boss").insert({ ...roster, hp_weight: 0 })
  ).rejects.toThrow();
  const [rosterId] = await database("world_boss_season_boss").insert(roster);
  // Same position twice in one season, and the same boss twice in one season.
  await expect(database("world_boss_season_boss").insert(roster)).rejects.toThrow();
  await expect(
    database("world_boss_season_boss").insert({ ...roster, position: 2 })
  ).rejects.toThrow();

  const round = { season_boss_id: rosterId, cycle_no: 1, max_hp: 10, current_hp: 10 };
  await expect(database("world_boss_round").insert({ ...round, cycle_no: 0 })).rejects.toThrow();
  await expect(
    database("world_boss_round").insert({ ...round, max_hp: 0, current_hp: 0 })
  ).rejects.toThrow();
  await expect(database("world_boss_round").insert({ ...round, current_hp: 11 })).rejects.toThrow();
  // cleared_at must agree with current_hp = 0 in both directions.
  await expect(
    database("world_boss_round").insert({ ...round, cleared_at: new Date() })
  ).rejects.toThrow();
  await expect(
    database("world_boss_round").insert({ ...round, current_hp: 0, cleared_at: null })
  ).rejects.toThrow();
  await expect(
    database("world_boss_round").insert({ ...round, season_boss_id: 999999999 })
  ).rejects.toThrow();
  await expect(database("world_boss_round").insert(round)).resolves.toBeDefined();
  // UNIQUE(season_boss_id, cycle_no) is the anti-duplicate guard for a cycle.
  await expect(database("world_boss_round").insert(round)).rejects.toThrow();

  // Deleting a draft season cascades its roster away; rounds keep the roster pinned.
  await expect(database("world_boss_season").where({ id: seasonId }).del()).rejects.toThrow();
});

test("Taipei connection and session round-trip an exact JavaScript instant", async () => {
  await migration.up(database);
  const [timezoneRows] = await database.raw("SELECT @@session.time_zone AS session_tz");
  expect(timezoneRows[0].session_tz).toBe("+08:00");

  const instant = new Date("2026-07-19T12:34:56.000Z");
  const [id] = await database("world_boss_season").insert({
    name: "__wbtest_utc",
    status: "draft",
    end_time: instant,
  });

  const row = await database("world_boss_season").where({ id }).first("end_time");
  expect(row.end_time).toBeInstanceOf(Date);
  expect(row.end_time.toISOString()).toBe(instant.toISOString());
});

test("down removes owned titles and dependencies but preserves unrelated title data", async () => {
  await migration.up(database);
  const ownedTitles = await database("titles").whereIn("key", TITLE_KEYS).select("id", "key");
  expect(ownedTitles).toHaveLength(2);
  for (const title of ownedTitles) {
    await database("user_titles").insert({
      user_id: `${SENTINEL_USER_ID}_${title.key}`,
      title_id: title.id,
    });
  }

  const [unrelatedTitleId] = await database("titles").insert({
    key: UNRELATED_TITLE_KEY,
    name: "__wbtest_unrelated_title",
    description: "__wbtest_unrelated_description",
    icon: "U",
    rarity: 0,
    order: 0,
  });
  await database("user_titles").insert({
    user_id: UNRELATED_USER_ID,
    title_id: unrelatedTitleId,
  });

  await migration.down(database);

  await expectNoV2Tables();
  await expect(database("titles").whereIn("key", TITLE_KEYS)).resolves.toHaveLength(0);
  await expect(
    database("user_titles").whereIn(
      "user_id",
      ownedTitles.map(title => `${SENTINEL_USER_ID}_${title.key}`)
    )
  ).resolves.toHaveLength(0);
  await expect(
    database("titles").where({ id: unrelatedTitleId, key: UNRELATED_TITLE_KEY }).first()
  ).resolves.toBeDefined();
  await expect(
    database("user_titles")
      .where({ user_id: UNRELATED_USER_ID, title_id: unrelatedTitleId })
      .first()
  ).resolves.toBeDefined();
});

test("catalog seed preserves existing stable IDs and inserts missing catalog rows", async () => {
  await migration.up(database);
  await database("world_boss").insert({
    id: 1,
    name: "__wbtest_admin_boss",
    description: "__wbtest_admin_description",
    hp_weight: 2,
  });

  await seeder.seed(database);
  await seeder.seed(database);

  await expect(
    database("world_boss").whereIn("id", [1, 2, 3, 4, 5]).orderBy("id")
  ).resolves.toEqual([
    expect.objectContaining({ id: 1, name: "__wbtest_admin_boss", hp_weight: "2.000" }),
    expect.objectContaining({ id: 2, name: "深淵雙頭犬", hp_weight: "0.900" }),
    expect.objectContaining({ id: 3, name: "暴風飛龍", hp_weight: "1.100" }),
    expect.objectContaining({ id: 4, name: "冥府騎士", hp_weight: "1.250" }),
    expect.objectContaining({ id: 5, name: "潮汐海皇", hp_weight: "1.400" }),
  ]);
});

test("config and additive seed expose the exact accepted defaults", async () => {
  expect(config.worldboss).toEqual({
    daily_cost_limit: 100,
    attack_cooldown_seconds: 5,
    per_hit_exp: 120,
    hp_tiers: [
      { from_round: 1, base_hp: 30000, per_round: 15000 },
      { from_round: 11, base_hp: 200000, per_round: 40000 },
      { from_round: 31, base_hp: 1200000, per_round: 100000 },
      { from_round: 61, base_hp: 4500000, per_round: 200000 },
    ],
    season_rewards: [
      { min_rank: 1, max_rank: 1, stone: 100, title_key: "worldboss_annihilator" },
      { min_rank: 2, max_rank: 3, stone: 60, title_key: "worldboss_vanguard" },
      { min_rank: 4, max_rank: 10, stone: 30, title_key: null },
      { min_rank: 11, max_rank: 50, stone: 10, title_key: null },
    ],
  });
  expect(dbConfig.connection.timezone).toBe("+08:00");
  expect(seeder.buildRows()).toEqual([
    {
      id: 1,
      name: "山嶺巨像",
      description: "盤踞於蘭德索爾山脈的古老魔像。",
      hp_weight: 1,
      image: null,
    },
    {
      id: 2,
      name: "深淵雙頭犬",
      description: "來自地底裂縫的看門猛獸。",
      hp_weight: 0.9,
      image: null,
    },
    {
      id: 3,
      name: "暴風飛龍",
      description: "翼展遮天的暴風化身。",
      hp_weight: 1.1,
      image: null,
    },
    {
      id: 4,
      name: "冥府騎士",
      description: "披著破碎鎧甲的無言騎士。",
      hp_weight: 1.25,
      image: null,
    },
    {
      id: 5,
      name: "潮汐海皇",
      description: "自深海祭壇甦醒的水之支配者。",
      hp_weight: 1.4,
      image: null,
    },
  ]);
});
