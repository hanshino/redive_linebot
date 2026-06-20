const CouponService = require("../../service/CouponService");
const i18n = require("../../util/i18n");

const NOT_FOUND_MSG = "找不到此兌換券";

const CONFLICT = {
  COUPON_DUPLICATED: "兌換碼已存在",
  COUPON_CODE_LOCKED: "已有領取紀錄，無法修改兌換碼",
  COUPON_HAS_REDEMPTIONS: "已有領取紀錄，無法刪除",
};

function respondError(res, e) {
  if (e.code === "COUPON_INVALID") {
    return res.status(400).json({ message: i18n.__("api.error.bad_request"), error: e.errors });
  }
  if (e.code === "COUPON_NOT_FOUND") {
    return res.status(404).json({ message: NOT_FOUND_MSG });
  }
  if (CONFLICT[e.code]) {
    return res.status(409).json({ message: CONFLICT[e.code] });
  }
  return res.status(500).json({ message: i18n.__("api.error.unknown") });
}

exports.list = async (req, res) => {
  try {
    res.json(await CouponService.list());
  } catch (e) {
    respondError(res, e);
  }
};

exports.detail = async (req, res) => {
  try {
    const coupon = await CouponService.find(req.params.id);
    if (!coupon) return res.status(404).json({ message: NOT_FOUND_MSG });
    res.json(coupon);
  } catch (e) {
    respondError(res, e);
  }
};

exports.store = async (req, res) => {
  try {
    const id = await CouponService.create(req.body);
    res.status(201).json({ id });
  } catch (e) {
    respondError(res, e);
  }
};

exports.update = async (req, res) => {
  try {
    await CouponService.update(req.params.id, req.body);
    res.json({});
  } catch (e) {
    respondError(res, e);
  }
};

exports.destroy = async (req, res) => {
  try {
    await CouponService.destroy(req.params.id);
    res.json({});
  } catch (e) {
    respondError(res, e);
  }
};
