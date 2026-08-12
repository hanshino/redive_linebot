// PublicMarketService 的純邏輯、購買競態、收購單金流測試。
// 全域 setup（app/__tests__/setup.js）已把 util/mysql 換成 mock query builder，
// 其 `transaction(cb)` 會直接執行 cb，因此不需要實體 MySQL。
// model 層一律 mock，測的是 service 的決策而非 SQL。

jest.mock("../../model/application/PublicMarket", () => ({
  find: jest.fn(),
  getById: jest.fn(),
  lockById: jest.fn(),
  create: jest.fn(),
  countOpenByRequester: jest.fn(),
  countOpen: jest.fn(),
  findOpenBySellerAndItem: jest.fn(),
  findOpenBuyByBuyerAndItem: jest.fn(),
  getOpenListingsByRequester: jest.fn(),
  getOpenListingsByItemId: jest.fn(),
  getOpenCharacters: jest.fn(),
  getClosedListingsByUser: jest.fn(),
  markSold: jest.fn(),
  markFulfilled: jest.fn(),
  markClosed: jest.fn(),
}));

jest.mock("../../model/application/Inventory", () => ({
  inventory: {
    create: jest.fn(),
    deleteUserItem: jest.fn(),
    increaseGodStone: jest.fn(),
    decreaseGodStone: jest.fn(),
  },
}));

jest.mock("../../model/princess/gacha", () => ({
  model: { find: jest.fn() },
}));

jest.mock("../ProfileService", () => ({
  resolveDisplayName: jest.fn(async id => `Name-${id}`),
}));

