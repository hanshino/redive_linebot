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
exports.findByUserId = async (userId, trx) => {
  const db = trx || mysql;
  // 先組出 從 User 表中找出 userId 的 subQuery
  const subQuery = getWhere(userId, db);
  const query = db
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

exports.createByUserId = async (userId, attributes, trx) => {
  const db = trx || mysql;
  attributes = pick(attributes, ["level", "exp"]);
  const query = db(TABLE).insert(Object.assign(attributes, { user_id: getWhere(userId, db) }));
  return await query;
};

exports.updateByUserId = (userId, attributes, trx) => {
  const db = trx || mysql;
  attributes = pick(attributes, ["level", "exp"]);
  return db(TABLE)
    .where({ user_id: getWhere(userId, db) })
    .update(attributes);
};

exports.lockUserAndProgress = async (userId, defaults, trx) => {
  const user = await trx("user").where({ platform_id: userId }).forUpdate().first();
  if (!user) throw Object.assign(new Error("USER_NOT_FOUND"), { code: "USER_NOT_FOUND" });

  let row = await trx(TABLE).where({ user_id: user.id }).forUpdate().first();
  if (!row) {
    await trx(TABLE).insert({ user_id: user.id, level: defaults.level, exp: defaults.exp });
    row = await trx(TABLE).where({ user_id: user.id }).forUpdate().first();
  }
  return row;
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
function getWhere(userId, db = mysql) {
  return db.first("id").from("user").where({ platform_id: userId });
}
