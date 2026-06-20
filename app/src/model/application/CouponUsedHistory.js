const base = require("../base");

class CouponUsedHistory extends base {
  countGroupedByCoupon() {
    return this.knex.select("coupon_code_id").count("* as count").groupBy("coupon_code_id");
  }

  async countByCoupon(couponCodeId) {
    const [row] = await this.knex.where({ coupon_code_id: couponCodeId }).count("* as count");
    return Number(row ? row.count : 0);
  }

  recentByCoupon(couponCodeId, limit = 100) {
    return this.knex
      .where({ coupon_code_id: couponCodeId })
      .select("user_id", "created_at")
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  dailyByCoupon(couponCodeId) {
    return this.knex
      .where({ coupon_code_id: couponCodeId })
      .select(this.connection.raw("DATE(created_at) as date"))
      .count("* as count")
      .groupBy("date")
      .orderBy("date", "asc");
  }
}

module.exports = new CouponUsedHistory({
  table: "coupon_used_history",
  fillable: ["coupon_code_id", "user_id"],
});
