// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("world_boss_event_log", table => {
    table.increments("id").primary();

    table.integer("world_boss_event_id").notNullable();
    table.integer("user_id").notNullable();
    table.string("action_type").notNullable().comment("攻擊類型");
    table.integer("damage").notNullable().comment("傷害");

    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("world_boss_event_log");
};
