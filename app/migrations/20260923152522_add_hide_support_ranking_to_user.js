// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * 支持榜（sponsorship 排行）opt-out 開關。預設 false（上榜），玩家可在 LIFF 自行關閉。
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable("user", table => {
    table.boolean("hide_support_ranking").notNullable().defaultTo(false);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable("user", table => {
    table.dropColumn("hide_support_ranking");
  });
};
