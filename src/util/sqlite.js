const sqlite3 = require("sqlite3").verbose();
var db;

exports.db = db;

exports.open = function (path) {
  return new Promise(function (resolve, reject) {
    this.db = new sqlite3.Database(path, function (err) {
      if (err) reject("Open error: " + err.message);
      else resolve(path + " opened");
    });
  });
};

// any query: insert/delete/update
exports.run = function (query, params) {
  return new Promise(function (resolve, reject) {
    this.db.run(query, params, function (err) {
      if (err) reject(err.message);
      else resolve(true);
    });
  });
};

// first row read
exports.get = function (query, params) {
  return new Promise(function (resolve, reject) {
    this.db.get(query, params, function (err, row) {
      if (err) reject("Read error: " + err.message);
      else {
        resolve(row);
      }
    });
  });
};

// set of rows read
exports.all = function (query, params) {
  return new Promise(function (resolve, reject) {
    if (params == undefined) params = [];

    this.db.all(query, params, function (err, rows) {
      if (err) reject("Read error: " + err.message);
      else {
        resolve(rows);
      }
    });
  });
};

// each row returned one by one
exports.each = function (query, params, action) {
  return new Promise(function (resolve, reject) {
    var db = this.db;
    db.serialize(function () {
      db.each(query, params, function (err, row) {
        if (err) reject("Read error: " + err.message);
        else {
          if (row) {
            action(row);
          }
        }
      });
      db.get("", function () {
        resolve(true);
      });
    });
  });
};

exports.close = function () {
  return new Promise(function (resolve) {
    this.db.close();
    resolve(true);
  });
};
