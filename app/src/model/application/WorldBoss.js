const mysql = require("../../util/mysql");
const TABLE = "world_boss";
const pick = require("lodash/pick");

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
 * @returns {Promise<Array>}
 */
exports.all = async () => {
  return await mysql(TABLE).select("*");
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
