const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "chat_user_data";
const fillable = [
  "user_id",
  "prestige_count",
  "current_level",
  "current_exp",
  "final_max_level_reached_at",
  "final_max_level_legacy_order",
  "awakened_at",
  "active_trial_id",
  "active_trial_started_at",
  "active_trial_exp_progress",
];

class ChatUserData extends Base {}

const model = new ChatUserData({ table: TABLE, fillable });

exports.model = model;
exports.TABLE = TABLE;

exports.findByUserId = (userId, trx) => {
  const query = model.qb(trx).where({ user_id: userId });
  if (trx) query.forUpdate();
  return query.first();
};

/**
 * 建立或更新一列；PK = user_id。
 * @param {string} userId
 * @param {object} attributes
 */
exports.upsert = async (userId, attributes = {}, trx) => {
  const existing = await exports.findByUserId(userId, trx);
  if (existing) {
    return (trx || mysql)(TABLE).where({ user_id: userId }).update(attributes);
  }
  return (trx || mysql)(TABLE).insert({ user_id: userId, ...attributes });
};
