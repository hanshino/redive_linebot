// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const TABLE = "chat_exp_events";

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table
      .decimal("base_xp", 6, 3)
      .nullable()
      .after("modifiers")
      .comment("config snapshot of getBaseXp() at write time; XP points, not a ratio");
    table.decimal("blessing1_mult", 4, 3).nullable().after("base_xp");
    table.decimal("honeymoon_mult", 4, 3).nullable().after("blessing1_mult");
    table.decimal("diminish_factor", 4, 3).nullable().after("honeymoon_mult");
    table.decimal("trial_mult", 4, 3).nullable().after("diminish_factor");
    table.decimal("permanent_mult", 4, 3).nullable().after("trial_mult");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.alterTable(TABLE, table => {
    table.dropColumns(
      "base_xp",
      "blessing1_mult",
      "honeymoon_mult",
      "diminish_factor",
      "trial_mult",
      "permanent_mult"
    );
  });
};
