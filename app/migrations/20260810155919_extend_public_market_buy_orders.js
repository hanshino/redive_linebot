// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * public_market 第二階段：同一張表同時放賣單與收購單。
 *
 * 為什麼不開第二張表：兩種單共用掛單上限、共用「我的掛單」、共用成交結算，
 * 拆表等於每一條查詢都要 UNION，而欄位其實只差一個方向旗標。
 *
 * 方向與欄位對應（不變量，service 全靠這條）：
 *   sell → 發布者 = seller_id（買家成交時填 buyer_id）
 *   buy  → 發布者 = buyer_id，seller_id 保持 NULL 直到有人履約才寫入
 * 所以 seller_id 必須放寬成 nullable；既有資料全部是 sell，靠 DEFAULT 'sell' 自然補齊。
 *
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("public_market", table => {
    table
      .enu("order_type", ["sell", "buy"])
      .notNullable()
      .defaultTo("sell")
      .comment("sell:賣單（發布者為 seller_id）, buy:收購單（發布者為 buyer_id）");
  });

  // 收購單開放期間沒有賣家，成交才知道是誰履約。
  await knex.schema.alterTable("public_market", table => {
    table
      .string("seller_id", 33)
      .nullable()
      .comment("賣家 LINE userId；收購單在成交前為 NULL")
      .alter();
  });

  // 掛單簿查詢多了方向這個等值條件，且它的選擇度比 status 高（各佔一半），
  // 放在 item_id 之後才能讓 price 那段繼續走索引排序。
  await knex.schema.alterTable("public_market", table => {
    table.dropIndex(null, "idx_public_market_book");
    table.dropIndex(null, "idx_public_market_seller_status");
    table.dropIndex(null, "idx_public_market_buyer");
  });

  await knex.schema.alterTable("public_market", table => {
    table.index(["item_id", "order_type", "status", "price"], "idx_public_market_book");
    // 掛單上限是「賣單 + 收購單」合計，兩個方向各查一次自己的發布者欄位，
    // 所以兩支索引都要能單獨吃下 (發布者, 方向, 狀態)。
    table.index(["seller_id", "order_type", "status"], "idx_public_market_seller_status");
    table.index(["buyer_id", "order_type", "status"], "idx_public_market_buyer");
  });
};

/**
 * 回滾會刪掉 order_type，收購單的方向資訊就永久消失，
 * 剩下的資料會被當成賣單（seller_id 還是 NULL）解讀 —— 那是資產錯帳，不是資料遺失而已。
 * 所以只要表裡還有任何一張收購單就拒絕回滾，要求人工先處理（取消並退款）。
 *
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  const row = await knex("public_market").where({ order_type: "buy" }).count({ c: "*" }).first();
  const buyCount = Number((row && row.c) || 0);

  if (buyCount > 0) {
    throw new Error(
      `Refusing destructive rollback: public_market still has ${buyCount} buy order(s). ` +
        "Cancel and refund them first (each open buy order holds escrowed god stones)."
    );
  }

  await knex.schema.alterTable("public_market", table => {
    table.dropIndex(null, "idx_public_market_book");
    table.dropIndex(null, "idx_public_market_seller_status");
    table.dropIndex(null, "idx_public_market_buyer");
  });

  await knex.schema.alterTable("public_market", table => {
    table.dropColumn("order_type");
  });

  await knex.schema.alterTable("public_market", table => {
    table.string("seller_id", 33).notNullable().comment("賣家 LINE userId").alter();
  });

  await knex.schema.alterTable("public_market", table => {
    table.index(["item_id", "status", "price"], "idx_public_market_book");
    table.index(["seller_id", "status"], "idx_public_market_seller_status");
    table.index(["buyer_id"], "idx_public_market_buyer");
  });
};
