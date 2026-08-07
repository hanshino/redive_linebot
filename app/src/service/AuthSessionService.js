const crypto = require("crypto");
const { default: axios } = require("axios");
const redis = require("../util/redis");

const SESSION_COOKIE_NAME = "redive_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // fixed absolute TTL, no sliding expiration
const SESSION_KEY_PREFIX = "auth:session:";
const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const VERIFY_TIMEOUT_MS = 5000;
const LINE_ISSUER = "https://access.line.me";
const LINE_USER_ID = /^U[a-f0-9]{32}$/;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// LINE ID tokens are JWTs, normally well under 2KB. The cap is a guard on the
// outbound request body, not a validity check — anything longer cannot be a
// token we would accept anyway, so reject it before spending a call on LINE.
const MAX_ID_TOKEN_LENGTH = 4096;

/**
 * Failure classes for the ID-token exchange. The router maps `code` to a
 * status; nothing matches on message text.
 *
 *  AUTH_CONFIG      the bot is misconfigured (no LINE_LOGIN_CHANNEL_ID)  -> 503
 *  INVALID_ID_TOKEN LINE rejected it, or the payload did not check out   -> 401
 *  LINE_UNAVAILABLE LINE could not be reached / answered 5xx             -> 502
 *
 * The INVALID vs UNAVAILABLE split matters: only INVALID means "your session
 * is dead". Reporting a LINE outage as 401 would make the frontend discard a
 * perfectly good login.
 */
class AuthError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Cookie header parser. Express only exposes `req.cookies` with cookie-parser,
 * and Socket.IO hands us the raw handshake header anyway, so one shared reader
 * covers both. Writing is done through Express `res.cookie`.
 */
function parseCookies(header) {
  const out = {};
  if (typeof header !== "string" || header === "") return out;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    if (key === "" || Object.prototype.hasOwnProperty.call(out, key)) continue;

    let value = part.slice(eq + 1).trim();
    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }

  return out;
}

/**
 * Opaque session token carried by the cookie. Never a LINE credential.
 */
function readSessionToken(cookieHeader) {
  return parseCookies(cookieHeader)[SESSION_COOKIE_NAME] || null;
}

function sessionKey(token) {
  return SESSION_KEY_PREFIX + crypto.createHash("sha256").update(token).digest("hex");
}

function isSecureCookie() {
  return process.env.NODE_ENV === "production";
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecureCookie(),
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
}

/**
 * Canonical browser origin for this deployment. APP_DOMAIN is allowed to carry
 * a scheme or not (`make cf-tunnel` writes a bare host).
 */
