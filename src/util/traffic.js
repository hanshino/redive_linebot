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

function get(query, params) {
  return new Promise((res, rej) => {
    db.get(query, params, function (err, rows) {
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
    time: getDate(),
  });

  createStatus.then(() => {
    db.run(query.text, query.values);
  });
};

exports.getSignData = () => {
  var query = sql.select("SignRecord", ["COUNT(*) as cnt", "Sign"]).groupby("Sign");
  return createStatus.then(() => all(query.text, query.values));
};

exports.getPeopleData = async () => {
  let curr = new Date().getTime();
  var query = sql
    .select("PeopleFlow", ["COUNT(*) as cnt", "userId"])
    .where({ time: getDate() })
    .groupby("userId");

  await createStatus;

  let queryText = query.text;
  let queryValue = query.values;

  let lastOne = getDate(new Date(curr - 60 * 1000));
  let lastTwo = getDate(new Date(curr - 120 * 1000));

  let currData = await all(queryText, queryValue);
  let lastOneData = await all(queryText, [lastOne]);
  let lastTwoData = await all(queryText, [lastTwo]);

  return [currData, lastOneData, lastTwoData].map(data => {
    if (data.length === 0) return { onlineCount: 0, speakTimes: 0 };
    let onlineCount = data.length;
    let speakTimes = data.map(d => parseInt(d.cnt)).reduce((pre, curr) => pre + curr);
    return { onlineCount, speakTimes };
  });
};

function getDate(time) {
  time = time || new Date();
  return [
    time.getFullYear(),
    time.getMonth(),
    time.getDate(),
    time.getHours(),
    time.getMinutes(),
  ].join("");
}
