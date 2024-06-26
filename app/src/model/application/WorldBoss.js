const mysql = require("../../util/mysql");
const TABLE = "world_boss";
const pick = require("lodash/pick");
const get = require("lodash/get");

exports.table = TABLE;

const fillable = [
  "name",
  "description",
  "image",
  "level",
  "hp",
  "attack",
  "defense",
  "speed",
  "luck",
  "exp",
  "gold",
];

/**
 * 取得所有世界boss
 * @param   {Object}  options
 * @param   {Array<{column: String, order: String}>}  options.sort
 * @returns {Promise<Array>}
 */
exports.all = async options => {
  const sort = get(options, "sort", []);
  const query = mysql(TABLE).select("*");

  if (sort) {
    query.orderBy(sort);
  }

  return await query;
};

/**
 * 取得單一世界boss
 * @param {Number} id
 * @returns {Promise<Object>}
 */
exports.find = async id => {
  return await mysql(TABLE).where({ id }).first();
};

/**
 * 新增世界boss
 * @param {Object} attributes
 */
exports.create = async (attributes = {}) => {
  let data = pick(attributes, fillable);
  return await mysql(TABLE).insert(data);
};

exports.update = async (id, attributes = {}) => {
  let data = pick(attributes, fillable);
  return await mysql(TABLE).update(data).where({ id });
};

exports.destory = async id => {
  return await mysql(TABLE).delete().where({ id });
};
