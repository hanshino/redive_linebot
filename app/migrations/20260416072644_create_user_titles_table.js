// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_titles", table => {
    table.increments("id").primary();
    table.string("user_id", 50).notNullable().comment("LINE user ID");
    table.integer("title_id").unsigned().notNullable().comment("稱號 ID");
    table.timestamp("granted_at").notNullable().defaultTo(knex.fn.now()).comment("授予時間");
    table.unique(["user_id", "title_id"]);
    table.index("user_id");
    table.foreign("title_id").references("titles.id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_titles");
};
