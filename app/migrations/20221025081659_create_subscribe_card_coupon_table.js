/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("subscribe_card_coupon", table => {
    table.increments("id").primary();

    table.string("subscribe_card_key").notNullable().comment("訂閱卡的 key");
    table.string("serial_number", 36).notNullable().comment("序號").unique();
    table
      .tinyint("status")
      .unsigned()
      .notNullable()
      .comment("狀態(0:未使用, 1:已使用)")
      .defaultTo(0);
    table.timestamp("used_at").comment("使用時間");
    table.string("used_by").comment("使用者, 使用者的 user_id");
    table.string("issued_by").notNullable().comment("發行者, 通常為管理員");

    table.index("serial_number");

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("subscribe_card_coupon");
};
