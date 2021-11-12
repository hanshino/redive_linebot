// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("world_boss_notify", table => {
    table.increments("id").primary();

    table.string("notify_token").notNullable().comment("通知token");
    table.string("notify_type").notNullable().comment("通知類型");

    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("world_boss_notify");
};
