const mysql = require("../../util/mysql");
const TABLE = "advancement";
const PIVOT_TABLE = "user_has_advancements";
const { pick, get, chunk } = require("lodash");

const fillable = ["name", "type", "description", "icon", "order"];

exports.find = async id => {
  return await mysql.first().from(TABLE).where({ id });
};

exports.create = async (attributes = {}) => {
  let data = pick(attributes, fillable);
  return await mysql(TABLE).insert(data);
};

exports.all = async (options = {}) => {
  const { userId, name } = get(options, "filter", {});
  const pagination = get(options, "pagination", {});
  let query = mysql(TABLE);

  if (userId) query = query.where({ user_id: userId });
  if (name) query = query.where("name", "like", `%${name}%`);

  if (pagination.page) {
    query = query.limit(pagination.perPage).offset(pagination.perPage * (pagination.page - 1));
  }

  return await query.select("*");
};

exports.attach = async (userId, advancementId) => {
  return await mysql(PIVOT_TABLE).insert({ user_id: userId, advancement_id: advancementId });
};

exports.attachManyByPlatformId = async (advancementId, users) => {
  const trx = await mysql.transaction();
  try {
    const piece = chunk(users, 50);
    for (let i = 0; i < piece.length; i++) {
      await trx(PIVOT_TABLE)
        .insert(function () {
          this.select(["No", trx.raw(advancementId)])
            .from("User")
            .whereIn("platformId", piece[i]);
        })
        .into(trx.raw("?? (??, ??)", ["user_has_advancements", "user_id", "advancement_id"]));
    }
  } catch (e) {
    await trx.rollback();
    throw e;
  }

  await trx.commit();
  return true;
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
