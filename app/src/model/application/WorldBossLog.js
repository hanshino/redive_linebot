const mysql = require("../../util/mysql");
const { pick } = require("lodash");
const TABLE = "world_boss_event_log";
const base = require("../base");

class WorldBossLog extends base {
  async getAllLogsByDate(id, { startAt, endAt }) {
    return await this.knex
      .select("*")
      .where({
        user_id: id,
      })
      .whereBetween("created_at", [startAt, endAt])
      .orderBy("created_at", "desc");
  }

  async getBossLogs(id, { limit }) {
    return await this.knex
      .select([
        "world_boss_event_id",
        {
          name: "world_boss.name",
        },
      ])
      .sum({ total_damage: "damage" })
      .where({
        user_id: id,
      })
      .groupBy("world_boss_event_id")
      .orderBy("world_boss_event_id", "desc")
      .join("world_boss_event", "world_boss_event_id", "world_boss_event.id")
      .join("world_boss", "world_boss_event.world_boss_id", "world_boss.id")
      .limit(limit);
  }

  /**
   * 取得某個用戶的最大傷害
   * @param {Number} userId
   * @returns {Promise<{max: Number}>}
   */
  async getUserMaxDamage(userId) {
    return await this.knex
      .max({
        max: "damage",
      })
      .first()
      .where({
        user_id: userId,
      });
  }

  /**
   * 取得某用戶參與過的所有世界王次數
   * @param {Number} userId
   * @returns {Promise<{count: Number}>}
   */
  async getUserAttendance(userId) {
    // SELECT count(*) AS times FROM ( SELECT `user_id` FROM `world_boss_event_log` WHERE `user_id` = 1 GROUP BY `world_boss_event_id`, `user_id` ) AS t;
    let subQuery = this.knex
      .select("user_id")
      .where({
        user_id: userId,
      })
      .groupBy("world_boss_event_id", "user_id")
      .as("t");

    return await this.knex
      .count({
        count: "user_id",
      })
      .first()
      .from(subQuery);
  }

  /**
   * 取得用戶某天的 cost 量
   * @param {Number} userId
   * @param {Object} param1
   * @param {String} param1.startAt
   * @param {String} param1.endAt
   * @returns {Promise<{totalCost: Number}>}
   */
  async countCostByDate(userId, { startAt, endAt }) {
    return await this.knex
      .sum("cost as totalCost")
      .where({
        user_id: userId,
      })
      .whereBetween("created_at", [startAt, endAt])
      .first();
  }
}

exports.table = TABLE;
exports.model = new WorldBossLog({
  table: TABLE,
  fillable: [
    "world_boss_event_id",
    "user_id",
    "action_type",
    "damage",
    "cost",
    "role",
    "contribution",
  ],
});

exports.all = async () => {
  return await mysql(TABLE).select("*");
};

/**
 * 新增紀錄
 * @param {Object} attributes 屬性
 * @param {String} attributes.user_id 使用者 user_id
 * @param {String} attributes.world_boss_event_id 活動 world_boss_event_id
 * @param {String} attributes.action_type 攻擊類型
 * @param {Number} attributes.damage 傷害
 * @param {Number} attributes.cost 花費
 */
exports.create = async attributes => {
  attributes = pick(attributes, [
    "user_id",
    "world_boss_event_id",
    "action_type",
    "damage",
    "cost",
  ]);
  return await mysql(TABLE).insert(attributes);
};

exports.findByUserId = async (user_id, options = {}) => {
  let query = mysql(TABLE)
    .select("*")
    .where("user_id", user_id)
    .orderBy("created_at", "desc")
    .limit(options.limit || 10)
    .offset(options.offset || 0);

  const { filter = {} } = options;
  if (filter.created_start_at) {
    query = query.where("created_at", ">=", filter.created_start_at);
  }
  if (filter.created_end_at) {
    query = query.where("created_at", "<=", filter.created_end_at);
  }
  if (filter.world_boss_event_id) {
    query = query.where("world_boss_event_id", filter.world_boss_event_id);
  }

  return await query;
};

exports.getTotalDamageByEventId = async event_id => {
  return await mysql(TABLE)
    .where("world_boss_event_id", event_id)
    .sum("damage as total_damage")
    .first();
};

/**
 * 取得某個活動排名
 */
exports.getTopRank = async ({ eventId, limit }) => {
  return await mysql(TABLE)
    .select(mysql.raw("sum(`damage`) as `total_damage`, `user`.`platform_id` as `userId`"))
    .join("user", "world_boss_event_log.user_id", "user.id")
    .where("world_boss_event_id", eventId)
    .groupBy("user_id")
    .orderBy("total_damage", "desc")
    .limit(limit);
};

/**
 * 寫入帶職業 + 貢獻分的攻擊紀錄 (LOCK §E)
 * @param {Object} attrs
 * @param {Number} attrs.user_id 內部數字 user.id
 * @param {Number} attrs.world_boss_event_id
 * @param {String} attrs.role dps|healer|tank
 * @param {String} attrs.action_type
 * @param {Number} attrs.damage
 * @param {Number} attrs.cost
 * @param {Number} attrs.contribution
 * @param {import("knex").Knex.Transaction} [trx]
 * @returns {Promise<Array<Number>>}
 */
