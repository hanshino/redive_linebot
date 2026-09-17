const base = require("../base");

class UserAutoPreference extends base {
  /**
   * 交易內鎖住該使用者的偏好列（若存在）再讀。用於 KTD11 re-consent 與 KTD12 PUT 的寫入，
   * 以及 worker 每場執行時重讀即時 generation／cap。查無回 undefined。
   * @param {String} userId
   * @param {import("knex").Knex.Transaction} trx
   * @returns {Promise<?Object>}
   */
  lockByUserId(userId, trx) {
    return this.qb(trx).where({ user_id: userId }).forUpdate().first();
  }

  updateByUserId(userId, attributes, trx) {
    return this.qb(trx).where({ user_id: userId }).update(attributes);
  }
}

module.exports = new UserAutoPreference({
  table: "user_auto_preference",
  fillable: [
    "user_id",
    "auto_daily_gacha",
    "auto_daily_gacha_mode",
    "auto_janken_fate",
    "auto_janken_fate_with_bet",
    "auto_match_enabled",
    "auto_match_generation",
    "auto_match_bet_enabled",
    "auto_match_bet_generation",
    "auto_match_bet_cap",
  ],
});
