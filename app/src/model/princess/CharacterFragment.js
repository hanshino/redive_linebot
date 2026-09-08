const base = require("../base");

/**
 * character_fragments：角色專屬碎片的「餘額列」。
 *
 * 刻意不是 ledger —— 抽卡每抽到一次重複就要記一筆的話，一年就是幾百萬列，
 * 而這個功能唯一要回答的問題是「現在有幾片」。所以用 UNIQUE(user_id, item_id)
 * 的單一餘額列 + atomic upsert，寫入是 O(1) 且不需要事後 compaction。
 *
 * 餘額歸零「不刪列」：後續扣減永遠鎖得到一列確定存在的資料，不必依賴 gap lock
 * （REPEATABLE READ 下對不存在的列下 FOR UPDATE 只拿到 gap lock，兩個並發交易
 * 可以同時持有同一個 gap 的鎖，接著雙雙 INSERT —— 那就不是序列化了）。
 */
class CharacterFragment extends base {
  /**
   * 使用者目前持有的碎片（只回 amount > 0 的），附角色名稱／頭像／原生星數。
   *
   * leftJoin 而非 join：gacha_pool 的角色被管理端刪掉時，碎片仍然是資產，
   * 不能因為 join 不到就從清單裡消失（回收路徑不需要角色資料也能跑）。
   *
   * @param {String} userId
   * @returns {import("knex").Knex.QueryBuilder}
   */
  listByUser(userId) {
    return this.knex
      .select([
        { itemId: `${this.table}.item_id` },
        { amount: `${this.table}.amount` },
        { name: "gacha_pool.Name" },
        { headImage: "gacha_pool.HeadImage_Url" },
        { star: "gacha_pool.Star" },
      ])
      .leftJoin("gacha_pool", "gacha_pool.ID", `${this.table}.item_id`)
      .where({ [`${this.table}.user_id`]: userId })
      .where(`${this.table}.amount`, ">", 0)
      .orderBy(`${this.table}.amount`, "desc")
      .orderBy(`${this.table}.item_id`, "asc");
  }

  /**
   * 單一角色的碎片餘額。
   *
   * 帶 `trx` + `forUpdate` 時是 locking read：同一使用者對同一角色的並發扣減
   * 會在這裡排隊，醒來讀到的是前一筆 commit 後的數字。沒有 trx 時 forUpdate
   * 沒有意義（autocommit 馬上釋放），直接忽略。
   *
   * @param {String} userId
   * @param {Number} itemId
   * @param {import("knex").Knex.Transaction} [trx]
   * @param {Object} [options]
   * @param {Boolean} [options.forUpdate]
   * @returns {Promise<Number>}
   */
  async getBalance(userId, itemId, trx, { forUpdate = false } = {}) {
    let query = this.qb(trx).where({ user_id: userId, item_id: itemId }).first("amount");

    if (forUpdate && trx) query = query.forUpdate();

    const row = await query;
    return Number((row && row.amount) || 0);
  }

  /**
   * 加碎片。單一語句的 atomic upsert，不需要先讀再寫，也不需要交易或行鎖 ——
   * 併發（同一次抽卡連抽、多個 worker）由 UNIQUE(user_id, item_id) 保證只有一列。
   *
   * @param {String} userId
   * @param {Number} itemId
   * @param {Number} amount 正整數
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<*>}
   */
  increase(userId, itemId, amount, trx) {
    return this.qb(trx)
      .insert({ user_id: userId, item_id: itemId, amount })
      .onConflict(["user_id", "item_id"])
      .merge({
        amount: this.connection.raw("`amount` + VALUES(`amount`)"),
        // updated_at 明確寫入，不倚賴 DDL 有沒有 ON UPDATE CURRENT_TIMESTAMP。
        updated_at: this.connection.fn.now(),
      });
  }

  /**
   * 扣碎片。呼叫端必須已經在同一個交易內用 `getBalance(..., { forUpdate: true })`
   * 鎖住這一列並驗過餘額 —— 這裡的 `amount >= ?` 只是最後一道防線，
   * 回傳受影響列數讓呼叫端能發現「鎖沒生效」並整筆 rollback。
   *
   * 歸零不刪列（見 class 註解）。
   *
   * @param {String} userId
   * @param {Number} itemId
   * @param {Number} amount 正整數
   * @param {import("knex").Knex.Transaction} trx
   * @returns {Promise<Number>} 受影響列數，0 代表餘額不足或列不存在
   */
  decreaseLocked(userId, itemId, amount, trx) {
    return this.qb(trx)
      .where({ user_id: userId, item_id: itemId })
      .where("amount", ">=", amount)
      .update({
        amount: this.connection.raw("`amount` - ?", [amount]),
        updated_at: this.connection.fn.now(),
      });
  }
}

module.exports = new CharacterFragment({
  table: "character_fragments",
  fillable: ["user_id", "item_id", "amount"],
});
