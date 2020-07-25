const sqlite = require("../../../util/sqlite");
const sql = require("sql-query-generator");

exports.setWeek = (groupId, month, week) => {
  var query = sql
    .update("GuildWeek", {
      week: week,
      modifyDTM: new Date().getTime(),
    })
    .where({ guildId: groupId, month: month });
  return sqlite.run(query.text, query.values);
};

exports.insertWeek = (groupId, month) => {
  var query = sql.insert("GuildWeek", {
    guildId: groupId,
    month: month,
    week: 1,
    modifyDTM: new Date().getTime(),
  });
  return sqlite.run(query.text, query.values);
};

exports.queryWeek = (groupId, month) => {
  var query = sql.select("GuildWeek", "*").where({ guildId: groupId, month: month });
  return sqlite.get(query.text, query.values);
};