exports.createWithRole = async (
  { user_id, world_boss_event_id, role, action_type, damage, cost, contribution },
  trx
) => {
  const db = trx || mysql;
  return await db(TABLE).insert({
    user_id,
    world_boss_event_id,
    role,
    action_type,
    damage,
    cost,
    contribution,
  });
};

/**
 * 取得近期攻擊者 (供 enrage 批次擊倒); 同時回傳數字 id 與 platform_id (LOCK §B)
 * @param {Object} param
 * @param {Number} param.eventId
 * @param {Number} param.minutes 視窗 (分鐘)
 * @param {Number} param.limit
 * @returns {Promise<Array<{user_id: Number, platform_id: String}>>}
 */
exports.getRecentAttackers = async ({ eventId, minutes, limit }) => {
  return await mysql(TABLE)
    .select({ user_id: "world_boss_event_log.user_id", platform_id: "user.platform_id" })
    .join("user", "world_boss_event_log.user_id", "user.id")
    .where("world_boss_event_id", eventId)
    .andWhere(
      "world_boss_event_log.created_at",
      ">=",
      mysql.raw("now() - interval ? minute", [minutes])
    )
    .orderBy("world_boss_event_log.created_at", "desc")
    .limit(limit);
};

/**
 * 支援職業參與比 = (有 >=1 次 healer|tank 行動的人) / (有 >=1 次行動的人); 無行動回傳 0
 * 同一定義供 M5 冷啟動縮放與 M7 稀缺加成共用 (addendum §15)
 * @param {Number} eventId
 * @returns {Promise<Number>}
 */
exports.getSupportRatio = async eventId => {
  const totalRow = await mysql(TABLE)
    .countDistinct({ c: "user_id" })
    .where("world_boss_event_id", eventId)
    .first();
  const total = Number(totalRow.c || 0);
  if (total === 0) return 0;

  const supportRow = await mysql(TABLE)
    .countDistinct({ c: "user_id" })
    .where("world_boss_event_id", eventId)
    .whereIn("role", ["healer", "tank"])
    .first();
  const support = Number(supportRow.c || 0);
  return support / total;
};

/**
 * 傷害榜: GROUP BY user_id, SUM(damage) desc; 回傳數字 id + platform_id (LOCK §B)
 * @param {Object} param
 * @param {Number} param.eventId
 * @param {Number} param.limit
 * @returns {Promise<Array<{user_id: Number, platform_id: String, total_damage: Number}>>}
 */
exports.getDamageRank = async ({ eventId, limit }) => {
  return await mysql(TABLE)
    .select({ user_id: "world_boss_event_log.user_id", platform_id: "user.platform_id" })
    .sum({ total_damage: "damage" })
    .join("user", "world_boss_event_log.user_id", "user.id")
    .where("world_boss_event_id", eventId)
    .groupBy("world_boss_event_log.user_id", "user.platform_id")
    .orderBy("total_damage", "desc")
    .limit(limit);
};

/**
 * 職業貢獻榜 (依 role 過濾): GROUP BY user_id, SUM(contribution) desc; 回傳兩種 id (LOCK §B)
 * @param {Object} param
 * @param {Number} param.eventId
 * @param {String} param.role dps|healer|tank
 * @param {Number} param.limit
 * @returns {Promise<Array<{user_id: Number, platform_id: String, total_contribution: Number}>>}
 */
exports.getContributionRank = async ({ eventId, role, limit }) => {
  return await mysql(TABLE)
    .select({ user_id: "world_boss_event_log.user_id", platform_id: "user.platform_id" })
    .sum({ total_contribution: "contribution" })
    .join("user", "world_boss_event_log.user_id", "user.id")
    .where("world_boss_event_id", eventId)
    .andWhere("role", role)
    .groupBy("world_boss_event_log.user_id", "user.platform_id")
    .orderBy("total_contribution", "desc")
    .limit(limit);
};

/**
 * 取得參與者 (有 >=1 筆紀錄的不重複玩家); 回傳兩種 id (供參與獎發放)
 * @param {Number} eventId
 * @returns {Promise<Array<{user_id: Number, platform_id: String}>>}
 */
exports.getParticipants = async eventId => {
  return await mysql(TABLE)
    .distinct({ user_id: "world_boss_event_log.user_id", platform_id: "user.platform_id" })
    .join("user", "world_boss_event_log.user_id", "user.id")
    .where("world_boss_event_id", eventId);
};

/**
 * 將結算彙總出的數字 user.id 反查為 platform_id (供發放); 找不到 user 列者略過 (LOCK §B)
 * @param {Array<Number>} numericIds
 * @returns {Promise<Map<Number, String>>}
 */
exports.resolveUserIds = async numericIds => {
  const map = new Map();
  if (!Array.isArray(numericIds) || numericIds.length === 0) return map;

  const rows = await mysql("user")
    .select({ id: "id", platform_id: "platform_id" })
    .whereIn("id", numericIds);

  rows.forEach(row => map.set(row.id, row.platform_id));
  return map;
};
