/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("coupon_used_history", table => {
    table.increments("id").primary();
    table.integer("coupon_code_id").notNullable().comment("兌換碼流水號");
    table.string("user_id").notNullable().comment("使用者");
    table.timestamps(true, true);

    table.index(["coupon_code_id", "user_id"]);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("coupon_used_history");
};
