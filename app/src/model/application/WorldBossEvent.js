const mysql = require("../../util/mysql");
const WorldBoss = require("./WorldBoss");
const WorldBossLog = require("./WorldBossLog");
const TABLE = "world_boss_event";
const fillable = [
  "world_boss_id",
  "announcement",
  "start_time",
  "end_time",
  "status",
  "killed_at",
  "settled_at",
];
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

/**
 * 取得當前進行中的世界王 (status=active 且 now 落在 start_time~end_time)
 * @returns {Promise<Object|null>}
 */
exports.getActive = async () => {
  const row = await mysql(TABLE)
    .select("*")
    .where({ status: "active" })
    .andWhere("start_time", "<=", mysql.raw("now()"))
    .andWhere("end_time", ">=", mysql.raw("now()"))
    .orderBy("id", "desc")
    .first();
  return row || null;
};

/**
 * 取得已擊殺但尚未結算的活動 (status=killed 且 settled_at IS NULL)
 * @returns {Promise<Array<Object>>}
 */
exports.getKilledUnsettled = async () => {
  return await mysql(TABLE).select("*").where({ status: "killed" }).whereNull("settled_at");
};

/**
 * 取得逾時但仍為 active 的活動 (status=active 且 end_time < now)
 * @returns {Promise<Array<Object>>}
 */
exports.getOverdueActive = async () => {
  return await mysql(TABLE)
    .select("*")
    .where({ status: "active" })
    .andWhere("end_time", "<", mysql.raw("now()"));
};

/**
 * 原子狀態轉移: UPDATE ... SET status=to, ...extra WHERE id=? AND status=from
 * @param {Number} eventId
 * @param {String} fromStatus
 * @param {String} toStatus
 * @param {Object} [extra] 額外要一併寫入的欄位 (例如 killed_at)
 * @returns {Promise<Boolean>} 受影響列數為 1 時為 true (本呼叫贏得競態)
 */
exports.casStatus = async (eventId, fromStatus, toStatus, extra = {}) => {
  const affected = await mysql(TABLE)
    .where({ id: eventId, status: fromStatus })
    .update(Object.assign({ status: toStatus }, extra));
  return affected === 1;
};

/**
 * 不 JOIN world_boss 的單筆查詢 (find() 會 INNER JOIN, 無法讀孤兒活動)
 * @param {Number} id
 * @returns {Promise<Object|undefined>}
 */
exports.findRaw = async id => {
  return await mysql(TABLE).where({ id }).first();
};

/**
 * 原子標記結算完成: UPDATE ... SET settled_at=now() WHERE id=? AND settled_at IS NULL
 * @param {Number} eventId
 * @returns {Promise<Boolean>} 受影響列數為 1 時為 true (本呼叫取得結算權)
 */
exports.markSettled = async eventId => {
  const affected = await mysql(TABLE)
    .where({ id: eventId })
    .whereNull("settled_at")
    .update({ settled_at: mysql.raw("now()") });
  return affected === 1;
};

function worldBoss(query) {
  return query.join(WorldBoss.table, `${TABLE}.world_boss_id`, "=", `${WorldBoss.table}.id`);
}

async function histories(world_boss_event_id) {
  return await mysql(WorldBossLog.table).select("*").where({ world_boss_event_id });
}
