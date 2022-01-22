// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("daily_quest", table => {
    table.increments("id").primary();
    table.string("user_id").notNullable();
    table.timestamps(true, true);

    table.index("user_id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("daily_quest");
};
