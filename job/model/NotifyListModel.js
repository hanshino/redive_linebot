const mysql = require("../lib/mysql");
const redis = require("../lib/redis");
const NOTIFY_LIST_TABLE = "notify_list";
const SUB_TYPE_TABLE = "subscribe_type";
const SUB_TYPE_REDIS_KEY = "SUBSCRIBE_TYPES";
const NOTIFY_USER_REDIS_KEY = "NOTIFY_USER_QUEUE";
const SENT_TABLE = "sent_bulletin";
const BULLETIN_TABLE = "BulletIn";
exports.PASSIVE_PREFIX = "PassiveNotify_";
exports.REPLY_TOKEN_PREFIX = "ReplyToken_";

/**
 * 取得通知列表
 * @returns {Promise<Array<{token: String, subType: Number, userId: String}>>}
 */
exports.getList = async () => {
  return mysql
    .select(["token", { subType: "sub_type" }, { userId: "platformId" }])
    .from(`${NOTIFY_LIST_TABLE} as nl`)
    .join("User", "User.No", "nl.id")
    .where({ type: 1 })
    .where("nl.status", 1);
};

/**
 * 取得訂閱類型清單
 */
exports.getSubTypes = async () => {
  let data = await redis.get(SUB_TYPE_REDIS_KEY);
  if (data) return data;

  data = await mysql
    .select([{ key: "type" }, "title", "description"])
    .from(SUB_TYPE_TABLE)
    .orderBy("id");

  await redis.set(SUB_TYPE_REDIS_KEY, data, 86400);
  return data;
};

/**
 * 新增至待發送區
 * @param {Object} param
 * @param {String} param.token
 * @param {String} param.message
 * @param {?String} param.type
 * - -1: 預設
 * - 1: 公主連結消息
 * - 2: 最新消息
 * - 3: 等級系統消息
 */
exports.insertNotifyList = ({ token, message, type }) => {
  return redis.enqueue(NOTIFY_USER_REDIS_KEY, JSON.stringify({ token, message, type }), 10 * 60);
};

/**
 * 消化待發送區
 * @returns {Promise<{token: String, message: String, type: Number}>}
 */
exports.consumeNotifyList = () => {
  return redis.dequeue(NOTIFY_USER_REDIS_KEY).then(data => (data ? JSON.parse(data) : null));
};

/**
 * 取得需要發送的訊息
 * @returns {Promise<Array<{id: Number, title: String, sort: String, p: String}>>}
 */
exports.getLatestNews = async () => {
  let rows = await mysql.select("id").from(SENT_TABLE).orderBy("id", "desc").limit(1);
  let { id: latestId } = rows[0] || { id: 0 };

  return await mysql.select("*").from(BULLETIN_TABLE).where("id", ">", latestId);
};

/**
 * 紀錄發送過的ID
 * @param {Number} id 之後會以此id為基準，比此大的才會發送
 */
exports.recordSentId = id => {
  return mysql.insert({ id }).into(SENT_TABLE);
};

/**
 * 設置被動通知
 * @param {String} sourceId 來源ID
 * @param {Object} message 訊息物件
 */
exports.setPassiveNotify = (sourceId, message) => {
  let key = `${this.PASSIVE_PREFIX}${sourceId}`;
  return redis.set(key, message, 86400);
};
