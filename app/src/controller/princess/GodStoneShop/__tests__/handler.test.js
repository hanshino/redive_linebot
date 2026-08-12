// GodStoneShop 兌換的信任邊界與金流測試。
// 重點三件事：
//   1. itemCount 是使用者可控輸入，只能是 1 —— 否則一份的錢拿多份。
//   2. 扣款不能吃掉並發入帳（舊寫法會刪光所有 999 列再插一列剩餘額）。
//   3. 「已持有」的權威檢查必須在交易內用 locking read 做，交易外那次只是 fast-path。

jest.mock("../../../../model/application/Inventory", () => ({
  fetchUserOwnItems: jest.fn(),
  deleteItem: jest.fn(),
  insertItems: jest.fn(),
  inventory: {
    create: jest.fn(),
    increaseGodStone: jest.fn(),
    decreaseGodStone: jest.fn(),
  },
}));

jest.mock("../../../../model/princess/GodStoneShop", () => ({
  findByItemId: jest.fn(),
  all: jest.fn(),
}));

jest.mock("../../../../model/princess/gacha", () => ({
  model: { find: jest.fn() },
  getUserGodStoneCount: jest.fn(),
}));

jest.mock("../../../../service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));

const handler = require("../handler");
const InventoryModel = require("../../../../model/application/Inventory");
const GodStoneShopModel = require("../../../../model/princess/GodStoneShop");
const GachaModel = require("../../../../model/princess/gacha");
const AchievementEngine = require("../../../../service/AchievementEngine");
const mysql = require("../../../../util/mysql");

const USER = "U" + "a".repeat(32);

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

/**
 * 交易內有兩次 locking read，順序固定：先 999（餘額）再 itemId（持有）。
 * 這裡依 where 條件分派，順便讓測試能斷言鎖序。
 */
function stubTrxReads({ balance = 0, owns = false } = {}) {
  const order = [];
  let lastWhere = {};

  mysql.where.mockImplementation(cond => {
    if (cond && typeof cond === "object") lastWhere = cond;
    return mysql;
  });

  mysql.first.mockImplementation(async () => {
    if (lastWhere.itemId === 999) {
      order.push(999);
      return { amount: balance };
    }
    order.push(lastWhere.itemId);
    return { amount: owns ? 1 : 0 };
  });

  return order;
}

beforeEach(() => {
  jest.clearAllMocks();

  mysql.where.mockReturnValue(mysql);
  mysql.sum.mockReturnValue(mysql);
  mysql.forUpdate = jest.fn().mockReturnValue(mysql);
  mysql.first.mockResolvedValue(null);

  InventoryModel.fetchUserOwnItems.mockResolvedValue([]);
  InventoryModel.inventory.create.mockResolvedValue(1);
  InventoryModel.inventory.decreaseGodStone.mockResolvedValue([1]);
  GodStoneShopModel.findByItemId.mockResolvedValue({ itemId: 101, price: 3000 });
  GachaModel.model.find.mockResolvedValue({ ID: 101, Name: "佩可莉ーヌ", Star: 3 });
  AchievementEngine.evaluate.mockResolvedValue({ unlocked: [] });
});

const req = () => ({ profile: { userId: USER }, body: { itemId: 101, itemCount: 1 } });

function expectNothingWritten() {
  expect(InventoryModel.inventory.create).not.toHaveBeenCalled();
  expect(InventoryModel.inventory.decreaseGodStone).not.toHaveBeenCalled();
  expect(InventoryModel.deleteItem).not.toHaveBeenCalled();
  expect(InventoryModel.insertItems).not.toHaveBeenCalled();
}

describe("itemCount 信任邊界", () => {
  it.each([
    [2, "多份"],
    [5, "多份"],
    [100, "多份"],
    [0, "零"],
    [-1, "負數"],
    [-100, "大量負數"],
    [1.5, "小數"],
    [1.0000001, "近似 1 的小數"],
    ["1abc", "髒字串"],
    ["", "空字串"],
    [null, "null"],
    [undefined, "缺值"],
    [true, "布林"],
    [[1], "陣列"],
    [{ valueOf: () => 1 }, "偽裝成 1 的物件"],
    [Number.NaN, "NaN"],
    [Number.POSITIVE_INFINITY, "Infinity"],
  ])("itemCount=%p（%s）回 400 且完全不寫入、不扣款", async itemCount => {
    const res = createRes();
    stubTrxReads({ balance: 999999 });

    await handler.exchangeItem(
      { profile: { userId: USER }, body: { itemId: 101, itemCount } },
      res
    );

    expect(res.statusCode).toBe(400);
    expectNothingWritten();
    // 連交易都不該開，錢不可能動
    expect(mysql.transaction).not.toHaveBeenCalled();
  });

  it.each([1, "1", " 1 "])("itemCount=%p 是唯一合法值", async itemCount => {
    stubTrxReads({ balance: 5000 });
    const res = createRes();

    await handler.exchangeItem(
      { profile: { userId: USER }, body: { itemId: 101, itemCount } },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.itemCount).toBe(1);
  });

  it("寫入的 itemAmount 用常數 1，不是使用者送來的值", async () => {
    stubTrxReads({ balance: 5000 });

    await handler.exchangeItem(
      { profile: { userId: USER }, body: { itemId: 101, itemCount: "1" } },
      createRes()
    );

    expect(InventoryModel.inventory.create).toHaveBeenCalledWith(
      expect.objectContaining({ itemAmount: 1 }),
      expect.anything()
    );
  });

  it("成就的 spend 也只算一份，不會被 itemCount 放大", async () => {
    stubTrxReads({ balance: 5000 });

    await handler.exchangeItem(
      { profile: { userId: USER }, body: { itemId: 101, itemCount: "1" } },
      createRes()
    );

    expect(AchievementEngine.evaluate).toHaveBeenCalledWith(
      USER,
      "shop_exchange",
      expect.objectContaining({ spend: 3000 })
    );
  });
});

describe("itemId 驗證", () => {
  it.each([0, -1, 1.5, "abc", null, undefined, true, [101]])(
    "itemId=%p 回 400，不查商品也不開交易",
    async itemId => {
      const res = createRes();

      await handler.exchangeItem(
        { profile: { userId: USER }, body: { itemId, itemCount: 1 } },
        res
      );

      expect(res.statusCode).toBe(400);
      expect(GodStoneShopModel.findByItemId).not.toHaveBeenCalled();
      expectNothingWritten();
    }
  );

  it("itemId=999（女神石本身）不能拿來兌換", async () => {
    const res = createRes();

    await handler.exchangeItem(
      { profile: { userId: USER }, body: { itemId: 999, itemCount: 1 } },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(GodStoneShopModel.findByItemId).not.toHaveBeenCalled();
    expectNothingWritten();
  });
});

describe("商品資料防呆", () => {
  it.each([null, undefined, "abc", -100])("price=%p 時拒絕兌換，不會反向加錢", async price => {
    GodStoneShopModel.findByItemId.mockResolvedValue({ itemId: 101, price });
    stubTrxReads({ balance: 999999 });
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.statusCode).toBe(400);
    expectNothingWritten();
  });

  it("商品不存在回 400，不動金流", async () => {
    GodStoneShopModel.findByItemId.mockResolvedValue(null);
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.statusCode).toBe(400);
    expectNothingWritten();
  });

  it("gacha_pool 查無角色時拒絕（否則 attributes 會寫入 undefined 星數）", async () => {
    GachaModel.model.find.mockResolvedValue(null);
    stubTrxReads({ balance: 999999 });
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.statusCode).toBe(400);
    expectNothingWritten();
  });
});

