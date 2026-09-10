const { text } = require("bottender/router");
const { get } = require("lodash");
const SubscribeCard = require("../../model/application/SubscribeCard");
const SubscribeCardCoupon = require("../../model/application/SubscribeCardCoupon");
const SubscribeUser = require("../../model/application/SubscribeUser");
const { inventory: inventoryModel } = require("../../model/application/Inventory");
const mysql = require("../../util/mysql");
const DailyRation = require("../../../bin/DailyRation");
const mement = require("moment");
const i18n = require("../../util/i18n");
const GachaController = require("../princess/gacha");
const config = require("config");
const { generateCard, generateEffect } = require("../../templates/application/Subscribe");
const AchievementEngine = require("../../service/AchievementEngine");
const { notifyUnlocks } = require("../../service/achievementNotifier");
const SubscriptionService = require("../../service/SubscriptionService");
const SubscribeCardCouponService = require("../../service/SubscribeCardCouponService");

exports.router = [
  text(/^[.#/](訂閱|sub)$/, showInformation),
  text(/^[.#/](訂閱兌換|sub-coupon)$/, context =>
    context.replyText(i18n.__("message.subscribe.coupon_exchange_manual"))
  ),
  text(/^[.#/](訂閱兌換|sub-coupon)\s(?<serial_number>[\w-]{36})$/, subscribeCouponExchange),
];

exports.privateRouter = [text(/^[.#/](我要買月卡)\s(?<number>[135]{1})$/, buyMonthCard)];

/**
 * 用女神石購買月卡
 * @param {import("bottender").LineContext} context
 */
async function buyMonthCard(context, props) {
  const { userId } = context.event.source;
  const number = parseInt(get(props, "match.groups.number", "1"), 10);
  const { amount: ownMoney = 0 } = await inventoryModel.getUserMoney(userId);
  let cost;

  switch (number) {
    case 1:
      cost = 50 * 10000;
      break;
    case 3:
      cost = 135 * 10000;
      break;
    case 5:
      cost = 220 * 10000;
      break;
    default:
      throw new Error("Invalid number");
  }

  if (parseInt(ownMoney) < cost) {
    await context.replyText(i18n.__("message.subscribe.not_enough_money"));
    return;
  }

  try {
    let coupons;

    await mysql.transaction(async trx => {
      coupons = await SubscribeCardCouponService.issue(
        { cardKey: "month", count: number, issuedBy: "system" },
        trx
      );
      await inventoryModel.decreaseGodStone({
        userId,
        amount: cost,
        note: "buy_month_card",
        trx,
      });
    });

    context.replyText(i18n.__("message.subscribe.buy_month_card_success"));

    const serialMessages = coupons.map(coupon =>
      i18n.__("message.subscribe.give_serial_nubmer", {
        serial_number: get(coupon, "serial_number"),
      })
    );

    await context.replyText(serialMessages.join("\n"));

    const { unlocked } = await AchievementEngine.evaluate(userId, "subscribe").catch(() => ({
      unlocked: [],
    }));
    await notifyUnlocks(context, userId, unlocked);
  } catch (e) {
    // 不印 e.message（Knex 例外的 message 可能夾帶 SQL/bindings，含女神石金額等敏感值），
    // 只留事件名 + 錯誤分類碼。
    console.error("[subscribe] buy month card failed", safeErrorCode(e));
    await context.replyText(
      i18n.__("message.error_contact_admin", {
        user_id: userId,
        error_key: "buy_month_card",
      })
    );
    return;
  }
}

/**
 * 訂閱卡片資訊
 * @param {import("bottender").LineContext} context
 */
async function showInformation(context) {
  const cards = await SubscribeCard.all();
  const bubbles = cards.map(card => {
    const effects = get(card, "effects", []).map(effect =>
      generateEffect(SubscriptionService.formatEffectRow(effect))
    );

    return generateCard({
      title: i18n.__(`message.subscribe.${card.key}`),
      effects,
      image: config.get(`subscribe.${card.key}_icon`),
    });
  });

  await context.replyFlex("訂閱卡片資訊", {
    type: "carousel",
    contents: bubbles,
  });
}

// 兌換交易的重試上限：首次嘗試 + 最多 2 次重試 = 總共 3 次。
// 見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §7。
const EXCHANGE_MAX_ATTEMPTS = 3;
// subscribe_user 的既有複合唯一鍵（見 20221025034215_create_subscribe_user_table.js），
// 只有「首次建立」INSERT 競態撞到這個鍵時才視為可重試的 ER_DUP_ENTRY。
const SUBSCRIBE_USER_UNIQUE = /subscribe_user_user_id_subscribe_card_key_unique/;

// Knex/mysql2 例外的 .message／.sqlMessage 可能夾帶 SQL 語句與 bindings
// （含女神石金額、訂閱序號等敏感值），一律不得寫進 log。只允許記錄這個白名單內的
// driver 錯誤碼分類，其餘一律 "UNKNOWN"（見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §7）。
const LOGGABLE_ERROR_CODES = new Set([
  "ER_DUP_ENTRY",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
  "SERIAL_NOT_FOUND",
  "SERIAL_USED",
  "CARD_NOT_FOUND",
  "INVALID_CARD_KEY",
  "INVALID_COUNT",
  "INVALID_ISSUED_BY",
]);

function safeErrorCode(error) {
  const code = error && error.code;
  return typeof code === "string" && LOGGABLE_ERROR_CODES.has(code) ? code : "UNKNOWN";
}

function exchangeFail(code) {
  return Object.assign(new Error(code), { code });
}

function isRetryableExchangeError(error) {
  if (!error) return false;
  if (error.code === "ER_LOCK_DEADLOCK" || error.code === "ER_LOCK_WAIT_TIMEOUT") return true;
  if (
    error.code === "ER_DUP_ENTRY" &&
    SUBSCRIBE_USER_UNIQUE.test(`${error.sqlMessage || ""} ${error.message || ""}`)
  ) {
    return true;
  }
  return false;
}

/**
 * 兌換單一序號：「讀 coupon 狀態＋讀既有 SubscribeUser＋算延長/建立＋寫入」整段
 * 包在同一交易內，且對兩把鎖都取 `SELECT ... FOR UPDATE`：
 *   1. coupon 那一行 —— 同一序號不會被兩個玩家同時判定「未使用」。
 *   2. 同一 (user_id, subscribe_card_key) 那一行（若存在）—— 序列化同玩家同卡種的並發兌換，
 *      交易內重讀 end_at 才計算延長，不沿用進交易前的舊值。
 * MySQL deadlock / 鎖等待逾時 / 首次建立時的唯一鍵 INSERT 競態，整個函式重新來過，
 * 最多額外重試 2 次；其餘錯誤（含序號不存在/已使用/查無卡片）一律不重試、直接拋出。
 * @param {String} serialNumber
 * @param {String} userId
 * @returns {Promise<{card: Object, userData: Object, isContinue: Boolean}>}
 */
async function exchangeCouponWithRetry(serialNumber, userId) {
  let lastError;

  for (let attempt = 1; attempt <= EXCHANGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await mysql.transaction(async trx => {
        const coupon = await SubscribeCardCoupon.lockBySerialNumber(serialNumber, trx);
        if (!coupon) throw exchangeFail("SERIAL_NOT_FOUND");
        if (get(coupon, "status") === SubscribeCardCoupon.status.used) {
          throw exchangeFail("SERIAL_USED");
        }

        const card = await SubscribeCard.first(
          { filter: { key: get(coupon, "subscribe_card_key") } },
          trx
        );
        if (!card) throw exchangeFail("CARD_NOT_FOUND");

        const existing = await SubscribeUser.lockByUserAndCard(userId, get(card, "key"), trx);
        let userData;
        let isContinue;

        if (existing) {
          const { user: data, isContinue: cont } = handleUser(existing, card);
          userData = data;
          isContinue = cont;
          await SubscribeUser.update(get(existing, "id"), userData, {}, trx);
        } else {
          userData = {
            user_id: userId,
            subscribe_card_key: get(card, "key"),
            start_at: mement().toDate(),
            end_at: mement().add(get(card, "duration"), "days").toDate(),
          };
          isContinue = false;
          await SubscribeUser.create(userData, trx);
        }

        await trx
          .update({
            status: SubscribeCardCoupon.status.used,
            used_at: mement().toDate(),
            used_by: userId,
          })
          .table(SubscribeCardCoupon.table)
          .where({ id: get(coupon, "id") });

        return { card, userData, isContinue };
      });
    } catch (error) {
      if (!isRetryableExchangeError(error) || attempt === EXCHANGE_MAX_ATTEMPTS) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * 兌換訂閱卡
 * @param {import("bottender").LineContext} context
 * @param {import("bottender").Props} param1
 */
async function subscribeCouponExchange(context, props) {
  const serialNumber = get(props, "match.groups.serial_number");
  const { userId } = context.event.source;

  let card;
  let userData;
  let isContinue;

  try {
    ({ card, userData, isContinue } = await exchangeCouponWithRetry(serialNumber, userId));
  } catch (e) {
    if (e && e.code === "SERIAL_NOT_FOUND") {
      await context.sendText(i18n.__("message.subscribe.serial_number_not_found"));
      return;
    }
    if (e && e.code === "SERIAL_USED") {
      await context.replyText(i18n.__("message.subscribe.serial_number_used"));
      return;
    }
    if (e && e.code === "CARD_NOT_FOUND") {
      await context.replyText(
        i18n.__("message.error_contact_admin", {
          user_id: userId,
          error_key: "subscribe_card_not_found",
        })
      );
      return;
    }

    // 未分類例外：不印整個 error 物件或 e.message（可能含 SQL/bindings，含女神石/序號等
    // 敏感值），只留事件名 + 錯誤分類碼。
    console.error("[subscribe] coupon exchange failed", safeErrorCode(e));
    await context.replyText(
      i18n.__("message.error_contact_admin", {
        user_id: userId,
        error_key: "subscribe_coupon_exchange",
      })
    );
    return;
  }

  // 以下副作用一律排在交易 commit 之後、重試迴圈之外；本身失敗不觸發重跑兌換交易。
  await GachaController.purgeDailyGachaCache(userId);

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
  effects.forEach(effect => messages.push(SubscriptionService.formatEffectRow(effect)));

  await context.replyText(messages.join("\n"));
  !isContinue && (await DailyRation());

  const { unlocked } = await AchievementEngine.evaluate(userId, "subscribe").catch(() => ({
    unlocked: [],
  }));
  await notifyUnlocks(context, userId, unlocked);
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
  let isContinue;

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
