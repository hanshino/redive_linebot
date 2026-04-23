// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("prestige_trials", table => {
    table.tinyint("id").unsigned().notNullable().primary().comment("1-5");
    table.string("slug", 30).notNullable().unique().comment("machine key");
    table.string("display_name", 20).notNullable();
    table.tinyint("star").unsigned().notNullable().comment("1-5 stars");
    table.integer("required_exp").unsigned().notNullable();
    table.tinyint("duration_days").unsigned().notNullable().defaultTo(60);
    table.json("restriction_meta").notNullable().comment("試煉限制 JSON");
    table.json("reward_meta").notNullable().comment("通過獎勵 JSON");
    table.text("description").nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("prestige_trials");
};
