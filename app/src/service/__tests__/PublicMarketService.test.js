// PublicMarketService 的純邏輯與購買競態測試。
// 全域 setup（app/__tests__/setup.js）已把 util/mysql 換成 mock query builder，
// 其 `transaction(cb)` 會直接執行 cb，因此不需要實體 MySQL。
// model 層一律 mock，測的是 service 的決策而非 SQL。

jest.mock("../../model/application/PublicMarket", () => ({
  find: jest.fn(),
  getById: jest.fn(),
  lockById: jest.fn(),
  create: jest.fn(),
  countOpenBySeller: jest.fn(),
  countOpen: jest.fn(),
  findOpenBySellerAndItem: jest.fn(),
  getOpenListingsBySeller: jest.fn(),
  getClosedListingsByUser: jest.fn(),
  markSold: jest.fn(),
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
 */
function stubInventoryReads({ balance = 0, buyerOwns = false } = {}) {
  const mysql = require("../../util/mysql");
  let lastWhere = {};

  mysql.where.mockImplementation(cond => {
    if (cond && typeof cond === "object") lastWhere = cond;
    return mysql;
  });

  mysql.first.mockImplementation(async () => {
    if (lastWhere.itemId === 999) return { amount: balance };
    return { amount: buyerOwns ? 1 : 0 };
  });
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
  PublicMarketModel.markSold.mockResolvedValue(1);
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
    [99999, 5000, 94999],
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
  it.each([1, 2, 99998, 99999])("接受 %i", p => expect(Service.isValidPrice(p)).toBe(true));

  it.each([0, -1, 100000, 1.5, NaN, Infinity, "500", null, undefined])("拒絕 %p", p =>
    expect(Service.isValidPrice(p)).toBe(false)
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

describe("blockReason 判定順序", () => {
  const ctx = { status: "open", isSeller: false, owns: false, balance: 100, price: 50 };

  it("可買時為 null", () => expect(Service.resolveBlockReason(ctx)).toBeNull());

  it("非 open 一律 NOT_OPEN，優先於身分判定", () => {
    expect(
      Service.resolveBlockReason({ ...ctx, status: "sold", isSeller: true, owns: true, balance: 0 })
    ).toBe("NOT_OPEN");
  });

  it.each([
    [{ isSeller: true }, "IS_SELLER"],
    [{ owns: true }, "ALREADY_OWNED"],
    [{ balance: 10 }, "INSUFFICIENT_FUNDS"],
  ])("%p -> %s", (patch, expected) => {
    expect(Service.resolveBlockReason({ ...ctx, ...patch })).toBe(expected);
  });
});

describe("掛單上限", () => {
  it("已有 10 筆開放掛單時回 LISTING_CAP，且不寫入", async () => {
    PublicMarketModel.countOpenBySeller.mockResolvedValue(10);

    const res = await Service.createListing(SELLER, { itemId: 101, price: 1000 });

    expect(res).toMatchObject({ ok: false, code: "LISTING_CAP", maxOpen: 10 });
    expect(PublicMarketModel.create).not.toHaveBeenCalled();
  });

  it("第 10 筆（已有 9 筆）可以掛", async () => {
    PublicMarketModel.countOpenBySeller.mockResolvedValue(9);
    PublicMarketModel.findOpenBySellerAndItem.mockResolvedValue(null);
    PublicMarketModel.create.mockResolvedValue(77);
    PublicMarketModel.getById.mockResolvedValue({
      id: 77,
      itemId: 101,
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
    expect(res.listing).toMatchObject({ fee: 50, netProceeds: 950, star: 3 });
    expect(PublicMarketModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ price: 1000, fee: 50, status: "open" })
    );
  });

  it("價格不合法時連上限都不查", async () => {
    const res = await Service.createListing(SELLER, { itemId: 101, price: 0 });
    expect(res).toEqual({ ok: false, code: "INVALID_PRICE" });
    expect(PublicMarketModel.countOpenBySeller).not.toHaveBeenCalled();
  });
});

describe("購買競態", () => {
  function openListing(overrides = {}) {
    return {
      id: 42,
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
});

describe("star 欄位輸出", () => {
  const baseRow = {
    id: 7,
    itemId: 101,
    sellerId: SELLER,
    buyerId: null,
    price: 1000,
    fee: 50,
    status: "open",
    name: "佩可莉ーヌ",
  };

  it("掛單簿列表帶出 star，且沒被 delete 剪掉", async () => {
    PublicMarketModel.getOpenListingsByItemId = jest
      .fn()
      .mockResolvedValue([{ ...baseRow, star: "3" }]);

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
    PublicMarketModel.getOpenListingsBySeller.mockResolvedValue([{ ...baseRow, star: "1" }]);
    PublicMarketModel.getClosedListingsByUser.mockResolvedValue([
      { ...baseRow, id: 8, status: "sold", buyerId: BUYER, star: "3" },
    ]);

    const { open, closed } = await Service.getMyListings(SELLER);

    expect(open[0].star).toBe(1);
    expect(closed[0].star).toBe(3);
  });

  it("角色清單（GROUP BY 查詢）也帶出 star", async () => {
    PublicMarketModel.getOpenCharacters = jest
      .fn()
      .mockResolvedValue([
        { itemId: 770, name: "可可蘿", star: "3", headImage: null, listingCount: 2, minPrice: 500 },
      ]);

    const [character] = await Service.getOpenCharacters();

    expect(character).toMatchObject({ itemId: 770, star: 3, listingCount: 2, minPrice: 500 });
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
    PublicMarketModel.getOpenListingsByItemId = jest
      .fn()
      .mockResolvedValue([{ ...baseRow, star: rawStar }]);

    const [listing] = await Service.getListingsByItemId(101, BUYER);

    expect(listing.star).toBe(expected);
  });
});

describe("trade_complete 成就結算", () => {
  function openListing(overrides = {}) {
    return {
      id: 42,
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
});
