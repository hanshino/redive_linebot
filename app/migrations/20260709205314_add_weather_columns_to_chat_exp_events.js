// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const TABLE = "chat_exp_events";

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.string("weather_key", 32).nullable().after("permanent_mult").comment("weather snapshot");
    table
      .json("weather_effects")
      .nullable()
      .after("weather_key")
      .comment("effective effects after protection");
    table.boolean("weather_protected").notNullable().defaultTo(false).after("weather_effects");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.dropColumns("weather_key", "weather_effects", "weather_protected");
  });
};
