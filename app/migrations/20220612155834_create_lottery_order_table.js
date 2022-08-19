/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("lottery_user_order", function (table) {
    table.increments("id").primary();
    table.integer("lottery_main_id").unsigned().notNullable();
    table.string("user_id").notNullable().comment("使用者ID");
    table.string("content").notNullable().comment("簽號內容, 以逗號分隔, 例如: 1,2,3,4,5");
    table
      .enum("status", ["initial", "exchanged", "canceled", "expired"])
      .notNullable()
      .comment("狀態, initial:初始, exchanged:已兌換, canceled:已取消, expired:已過期")
      .defaultTo("initial");
    table
      .enum("buy_type", ["manual", "auto"])
      .notNullable()
      .comment("購買類型, manual:手動, auto:自動")
      .defaultTo("manual");
    table.enum("result", ["first", "second", "third", "fourth"]).comment("結果").nullable();

    table.timestamps(true, true);
    table.foreign("lottery_main_id").references("id").inTable("lottery_main");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("lottery_user_order");
};
