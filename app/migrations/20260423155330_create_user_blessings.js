// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_blessings", table => {
    table.increments("id").primary();
    table.string("user_id", 33).notNullable();
    table.tinyint("blessing_id").unsigned().notNullable();
    table
      .tinyint("acquired_at_prestige")
      .unsigned()
      .notNullable()
      .comment("取得時的新 prestige_count (1-5)");
    table.datetime("acquired_at").notNullable().defaultTo(knex.fn.now());

    table.unique(["user_id", "blessing_id"], "uq_user_blessing");
    table.index(["user_id"], "idx_user");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_blessings");
};
