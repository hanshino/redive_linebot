// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.table("world_boss_event", table => {
    table
      .enu("status", ["pending", "active", "killed", "expired"])
      .notNullable()
      .defaultTo("active")
      .comment("生命週期狀態");
    table.datetime("killed_at").nullable().comment("被擊殺時間");
    table.datetime("settled_at").nullable().comment("結算完成時間");
    table.index(["status", "settled_at"], "idx_wbe_status_settled");
    table.index(["status", "end_time"], "idx_wbe_status_end");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.table("world_boss_event", table => {
    table.dropIndex(["status", "settled_at"], "idx_wbe_status_settled");
    table.dropIndex(["status", "end_time"], "idx_wbe_status_end");
    table.dropColumn("status");
    table.dropColumn("killed_at");
    table.dropColumn("settled_at");
  });
};
