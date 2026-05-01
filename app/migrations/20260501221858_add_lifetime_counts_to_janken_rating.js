/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("janken_rating", table => {
    table.integer("lifetime_win_count").notNullable().defaultTo(0);
    table.integer("lifetime_lose_count").notNullable().defaultTo(0);
    table.integer("lifetime_draw_count").notNullable().defaultTo(0);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("janken_rating", table => {
    table.dropColumn("lifetime_win_count");
    table.dropColumn("lifetime_lose_count");
    table.dropColumn("lifetime_draw_count");
  });
};
