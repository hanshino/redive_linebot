const base = require("../base");

class CouponCode extends base {
  findByCode(code) {
    return this.knex.first().where({ code });
  }
}

module.exports = new CouponCode({
  table: "coupon_code",
  fillable: ["code", "start_at", "end_at", "reward"],
});
