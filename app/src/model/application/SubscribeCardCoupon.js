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
}

module.exports = new SubscribeCardCoupon({
  table: "subscribe_card_coupon",
  fillable: ["subscribe_card_key", "serial_number", "status", "used_at", "used_by", "issued_by"],
});
