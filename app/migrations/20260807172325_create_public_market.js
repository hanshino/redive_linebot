// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * public_market：公開市場（角色委託所）掛單簿。
 *
 * 與 market_detail（1 對 1 指名交易）完全獨立，兩張表互不影響。
 *
 * status 使用字串 enum 而非 market_detail 的 tinyint：
 * 這裡有四種狀態（open/sold/cancelled/invalid），tinyint 的 0/1/-1 慣例撐不到第四種，
 * 而且 API 合約本來就以字串回傳，DB 直接存字串可省掉一層對照表。
 *
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("public_market", table => {
    table.bigIncrements("id").primary();
    table.string("seller_id", 33).notNullable().comment("賣家 LINE userId");
    table.string("buyer_id", 33).nullable().comment("買家 LINE userId，成交才有值");
    table.integer("item_id").unsigned().notNullable().comment("角色 ID，對應 gacha_pool.ID");
    table.integer("price").unsigned().notNullable().comment("掛單售價（買家實付）");
    table.integer("fee").unsigned().notNullable().comment("手續費，成交價 5% 無條件進位，銷毀");
    table
      .enu("status", ["open", "sold", "cancelled", "invalid"])
      .notNullable()
      .defaultTo("open")
      .comment("open:掛單中, sold:已成交, cancelled:賣家取消, invalid:賣家已無此角色自動下架");
    table.datetime("sold_at").nullable().comment("成交時間");
    table.datetime("closed_at").nullable().comment("取消／失效時間");
    table.timestamps(true, true);

    // 掛單簿主查詢：某角色的開放掛單，價低優先
    table.index(["item_id", "status", "price"], "idx_public_market_book");
    // 賣家掛單上限檢查
    table.index(["seller_id", "status"], "idx_public_market_seller_status");
    table.index(["buyer_id"], "idx_public_market_buyer");
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("public_market");
};
