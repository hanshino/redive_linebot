// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("signin_days", table => {
    table.string("user_id").notNullable().primary();
    table.date("last_signin_at").notNullable().comment("最後簽到時間");
    table.integer("sum_days").notNullable().defaultTo(1).comment("累計簽到天數");
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("signin_days");
};
