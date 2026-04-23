const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "chat_user_data";
const fillable = [
  "user_id",
  "prestige_count",
  "current_level",
  "current_exp",
  "awakened_at",
  "active_trial_id",
  "active_trial_started_at",
  "active_trial_exp_progress",
];

class ChatUserData extends Base {}

const model = new ChatUserData({ table: TABLE, fillable });

exports.model = model;
exports.TABLE = TABLE;

exports.findByUserId = userId => model.first({ filter: { user_id: userId } });

/**
 * 建立或更新一列；PK = user_id。
 * @param {string} userId
 * @param {object} attributes
 */
exports.upsert = async (userId, attributes = {}) => {
  const existing = await exports.findByUserId(userId);
  if (existing) {
    return mysql(TABLE).where({ user_id: userId }).update(attributes);
  }
  return mysql(TABLE).insert({ user_id: userId, ...attributes });
};
