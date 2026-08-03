// Update with your config settings.
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: "../.env",
  });
}

// 時區必須跟 src/util/mysql.js 一致 —— 見那支檔案開頭的完整說明。
// migration 會寫入 timestamp/datetime 欄位，用錯時區等於寫進偏移 8 小時的資料。
const TIMEZONE = "+08:00";

module.exports = {
  client: "mysql2",
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_USER_PASSWORD,
    port: process.env.DB_PORT,
    database: "Princess",
    timezone: TIMEZONE,
  },
  pool: {
    min: 0,
    max: 10,
    afterCreate: (conn, done) => {
      conn.query(`SET time_zone = '${TIMEZONE}'`, err => done(err, conn));
    },
  },
};
