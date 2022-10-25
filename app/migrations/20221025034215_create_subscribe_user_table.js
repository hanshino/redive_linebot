/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("subscribe_user", table => {
    table.increments("id").primary();

    table.string("user_id", 40).notNullable().comment("LINE user id");
    table.string("subscribe_card_key").notNullable().comment("subscribe_card.key");
    table.timestamp("start_at").notNullable().comment("訂閱開始時間");
    table.timestamp("end_at").notNullable().comment("訂閱結束時間");

    table.unique(["user_id", "subscribe_card_key"]);

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("subscribe_user");
};
