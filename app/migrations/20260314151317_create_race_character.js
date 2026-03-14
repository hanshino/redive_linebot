exports.up = function (knex) {
  return knex.schema.createTable("race_character", table => {
    table.increments("id").primary();
    table.string("name", 50).notNullable();
    table.string("personality", 20).nullable();
    table.string("avatar_url", 255).nullable();
    table.json("custom_events").nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("race_character");
};
