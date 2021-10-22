const worldBossLogModel = require("../model/application/WorldBossLog");

exports.findByUserId = worldBossLogModel.findByUserId;

/**
 * 取得用戶的世界BOSS戰紀錄筆數
 */
exports.getCountByUserId = async (userId, options = {}) => {
  let data = await worldBossLogModel.findByUserId(userId, options);
  return data.length;
};

exports.create = worldBossLogModel.create;

/**
 * 透過 event_id 取得剩下血量
 */
exports.getRemainHpByEventId = worldBossLogModel.getTotalDamageByEventId;

/**
 * 取得某個活動的前十名 (排名)
 */
exports.getTopTen = worldBossLogModel.getTopTen;
