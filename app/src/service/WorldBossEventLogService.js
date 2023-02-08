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
 * 取得某個活動的排名
 */
exports.getTopRank = worldBossLogModel.getTopRank;

/**
 * 取得今日是否已經登錄過
 */
exports.isTodayLogged = async userId => {
  const filter = {
    created_start_at: new Date(new Date().setHours(0, 0, 0, 0)),
    created_end_at: new Date(new Date().setHours(23, 59, 59, 999)),
  };

  const data = await worldBossLogModel.findByUserId(userId, { filter });
  return data.length > 0;
};

/**
 * 取得今日登錄的紀錄
 * @param {String} userId
 * @returns {Promise<Array>}
 */
exports.getTodayLogs = async userId => {
  const filter = {
    created_start_at: new Date(new Date().setHours(0, 0, 0, 0)),
    created_end_at: new Date(new Date().setHours(23, 59, 59, 999)),
  };

  const data = await worldBossLogModel.findByUserId(userId, { filter });
  return data;
};

/**
 * 取得今日登錄的紀錄次數
 * @param {String} userId
 * @returns {Promise<Number>}
 */
exports.getTodayAttackCount = async userId => {
  const data = await this.getTodayLogs(userId);
  return data.length;
};
