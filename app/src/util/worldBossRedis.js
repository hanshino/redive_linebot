const redis = require("./redis");

const keys = {
  pool: eventId => `wb:pool:${eventId}`,
  shield: (eventId, platformId) => `wb:shield:${eventId}:${platformId}`,
  block: eventId => `wb:block:${eventId}`,
};

/**
 * 將玩家加入待救池（ZSET，score = 被擊倒的 timestamp ms）。member 一律為 platform_id。
 * @param {Number} eventId
 * @param {String} platformId
 * @param {Number} ts
 * @returns {Promise<void>}
 */
async function poolAdd(eventId, platformId, ts) {
  await redis.zAdd(keys.pool(eventId), { score: ts, value: platformId });
}

/**
 * 從待救池撈出最久未救的 count 人（ZPOPMIN），回傳 platform_id 字串陣列。
 * 空池回 []；單筆物件回傳時正規化為陣列。
 * @param {Number} eventId
 * @param {Number} count
 * @returns {Promise<String[]>}
 */
async function poolPopMin(eventId, count) {
  const reply = await redis.zPopMinCount(keys.pool(eventId), count);
  if (!reply) {
    return [];
  }
  const arr = Array.isArray(reply) ? reply : [reply];
  return arr.map(item => item.value);
}

/**
 * 取得玩家在待救池的 score（被擊倒的 ts），不存在回 null。
 * @param {Number} eventId
 * @param {String} platformId
 * @returns {Promise<Number|null>}
 */
async function poolScore(eventId, platformId) {
  const score = await redis.zScore(keys.pool(eventId), platformId);
  return score === null || score === undefined ? null : Number(score);
}

/**
 * 將玩家移出待救池（站起 / 被救 / 自然恢復）。
 * @param {Number} eventId
 * @param {String} platformId
 * @returns {Promise<void>}
 */
async function poolRemove(eventId, platformId) {
  await redis.zRem(keys.pool(eventId), platformId);
}

/**
 * 為某個被保護目標設置護盾 token，value = 發盾者 platform_id，EX ttlSec。
 * @param {Number} eventId
 * @param {String} targetPlatformId
 * @param {String} ownerPlatformId
 * @param {Number} ttlSec
 * @returns {Promise<void>}
 */
async function shieldSet(eventId, targetPlatformId, ownerPlatformId, ttlSec) {
  await redis.set(keys.shield(eventId, targetPlatformId), ownerPlatformId, { EX: ttlSec });
}

/**
 * 消耗某目標的護盾（GETDEL，原子讀取並刪除），回傳發盾者 platform_id 或 null。
 * @param {Number} eventId
 * @param {String} targetPlatformId
 * @returns {Promise<String|null>}
 */
async function shieldConsume(eventId, targetPlatformId) {
  const owner = await redis.getDel(keys.shield(eventId, targetPlatformId));
  return owner || null;
}

/**
 * 開啟格擋窗口，value = 坦克 owner platform_id，EX ttlSec。
 * @param {Number} eventId
 * @param {String} ownerPlatformId
 * @param {Number} ttlSec
 * @returns {Promise<void>}
 */
async function blockSet(eventId, ownerPlatformId, ttlSec) {
  await redis.set(keys.block(eventId), ownerPlatformId, { EX: ttlSec });
}

/**
 * 取得目前格擋窗口的擁有者 platform_id，不存在回 null。
 * @param {Number} eventId
 * @returns {Promise<String|null>}
 */
async function blockOwner(eventId) {
  const owner = await redis.get(keys.block(eventId));
  return owner || null;
}

module.exports = {
  poolAdd,
  poolPopMin,
  poolScore,
  poolRemove,
  shieldSet,
  shieldConsume,
  blockSet,
  blockOwner,
};
