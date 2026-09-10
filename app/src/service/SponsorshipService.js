const crypto = require("crypto");
const moment = require("moment");
const Sponsorship = require("../model/application/Sponsorship");
const SponsorshipAudit = require("../model/application/SponsorshipAudit");
const SubscribeCard = require("../model/application/SubscribeCard");
const UserModel = require("../model/application/UserModel");
const SubscribeCardCouponService = require("./SubscribeCardCouponService");
const mysql = require("../util/mysql");
const { DefaultLogger } = require("../util/Logger");

// 與 SubscribeCardCouponService 的既有 CLI 門檻對齊（見 app/bin/IssueSubscribeCard.js）。
// V1 規格 §2.1：card_count 上限需與此對齊，不另訂數字。
const MAX_CARD_COUNT = SubscribeCardCouponService.MAX_ISSUE_COUNT;

const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
// 嚴格 ISO 8601、秒（或至多 3 位小數秒）精度、且必須帶時區標記（Z 或 ±HH:mm）。
// 拒絕 moment() 對 undefined/array/object 的隱性寬容解析（那會默默吃到「現在時間」）。
const RECEIVED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const TYPES = new Set(["new", "history"]);
const CURRENCY = "TWD";

// 與各欄位的既有 schema 長度對齊（見 20260909102822_create_sponsorship_table.js），
// 在 trust boundary 上就近拒絕超長輸入，不留給 DB 層才報錯。
const REQUEST_ID_MAX_LENGTH = 64;
const PAYMENT_METHOD_MAX_LENGTH = 50;
const EXTERNAL_REF_MAX_LENGTH = 100;

// sponsorship.request_id 的既有唯一鍵（見 20260909102822_create_sponsorship_table.js）。
const REQUEST_ID_UNIQUE = /sponsorship_request_id_unique/;

// Knex/mysql2 例外的 .message／.sqlMessage 可能夾帶 SQL 語句與 bindings（含金額、序號等
// 敏感值），一律不得寫進 log。只允許記錄這個白名單內的 driver 錯誤碼，其餘一律 "UNKNOWN"。
const LOGGABLE_ERROR_CODES = new Set([
  "ER_DUP_ENTRY",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
]);

function safeErrorCode(error) {
  const code = error && error.code;
  return typeof code === "string" && LOGGABLE_ERROR_CODES.has(code) ? code : "UNKNOWN";
}

function fail(code, extra) {
  const err = new Error(code);
  err.code = code;
  if (extra) Object.assign(err, extra);
  return err;
}

/**
 * 金額字串正規化：固定兩位小數、無前導零（"0" 除外）。純字串處理，不經
 * `Number()`/`toFixed()`——decimal(12,2) 的精確金額不该過一趟浮點數。
 * 拒絕非法格式；入庫值與指紋計算共用同一份結果。
 * @param {*} raw
 * @returns {String}
 */
function normalizeAmount(raw) {
  if (typeof raw !== "string" || !AMOUNT_PATTERN.test(raw)) throw fail("INVALID_AMOUNT");

  const [rawInt, rawDec = ""] = raw.split(".");
  const intPart = rawInt.replace(/^0+(?=\d)/, "") || "0";
  const decPart = (rawDec + "00").slice(0, 2);

  // 正數檢查：整數部與小數部都是純字元比對，全零即非正數。
  if (/^0+$/.test(intPart) && /^0*$/.test(decPart)) throw fail("INVALID_AMOUNT");

  return `${intPart}.${decPart}`;
}

/**
 * received_at 正規化：嚴格要求非空、帶時區的 ISO 字串，轉為 UTC 秒精度 ISO 字串。
 * 明確拒絕 undefined/array/object/空字串——這些丟給 `moment()` 都會被善意解讀成
 * 「現在時間」或其他非預期值，而不是丟出驗證錯誤。
 * @param {*} raw
 * @returns {String}
 */
function normalizeReceivedAt(raw) {
  if (typeof raw !== "string" || !raw || !RECEIVED_AT_PATTERN.test(raw)) {
    throw fail("INVALID_RECEIVED_AT");
  }
  // parseZone 先按輸入自帶的 offset 解析，避免經過 local timezone 的中繼轉換再轉 UTC。
  const m = moment.parseZone(raw);
  if (!m.isValid()) throw fail("INVALID_RECEIVED_AT");
  return m.utc().format("YYYY-MM-DDTHH:mm:ss[Z]");
}

