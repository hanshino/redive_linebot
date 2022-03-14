const base = require("../base");

class CouponUsedHistory extends base {}

module.exports = new CouponUsedHistory({
  table: "coupon_used_history",
  fillable: ["coupon_code_id", "user_id"],
});