describe("重複持有的權威檢查", () => {
  it("交易外 fast-path 命中就直接擋，省一趟交易", async () => {
    InventoryModel.fetchUserOwnItems.mockResolvedValue([{ itemId: 101 }]);
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.statusCode).toBe(400);
    expect(GodStoneShopModel.findByItemId).not.toHaveBeenCalled();
    expect(mysql.transaction).not.toHaveBeenCalled();
  });

  it("fast-path 沒看到（並發第二筆讀到舊快照）時，交易內的 locking read 仍會擋下", async () => {
    // 這正是兩個並發兌換同角色的情境：兩邊的 fetchUserOwnItems 都回空。
    InventoryModel.fetchUserOwnItems.mockResolvedValue([]);
    stubTrxReads({ balance: 999999, owns: true });
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("api.error.gacha.shop.exchanged");
    expectNothingWritten();
  });

  it("持有檢查用 FOR UPDATE，後到的並發請求才會排隊", async () => {
    stubTrxReads({ balance: 5000, owns: false });

    await handler.exchangeItem(req(), createRes());

    // 餘額一次 + 持有一次，兩次都要鎖
    expect(mysql.forUpdate).toHaveBeenCalledTimes(2);
  });

  it("鎖序是 999（餘額）→ itemId（持有），與 PublicMarketService 一致", async () => {
    const order = stubTrxReads({ balance: 5000, owns: false });

    await handler.exchangeItem(req(), createRes());

    expect(order).toEqual([999, 101]);
  });

  it("已持有優先於餘額不足：兩者同時成立時回「已兌換過」", async () => {
    stubTrxReads({ balance: 0, owns: true });
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.body.error).toBe("api.error.gacha.shop.exchanged");
    expectNothingWritten();
  });
});

