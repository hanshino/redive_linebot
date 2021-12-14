// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("god_stone_shop", table => {
    table.increments("id").primary();
    table.integer("item_id").notNullable();
    table.integer("price").notNullable();
    table.integer("stock").defaultTo(1).notNullable();
    table.integer("limit").defaultTo(1).notNullable();
    table.integer("is_enable").defaultTo(1).notNullable();

    table.timestamps(false, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("god_stone_shop");
};
