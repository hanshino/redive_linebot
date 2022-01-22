const mysql = require("../../util/mysql");
const TABLE = "signin_days";
const { pick } = require("lodash");
const fillable = ["user_id", "sum_days", "last_signin_at"];

exports.find = async user_id => {
  return await mysql.first("*").from(TABLE).where({ user_id });
};

exports.update = async (user_id, data) => {
  return await mysql(TABLE).update(pick(data, fillable)).where({ user_id });
};

exports.create = async data => {
  return await mysql(TABLE).insert(pick(data, fillable));
};
