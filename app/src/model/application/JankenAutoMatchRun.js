const base = require("../base");

const ER_DUP_ENTRY = "ER_DUP_ENTRY";

/**
 * 每日自動配對的 durable claim（KTD1）。`run_date` 為 PK，一天一列。
 */
class JankenAutoMatchRun extends base {
  /**
   * 普通 INSERT 搶佔當天的 claim。撞 PK 回 false（當天已在跑或已跑過），其他錯誤原樣 throw。
   * 不用 ON DUPLICATE KEY UPDATE、不看 affected rows。
   * MySQL 的 duplicate-key 只讓該 statement 失敗、不會讓外層交易進入 aborted 狀態，
   * 所以在 trx 內收到 false 後仍可繼續或正常 rollback。
   * @param {String} runDate "YYYY-MM-DD"（Asia/Taipei 曆日）
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<Boolean>} true = 本次搶到
   */
  async tryClaim(runDate, trx) {
    try {
      await this.qb(trx).insert({ run_date: runDate });
      return true;
    } catch (error) {
      if (error && error.code === ER_DUP_ENTRY) return false;
      throw error;
    }
  }

  /**
   * @param {String} runDate
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<?Object>}
   */
  findByDate(runDate, trx) {
    return this.qb(trx).where({ run_date: runDate }).first();
  }
}

module.exports = new JankenAutoMatchRun({
  table: "janken_auto_match_run",
  fillable: ["run_date"],
});
module.exports.ER_DUP_ENTRY = ER_DUP_ENTRY;
