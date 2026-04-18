/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("janken_auto_fate_log", function (table) {
    table.bigIncrements("id").primary();
    table.string("match_id", 64).notNullable().comment("JankenService uuid match id");
    table.string("user_id", 33).notNullable().comment("LINE User ID");
    table.enum("role", ["p1", "p2"]).notNullable();
    table.enum("choice", ["rock", "paper", "scissors"]).notNullable();
    table.timestamp("submitted_at").notNullable().defaultTo(knex.fn.now());

    table.index(["match_id"], "idx_match");
    table.index(["user_id", "submitted_at"], "idx_user_submitted");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("janken_auto_fate_log");
};
