// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("player_equipment", table => {
    table.boolean("is_equipped").notNullable().defaultTo(false);
  });

  // Existing rows are all equipped items
  await knex("player_equipment").update({ is_equipped: true });

  await knex.schema.alterTable("player_equipment", table => {
    table.dropUnique(["user_id", "slot"]);
    table.unique(["user_id", "equipment_id"]);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable("player_equipment", table => {
    table.dropUnique(["user_id", "equipment_id"]);
    table.unique(["user_id", "slot"]);
    table.dropColumn("is_equipped");
  });
};
