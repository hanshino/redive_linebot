// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("user_has_advancements");
  await knex.schema.dropTableIfExists("advancement");
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.createTable("advancement", table => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("type").notNullable();
    table.string("description").notNullable();
    table.string("icon").notNullable();
    table.tinyint("order").notNullable();
    table.timestamps(true, true);
    table.index("name");
    table.unique(["name", "type"]);
  });
  await knex.schema.createTable("user_has_advancements", table => {
    table.increments("id").primary();
    table.integer("user_id").notNullable();
    table.integer("advancement_id").notNullable();
    table.timestamps(true, true);
    table.unique(["user_id", "advancement_id"]);
    table.index("user_id");
  });
};
