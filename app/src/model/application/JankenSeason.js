const mysql = require("../../util/mysql");

const TABLE = "janken_seasons";

exports.getActive = async function (trx) {
  const db = trx || mysql;
  return db(TABLE).where({ status: "active" }).first();
};

exports.close = async function (id, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ id }).update({ status: "closed", ended_at: new Date() });
};

exports.openNew = async function (notes, trx) {
  const db = trx || mysql;
  const [id] = await db(TABLE).insert({
    started_at: new Date(),
    status: "active",
    notes: notes || null,
  });
  return id;
};

exports.findById = async function (id, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ id }).first();
};

exports.list = async function (limit = 50, trx) {
  const db = trx || mysql;
  return db(TABLE).orderBy("id", "desc").limit(limit);
};
