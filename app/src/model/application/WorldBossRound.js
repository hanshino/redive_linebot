const mysql = require("../../util/mysql");

const TABLE = "world_boss_round";

exports.findActiveForUpdate = async function (seasonId, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ season_id: seasonId, status: "active" }).forUpdate().first();
};

exports.findActiveBySeason = async function (seasonId, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ season_id: seasonId, status: "active" }).first();
};
