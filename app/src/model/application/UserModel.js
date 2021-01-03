const mysql = require("../../util/mysql");
const USER_TABLE = "User";

/**
 * 取得用戶資料庫編號
 * @param {String} platformId 平台ID
 */
exports.getId = async platformId => {
  let rows = await mysql.select({ id: "No" }).from(USER_TABLE).where({ platformId });

  return rows.length !== 0 ? rows[0].id : null;
};
