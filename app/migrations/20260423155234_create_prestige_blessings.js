// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");
const { buildRows } = require("../seeds/PrestigeBlessingsSeeder");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable("prestige_blessings", table => {
    table.tinyint("id").unsigned().notNullable().primary().comment("1-7");
    table.string("slug", 30).notNullable().unique();
    table.string("display_name", 20).notNullable();
    table.json("effect_meta").notNullable().comment("祝福效果 JSON");
    table.text("description").nullable();
    table.timestamps(true, true);
  });
  await knex("prestige_blessings").insert(buildRows());
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("prestige_blessings");
};
