/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("janken_seasons", table => {
    table.increments("id").unsigned().primary();
    table.dateTime("started_at").notNullable();
    table.dateTime("ended_at").nullable();
    table.enu("status", ["active", "closed"]).notNullable().defaultTo("active");
    table.text("notes").nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("janken_seasons");
};
