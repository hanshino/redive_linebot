const createRouter = require("express").Router;
const router = createRouter();
const { verifyToken } = require("../../middleware/validation");
const PublicMarketService = require("../../service/PublicMarketService");
const { DefaultLogger } = require("../../util/Logger");

const MESSAGES = {
  NOT_FOUND: "找不到這筆委託",
  FORBIDDEN: "你不是這筆委託的賣家",
  NOT_OPEN: "這筆委託已結束，無法再操作",
  INVALID_PRICE: `價格必須是 ${PublicMarketService.MIN_PRICE} ～ ${PublicMarketService.MAX_PRICE} 的整數`,
  INVALID_ITEM: "角色 ID 不正確",
  LISTING_CAP: `最多只能同時掛 ${PublicMarketService.MAX_OPEN_LISTINGS} 筆委託`,
  NOT_OWNED: "你沒有這個角色",
  ALREADY_LISTED: "你已經掛過這個角色了",
  ALREADY_TAKEN: "此委託已被其他玩家買走或取消",
  INSUFFICIENT_FUNDS: "女神石不足",
  ALREADY_OWNED: "你已經擁有這個角色了",
  SELLER_LOST_ITEM: "賣家已無此角色，系統已自動下架這筆委託",
  IS_SELLER: "不能購買自己的委託",
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
  "/public-market/summary",
  verifyToken,
  asyncHandler(async (req, res) => {
    res.json(await PublicMarketService.getSummary(req.profile.userId));
  })
);

router.get(
  "/public-market/characters",
  verifyToken,
  asyncHandler(async (_req, res) => {
    res.json(await PublicMarketService.getOpenCharacters());
  })
);

// 注意順序：/listings/:id 必須排在 /listings 之後才不會吃掉字面路徑，
// 但兩者 method 不同（GET /listings 需要 itemId query），仍明確分開宣告。
router.get(
  "/public-market/listings",
  verifyToken,
  asyncHandler(async (req, res) => {
    const itemId = parseId(req.query.itemId);
    if (!itemId) return fail(res, 400, "INVALID_ITEM");

    res.json(await PublicMarketService.getListingsByItemId(itemId, req.profile.userId));
  })
);

router.get(
  "/public-market/my-listings",
  verifyToken,
  asyncHandler(async (req, res) => {
    res.json(await PublicMarketService.getMyListings(req.profile.userId));
  })
);

router.get(
  "/public-market/listings/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 404, "NOT_FOUND");

    const detail = await PublicMarketService.getListingDetail(id, req.profile.userId);
    if (!detail) return fail(res, 404, "NOT_FOUND");

    res.json(detail);
  })
);

router.post(
  "/public-market/listings",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { userId } = req.profile;
    const itemId = Number(req.body.itemId);
    const price = Number(req.body.price);

    if (!Number.isInteger(itemId) || itemId <= 0) return fail(res, 400, "INVALID_ITEM");
    if (!PublicMarketService.isValidPrice(price)) return fail(res, 400, "INVALID_PRICE");

    const result = await PublicMarketService.createListing(userId, { itemId, price });
    if (result.ok) return res.status(201).json(result.listing);

    if (result.code === "INVALID_PRICE") return fail(res, 400, result.code);
    return fail(res, 409, result.code, {
      ...(result.code === "LISTING_CAP"
        ? { myOpenCount: result.myOpenCount, maxOpen: result.maxOpen }
        : {}),
    });
  })
);

router.delete(
  "/public-market/listings/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 404, "NOT_FOUND");

    const result = await PublicMarketService.cancelListing(id, req.profile.userId);
    if (result.ok) return res.json({ listingId: result.listingId, status: "cancelled" });

    if (result.code === "NOT_FOUND") return fail(res, 404, result.code);
    if (result.code === "FORBIDDEN") return fail(res, 403, result.code);
    return fail(res, 409, result.code);
  })
);

router.post(
  "/public-market/listings/:id/purchase",
  verifyToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 404, "NOT_FOUND");

    const result = await PublicMarketService.purchase(id, req.profile.userId);

    if (result.ok) {
      return res.json({
        listingId: result.listingId,
        itemId: result.itemId,
        name: result.name,
        price: result.price,
        fee: result.fee,
        netProceeds: result.netProceeds,
        balanceAfter: result.balanceAfter,
      });
    }

    if (result.code === "NOT_FOUND") return fail(res, 404, result.code);
    if (result.code === "IS_SELLER") return fail(res, 403, result.code);
    if (result.code === "INSUFFICIENT_FUNDS") {
      return fail(res, 409, result.code, {
        balance: result.balance,
        price: result.price,
        shortfall: result.shortfall,
      });
    }

    return fail(res, 409, result.code);
  })
);

exports.router = router;
