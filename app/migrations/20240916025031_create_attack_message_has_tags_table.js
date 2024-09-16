/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("attack_message_has_tags", table => {
    table.increments("id").primary();
    table.integer("attack_message_id").unsigned().notNullable();
    table.string("tag").notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("attack_message_has_tags");
};
