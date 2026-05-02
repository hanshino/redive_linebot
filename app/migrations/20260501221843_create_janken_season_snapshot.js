/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("janken_season_snapshot", table => {
    table.increments("id").unsigned().primary();
    table.integer("season_id").unsigned().notNullable();
    table.smallint("rank").unsigned().notNullable();
    table.string("user_id", 33).notNullable();
    table.string("display_name", 255).nullable();
    table.integer("elo").notNullable();
    table.string("rank_tier", 20).notNullable();
    table.integer("win_count").notNullable().defaultTo(0);
    table.integer("lose_count").notNullable().defaultTo(0);
    table.integer("draw_count").notNullable().defaultTo(0);
    table.integer("max_streak").notNullable().defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.index(["season_id", "rank"], "idx_season_rank");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("janken_season_snapshot");
};
