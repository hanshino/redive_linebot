const mysql = require("../../util/mysql");
const WEB_ANNOUNCE_TABLE = "web_announcement";

/**
 * @param {Number} page
 */
exports.getData = page => {
  return mysql
    .select(["title", "content", "level", "create_time"])
    .from(WEB_ANNOUNCE_TABLE)
    .orderBy("id", "desc")
    .offset(page - 1)
    .limit(10);
};
