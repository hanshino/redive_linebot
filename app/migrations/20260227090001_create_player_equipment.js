// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("player_equipment", table => {
    table.increments("id").primary();
    table.string("user_id", 50).notNullable();
    table.integer("equipment_id").unsigned().notNullable();
    table.enum("slot", ["weapon", "armor", "accessory"]).notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.unique(["user_id", "slot"]);
    table.foreign("equipment_id").references("id").inTable("equipment");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("player_equipment");
};
