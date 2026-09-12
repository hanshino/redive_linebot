const base = require("../base");

class Sponsorship extends base {
  /**
   * 冪等鍵查找。建立流程先查這個，重送同一 request_id 時比對 fingerprint。
   * @param {String} requestId
   * @param {import("knex").Knex.Transaction} [trx]
   */
  findByRequestId(requestId, trx) {
    return this.qb(trx).where({ request_id: requestId }).first();
  }

  /**
   * 該玩家累積登記贊助金額（decimal SUM，交給 DB 算，不在 JS 端加總 float）。
   * @param {Number} userId
   * @param {import("knex").Knex.Transaction} [trx]
   */
  sumAmountByUser(userId, trx) {
    return this.qb(trx).where({ user_id: userId }).sum({ total: "amount" }).first();
  }

  /**
   * 該玩家的贊助清單（含未綁定前非本玩家；只回已綁定給該 user_id 的紀錄）。
   * @param {Number} userId
   * @param {import("knex").Knex.Transaction} [trx]
   */
  listByUser(userId, trx) {
    return this.qb(trx).where({ user_id: userId }).orderBy("received_at", "desc");
  }

  /**
   * 列表查詢：依 type / 是否已綁定篩選，分頁。
   * @param {Object} param0
   * @param {"new"|"history"} [param0.type]
   * @param {Boolean} [param0.bound]
   * @param {Number} param0.page
   * @param {Number} param0.perPage
   */
  search({ type, bound, page = 1, perPage = 20 } = {}) {
    let query = this.qb().select("*");
    if (type) query = query.where({ type });
    if (bound === true) query = query.whereNotNull("user_id");
    if (bound === false) query = query.whereNull("user_id");
    return query
      .orderBy("received_at", "desc")
      .orderBy("id", "desc")
      .limit(perPage)
      .offset((page - 1) * perPage);
  }

  /**
   * 與 search 用同一組條件計數，供分頁 total 使用。
   * @param {Object} param0
   */
  async countSearch({ type, bound } = {}) {
    let query = this.qb();
    if (type) query = query.where({ type });
    if (bound === true) query = query.whereNotNull("user_id");
    if (bound === false) query = query.whereNull("user_id");
    const row = await query.count({ c: "*" }).first();
    return Number((row && row.c) || 0);
  }

  /**
   * 補綁交易內用：鎖住該筆贊助再檢查/更新 user_id，避免併發補綁互相覆蓋。
   * @param {Number} id
   * @param {import("knex").Knex.Transaction} trx
   */
  lockById(id, trx) {
    return this.qb(trx).where({ id }).forUpdate().first();
  }
}

module.exports = new Sponsorship({
  table: "sponsorship",
  fillable: [
    "request_id",
    "fingerprint",
    "type",
    "user_id",
    "currency",
    "amount",
    "received_at",
    "payment_method",
    "external_ref",
    "note",
    "card_key",
    "card_count",
    "operator_user_id",
    "bound_at",
  ],
});
