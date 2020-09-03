const sqlite = require("../util/sqlite");
const path = require("path");

module.exports = async () => {
  await sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH));

  var createStatment = 'CREATE TABLE IF NOT EXISTS "GachaPool" (';
  createStatment += '"ID"              INTEGER PRIMARY KEY AUTOINCREMENT,';
  createStatment += '"Name"            TEXT NOT NULL,';
  createStatment += '"HeadImage_Url"   TEXT NOT NULL,';
  createStatment += '"Star"            TEXT NOT NULL,';
  createStatment += '"Rate"            TEXT NOT NULL,';
  createStatment += '"Is_Princess"     TEXT NOT NULL DEFAULT 0,';
  createStatment += '"Modify_TS"       TEXT,';
  createStatment += '"Tag"             TEXT';
  createStatment += ");";

  return sqlite.run(createStatment);
};
