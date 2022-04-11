const worldBossUserAttackMessageModel = require("../model/application/WorldBossUserAttackMessage");
const redis = require("../util/redis");

exports.all = async (cache = true) => {
  let key = "worldBossUserAttackMessage";
  let data = await redis.get(key);
  if (data && cache) {
    return JSON.parse(data);
  }

  let result = await worldBossUserAttackMessageModel.all();
  redis.set(key, JSON.stringify(result));
  return result;
};

exports.find = worldBossUserAttackMessageModel.find;

exports.delete = async id => {
  let result = await worldBossUserAttackMessageModel.delete(id);
  redis.del("worldBossUserAttackMessage");
  return result;
};

exports.update = async (id, attributes) => {
  let result = await worldBossUserAttackMessageModel.update(id, attributes);
  redis.del("worldBossUserAttackMessage");
  return result;
};

exports.create = async attributes => {
  let result = await worldBossUserAttackMessageModel.create(attributes);
  redis.del("worldBossUserAttackMessage");
  return result;
};
