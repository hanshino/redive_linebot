const { getClient } = require("bottender");
const redis = require("../../util/redis");
const UserModel = require("../../model/application/UserModel");
const { DefaultLogger } = require("../../util/Logger");

const REDIS_KEY = userId => `profile:${userId}`;
const REDIS_TTL_SEC = 30 * 60;
const LINE_PROFILE_TIMEOUT_MS = 200;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("LINE profile timeout")), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function fallback(userId) {
  return {
    userId,
    displayName: `User-${userId.slice(-4)}`,
    pictureUrl: null,
  };
}

function writeProfileToRedis(userId, profile) {
  try {
    const result = redis.set(REDIS_KEY(userId), JSON.stringify(profile), { EX: REDIS_TTL_SEC });
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    /* best effort */
  }
}

/**
 * GET /api/profile/:userId
 * Three-layer cache resolver: Redis -> MySQL -> LINE API -> fallback.
 * Never returns 5xx; the final fallback synthesises a display name from the
 * tail of the userId so the UI always has something to render.
 */
exports.getProfile = async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ message: "missing userId" });
  }

  // Layer 1: Redis
  try {
    const cached = await redis.get(REDIS_KEY(userId));
    if (cached) {
      const parsed = JSON.parse(cached);
      return res.json({ userId, ...parsed });
    }
  } catch (e) {
    DefaultLogger.warn(`Profile redis miss for ${userId}: ${e.message}`);
  }

  // Layer 2: MySQL user table
  try {
    const dbProfile = await UserModel.getProfile(userId);
    if (dbProfile) {
      writeProfileToRedis(userId, dbProfile);
      return res.json({ userId, ...dbProfile });
    }
  } catch (e) {
    DefaultLogger.warn(`Profile DB miss for ${userId}: ${e.message}`);
  }

  // Layer 3: LINE API (with timeout)
  try {
    const lineClient = getClient("line");
    const profile = await withTimeout(lineClient.getUserProfile(userId), LINE_PROFILE_TIMEOUT_MS);
    const result = {
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl || null,
    };
    writeProfileToRedis(userId, result);
    try {
      const updateResult = UserModel.updateProfile(userId, profile);
      if (updateResult && typeof updateResult.catch === "function") {
        updateResult.catch(() => {});
      }
    } catch {
      /* best effort */
    }
    return res.json({ userId, ...result });
  } catch (e) {
    DefaultLogger.warn(`Profile LINE API miss for ${userId}: ${e.message}`);
  }

  // Fallback
  return res.json(fallback(userId));
};
