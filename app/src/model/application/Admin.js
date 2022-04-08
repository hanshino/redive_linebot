const mysql = require("../../util/mysql");
const redis = require("../../util/redis");
const config = require("config");

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

exports.isAdminFromCache = async userId => {
  let key = config.get("redis.keys.adminList");
  let adminList = await redis.get(key);

  if (!adminList) {
    let result = await mysql("Admin").select("userId");
    adminList = result.map(item => item.userId);
    await redis.set(key, JSON.stringify(adminList), {
      EX: 60 * 60,
    });
  } else {
    adminList = JSON.parse(adminList);
  }

  return adminList.includes(userId);
};
