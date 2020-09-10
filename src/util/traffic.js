const sqlite3 = require("sqlite3").verbose();
const sql = require("sql-query-generator");
var db = new sqlite3.Database(":memory:");

var createStatus = init();

function init() {
  return new Promise((res, rej) => {
    var query = "CREATE TABLE SignRecord ( Sign TEXT )";
    db.run(query);

    db.run("CREATE TABLE PeopleFlow (userId TEXT, time TEXT)", function (err) {
      if (err) rej(err);
      res();
    });
  });
}

function all(query, params) {
  return new Promise((res, rej) => {
    db.all(query, params, function (err, rows) {
      if (err) rej(err);
      res(rows);
    });
  });
}

exports.recordSign = sign => {
  var query = sql.insert("SignRecord", { sign });

  createStatus.then(() => {
    db.run(query.text, query.values);
  });
};

exports.recordPeople = context => {
  var query = sql.insert("PeopleFlow", {
    userId: context.event.source.userId || "U123",
    time: getCurrDate(),
  });

  createStatus.then(() => {
    db.run(query.text, query.values);
  });
};

exports.getSignData = () => {
  var query = sql.select("SignRecord", ["COUNT(*) as cnt", "Sign"]).groupby("Sign");
  return createStatus.then(() => all(query.text, query.values));
};

exports.getPeopleData = () => {
  var query = sql
    .select("PeopleFlow", ["COUNT(*) as cnt", "userId"])
    .where({ time: getCurrDate() })
    .groupby("userId");
  return createStatus.then(() => all(query.text, query.values));
};

function getCurrDate() {
  var timestamp = new Date();
  return [
    timestamp.getFullYear(),
    timestamp.getMonth(),
    timestamp.getDate(),
    timestamp.getHours(),
    timestamp.getMinutes(),
  ].join("");
}
