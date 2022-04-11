const worldBossEventModel = require("../model/application/WorldBossEvent");
const redis = require("../util/redis");
const config = require("config");
const get = require("lodash/get");
const retriveMessageMax = 50;

exports.all = worldBossEventModel.all;

exports.find = worldBossEventModel.find;

exports.create = worldBossEventModel.create;

exports.update = (id, attributes) => {
  // 必須先把 redis 的資料刪除
  redis.del(`bossInformation:${id}`);
  return worldBossEventModel.update(id, attributes);
};

exports.destroy = id => {
  // 必須先把 redis 的資料刪除
  redis.del(`bossInformation:${id}`);
  return worldBossEventModel.destroy(id);
};

exports.getEventBoss = async eventId => {
  let eventBoss = await worldBossEventModel.find(eventId);
  return eventBoss;
};

exports.getBossInformation = async eventId => {
  // 優先使用 redis 的資料
  let bossInformation = await redis.get(`bossInformation:${eventId}`);

  if (bossInformation) {
    return JSON.parse(bossInformation);
  }

  // 如果 redis 沒有資料，則從資料庫取得
  let eventBoss = await worldBossEventModel.find(eventId, { withs: ["boss"] });

  if (eventBoss) {
    // 儲存 redis
    await redis.set(`bossInformation:${eventId}`, JSON.stringify(eventBoss), {
      EX: 60 * 60 * 24,
    });
    return eventBoss;
  }

  return null;
};

exports.getCurrentEvent = async () => {
  return await this.all({
    filters: [
      ["start_time", "<", new Date()],
      ["end_time", ">", new Date()],
    ],
  });
};

/**
 * 這是為了要避免打擾玩家，因此把打王訊息做暫存
 * 等待一段時間後，再一次把訊息做回應
 * @param {Number} eventId
 * @param {String} message
 * @param {Object} options
 * @param {String} options.identify
 */
exports.keepAttackMessage = async (eventId, message, options = {}) => {
  let identify = get(options, "identify", "default");
  let key = `${config.get("redis.keys.worldBossAttackMessageKeeping")}_${eventId}_${identify}`;
  return await redis.lPush(key, message, 60 * 60 * 24);
};

/**
 * 取得打王訊息
 * @param {Number} eventId
 * @param {Object} options
 * @param {String} options.identify
 */
exports.getAttackMessage = async (eventId, options = {}) => {
  let identify = get(options, "identify", "default");
  const key = `${config.get("redis.keys.worldBossAttackMessageKeeping")}_${eventId}_${identify}`;
  const messages = [];

  // 將 redis 的資料全部拿出來
  let count = 0;
  while (count < retriveMessageMax) {
    let message = await redis.rPop(key);
    if (message) {
      messages.push(message);
    } else {
      break;
    }

    count++;
  }

  return messages;
};
