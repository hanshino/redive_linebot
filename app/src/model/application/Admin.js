const mysql = require("../../util/mysql");
const redis = require("../../util/redis");
const config = require("config");

exports.getList = () => {
  return mysql.select().from("admin");
};

exports.find = async userId => {
  return await mysql.from("admin").where({ userId }).first();
};

/**
 * 驗證是否為管理員
 * @param {String} userId
 */
exports.isAdmin = userId => {
  return mysql
    .select("ID")
    .from("admin")
    .where({ userId })
    .then(res => (res.length > 0 ? true : false));
};

exports.isAdminFromCache = async userId => {
  let key = config.get("redis.keys.adminList");
  let adminList = await redis.get(key);

  if (!adminList) {
    let result = await mysql("admin").select("userId");
    adminList = result.map(item => item.userId);
    await redis.set(key, JSON.stringify(adminList), {
      EX: 60 * 60,
    });
  } else {
    adminList = JSON.parse(adminList);
  }

  return adminList.includes(userId);
};
