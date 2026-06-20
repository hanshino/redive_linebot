const ajv = require("../util/ajv");
const moment = require("moment");
const couponCode = require("../model/application/CouponCode");
const couponUsedHistory = require("../model/application/CouponUsedHistory");

function fail(code, extra) {
  const err = new Error(code);
  err.code = code;
  if (extra) Object.assign(err, extra);
  return err;
}

function assertValid({ code, startAt, endAt, reward }) {
  const validate = ajv.getSchema("couponAdd");
  if (!validate({ code, startAt, endAt, reward })) {
    throw fail("COUPON_INVALID", { errors: validate.errors });
  }
  if (moment(endAt).isSameOrBefore(moment(startAt))) {
    throw fail("COUPON_INVALID");
  }
}

function toRow({ code, startAt, endAt, reward }) {
  return {
    code,
    start_at: moment(startAt).toDate(),
    end_at: moment(endAt).toDate(),
    reward: { type: "god_stone", value: reward },
  };
}

async function create(payload) {
  assertValid(payload);
  if (await couponCode.findByCode(payload.code)) throw fail("COUPON_DUPLICATED");
  return couponCode.create(toRow(payload));
}

async function list() {
  const coupons = await couponCode.all({ order: [{ column: "created_at", direction: "desc" }] });
  const counts = await couponUsedHistory.countGroupedByCoupon();
  const countMap = new Map(counts.map(r => [r.coupon_code_id, Number(r.count)]));
  return coupons.map(c => ({ ...c, redeemedCount: countMap.get(c.id) || 0 }));
}

async function find(id) {
  const coupon = await couponCode.find(id);
  if (!coupon) return null;
  const [redeemedCount, redemptions, daily] = await Promise.all([
    couponUsedHistory.countByCoupon(id),
    couponUsedHistory.recentByCoupon(id, 100),
    couponUsedHistory.dailyByCoupon(id),
  ]);
  return {
    ...coupon,
    redeemedCount,
    redemptions,
    dailyRedemptions: daily.map(r => ({
      date: r.date,
      count: Number(r.count),
    })),
  };
}

async function update(id, payload) {
  const coupon = await couponCode.find(id);
  if (!coupon) throw fail("COUPON_NOT_FOUND");
  assertValid(payload);
  if (payload.code !== coupon.code) {
    if ((await couponUsedHistory.countByCoupon(id)) > 0) throw fail("COUPON_CODE_LOCKED");
    if (await couponCode.findByCode(payload.code)) throw fail("COUPON_DUPLICATED");
  }
  await couponCode.update(id, toRow(payload));
}

async function destroy(id) {
  const coupon = await couponCode.find(id);
  if (!coupon) throw fail("COUPON_NOT_FOUND");
  if ((await couponUsedHistory.countByCoupon(id)) > 0) throw fail("COUPON_HAS_REDEMPTIONS");
  await couponCode.delete(id);
}

module.exports = { create, list, find, update, destroy };
