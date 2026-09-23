const base = require("../base");
const SubscribeJobLog = require("./SubscribeJobLog");
const SubscribeCard = require("./SubscribeCard");

class SubscribeUser extends base {
  static ELIGIBLE_AUTO_MATCH_CARD_KEYS = Object.freeze(["month_plus"]);

  get eligibleAutoMatchCardKeys() {
    return SubscribeUser.ELIGIBLE_AUTO_MATCH_CARD_KEYS;
  }

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

  /** 續期查找不可限於 Plus；所有訂閱按 id 鎖定，呼叫端先鎖 user。 */
  lockAllByUser(userId, trx) {
    return this.findAllByUser(userId, trx).forUpdate();
  }

  findAllByUser(userId, trx) {
    return this.qb(trx).where({ user_id: userId }).orderBy("id", "asc");
  }

  hasActiveAutoMatchAt(rows, now) {
    const timestamp = new Date(now).getTime();
    return rows.some(
      row =>
        this.isEligibleCardKey(row.subscribe_card_key) &&
        new Date(row.start_at).getTime() <= timestamp &&
        timestamp < new Date(row.end_at).getTime()
    );
  }

  isEligibleCardKey(key) {
    return SubscribeUser.ELIGIBLE_AUTO_MATCH_CARD_KEYS.includes(key);
  }

  /**
   * 取得每日配給的使用者
   * 排除「當下持有有效覆蓋卡」的玩家（見 SubscribeCard.SUPERSEDED_BY）——
   * 例如持有中 month_plus 時，month 的每日配給不發（月卡倒數不受影響，本查詢不動 end_at）。
   * @param {Object} options 選填參數
   * @param {String} options.key 訂閱卡種類
   * @param {import("moment").Moment} options.now 當下時間
   * @returns {import("knex").Knex.QueryBuilder}
   */
  getDailyRation({ key, now }) {
    // now 在下方會被 startOf("day")/endOf("day") 原地改變（既有行為，見下方 whereNotIn），
    // 這裡先取一份不受影響的時間點快照，供「當下是否持有覆蓋卡」判斷使用。
    const pointInTime = now.clone().toDate();
    const supersededByKeys = SubscribeCard.SUPERSEDED_BY[key] || [];

    let query = this.knex
      .where("subscribe_card_key", key)
      .andWhere("start_at", "<=", pointInTime)
      .andWhere("end_at", ">", pointInTime)
      .whereNotIn("user_id", function (builder) {
        builder
          .select("user_id")
          .from(SubscribeJobLog.table)
          .where("type", "=", `${key}_daily_ration`)
          .andWhere("created_at", ">=", now.startOf("day").toDate())
          .andWhere("created_at", "<=", now.endOf("day").toDate());
      });

    if (supersededByKeys.length > 0) {
      query = query.whereNotIn("user_id", builder => {
        builder
          .select("user_id")
          .from(this.table)
          .whereIn("subscribe_card_key", supersededByKeys)
          .andWhere("start_at", "<=", pointInTime)
          .andWhere("end_at", ">", pointInTime);
      });
    }

    // console.log(query.toQuery());

    return query;
  }
}

module.exports = new SubscribeUser({
  table: "subscribe_user",
  fillable: ["user_id", "subscribe_card_key", "start_at", "end_at"],
});