jest.mock("../AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));

const Service = require("../PublicMarketService");
const PublicMarketModel = require("../../model/application/PublicMarket");
const { inventory: InventoryModel } = require("../../model/application/Inventory");
const { model: GachaPoolModel } = require("../../model/princess/gacha");
const AchievementEngine = require("../AchievementEngine");

const SELLER = "U" + "1".repeat(32);
const BUYER = "U" + "2".repeat(32);

/**
 * getBalance / ownsCharacter 都是直接打 mysql("inventory")，
 * 這裡改寫 mock builder 的 first()，依查詢條件回不同 sum。
 *
 * owner 可以是布林（單一使用者情境）或 `{ [userId]: bool }`（收購單有兩造）。
 * 回傳值是被讀取到的 itemId 順序，測試靠它斷言鎖序。
 */
function stubInventoryReads({ balance = 0, buyerOwns = false, owns = null } = {}) {
  const mysql = require("../../util/mysql");
  const readOrder = [];
  let lastWhere = {};

  mysql.where.mockImplementation(cond => {
    if (cond && typeof cond === "object") lastWhere = cond;
    return mysql;
  });

  mysql.first.mockImplementation(async () => {
    readOrder.push(lastWhere.itemId);
    if (lastWhere.itemId === 999) return { amount: balance };
    if (owns && typeof owns === "object") {
      return { amount: owns[lastWhere.userId] ? 1 : 0 };
    }
    return { amount: buyerOwns ? 1 : 0 };
  });

  return readOrder;
}

beforeEach(() => {
  jest.clearAllMocks();

  const mysql = require("../../util/mysql");
  mysql.where.mockReturnValue(mysql);
  mysql.sum.mockReturnValue(mysql);
  mysql.forUpdate = jest.fn().mockReturnValue(mysql);
  mysql.first.mockResolvedValue(null);

  InventoryModel.deleteUserItem.mockResolvedValue(1);
  InventoryModel.create.mockResolvedValue(1);
  InventoryModel.increaseGodStone.mockResolvedValue([1]);
  InventoryModel.decreaseGodStone.mockResolvedValue([1]);
  GachaPoolModel.find.mockResolvedValue({ ID: 101, Name: "佩可莉ーヌ", Star: "3" });
  PublicMarketModel.countOpenByRequester.mockResolvedValue(0);
  PublicMarketModel.findOpenBySellerAndItem.mockResolvedValue(null);
  PublicMarketModel.findOpenBuyByBuyerAndItem.mockResolvedValue(null);
  PublicMarketModel.markSold.mockResolvedValue(1);
  PublicMarketModel.markFulfilled.mockResolvedValue(1);
  PublicMarketModel.markClosed.mockResolvedValue(1);
  AchievementEngine.evaluate.mockResolvedValue({ unlocked: [] });
});

describe("手續費計算", () => {
  it.each([
    [1000, 50, 950],
    [8600, 430, 8170],
    [999, 50, 949],
    [1, 1, 0],
    [20, 1, 19],
    [21, 2, 19],
    [10000000, 500000, 9500000],
  ])("price %i -> fee %i / net %i（5%% 無條件進位）", (price, fee, net) => {
    expect(Service.calcFee(price)).toBe(fee);
    expect(Service.calcNetProceeds(price)).toBe(net);
  });

  it("手續費是銷毀的：買家付的 price 不等於賣家收到的 net", () => {
    const price = 8600;
    expect(Service.calcNetProceeds(price)).toBeLessThan(price);
    expect(price - Service.calcNetProceeds(price)).toBe(Service.calcFee(price));
  });
});

describe("價格驗證", () => {
  it.each([1, 2, 9999999, 10000000])("接受 %i", p => expect(Service.isValidPrice(p)).toBe(true));

  it.each([0, -1, 10000001, 1.5, NaN, Infinity, "500", null, undefined])("拒絕 %p", p =>
    expect(Service.isValidPrice(p)).toBe(false)
  );
});

describe("委託方向解析", () => {
  it.each([
    [undefined, "sell"],
    [null, "sell"],
    ["", "sell"],
    ["sell", "sell"],
    ["buy", "buy"],
    ["BUY", "buy"],
    ["Sell", "sell"],
    ["nonsense", "sell"],
    [123, "sell"],
  ])("normalizeOrderType(%p) -> %s（讀取端寬鬆，缺值當賣單）", (input, expected) => {
    expect(Service.normalizeOrderType(input)).toBe(expected);
  });

  it.each([
    [undefined, "sell"],
    [null, "sell"],
    ["", "sell"],
    ["sell", "sell"],
    ["buy", "buy"],
    ["BUY", "buy"],
  ])("parseOrderType(%p) -> %s", (input, expected) => {
    expect(Service.parseOrderType(input)).toBe(expected);
  });

  it.each(["nonsense", "SELL_", 0, 1, [], {}])(
    "parseOrderType(%p) -> null（寫入端嚴格，方向拼錯不能當賣單）",
    input => {
      expect(Service.parseOrderType(input)).toBeNull();
    }
  );
});

describe("升星不轉移", () => {
  it("attributes 用 gacha_pool 的基礎星數，不是賣家的升星值", () => {
    expect(Service.baseAttributes({ Star: "3" })).toBe(JSON.stringify([{ key: "star", value: 3 }]));
  });

  it("查無角色資料時退回 1 星，不會寫入 NaN", () => {
    expect(Service.baseStarOf(null)).toBe(1);
    expect(Service.baseStarOf({ Star: "" })).toBe(1);
  });
});

describe("發布者判定", () => {
  it("賣單的發布者是賣家", () => {
    expect(Service.requesterIdOf({ orderType: "sell", sellerId: SELLER, buyerId: BUYER })).toBe(
      SELLER
    );
  });

  it("收購單的發布者是買家，即使已經有履約的賣家", () => {
    expect(Service.requesterIdOf({ orderType: "buy", sellerId: SELLER, buyerId: BUYER })).toBe(
      BUYER
    );
  });

  it("缺 orderType 時當賣單處理（第一階段資料）", () => {
    expect(Service.requesterIdOf({ sellerId: SELLER, buyerId: null })).toBe(SELLER);
  });
});

describe("blockReason 判定順序", () => {
  const sellCtx = {
    orderType: "sell",
    status: "open",
    isSeller: false,
    owns: false,
    balance: 100,
    price: 50,
  };

  it("賣單可買時為 null", () => expect(Service.resolveBlockReason(sellCtx)).toBeNull());

  it("非 open 一律 NOT_OPEN，優先於身分判定", () => {
    expect(
      Service.resolveBlockReason({
        ...sellCtx,
        status: "sold",
        isSeller: true,
        owns: true,
        balance: 0,
      })
    ).toBe("NOT_OPEN");
  });

  it.each([
    [{ isSeller: true }, "IS_SELLER"],
    [{ owns: true }, "ALREADY_OWNED"],
    [{ balance: 10 }, "INSUFFICIENT_FUNDS"],
  ])("賣單 %p -> %s", (patch, expected) => {
    expect(Service.resolveBlockReason({ ...sellCtx, ...patch })).toBe(expected);
  });

  const buyCtx = {
    orderType: "buy",
    status: "open",
    isRequester: false,
    owns: true,
    balance: 0,
    price: 5000,
  };

  it("收購單：持有角色就能履約，餘額為 0 也不擋（錢在發單時已預扣）", () => {
    expect(Service.resolveBlockReason(buyCtx)).toBeNull();
  });

  it.each([
    [{ isRequester: true }, "IS_BUYER"],
    [{ owns: false }, "NOT_OWNED"],
  ])("收購單 %p -> %s", (patch, expected) => {
    expect(Service.resolveBlockReason({ ...buyCtx, ...patch })).toBe(expected);
  });

  it("收購單非 open 仍優先 NOT_OPEN", () => {
    expect(Service.resolveBlockReason({ ...buyCtx, status: "invalid" })).toBe("NOT_OPEN");
  });
});

describe("掛賣單", () => {
  it("已有 10 筆開放委託時回 LISTING_CAP，且不寫入", async () => {
    PublicMarketModel.countOpenByRequester.mockResolvedValue(10);

    const res = await Service.createListing(SELLER, { itemId: 101, price: 1000 });

    expect(res).toMatchObject({ ok: false, code: "LISTING_CAP", maxOpen: 10 });
    expect(PublicMarketModel.create).not.toHaveBeenCalled();
  });

  it("第 10 筆（已有 9 筆）可以掛，且寫入 order_type=sell", async () => {
    PublicMarketModel.countOpenByRequester.mockResolvedValue(9);
    PublicMarketModel.create.mockResolvedValue(77);
    PublicMarketModel.getById.mockResolvedValue({
      id: 77,
      itemId: 101,
      orderType: "sell",
      sellerId: SELLER,
      price: 1000,
      fee: 50,
      status: "open",
      name: "佩可莉ーヌ",
      star: "3",
    });
    stubInventoryReads({ balance: 0, buyerOwns: true }); // 賣家持有該角色

    const res = await Service.createListing(SELLER, { itemId: 101, price: 1000 });

    expect(res.ok).toBe(true);
    expect(res.listing).toMatchObject({ fee: 50, netProceeds: 950, star: 3, orderType: "sell" });
    expect(PublicMarketModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ order_type: "sell", price: 1000, fee: 50, status: "open" })
    );
  });

  it("價格不合法時連上限都不查", async () => {
    const res = await Service.createListing(SELLER, { itemId: 101, price: 0 });
    expect(res).toEqual({ ok: false, code: "INVALID_PRICE" });
    expect(PublicMarketModel.countOpenByRequester).not.toHaveBeenCalled();
  });

  it("同一角色重複掛賣單回 ALREADY_LISTED", async () => {
    PublicMarketModel.findOpenBySellerAndItem.mockResolvedValue({ id: 5 });
    stubInventoryReads({ balance: 0, buyerOwns: true });

    const res = await Service.createListing(SELLER, { itemId: 101, price: 1000 });

    expect(res).toEqual({ ok: false, code: "ALREADY_LISTED" });
    expect(PublicMarketModel.create).not.toHaveBeenCalled();
  });

  it("方向拼錯直接擋下，不會誤走賣單流程", async () => {
    const res = await Service.createListing(SELLER, {
      itemId: 101,
      price: 1000,
      orderType: "sel",
    });

    expect(res).toEqual({ ok: false, code: "INVALID_ORDER_TYPE" });
    expect(PublicMarketModel.create).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
  });
});

