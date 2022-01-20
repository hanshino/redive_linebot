const mysql = require("../../util/mysql");
const TABLE = "advancement";
const PIVOT_TABLE = "user_has_advancements";
const { pick, get } = require("lodash");

const fillable = ["name", "type", "description", "icon"];

exports.create = async (attributes = {}) => {
  let data = pick(attributes, fillable);
  return await mysql(TABLE).insert(data);
};

exports.all = async (options = {}) => {
  const { userId } = get(options, "filter", {});
  const pagination = get(options, "pagination", {});
  let query = mysql(TABLE);
  if (userId) query = query.where({ user_id: userId });

  if (pagination.page) {
    query = query.limit(pagination.perPage).offset(pagination.perPage * (pagination.page - 1));
  }

  console.log(query.toSQL().toNative());

  return await query.select("*");
};

exports.attach = async (userId, advancementId) => {
  return await mysql(PIVOT_TABLE).insert({ user_id: userId, advancement_id: advancementId });
};

exports.findUserAdvancements = async (userId, options = {}) => {
  const { type } = get(options, "filter", {});
  let query = mysql(PIVOT_TABLE)
    .join(TABLE, `${PIVOT_TABLE}.advancement_id`, `${TABLE}.id`)
    .where({ user_id: userId });
  if (type) query = query.where({ type });
  return await query.select("*");
};

exports.findUserAdvancementsByPlatformId = async (platformId, options = {}) => {
  const { type } = get(options, "filter", {});
  let query = mysql(PIVOT_TABLE)
    .join(TABLE, `${PIVOT_TABLE}.advancement_id`, `${TABLE}.id`)
    .where({ user_id: platformSubquey(platformId) })
    .orderBy([{ column: "order", order: "asc" }]);
  if (type) query = query.where({ type });
  return await query.select("*");
};

/**
 * 大多操作藉由 Line userId 取得資料
 * 因此需要到 User 表中找出 userId 的 subQuery
 * 提供這張表 where 條件
 * @param {String} userId Line user id
 */
function platformSubquey(userId) {
  return mysql.first("No").from("User").where({ platformId: userId });
}
