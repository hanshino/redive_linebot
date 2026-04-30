// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");
const { buildRows } = require("../seeds/ChatExpUnitSeeder");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("chat_exp_unit");
  await knex.schema.createTable("chat_exp_unit", table => {
    table.smallint("unit_level").unsigned().notNullable().primary().comment("0-100, 新曲線平方律");
    table
      .integer("total_exp")
      .unsigned()
      .notNullable()
      .comment("累計 XP: round(13 * unit_level^2)");
  });
  await knex("chat_exp_unit").insert(buildRows());
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("chat_exp_unit");
};
