const base = require("../base");
const SubscribeJobLog = require("./SubscribeJobLog");

class SubscribeUser extends base {
  static ELIGIBLE_AUTO_MATCH_CARD_KEYS = Object.freeze(["month", "season"]);

  /**
   * 兌換交易內用：鎖住該 (user_id, subscribe_card_key) 那一行（若存在）再讀 end_at，
   * 序列化同一玩家同一卡種的並發兌換。查無資料回傳 undefined（走建立路徑）。
   * 見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §7。
   * @param {String} userId
   * @param {String} subscribeCardKey
   * @param {import("knex").Knex.Transaction} trx
   */
  lockByUserAndCard(userId, subscribeCardKey, trx) {
    return this.qb(trx)
      .where({ user_id: userId, subscribe_card_key: subscribeCardKey })
      .forUpdate()
      .first();
  }

  /** KTD11/U8：同一 user 的月卡＋季卡一律按 id 取得 FOR UPDATE。 */
  lockEligibleByUser(userId, trx) {
    return this.qb(trx)
      .where({ user_id: userId })
      .whereIn("subscribe_card_key", SubscribeUser.ELIGIBLE_AUTO_MATCH_CARD_KEYS)
      .orderBy("id", "asc")
      .forUpdate();
  }

  findEligibleByUser(userId, trx) {
    return this.qb(trx)
      .where({ user_id: userId })
      .whereIn("subscribe_card_key", SubscribeUser.ELIGIBLE_AUTO_MATCH_CARD_KEYS)
      .orderBy("id", "asc");
  }

  hasActiveAt(rows, now) {
    const timestamp = new Date(now).getTime();
    return rows.some(
      row =>
        new Date(row.start_at).getTime() <= timestamp && timestamp < new Date(row.end_at).getTime()
    );
  }

  isEligibleCardKey(key) {
    return SubscribeUser.ELIGIBLE_AUTO_MATCH_CARD_KEYS.includes(key);
  }

  /**
   * 取得每日配給的使用者
   * @param {Object} options 選填參數
   * @param {String} options.key 訂閱卡種類
   * @param {import("moment").Moment} options.now 當下時間
   * @returns {import("knex").Knex.QueryBuilder}
   */
  getDailyRation({ key, now }) {
    const query = this.knex
      .where("subscribe_card_key", key)
      .andWhere("start_at", "<=", now.toDate())
      .andWhere("end_at", ">", now.toDate())
      .whereNotIn("user_id", function (builder) {
        builder
          .select("user_id")
          .from(SubscribeJobLog.table)
          .where("type", "=", `${key}_daily_ration`)
          .andWhere("created_at", ">=", now.startOf("day").toDate())
          .andWhere("created_at", "<=", now.endOf("day").toDate());
      });

    // console.log(query.toQuery());

    return query;
  }
}

module.exports = new SubscribeUser({
  table: "subscribe_user",
  fillable: ["user_id", "subscribe_card_key", "start_at", "end_at"],
});
