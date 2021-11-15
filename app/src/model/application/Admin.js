const mysql = require("../../util/mysql");

exports.getList = () => {
  return mysql.select().from("Admin");
};

exports.find = async userId => {
  return await mysql.from("Admin").where({ userId }).first();
};

/**
 * 驗證是否為管理員
 * @param {String} userId
 */
exports.isAdmin = userId => {
  return mysql
    .select("ID")
    .from("Admin")
    .where({ userId })
    .then(res => (res.length > 0 ? true : false));
};
