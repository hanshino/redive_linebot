exports.up = function (knex) {
  return knex.schema.createTable("race", table => {
    table.increments("id").primary();
    table.enum("status", ["betting", "running", "finished"]).notNullable().defaultTo("betting");
    table.integer("round").unsigned().notNullable().defaultTo(0);
    table.json("terrain").nullable();
    table.integer("winner_runner_id").unsigned().nullable();
    table.datetime("betting_end_at").nullable();
    table.datetime("started_at").nullable();
    table.datetime("finished_at").nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race");
};
