// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("minigame_level_unit", table => {
    table.increments("id").primary();
    table.integer("level").notNullable().comment("等级");
    table.integer("max_exp").notNullable().comment("最高經驗");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("minigame_level_unit");
};