describe("發布收購單", () => {
  function stubCreated(id = 88, overrides = {}) {
    PublicMarketModel.create.mockResolvedValue(id);
    PublicMarketModel.getById.mockResolvedValue({
      id,
      itemId: 101,
      orderType: "buy",
      sellerId: null,
      buyerId: BUYER,
      price: 1000,
      fee: 50,
      status: "open",
      name: "佩可莉ーヌ",
      star: "3",
      ...overrides,
    });
  }

  it("成功：寫入 buy 單（buyer_id=發單者、seller_id=null）並在同交易預扣全額", async () => {
    stubInventoryReads({ balance: 5000, buyerOwns: false });
    stubCreated(88);

    const res = await Service.createListing(BUYER, {
      itemId: 101,
      price: 1000,
      orderType: "buy",
    });

    expect(res.ok).toBe(true);
    expect(res.listing).toMatchObject({
      id: 88,
      orderType: "buy",
      buyerId: BUYER,
      sellerId: null,
      price: 1000,
      balanceAfter: 4000,
      mine: true,
    });

    expect(PublicMarketModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        order_type: "buy",
        buyer_id: BUYER,
        seller_id: null,
        item_id: 101,
        price: 1000,
        fee: 50,
        status: "open",
      }),
      expect.anything()
    );

    expect(InventoryModel.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BUYER,
        amount: 1000,
        note: "public_market:buy_order:reserve:88",
      })
    );
    expect(InventoryModel.decreaseGodStone).toHaveBeenCalledTimes(1);
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
  });

  it("餘額不足回 NOT_ENOUGH_TO_RESERVE，不建單也不扣款", async () => {
    stubInventoryReads({ balance: 300, buyerOwns: false });

    const res = await Service.createListing(BUYER, {
      itemId: 101,
      price: 1000,
      orderType: "buy",
    });

    expect(res).toEqual({
      ok: false,
      code: "NOT_ENOUGH_TO_RESERVE",
      balance: 300,
      price: 1000,
      shortfall: 700,
    });
    expect(PublicMarketModel.create).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
  });

  it("餘額剛好等於出價可以發布（邊界不能少一塊）", async () => {
    stubInventoryReads({ balance: 1000, buyerOwns: false });
    stubCreated(89);

    const res = await Service.createListing(BUYER, {
      itemId: 101,
      price: 1000,
      orderType: "buy",
    });

    expect(res.ok).toBe(true);
    expect(res.listing.balanceAfter).toBe(0);
  });

  it("已持有該角色回 ALREADY_OWNED，不預扣", async () => {
    stubInventoryReads({ balance: 5000, buyerOwns: true });

    const res = await Service.createListing(BUYER, {
      itemId: 101,
      price: 1000,
      orderType: "buy",
    });

    expect(res).toEqual({ ok: false, code: "ALREADY_OWNED" });
    expect(PublicMarketModel.create).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
  });

  it("同一角色已有開放收購單回 ALREADY_REQUESTED，不重複預扣", async () => {
    stubInventoryReads({ balance: 5000, buyerOwns: false });
    PublicMarketModel.findOpenBuyByBuyerAndItem.mockResolvedValue({ id: 12 });

    const res = await Service.createListing(BUYER, {
      itemId: 101,
      price: 1000,
      orderType: "buy",
    });

    expect(res).toEqual({ ok: false, code: "ALREADY_REQUESTED" });
    expect(PublicMarketModel.create).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
  });

  it("上限是賣單 + 收購單合計：已有 10 筆（含賣單）就不能再發收購單", async () => {
    stubInventoryReads({ balance: 999999, buyerOwns: false });
    PublicMarketModel.countOpenByRequester.mockResolvedValue(10);

    const res = await Service.createListing(BUYER, {
      itemId: 101,
      price: 1000,
      orderType: "buy",
    });

    expect(res).toMatchObject({ ok: false, code: "LISTING_CAP", myOpenCount: 10, maxOpen: 10 });
    expect(PublicMarketModel.create).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
  });

  it("上限查的是合計計數（countOpenByRequester），不是只看賣單", async () => {
    stubInventoryReads({ balance: 5000, buyerOwns: false });
    stubCreated(90);

    await Service.createListing(BUYER, { itemId: 101, price: 1000, orderType: "buy" });

    expect(PublicMarketModel.countOpenByRequester).toHaveBeenCalledWith(BUYER, expect.anything());
  });

  it("女神石本身（999）不能拿來發收購單", async () => {
    const res = await Service.createListing(BUYER, {
      itemId: 999,
      price: 1000,
      orderType: "buy",
    });

    expect(res).toEqual({ ok: false, code: "INVALID_ITEM" });
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
  });

  it("預扣發生在建單之後，note 帶得到掛單 id（對帳靠這個字串）", async () => {
    stubInventoryReads({ balance: 5000, buyerOwns: false });
    stubCreated(4242);

    const order = [];
    PublicMarketModel.create.mockImplementation(async () => {
      order.push("create");
      return 4242;
    });
    InventoryModel.decreaseGodStone.mockImplementation(async () => {
      order.push("reserve");
      return [1];
    });

    await Service.createListing(BUYER, { itemId: 101, price: 1000, orderType: "buy" });

    expect(order).toEqual(["create", "reserve"]);
    expect(InventoryModel.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ note: "public_market:buy_order:reserve:4242" })
    );
  });

  it("鎖序是 999（餘額）→ itemId（持有），與 purchase 一致", async () => {
    const readOrder = stubInventoryReads({ balance: 5000, buyerOwns: false });
    stubCreated(91);

    await Service.createListing(BUYER, { itemId: 101, price: 1000, orderType: "buy" });

    expect(readOrder).toEqual([999, 101]);
  });
});

