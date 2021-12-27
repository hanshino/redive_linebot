const mysql = require("../../util/mysql");
const TABLE = "janken_records";
const { pick, get } = require("lodash");

const fillable = ["id", "user_id", "target_user_id"];

exports.find = async id => {
  return await mysql(TABLE).where({ id }).first();
};

exports.searchLatest = async (options = {}) => {
  let { userId, targetUserId } = get(options, "filter", {});
  let query = mysql(TABLE);
  if (userId) query = query.where({ user_id: userId });
  if (targetUserId) query = query.where({ target_user_id: targetUserId });

  return await query.orderBy("created_at", "desc").first();
};

exports.findByUserId = async userId => {
  return await mysql(TABLE).where({ user_id: userId }).first();
};

exports.findByTargetUserId = async targetUserId => {
  return await mysql(TABLE).where({ target_user_id: targetUserId }).first();
};

exports.create = async (attributes = {}) => {
  let data = pick(attributes, fillable);
  return await mysql(TABLE).insert(data);
};

exports.update = async (id, attributes = {}) => {
  let data = pick(attributes, fillable);
  return await mysql(TABLE).update(data).where({ id });
};
