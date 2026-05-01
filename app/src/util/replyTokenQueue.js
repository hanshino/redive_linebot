const redis = require("./redis");

// LINE reply tokens are valid for ~60 seconds. We keep newest 5 per source and
// drop anything older than 55s so we never hand out an about-to-expire token.
const KEY = sourceId => `REPLY_TOKEN_QUEUE_${sourceId}`;
const FRESHNESS_MS = 55000;
const KEEP_NEWEST = 5;

async function saveToken(sourceId, token, timestamp) {
  if (!sourceId || !token) return;
  const score = Number.isFinite(timestamp) ? timestamp : Date.now();
  const key = KEY(sourceId);
  await redis.zAdd(key, { score, value: token });
  await redis.zRemRangeByRank(key, 0, -(KEEP_NEWEST + 1));
  await redis.zRemRangeByScore(key, 0, score - FRESHNESS_MS);
  await redis.expire(key, Math.ceil(FRESHNESS_MS / 1000));
}

async function pullFreshToken(sourceId) {
  if (!sourceId) return null;
  const key = KEY(sourceId);
  const min = Date.now() - FRESHNESS_MS;
  const fresh = await redis.zRangeByScore(key, min, "+inf");
  if (!fresh || fresh.length === 0) return null;
  const token = fresh[fresh.length - 1];
  await redis.zRem(key, token);
  return token;
}

module.exports = { saveToken, pullFreshToken, KEY, FRESHNESS_MS, KEEP_NEWEST };