/**
 * 缺省 / null / 空字串一律 normalize 為 null，其餘保留原字串。
 * @param {*} raw
 * @param {?Number} [maxLength] 與 schema 欄位長度對齊時傳入，超長一律拒絕（trust boundary）。
 * @returns {?String}
 */
function normalizeNullableString(raw, maxLength) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw fail("INVALID_INPUT");
  if (maxLength && raw.length > maxLength) throw fail("INVALID_INPUT");
  return raw;
}

function normalizeUserId(raw) {
  if (raw === undefined || raw === null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw fail("INVALID_USER_ID");
  return value;
}

function normalizeCardCount(raw) {
  if (raw === undefined || raw === null) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > MAX_CARD_COUNT) {
    throw fail("INVALID_CARD_COUNT");
  }
  return value;
}

/**
 * 驗證並正規化建立請求的輸入。只接受規格 §2.1 列出的固定欄位，多餘欄位一律拒絕
 * （reject unknown fields，不靜默忽略）。
 * @param {Object} input
 * @returns {Object} 正規化後的欄位，供入庫與指紋計算共用
 */
function normalizeCreateInput(input) {
  if (!input || typeof input !== "object") throw fail("INVALID_INPUT");

  const ALLOWED_KEYS = new Set([
    "type",
    "user_id",
    "currency",
    "amount",
    "received_at",
    "payment_method",
    "external_ref",
    "note",
    "card_key",
    "card_count",
  ]);
  const unknown = Object.keys(input).filter(k => !ALLOWED_KEYS.has(k));
  if (unknown.length) throw fail("UNKNOWN_FIELD", { fields: unknown });

  if (!TYPES.has(input.type)) throw fail("INVALID_TYPE");
  if (input.currency !== CURRENCY) throw fail("INVALID_CURRENCY");

  const type = input.type;
  const userId = normalizeUserId(input.user_id);
  if (type === "new" && userId === null) throw fail("USER_REQUIRED");

  const cardCount = normalizeCardCount(input.card_count);
  const cardKey = normalizeNullableString(input.card_key);

  if (type === "history") {
    if (cardCount !== 0 || cardKey !== null) throw fail("HISTORY_CANNOT_ISSUE_CARD");
  }
  if (cardCount > 0 && !cardKey) throw fail("CARD_KEY_REQUIRED");
  // card_count=0 必須 card_key=null——不允許「選了卡種但張數 0」這種曖昧輸入
  // 留下一半發卡意圖卻不發卡（regression：先前只擋 history，new 型漏了這條）。
  if (cardCount === 0 && cardKey !== null) throw fail("INVALID_CARD_KEY");
  if (cardKey && !SubscribeCardCouponService.ALLOWED_KEYS.has(cardKey)) {
    throw fail("INVALID_CARD_KEY");
  }

  return {
    type,
    user_id: userId,
    currency: CURRENCY,
    amount: normalizeAmount(input.amount),
    received_at: normalizeReceivedAt(input.received_at),
    payment_method: normalizeNullableString(input.payment_method, PAYMENT_METHOD_MAX_LENGTH),
    external_ref: normalizeNullableString(input.external_ref, EXTERNAL_REF_MAX_LENGTH),
    note: normalizeNullableString(input.note),
    card_key: cardKey,
    card_count: cardCount,
  };
}

/**
 * 指紋：固定順序陣列 canonical JSON.stringify 後取 SHA-256 hex。
 * 陣列元素固定 10 個，與正規化後的入庫欄位同一份值。
 * @param {Object} normalized normalizeCreateInput 的回傳值
 * @returns {String}
 */