describe("取消委託", () => {
  function openRow(overrides = {}) {
    return {
      id: 42,
      order_type: "sell",
      seller_id: SELLER,
      buyer_id: null,
      item_id: 101,
      price: 1000,
      fee: 50,
      status: "open",
      ...overrides,
    };
  }

  it("賣家取消賣單：不退款、不收費", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openRow());

    const res = await Service.cancelListing(42, SELLER);

    expect(res).toEqual({ ok: true, listingId: 42 });
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
  });

  it("收購方取消收購單：同交易內全額退款一次，回 refundedAmount", async () => {
    PublicMarketModel.lockById.mockResolvedValue(
      openRow({ order_type: "buy", seller_id: null, buyer_id: BUYER, price: 8600, fee: 430 })
    );

    const res = await Service.cancelListing(42, BUYER);

    expect(res).toEqual({ ok: true, listingId: 42, refundedAmount: 8600 });
    // 退全額，不扣手續費 —— 沒成交就不該收費
    expect(InventoryModel.increaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BUYER,
        amount: 8600,
        note: "public_market:buy_order:refund:cancel:42",
      })
    );
    expect(InventoryModel.increaseGodStone).toHaveBeenCalledTimes(1);
  });

  it("收購單的賣方欄位（NULL）不能拿來當發布者：非發布者一律 FORBIDDEN", async () => {
    PublicMarketModel.lockById.mockResolvedValue(
      openRow({ order_type: "buy", seller_id: null, buyer_id: BUYER })
    );

    const res = await Service.cancelListing(42, SELLER);

    expect(res).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
    expect(PublicMarketModel.markClosed).not.toHaveBeenCalled();
  });

  it("賣單的買家欄位不能拿來取消（只有發布者可以）", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openRow({ buyer_id: BUYER }));

    const res = await Service.cancelListing(42, BUYER);

    expect(res).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it.each(["sold", "cancelled", "invalid"])("終態 %s 不可再取消，也不退款", async status => {
    PublicMarketModel.lockById.mockResolvedValue(
      openRow({ order_type: "buy", seller_id: null, buyer_id: BUYER, status })
    );

    const res = await Service.cancelListing(42, BUYER);

    expect(res).toEqual({ ok: false, code: "NOT_OPEN" });
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
    expect(PublicMarketModel.markClosed).not.toHaveBeenCalled();
  });

  it("條件式關閉影響 0 列（別人先關掉）時不退第二次款", async () => {
    PublicMarketModel.lockById.mockResolvedValue(
      openRow({ order_type: "buy", seller_id: null, buyer_id: BUYER })
    );
    PublicMarketModel.markClosed.mockResolvedValue(0);

    const res = await Service.cancelListing(42, BUYER);

    expect(res).toEqual({ ok: false, code: "NOT_OPEN" });
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
  });

  it("查無此單回 NOT_FOUND", async () => {
    PublicMarketModel.lockById.mockResolvedValue(undefined);

    const res = await Service.cancelListing(42, BUYER);

    expect(res).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("購買競態（賣單）", () => {
  function openListing(overrides = {}) {
    return {
      id: 42,
      order_type: "sell",
      seller_id: SELLER,
      buyer_id: null,
      item_id: 101,
      price: 1000,
      fee: 50,
      status: "open",
      ...overrides,
    };
  }

  function expectNoMoneyMoved() {
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
    expect(InventoryModel.deleteUserItem).not.toHaveBeenCalled();
    expect(InventoryModel.create).not.toHaveBeenCalled();
  }

  it.each(["sold", "cancelled", "invalid"])(
    "狀態 %s 的掛單回 ALREADY_TAKEN，且不動任何女神石",
    async status => {
      PublicMarketModel.lockById.mockResolvedValue(openListing({ status }));
      stubInventoryReads({ balance: 999999 });

      const res = await Service.purchase(42, BUYER);

      expect(res).toEqual({ ok: false, code: "ALREADY_TAKEN" });
      expectNoMoneyMoved();
      expect(PublicMarketModel.markSold).not.toHaveBeenCalled();
    }
  );

  it("拿收購單走 purchase 會被擋成 WRONG_ORDER_TYPE，不動任何金流", async () => {
    PublicMarketModel.lockById.mockResolvedValue(
      openListing({ order_type: "buy", seller_id: null, buyer_id: BUYER })
    );
    stubInventoryReads({ balance: 999999 });

    const res = await Service.purchase(42, SELLER);

    expect(res).toEqual({ ok: false, code: "WRONG_ORDER_TYPE" });
    expectNoMoneyMoved();
    expect(PublicMarketModel.markSold).not.toHaveBeenCalled();
    expect(PublicMarketModel.markClosed).not.toHaveBeenCalled();
  });

  it("鎖失效導致 markSold 影響 0 列時整筆回滾成 ALREADY_TAKEN", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    PublicMarketModel.markSold.mockResolvedValue(0);
    stubInventoryReads({ balance: 5000 });

    const res = await Service.purchase(42, BUYER);

    expect(res).toEqual({ ok: false, code: "ALREADY_TAKEN" });
  });

  it("餘額不足回 INSUFFICIENT_FUNDS 並附差額，不扣款", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 300 });

    const res = await Service.purchase(42, BUYER);

    expect(res).toEqual({
      ok: false,
      code: "INSUFFICIENT_FUNDS",
      balance: 300,
      price: 1000,
      shortfall: 700,
    });
    expectNoMoneyMoved();
  });

  it("已擁有該角色回 ALREADY_OWNED，不扣款", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 5000, buyerOwns: true });

    const res = await Service.purchase(42, BUYER);

    expect(res).toEqual({ ok: false, code: "ALREADY_OWNED" });
    expectNoMoneyMoved();
  });

  it("交易內的持有檢查是 locking read（FOR UPDATE），關掉快照空窗", async () => {
    const mysql = require("../../util/mysql");
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 5000 });

    await Service.purchase(42, BUYER);

    // 餘額與持有各一次，兩次都要鎖；只鎖餘額的話買家仍可能在檢查後才拿到角色。
    expect(mysql.forUpdate).toHaveBeenCalledTimes(2);
  });

  it("鎖序是 999（餘額）→ itemId（持有），與 createBuyOrder / GodStoneShop 一致", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    const readOrder = stubInventoryReads({ balance: 5000 });

    await Service.purchase(42, BUYER);

    // 反過來（itemId 先於 999）會與其他路徑對同一個買家反向取鎖，形成死鎖。
    expect(readOrder).toEqual([999, 101]);
  });

  it("鎖序調整不改行為：已持有仍優先於餘額不足回報", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    // 兩個條件同時成立：錢不夠，而且已經有角色了
    stubInventoryReads({ balance: 0, buyerOwns: true });

    const res = await Service.purchase(42, BUYER);

    expect(res).toEqual({ ok: false, code: "ALREADY_OWNED" });
    expectNoMoneyMoved();
  });

  it("買自己的單回 IS_SELLER", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 5000 });

    const res = await Service.purchase(42, SELLER);

    expect(res).toEqual({ ok: false, code: "IS_SELLER" });
    expectNoMoneyMoved();
  });

  it("賣家已無角色時標記 invalid 自動下架，且沒有女神石異動", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    InventoryModel.deleteUserItem.mockResolvedValue(0);
    stubInventoryReads({ balance: 5000 });

    const res = await Service.purchase(42, BUYER);

    expect(res).toEqual({ ok: false, code: "SELLER_LOST_ITEM" });
    expect(PublicMarketModel.markClosed).toHaveBeenCalledWith(42, "invalid", expect.anything());
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
  });

  it("成功成交：買家扣 price、賣家收 price-fee、手續費無人收", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing({ price: 8600, fee: 430 }));
    stubInventoryReads({ balance: 10000 });

    const res = await Service.purchase(42, BUYER);

    expect(res).toMatchObject({
      ok: true,
      listingId: 42,
      price: 8600,
      fee: 430,
      netProceeds: 8170,
      balanceAfter: 1400,
    });

    expect(InventoryModel.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ userId: BUYER, amount: 8600 })
    );
    expect(InventoryModel.increaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SELLER, amount: 8170 })
    );
    // 只有這兩筆金流：手續費沒有轉給任何第三方
    expect(InventoryModel.increaseGodStone).toHaveBeenCalledTimes(1);
    expect(InventoryModel.decreaseGodStone).toHaveBeenCalledTimes(1);
  });

  it("成交時買家拿到的是基礎星數，不是賣家的升星值", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    GachaPoolModel.find.mockResolvedValue({ ID: 101, Name: "佩可莉ーヌ", Star: "3" });
    stubInventoryReads({ balance: 10000 });

    await Service.purchase(42, BUYER);

    expect(InventoryModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BUYER,
        itemId: 101,
        itemAmount: 1,
        attributes: JSON.stringify([{ key: "star", value: 3 }]),
      }),
      expect.anything()
    );
  });

  it("缺 order_type 的舊資料仍走賣單流程（相容第一階段）", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing({ order_type: undefined }));
    stubInventoryReads({ balance: 10000 });

    const res = await Service.purchase(42, BUYER);

    expect(res.ok).toBe(true);
    expect(PublicMarketModel.markSold).toHaveBeenCalledWith(42, BUYER, expect.anything());
  });
});

