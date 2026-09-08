const base = require("../base");

const OPEN = "open";
const SELL = "sell";
const BUY = "buy";
const CHARACTER = "character";

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
   * 同 getById，但加上 `FOR UPDATE` 行鎖 —— 購買／履約流程用，
   * 兩個人同時打進來時第二個會卡在這裡直到第一個 commit，
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
        { itemKind: "item_kind" },
        "quantity",
        { orderType: "order_type" },
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
   * 掛單簿：某方向目前有開放掛單的角色，附掛單數與「最佳價」。
   * 最佳價的定義隨方向翻轉：賣單是最低售價（買方角度最划算），
   * 收購單是最高收購價（賣方角度最划算）。排序同理。
   *
   * Star 一併帶出給前端渲染 ★；它跟著 item_id 走（函數相依），
   * 但 MySQL 8 預設 ONLY_FULL_GROUP_BY 不認這層推導，所以必須列進 groupBy。
   *
   * @param {"sell"|"buy"} [orderType]
   * @param {"character"|"fragment"} [itemKind]
   */
  getOpenCharacters(orderType = SELL, itemKind = CHARACTER) {
    const isBuy = orderType === BUY;

    return this.qb()
      .select([
        { itemId: `${this.table}.item_id` },
        { name: "gacha_pool.Name" },
        { headImage: "gacha_pool.HeadImage_Url" },
        { star: "gacha_pool.Star" },
        { listingCount: this.connection.raw("COUNT(*)") },
        {
          bestPrice: this.connection.raw(isBuy ? "MAX(`price`)" : "MIN(`price`)"),
        },
      ])
      .leftJoin("gacha_pool", "gacha_pool.ID", `${this.table}.item_id`)
      .where({ status: OPEN, order_type: orderType, item_kind: itemKind })
      .groupBy(
        `${this.table}.item_id`,
        "gacha_pool.Name",
        "gacha_pool.HeadImage_Url",
        "gacha_pool.Star"
      )
      .orderBy("bestPrice", isBuy ? "desc" : "asc");
  }

  /**
   * 某角色某方向的開放掛單。賣單價低優先、收購單價高優先。
   *
   * price 一律是「每片／每隻」單價，碎片單的總額是 price × quantity。
   * 排序刻意用 price 而非總額 —— 掛單簿比的是單價，不同 quantity 的單才能互相比較。
   *
   * @param {Number} itemId
   * @param {"sell"|"buy"} [orderType]
   * @param {"character"|"fragment"} [itemKind]
   */
  getOpenListingsByItemId(itemId, orderType = SELL, itemKind = CHARACTER) {
    return this.selectWithName()
      .where({
        [`${this.table}.item_id`]: itemId,
        [`${this.table}.status`]: OPEN,
        [`${this.table}.order_type`]: orderType,
        [`${this.table}.item_kind`]: itemKind,
      })
      .orderBy("price", orderType === BUY ? "desc" : "asc")
      .orderBy(`${this.table}.id`, "asc");
  }

  /**
   * 發布者的開放掛單（賣單 + 收購單）。
   *
   * 「發布者」欄位隨方向不同：賣單看 seller_id，收購單看 buyer_id
   * （收購單開著的時候 seller_id 是 NULL，成交才填上履約的人）。
   *
   * @param {String} userId
   * @param {import("knex").Knex.Transaction} [trx]
   */
  getOpenListingsByRequester(userId, trx) {
    return this.selectWithName(trx)
      .where({ [`${this.table}.status`]: OPEN })
      .where(qb => this.applyRequesterFilter(qb, userId))
      .orderBy(`${this.table}.created_at`, "desc");
  }

  /**
   * 「這張單是不是 userId 發的」的 where 片段，兩個方向各看各的欄位。
   * @param {import("knex").Knex.QueryBuilder} qb
   * @param {String} userId
   */
  applyRequesterFilter(qb, userId) {
    return qb
      .where(inner =>
        inner.where(`${this.table}.order_type`, SELL).andWhere(`${this.table}.seller_id`, userId)
      )
      .orWhere(inner =>
        inner.where(`${this.table}.order_type`, BUY).andWhere(`${this.table}.buyer_id`, userId)
      );
  }

  /**
   * 使用者參與過、已結束的掛單（賣家或買家皆算，兩個方向都包含）。
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
   * 發布者目前的開放掛單數 —— 賣單與收購單「合計」，上限是共用的。
   *
   * 刻意「不」加 FOR UPDATE。這個 where 是跨兩支索引的 OR，加鎖會變成範圍鎖甚至全表掃描，
   * 而呼叫端（發收購單）當下正握著自己 inventory 的餘額鎖 —— purchase / fulfill 的鎖序
   * 卻是「先掛單列、後 inventory」，兩邊相反就有死鎖。
   * 正確性由呼叫端保證：發單流程的第一個語句是餘額的 locking read，同一使用者的並發
   * 發單已經在那裡排隊；等它醒來才做這次計數，快照建立在前一筆 commit 之後，數得到。
   *
   * @param {String} userId
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<Number>}
   */
  async countOpenByRequester(userId, trx) {
    const row = await this.qb(trx)
      .where({ status: OPEN })
      .where(qb => this.applyRequesterFilter(qb, userId))
      .count({ c: "*" })
      .first();
    return Number(row && row.c ? row.c : 0);
  }

  /**
   * 全站開放掛單數（兩個方向合計）。
   * @returns {Promise<Number>}
   */
  async countOpen() {
    const row = await this.qb().where({ status: OPEN }).count({ c: "*" }).first();
    return Number(row && row.c ? row.c : 0);
  }

  /**
   * 賣家是否已對同一標的掛過賣單。
   *
   * item_kind 是條件的一部分，不是可選的過濾：同一角色的「角色賣單」與「碎片賣單」
   * 是兩種不同的商品，少了這個條件，掛了角色的人就再也掛不了同一角色的碎片
   * （反過來也一樣），會被誤判成 ALREADY_LISTED。
   *
   * @param {String} sellerId
   * @param {Number} itemId
   * @param {"character"|"fragment"} itemKind
   * @param {import("knex").Knex.Transaction} [trx]
   */
  findOpenBySellerAndItem(sellerId, itemId, itemKind = CHARACTER, trx) {
    return this.qb(trx)
      .where({
        seller_id: sellerId,
        item_id: itemId,
        item_kind: itemKind,
        status: OPEN,
        order_type: SELL,
      })
      .first();
  }

  /**
   * 買家是否已對同一標的掛過收購單。同一標的同時只能有一張，
   * 否則同一個人可以用多張單把自己的餘額重複預扣到不成比例。
   * item_kind 的理由同 findOpenBySellerAndItem。
   *
   * @param {String} buyerId
   * @param {Number} itemId
   * @param {"character"|"fragment"} itemKind
   * @param {import("knex").Knex.Transaction} [trx]
   */
  findOpenBuyByBuyerAndItem(buyerId, itemId, itemKind = CHARACTER, trx) {
    return this.qb(trx)
      .where({
        buyer_id: buyerId,
        item_id: itemId,
        item_kind: itemKind,
        status: OPEN,
        order_type: BUY,
      })
      .first();
  }

  /**
   * 條件式成交（賣單）：只有還在 open 的賣單會被更新，回傳受影響列數。
   * 即使沒有 FOR UPDATE 也不可能兩個買家都拿到 1。
   * @param {Number} id
   * @param {String} buyerId
   * @param {import("knex").Knex.Transaction} trx
   * @returns {Promise<Number>}
   */
  markSold(id, buyerId, trx) {
    return this.qb(trx)
      .where({ id, status: OPEN, order_type: SELL })
      .update({ status: "sold", buyer_id: buyerId, sold_at: new Date() });
  }

  /**
   * 條件式履約（收購單）：把履約者寫進 seller_id 並結案。
   * 帶上 order_type 條件，賣單絕不可能走到這條路徑上。
   * @param {Number} id
   * @param {String} sellerId 履約者（賣出角色的人）
   * @param {import("knex").Knex.Transaction} trx
   * @returns {Promise<Number>}
   */
  markFulfilled(id, sellerId, trx) {
    return this.qb(trx)
      .where({ id, status: OPEN, order_type: BUY })
      .update({ status: "sold", seller_id: sellerId, sold_at: new Date() });
  }

  /**
   * 條件式關閉（取消 / 失效）。受影響列數為 0 代表別人先關掉了 ——
   * 收購單的退款一律綁在這個回傳值上，才不會退兩次。
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
  fillable: [
    "order_type",
    "seller_id",
    "buyer_id",
    "item_id",
    "item_kind",
    "quantity",
    "price",
    "fee",
    "status",
    "sold_at",
    "closed_at",
  ],
});
