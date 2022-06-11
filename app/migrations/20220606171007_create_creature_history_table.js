/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("creature_history", table => {
    table.increments("id").primary();
    table.integer("user_has_creature_id").notNullable().unsigned().comment("使用者培養角色 id");
    table.string("action").notNullable().comment("動作類型");
    table.json("data").notNullable().comment("動作資料");

    table.timestamps(true, true);
    table.foreign("user_has_creature_id").references("user_has_creatures.id");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("creature_history");
};
