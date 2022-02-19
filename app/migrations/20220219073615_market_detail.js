/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("market_detail", table => {
    table.increments("id").primary();
    table.bigInteger("item_id").notNullable().comment("商品ID");
    table.integer("price").notNullable().comment("商品價格");
    table.integer("quantity").notNullable().comment("商品數量").defaultTo(1);
    table.tinyint("is_sold").notNullable().comment("是否已出售，0:未出售，1:已出售").defaultTo(0);
    table.timestamp("sold_at").comment("出售時間").nullable();
    table.timestamp("closed_at").comment("關閉時間").nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable("market_detail");
};
