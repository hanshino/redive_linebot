const mysql = require("../../util/mysql");

const TABLE = "world_boss_season";

exports.findActive = async function (activeSlot = 1, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ status: "active", active_slot: activeSlot }).first();
};

exports.findActiveForUpdate = async function (activeSlot = 1, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ status: "active", active_slot: activeSlot }).forUpdate().first();
};

exports.findForUpdate = async function (id, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ id }).forUpdate().first();
};

exports.findSettleable = async function (now, activeSlot = 1, trx) {
  const db = trx || mysql;
  return db(TABLE)
    .where({ status: "active", active_slot: activeSlot })
    .where("end_time", "<=", now)
    .orderBy("end_time", "asc")
    .orderBy("id", "asc");
};
