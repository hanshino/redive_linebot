/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("trade_history", table => {
    table.increments("id").primary();
    table.string("seller_id").notNullable().comment("賣方 user id");
    table.string("buyer_id").notNullable().comment("買方 user id");
    table.integer("item_id").notNullable().comment("物品id");
    table.integer("price").notNullable().comment("價格");
    table.integer("quantity").notNullable().comment("數量");
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("trade_history");
};
