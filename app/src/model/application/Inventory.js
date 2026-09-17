const mysql = require("../../util/mysql");
const base = require("../base");

exports.tableName = "inventory";

exports.query = () => mysql(this.tableName);

/**
 * 新增一筆物品紀錄
 * @param {String} userId
 * @param {Number} itemId
 * @param {Number} itemAmount
 */
exports.insertItem = (userId, itemId, itemAmount) => {
  return this.insertItems([{ userId, itemId, itemAmount }]);
};

exports.deleteItem = (userId, itemId) => {
  return mysql(this.tableName).where("userId", userId).where("itemId", itemId).del();
};

/**
 * 一次新增多筆物品
 * @param {Array.<{userId: string, itemId: number, itemAmount: number}>} params
 */
exports.insertItems = params => {
  return mysql.into(this.tableName).insert(params);
};

/**
 * 獲取單一用戶的物品資料
 * @param {String} userId
 */
exports.fetchUserItem = userId => {
  return mysql
    .select(["itemId", { amount: mysql.raw("SUM(itemAmount)") }])
    .from(this.tableName)
    .where({ userId })
    .groupBy("itemId")
    .orderBy("itemId");
};

/**
 * 驗證用戶是否擁有傳入的item資料
 * @param {String} userId
 * @param {Array} itemIds
 */
exports.fetchUserOwnItems = (userId, itemIds) => {
  return mysql.select("*").from(this.tableName).whereIn("itemId", itemIds).where({ userId });
};

class Inventory extends base {
  getAllUserOwn(userId) {
    return this.knex
      .select([
        "itemId",
        { amount: this.connection.raw("SUM(itemAmount)") },
        { name: "gacha_pool.Name" },
        { headImage: "HeadImage_Url" },
      ])
      .where({ userId })
      .join("gacha_pool", "gacha_pool.ID", "itemId")
      .groupBy("itemId");
  }

  getAllUserOwnCharacters(userId) {
    return this.knex
      .select(["itemId", { name: "gacha_pool.Name" }, { headImage: "HeadImage_Url" }, "attributes"])
      .where({ userId })
      .join("gacha_pool", "gacha_pool.ID", "itemId")
      .whereNot({ itemId: 999 });
  }

  editAttributesByItemId(userId, itemId, attributes, trx) {
    return this.qb(trx)
      .where({ userId, itemId })
      .update({ attributes: JSON.stringify(attributes) });
  }

  /**
   * SUM(itemAmount) 在該 userId+itemId 完全沒有任何 inventory 列時，MySQL 回傳一列
   * `{ amount: null }`（聚合函式對空集合的定義行為），不是「查無此列」。過去呼叫端
   * `const { amount = 0 } = await getUserMoney(...)` 的解構預設值只對 `undefined`
   * 生效，對 `null` 無效，導致 `parseInt(null)` = `NaN`，餘額檢查 `NaN < cost` 恆為
   * false，跳過餘額檢查（production bug：從未持有女神石的玩家可以扣成負數）。
   *
   * 這裡只把 `amount === null` 正規化成 `0`；其餘數值（含 DECIMAL 以字串型式回傳、
   * 負數）原樣保留，不經 `Number()`/`parseInt()`，避免大數精度流失或把非法值吞成 0。
   * `row` 本身在聚合查詢下不會是 `undefined`（SELECT SUM(...) 恆回一列），若真的拿到
   * falsy row 一律原樣回傳，不替「查無此列」發明新的回傳形狀。
   * @param {String} userId
   * @param {Number} itemId
   * @returns {Promise<{amount: (Number|String)}>}
   */
  getUserOwnCountByItemId(userId, itemId) {
    return this.knex
      .sum({ amount: "itemAmount" })
      .where({ userId, itemId })
      .first()
      .then(row => (row && row.amount === null ? { ...row, amount: 0 } : row));
  }

  getUserMoney(userId) {
    return this.getUserOwnCountByItemId(userId, 999);
  }

  /**
   * 交易內鎖讀女神石餘額（KTD3 wallet authority）。`SELECT SUM ... FOR UPDATE` 鎖住該 user 所有
   * itemId=999 的列與索引區間，commit 前其他交易對同一 user 的女神石 INSERT 會等待，
   * 所以「讀到的餘額 → 同 trx 內扣款」之間不會被別的扣款插隊。`getUserMoney` 走全域連線、
   * 不在交易內，不能當作扣款前的權威餘額。無任何列時回 0。
   * @param {String} userId
   * @param {import("knex").Knex.Transaction} trx
   * @returns {Promise<Number>}
   */
  async lockGodStoneBalance(userId, trx) {
    const row = await this.qb(trx)
      .sum({ amount: "itemAmount" })
      .where({ userId, itemId: 999 })
      .forUpdate()
      .first();
    return row && row.amount !== null && row.amount !== undefined ? Number(row.amount) : 0;
  }

  deleteUserItem(userId, itemId, trx) {
    return this.qb(trx).where({ userId, itemId }).del();
  }

  getGodStoneRank({ limit }) {
    return this.knex
      .sum({ amount: "itemAmount" })
      .select("userId")
      .where({ itemId: 999 })
      .groupBy("userId")
      .orderBy("amount", "desc")
      .limit(limit);
  }

  /**
   * 將女神石傳送給指定用戶
   * @param {Object} param0
   * @param {String} param0.sourceId
   * @param {String} param0.targetId
   * @param {Number} param0.amount
   * @returns {Promise}
   */
  async transferGodStone({ sourceId, targetId, amount, trx }) {
    return this.qb(trx).insert([
      { userId: sourceId, itemId: 999, itemAmount: `${-amount}`, note: "atm" },
      { userId: targetId, itemId: 999, itemAmount: amount, note: "atm" },
    ]);
  }

  async increaseGodStone({ userId, amount, note, trx }) {
    return this.qb(trx).insert([{ userId, itemId: 999, itemAmount: amount, note }]);
  }

  async decreaseGodStone({ userId, amount, note, trx }) {
    return this.qb(trx).insert([{ userId, itemId: 999, itemAmount: `${-amount}`, note }]);
  }
}

exports.inventory = new Inventory({
  table: "inventory",
  fillable: ["userId", "itemId", "itemAmount", "attributes", "note"],
});
