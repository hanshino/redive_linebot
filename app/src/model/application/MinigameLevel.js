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
 * @property {Number} job_key
 * @property {String} job_name
 * @property {String} job_description
 * @property {Number} job_class_advancement
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
  const query = mysql
    .select({
      id: "minigame_level.id",
      user_id: "minigame_level.user_id",
      level: "minigame_level.level",
      exp: "minigame_level.exp",
      job_id: "minigame_level.job_id",
      job_key: "minigame_job.key",
      job_name: "minigame_job.name",
      job_description: "minigame_job.description",
      job_class_advancement: "minigame_job.class_advancement",
      created_at: "minigame_level.created_at",
      updated_at: "minigame_level.updated_at",
    })
    .from(TABLE)
    .where({ user_id: subQuery })
    .first()
    .join("minigame_job", "minigame_job.id", "=", "minigame_level.job_id");

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

exports.changeUserJob = async (userId, jobKey) => {
  const subQuery = getWhere(userId);
  const query = mysql(TABLE)
    .where({ user_id: subQuery })
    .update({ job_id: mysql("minigame_job").where({ key: jobKey }).select("id") });
  return await query;
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
