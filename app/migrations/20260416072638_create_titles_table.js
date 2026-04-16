// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("titles", table => {
    table.increments("id").primary();
    table.string("key", 100).notNullable().unique().comment("稱號識別鍵");
    table.string("name", 100).notNullable().comment("顯示名稱");
    table.string("description", 255).notNullable().comment("說明");
    table.string("icon", 100).notNullable().comment("圖示");
    table.tinyint("rarity").notNullable().defaultTo(0).comment("稀有度 0-3");
    table.tinyint("order").notNullable().defaultTo(0).comment("排序");
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("titles");
};
