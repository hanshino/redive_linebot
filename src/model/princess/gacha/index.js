const sqlite = require("../../../util/sqlite");
const sql = require("sql-query-generator");

exports.getDatabasePool = () => {
  var query = sql.select("GachaPool", [
    "ID as id",
    "Name as name",
    "headImage_Url as imageUrl",
    "star as star",
    "rate as rate",
    "is_Princess as isPrincess",
    "tag as tag",
  ]);
  return sqlite.all(query.text, query.values);
};

/**
 * 新增角色
 * @param {Object} objData
 * @param {String} objData.name
 * @param {String} objData.headImage_url
 * @param {String} objData.star
 * @param {String} objData.rate
 * @param {String} objData.is_princess
 * @param {String} objData.tag
 * @returns {Promise}
 */
exports.insertNewData = objData => {
  var query = sql.insert("GachaPool", { ...objData, modify_ts: new Date().getTime() });
  return sqlite.run(query.text, query.values);
};

/**
 * 修改角色資料
 * @param {String} id
 * @param {Object} objData
 * @param {String} objData.name
 * @param {String} objData.headImage_url
 * @param {String} objData.star
 * @param {String} objData.rate
 * @param {String} objData.is_princess
 * @param {String} objData.tag
 * @returns {Promise}
 */
exports.updateData = (id, objData) => {
  var query = sql.update("GachaPool", objData).where({ ID: id });
  return sqlite.run(query.text, query.values);
};

/**
 * 刪除角色資料
 * @param {String} id
 * @returns {Promise}
 */
exports.deleteData = id => {
  var query = sql.deletes("GachaPool").where({ ID: id });
  return sqlite.run(query.text, query.values);
};
