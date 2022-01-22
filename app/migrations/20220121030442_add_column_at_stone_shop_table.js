// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.table("god_stone_shop", table => {
    table.string("item_image").comment("商品圖片").after("is_enable");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.table("god_stone_shop", table => {
    table.dropColumn("item_image");
  });
};
