// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_weather_protections", table => {
    table.bigIncrements("id").primary();
    table.string("user_id", 33).notNullable();
    table.date("weather_date").notNullable().comment("UTC+8 date");
    table.string("weather_key", 32).notNullable();
    table.string("protection_type", 32).notNullable();
    table.string("protection_name", 64).notNullable();
    table.integer("stone_cost").unsigned().notNullable();
    table.datetime("purchased_at").notNullable().comment("protection starts here");
    table.timestamps(true, true);

    table.unique(["user_id", "weather_date"], "uq_user_weather_date");
    table.index(["weather_date", "weather_key"], "idx_weather_date_key");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("user_weather_protections");
};
