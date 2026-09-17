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

  let [createdStartAt, createdEndAt] = [
    get(options, "filter.createdAt.start"),
    get(options, "filter.createdAt.end"),
  ];

  if (createdStartAt) query = query.where("created_at", ">=", createdStartAt);
  if (createdEndAt) query = query.where("created_at", "<=", createdEndAt);

  return await query.select("*");
};

/**
 * @param {Object} attributes
 * @param {import("knex").Knex.Transaction} [trx] 選填；傳入則在該交易內執行，不傳行為不變
 */
exports.create = async (attributes = {}, trx) => {
  let data = pick(attributes, fillable);
  return await (trx || mysql)(TABLE).insert(data);
};

/**
 * @param {Array<Object>} data
 * @param {import("knex").Knex.Transaction} [trx] 選填
 */
exports.insert = async (data = [], trx) => {
  let insertData = data.map(item => pick(item, fillable));
  return await (trx || mysql)(TABLE).insert(insertData);
};

exports.findUserGrade = async userId => {
  const result = await mysql(TABLE)
    .select([{ count: mysql.raw("COUNT(`result`)") }, "result"])
    .where({ user_id: userId })
    .groupBy("result");

  return result;
};
