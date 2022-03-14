/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("coupon_code", table => {
    table.increments("id").primary();
    table.string("code").notNullable().unique().comment("兌換碼");
    table.json("reward").notNullable().comment("兌換獎勵");
    table.timestamp("start_at").comment("啟用時間");
    table.timestamp("end_at").comment("結束時間");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("coupon_code");
};
