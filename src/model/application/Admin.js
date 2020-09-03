const sqlite = require("../../util/sqlite");
const sql = require("sql-query-generator");

exports.getList = () => {
  var query = sql.select("Admin", "*");
  return sqlite.all(query.text, query.values);
};
