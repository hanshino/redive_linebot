const mysql = require("../../util/mysql");

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
