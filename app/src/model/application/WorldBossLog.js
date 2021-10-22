const mysql = require("../../util/mysql");
const { pick } = require("lodash");
const TABLE = "world_boss_event_log";

exports.table = TABLE;

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
 */
exports.create = async attributes => {
  attributes = pick(attributes, ["user_id", "world_boss_event_id", "action_type", "damage"]);
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
 * 取得某個活動的前十名 (排名)
 */
exports.getTopTen = async event_id => {
  // SELECT sum(`damage`) as `total_damage`, `User`.`platformId` FROM `world_boss_event_log` JOIN `User` ON `world_boss_event_log`.`user_id` = `User`.`No` WHERE `world_boss_event_id` = 1 GROUP BY `user_id`
  return await mysql(TABLE)
    .select(mysql.raw("sum(`damage`) as `total_damage`, `User`.`platformId` as `userId`"))
    .join("User", "world_boss_event_log.user_id", "User.No")
    .where("world_boss_event_id", event_id)
    .groupBy("user_id")
    .orderBy("total_damage", "desc")
    .limit(10);
};
