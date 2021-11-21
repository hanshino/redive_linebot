// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("ad_message", table => {
    table.increments("id").primary();
    table.json("message").notNullable().comment("消息内容");
    table.string("title").notNullable().comment("廣告標題");
    table.string("sender_name").comment("發送者名稱");
    table.string("sender_iconUrl").comment("發送者圖像");
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("ad_message");
};
