const worldBossEventModel = require("../model/application/WorldBossEvent");
const redis = require("../util/redis");

exports.all = worldBossEventModel.all;

exports.find = worldBossEventModel.find;

exports.create = worldBossEventModel.create;

exports.update = worldBossEventModel.update;

exports.destroy = worldBossEventModel.destroy;

exports.getEventBoss = async eventId => {
  let eventBoss = await worldBossEventModel.find(eventId);
  return eventBoss;
};

exports.getBossInformation = async eventId => {
  // 優先使用 redis 的資料
  let bossInformation = await redis.get(`bossInformation:${eventId}`);

  if (bossInformation) {
    return bossInformation;
  }

  // 如果 redis 沒有資料，則從資料庫取得
  let eventBoss = await worldBossEventModel.find(eventId, { withs: ["boss"] });

  if (eventBoss) {
    // 儲存 redis
    await redis.set(`bossInformation:${eventId}`, eventBoss, 60 * 60 * 24);
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
