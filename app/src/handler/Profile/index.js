const { getClient } = require("bottender");
const UserModel = require("../../model/application/UserModel");
const { DefaultLogger } = require("../../util/Logger");
const {
  readProfileFromRedis,
  writeProfileToRedis,
  fallbackProfile,
  FALLBACK_CACHE_TTL_SEC,
} = require("../../service/ProfileService");

// LINE profile latency is regularly 300-800ms from Asia regions. The
// webhook-side middleware caps at 200ms to keep the reply budget tight,
// but the API endpoint has a more relaxed budget and can afford to wait.
const LINE_PROFILE_TIMEOUT_MS = 2000;

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
  const cached = await readProfileFromRedis(userId);
  if (cached) {
    return res.json({ userId, ...cached });
  }

  // Layer 2: MySQL user table
  try {
    const dbProfile = await UserModel.getProfile(userId);
    if (dbProfile) {
      writeProfileToRedis(userId, dbProfile);
      return res.json({ userId, ...dbProfile });
    }
  } catch (e) {
    DefaultLogger.warn(`Profile DB error for ${userId}: ${e && e.message}`);
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
    Promise.resolve(UserModel.updateProfile(userId, profile)).catch(() => {});
    return res.json({ userId, ...result });
  } catch (e) {
    DefaultLogger.warn(`Profile LINE error for ${userId}: ${e && e.message}`);
  }

  // Fallback — cache briefly so a hammered unknown userId doesn't keep
  // paying the full MySQL+LINE timeout budget on every retry.
  const fallback = fallbackProfile(userId);
  writeProfileToRedis(userId, fallback, FALLBACK_CACHE_TTL_SEC);
  return res.json({ userId, ...fallback });
};
