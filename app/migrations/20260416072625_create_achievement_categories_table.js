// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("achievement_categories", table => {
    table.increments("id").primary();
    table.string("key", 50).notNullable().unique().comment("分類識別鍵");
    table.string("name", 50).notNullable().comment("顯示名稱");
    table.string("icon", 100).notNullable().comment("分類圖示");
    table.tinyint("order").notNullable().defaultTo(0).comment("排序");
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("achievement_categories");
};
