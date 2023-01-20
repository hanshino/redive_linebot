/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("scratch_card_types", table => {
    table.increments("id").primary();
    table.string("name").notNullable().comment("名稱");
    table.integer("price").notNullable().comment("售價");
    table.integer("max_reward").notNullable().comment("最大獎勵");
    table.string("image").notNullable().comment("圖片");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("scratch_card_types");
};
