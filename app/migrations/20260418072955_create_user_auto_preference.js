/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("user_auto_preference", function (table) {
    table.string("user_id", 33).primary().comment("LINE User ID");

    table
      .boolean("auto_daily_gacha")
      .notNullable()
      .defaultTo(false)
      .comment("訂閱者每日 23:50 自動抽卡開關");
    table
      .boolean("auto_janken_fate")
      .notNullable()
      .defaultTo(false)
      .comment("猜拳自動交給命運開關（非賭注場）");
    table
      .boolean("auto_janken_fate_with_bet")
      .notNullable()
      .defaultTo(false)
      .comment("賭注場猜拳是否也自動交給命運（獨立開關）");

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("user_auto_preference");
};
