const mysql = require("../../util/mysql");

const TABLE = "janken_daily_reward_log";

exports.tryInsert = async function ({ user_id, reward_date, season_id, reward_type, amount }, trx) {
  const db = trx || mysql;
  try {
    await db(TABLE).insert({ user_id, reward_date, season_id, reward_type, amount });
    return true;
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") return false;
    throw err;
  }
};

exports.getByUserAndDate = async function (user_id, reward_date, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ user_id, reward_date }).first();
};
