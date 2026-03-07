/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.dropTableIfExists("scratch_cards").then(() => {
    return knex.schema.dropTableIfExists("scratch_card_types");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .createTable("scratch_card_types", table => {
      table.increments("id").primary();
      table.string("name").notNullable().comment("名稱");
      table.integer("price").notNullable().comment("售價");
      table.integer("max_reward").notNullable().comment("最大獎勵");
      table.string("image").notNullable().comment("圖片");
      table.timestamps(true, true);
    })
    .then(() => {
      return knex.schema.createTable("scratch_cards", table => {
        table.increments("id").primary();
        table.integer("scratch_card_type_id").notNullable().comment("刮刮卡類型 ID");
        table.string("buyer_id", 33).nullable().comment("買家 ID");
        table.integer("reward").notNullable().comment("獎勵").defaultTo(0);
        table.boolean("is_used").notNullable().comment("是否已兌換").defaultTo(false);
        table.timestamps(true, true);
      });
    });
};
