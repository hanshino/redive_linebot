// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("advancement", table => {
    table.increments("id").primary();
    table.string("name").notNullable().comment("成就名稱");
    table.string("type").notNullable().comment("成就類型");
    table.string("description").notNullable().comment("成就描述");
    table.string("icon").notNullable().comment("成就圖示");
    table.tinyint("order").notNullable().comment("順序，0~10 之間");
    table.timestamps(true, true);

    table.index("name");
    table.unique(["name", "type"]);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("advancement");
};
