// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("world_boss", table => {
    table.increments("id").primary();

    table.string("name").notNullable();
    table.string("description");
    table.string("image");
    table.integer("level").notNullable();
    table.integer("hp").notNullable();
    table.integer("attack").notNullable();
    table.integer("defense").notNullable();
    table.integer("speed").notNullable();
    table.integer("luck").notNullable();
    table.integer("exp").notNullable();
    table.integer("gold").notNullable();

    // 建立時間
    table.timestamp("created_at").defaultTo(knex.fn.now());
    // 更新時間
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("world_boss");
};