function canonicalOrigin() {
  const raw = (process.env.APP_DOMAIN || "").trim();
  if (raw === "") return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * Boot-time sanity check, called from server.js.
 *
 * In production a missing/unparseable APP_DOMAIN leaves `canonicalOrigin()`
 * null, and since the localhost escape hatch is production-disabled, every
 * browser write and every Socket.IO handshake would then be rejected. That is
 * fail-closed rather than fail-open, so it is loud but not fatal — a hard exit
 * would take the LINE webhook down with it, which is strictly worse than a
 * degraded LIFF frontend.
 */
function checkOriginConfig() {
  if (process.env.NODE_ENV !== "production") return true;
  if (canonicalOrigin()) return true;

  console.error(
    "[auth] FATAL-ish: APP_DOMAIN is missing or unparseable (%j). No canonical " +
      "origin can be derived, so every cookie-authenticated write and every " +
      "Socket.IO handshake carrying an Origin header will be rejected with 403. " +
      "Set APP_DOMAIN to the public host, e.g. pudding.hanshino.dev",
    process.env.APP_DOMAIN
  );
  return false;
}

/**
 * Same-origin guard for cookie-authenticated requests.
 *
 * This is defence in depth, not the primary CSRF control — SameSite=Lax
 * already stops the browser attaching `redive_session` to any cross-site
 * unsafe request at all.
 *
 * A missing Origin is allowed: browsers send Origin on every non-GET/HEAD
 * request and on every WebSocket handshake, so "no Origin" means a non-browser
 * caller, which had to supply the session cookie by hand and therefore already
 * holds the secret. Rejecting it would only break curl and the supertest suite
 * without closing a hole.
 */
function isAllowedOrigin(origin) {
  if (origin === undefined || origin === null || origin === "") return true;
  if (typeof origin !== "string") return false;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const canonical = canonicalOrigin();
  if (canonical && parsed.origin === canonical) return true;

  // Dev runs the frontend on the Vite dev server, which proxies /api and
  // /socket.io to the bot while keeping the browser Origin on :3000.
  if (
    process.env.NODE_ENV !== "production" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  ) {
    return true;
  }

  return false;
}

function normalizeProfile(profile) {
  return {
    userId: profile.userId,
    displayName: typeof profile.displayName === "string" ? profile.displayName : "",
    pictureUrl: typeof profile.pictureUrl === "string" ? profile.pictureUrl : null,
  };
}

/**
 * Verify a LIFF ID token against LINE and return the normalized profile.
 * Only server-verified claims are trusted — nothing from the request body.
 *
 * @throws {AuthError} always an AuthError, so the caller can classify without
 * inspecting message strings. See the AuthError docblock for the codes.
 */
async function verifyIdToken(idToken) {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!clientId) {
    throw new AuthError("AUTH_CONFIG", "LINE_LOGIN_CHANNEL_ID is not configured");
  }

  const body = new URLSearchParams({ id_token: idToken, client_id: clientId });

  let data;
  try {
    ({ data } = await axios.post(VERIFY_URL, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: VERIFY_TIMEOUT_MS,
    }));
  } catch (err) {
    const status = err.response && err.response.status;

    // A 4xx is LINE telling us the token is bad (400 invalid_request /
    // 401 invalid token). Anything else — timeout, DNS, socket reset, 5xx —
    // is LINE being unreachable and says nothing about the token.
    if (status >= 400 && status < 500) {
      throw new AuthError("INVALID_ID_TOKEN", `LINE rejected the id token (${status})`, err);
    }

    throw new AuthError(
      "LINE_UNAVAILABLE",
      `LINE verify endpoint unreachable (${status || err.code || err.message})`,
      err
    );
  }

  // From here LINE answered 200; any mismatch is a token problem, not an outage.
  if (!data || typeof data !== "object") {
    throw new AuthError("INVALID_ID_TOKEN", "id token verify: empty response");
  }

  const aud = Array.isArray(data.aud) ? data.aud : [data.aud];
  if (!aud.includes(clientId)) {
    throw new AuthError("INVALID_ID_TOKEN", "id token verify: audience mismatch");
  }
  if (data.iss !== LINE_ISSUER) {
    throw new AuthError("INVALID_ID_TOKEN", "id token verify: issuer mismatch");
  }
  if (!LINE_USER_ID.test(data.sub || "")) {
    throw new AuthError("INVALID_ID_TOKEN", "id token verify: invalid subject");
  }

  return normalizeProfile({
    userId: data.sub,
    displayName: data.name,
    pictureUrl: data.picture,
  });
}

/**
 * @returns {Promise<string>} the opaque session token (cookie value)
 * @throws when Redis is unreachable — callers must surface 503, not 401
 */
async function createSession(profile) {
  const token = crypto.randomBytes(32).toString("base64url");
  const payload = JSON.stringify({
    profile: normalizeProfile(profile),
    createdAt: new Date().toISOString(),
  });

  const stored = await redis.set(sessionKey(token), payload, {
    EX: SESSION_TTL_SECONDS,
    NX: true,
  });
  if (stored !== "OK") throw new Error("failed to persist session");

  return token;
}

/**
 * @returns {Promise<object|null>} profile, or null when the session is gone or
 * unreadable. Redis failures reject so callers can tell 401 from 503.
 */
async function getSession(token) {
  if (typeof token !== "string" || token === "") return null;

  const raw = await redis.get(sessionKey(token));
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const profile = parsed && parsed.profile;
  if (!profile || !LINE_USER_ID.test(profile.userId || "")) return null;

  return normalizeProfile(profile);
}

async function destroySession(token) {
  if (typeof token !== "string" || token === "") return 0;
  return redis.del(sessionKey(token));
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  MAX_ID_TOKEN_LENGTH,
  SAFE_METHODS,
  AuthError,
  parseCookies,
  readSessionToken,
  setSessionCookie,
  clearSessionCookie,
  canonicalOrigin,
  checkOriginConfig,
  isAllowedOrigin,
  verifyIdToken,
  createSession,
  getSession,
  destroySession,
};
