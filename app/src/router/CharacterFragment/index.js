const createRouter = require("express").Router;
const router = createRouter();
const { verifyToken } = require("../../middleware/validation");
const CharacterFragmentService = require("../../service/CharacterFragmentService");
const { DefaultLogger } = require("../../util/Logger");

const MESSAGES = {
  INVALID_ITEM: "角色 ID 不正確",
  INVALID_QUANTITY: "回收數量必須是大於 0 的整數",
  ITEM_NOT_FOUND: "找不到這個角色",
  INSUFFICIENT_FRAGMENTS: "碎片不足",
  ALREADY_OWNED: "你已經擁有這個角色了，碎片可以回收或放到市場上賣",
  INTERNAL: "系統忙碌中，請稍後再試",
};

function fail(res, status, code, extra = {}) {
  return res.status(status).json({ message: MESSAGES[code] || MESSAGES.INTERNAL, code, ...extra });
}

function asyncHandler(fn) {
  return (req, res) =>
    fn(req, res).catch(e => {
      DefaultLogger.error(e);
      if (!res.headersSent) fail(res, 500, "INTERNAL");
    });
}

/**
 * 從路由參數解析正整數 id，不合法回傳 null。
 */
function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get(
  "/character-fragments",
  verifyToken,
  asyncHandler(async (req, res) => {
    const fragments = await CharacterFragmentService.getInventory(req.profile.userId);
    res.json({ redeemCost: CharacterFragmentService.REDEEM_COST, fragments });
  })
);

router.post(
  "/character-fragments/:itemId/recycle",
  verifyToken,
  asyncHandler(async (req, res) => {
    const itemId = parseId(req.params.itemId);
    if (!itemId) return fail(res, 400, "INVALID_ITEM");

    // Number("") === 0 而 Number(undefined) === NaN，兩者都會被 isValidQuantity 擋掉；
    // 這裡不做「缺值當 1」的貼心處理 —— 回收是不可逆的，寧可讓前端明講數量。
    const quantity = Number(req.body.quantity);
    const result = await CharacterFragmentService.recycle(req.profile.userId, itemId, quantity);

    if (result.ok) {
      // 刻意不回女神石餘額：service 為了不在失敗路徑上多拿一個 inventory 的
      // gap lock（死鎖來源）而不讀它。前端要新餘額就打 /public-market/summary。
      return res.json({
        itemId: result.itemId,
        quantity: result.quantity,
        fragmentBalanceAfter: result.fragmentBalanceAfter,
        godStoneGained: result.godStoneGained,
      });
    }

    if (result.code === "INVALID_ITEM") return fail(res, 400, result.code);
    if (result.code === "INVALID_QUANTITY") return fail(res, 400, result.code);
    if (result.code === "INSUFFICIENT_FRAGMENTS") {
      return fail(res, 409, result.code, {
        balance: result.balance,
        required: result.required,
        shortfall: result.shortfall,
      });
    }

    return fail(res, 409, result.code);
  })
);

router.post(
  "/character-fragments/:itemId/redeem",
  verifyToken,
  asyncHandler(async (req, res) => {
    const itemId = parseId(req.params.itemId);
    if (!itemId) return fail(res, 400, "INVALID_ITEM");

    // 數量不可由 client 指定：兌換一律 150 換 1 隻。
    const result = await CharacterFragmentService.redeem(req.profile.userId, itemId);

    if (result.ok) {
      return res.json({
        itemId: result.itemId,
        name: result.name,
        headImage: result.headImage,
        star: result.star,
        cost: result.cost,
        fragmentBalanceAfter: result.fragmentBalanceAfter,
      });
    }

    if (result.code === "INVALID_ITEM") return fail(res, 400, result.code);
    if (result.code === "ITEM_NOT_FOUND") return fail(res, 404, result.code);
    if (result.code === "INSUFFICIENT_FRAGMENTS") {
      return fail(res, 409, result.code, {
        balance: result.balance,
        required: result.required,
        shortfall: result.shortfall,
      });
    }

    return fail(res, 409, result.code);
  })
);

exports.router = router;
