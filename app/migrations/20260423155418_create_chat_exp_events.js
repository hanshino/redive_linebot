// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("chat_exp_events", table => {
    table.bigIncrements("id").primary();
    table.string("user_id", 33).notNullable();
    table.string("group_id", 33).notNullable();
    table.datetime("ts", { precision: 3 }).notNullable().comment("ms precision for cooldown debug");
    table.smallint("raw_exp").unsigned().notNullable();
    table.smallint("effective_exp").unsigned().notNullable();
    table.decimal("cooldown_rate", 3, 2).notNullable();
    table.decimal("group_bonus", 4, 2).notNullable();
    table.json("modifiers").nullable().comment("祝福 / 試煉 / 蜜月貢獻 debug");

    table.index(["user_id", "ts"], "idx_user_ts");
    table.index(["ts"], "idx_ts_retention");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("chat_exp_events");
};
