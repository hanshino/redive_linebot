const sqlite = require("../util/sqlite");
const path = require("path");

module.exports = async () => {
  await sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH));

  var createStatment = 'CREATE TABLE IF NOT EXISTS "GuildWeek" (';
  createStatment += '"id" INTEGER PRIMARY KEY AUTOINCREMENT,';
  createStatment += '"guildId"     TEXT NOT NULL,';
  createStatment += '"month"       TEXT NOT NULL,';
  createStatment += '"week"        INTEGER NOT NULL,';
  createStatment += '"modifyDTM"   TEXT NOT NULL';
  createStatment += ");";

  return sqlite.run(createStatment);
};
