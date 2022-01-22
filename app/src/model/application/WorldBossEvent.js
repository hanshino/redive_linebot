const mysql = require("../../util/mysql");
const WorldBoss = require("./WorldBoss");
const WorldBossLog = require("./WorldBossLog");
const TABLE = "world_boss_event";
const fillable = ["world_boss_id", "announcement", "start_time", "end_time"];
const pick = require("lodash/pick");

exports.table = TABLE;

/**
 *
 * @param {Object} options
 * @param {Array} options.withs
 * @param {Array} options.filters
 * @param {Array<{column: String, order: String}>}  options.sort
 * @returns
 */
exports.all = async (options = {}) => {
  const { withs = [], filters = [], sort = [] } = options;
  let query = mysql(this.table).select("*");

  if (withs.includes("worldBoss")) {
    query = worldBoss(query);
  }

  // 如果有指定 options.filter 則添加過濾條件
  if (filters.length > 0) {
    // 批次添加過濾條件
    filters.forEach(filter => (query = query.where(...filter)));
  }

  if (sort) {
    query.orderBy(sort);
  }

  return await query;
};

/**
 * 取得指定世界boss的事件
 * @param {Number} id
 * @returns {Promise<Object>}
 */
exports.find = async (id, options = {}) => {
  const { withs = [] } = options;
  let query = mysql(this.table).select("*").where(`${this.table}.id`, id);
  query = worldBoss(query).first();

  let result = await query;

  if (withs.indexOf("histories") > -1) {
    result.histories = await histories(result.id);
  }

  return result;
};

exports.create = async attributes => {
  let data = pick(attributes, fillable);
  return await mysql(this.table).insert(data);
};

exports.update = async (id, attributes) => {
  let data = pick(attributes, fillable);
  return await mysql(this.table).where({ id }).update(data);
};

exports.destroy = async id => {
  return await mysql(this.table).where({ id }).delete();
};

function worldBoss(query) {
  return query.join(WorldBoss.table, `${TABLE}.world_boss_id`, "=", `${WorldBoss.table}.id`);
}

async function histories(world_boss_event_id) {
  return await mysql(WorldBossLog.table).select("*").where({ world_boss_event_id });
}
