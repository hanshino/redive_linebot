// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_has_advancements", table => {
    table.increments("id").primary();
    table.integer("user_id").notNullable().comment("使用者 ID");
    table.integer("advancement_id").notNullable().comment("成就 ID");
    table.timestamps(true, true);

    table.unique(["user_id", "advancement_id"]);
    table.index("user_id");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_has_advancements");
};
