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
  "world_boss_season_boss",
  "world_boss_round",
  "world_boss_contribution",
  "world_boss_season_reward",
];
const DROP_ORDER = [...TABLES].reverse();
const MAX_TITLE_ORDER = 127;
const ROSTER_SIZE = 5;

async function preflightTitles(knex) {
  const existing = await knex("titles").whereIn("key", TITLE_KEYS);
  if (existing.length) {
    throw new Error(`WORLD_BOSS_TITLE_KEY_COLLISION:${existing.map(row => row.key).join(",")}`);
  }

  const { maxOrder } = await knex("titles").max({ maxOrder: "order" }).first();
  const nextOrder = Number(maxOrder || 0) + 1;
  if (nextOrder + TITLES.length - 1 > MAX_TITLE_ORDER) {
    throw new Error(`WORLD_BOSS_TITLE_ORDER_EXHAUSTED:max=${maxOrder}`);
  }

  return { nextOrder };
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
    case "world_boss_season_boss":
      await knex.schema.createTable(tableName, table => {
        table.bigIncrements("id").primary();
        table.bigInteger("season_id").unsigned().notNullable();
        table.tinyint("position").unsigned().notNullable();
        table.bigInteger("world_boss_id").unsigned().notNullable();
        table.string("name", 64).notNullable();
        table.string("image", 255);
        table.text("description");
        table.decimal("hp_weight", 8, 3).notNullable();
        table.timestamps(true, true);
        table.unique(["season_id", "position"], "uq_wbsb_season_position");
        table.unique(["season_id", "world_boss_id"], "uq_wbsb_season_boss");
        table
          .foreign("season_id", "fk_wbsb_season")
          .references("id")
          .inTable("world_boss_season")
          .onDelete("CASCADE");
        table.check("?? > 0", ["hp_weight"], "chk_wbsb_hp_weight_positive");
        table.check(`\`position\` BETWEEN 1 AND ${ROSTER_SIZE}`, [], "chk_wbsb_position_range");
      });
      break;
    case "world_boss_round":
      await knex.schema.createTable(tableName, table => {
        table.bigIncrements("id").primary();
        table.bigInteger("season_boss_id").unsigned().notNullable();
        table.integer("cycle_no").unsigned().notNullable();
        table.bigInteger("max_hp").unsigned().notNullable();
        table.bigInteger("current_hp").unsigned().notNullable();
        table.datetime("cleared_at").nullable();
        table.timestamps(true, true);
        table.unique(["season_boss_id", "cycle_no"], "uq_wbr_season_boss_cycle");
        table
          .foreign("season_boss_id", "fk_wbr_season_boss")
          .references("id")
          .inTable("world_boss_season_boss")
          .onDelete("RESTRICT");
        table.check("?? > 0", ["max_hp"], "chk_wbr_max_hp_positive");
        table.check("?? <= ??", ["current_hp", "max_hp"], "chk_wbr_current_lte_max");
        table.check("?? >= 1", ["cycle_no"], "chk_wbr_cycle_no_positive");
        table.check(
          "(`current_hp` = 0 AND `cleared_at` IS NOT NULL) OR (`current_hp` > 0 AND `cleared_at` IS NULL)",
          [],
          "chk_wbr_cleared_consistency"
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
  const { nextOrder } = await preflightTitles(knex);

  for (const table of TABLES) {
    await createTable(knex, table);
  }

  await knex("titles").insert(
    TITLES.map((title, index) => ({
      ...title,
      order: nextOrder + index,
    }))
  );
};

exports.down = async knex => {
  const ownedTitles = await knex("titles").whereIn("key", TITLE_KEYS);
  const ownedIds = [];
  for (const title of ownedTitles) {
    ownedIds.push(title.id);
  }

  if (ownedIds.length) await knex("user_titles").whereIn("title_id", ownedIds).del();
  if (ownedIds.length) await knex("titles").whereIn("id", ownedIds).del();
  for (const table of DROP_ORDER) {
    await knex.schema.dropTableIfExists(table);
  }
};

exports.config = { transaction: false };
