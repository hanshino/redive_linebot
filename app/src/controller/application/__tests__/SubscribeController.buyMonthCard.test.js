// buyMonthCard 改走共用 SubscribeCardCouponService.issue 後行為不變的回歸：
// 扣款與發卡仍在同一交易，任一步失敗需完整回滾（女神石不能被扣走卻沒拿到序號）。
// 另含購卡競態修正的決策分支：交易內先鎖 user 列 → 同交易讀餘額 → 判斷 → issue → debit；
// 查無 user 列 fail closed。真實鎖/併發行為見 SubscribeController.redeem.test.js（真 DB）。
//
// 全域 setup.js 把 bottender/router 的 text() mock 成回傳 `jest.fn()`（丟棄真正的
// handler），這支測試需要拿到真正的 buyMonthCard 函式本體，所以對這個模組
// unmock，改用真正的 text()（只是把 route 陣列的第二個參數存起來，不做任何比對邏輯）。
jest.unmock("bottender/router");
jest.mock("../../../model/application/Inventory", () => ({
  inventory: {
    qb: jest.fn(),
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

// 交易內餘額讀取走 inventoryModel.qb(trx).sum().where().first()；這裡回一條只認這個鏈的假 builder。
// amount 以字串回傳，模擬 mysql2 對 SUM(int) 的 DECIMAL 回傳型態。
const balanceQuery = jest.fn();
function setBalance(amount) {
  balanceQuery.mockResolvedValue({ amount });
}
function balanceChain() {
  const chain = {
    sum: jest.fn(() => chain),
    where: jest.fn(() => chain),
    first: balanceQuery,
  };
  return chain;
}

const userLock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  InventoryModel.qb.mockImplementation(balanceChain);
  setBalance(String(300 * 10000));
  InventoryModel.decreaseGodStone.mockResolvedValue([1]);
  SubscribeCardCouponService.issue.mockResolvedValue([{ serial_number: "s1" }]);
  mysql.transaction.mockImplementation(cb => cb(mysql));
  // 全域 mock 的 chainMethods 清單沒有 forUpdate；user 列鎖是 trx("user").where().forUpdate().first("id")。
  mysql.forUpdate = jest.fn().mockReturnValue(mysql);
  userLock.mockResolvedValue({ id: 1 });
  mysql.first.mockImplementation(userLock);
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

  it("女神石不足時：不呼叫 issue、不扣款，回 not_enough_money", async () => {
    setBalance("0");
    const c = ctx();

    await callBuyMonthCard(c, "1");

    expect(SubscribeCardCouponService.issue).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
    expect(c.replyText).toHaveBeenCalledWith("message.subscribe.not_enough_money");
  });

  it("剛好 50 萬：整數比較 >= 通過；49 萬 9999：拒絕", async () => {
    setBalance("500000");
    await callBuyMonthCard(ctx(), "1");
    expect(SubscribeCardCouponService.issue).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    setBalance("499999");
    const c = ctx();
    await callBuyMonthCard(c, "1");
    expect(SubscribeCardCouponService.issue).not.toHaveBeenCalled();
    expect(c.replyText).toHaveBeenCalledWith("message.subscribe.not_enough_money");
  });

  it("SUM 空集合回 null：視為 0，拒絕且不扣款（不得 NaN 放行）", async () => {
    setBalance(null);
    const c = ctx();

    await callBuyMonthCard(c, "1");

    expect(SubscribeCardCouponService.issue).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
    expect(c.replyText).toHaveBeenCalledWith("message.subscribe.not_enough_money");
  });

  it("餘額不是可解析整數：fail closed 拒絕，不放行", async () => {
    setBalance("not-a-number");
    const c = ctx();

    await callBuyMonthCard(c, "1");

    expect(SubscribeCardCouponService.issue).not.toHaveBeenCalled();
    expect(c.replyText).toHaveBeenCalledWith("message.subscribe.not_enough_money");
  });

  it("查無 user 列（鎖不到玩家）：fail closed，不讀餘額、不 issue、不扣款，回 error_contact_admin", async () => {
    userLock.mockResolvedValue(undefined);
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const c = ctx();

    await callBuyMonthCard(c, "1");

    expect(InventoryModel.qb).not.toHaveBeenCalled();
    expect(SubscribeCardCouponService.issue).not.toHaveBeenCalled();
    expect(InventoryModel.decreaseGodStone).not.toHaveBeenCalled();
    expect(c.replyText).toHaveBeenCalledWith(
      expect.stringContaining("message.error_contact_admin")
    );
    expect(c.replyText).not.toHaveBeenCalledWith("message.subscribe.not_enough_money");
    expect(spy.mock.calls.map(a => a.join(" ")).join("\n")).toContain("USER_NOT_FOUND");
    spy.mockRestore();
  });

  it("順序：交易內先 user 列 FOR UPDATE → 同交易讀餘額 → issue → debit；餘額讀取與 debit 都帶 trx", async () => {
    await callBuyMonthCard(ctx(), "1");

    const order = [
      mysql.forUpdate.mock.invocationCallOrder[0],
      InventoryModel.qb.mock.invocationCallOrder[0],
      SubscribeCardCouponService.issue.mock.invocationCallOrder[0],
      InventoryModel.decreaseGodStone.mock.invocationCallOrder[0],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(mysql.transaction).toHaveBeenCalledTimes(1);
    // 全域 mock 的 transaction 把 mysql 本身當 trx 傳入；餘額讀取與扣款都必須拿到同一個 trx。
    expect(InventoryModel.qb).toHaveBeenCalledWith(mysql);
    expect(InventoryModel.decreaseGodStone).toHaveBeenCalledWith(
      expect.objectContaining({ trx: mysql })
    );
    expect(SubscribeCardCouponService.issue).toHaveBeenCalledWith(expect.anything(), mysql);
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
