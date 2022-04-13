const mysql = require("../lib/mysql");
const redis = require("../lib/redis");
const config = require("config");
const LEVEL_TITLE_TABLE = "chat_level_title";
const RANGE_TITLE_TABLE = "chat_range_title";
const USER_DATA_TABLE = "chat_user_data";
const EXP_UNIT_TABLE = "chat_exp_unit";
const LEVEL_TITLE_REDIS_KEY = "CHAT_LEVEL_TITLE";
const RANGE_TITLE_REDIS_KEY = "CHAT_RANGE_TITLE";
const CHAT_RECORD_REDIS_KEY = "CHAT_EXP_RECORD";
const GLOBAL_RATE_REDIS_KEY = "CHAT_GLOBAL_RATE";
const EXP_UNIT_REDIS_KEY = "CHAT_EXP_UNIT";

/**
 * 取得等級稱號
 * @returns {Promise<Array<{title: String, range: Number}>>}
 */
exports.getLevelTitle = async () => {
  let data = await redis.get(LEVEL_TITLE_REDIS_KEY);
  if (data !== null) return data;

  data = await mysql
    .select(["title", { range: "title_range" }])
    .from(LEVEL_TITLE_TABLE)
    .orderBy("id", "asc");

  redis.set(LEVEL_TITLE_REDIS_KEY, data, 86400);
  return data;
};

/**
 * 取得階級稱號
 * @returns {Promise<Array<{id: Number, title: String}>}
 */
exports.getRangeTitle = async () => {
  let data = await redis.get(RANGE_TITLE_REDIS_KEY);
  if (data !== null) return data;

  data = await mysql.select("*").from(RANGE_TITLE_TABLE);

  redis.set(RANGE_TITLE_REDIS_KEY, data, 86400);
  return data;
};

/**
 * 取得經驗累積表
 * @returns {Promise<Array<{unit_level: Number, total_exp: Number}>}
 */
exports.getExpUnit = async () => {
  let data = await redis.get(EXP_UNIT_REDIS_KEY);
  if (data !== null) return data;

  data = await mysql.select("*").from(EXP_UNIT_TABLE);

  redis.set(EXP_UNIT_REDIS_KEY, data, 86400);
  return data;
};

/**
 * 新增用戶說話經驗資料
 * @param {String} userId
 * @return {Promise<Boolean>}
 */
exports.insertNewUserByUserId = async userId => {
  resetUserCache([userId]);

  let query = this.genInsertUser(userId);
  return await query.then(() => true).catch(() => false);
};

/**
 * 一次新增多筆用戶
 * @param {Array} userIds
 */
exports.insertUsers = async userIds => {
  let querys = userIds.map(this.genInsertUser);
  await mysql.transaction(trx => {
    return Promise.all(querys.map(query => query.transacting(trx).catch(() => false)));
  });

  resetUserCache(userIds);
};

function resetUserCache(userIds) {
  userIds.forEach(userId => {
    let userKey = `CHAT_USER_${userId}`;
    redis.del(userKey);
  });
}

/**
 * 純產生新增使用者資料的語法
 * @param {String} userId
 */
exports.genInsertUser = userId => {
  return mysql.from(mysql.raw("?? (??)", ["chat_user_data", "id"])).insert(function () {
    this.from("User as u").where("u.platformId", userId).select({ id: "No" });
  });
};

/**
 * 取得用戶資料
 * @param {String} userId
 * @returns {Promise<{id: String, exp: Number, userId: String}>}
 */
exports.getUserByUserId = async userId => {
  let userKey = `CHAT_USER_${userId}`;
  let data = await redis.get(userKey);
  if (data !== null) return data;

  let rows = await mysql
    .select([{ id: "cud.id", exp: "cud.experience", userId: "User.platformId" }])
    .from("chat_user_data as cud")
    .join("User", "User.No", "cud.id")
    .where("User.platformId", userId);

  data = rows[0] || {};

  redis.set(userKey, data, 60 * 10);
  return data;
};

/**
 * 說話時間戳
 * @param {String} userId
 * @param {Number} timestamp
 */
exports.touchTS = (userId, timestamp) => {
  let touchKey = `CHAT_TOUCH_TIMESTAMP_${userId}`;
  return redis.set(touchKey, timestamp, 5);
};

/**
 * 取得說話時間戳
 * @param {String} userId
 * @returns {Promise<null|Number>}
 */
exports.getTouchTS = userId => {
  return redis.get(`CHAT_TOUCH_TIMESTAMP_${userId}`);
};

/**
 * 暫存經驗，後續寫入
 * @param {String} userId
 * @param {Number} expUnit
 */
exports.insertRecord = (userId, expUnit) => {
  redis.enqueue(CHAT_RECORD_REDIS_KEY, JSON.stringify({ userId, expUnit }), 86400);
};

exports.getRecrod = () => {
  return redis.dequeue(CHAT_RECORD_REDIS_KEY);
};

/**
 * 寫入紀錄
 * @param {Array<{userId: String, experience: Number}>} recordDatas
 */
exports.writeRecords = async recordDatas => {
  let trx = await mysql.transaction();
  recordDatas = await Promise.all(
    recordDatas.map(data =>
      this.getUserByUserId(data.userId).then(userData => ({
        ...data,
        id: userData.id,
      }))
    )
  );

  let querys = recordDatas.map(data => genUpdateExp(data.id, data.experience));

  await Promise.all(querys.map(query => query.transacting(trx).catch(console.error)));
  await trx.commit();
};

/**
 * 取得伺服器倍率
 */
exports.getGlobalRate = () => {
  let defaultRate = config.get("chat_level.exp.rate.default");
  return redis.get(GLOBAL_RATE_REDIS_KEY).then(val => val || defaultRate);
};

function genUpdateExp(id, experience) {
  return mysql
    .update({ modify_date: new Date(), experience: mysql.raw("experience + ?", [experience]) })
    .from(USER_DATA_TABLE)
    .where({ id });
}

/**
 * 獲取使用者數據，可獲取多筆
 * @param {Array<String>} userIds [U123...,U456...]
 * @returns {Promise<Array<{id: Number, exp: Number, userId: String}>>}
 */
exports.getUserDatas = async userIds => {
  return mysql
    .select([{ id: "cud.id", exp: "cud.experience", userId: "User.platformId" }])
    .from("chat_user_data as cud")
    .join("User", "User.No", "cud.id")
    .whereIn("User.platformId", userIds);
};

exports.refreshRanking = async () => {
  let setX = mysql.raw("SET @x = 0;");
  let update = mysql(USER_DATA_TABLE)
    .update({ rank: mysql.raw("@x:=@x+1") })
    .orderBy("experience", "desc");

  return mysql.transaction(async trx => {
    await setX.transacting(trx);
    await update.transacting(trx);
  });
};
