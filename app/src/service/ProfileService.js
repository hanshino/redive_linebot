const redis = require("../util/redis");
const UserModel = require("../model/application/UserModel");
const { DefaultLogger } = require("../util/Logger");

const REDIS_KEY = userId => `profile:${userId}`;
const PROFILE_CACHE_TTL_SEC = 30 * 60;
// Short TTL so a transient LINE outage doesn't pin a synthesised name for 30 min.
const FALLBACK_CACHE_TTL_SEC = 60;

function fallbackProfile(userId) {
  return {
    displayName: `User-${userId.slice(-4)}`,
    pictureUrl: null,
  };
}

async function readProfileFromRedis(userId) {
  try {
    const cached = await redis.get(REDIS_KEY(userId));
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    DefaultLogger.warn(`Profile redis error for ${userId}: ${e && e.message}`);
    return null;
  }
}

function writeProfileToRedis(userId, profile, ttlSec = PROFILE_CACHE_TTL_SEC) {
  return redis
    .set(REDIS_KEY(userId), JSON.stringify(profile), { EX: ttlSec })
    .catch(e => DefaultLogger.warn(`Profile redis write failed for ${userId}: ${e && e.message}`));
}

/**
 * Best-effort display-name resolver for response payloads that just need
 * something to render. Reads Redis -> MySQL -> synthesised fallback. Does
 * NOT hit the LINE API — that's reserved for `GET /api/profile/:userId`
 * where the latency budget allows it.
 */
async function resolveDisplayName(userId) {
  if (!userId) return null;

  const cached = await readProfileFromRedis(userId);
  if (cached && cached.displayName) return cached.displayName;

  try {
    const profile = await UserModel.getProfile(userId);
    if (profile && profile.displayName) {
      writeProfileToRedis(userId, profile);
      return profile.displayName;
    }
  } catch (e) {
    DefaultLogger.warn(`Profile DB error for ${userId}: ${e && e.message}`);
  }

  return fallbackProfile(userId).displayName;
}

module.exports = {
  REDIS_KEY,
  PROFILE_CACHE_TTL_SEC,
  FALLBACK_CACHE_TTL_SEC,
  fallbackProfile,
  readProfileFromRedis,
  writeProfileToRedis,
  resolveDisplayName,
};
