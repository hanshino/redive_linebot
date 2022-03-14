const base = require("../base");

class CouponCode extends base {}

module.exports = new CouponCode({
  table: "coupon_code",
  fillable: ["code", "start_at", "end_at", "reward"],
});
