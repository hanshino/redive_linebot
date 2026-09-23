// subscribe_job_log.type 原本 varchar(20)，容不下新卡種 "month_plus_daily_ration"（23 字）。
// 見 20221026060341_create_subscribe_job_log_table.js。

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable("subscribe_job_log", table => {
    table.string("type", 40).notNullable().comment("Type of subscribe job").alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable("subscribe_job_log", table => {
    table.string("type", 20).notNullable().comment("Type of subscribe job").alter();
  });
};
