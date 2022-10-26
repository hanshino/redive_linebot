/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("subscribe_job_log", table => {
    table.increments("id").primary();

    table.string("user_id", 33).notNullable().comment("Line user id");
    table.string("type", 20).notNullable().comment("Type of subscribe job");

    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index("user_id");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("subscribe_job_log");
};
