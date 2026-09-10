// buyMonthCard 改走共用 SubscribeCardCouponService.issue 後行為不變的回歸：
// 扣款與發卡仍在同一交易，任一步失敗需完整回滾（女神石不能被扣走卻沒拿到序號）。
//
// 全域 setup.js 把 bottender/router 的 text() mock 成回傳 `jest.fn()`（丟棄真正的
// handler），這支測試需要拿到真正的 buyMonthCard 函式本體，所以對這個模組
// unmock，改用真正的 text()（只是把 route 陣列的第二個參數存起來，不做任何比對邏輯）。
jest.unmock("bottender/router");
jest.mock("../../../model/application/Inventory", () => ({
  inventory: {
    getUserMoney: jest.fn(),
    decreaseGodStone: jest.fn(),
  },
}));
jest.mock("../../../service/SubscribeCardCouponService", () => ({
  issue: jest.fn(),
}));
jest.mock("../../../service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));
jest.mock("../../../service/achievementNotifier", () => ({
  notifyUnlocks: jest.fn().mockResolvedValue(undefined),
}));

const { inventory: InventoryModel } = require("../../../model/application/Inventory");
const SubscribeCardCouponService = require("../../../service/SubscribeCardCouponService");
const mysql = require("../../../util/mysql");
const SubscribeController = require("../SubscribeController");

function ctx(userId = "U" + "1".repeat(32)) {
  return {
    event: { source: { userId } },
    replyText: jest.fn().mockResolvedValue(undefined),
  };
}

function props(number = "1") {
  return { match: { groups: { number } } };
}

function callBuyMonthCard(context, number) {
  const handler = SubscribeController.privateRouter[0].action;
  return handler(context, props(number));
}

beforeEach(() => {
  jest.clearAllMocks();
  InventoryModel.getUserMoney.mockResolvedValue({ amount: 300 * 10000 });
  InventoryModel.decreaseGodStone.mockResolvedValue([1]);
  SubscribeCardCouponService.issue.mockResolvedValue([{ serial_number: "s1" }]);
  mysql.transaction.mockImplementation(cb => cb(mysql));
});

describe("SubscribeController.buyMonthCard", () => {
  it("1 張卡：cost=50萬女神石，issue 帶 count=1, cardKey=month", async () => {
    const c = ctx();
    await callBuyMonthCard(c, "1");

    expect(SubscribeCardCouponService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ cardKey: "month", count: 1, issuedBy: "system" }),
      expect.anything()
    );
    expect(InventoryModel.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ userId: c.event.source.userId, amount: 50 * 10000 })
    );
  });

  it("3 張卡：cost=135萬女神石，issue 帶 count=3", async () => {
    const c = ctx();
    await callBuyMonthCard(c, "3");

    expect(SubscribeCardCouponService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ count: 3 }),
      expect.anything()
    );
    expect(InventoryModel.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 135 * 10000 })
    );
  });

  it("5 張卡：cost=220萬女神石，issue 帶 count=5", async () => {
    const c = ctx();
    await callBuyMonthCard(c, "5");

    expect(SubscribeCardCouponService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ count: 5 }),
      expect.anything()
    );
    expect(InventoryModel.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 220 * 10000 })
    );
  });

  it("女神石不足時：不呼叫 issue、不扣款", async () => {
    InventoryModel.getUserMoney.mockResolvedValue({ amount: 0 });
    const c = ctx();

    await callBuyMonthCard(c, "1");

    expect(SubscribeCardCouponService.issue).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
  });

  it("issue 失敗時：交易整筆失敗，decreaseGodStone 不會被呼叫（同一 transaction callback 內，issue 先執行）", async () => {
    SubscribeCardCouponService.issue.mockRejectedValue(new Error("issue failed"));
    const c = ctx();

    await callBuyMonthCard(c, "1");

    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
    expect(c.replyText).toHaveBeenCalledWith(
      expect.stringContaining("message.error_contact_admin")
    );
  });

  it("decreaseGodStone 失敗時：mysql.transaction 的 callback reject，視為整筆回滾", async () => {
    InventoryModel.decreaseGodStone.mockRejectedValue(new Error("insufficient"));
    const c = ctx();

    await callBuyMonthCard(c, "1");

    expect(c.replyText).toHaveBeenCalledWith(
      expect.stringContaining("message.error_contact_admin")
    );
  });

  it("sentinel：例外 message 帶假金額/序號時，console.error 絕不能印出該原始字串", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const SENTINEL_AMOUNT = "9999999.99";
    const SENTINEL_SERIAL = "11111111-2222-3333-4444-555555555555";
    const sqlLikeError = Object.assign(
      new Error(
        `insert into subscribe_card_coupon (serial_number) values ('${SENTINEL_SERIAL}') - amount=${SENTINEL_AMOUNT}`
      ),
      {
        code: "ER_DUP_ENTRY",
        sqlMessage: `Duplicate entry '${SENTINEL_SERIAL}' amount=${SENTINEL_AMOUNT}`,
      }
    );
    SubscribeCardCouponService.issue.mockRejectedValue(sqlLikeError);
    const c = ctx();

    await callBuyMonthCard(c, "1");

    const loggedText = spy.mock.calls.map(args => args.join(" ")).join("\n");
    expect(loggedText).not.toContain(SENTINEL_AMOUNT);
    expect(loggedText).not.toContain(SENTINEL_SERIAL);
    spy.mockRestore();
  });
});
