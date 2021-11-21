// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("world_boss_event", function (table) {
    table.increments("id").primary();

    table.integer("world_boss_id").notNullable();

    // 活動文宣
    table.string("announcement").notNullable();

    // 活動開始時間
    table.timestamp("start_time").notNullable();
    // 活動結束時間
    table.timestamp("end_time").notNullable();

    // 建立時間
    table.timestamp("created_at").defaultTo(knex.fn.now());
    // 更新時間
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("world_boss_event");
};
