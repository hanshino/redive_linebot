/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("scratch_cards", table => {
    table.increments("id").primary();
    table.integer("scratch_card_type_id").notNullable().comment("刮刮卡類型 ID");
    table.integer("buyer_id").nullable().comment("買家 ID");
    table.integer("reward").notNullable().comment("獎勵").defaultTo(0);
    table.boolean("is_used").notNullable().comment("是否已兌換").defaultTo(false);
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("scratch_cards");
};
