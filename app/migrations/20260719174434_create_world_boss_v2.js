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
      "(`status` = 'active' AND `active_slot` IS NOT NULL AND `active_slot` = 1) OR (`status` <> 'active' AND `active_slot` IS NULL)",
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
      "(`status` = 'active' AND `active_slot` IS NOT NULL AND `active_slot` = 1) OR (`status` = 'cleared' AND `active_slot` IS NULL)",
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
  const titleIds = (await knex("titles").whereIn("key", TITLE_KEYS).select("id")).map(
    row => row.id
  );
  if (titleIds.length) await knex("user_titles").whereIn("title_id", titleIds).del();
  await knex("titles").whereIn("key", TITLE_KEYS).del();
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
