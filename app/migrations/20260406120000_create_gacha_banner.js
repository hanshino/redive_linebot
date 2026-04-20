// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("gacha_banner", function (table) {
    table.increments("id").primary();
    table.string("name", 100).notNullable().comment("Banner 名稱");
    table.enum("type", ["rate_up", "europe"]).notNullable().comment("活動類型");
    table
      .integer("rate_boost")
      .unsigned()
      .defaultTo(0)
      .comment("機率加成百分比，僅 rate_up 用，如 150 表示 1.5 倍");
    table
      .integer("cost")
      .unsigned()
      .defaultTo(0)
      .comment("花費女神石，僅 europe 用，0 表示用 config 預設");
    table.timestamp("start_at").notNullable().comment("活動開始時間");
    table.timestamp("end_at").notNullable().comment("活動結束時間");
    table.boolean("is_active").notNullable().defaultTo(true).comment("是否啟用");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("gacha_banner");
};
