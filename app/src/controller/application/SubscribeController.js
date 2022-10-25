const { text } = require("bottender/router");
const { get } = require("lodash");
const SubscribeCard = require("../../model/application/SubscribeCard");
const SubscribeCardCoupon = require("../../model/application/SubscribeCardCoupon");
const SubscribeUser = require("../../model/application/SubscribeUser");
const mement = require("moment");
const i18n = require("../../util/i18n");

exports.router = [
  text(/^[.#/](訂閱兌換|sub-coupon)\s(?<serial_number>[\w-]{36})$/, subscribeCouponExchange),
];

/**
 * 兌換訂閱卡
 * @param {import("bottender").LineContext} context
 * @param {import("bottender").Props} param1
 */
async function subscribeCouponExchange(context, props) {
  const serialNumber = get(props, "match.groups.serial_number");
  const { userId } = context.event.source;
  const coupon = await SubscribeCardCoupon.first({
    filter: {
      serial_number: serialNumber,
    },
  });

  if (!coupon) {
    await context.sendText(i18n.__("message.subscribe.serial_number_not_found"));
    return;
  }

  if (get(coupon, "status") === SubscribeCardCoupon.status.used) {
    await context.replyText(i18n.__("message.subscribe.serial_number_used"));
    return;
  }

  const card = await SubscribeCard.first({
    filter: {
      key: get(coupon, "subscribe_card_key"),
    },
  });

  if (!card) {
    await context.replyText(
      i18n.__("message.error_contact_admin", {
        user_id: userId,
        error_key: "subscribe_card_not_found",
      })
    );
    return;
  }

  const user = await SubscribeUser.first({
    filter: {
      user_id: userId,
      subscribe_card_key: get(card, "key"),
    },
  });
  let needCreate = user ? false : true;
  let userData;
  let isContinue;

  if (user) {
    let { user: data, isContinue: cont } = handleUser(user, card);
    userData = data;
    isContinue = cont;
  } else {
    userData = {
      user_id: userId,
      subscribe_card_key: get(card, "key"),
      start_at: mement().toDate(),
      end_at: mement().add(get(card, "duration"), "days").toDate(),
    };
  }

  const trx = await SubscribeCardCoupon.transaction();
  try {
    SubscribeUser.setTransaction(trx);
    if (needCreate) {
      await SubscribeUser.create(userData);
    } else {
      await SubscribeUser.update(get(user, "id"), userData);
    }

    await trx
      .update({
        status: SubscribeCardCoupon.status.used,
        used_at: mement().toDate(),
        used_by: userId,
      })
      .table(SubscribeCardCoupon.table)
      .where({
        id: get(coupon, "id"),
      });

    trx.commit();
  } catch (e) {
    trx.rollback();
    await context.replyText(
      i18n.__("message.error_contact_admin", {
        user_id: userId,
        error_key: "subscribe_coupon_exchange",
      })
    );
    console.error(e);
    return;
  }

  let messages = [];

  if (isContinue) {
    messages.push(
      i18n.__("message.subscribe.coupon_exchange_success_continue", {
        end_at: mement(get(userData, "end_at")).format("YYYY-MM-DD"),
      })
    );
  }

  messages.push(
    i18n.__("message.subscribe.coupon_exchange_success", {
      name: get(card, "name"),
    })
  );

  const effects = get(card, "effects", []);
  effects.forEach(effect =>
    messages.push(
      i18n.__("message.subscribe.effects_row", {
        type: i18n.__(`message.subscribe.effects.${effect.type}`),
        value: effect.value,
      })
    )
  );

  await context.replyText(messages.join("\n"));
}

/**
 * 處理已有資料的用戶是否要延長訂閱，或是要重新訂閱
 * 1. 如果已過期，則重新訂閱
 * 2. 如果未過期，則延長訂閱
 * @param {Object} user
 * @param {Object} card
 */
function handleUser(user, card) {
  const now = mement();
  const endAt = mement(get(user, "end_at"));
  let isContinue = false;

  if (endAt.isBefore(now)) {
    // 已過期
    user.start_at = now.toDate();
    user.end_at = now.add(get(card, "duration"), "days").toDate();
    isContinue = false;
  } else {
    // 未過期
    user.end_at = endAt.add(get(card, "duration"), "days").toDate();
    isContinue = true;
  }

  return { user, isContinue };
}
