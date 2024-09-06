/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("world_boss_event_log", table => {
    table.integer("cost").after("damage").defaultTo(0).notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("world_boss_event_log", table => {
    table.dropColumn("cost");
  });
};
