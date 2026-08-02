// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const TABLE = "chat_exp_daily";

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table
      .integer("alchemy_exp")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .after("effective_exp")
      .comment("effective exp diverted to god stones by alchemy weather (day-cumulative)");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.dropColumn("alchemy_exp");
  });
};
