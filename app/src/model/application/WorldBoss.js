const mysql = require("../../util/mysql");
const TABLE = "world_boss";

exports.table = TABLE;

exports.all = async () => {
  return await mysql(TABLE).select("*");
};
