// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_achievements", table => {
    table.increments("id").primary();
    table.string("user_id", 50).notNullable().comment("LINE user ID");
    table.integer("achievement_id").unsigned().notNullable().comment("成就 ID");
    table.timestamp("unlocked_at").notNullable().defaultTo(knex.fn.now()).comment("解鎖時間");
    table.unique(["user_id", "achievement_id"]);
    table.index("user_id");
    table.foreign("achievement_id").references("achievements.id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_achievements");
};
