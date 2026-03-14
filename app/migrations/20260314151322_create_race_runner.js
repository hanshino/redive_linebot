exports.up = function (knex) {
  return knex.schema.createTable("race_runner", table => {
    table.increments("id").primary();
    table.integer("race_id").unsigned().notNullable();
    table.integer("character_id").unsigned().notNullable();
    table.tinyint("lane").unsigned().notNullable();
    table.tinyint("position").unsigned().notNullable().defaultTo(0);
    table.tinyint("stamina").unsigned().notNullable().defaultTo(100);
    table.enum("status", ["normal", "slowed", "stunned"]).notNullable().defaultTo("normal");
    table.timestamps(true, true);

    table.foreign("race_id").references("race.id").onDelete("CASCADE");
    table.foreign("character_id").references("race_character.id");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race_runner");
};
