// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("chat_level_title");
  await knex.schema.dropTableIfExists("chat_range_title");
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.createTable("chat_level_title", table => {
    table.increments("id").primary();
    table.string("title", 50).notNullable();
    table.integer("title_range").notNullable();
  });
  await knex.schema.createTable("chat_range_title", table => {
    table.integer("id").primary();
    table.string("title", 50).notNullable();
  });
};
