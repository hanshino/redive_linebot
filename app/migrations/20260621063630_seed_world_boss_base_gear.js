// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");
const { buildRows } = require("../seeds/WorldBossBaseGearSeeder");

/**
 * @param {Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  const rows = buildRows();
  const names = rows.map(r => r.name);
  const existing = await knex("equipment").select("name").whereIn("name", names);
  const existingNames = new Set(existing.map(r => r.name));
  const toInsert = rows.filter(r => !existingNames.has(r.name));
  if (toInsert.length > 0) {
    await knex("equipment").insert(toInsert);
  }
};

/**
 * @param {Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  const names = buildRows().map(r => r.name);
  await knex("equipment").whereIn("name", names).del();
};
