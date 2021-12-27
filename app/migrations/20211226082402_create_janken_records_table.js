// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("janken_records", table => {
    table.string("id").primary();
    table.string("user_id", 33).notNullable();
    table.string("target_user_id", 33).notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("janken_records");
};
