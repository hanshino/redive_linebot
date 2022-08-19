/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("lottery_main", function (table) {
    table.increments("id").primary();
    table
      .enum("status", ["selling", "drawed", "closed"])
      .notNullable()
      .comment("狀態, selling:販售中, drawed:已抽獎, closed:已關閉");
    table
      .string("result")
      .comment("原始結果, 可能為空, 開獎後會被更新, 以逗號分隔, 例如: 1,2,3,4,5");

    table.integer("carryover_money").comment("累積獎金").defaultTo(0);
    table.dateTime("exchange_expired_at").comment("兌換期限, 開獎後會被更新");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("lottery_main");
};
