const sqlite = require("../util/sqlite");
const path = require("path");

module.exports = async () => {
  await sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH));

  var createStatment = 'CREATE TABLE IF NOT EXISTS "User" (';
  createStatment += '"No"          INTEGER PRIMARY KEY AUTOINCREMENT,';
  createStatment += '"platform"    INTEGER NOT NULL,';
  createStatment += '"platformId"  TEXT NOT NULL,';
  createStatment += '"status"      INTEGER NOT NULL DEFAULT 1,';
  createStatment += '"createDTM"   TEXT NOT NULL,';
  createStatment += '"closeDTM"    TEXT';
  createStatment += ");";

  return sqlite.run(createStatment);
};
