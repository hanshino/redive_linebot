const mysql = require("../../../util/mysql");

exports.table = "GuildWeek";
exports.setWeek = (guildId, month, week) => {
  return mysql
    .update({
      week,
      modifyDTM: new Date(),
    })
    .from(this.table)
    .where({ guildId, month })
    .then(res => res);
};

exports.insertWeek = (guildId, month) => {
  return mysql
    .insert({ guildId, month, week: 1, modifyDTM: new Date() })
    .into(this.table)
    .then(res => res);
};

exports.queryWeek = (guildId, month) => {
  return mysql.select("*").from(this.table).where({ guildId, month });
};
