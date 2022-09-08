/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table("Inventory", function (table) {
    table.string("note").nullable().comment("新增理由").after("itemAmount");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("Inventory", function (table) {
    table.dropColumn("note");
  });
};
