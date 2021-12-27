// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("janken_result", table => {
    table.increments("id").primary();
    table.string("record_id").notNullable().comment("janken_records.id");
    table.string("user_id", 33).notNullable();
    table
      .integer("result")
      .notNullable()
      .comment("0: 平手, 1: 勝利, 2: 失敗, -1: 初始化, -2: 取消");
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("janken_result");
};
