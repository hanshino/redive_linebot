const sqlite = require("../util/sqlite");
const path = require("path");

module.exports = async () => {
  await sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH));

  var createStatment = 'CREATE TABLE IF NOT EXISTS "Admin" (';
  createStatment += '"ID"          INTEGER PRIMARY KEY AUTOINCREMENT,';
  createStatment += '"userId"      TEXT NOT NULL,';
  createStatment += '"privilege"   TEXT NOT NULL';
  createStatment += ");";

  return sqlite.run(createStatment);
};
