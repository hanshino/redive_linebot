const { DefaultLogger } = require("./Logger");

// 時區約定：連線層明確宣告 +08:00，不依賴容器的 TZ 環境變數。
//
// 2026-07 搬到 EC2 時，prod 的 mysql container 少了 `TZ: Asia/Taipei`（bot 有、mysql 沒有），
// 於是 MySQL 跑 UTC、Node 跑 Taipei。mysql2 預設 `timezone: "local"`，會把 JS Date 以
// Node 本地時間序列化成字串，MySQL 再用自己的 session 時區解讀 —— 兩邊差 8 小時。
// 結果所有「今天」的區間查詢（每日一抽、每日任務、世界boss 傷害上限…）在台北時間
// 00:00-07:59 都查不到當天資料，等於限制整段時間失效。
//
// 這裡兩邊都釘住：
//   - connection.timezone：mysql2 client 端序列化/解析 Date 用 +08:00
//   - pool.afterCreate：每條連線的 MySQL session 也設成 +08:00
// 用數字 offset 而非 "Asia/Taipei"，因為後者需要 MySQL 載入時區表，而台灣沒有日光節約。
const TIMEZONE = "+08:00";

const knex = require("knex")({
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
});

require("./queryProfiler").attach(knex);

// 開機自檢：時區設錯是靜默的（查詢照跑、只是答案錯），所以在這裡吵一次。
// 上一次就是因為沒人發現，過了幾天才從使用者回報追出來。
knex
  .raw("SELECT TIMEDIFF(NOW(), UTC_TIMESTAMP()) AS offset")
  .then(([rows]) => {
    const offset = String(rows[0].offset);
    if (offset !== "08:00:00") {
      DefaultLogger.error(
        `db.timezone.mismatch expected=08:00:00 actual=${offset} — ` +
          `每日/當天區間查詢會失準，請檢查 MySQL 時區設定`
      );
    }
  })
  .catch(err => DefaultLogger.warn(`db.timezone.check_failed ${err.message}`));

/**
 * @returns { import("knex").Knex }
 */
module.exports = knex;
