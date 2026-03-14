exports.up = function (knex) {
  return knex.schema.createTable("race_bet", table => {
    table.increments("id").primary();
    table.integer("race_id").unsigned().notNullable();
    table.string("user_id", 50).notNullable();
    table.integer("runner_id").unsigned().notNullable();
    table.integer("amount").unsigned().notNullable();
    table.integer("payout").nullable();
    table.timestamps(true, true);

    table.foreign("race_id").references("race.id").onDelete("CASCADE");
    table.foreign("runner_id").references("race_runner.id").onDelete("CASCADE");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race_bet");
};
