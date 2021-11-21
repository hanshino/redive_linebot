// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("guild_service", table => {
    table.increments("id").primary();
    table.integer("guild_id").notNullable().comment("Guild ID");
    table.string("service").notNullable().comment("Service name");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("guild_service");
};
