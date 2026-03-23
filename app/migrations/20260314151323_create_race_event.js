exports.up = function (knex) {
  return knex.schema.createTable("race_event", table => {
    table.increments("id").primary();
    table.integer("race_id").unsigned().notNullable();
    table.tinyint("round").unsigned().notNullable();
    table.string("event_type", 30).notNullable();
    table.json("target_runners").nullable();
    table.text("description").nullable();
    table.timestamps(true, true);

    table.foreign("race_id").references("race.id").onDelete("CASCADE");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race_event");
};
