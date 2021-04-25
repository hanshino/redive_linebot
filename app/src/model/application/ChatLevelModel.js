const mysql = require("../../util/mysql");
const redis = require("../../util/redis");

const LEVEL_TITLE_TABLE = "chat_level_title";
const RANGE_TITLE_TABLE = "chat_range_title";
const USER_DATA_TABLE = "chat_user_data";
const EXP_UNIT_TABLE = "chat_exp_unit";
const LEVEL_TITLE_REDIS_KEY = "CHAT_LEVEL_TITLE";
const RANGE_TITLE_REDIS_KEY = "CHAT_RANGE_TITLE";
const GLOBAL_RATE_REDIS_KEY = "CHAT_GLOBAL_RATE";

/**
 * 直接調整伺服器經驗倍率
 * @param {Number} rate
 */
exports.setExperienceRate = rate => {
  return redis.set(GLOBAL_RATE_REDIS_KEY, rate);
};

exports.setExperience = async (userId, experience) => {
  let { id } = await this.getUserData(userId);
  if (!id) return false;

  return mysql
    .update({ experience, modify_date: new Date() })
    .where({ id })
    .from(USER_DATA_TABLE)
    .then(() => true)
    .catch(err => {
      console.error(err);
      return false;
    });
};

/**
 * 一次獲取多筆資料
 * @param {Array} userIds
 */
exports.getUserDatas = async userIds => {
  let rows = await mysql
    .select([
      { id: "cud.id", exp: "cud.experience", userId: "User.platformId", ranking: "cud.rank" },
    ])
    .from(`${USER_DATA_TABLE} as cud`)
    .join("User", "User.No", "cud.id")
    .whereIn("User.platformId", userIds)
    .orderBy("cud.rank");

  let userDatas = await Promise.all(
    rows.map(async row => {
      if (row.exp === 0) return { ...row, rank: "嬰兒", range: "等待投胎", level: 0 };
      let level = await this.getLevel(row.exp);
      if (!level) return row;
      let titleData = await this.getTitleData(level);
      return { ...titleData, ...row, level };
    })
  );

  return userDatas;
};

exports.getUserData = async userId => {
  let rows = await mysql
    .select([
      { id: "cud.id", exp: "cud.experience", userId: "User.platformId", ranking: "cud.rank" },
    ])
    .from(`${USER_DATA_TABLE} as cud`)
    .join("User", "User.No", "cud.id")
    .where("User.platformId", userId);

  let userData = rows[0] || { userId, id: 0, exp: 0, level: 0, ranking: "?" };

  if (userData.exp === 0) return { ...userData, rank: "嬰兒", range: "等待投胎", level: 0 };

  let level = await this.getLevel(userData.exp);
  if (!level) return userData;

  let titleData = await this.getTitleData(level);
  return { ...titleData, ...userData, level };
};

/**
 * 根據經驗總數，取得等級
 * @param {Number} exp
 * @returns {Promise<Number>}
 */
exports.getLevel = async exp => {
  let rows = await mysql
    .select({ level: "unit_level" })
    .from(EXP_UNIT_TABLE)
    .where("total_exp", "<=", exp)
    .limit(1)
    .orderBy("unit_level", "desc");

  let levelData = rows[0] || { level: 0 };
  return levelData.level;
};

exports.getTitleData = async level => {
  let [levelDatas, rangeDatas] = await Promise.all([this.getLevelTitle(), this.getRangeTitle()]);

  let targetTitle = levelDatas.find(data => {
    level = level - data.range;
    if (level <= 0) return true;
  });

  let rankTitle = targetTitle.title;
  let { title: rangeTitle } = rangeDatas.find(data => data.id === targetTitle.range + level);

  return { rank: rankTitle, range: rangeTitle };
};

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
 * 取得排行榜
 * @param {Number} page
 */
exports.getRankList = async page => {
  return await mysql
    .select("id", "experience", "rank")
    .from(USER_DATA_TABLE)
    .limit(100)
    .orderBy("experience", "desc")
    .offset((page - 1) * 10);
};

/**
 * 取得所有資料，會快取10秒
 * @returns {Promise<Array<{id: Number, experience: Number}>>}
 */
exports.getAllList = async () => {
  let key = "CHAT_ALL_LIST";
  let data = await redis.get(key);
  if (data !== null) return data;

  data = await mysql.select("id", "experience").from(USER_DATA_TABLE);
  await redis.set(key, data, 10);

  return data;
};

/**
 * 取得經驗單位資料
 * @returns {Promise<Array<{level: Number, exp: Number}>>}
 */
exports.getExpUnitData = async () => {
  let key = "EXP_UNIT_DATA";
  let data = await redis.get(key);
  if (data !== null) return data;

  data = await mysql.select({ level: "unit_level", exp: "total_exp" }).from(EXP_UNIT_TABLE);
  await redis.set(key, data, 86400);

  return data;
};
