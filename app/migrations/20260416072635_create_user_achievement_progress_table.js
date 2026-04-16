// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_achievement_progress", table => {
    table.increments("id").primary();
    table.string("user_id", 50).notNullable().comment("LINE user ID");
    table.integer("achievement_id").unsigned().notNullable().comment("成就 ID");
    table.integer("current_value").notNullable().defaultTo(0).comment("目前進度");
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now()).comment("最後更新");
    table.unique(["user_id", "achievement_id"]);
    table.index("user_id");
    table.foreign("achievement_id").references("achievements.id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_achievement_progress");
};
