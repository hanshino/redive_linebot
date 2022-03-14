/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("coupon_code", table => {
    table.increments("id").primary();
    table.string("code").notNullable().unique().comment("兌換碼");
    table.json("reward").notNullable().comment("兌換獎勵");
    table.timestamp("expires_at");
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
