/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_gamble_option", table => {
    table.increments("id").primary();
    table.string("user_id").notNullable().comment("使用者ID");
    table.bigInteger("gamble_game_id").notNullable().comment("遊戲ID");
    table.string("option").notNullable().comment("選項");
    table.integer("amount").notNullable().comment("金額");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_gamble_option");
};
