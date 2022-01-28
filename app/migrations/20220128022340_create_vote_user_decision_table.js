/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("vote_user_decision", table => {
    table.increments("id").primary();
    table.integer("vote_id").unsigned().notNullable().comment("投票 ID");
    table.string("user_id").notNullable().comment("使用者 ID");
    table.integer("decision").notNullable().comment("投票結果");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("vote_user_decision");
};
