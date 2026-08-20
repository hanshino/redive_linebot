const createRouter = require("express").Router;
const router = createRouter();
const { verifyToken } = require("../../middleware/validation");
const PublicMarketService = require("../../service/PublicMarketService");
const { DefaultLogger } = require("../../util/Logger");

const MESSAGES = {
  NOT_FOUND: "找不到這筆委託",
  // 賣單與收購單共用這個碼，文案改成發布者語意才兩邊都說得通。
  FORBIDDEN: "你不是這筆委託的發布者",
  NOT_OPEN: "這筆委託已結束，無法再操作",
  INVALID_PRICE: `價格必須是 ${PublicMarketService.MIN_PRICE} ～ ${PublicMarketService.MAX_PRICE} 的整數（每片／每隻單價）`,
  INVALID_ITEM: "角色 ID 不正確",
  INVALID_ITEM_KIND: "委託標的種類不正確",
  INVALID_QUANTITY: `數量必須是 1 ～ ${PublicMarketService.MAX_QUANTITY} 的整數，角色只能是 1`,
  INVALID_TOTAL: `總額（單價 × 數量）不可超過 ${PublicMarketService.MAX_TOTAL}`,
  INVALID_ORDER_TYPE: "委託方向不正確",
  WRONG_ORDER_TYPE: "這筆委託不是用這種方式成交的",
  LISTING_CAP: `最多只能同時掛 ${PublicMarketService.MAX_OPEN_LISTINGS} 筆委託（賣單與收購單合計）`,
  NOT_OWNED: "你沒有這個角色",
  INSUFFICIENT_FRAGMENTS: "碎片不足",
  ALREADY_LISTED: "你已經掛過這個委託了",
  ALREADY_REQUESTED: "你已經有這個標的的收購單了",
  ALREADY_TAKEN: "此委託已被其他玩家買走或取消",
  INSUFFICIENT_FUNDS: "女神石不足",
  NOT_ENOUGH_TO_RESERVE: "女神石不足，發布收購單時需要先預扣全額",
  ALREADY_OWNED: "你已經擁有這個角色了",
  ALREADY_OWNED_REQUESTER: "收購方已經有這個角色了，收購單已失效並全額退款",
  SELLER_LOST_ITEM: "賣家已無此角色，系統已自動下架這筆委託",
  SELLER_LOST_FRAGMENTS: "賣家的碎片已不足，系統已自動下架這筆委託",
  IS_SELLER: "不能購買自己的委託",
  IS_BUYER: "不能賣給自己的收購單",
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
  asyncHandler(async (req, res) => {
    // 讀取端一律寬鬆解析：網址被亂改時退回「角色賣單簿」，不要噴 400 讓整頁掛掉。
    const orderType = PublicMarketService.normalizeOrderType(req.query.orderType);
    const itemKind = PublicMarketService.normalizeItemKind(req.query.itemKind);
    res.json(await PublicMarketService.getOpenCharacters(orderType, itemKind));
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

    const orderType = PublicMarketService.normalizeOrderType(req.query.orderType);
    const itemKind = PublicMarketService.normalizeItemKind(req.query.itemKind);

    res.json(
      await PublicMarketService.getListingsByItemId(itemId, req.profile.userId, orderType, itemKind)
    );
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

    // 寫入端嚴格解析：方向決定錢往哪個方向流、種類決定要搬走角色還是碎片，
    // 兩者拼錯都不能靜靜地當成預設值。
    const orderType = PublicMarketService.parseOrderType(req.body.orderType);
    if (orderType === null) return fail(res, 400, "INVALID_ORDER_TYPE");

    const itemKind = PublicMarketService.parseItemKind(req.body.itemKind);
    if (itemKind === null) return fail(res, 400, "INVALID_ITEM_KIND");

    if (!Number.isInteger(itemId) || itemId <= 0) return fail(res, 400, "INVALID_ITEM");
    if (!PublicMarketService.isValidPrice(price)) return fail(res, 400, "INVALID_PRICE");

    // 缺 quantity 一律當 1（第一階段 client 完全沒有這個欄位）。
    // Number("") === 0 會被下面的驗證擋掉，所以空字串與缺值分開處理。
    const rawQuantity = req.body.quantity;
    const quantity =
      rawQuantity === undefined || rawQuantity === null || rawQuantity === ""
        ? 1
        : Number(rawQuantity);

    // 這裡與 service 走同一支驗證：角色必須 quantity=1、碎片有上限、總額有天花板。
    const quantityError = PublicMarketService.validateQuantityAndTotal(itemKind, quantity, price);
    if (quantityError) return fail(res, 400, quantityError);

    const result = await PublicMarketService.createListing(userId, {
      itemId,
      price,
      orderType,
      itemKind,
      quantity,
    });
    if (result.ok) return res.status(201).json(result.listing);

    if (result.code === "INVALID_PRICE") return fail(res, 400, result.code);
    if (result.code === "INVALID_ORDER_TYPE") return fail(res, 400, result.code);
    if (result.code === "INVALID_ITEM_KIND") return fail(res, 400, result.code);
    if (result.code === "INVALID_QUANTITY") return fail(res, 400, result.code);
    if (result.code === "INVALID_TOTAL") return fail(res, 400, result.code);
    if (result.code === "INVALID_ITEM") return fail(res, 400, result.code);
    if (result.code === "NOT_ENOUGH_TO_RESERVE") {
      return fail(res, 409, result.code, {
        balance: result.balance,
        // price 是「這筆需要多少」，碎片單即為總額（單價 × 數量）。
        price: result.price,
        shortfall: result.shortfall,
      });
    }
    if (result.code === "INSUFFICIENT_FRAGMENTS") {
      return fail(res, 409, result.code, {
        balance: result.balance,
        required: result.required,
        shortfall: result.shortfall,
      });
    }

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
    if (result.ok) {
      return res.json({
        listingId: result.listingId,
        status: "cancelled",
        // 賣單沒有退款這回事，欄位就不出現，前端用 `?? price` 自己處理。
        ...(result.refundedAmount != null ? { refundedAmount: result.refundedAmount } : {}),
      });
    }

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
        itemKind: result.itemKind,
        quantity: result.quantity,
        name: result.name,
        price: result.price,
        total: result.total,
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
        // price 是「這筆要付多少」，碎片單即為總額。
        price: result.price,
        shortfall: result.shortfall,
      });
    }
    if (result.code === "SELLER_LOST_FRAGMENTS") {
      // 掛單已被自動下架；前端靠這個碼把畫面降級成「已失效」，且要說明沒有扣款。
      return fail(res, 409, result.code, {
        available: result.available,
        required: result.required,
      });
    }

    return fail(res, 409, result.code);
  })
);

router.post(
  "/public-market/listings/:id/fulfill",
  verifyToken,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return fail(res, 404, "NOT_FOUND");

    const result = await PublicMarketService.fulfill(id, req.profile.userId);

    if (result.ok) {
      // 履約者不扣款也不需要餘額快照：service 沒讀他的餘額，回傳 netProceeds 就夠前端算。
      return res.json({
        listingId: result.listingId,
        itemId: result.itemId,
        itemKind: result.itemKind,
        quantity: result.quantity,
        name: result.name,
        price: result.price,
        total: result.total,
        fee: result.fee,
        netProceeds: result.netProceeds,
      });
    }

    if (result.code === "NOT_FOUND") return fail(res, 404, result.code);
    if (result.code === "IS_BUYER") return fail(res, 403, result.code);
    if (result.code === "ALREADY_OWNED_REQUESTER") {
      // 前端靠這個碼把畫面降級成「已失效」，refundedAmount 是退給收購方的金額。
      return fail(res, 409, result.code, { refundedAmount: result.refundedAmount });
    }
    if (result.code === "INSUFFICIENT_FRAGMENTS") {
      // 掛單「保持 open」，所以這裡沒有任何退款欄位 —— 與角色的 NOT_OWNED 一致。
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
