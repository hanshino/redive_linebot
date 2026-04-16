const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "user_titles";
const fillable = ["user_id", "title_id", "granted_at"];

class UserTitle extends Base {}

const model = new UserTitle({ table: TABLE, fillable });

exports.model = model;

exports.findByUser = async userId => {
  return mysql(TABLE)
    .join("titles", "user_titles.title_id", "titles.id")
    .where("user_titles.user_id", userId)
    .select("titles.*", "user_titles.granted_at")
    .orderBy("titles.order", "asc");
};

exports.clearAll = async trx => {
  const db = trx || mysql;
  return db(TABLE).delete();
};

exports.grant = async (userId, titleId, trx) => {
  const db = trx || mysql;
  const existing = await db(TABLE).where({ user_id: userId, title_id: titleId }).first();
  if (existing) return;
  return db(TABLE).insert({ user_id: userId, title_id: titleId });
};

exports.grantByPlatformId = async (platformId, titleId, trx) => {
  const db = trx || mysql;
  return db(TABLE).insert({
    user_id: platformId,
    title_id: titleId,
  });
};
