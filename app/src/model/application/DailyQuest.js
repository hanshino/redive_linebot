const mysql = require("../../util/mysql");
const TABLE = "daily_quest";
const { get } = require("lodash");

exports.all = async (userId, options = {}) => {
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
