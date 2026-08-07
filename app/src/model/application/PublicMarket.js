const base = require("../base");

const OPEN = "open";

class PublicMarket extends base {
  /**
   * 單筆掛單 + 角色名稱。
   * @param {Number} id
   * @param {import("knex").Knex.Transaction} [trx]
   */
  getById(id, trx) {
    return this.selectWithName(trx)
      .where({ [`${this.table}.id`]: id })
      .first();
  }

  /**
   * 同 getById，但加上 `FOR UPDATE` 行鎖 —— 購買流程用，
   * 兩個買家同時打進來時第二個會卡在這裡直到第一個 commit，
   * 之後讀到的 status 已是 sold，於是拿到 ALREADY_TAKEN。
   * @param {Number} id
   * @param {import("knex").Knex.Transaction} trx
   */
  lockById(id, trx) {
    return this.qb(trx).where({ id }).forUpdate().first();
  }

  selectWithName(trx) {
    return this.qb(trx)
      .select([
        { id: `${this.table}.id` },
        { itemId: "item_id" },
        { sellerId: "seller_id" },
        { buyerId: "buyer_id" },
        "price",
        "fee",
        "status",
        { createdAt: `${this.table}.created_at` },
        { soldAt: "sold_at" },
        { closedAt: "closed_at" },
        { name: "gacha_pool.Name" },
        { headImage: "gacha_pool.HeadImage_Url" },
        { star: "gacha_pool.Star" },
      ])
      .leftJoin("gacha_pool", "gacha_pool.ID", `${this.table}.item_id`);
  }

  /**
   * 掛單簿：目前有開放掛單的角色，附掛單數與最低價。
   * Star 一併帶出給前端渲染 ★；它跟著 item_id 走（函數相依），
   * 但 MySQL 8 預設 ONLY_FULL_GROUP_BY 不認這層推導，所以必須列進 groupBy。
   */
  getOpenCharacters() {
    return this.qb()
      .select([
        { itemId: `${this.table}.item_id` },
        { name: "gacha_pool.Name" },
        { headImage: "gacha_pool.HeadImage_Url" },
        { star: "gacha_pool.Star" },
        { listingCount: this.connection.raw("COUNT(*)") },
        { minPrice: this.connection.raw("MIN(`price`)") },
      ])
      .leftJoin("gacha_pool", "gacha_pool.ID", `${this.table}.item_id`)
      .where({ status: OPEN })
      .groupBy(
        `${this.table}.item_id`,
        "gacha_pool.Name",
        "gacha_pool.HeadImage_Url",
        "gacha_pool.Star"
      )
      .orderBy("minPrice", "asc");
  }

  /**
   * 某角色的開放掛單，價低優先。
   * @param {Number} itemId
   */
  getOpenListingsByItemId(itemId) {
    return this.selectWithName()
      .where({ [`${this.table}.item_id`]: itemId, [`${this.table}.status`]: OPEN })
      .orderBy("price", "asc")
      .orderBy(`${this.table}.id`, "asc");
  }

  /**
   * 賣家的開放掛單。
   * @param {String} sellerId
   * @param {import("knex").Knex.Transaction} [trx]
   */
  getOpenListingsBySeller(sellerId, trx) {
    return this.selectWithName(trx)
      .where({ [`${this.table}.seller_id`]: sellerId, [`${this.table}.status`]: OPEN })
      .orderBy(`${this.table}.created_at`, "desc");
  }

  /**
   * 使用者參與過、已結束的掛單（賣家或買家皆算）。
   * @param {String} userId
   * @param {Number} limit
   */
  getClosedListingsByUser(userId, limit = 50) {
    return this.selectWithName()
      .whereNot({ [`${this.table}.status`]: OPEN })
      .where(qb =>
        qb.where(`${this.table}.seller_id`, userId).orWhere(`${this.table}.buyer_id`, userId)
      )
      .orderByRaw("COALESCE(`sold_at`, `closed_at`, `public_market`.`updated_at`) DESC")
      .limit(limit);
  }

  /**
   * 賣家目前開放掛單數。
   * @param {String} sellerId
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<Number>}
   */
  async countOpenBySeller(sellerId, trx) {
    const row = await this.qb(trx)
      .where({ seller_id: sellerId, status: OPEN })
      .count({ c: "*" })
      .first();
    return Number(row && row.c ? row.c : 0);
  }

  /**
   * 全站開放掛單數。
   * @returns {Promise<Number>}
   */
  async countOpen() {
    const row = await this.qb().where({ status: OPEN }).count({ c: "*" }).first();
    return Number(row && row.c ? row.c : 0);
  }

  /**
   * 賣家是否已對同一角色掛過單。
   * @param {String} sellerId
   * @param {Number} itemId
   * @param {import("knex").Knex.Transaction} [trx]
   */
  findOpenBySellerAndItem(sellerId, itemId, trx) {
    return this.qb(trx).where({ seller_id: sellerId, item_id: itemId, status: OPEN }).first();
  }

  /**
   * 條件式成交：只有還在 open 的列會被更新，回傳受影響列數。
   * 即使沒有 FOR UPDATE 也不可能兩個買家都拿到 1。
   * @param {Number} id
   * @param {String} buyerId
   * @param {import("knex").Knex.Transaction} trx
   * @returns {Promise<Number>}
   */
  markSold(id, buyerId, trx) {
    return this.qb(trx)
      .where({ id, status: OPEN })
      .update({ status: "sold", buyer_id: buyerId, sold_at: new Date() });
  }

  /**
   * 條件式關閉（取消 / 失效）。
   * @param {Number} id
   * @param {"cancelled"|"invalid"} status
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<Number>}
   */
  markClosed(id, status, trx) {
    return this.qb(trx).where({ id, status: OPEN }).update({ status, closed_at: new Date() });
  }
}

module.exports = new PublicMarket({
  table: "public_market",
  fillable: ["seller_id", "buyer_id", "item_id", "price", "fee", "status", "sold_at", "closed_at"],
});
