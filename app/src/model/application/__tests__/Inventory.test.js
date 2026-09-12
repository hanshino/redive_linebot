// getUserOwnCountByItemId / getUserMoney 的 null 正規化 regression test。
//
// production bug：SUM(itemAmount) 在該 userId+itemId 完全沒有任何 inventory 列時，
// MySQL 回傳一列 `{ amount: null }`（聚合函式對空集合的定義行為），不是「查無此列」。
// 呼叫端慣用的 `const { amount = 0 } = await getUserMoney(...)` 解構預設值只對
// `undefined` 生效，對 `null` 無效 → `parseInt(null)` = `NaN` → `NaN < cost` 恆為
// false → 餘額檢查被跳過（真實案例：SubscribeController.buyMonthCard 讓從未持有
// 女神石的玩家扣成 -500000）。
//
// 這裡是純 unit test：mock `util/mysql` 的 query builder chain，只驗證
// getUserOwnCountByItemId/getUserMoney 對 { amount: null } 的正規化，以及對其餘數值
// （含 DECIMAL 字串、負數）原樣保留、不經 Number()/parseInt() 造成精度流失或吞掉非法值。
// 真實 DB 端到端的 redeem 競態驗證由另一支 writer 負責的
// SubscribeController.redeem.test.js（真 DB 整合測試）覆蓋，這裡不重複。

function makeBuilder(resolvedRow) {
  const builder = {
    sum: jest.fn(() => builder),
    where: jest.fn(() => builder),
    first: jest.fn(() => Promise.resolve(resolvedRow)),
  };
  return builder;
}

describe("Inventory.getUserOwnCountByItemId — null 正規化", () => {
  afterEach(() => {
    jest.resetModules();
  });

  function loadInventoryWithRow(resolvedRow) {
    let builder;
    jest.isolateModules(() => {
      jest.doMock("../../../util/mysql", () => {
        builder = makeBuilder(resolvedRow);
        return jest.fn(() => builder);
      });
      const { inventory } = require("../Inventory");
      loadInventoryWithRow.inventory = inventory;
    });
    return { inventory: loadInventoryWithRow.inventory, builder };
  }

  it("SUM 空集合回 { amount: null } 時，正規化為 { amount: 0 }（regression 本體）", async () => {
    const { inventory } = loadInventoryWithRow({ amount: null });

    const result = await inventory.getUserOwnCountByItemId("U1", 999);

    expect(result).toEqual({ amount: 0 });
  });

  it("getUserMoney 委派 getUserOwnCountByItemId(userId, 999) 並套用同一正規化", async () => {
    const { inventory, builder } = loadInventoryWithRow({ amount: null });

    const result = await inventory.getUserMoney("U1");

    expect(builder.where).toHaveBeenCalledWith({ userId: "U1", itemId: 999 });
    expect(result).toEqual({ amount: 0 });
  });

  it("非 null 的數字型別（DECIMAL 以字串回傳）原樣保留，不經 Number()/parseInt() 轉型", async () => {
    const { inventory } = loadInventoryWithRow({ amount: "1500.00" });

    const result = await inventory.getUserOwnCountByItemId("U1", 999);

    expect(result).toEqual({ amount: "1500.00" });
    expect(typeof result.amount).toBe("string");
  });

  it("負數金額原樣保留（不得被 || 0 或 Number() 吞掉/改變符號）", async () => {
    const { inventory } = loadInventoryWithRow({ amount: "-500000" });

    const result = await inventory.getUserOwnCountByItemId("U1", 999);

    expect(result).toEqual({ amount: "-500000" });
  });

  it("amount 為 0（非 null 的合法值）原樣保留為 0，不誤判成空集合", async () => {
    const { inventory } = loadInventoryWithRow({ amount: 0 });

    const result = await inventory.getUserOwnCountByItemId("U1", 999);

    expect(result).toEqual({ amount: 0 });
  });

  it("row 本身是 falsy（非 SUM 查詢的預期形狀）時原樣回傳，不猜測新的回傳 contract", async () => {
    const { inventory } = loadInventoryWithRow(undefined);

    const result = await inventory.getUserOwnCountByItemId("U1", 999);

    expect(result).toBeUndefined();
  });
});
