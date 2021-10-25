const mysql = require("../../util/mysql");
const TABLE = "world_boss_user_attack_message";

exports.table = TABLE;

exports.all = async () => {
  return await mysql.select("*").from(TABLE);
};
