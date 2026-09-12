const uuid = require("uuid-random");
const SubscribeCardCoupon = require("../model/application/SubscribeCardCoupon");

// 與 app/bin/IssueSubscribeCard.js 既有 CLI 門檻對齊：count > 100 一律拒絕。
// sponsorship 後台的 card_count 上限與此共用同一個常數，不另訂數字。
const MAX_ISSUE_COUNT = 100;
const ALLOWED_KEYS = new Set(["month", "season"]);

function fail(code) {
  return Object.assign(new Error(code), { code });
}

/**
 * 批次產生訂閱序號，寫入 subscribe_card_coupon。
 *
 * 抽出自既有 CLI（app/bin/IssueSubscribeCard.js）與購卡流程
 * （SubscribeController.buyMonthCard）的共用邏輯，兩處都改呼叫本函式、
 * 行為不變（見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §6）。
 *
 * @param {Object} param0
 * @param {String} param0.cardKey subscribe_card.key（目前為 "month" 或 "season"）
 * @param {Number} param0.count 張數，1 ~ MAX_ISSUE_COUNT
 * @param {String} param0.issuedBy 發行者（"system" 或站務 LINE userId）
 * @param {?Number} [param0.sponsorshipId] 贊助後台發卡時關聯的 sponsorship.id；
 *   CLI／購卡路徑一律傳 null。
 * @param {import("knex").Knex.Transaction} [trx]
 * @returns {Promise<Array<Object>>} 已寫入的序號列（含 serial_number）
 */
async function issue({ cardKey, count, issuedBy, sponsorshipId = null }, trx) {
  if (!ALLOWED_KEYS.has(cardKey)) throw fail("INVALID_CARD_KEY");
  if (!Number.isInteger(count) || count < 1 || count > MAX_ISSUE_COUNT) {
    throw fail("INVALID_COUNT");
  }
  if (typeof issuedBy !== "string" || issuedBy === "") throw fail("INVALID_ISSUED_BY");

  const coupons = Array.from({ length: count }).map(() => ({
    subscribe_card_key: cardKey,
    serial_number: uuid(),
    status: SubscribeCardCoupon.status.unused,
    issued_by: issuedBy,
    sponsorship_id: sponsorshipId,
  }));

  await SubscribeCardCoupon.insert(coupons, trx);

  return coupons;
}

module.exports = { issue, MAX_ISSUE_COUNT, ALLOWED_KEYS };
