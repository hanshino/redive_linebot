// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * subscribe_card_coupon.sponsorship_id：贊助後台發卡時關聯回 sponsorship，
 * 既有資料維持 NULL；CLI／遊戲幣購卡路徑不寫入此欄位。
 * 見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §2.3。
 *
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable("subscribe_card_coupon", table => {
    table.integer("sponsorship_id").unsigned().nullable().after("issued_by");
    table.foreign("sponsorship_id").references("id").inTable("sponsorship");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable("subscribe_card_coupon", table => {
    table.dropForeign("sponsorship_id");
    table.dropColumn("sponsorship_id");
  });
};
