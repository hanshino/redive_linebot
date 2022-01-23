// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("donate_list", table => {
    table.increments("id").primary();
    table.string("user_id").notNullable().comment("使用者ID");
    table.integer("amount").notNullable().comment("捐款金額");
    table.timestamps(true, true);

    table.index("user_id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("donate_list");
};
