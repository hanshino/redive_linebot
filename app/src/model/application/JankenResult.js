const mysql = require("../../util/mysql");
const TABLE = "janken_result";
const { pick, get } = require("lodash");

const fillable = ["record_id", "user_id", "result"];

exports.resultMap = {
  win: 1,
  lose: 2,
  draw: 0,
};

exports.all = async (options = {}) => {
  const { userId } = get(options, "filter", {});
  let query = mysql(TABLE);
  if (userId) query = query.where({ user_id: userId });
  return await query.select("*");
};

exports.create = async (attributes = {}) => {
  let data = pick(attributes, fillable);
  return await mysql(TABLE).insert(data);
};

exports.insert = async (data = []) => {
  let insertData = data.map(item => pick(item, fillable));
  return await mysql(TABLE).insert(insertData);
};

exports.findUserGrade = async userId => {
  const result = await mysql(TABLE)
    .select([{ count: mysql.raw("COUNT(`result`)") }, "result"])
    .where({ user_id: userId })
    .groupBy("result");

  return result;
};