describe("女神石兌換金流", () => {
  it("扣款是 append-only：只插一列負數，不刪任何既有帳列", async () => {
    stubTrxReads({ balance: 5000 });
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ userId: USER, itemId: 101, remainGodStone: 2000 });

    expect(InventoryModel.inventory.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, amount: 3000 })
    );
    // 這兩支就是舊寫法吃掉並發退款的元兇，改完之後不該再被呼叫
    expect(InventoryModel.deleteItem).not.toHaveBeenCalled();
    expect(InventoryModel.insertItems).not.toHaveBeenCalled();
  });

  it("餘額檢查在交易內，並發兌換才會排隊", async () => {
    stubTrxReads({ balance: 5000 });

    await handler.exchangeItem(req(), createRes());

    expect(mysql.transaction).toHaveBeenCalled();
    expect(mysql.forUpdate).toHaveBeenCalled();
  });

  it("餘額不足回 400，且不寫入任何東西", async () => {
    stubTrxReads({ balance: 100 });
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("api.error.gacha.shop.notEnoughGodStone");
    expectNothingWritten();
  });

  it("餘額剛好等於售價可以兌換（邊界不能少一塊）", async () => {
    stubTrxReads({ balance: 3000 });
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.remainGodStone).toBe(0);
  });

  it("物品與扣款在同一筆交易內寫入（不會扣了錢拿不到東西）", async () => {
    stubTrxReads({ balance: 5000 });
    const order = [];
    InventoryModel.inventory.create.mockImplementation(async (_data, trx) => {
      order.push(["create", trx != null]);
      return 1;
    });
    InventoryModel.inventory.decreaseGodStone.mockImplementation(async ({ trx }) => {
      order.push(["decrease", trx != null]);
      return [1];
    });

    await handler.exchangeItem(req(), createRes());

    expect(order).toEqual([
      ["create", true],
      ["decrease", true],
    ]);
  });

  it("成就在交易之後結算，且爆炸不影響已完成的兌換", async () => {
    stubTrxReads({ balance: 5000 });
    AchievementEngine.evaluate.mockRejectedValue(new Error("boom"));
    const res = createRes();

    await handler.exchangeItem(req(), res);

    expect(res.statusCode).toBe(200);
    expect(AchievementEngine.evaluate).toHaveBeenCalled();
  });
});
