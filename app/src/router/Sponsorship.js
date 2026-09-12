const createRouter = require("express").Router;
const router = createRouter();
const { verifyToken, verifySponsorshipOwner } = require("../middleware/validation");
const SponsorshipService = require("../service/SponsorshipService");
const UserModel = require("../model/application/UserModel");
const { DefaultLogger } = require("../util/Logger");

// 一律不快取：序號/金額等敏感值不進中間層快取。放在授權 middleware 之前，
// 讓 401/403/503 的錯誤回應也帶這個 header（見規格 §0）——否則被
// verifyToken/verifySponsorshipOwner 提早 return 的錯誤回應就漏了這個 header。
router.use("/owner/sponsorships", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// 全部端點：verifyToken -> verifySponsorshipOwner（見規格 §4）；不掛 verifyAdmin/verifyPrivilege。
// 這支 router 是直接掛在 /api 底下（無路徑前綴），必須把 middleware 綁在
// /owner/sponsorships 這個路徑上，否則會攔截到整個 /api/* 的其他請求。
router.use("/owner/sponsorships", verifyToken, verifySponsorshipOwner);

const CONFLICT_STATUS = {
  CONFLICT: 409,
  ALREADY_BOUND_OTHER: 409,
  SPONSORSHIP_NOT_FOUND: 404,
  NOT_HISTORY_TYPE: 409,
};

const VALIDATION_CODES = new Set([
  "INVALID_INPUT",
  "UNKNOWN_FIELD",
  "INVALID_TYPE",
  "INVALID_CURRENCY",
  "USER_REQUIRED",
  "INVALID_USER_ID",
  "INVALID_AMOUNT",
  "INVALID_RECEIVED_AT",
  "INVALID_CARD_COUNT",
  "INVALID_CARD_KEY",
  "CARD_KEY_REQUIRED",
  "HISTORY_CANNOT_ISSUE_CARD",
  "INVALID_REQUEST_ID",
  "INVALID_OPERATOR",
]);

// Knex/mysql2 例外的 .code 理論上該是短字串（"ER_DUP_ENTRY" 等），但沒有任何型別保證
// ——呼叫端可能塞進任意字串甚至物件。未經 allowlist 直接記錄等於把 .message/.sqlMessage
// 的風險原封不動搬到 .code 上。只允許記錄這個白名單內的 driver 錯誤碼，其餘一律
// 固定分類 "UNEXPECTED"，不記錄原始值（見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §7）。
const LOGGABLE_ERROR_CODES = new Set([
  "ER_DUP_ENTRY",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
]);

function safeErrorCode(error) {
  const code = error && error.code;
  return typeof code === "string" && LOGGABLE_ERROR_CODES.has(code) ? code : "UNEXPECTED";
}

/**
 * 錯誤分類：驗證錯誤 / 衝突 / 未預期例外，分別回應對應狀態碼與精簡訊息。
 * 不把底層 DB error（含 SQL/bindings）整個印出，只留精簡摘要。
 */
function respondError(res, error) {
  const code = error && error.code;

  if (code === "USER_NOT_FOUND") return res.status(400).json({ message: "玩家不存在", code });
  if (VALIDATION_CODES.has(code)) {
    return res.status(400).json({ message: "輸入資料不正確", code, fields: error.fields });
  }
  if (CONFLICT_STATUS[code]) {
    return res.status(CONFLICT_STATUS[code]).json({ message: "資料狀態衝突", code });
  }

  // 不印 error.message/.sqlMessage（可能夾帶 SQL/bindings，含金額/序號等敏感值），也不把
  // error.code 未經檢查就當字串記錄——只留事件名 + allowlist 過的錯誤分類碼。
  DefaultLogger.error("sponsorship.api.unexpected", { code: safeErrorCode(error) });
  return res.status(500).json({ message: "系統忙碌中，請稍後再試" });
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 固定路徑一律寫在 :id 動態路由之前，避免被吃掉（見規格 §4）。

router.get("/owner/sponsorships/players", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const players = await UserModel.search(q, 20);
    res.json({ items: players });
  } catch (error) {
    respondError(res, error);
  }
});

router.get("/owner/sponsorships/players/:id/summary", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "玩家 ID 不正確" });

  try {
    const summary = await SponsorshipService.getPlayerSummary(id);
    res.json(summary);
  } catch (error) {
    respondError(res, error);
  }
});

router.get("/owner/sponsorships/cards", async (req, res) => {
  try {
    const cards = await SponsorshipService.listCards();
    res.json({ items: cards });
  } catch (error) {
    respondError(res, error);
  }
});

router.get("/owner/sponsorships", async (req, res) => {
  try {
    const { type, bound } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage) || 20));
    const boundFilter = bound === "true" ? true : bound === "false" ? false : undefined;
    const normalizedType = type === "new" || type === "history" ? type : undefined;

    const result = await SponsorshipService.list({
      type: normalizedType,
      bound: boundFilter,
      page,
      perPage,
    });
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
});

router.get("/owner/sponsorships/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: "找不到此贊助紀錄" });

  try {
    const item = await SponsorshipService.detail(id);
    if (!item) return res.status(404).json({ message: "找不到此贊助紀錄" });
    res.json(item);
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/owner/sponsorships", async (req, res) => {
  const idempotencyKey = req.get("Idempotency-Key");
  const requestId = req.body && req.body.requestId;

  if (!idempotencyKey || !requestId || idempotencyKey !== requestId) {
    return res.status(400).json({ message: "Idempotency-Key 與 requestId 必須一致且皆為必填" });
  }

  // requestId 只是冪等鍵，不是 sponsorship 的欄位——必須從 body 拆掉才能丟給 service 的
  // 固定欄位白名單，否則 normalizeCreateInput 會把它當 UNKNOWN_FIELD 拒絕，導致所有真實
  // POST 都失敗（見 oracle 覆核發現）。
  const input = { ...req.body };
  delete input.requestId;

  try {
    const result = await SponsorshipService.create(input, requestId, req.profile.userId);
    res.status(result.created ? 201 : 200).json({
      created: result.created,
      sponsorship: SponsorshipService.shapeSponsorship(result.sponsorship),
      serialNumbers: result.coupons.map(c => c.serial_number || c.serialNumber),
    });
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/owner/sponsorships/:id/bind", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ message: "找不到此贊助紀錄" });

  try {
    const result = await SponsorshipService.bind(
      id,
      req.body && req.body.userId,
      req.profile.userId
    );
    res.json({
      bound: result.bound,
      sponsorship: SponsorshipService.shapeSponsorship(result.sponsorship),
    });
  } catch (error) {
    respondError(res, error);
  }
});

exports.router = router;
