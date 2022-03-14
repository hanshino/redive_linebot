const { text } = require("bottender/router");
const { get } = require("lodash");
const minimist = require("minimist");
const i18n = require("../../util/i18n");
const ajv = require("../../util/ajv");
const couponCode = require("../../model/application/CouponCode");
const { DefaultLogger } = require("../../util/Logger");
const moment = require("moment");

exports.adminRouter = [text(/^[/.]coupon add/, addCoupon)];

/**
 * [管理員] 新增優惠券
 * @param {import ("bottender").LineContext} context
 */
async function addCoupon(context) {
  const args = minimist(context.event.text.split(" "));

  if (args.h || args.help) {
    return context.replyText(i18n.__("message.coupon.admin_add_usage"));
  }

  const [code, startAt, endAt, reward] = [
    get(args, "_.2"),
    get(args, "start", get(args, "s")),
    get(args, "end", get(args, "e")),
    get(args, "reward", get(args, "r")),
  ];

  const data = { code, startAt, endAt, reward };
  const validate = ajv.getSchema("couponAdd");
  const valid = validate(data);

  if (!valid) {
    DefaultLogger.warn(
      `[CouponController.addCoupon] Validation failed: ${JSON.stringify(validate.errors)}`
    );
    return context.replyText(i18n.__("message.coupon.admin_add_invalid_param"));
  }

  try {
    const id = await couponCode.create({
      ...data,
      reward: {
        type: "god_stone",
        value: reward,
      },
      start_at: moment(startAt).toDate(),
      end_at: moment(endAt).toDate(),
    });

    return context.replyText(i18n.__("message.coupon.admin_add_success", { id, code }));
  } catch (e) {
    DefaultLogger.error(e);
    return context.replyText(i18n.__("message.coupon.admin_add_failed"));
  }
}

/**
 * 使用者使用優惠券
 * @param {import ("bottender").LineContext} context
 */
async function useCoupon(context) {}
