const sqlite = require("../../util/sqlite");
const sql = require("sql-query-generator");

exports.fetchConfig = groupId => {
  var query = sql.select("GuildConfig", "*").where({ GuildId: groupId });
  return sqlite.get(query.text, query.values);
};
