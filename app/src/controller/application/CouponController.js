const { text } = require("bottender/router");
const { get } = require("lodash");
const minimist = require("minimist");
const i18n = require("../../util/i18n");
const ajv = require("../../util/ajv");
const couponCode = require("../../model/application/CouponCode");
const couponUsedHistory = require("../../model/application/CouponUsedHistory");
const { inventory } = require("../../model/application/Inventory");
const { DefaultLogger } = require("../../util/Logger");
const moment = require("moment");

exports.adminRouter = [text(/^[!]coupon add/, adminAdd)];

exports.router = [text(/^[/.#]兌換 (?<code>\S+)$/, userUse)];

/**
 * [管理員] 新增優惠券
 * @param {import ("bottender").LineContext} context
 */
async function adminAdd(context) {
  const args = minimist(context.event.text.split(" "));

  if (args.h || args.help) {
    return context.quoteReply(i18n.__("message.coupon.admin_add_usage"));
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
    return context.quoteReply(i18n.__("message.coupon.admin_add_invalid_param"));
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

    return context.quoteReply(i18n.__("message.coupon.admin_add_success", { id, code }));
  } catch (e) {
    DefaultLogger.error(e);
    return context.quoteReply(i18n.__("message.coupon.admin_add_failed"));
  }
}

/**
 * 使用者使用優惠券
 * @param {import ("bottender").LineContext} context
 */
async function userUse(context, props) {
  const { code } = props.match.groups;
  const { userId } = context.event.source;

  if (!userId) {
    return context.quoteReply(i18n.__("message.user_unreconized"));
  }

  const coupon = await couponCode.findByCode(code);

  if (!coupon) {
    return context.quoteReply(i18n.__("message.coupon.not_found", { code }));
  }

  const [startAt, endAt] = [moment(coupon.start_at), moment(coupon.end_at)];
  const now = moment();

  if (now.isBefore(startAt)) {
    return context.quoteReply(i18n.__("message.coupon.not_yet_available", { code }));
  }

  if (now.isAfter(endAt)) {
    return context.quoteReply(i18n.__("message.coupon.expired", { code }));
  }

  const records = await couponUsedHistory.all({
    filter: {
      coupon_code_id: {
        operator: "=",
        value: coupon.id,
      },
      user_id: {
        operator: "=",
        value: userId,
      },
    },
  });

  if (records.length > 0) {
    return context.quoteReply(i18n.__("message.coupon.already_used", { code }));
  }

  try {
    await dispatch(context, coupon.reward);

    await couponUsedHistory.create({
      user_id: userId,
      coupon_code_id: coupon.id,
    });

    return context.quoteReply(
      i18n.__("message.coupon.success", {
        code,
        reward: getRewardMessage(coupon.reward),
      })
    );
  } catch (e) {
    DefaultLogger.error(e);
    return context.quoteReply(
      i18n.__("message.coupon.failed", {
        userId,
        code,
      })
    );
  }
}

/**
 * 獎勵派送
 * @param {import ("bottender").LineContext} context
 * @param {Object} reward
 */
async function dispatch(context, reward) {
  const actions = {
    god_stone: dispatchGodStone,
  };

  const action = actions[reward.type];

  if (!action) {
    throw new Error(`[CouponController.dispatch] Unknown reward type: ${reward.type}`);
  }

  return action(context, reward);
}

/**
 * 發送女神石
 * @param {import ("bottender").LineContext} context
 * @param {Object} reward
 * @returns {Promise<int>}
 */
async function dispatchGodStone(context, reward) {
  const { userId } = context.event.source;
  const amount = parseInt(get(reward, "value", 0));

  return await inventory.create({
    userId,
    itemId: 999,
    itemAmount: amount,
  });
}

/**
 * 取得優惠券兌換成功的訊息
 * @param {Object} reward
 * @returns {String}
 */
function getRewardMessage(reward) {
  switch (reward.type) {
    case "god_stone":
      return i18n.__("message.coupon.reward_god_stone", { amount: reward.value });
    default:
      return i18n.__("message.coupon.reward_unknown");
  }
}
