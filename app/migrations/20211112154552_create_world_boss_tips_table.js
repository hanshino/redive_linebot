// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("world_boss_tips", table => {
    table.increments("id").primary();
    table.string("message");
    table.timestamps(false, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("world_boss_tips");
};
