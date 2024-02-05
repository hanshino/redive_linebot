/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("minigame_level", table => {
    table.integer("job_id").notNullable().comment("職業ID").after("exp").defaultTo(1);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("minigame_level", table => {
    table.dropColumn("job_id");
  });
};
