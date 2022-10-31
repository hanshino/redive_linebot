/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("gacha_record", function (table) {
    table.increments("id").primary();

    table.string("user_id", 33).notNullable().comment("Line User ID");
    table.tinyint("silver", 2).notNullable().comment("銀數量").defaultTo(0);
    table.tinyint("gold", 2).notNullable().comment("金數量").defaultTo(0);
    table.tinyint("rainbow", 2).notNullable().comment("彩數量").defaultTo(0);
    table.tinyint("has_new", 1).notNullable().comment("是否有新角色, 1:有, 0:沒有").defaultTo(0);

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("gacha_record");
};
