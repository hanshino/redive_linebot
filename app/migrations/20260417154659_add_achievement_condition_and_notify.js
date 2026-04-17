// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable("achievements", table => {
    table.json("condition").nullable().comment("觸發條件資料，策略自行解析");
    table
      .boolean("notify_on_unlock")
      .notNullable()
      .defaultTo(false)
      .comment("解鎖時是否通知聊天室");
    table.text("notify_message").nullable().comment("通知模板，null 走預設");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable("achievements", table => {
    table.dropColumn("condition");
    table.dropColumn("notify_on_unlock");
    table.dropColumn("notify_message");
  });
};
