const MinigameModel = require("../model/application/MinigameLevel");
const MinigameUnitModel = require("../model/application/MinigameLevelUnit");
const redis = require("../util/redis");

exports.findByUserId = MinigameModel.findByUserId;

exports.createByUserId = MinigameModel.createByUserId;

exports.updateByUserId = MinigameModel.updateByUserId;

exports.defaultData = { level: 1, exp: 0 };

/**
 * @returns {Promise<Array<MinigameLevelUnit>>}
 */
exports.getLevelUnit = async function () {
  // 優先使用 redis 的資料
  let data = await redis.get("minigame_level_unit");
  if (data) {
    return data;
  }

  // 如果 redis 沒有資料，則從資料庫取得
  data = await MinigameUnitModel.all();

  // 將資料存到 redis
  redis.set("minigame_level_unit", data);

  return data;
};

/**
 * @typedef {Object} MinigameLevelUnit
 * @property {number} level
 * @property {number} max_exp
 */
