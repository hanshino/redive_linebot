const worldBossUserAttackMessageModel = require("../model/application/WorldBossUserAttackMessage");
const redis = require("../util/redis");

exports.all = async (cache = true) => {
  let key = "worldBossUserAttackMessage";
  let data = await redis.get(key);
  if (data && cache) {
    return data;
  }

  let result = await worldBossUserAttackMessageModel.all();
  redis.set(key, result);
  return result;
};
