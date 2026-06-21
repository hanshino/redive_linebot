/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("player_equipment", table => {
    table.integer("enhance_level").notNullable().defaultTo(0).comment("強化等級 0-10 (D9)");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("player_equipment", table => {
    table.dropColumn("enhance_level");
  });
};