function computeFingerprint(normalized) {
  const ordered = [
    normalized.type,
    normalized.user_id,
    normalized.currency,
    normalized.amount,
    normalized.received_at,
    normalized.payment_method,
    normalized.external_ref,
    normalized.note,
    normalized.card_key,
    normalized.card_count,
  ];
  return crypto.createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

/**
 * 建立一筆贊助（新贊助或歷史補登）。
 *
 * 冪等：`requestId` + `Idempotency-Key` 由呼叫端保證一致（router 層檢查），這裡只認
 * `requestId`。同一 `requestId` 重送：內容相同（fingerprint 相同）回原結果；
 * 內容不同回 409（CONFLICT）。
 *
 * 發卡型贊助在同一交易內：寫入 sponsorship → SubscribeCardCouponService.issue(trx)
 * → 寫入 sponsorship_audit(create)。任一步失敗整筆回滾。
 *
 * @param {Object} input 見 normalizeCreateInput
 * @param {String} requestId Idempotency-Key，必須與 header 一致（由呼叫端保證）
 * @param {String} operatorUserId 執行登記的本人 LINE userId
 * @returns {Promise<Object>} `{ created: Boolean, sponsorship, coupons }`
 */
async function create(input, requestId, operatorUserId) {
  if (typeof requestId !== "string" || !requestId || requestId.length > REQUEST_ID_MAX_LENGTH) {
    throw fail("INVALID_REQUEST_ID");
  }
  if (typeof operatorUserId !== "string" || !operatorUserId) throw fail("INVALID_OPERATOR");

  const normalized = normalizeCreateInput(input);
  const fingerprint = computeFingerprint(normalized);

  // new 型必須是既有玩家；history 型 user_id 若有填也必須是既有玩家（history 補綁
  // 才是唯一的「事後指定玩家」入口，但建立時若已知玩家仍要求真實存在）。
  if (normalized.user_id !== null) {
    const user = await UserModel.findById(normalized.user_id);
    if (!user) throw fail("USER_NOT_FOUND");
  }

  let sponsorshipId;
  let coupons = [];

  try {
    await mysql.transaction(async trx => {
      sponsorshipId = await Sponsorship.create(
        {
          request_id: requestId,
          fingerprint,
          ...normalized,
          operator_user_id: operatorUserId,
          bound_at: null,
        },
        trx
      );

      if (normalized.card_count > 0) {
        coupons = await SubscribeCardCouponService.issue(
          {
            cardKey: normalized.card_key,
            count: normalized.card_count,
            issuedBy: operatorUserId,
            sponsorshipId,
          },
          trx
        );
      }

      await SponsorshipAudit.create(
        {
          sponsorship_id: sponsorshipId,
          action: "create",
          operator_user_id: operatorUserId,
          payload_snapshot: JSON.stringify({
            ...normalized,
            serial_numbers: coupons.map(c => c.serial_number),
          }),
        },
        trx
      );
    });
  } catch (error) {
    if (
      error &&
      error.code === "ER_DUP_ENTRY" &&
      REQUEST_ID_UNIQUE.test(`${error.sqlMessage || ""} ${error.message || ""}`)
    ) {
      return resolveIdempotentConflict(requestId, fingerprint);
    }
    DefaultLogger.error("sponsorship.create.failed", { code: safeErrorCode(error) });
    throw error;
  }

  const sponsorship = await Sponsorship.find(sponsorshipId);
  return { created: true, sponsorship, coupons };
}

/**
 * request_id 唯一鍵衝突時，在交易外查回既有紀錄比對內容再決定回應。
 * @param {String} requestId
 * @param {String} fingerprint
 */
async function resolveIdempotentConflict(requestId, fingerprint) {
  const existing = await Sponsorship.findByRequestId(requestId);
  if (!existing) throw fail("CONFLICT");
  if (existing.fingerprint !== fingerprint) throw fail("CONFLICT");

  const coupons =
    existing.card_count > 0
      ? await mysql("subscribe_card_coupon")
          .where({ sponsorship_id: existing.id })
          .select("serial_number")
      : [];

  return { created: false, sponsorship: existing, coupons };
}

/**
 * 補綁：未綁定的歷史紀錄補綁玩家。已綁定的紀錄不得換人。
 * 重送同一 target 不得產生第二筆 audit；已綁其他 target 回 409。
 * @param {Number} id
 * @param {Number} targetUserId
 * @param {String} operatorUserId
 */
async function bind(id, targetUserId, operatorUserId) {
  const userId = normalizeUserId(targetUserId);
  if (userId === null) throw fail("INVALID_USER_ID");
  if (typeof operatorUserId !== "string" || !operatorUserId) throw fail("INVALID_OPERATOR");

  const user = await UserModel.findById(userId);
  if (!user) throw fail("USER_NOT_FOUND");

  let result;

  await mysql.transaction(async trx => {
    const sponsorship = await Sponsorship.lockById(id, trx);
    if (!sponsorship) throw fail("SPONSORSHIP_NOT_FOUND");
    if (sponsorship.type !== "history") throw fail("NOT_HISTORY_TYPE");

    if (sponsorship.user_id !== null) {
      if (sponsorship.user_id === userId) {
        // 已綁同一 target：不產生第二筆 audit，直接回傳現況。
        result = { bound: false, sponsorship };
        return;
      }
      throw fail("ALREADY_BOUND_OTHER");
    }

    const boundAt = new Date();
    await trx("sponsorship").where({ id }).update({ user_id: userId, bound_at: boundAt });

    await SponsorshipAudit.create(
      {
        sponsorship_id: id,
        action: "bind",
        operator_user_id: operatorUserId,
        payload_snapshot: JSON.stringify({ user_id: userId, bound_at: boundAt }),
      },
      trx
    );

    result = { bound: true, sponsorship: { ...sponsorship, user_id: userId, bound_at: boundAt } };
  });

  return result;
}

/**
 * 玩家詳情：累積登記贊助金額（TWD，decimal SUM）＋贊助/序號清單。
 * @param {Number} userId
 */
async function getPlayerSummary(userId) {
  const id = normalizeUserId(userId);
  if (id === null) throw fail("INVALID_USER_ID");

  const [sumRow, sponsorships] = await Promise.all([
    Sponsorship.sumAmountByUser(id),
    Sponsorship.listByUser(id),
  ]);

  const ids = sponsorships.map(s => s.id);
  const coupons = ids.length
    ? await mysql("subscribe_card_coupon")
        .whereIn("sponsorship_id", ids)
        .select("sponsorship_id", "serial_number", "status", "used_at")
    : [];
  const couponsBySponsorship = new Map();
  coupons.forEach(c => {
    const list = couponsBySponsorship.get(c.sponsorship_id) || [];
    list.push({ serialNumber: c.serial_number, status: c.status, usedAt: c.used_at });
    couponsBySponsorship.set(c.sponsorship_id, list);
  });

  return {
    userId: id,
    totalAmount: sumRow && sumRow.total ? String(sumRow.total) : "0.00",
    currency: CURRENCY,
    sponsorships: sponsorships.map(s => ({
      ...shapeSponsorship(s),
      coupons: couponsBySponsorship.get(s.id) || [],
    })),
  };
}

/**
 * 列表查詢：依 type / 是否已綁定篩選，分頁。
 * @param {Object} param0
 */
async function list({ type, bound, page = 1, perPage = 20 } = {}) {
  const [rows, total] = await Promise.all([
    Sponsorship.search({ type, bound, page, perPage }),
    Sponsorship.countSearch({ type, bound }),
  ]);
  return {
    items: rows.map(shapeSponsorship),
    page,
    perPage,
    total,
  };
}

/**
 * 單筆詳情，含關聯序號清單。
 * @param {Number} id
 */
async function detail(id) {
  const sponsorship = await Sponsorship.find(id);
  if (!sponsorship) return null;

  const coupons = await mysql("subscribe_card_coupon")
    .where({ sponsorship_id: id })
    .select("serial_number", "status", "used_at", "used_by");

  return {
    ...shapeSponsorship(sponsorship),
    coupons: coupons.map(c => ({
      serialNumber: c.serial_number,
      status: c.status,
      usedAt: c.used_at,
      usedBy: c.used_by,
    })),
  };
}

/**
 * 可用卡種清單，供發卡表單選卡種/張數。讀既有 SubscribeCard，不新增卡種管理。
 */
async function listCards() {
  const cards = await SubscribeCard.all();
  return cards.map(c => ({ key: c.key, name: c.name, price: c.price, duration: c.duration }));
}

/**
 * 把 DB row 整成 API 形狀（camelCase）。不外流 fingerprint（僅內部冪等比對用）。
 * @param {Object} row
 */
function shapeSponsorship(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    type: row.type,
    userId: row.user_id,
    currency: row.currency,
    amount: String(row.amount),
    receivedAt: row.received_at,
    paymentMethod: row.payment_method,
    externalRef: row.external_ref,
    note: row.note,
    cardKey: row.card_key,
    cardCount: row.card_count,
    operatorUserId: row.operator_user_id,
    boundAt: row.bound_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  MAX_CARD_COUNT,
  AMOUNT_PATTERN,
  normalizeAmount,
  normalizeCreateInput,
  computeFingerprint,
  create,
  bind,
  getPlayerSummary,
  list,
  detail,
  listCards,
  shapeSponsorship,
};
