const mysql = require("../../util/mysql");
const base = require("../base");

exports.tableName = "Inventory";

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
        { name: "GachaPool.Name" },
        { headImage: "HeadImage_Url" },
      ])
      .where({ userId })
      .join("GachaPool", "GachaPool.ID", "itemId")
      .groupBy("itemId");
  }

  getAllUserOwnCharacters(userId) {
    return this.knex
      .select(["itemId", { name: "GachaPool.Name" }, { headImage: "HeadImage_Url" }, "attributes"])
      .where({ userId })
      .join("GachaPool", "GachaPool.ID", "itemId")
      .whereNot({ itemId: 999 });
  }

  editAttributesByItemId(userId, itemId, attributes) {
    return this.knex.where({ userId, itemId }).update({ attributes: JSON.stringify(attributes) });
  }

  getUserOwnCountByItemId(userId, itemId) {
    return this.knex.sum({ amount: "itemAmount" }).where({ userId, itemId }).first();
  }

  getUserMoney(userId) {
    return this.getUserOwnCountByItemId(userId, 999);
  }

  deleteUserItem(userId, itemId) {
    return this.knex.where({ userId, itemId }).del();
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
  async transferGodStone({ sourceId, targetId, amount }) {
    return this.knex.insert([
      { userId: sourceId, itemId: 999, itemAmount: `${-amount}`, note: "atm" },
      { userId: targetId, itemId: 999, itemAmount: amount, note: "atm" },
    ]);
  }

  async increaseGodStone({ userId, amount, note }) {
    return this.knex.insert([{ userId, itemId: 999, itemAmount: amount, note }]);
  }

  async decreaseGodStone({ userId, amount, note }) {
    return this.knex.insert([{ userId, itemId: 999, itemAmount: `${-amount}`, note }]);
  }
}

exports.inventory = new Inventory({
  table: "Inventory",
  fillable: ["userId", "itemId", "itemAmount", "note"],
});
