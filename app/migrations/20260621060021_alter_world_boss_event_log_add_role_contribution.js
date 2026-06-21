// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.table("world_boss_event_log", table => {
    table
      .enu("role", ["dps", "healer", "tank"])
      .notNullable()
      .defaultTo("dps")
      .comment("行動當下的職業 (D27)");
    table.integer("contribution").notNullable().defaultTo(0).comment("該職業榜貢獻分");
    table.index(["world_boss_event_id"], "idx_wbel_event");
    table.index(["world_boss_event_id", "user_id"], "idx_wbel_event_user");
    table.index(["world_boss_event_id", "role"], "idx_wbel_event_role");
    table.index(["world_boss_event_id", "created_at"], "idx_wbel_event_created");
    table.index(["user_id", "created_at"], "idx_wbel_user_created");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.table("world_boss_event_log", table => {
    table.dropIndex(["world_boss_event_id"], "idx_wbel_event");
    table.dropIndex(["world_boss_event_id", "user_id"], "idx_wbel_event_user");
    table.dropIndex(["world_boss_event_id", "role"], "idx_wbel_event_role");
    table.dropIndex(["world_boss_event_id", "created_at"], "idx_wbel_event_created");
    table.dropIndex(["user_id", "created_at"], "idx_wbel_user_created");
    table.dropColumn("role");
    table.dropColumn("contribution");
  });
};
