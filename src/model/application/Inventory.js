const sqlite = require("../../util/sqlite");
const sql = require("sql-query-generator");

exports.tableName = "Inventory";

/**
 * 新增一筆物品紀錄
 * @param {String} userId
 * @param {String} itemId
 * @param {Number} itemAmount
 */
exports.insertItem = (userId, itemId, itemAmount) => {
  var query = sql.insert(this.tableName, {
    userId,
    itemId,
    itemAmount,
    createTS: new Date().getTime(),
  });
  return sqlite.run(query.text, query.values);
};

/**
 * 獲取單一用戶的物品資料
 * @param {String} userId
 */
exports.fetchUserItem = userId => {
  var query = sql.select(this.tableName, "*").where({ userId });
  return sqlite.all(query.text, query.values);
};

exports.fetchUserOwnItems = (userId, itemIds) => {
  var query = `SELECT * FROM ${this.tableName}`;
  query += " WHERE userId = $1 AND itemId in (";
  query += itemIds.join(",");
  query += ")";

  return sqlite.all(query, [userId]);
};
