/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("world_boss_reward_log", table => {
    table.increments("id").unsigned().primary();
    table.string("user_id", 33).notNullable().comment("platform_id (發放身分)");
    table.integer("world_boss_event_id").notNullable();
    table.integer("materials").notNullable().defaultTo(0).comment("強化素材數量");
    table.integer("stones").notNullable().defaultTo(0).comment("女神石數量");
    table.enu("board", ["dps", "healer", "tank", "none"]).notNullable().defaultTo("none");
    table.integer("rank").nullable().comment("null = 純參與 / 逾時");
    table.boolean("is_mvp").notNullable().defaultTo(false);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.unique(["user_id", "world_boss_event_id"], "uniq_wbrl_user_event");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("world_boss_reward_log");
};
