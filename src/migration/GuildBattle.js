const sqlite = require("../util/sqlite");
const path = require("path");

module.exports = async () => {
  await sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH));

  var createStatment = 'CREATE TABLE IF NOT EXISTS "GuildBattle" (';
  createStatment += '"ID"          INTEGER PRIMARY KEY AUTOINCREMENT,';
  createStatment += '"GuildId"     TEXT NOT NULL,';
  createStatment += '"FormId"      TEXT NOT NULL,';
  createStatment += '"Month"       TEXT NOT NULL,';
  createStatment += '"Status"      INTEGER NOT NULL DEFAULT 1';
  createStatment += ");";

  return sqlite.run(createStatment);
};
