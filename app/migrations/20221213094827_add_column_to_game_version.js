/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("game_version", function (table) {
    table.enum("server", ["tw", "jp"]).defaultTo("tw").notNullable().after("hash");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("game_version", function (table) {
    table.dropColumn("server");
  });
};
