const sqlite = require("../../../util/sqlite");
const sql = require("sql-query-generator");
const memory = require("memory-cache");

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

/**
 * 當日轉蛋紀錄
 * @param {String} userId
 * @returns {object|undefined}
 */
exports.getSignin = userId => {
  var memoryKey = `GachaSignin_${userId}`;
  var isSignin = memory.get(memoryKey);

  if (isSignin !== null) return Promise.resolve(isSignin);

  var query = sql.select("GachaSignin", "No").where({ userId, signinDate: getTodayDate() });
  return sqlite.get(query.text, query.values).then(res => {
    memory.put(memoryKey, res, 10 * 60 * 1000);
    return res;
  });
};

/**
 * 轉蛋紀錄
 * @param {String} userId
 */
exports.touchSingin = userId => {
  var memoryKey = `GachaSignin_${userId}`;
  memory.put(memoryKey, 1, 10 * 60 * 1000);
  var query = sql.insert("GachaSignin", { userId, signinDate: getTodayDate() });
  return sqlite.run(query.text, query.values);
};

/**
 * 獲取所有公主角色
 * @return {Promise<Array>}
 */
exports.getPrincessCharacter = () => {
  var query = sql.select("GachaPool", "ID").where({ Is_Princess: 1 });
  return sqlite.all(query.text, query.values);
};

exports.getPrincessCharacterCount = () => {
  var memoryKey = "PrincessCharacterCount";
  var count = memory.get(memoryKey);
  if (count !== null) return Promise.resolve(count);

  return this.getPrincessCharacter().then(datas => {
    memory.put(memoryKey, datas.length);
    return datas.length;
  });
};

/**
 * 取得用戶收集到的角色數
 * @param {String} userId
 */
exports.getUserCollectedCharacterCount = userId => {
  var query = sql
    .select("Inventory", "DISTINCT COUNT(*) AS count")
    .join("GachaPool", {
      "Inventory.itemId": "GachaPool.id",
    })
    .where({
      userId: userId,
    });
  return sqlite.get(query.text, query.values).then(res => res.count);
};

exports.getUserGodStoneCount = userId => {
  var query = sql
    .select("Inventory", "SUM(itemAmount) as total")
    .where({ itemId: "999", userId: userId });

  return sqlite.get(query.text, query.values).then(res => res.total || 0);
};

function getTodayDate() {
  let date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("/");
}
