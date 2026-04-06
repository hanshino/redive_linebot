// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("gacha_banner_characters", function (table) {
    table.increments("id").primary();
    table.integer("banner_id").unsigned().notNullable().comment("對應 gacha_banner.id");
    table.integer("character_id").unsigned().notNullable().comment("對應 GachaPool.id");

    table.foreign("banner_id").references("gacha_banner.id").onDelete("CASCADE");
    table.unique(["banner_id", "character_id"]);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("gacha_banner_characters");
};
