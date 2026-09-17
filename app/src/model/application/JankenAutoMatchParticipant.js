const { pick } = require("lodash");
const base = require("../base");

const STATUS = Object.freeze({
  BYE: "bye",
  NOT_STARTED: "not_started",
  COMPLETED: "completed",
  FAILED: "failed",
});

const ROLE = Object.freeze({ P1: "p1", P2: "p2" });

/**
 * 自動配對 participant manifest（KTD2）。`(run_date, user_id)` 為 PK。
 * manifest 一旦寫入即不可變（對手、角色、出拳、快照不重抽）；只有 `status` 會單向推進：
 * not_started → completed（與結算同 commit）或 not_started → failed（status-only CAS）。
 * bye 是終態。這裡不提供任何「往回改」的方法。
 */
class JankenAutoMatchParticipant extends base {
  /**
   * 在 claim 同一交易內批次寫入 manifest。
   * @param {Array<Object>} rows 每列 fillable 欄位；bye 列 match_id/role/opponent_user_id/choice 為 null
   * @param {import("knex").Knex.Transaction} [trx]
   */
  insertManifest(rows, trx) {
    return this.insert(
      rows.map(row => pick(row, this.fillable)),
      trx
    );
  }

  /**
   * @param {String} matchId
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<Array<Object>>} 兩列（p1/p2），依 user_id ASC
   */
  findByMatchId(matchId, trx) {
    return this.qb(trx).where({ match_id: matchId }).orderBy("user_id", "asc");
  }

  /**
   * 執行交易內鎖住該場兩列（鎖序 ②），依 user_id ASC。
   * @param {String} matchId
   * @param {import("knex").Knex.Transaction} trx
   * @returns {Promise<Array<Object>>}
   */
  lockByMatchId(matchId, trx) {
    return this.qb(trx).where({ match_id: matchId }).orderBy("user_id", "asc").forUpdate();
  }

  /**
   * @param {String} userId
   * @param {String} runDate "YYYY-MM-DD"
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<?Object>}
   */
  findByUserAndDate(userId, runDate, trx) {
    return this.qb(trx).where({ user_id: userId, run_date: runDate }).first();
  }

  /**
   * 該日 status = bye 的 user_id 清單（R8 昨日輪空優先層的資料來源）。
   * @param {String} runDate
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<Array<String>>}
   */
  async findByeUserIds(runDate, trx) {
    const rows = await this.qb(trx)
      .where({ run_date: runDate, status: STATUS.BYE })
      .select("user_id");
    return rows.map(row => row.user_id);
  }

  /**
   * 該場兩列 not_started → completed。必須與結算在同一個 trx。
   * @param {String} matchId
   * @param {import("knex").Knex.Transaction} trx
   * @returns {Promise<Number>} 受影響列數（正常為 2；0 代表該場已不是 not_started）
   */
  markCompleted(matchId, trx) {
    return this.casFromNotStarted(matchId, STATUS.COMPLETED, trx);
  }

  /**
   * 該場兩列 not_started → failed。極短的 status-only CAS，不含金流，在該場交易 rollback 之後呼叫。
   * @param {String} matchId
   * @param {import("knex").Knex.Transaction} [trx]
   * @returns {Promise<Number>} 受影響列數
   */
  markFailed(matchId, trx) {
    return this.casFromNotStarted(matchId, STATUS.FAILED, trx);
  }

  casFromNotStarted(matchId, toStatus, trx) {
    return this.qb(trx)
      .where({ match_id: matchId, status: STATUS.NOT_STARTED })
      .update({ status: toStatus });
  }
}

module.exports = new JankenAutoMatchParticipant({
  table: "janken_auto_match_participant",
  fillable: [
    "run_date",
    "user_id",
    "match_id",
    "role",
    "opponent_user_id",
    "choice",
    "match_generation",
    "bet_enabled",
    "bet_generation",
    "bet_cap",
    "status",
  ],
});
module.exports.STATUS = STATUS;
module.exports.ROLE = ROLE;
