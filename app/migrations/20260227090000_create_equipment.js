// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("equipment", table => {
    table.increments("id").primary();
    table.string("name", 100).notNullable();
    table.enum("slot", ["weapon", "armor", "accessory"]).notNullable();
    table.integer("job_id").unsigned().nullable().defaultTo(null);
    table.enum("rarity", ["common", "rare", "epic", "legendary"]).notNullable().defaultTo("common");
    table.json("attributes").notNullable();
    table.text("description").nullable();
    table.string("image_url", 255).nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("equipment");
};
