const sqlite = require("../util/sqlite");
const path = require("path");

module.exports = async () => {
  await sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH));

  var createStatment = 'CREATE TABLE IF NOT EXISTS "GuildConfig" (';
  createStatment += '"ID"          INTEGER PRIMARY KEY AUTOINCREMENT,';
  createStatment += '"GuildId"     TEXT NOT NULL,';
  createStatment += '"Config"      TEXT NOT NULL,';
  createStatment += '"modifyDTM"   TEXT NOT NULL';
  createStatment += ");";

  return sqlite.run(createStatment);
};
