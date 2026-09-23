// 月卡實際現金售價是 NT$30（五張 NT$120），subscribe_card.price 自 2022 建表起誤存 50。
// 只在值仍是舊值時才改，避免覆蓋日後手動調整過的價格。

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex("subscribe_card").where({ key: "month", price: 50 }).update({ price: 30 });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex("subscribe_card").where({ key: "month", price: 30 }).update({ price: 50 });
};
