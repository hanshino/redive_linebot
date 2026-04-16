// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("achievements", table => {
    table.increments("id").primary();
    table.integer("category_id").unsigned().notNullable().comment("分類 ID");
    table.string("key", 100).notNullable().unique().comment("成就識別鍵");
    table.string("name", 100).notNullable().comment("顯示名稱");
    table.string("description", 255).notNullable().comment("達成條件描述");
    table.string("icon", 100).notNullable().comment("成就圖示");
    table
      .enum("type", ["milestone", "challenge", "hidden", "social"])
      .notNullable()
      .comment("成就類型");
    table.tinyint("rarity").notNullable().defaultTo(0).comment("稀有度 0-3");
    table.integer("target_value").notNullable().defaultTo(1).comment("達成目標值");
    table.integer("reward_stones").notNullable().defaultTo(0).comment("獎勵女神石");
    table.tinyint("order").notNullable().defaultTo(0).comment("同分類內排序");
    table.timestamps(true, true);
    table.foreign("category_id").references("achievement_categories.id");
    table.index("category_id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("achievements");
};
