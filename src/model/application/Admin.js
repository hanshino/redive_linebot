const mysql = require("../../util/mysql");

exports.getList = () => {
  return mysql.select().from("Admin");
};
