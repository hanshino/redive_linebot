// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.table("GachaSignin", table => {
    table.json("record").nullable().after("userId");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.table("GachaSignin", table => {
    table.dropColumn("record");
  });
};
