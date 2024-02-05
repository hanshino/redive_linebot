/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("number_gamble_history", table => {
    table.increments("id");
    table.string("user_id", 64).notNullable();
    table.string("option", 16).notNullable();
    table.string("dices", 16).notNullable().comment("ex: 1,2,3");
    table.integer("chips").notNullable();
    table.integer("payout").notNullable().comment("1: big/small, 5: double, 24: triple");
    table.tinyint("result").notNullable().comment("0: lose, 1: win");
    table.integer("reward").notNullable();

    table.index("user_id");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("number_gamble_history");
};
