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
const AchievementEngine = require("../../service/AchievementEngine");
const { notifyUnlocks } = require("../../service/achievementNotifier");
const SubscriptionService = require("../../service/SubscriptionService");
const SubscribeCardCouponService = require("../../service/SubscribeCardCouponService");
const UserAutoPreference = require("../../model/application/UserAutoPreference");

exports.router = [
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

  try {
    let coupons;

    // 「讀餘額 → 判斷 → 發卡 → 扣款」整段同一交易，且先鎖同玩家再讀：
    //   1. 鎖 user 列（platform_id 為 UNIQUE，setProfile 已 ensureUser）—— 同一玩家的並發購買
    //      在這裡序列化；查無列時 FOR UPDATE 只會拿到 gap lock、擋不住另一筆，故 fail closed。
    //   2. 拿到鎖之後才在同一條交易連線上讀 SUM：這是本交易第一個 consistent read，
    //      snapshot 在此刻建立，看得到前一筆已 commit 的扣款，不會沿用交易外的舊餘額。
    //   3. issue + decreaseGodStone 維持原順序，任一步失敗整筆回滾。
    // 只保證「購卡對購卡」不重複成交；其他女神石消費路徑不取這把鎖，不在此保證範圍。
    await mysql.transaction(async trx => {
      const player = await trx("user").where({ platform_id: userId }).forUpdate().first("id");
      if (!player) throw exchangeFail("USER_NOT_FOUND");

      const balance = await readGodStoneBalance(userId, trx);
      if (!(balance >= cost)) throw exchangeFail("NOT_ENOUGH_MONEY");

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
    if (e && e.code === "NOT_ENOUGH_MONEY") {
      await context.replyText(i18n.__("message.subscribe.not_enough_money"));
      return;
    }

    // 不印 e.message（Knex 例外的 message 可能夾帶 SQL/bindings，含女神石金額等敏感值），
    // 只留事件名 + 錯誤分類碼。
    console.error("[subscribe] buy month card failed", safeErrorCode(e));
    await context.replyText(
      i18n.__("message.error_contact_admin", {
        user_id: userId,
        error_key:
          e && e.code === "USER_NOT_FOUND" ? "buy_month_card_user_not_found" : "buy_month_card",
      })
    );
    return;
  }
}

// 女神石 itemId 與 Inventory.getUserMoney 相同（那邊寫死 999）；這裡另寫一份是因為購卡的
// 餘額必須在「已鎖住玩家的同一條交易連線」上讀，model 既有方法不吃 trx。
const GOD_STONE_ITEM_ID = 999;

/**
 * 交易內讀女神石餘額。SUM 對空集合回 null → 0；遊戲幣是整數，沿用 parseInt 整數比較，
 * 解析不出安全整數時回 NaN，讓呼叫端的 `!(balance >= cost)` 判斷 fail closed。
 * @param {String} userId
 * @param {import("knex").Knex.Transaction} trx
 * @returns {Promise<Number>}
 */
async function readGodStoneBalance(userId, trx) {
  const row = await inventoryModel
    .qb(trx)
    .sum({ amount: "itemAmount" })
    .where({ userId, itemId: GOD_STONE_ITEM_ID })
    .first();
  const raw = row && row.amount;
  if (raw === null || raw === undefined) return 0;
  const value = parseInt(raw, 10);
  return Number.isSafeInteger(value) ? value : NaN;
}

// 兌換交易的重試上限：首次嘗試 + 最多 2 次重試 = 總共 3 次。
// 見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §7。
const EXCHANGE_MAX_ATTEMPTS = 3;
// subscribe_user 的既有複合唯一鍵（見 20221025034215_create_subscribe_user_table.js），
// 只有「首次建立」INSERT 競態撞到這個鍵時才視為可重試的 ER_DUP_ENTRY。
const SUBSCRIBE_USER_UNIQUE = /subscribe_user_user_id_subscribe_card_key_unique/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 折算天數顯示：取到小數 1 位，整數不帶 ".0"（15 天、5.5 天）。
 * @param {Number} ms
 * @returns {String}
 */
function formatDays(ms) {
  return String(Math.round((ms / DAY_MS) * 10) / 10);
}

/**
 * subscribe_user.start_at / end_at 是 MySQL TIMESTAMP（無小數秒），INSERT/UPDATE 時
 * 會四捨五入到最近的整秒 —— 代表寫入的「現在」有可能被無條件進位成比真實時間點更晚
 * （最多 +500ms）。折算把某張卡的 end_at 設成 now 用來表示「立刻結束」時，若真的被進位，
 * 下一筆幾乎同時抵達的並發交易讀回這個 end_at 可能仍判定為「尚未到期」，導致同一張卡
 * 被折算兩次。無條件捨去到整秒可保證寫入值不會晚於任何後續交易讀到的真實時間，
 * 徹底消除這個進位造成的競態視窗。
 * @param {import("moment").Moment} momentInstance
 * @returns {Date}
 */
function floorToSecond(momentInstance) {
  return new Date(Math.floor(momentInstance.valueOf() / 1000) * 1000);
}

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
  "USER_NOT_FOUND",
  "NOT_ENOUGH_MONEY",
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
 * 兌換單一序號整段包在同一交易，鎖序固定為 user → coupon → 該 user 所有
 * subscribe_user → user_auto_preference。以同一個 `now` 判 Plus 資格；只有 inactive→active
 * 才 reset 新自動配對 consent 並遞增 generation，舊 auto flags/cap 不動。
 *
 * 期中升級折算（見 docs/plans/2026-09-09-sponsorship-subscription-roadmap.md §5
 * 「2026-09-23 Plus 售價與折算決策」）：月卡與 Plus 不並存，哪些卡種折算進哪張由
 * SubscribeCard.SUPERSEDED_BY 推導（不寫死字串），分兩種情況：
 *   - 兌換卡種吸收其他持有中的卡種（例如持有有效月卡時兌換 Plus）：被吸收卡種立刻
 *     結束（end_at = now），剩餘時間依單價比例折算加到本次兌換卡種的 end_at。
 *   - 兌換卡種被其他持有中的卡種吸收（例如持有有效 Plus 時兌換月卡）：完全不建立或
 *     延長被兌換卡種自己的列，改把它的整段 duration 折算加到吸收者的 end_at。
 * 兩種情況全部落在 lockAllByUser 已鎖住的同一批列內，並發兌換靠這把既有的
 * 「鎖住該 user 全部 subscribe_user 列」序列化，不需要額外鎖。
 *
 * MySQL deadlock / 鎖等待逾時 / 首次建立時的唯一鍵 INSERT 競態，整個函式重新來過，
 * 最多額外重試 2 次；其餘錯誤（含序號不存在/已使用/查無卡片）一律不重試、直接拋出。
 * @param {String} serialNumber
 * @param {String} userId
 * @returns {Promise<{card: Object, userData: Object, isContinue: Boolean, conversion: ?Object}>}
 */
async function exchangeCouponWithRetry(serialNumber, userId) {
  let lastError;

  for (let attempt = 1; attempt <= EXCHANGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await mysql.transaction(async trx => {
        // KTD11 lock order: user → coupon → all subscribe rows → preference.
        // A missing user row only yields a gap lock, not the per-user mutex this flow requires.
        const [players] = await trx.raw("SELECT id FROM `user` WHERE platform_id = ? FOR UPDATE", [
          userId,
        ]);
        if (!players.length) throw exchangeFail("USER_NOT_FOUND");
        const now = mement();
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
        const cardKey = get(card, "key");

        const subscriptions = await SubscribeUser.lockAllByUser(userId, trx);
        const wasActive = SubscribeUser.hasActiveAutoMatchAt(subscriptions, now.toDate());
        const preference = await UserAutoPreference.lockByUserId(userId, trx);

        // 邊界與 SubscribeUser.hasActiveAutoMatchAt 一致：start_at <= now < end_at，
        // 恰好到期（end_at === now）或已過期一律視為非有效、不折算。
        const activeRowFor = key =>
          subscriptions.find(
            row =>
              row.subscribe_card_key === key &&
              mement(row.start_at).isSameOrBefore(now) &&
              mement(row.end_at).isAfter(now)
          );

        let userData;
        let isContinue;
        let conversion = null;

        // 兌換卡種是否被某張「持有中」的卡種吸收？（例：持有有效 Plus 時兌換月卡）
        const absorbedByRow = SubscriptionService.supersedingKeysOf(cardKey)
          .map(activeRowFor)
          .find(Boolean);

        if (absorbedByRow) {
          // 完全不建立或延長 cardKey 自己的列；改把它的整段 duration 折算進吸收者。
          const absorberCard = await SubscribeCard.first(
            { filter: { key: absorbedByRow.subscribe_card_key } },
            trx
          );
          const durationMs = get(card, "duration") * DAY_MS;
          const convertedMs = absorberCard
            ? SubscriptionService.convertDurationByPrice(
                durationMs,
                get(card, "price"),
                get(absorberCard, "price")
              )
            : 0;
          const newEndAt = new Date(new Date(absorbedByRow.end_at).getTime() + convertedMs);
          await SubscribeUser.update(get(absorbedByRow, "id"), { end_at: newEndAt }, {}, trx);
          userData = { ...absorbedByRow, end_at: newEndAt };
          // 對玩家而言這是「延期」而非「首次啟用」：吸收者本來就有效，只是到期日變晚。
          isContinue = true;
          conversion = { mode: "absorbedByOther", toDays: formatDays(convertedMs) };
        } else {
          // 兌換卡種是否吸收某張「持有中」的卡種？（例：持有有效月卡時兌換 Plus）
          const absorbedRow = SubscriptionService.keysSupersededBy(cardKey)
            .map(activeRowFor)
            .find(Boolean);
          let bonusMs = 0;

          if (absorbedRow) {
            const absorbedCard = await SubscribeCard.first(
              { filter: { key: absorbedRow.subscribe_card_key } },
              trx
            );
            const remainingMs = new Date(absorbedRow.end_at).getTime() - now.valueOf();
            bonusMs = absorbedCard
              ? SubscriptionService.convertDurationByPrice(
                  remainingMs,
                  get(absorbedCard, "price"),
                  get(card, "price")
                )
              : 0;
            // 月卡被 Plus 吸收就一律當下結束（end_at = now），不管折算出多少加成——
            // 折算金額只影響加到 Plus 的時間，被吸收卡種「結束」這件事本身不看金額。
            // 用 floorToSecond 而非 now.toDate()：避免 TIMESTAMP 欄位的秒級進位讓並發交易
            // 誤判這張卡仍有效而重複折算（見 floorToSecond 註解）。
            await SubscribeUser.update(
              get(absorbedRow, "id"),
              { end_at: floorToSecond(now) },
              {},
              trx
            );
            conversion = {
              mode: "absorbsOther",
              fromDays: formatDays(remainingMs),
              toDays: formatDays(bonusMs),
            };
          }

          const existing = subscriptions.find(row => row.subscribe_card_key === cardKey);
          if (existing) {
            const { user: data, isContinue: cont } = handleUser(existing, card, now);
            userData = data;
            isContinue = cont;
          } else {
            userData = {
              user_id: userId,
              subscribe_card_key: cardKey,
              start_at: now.toDate(),
              end_at: now.clone().add(get(card, "duration"), "days").toDate(),
            };
            isContinue = false;
          }
          if (bonusMs > 0) {
            userData.end_at = new Date(userData.end_at.getTime() + bonusMs);
          }

          if (existing) {
            await SubscribeUser.update(get(existing, "id"), userData, {}, trx);
          } else {
            await SubscribeUser.create(userData, trx);
          }
        }

        const becameActive =
          !wasActive && SubscribeUser.hasActiveAutoMatchAt([userData], now.toDate());
        if (becameActive) {
          const reset = {
            auto_match_enabled: 0,
            auto_match_generation:
              Number((preference && preference.auto_match_generation) || 0) + 1,
            auto_match_bet_enabled: 0,
            auto_match_bet_generation:
              Number((preference && preference.auto_match_bet_generation) || 0) + 1,
          };
          if (preference) {
            await UserAutoPreference.updateByUserId(userId, reset, trx);
          } else {
            await UserAutoPreference.create({ user_id: userId, ...reset }, trx);
          }
        }

        await trx
          .update({
            status: SubscribeCardCoupon.status.used,
            used_at: now.toDate(),
            used_by: userId,
          })
          .table(SubscribeCardCoupon.table)
          .where({ id: get(coupon, "id") });

        return { card, userData, isContinue, conversion };
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
  let conversion;

  try {
    ({ card, userData, isContinue, conversion } = await exchangeCouponWithRetry(
      serialNumber,
      userId
    ));
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

  messages.push(
    i18n.__("message.subscribe.coupon_exchange_success", {
      name: get(card, "name"),
    })
  );

  if (conversion && conversion.mode === "absorbsOther") {
    // 兌換卡種（Plus）吸收了持有中的月卡剩餘時間：先講折算，再用既有「延期至」文案
    // 顯示折算後的到期日——userData.end_at 此時已是 Plus 本身折算後的到期日。
    messages.push(
      i18n.__("message.subscribe.conversion_absorbs_other", {
        from_days: conversion.fromDays,
        to_days: conversion.toDays,
      })
    );
    messages.push(
      i18n.__("message.subscribe.coupon_exchange_success_continue", {
        end_at: mement(get(userData, "end_at")).format("YYYY-MM-DD"),
      })
    );
    const effects = get(card, "effects", []);
    effects.forEach(effect => messages.push(SubscriptionService.formatEffectRow(effect)));
  } else if (conversion && conversion.mode === "absorbedByOther") {
    // 兌換卡種（月卡）被持有中的 Plus 吸收：card 是月卡，其 effects 不會生效，不列出。
    // userData 此時是被延長的 Plus 列本身，到期日對應 Plus，不是月卡。
    messages.push(
      i18n.__("message.subscribe.conversion_absorbed_by_plus", {
        to_days: conversion.toDays,
      })
    );
    messages.push(
      i18n.__("message.subscribe.coupon_exchange_success_continue", {
        end_at: mement(get(userData, "end_at")).format("YYYY-MM-DD"),
      })
    );
  } else {
    if (isContinue) {
      messages.push(
        i18n.__("message.subscribe.coupon_exchange_success_continue", {
          end_at: mement(get(userData, "end_at")).format("YYYY-MM-DD"),
        })
      );
    }
    const effects = get(card, "effects", []);
    effects.forEach(effect => messages.push(SubscriptionService.formatEffectRow(effect)));
  }

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
function handleUser(user, card, fixedNow) {
  const now = fixedNow ? fixedNow.clone() : mement();
  const endAt = mement(get(user, "end_at"));
  let isContinue;

  if (endAt.isSameOrBefore(now)) {
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
