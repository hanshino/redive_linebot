// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("chat_exp_daily", table => {
    table.increments("id").primary();
    table.string("user_id", 33).notNullable();
    table.date("date").notNullable().comment("UTC+8 日界線");
    table.integer("raw_exp").unsigned().notNullable().defaultTo(0).comment("diminish / 試煉倍率前");
    table.integer("effective_exp").unsigned().notNullable().defaultTo(0).comment("實際入帳 XP");
    table.integer("msg_count").unsigned().notNullable().defaultTo(0);
    table.boolean("honeymoon_active").notNullable().defaultTo(false);
    table.tinyint("trial_id").unsigned().nullable().comment("若當日在試煉期內，記錄 trial_id");
    table.timestamps(true, true);

    table.unique(["user_id", "date"], "uq_user_date");
    table.index(["date"], "idx_date");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("chat_exp_daily");
};
