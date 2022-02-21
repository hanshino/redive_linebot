/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable("market_detail", table => {
    table.increments("id").primary();
    table.string("seller_id").notNullable().comment("賣家ID");
    table.bigInteger("item_id").notNullable().comment("商品ID");
    table.integer("price").notNullable().comment("商品價格");
    table.integer("quantity").notNullable().comment("商品數量").defaultTo(1);
    table.tinyint("sell_target").notNullable().comment("賣出目標，0:不限，1:玩家").defaultTo(0);
    table.json("sell_target_list").nullable().comment("賣出目標玩家列表");
    table.tinyint("status").notNullable().comment("狀態，0:未出售，1:已出售，-1:取消").defaultTo(0);
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
