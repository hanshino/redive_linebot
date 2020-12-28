const mysql = require("../../util/mysql");
const redis = require("../../util/redis");

const LEVEL_TITLE_TABLE = "chat_level_title";
const RANGE_TITLE_TABLE = "chat_range_title";
const USER_DATA_TABLE = "chat_user_data";
const LEVEL_TITLE_REDIS_KEY = "CHAT_LEVEL_TITLE";
const RANGE_TITLE_REDIS_KEY = "CHAT_RANGE_TITLE";

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

exports.getUserData = async userId => {
  let rows = await mysql
    .select([{ id: "cud.id", exp: "cud.experience", userId: "User.platformId" }])
    .from(`${USER_DATA_TABLE} as cud`)
    .join("User", "User.No", "cud.id")
    .where("User.platformId", userId);

  let userData = rows[0] || { userId, id: 0, exp: 0, level: 0 };

  if (userData.exp === 0) return { ...userData, rank: "嬰兒", range: "等待投胎" };

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
    .from("chat_exp_unit")
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
