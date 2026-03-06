/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("vote_user_decision");
  await knex.schema.dropTableIfExists("vote");
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.createTable("vote", function (table) {
    table.increments("id").primary();
    table.string("title").notNullable();
    table.json("options").notNullable();
    table.dateTime("start_time");
    table.dateTime("end_time");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("vote_user_decision", function (table) {
    table.increments("id").primary();
    table.string("user_id").notNullable();
    table.integer("vote_id").unsigned().notNullable();
    table.string("decision").notNullable();
    table.timestamps(true, true);
  });
};
