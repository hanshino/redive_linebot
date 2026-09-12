const base = require("../base");

class SubscribeCardCoupon extends base {
  constructor(props) {
    super(props);

    this.status = {
      unused: 0,
      used: 1,
    };

    this.key = {
      month: "month",
      season: "season",
    };
  }

  /**
   * 兌換交易內用：鎖住序號那一行再檢查狀態，避免兩個玩家同時判定「未使用」。
   * 見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §7。
   * @param {String} serialNumber
   * @param {import("knex").Knex.Transaction} trx
   */
  lockBySerialNumber(serialNumber, trx) {
    return this.qb(trx).where({ serial_number: serialNumber }).forUpdate().first();
  }
}

module.exports = new SubscribeCardCoupon({
  table: "subscribe_card_coupon",
  fillable: [
    "subscribe_card_key",
    "serial_number",
    "status",
    "used_at",
    "used_by",
    "issued_by",
    "sponsorship_id",
  ],
});
