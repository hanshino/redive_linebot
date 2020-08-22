const sqlite = require("../util/sqlite");
const path = require("path");

module.exports = async () => {
  await sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH));

  var createStatment = 'CREATE TABLE IF NOT EXISTS "GuildMembers" (';
  createStatment += '"No" INTEGER PRIMARY KEY AUTOINCREMENT,';
  createStatment += '"GuildId"     TEXT,';
  createStatment += '"UserId"      TEXT NOT NULL,';
  createStatment += '"Status"      INTEGER DEFAULT 1,';
  createStatment += '"JoinedDTM"   TEXT,';
  createStatment += '"LeftDTM"     TEXT,';
  createStatment += '"SpeakTimes"  INTEGER DEFAULT 0,';
  createStatment += '"LastSpeakDTM" TEXT';
  createStatment += ");";

  return sqlite.run(createStatment);
};
