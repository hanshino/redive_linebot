const sqlite = require("../util/sqlite");
const path = require("path");

module.exports = async () => {
  await sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH));

  var createStatment = 'CREATE TABLE IF NOT EXISTS "IanUser" (';
  createStatment += '"ID"          INTEGER PRIMARY KEY AUTOINCREMENT,';
  createStatment += '"platform"    TEXT NOT NULL,';
  createStatment += '"userId"      TEXT NOT NULL,';
  createStatment += '"ianUserId"   TEXT NOT NULL,';
  createStatment += '"createDTM"   TEXT NOT NULL';
  createStatment += ");";

  return sqlite.run(createStatment);
};
