// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("minigame_level", table => {
    table.increments("id").primary();

    table.integer("user_id").notNullable().comment("User ID");
    table.integer("level").notNullable().comment("Level");
    table.integer("exp").notNullable().comment("EXP");

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("minigame_level");
};