describe("履約收購單（fulfill）", () => {
  function buyOrder(overrides = {}) {
    return {
      id: 55,
      order_type: "buy",
      seller_id: null,
      buyer_id: BUYER,
      item_id: 101,
      price: 8600,
      fee: 430,
      status: "open",
      ...overrides,
    };
  }

  it("成功：角色轉給收購方、履約者實收 price-fee、收購方不再被扣款", async () => {
    PublicMarketModel.lockById.mockResolvedValue(buyOrder());
    // 收購方沒有角色、履約者有
    stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: true } });

    const res = await Service.fulfill(55, SELLER);

    expect(res).toMatchObject({
      ok: true,
      listingId: 55,
      itemId: 101,
      price: 8600,
      fee: 430,
      netProceeds: 8170,
    });

    // 角色從履約者移到收購方
    expect(InventoryModel.deleteUserItem).toHaveBeenCalledWith(SELLER, 101, expect.anything());
    expect(InventoryModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: BUYER, itemId: 101, itemAmount: 1 }),
      expect.anything()
    );

    // 錢：只有履約者入帳，收購方一毛都不再扣（發單時已預扣）
    expect(InventoryModel.increaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SELLER,
        amount: 8170,
        note: "public_market:buy_order:payout:55",
      })
    );
    expect(InventoryModel.increaseGodStone).toHaveBeenCalledTimes(1);
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();

    // 成交要把履約者寫進 seller_id，否則「我的掛單」對不出賣方
    expect(PublicMarketModel.markFulfilled).toHaveBeenCalledWith(55, SELLER, expect.anything());
  });

  it("手續費銷毀：收購方付出 price，履約者只收 price-fee，差額沒有第三方入帳", async () => {
    PublicMarketModel.lockById.mockResolvedValue(buyOrder({ price: 1000, fee: 50 }));
    stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: true } });

    const res = await Service.fulfill(55, SELLER);

    const credited = InventoryModel.increaseGodStone.mock.calls.reduce(
      (sum, [args]) => sum + args.amount,
      0
    );
    expect(res.netProceeds).toBe(950);
    expect(credited).toBe(950);
  });

  it("履約者拿到的角色是基礎星數，升星不隨交易轉移", async () => {
    PublicMarketModel.lockById.mockResolvedValue(buyOrder());
    GachaPoolModel.find.mockResolvedValue({ ID: 101, Name: "佩可莉ーヌ", Star: "3" });
    stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: true } });

    await Service.fulfill(55, SELLER);

    expect(InventoryModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BUYER,
        attributes: JSON.stringify([{ key: "star", value: 3 }]),
        note: "public_market:buy_order:fulfill:55",
      }),
      expect.anything()
    );
  });

  it("自己履約自己的收購單回 IS_BUYER，什麼都不動", async () => {
    PublicMarketModel.lockById.mockResolvedValue(buyOrder());
    stubInventoryReads({ balance: 0, owns: { [BUYER]: true } });

    const res = await Service.fulfill(55, BUYER);

    expect(res).toEqual({ ok: false, code: "IS_BUYER" });
    expect(InventoryModel.deleteUserItem).not.toHaveBeenCalled();
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
    expect(PublicMarketModel.markClosed).not.toHaveBeenCalled();
    expect(PublicMarketModel.markFulfilled).not.toHaveBeenCalled();
  });

  it("履約者沒有角色：只回 NOT_OWNED，收購單保持 open、不退款（否則等於免費下架別人的單）", async () => {
    PublicMarketModel.lockById.mockResolvedValue(buyOrder());
    stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: false } });
    InventoryModel.deleteUserItem.mockResolvedValue(0);

    const res = await Service.fulfill(55, SELLER);

    expect(res).toEqual({ ok: false, code: "NOT_OWNED" });
    expect(PublicMarketModel.markClosed).not.toHaveBeenCalled();
    expect(PublicMarketModel.markFulfilled).not.toHaveBeenCalled();
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
    expect(InventoryModel.create).not.toHaveBeenCalled();
  });

  it("收購方在期間內自己拿到角色：作廢 + 全額退款一次，回可辨識的碼與金額", async () => {
    PublicMarketModel.lockById.mockResolvedValue(buyOrder());
    stubInventoryReads({ balance: 0, owns: { [BUYER]: true, [SELLER]: true } });

    const res = await Service.fulfill(55, SELLER);

    expect(res).toEqual({
      ok: false,
      code: "ALREADY_OWNED_REQUESTER",
      refundedAmount: 8600,
    });
    expect(PublicMarketModel.markClosed).toHaveBeenCalledWith(55, "invalid", expect.anything());
    expect(InventoryModel.increaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BUYER,
        amount: 8600,
        note: "public_market:buy_order:refund:buyer_owned:55",
      })
    );
    expect(InventoryModel.increaseGodStone).toHaveBeenCalledTimes(1);
    // 履約者的角色不能被吃掉
    expect(InventoryModel.deleteUserItem).not.toHaveBeenCalled();
  });

  it("收購方已持有 + 條件式作廢影響 0 列（別人先關）：改回 ALREADY_TAKEN，不退第二次", async () => {
    PublicMarketModel.lockById.mockResolvedValue(buyOrder());
    stubInventoryReads({ balance: 0, owns: { [BUYER]: true, [SELLER]: true } });
    PublicMarketModel.markClosed.mockResolvedValue(0);

    const res = await Service.fulfill(55, SELLER);

    expect(res).toEqual({ ok: false, code: "ALREADY_TAKEN" });
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
  });

  it.each(["sold", "cancelled", "invalid"])("終態 %s 回 ALREADY_TAKEN，不動金流", async status => {
    PublicMarketModel.lockById.mockResolvedValue(buyOrder({ status }));
    stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: true } });

    const res = await Service.fulfill(55, SELLER);

    expect(res).toEqual({ ok: false, code: "ALREADY_TAKEN" });
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
    expect(InventoryModel.deleteUserItem).not.toHaveBeenCalled();
  });

  it("拿賣單走 fulfill 被擋成 WRONG_ORDER_TYPE", async () => {
    PublicMarketModel.lockById.mockResolvedValue(
      buyOrder({ order_type: "sell", seller_id: SELLER, buyer_id: null })
    );
    stubInventoryReads({ balance: 0, owns: { [SELLER]: true } });

    const res = await Service.fulfill(55, BUYER);

    expect(res).toEqual({ ok: false, code: "WRONG_ORDER_TYPE" });
    expect(InventoryModel.deleteUserItem).not.toHaveBeenCalled();
    expect(InventoryModel.increaseGodStone).not.toHaveBeenCalled();
  });

  it("缺 order_type 的舊資料不會被誤當收購單履約", async () => {
    PublicMarketModel.lockById.mockResolvedValue(
      buyOrder({ order_type: undefined, seller_id: SELLER, buyer_id: null })
    );
    stubInventoryReads({ balance: 0, owns: { [SELLER]: true } });

    const res = await Service.fulfill(55, BUYER);

    expect(res).toEqual({ ok: false, code: "WRONG_ORDER_TYPE" });
  });

  it("條件式履約影響 0 列（有人繞過行鎖）時整筆回滾成 ALREADY_TAKEN", async () => {
    PublicMarketModel.lockById.mockResolvedValue(buyOrder());
    stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: true } });
    PublicMarketModel.markFulfilled.mockResolvedValue(0);

    const res = await Service.fulfill(55, SELLER);

    expect(res).toEqual({ ok: false, code: "ALREADY_TAKEN" });
  });

  it("查無此單回 NOT_FOUND", async () => {
    PublicMarketModel.lockById.mockResolvedValue(undefined);

    const res = await Service.fulfill(55, SELLER);

    expect(res).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("持有檢查全程 locking read：收購方與履約者各鎖一次", async () => {
    const mysql = require("../../util/mysql");
    PublicMarketModel.lockById.mockResolvedValue(buyOrder());
    stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: true } });

    await Service.fulfill(55, SELLER);

    // fulfill 不讀餘額（買家已預扣），所以這一次就是收購方的持有檢查
    expect(mysql.forUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("star 欄位輸出", () => {
  const baseRow = {
    id: 7,
    itemId: 101,
    orderType: "sell",
    sellerId: SELLER,
    buyerId: null,
    price: 1000,
    fee: 50,
    status: "open",
    name: "佩可莉ーヌ",
  };

  it("掛單簿列表帶出 star，且沒被 delete 剪掉", async () => {
    PublicMarketModel.getOpenListingsByItemId.mockResolvedValue([{ ...baseRow, star: "3" }]);

    const [listing] = await Service.getListingsByItemId(101, BUYER);

    expect(listing.star).toBe(3);
    expect(typeof listing.star).toBe("number");
  });

  it("單張掛單詳情帶出 star", async () => {
    PublicMarketModel.getById.mockResolvedValue({ ...baseRow, star: "2" });
    stubInventoryReads({ balance: 5000 });

    const detail = await Service.getListingDetail(7, BUYER);

    expect(detail.star).toBe(2);
  });

  it("我的掛單 open / closed 兩個陣列都有 star", async () => {
    PublicMarketModel.getOpenListingsByRequester.mockResolvedValue([{ ...baseRow, star: "1" }]);
    PublicMarketModel.getClosedListingsByUser.mockResolvedValue([
      { ...baseRow, id: 8, status: "sold", buyerId: BUYER, star: "3" },
    ]);

    const { open, closed } = await Service.getMyListings(SELLER);

    expect(open[0].star).toBe(1);
    expect(closed[0].star).toBe(3);
  });

  it("角色清單（GROUP BY 查詢）也帶出 star", async () => {
    PublicMarketModel.getOpenCharacters.mockResolvedValue([
      { itemId: 770, name: "可可蘿", star: "3", headImage: null, listingCount: 2, bestPrice: 500 },
    ]);

    const [character] = await Service.getOpenCharacters();

    expect(character).toMatchObject({ itemId: 770, star: 3, listingCount: 2, bestPrice: 500 });
  });

  it.each([
    [undefined, 1],
    [null, 1],
    ["", 1],
    ["0", 1],
    [0, 1],
    ["abc", 1],
    ["2", 2],
    [3, 3],
  ])("Star=%p 時 star 輸出 %i（baseStarOf 既有 fallback 契約）", async (rawStar, expected) => {
    PublicMarketModel.getOpenListingsByItemId.mockResolvedValue([{ ...baseRow, star: rawStar }]);

    const [listing] = await Service.getListingsByItemId(101, BUYER);

    expect(listing.star).toBe(expected);
  });
});

describe("掛單簿形狀與方向", () => {
  const sellRow = {
    id: 7,
    itemId: 101,
    orderType: "sell",
    sellerId: SELLER,
    buyerId: null,
    price: 1000,
    fee: 50,
    status: "open",
    name: "佩可莉ーヌ",
    star: "3",
  };

  const buyRow = { ...sellRow, id: 9, orderType: "buy", sellerId: null, buyerId: BUYER };

  it("缺省方向查賣單簿", async () => {
    PublicMarketModel.getOpenListingsByItemId.mockResolvedValue([sellRow]);

    await Service.getListingsByItemId(101, BUYER);

    expect(PublicMarketModel.getOpenListingsByItemId).toHaveBeenCalledWith(101, "sell");
  });

  it("orderType=buy 查收購簿，並把還沒有意義的賣方欄位剪掉", async () => {
    PublicMarketModel.getOpenListingsByItemId.mockResolvedValue([buyRow]);

    const [listing] = await Service.getListingsByItemId(101, SELLER, "buy");

    expect(PublicMarketModel.getOpenListingsByItemId).toHaveBeenCalledWith(101, "buy");
    expect(listing).toMatchObject({ orderType: "buy", buyerId: BUYER, netProceeds: 950 });
    expect(listing).not.toHaveProperty("sellerId");
    expect(listing).not.toHaveProperty("sellerName");
    expect(listing).not.toHaveProperty("status");
  });

  it("賣單簿剪掉買方欄位", async () => {
    PublicMarketModel.getOpenListingsByItemId.mockResolvedValue([sellRow]);

    const [listing] = await Service.getListingsByItemId(101, BUYER);

    expect(listing).toMatchObject({ orderType: "sell", sellerId: SELLER });
    expect(listing).not.toHaveProperty("buyerId");
  });

  it("mine 依方向認發布者：收購單看 buyerId", async () => {
    PublicMarketModel.getOpenListingsByItemId.mockResolvedValue([buyRow]);

    const [asRequester] = await Service.getListingsByItemId(101, BUYER, "buy");
    const [asOther] = await Service.getListingsByItemId(101, SELLER, "buy");

    expect(asRequester.mine).toBe(true);
    expect(asOther.mine).toBe(false);
  });

  it("角色清單依方向查，bestPrice 語意由 model 決定", async () => {
    PublicMarketModel.getOpenCharacters.mockResolvedValue([
      { itemId: 770, name: "可可蘿", star: "3", headImage: null, listingCount: 2, bestPrice: 9000 },
    ]);

    const [character] = await Service.getOpenCharacters("buy");

    expect(PublicMarketModel.getOpenCharacters).toHaveBeenCalledWith("buy");
    expect(character).toMatchObject({ orderType: "buy", bestPrice: 9000 });
  });

  it("角色清單缺省查賣單簿", async () => {
    PublicMarketModel.getOpenCharacters.mockResolvedValue([]);

    await Service.getOpenCharacters();

    expect(PublicMarketModel.getOpenCharacters).toHaveBeenCalledWith("sell");
  });
});

describe("詳情 viewer 形狀", () => {
  const buyRow = {
    id: 9,
    itemId: 101,
    orderType: "buy",
    sellerId: null,
    buyerId: BUYER,
    price: 1000,
    fee: 50,
    status: "open",
    name: "佩可莉ーヌ",
    star: "3",
  };

  it("收購單 + 我持有角色：canFulfill=true、canBuy=false", async () => {
    PublicMarketModel.getById.mockResolvedValue(buyRow);
    stubInventoryReads({ balance: 0, buyerOwns: true });

    const detail = await Service.getListingDetail(9, SELLER);

    expect(detail).toMatchObject({ orderType: "buy", buyerId: BUYER, buyerName: `Name-${BUYER}` });
    expect(detail.viewer).toMatchObject({
      ownsCharacter: true,
      isSeller: false,
      isBuyer: false,
      isRequester: false,
      canFulfill: true,
      canBuy: false,
      blockReason: null,
    });
  });

  it("收購單 + 我沒有角色：blockReason=NOT_OWNED、canFulfill=false", async () => {
    PublicMarketModel.getById.mockResolvedValue(buyRow);
    stubInventoryReads({ balance: 0, buyerOwns: false });

    const detail = await Service.getListingDetail(9, SELLER);

    expect(detail.viewer).toMatchObject({ canFulfill: false, blockReason: "NOT_OWNED" });
  });

  it("收購單 + 我就是發單者：isRequester / isBuyer 皆為 true，blockReason=IS_BUYER", async () => {
    PublicMarketModel.getById.mockResolvedValue(buyRow);
    stubInventoryReads({ balance: 0, buyerOwns: false });

    const detail = await Service.getListingDetail(9, BUYER);

    expect(detail.viewer).toMatchObject({
      isRequester: true,
      isBuyer: true,
      canFulfill: false,
      blockReason: "IS_BUYER",
    });
  });

  it("已取消的收購單帶 refundedAmount = price，前端才寫得出實際退款金額", async () => {
    PublicMarketModel.getById.mockResolvedValue({
      ...buyRow,
      status: "cancelled",
      closedAt: "2026-08-10T00:00:00Z",
    });
    stubInventoryReads({ balance: 0 });

    const detail = await Service.getListingDetail(9, BUYER);

    expect(detail.refundedAmount).toBe(1000);
  });

  it("已成交的收購單沒有 refundedAmount（錢撥給履約者了，不是退款）", async () => {
    PublicMarketModel.getById.mockResolvedValue({ ...buyRow, status: "sold", sellerId: SELLER });
    stubInventoryReads({ balance: 0 });

    const detail = await Service.getListingDetail(9, BUYER);

    expect(detail).not.toHaveProperty("refundedAmount");
  });

  it("賣單保留原本的 canBuy / IS_SELLER 語意", async () => {
    PublicMarketModel.getById.mockResolvedValue({
      ...buyRow,
      orderType: "sell",
      sellerId: SELLER,
      buyerId: null,
    });
    stubInventoryReads({ balance: 5000, buyerOwns: false });

    const detail = await Service.getListingDetail(9, SELLER);

    expect(detail.viewer).toMatchObject({
      isSeller: true,
      canBuy: false,
      canFulfill: false,
      blockReason: "IS_SELLER",
    });
  });
});

describe("我的掛單（兩種方向合併）", () => {
  it("open 同時含賣單與收購單，各自剪掉沒意義的對手方欄位", async () => {
    PublicMarketModel.getOpenListingsByRequester.mockResolvedValue([
      {
        id: 1,
        itemId: 101,
        orderType: "sell",
        sellerId: SELLER,
        buyerId: null,
        price: 1000,
        fee: 50,
        status: "open",
        star: "3",
      },
      {
        id: 2,
        itemId: 102,
        orderType: "buy",
        sellerId: null,
        buyerId: SELLER,
        price: 2000,
        fee: 100,
        status: "open",
        star: "3",
      },
    ]);
    PublicMarketModel.getClosedListingsByUser.mockResolvedValue([]);

    const { open } = await Service.getMyListings(SELLER);

    expect(open[0]).toMatchObject({ orderType: "sell", sellerId: SELLER, mine: true });
    expect(open[0]).not.toHaveProperty("buyerId");
    expect(open[1]).toMatchObject({ orderType: "buy", buyerId: SELLER, mine: true });
    expect(open[1]).not.toHaveProperty("sellerId");
  });

  it("closed 收購單取消時帶 refundedAmount，成交時 role 依角色流向判定", async () => {
    PublicMarketModel.getOpenListingsByRequester.mockResolvedValue([]);
    PublicMarketModel.getClosedListingsByUser.mockResolvedValue([
      {
        id: 3,
        itemId: 101,
        orderType: "buy",
        sellerId: null,
        buyerId: BUYER,
        price: 3000,
        fee: 150,
        status: "cancelled",
        star: "3",
      },
      {
        id: 4,
        itemId: 102,
        orderType: "buy",
        sellerId: SELLER,
        buyerId: BUYER,
        price: 4000,
        fee: 200,
        status: "sold",
        star: "3",
      },
    ]);

    const { closed } = await Service.getMyListings(BUYER);

    expect(closed[0]).toMatchObject({ status: "cancelled", refundedAmount: 3000, role: "buyer" });
    // 成交：角色流向 BUYER，所以他是 buyer，對手方是履約的 SELLER
    expect(closed[1]).toMatchObject({
      status: "sold",
      role: "buyer",
      counterpartyId: SELLER,
    });
    expect(closed[1]).not.toHaveProperty("refundedAmount");
  });

  it("履約者視角：同一張收購單的 role 是 seller", async () => {
    PublicMarketModel.getOpenListingsByRequester.mockResolvedValue([]);
    PublicMarketModel.getClosedListingsByUser.mockResolvedValue([
      {
        id: 4,
        itemId: 102,
        orderType: "buy",
        sellerId: SELLER,
        buyerId: BUYER,
        price: 4000,
        fee: 200,
        status: "sold",
        star: "3",
      },
    ]);

    const { closed } = await Service.getMyListings(SELLER);

    expect(closed[0]).toMatchObject({ role: "seller", counterpartyId: BUYER, netProceeds: 3800 });
  });
});

describe("總覽數字", () => {
  it("myOpenCount 用合計計數（賣單 + 收購單共用上限）", async () => {
    PublicMarketModel.countOpenByRequester.mockResolvedValue(7);
    PublicMarketModel.countOpen.mockResolvedValue(128);
    stubInventoryReads({ balance: 5000 });

    const summary = await Service.getSummary(SELLER);

    expect(PublicMarketModel.countOpenByRequester).toHaveBeenCalledWith(SELLER);
    expect(summary).toMatchObject({ myOpenCount: 7, maxOpen: 10, totalOpenCount: 128 });
  });
});

describe("trade_complete 成就結算", () => {
  function openListing(overrides = {}) {
    return {
      id: 42,
      order_type: "sell",
      seller_id: SELLER,
      buyer_id: null,
      item_id: 101,
      price: 1000,
      fee: 50,
      status: "open",
      ...overrides,
    };
  }

  it("成交後買賣雙方各結算一次，事件型別為 trade_complete", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 10000 });

    await Service.purchase(42, BUYER);

    expect(AchievementEngine.evaluate).toHaveBeenCalledTimes(2);
    expect(AchievementEngine.evaluate).toHaveBeenCalledWith(BUYER, "trade_complete", {});
    expect(AchievementEngine.evaluate).toHaveBeenCalledWith(SELLER, "trade_complete", {});
  });

  it("結算發生在 commit 之後：呼叫時 markSold 已經完成", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 10000 });

    const callOrder = [];
    PublicMarketModel.markSold.mockImplementation(async () => {
      callOrder.push("markSold");
      return 1;
    });
    AchievementEngine.evaluate.mockImplementation(async () => {
      callOrder.push("evaluate");
      return { unlocked: [] };
    });

    await Service.purchase(42, BUYER);

    expect(callOrder[0]).toBe("markSold");
    expect(callOrder.slice(1)).toEqual(["evaluate", "evaluate"]);
  });

  it("ALREADY_TAKEN 不結算成就", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing({ status: "sold" }));
    stubInventoryReads({ balance: 10000 });

    const res = await Service.purchase(42, BUYER);

    expect(res.code).toBe("ALREADY_TAKEN");
    expect(AchievementEngine.evaluate).not.toHaveBeenCalled();
  });

  it("INSUFFICIENT_FUNDS 不結算成就", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 10 });

    const res = await Service.purchase(42, BUYER);

    expect(res.code).toBe("INSUFFICIENT_FUNDS");
    expect(AchievementEngine.evaluate).not.toHaveBeenCalled();
  });

  it("SELLER_LOST_ITEM 雖然改了掛單狀態，仍不算一次交易成就", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    InventoryModel.deleteUserItem.mockResolvedValue(0);
    stubInventoryReads({ balance: 10000 });

    const res = await Service.purchase(42, BUYER);

    expect(res.code).toBe("SELLER_LOST_ITEM");
    expect(PublicMarketModel.markClosed).toHaveBeenCalledWith(42, "invalid", expect.anything());
    expect(AchievementEngine.evaluate).not.toHaveBeenCalled();
  });

  it.each(["ALREADY_OWNED", "IS_SELLER"])("%s 不結算成就", async code => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 10000, buyerOwns: code === "ALREADY_OWNED" });

    const res = await Service.purchase(42, code === "IS_SELLER" ? SELLER : BUYER);

    expect(res.code).toBe(code);
    expect(AchievementEngine.evaluate).not.toHaveBeenCalled();
  });

  it("成就爆炸不會弄壞已成交的交易（.catch 真的吞得住）", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 10000 });
    AchievementEngine.evaluate.mockRejectedValue(new Error("achievement exploded"));

    const res = await Service.purchase(42, BUYER);

    expect(res).toMatchObject({ ok: true, listingId: 42, price: 1000 });
  });

  it("sellerId 有進 service 結果，成就才找得到賣家", async () => {
    PublicMarketModel.lockById.mockResolvedValue(openListing());
    stubInventoryReads({ balance: 10000 });

    const res = await Service.purchase(42, BUYER);

    expect(res.sellerId).toBe(SELLER);
  });

  describe("收購單履約", () => {
    function buyOrder(overrides = {}) {
      return {
        id: 55,
        order_type: "buy",
        seller_id: null,
        buyer_id: BUYER,
        item_id: 101,
        price: 1000,
        fee: 50,
        status: "open",
        ...overrides,
      };
    }

    it("履約成功後雙方各結算一次", async () => {
      PublicMarketModel.lockById.mockResolvedValue(buyOrder());
      stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: true } });

      await Service.fulfill(55, SELLER);

      expect(AchievementEngine.evaluate).toHaveBeenCalledTimes(2);
      expect(AchievementEngine.evaluate).toHaveBeenCalledWith(SELLER, "trade_complete", {});
      expect(AchievementEngine.evaluate).toHaveBeenCalledWith(BUYER, "trade_complete", {});
    });

    it("結算在 commit 之後：markFulfilled 先跑完", async () => {
      PublicMarketModel.lockById.mockResolvedValue(buyOrder());
      stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: true } });

      const callOrder = [];
      PublicMarketModel.markFulfilled.mockImplementation(async () => {
        callOrder.push("markFulfilled");
        return 1;
      });
      AchievementEngine.evaluate.mockImplementation(async () => {
        callOrder.push("evaluate");
        return { unlocked: [] };
      });

      await Service.fulfill(55, SELLER);

      expect(callOrder).toEqual(["markFulfilled", "evaluate", "evaluate"]);
    });

    it("成就爆炸不會回滾已完成的履約", async () => {
      PublicMarketModel.lockById.mockResolvedValue(buyOrder());
      stubInventoryReads({ balance: 0, owns: { [BUYER]: false, [SELLER]: true } });
      AchievementEngine.evaluate.mockRejectedValue(new Error("achievement exploded"));

      const res = await Service.fulfill(55, SELLER);

      expect(res).toMatchObject({ ok: true, listingId: 55, netProceeds: 950 });
    });

    it.each(["NOT_OWNED", "ALREADY_OWNED_REQUESTER", "IS_BUYER"])("%s 不結算成就", async code => {
      PublicMarketModel.lockById.mockResolvedValue(buyOrder());
      stubInventoryReads({
        balance: 0,
        owns: {
          [BUYER]: code === "ALREADY_OWNED_REQUESTER",
          [SELLER]: code !== "NOT_OWNED",
        },
      });
      if (code === "NOT_OWNED") InventoryModel.deleteUserItem.mockResolvedValue(0);

      const res = await Service.fulfill(55, code === "IS_BUYER" ? BUYER : SELLER);

      expect(res.code).toBe(code);
      expect(AchievementEngine.evaluate).not.toHaveBeenCalled();
    });

    it("取消收購單不算一次交易成就", async () => {
      PublicMarketModel.lockById.mockResolvedValue(buyOrder());

      await Service.cancelListing(55, BUYER);

      expect(AchievementEngine.evaluate).not.toHaveBeenCalled();
    });
  });
});
