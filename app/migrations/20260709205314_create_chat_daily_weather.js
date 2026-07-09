// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("chat_daily_weather", table => {
    table.date("date").primary().comment("UTC+8 date");
    table.string("weather_key", 32).notNullable();
    table.string("category", 16).notNullable().comment("buff | debuff (mixed in V1.1)");
    table.string("name", 64).notNullable().comment("display snapshot");
    table.text("flavor_text").notNullable().comment("display snapshot");
    table.json("effects").notNullable().comment("numeric effect snapshot");
    table.string("protection_type", 32).nullable();
    table.string("protection_name", 64).nullable();
    table.integer("protection_cost").unsigned().nullable().comment("女神石 cost");
    table.datetime("generated_at").notNullable();
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("chat_daily_weather");
};
