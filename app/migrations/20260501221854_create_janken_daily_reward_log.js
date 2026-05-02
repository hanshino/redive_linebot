/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("janken_daily_reward_log", table => {
    table.increments("id").unsigned().primary();
    table.string("user_id", 33).notNullable();
    table.date("reward_date").notNullable();
    table.integer("season_id").unsigned().notNullable();
    table.string("reward_type", 20).notNullable();
    table.integer("amount").notNullable().defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.unique(["user_id", "reward_date"], "uniq_user_date");
    table.index("reward_date", "idx_reward_date");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("janken_daily_reward_log");
};
