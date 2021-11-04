const mysql = require("../../util/mysql");
const TABLE = "minigame_level";
const pick = require("lodash/pick");

exports.table = TABLE;

/**
 * @typedef {Object} MinigameLevel
 * @property {Number} id
 * @property {Number} user_id
 * @property {Number} level
 * @property {Number} exp
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * 透過 Line ID 取得用戶資料
 * @param {String} userId Line user id
 * @returns {Promise<MinigameLevel>}
 */
exports.findByUserId = async userId => {
  // 先組出 從 User 表中找出 userId 的 subQuery
  const subQuery = getWhere(userId);
  const query = mysql.from(TABLE).where({ user_id: subQuery }).first();

  return await query;
};

exports.createByUserId = async (userId, attributes) => {
  attributes = pick(attributes, ["level", "exp"]);
  const query = mysql(TABLE).insert(Object.assign(attributes, { user_id: getWhere(userId) }));
  return await query;
};

exports.updateByUserId = (userId, attributes) => {
  attributes = pick(attributes, ["level", "exp"]);
  const query = mysql(TABLE)
    .where({ user_id: getWhere(userId) })
    .update(attributes);
  return query;
};

/**
 * 大多操作藉由 Line userId 取得資料
 * 因此需要到 User 表中找出 userId 的 subQuery
 * 提供這張表 where 條件
 * @param {String} userId Line user id
 */
function getWhere(userId) {
  return mysql.first("No").from("User").where({ platformId: userId });
}
