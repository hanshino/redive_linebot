const mysql = require("../../util/mysql");
const WorldBoss = require("./WorldBoss");
const WorldBossLog = require("./WorldBossLog");
const TABLE = "world_boss_event";

exports.table = TABLE;

/**
 *
 * @param {Object} options
 * @param {Array} options.withs
 * @param {Array} options.filters
 * @returns
 */
exports.all = async (options = {}) => {
  const { withs = [], filters = [] } = options;
  let query = mysql(this.table).select("*");

  if (withs.includes("worldBoss")) {
    query = worldBoss(query);
  }

  // 如果有指定 options.filter 則添加過濾條件
  if (filters.length > 0) {
    // 批次添加過濾條件
    filters.forEach(filter => (query = query.where(...filter)));
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

function worldBoss(query) {
  return query.join(WorldBoss.table, `${TABLE}.world_boss_id`, "=", `${WorldBoss.table}.id`);
}

async function histories(world_boss_event_id) {
  return await mysql(WorldBossLog.table).select("*").where({ world_boss_event_id });
}
