const express = require("express");
const router = express.Router();
const {
  MAX_ID_TOKEN_LENGTH,
  readSessionToken,
  setSessionCookie,
  clearSessionCookie,
  isAllowedOrigin,
  verifyIdToken,
  createSession,
  destroySession,
} = require("../service/AuthSessionService");

// Maps AuthError.code -> wire response. Keyed on the code the service sets,
// never on message text. An unrecognised code falls through to 502 rather
// than 401: an unclassified failure must not be reported to the browser as
// "your session is invalid", because that is the one answer that makes the
// frontend throw away a working login.
const VERIFY_FAILURES = {
  INVALID_ID_TOKEN: { status: 401, message: "invalid id token." },
  LINE_UNAVAILABLE: { status: 502, message: "line authentication unavailable." },
  AUTH_CONFIG: { status: 503, message: "auth configuration unavailable." },
};
const VERIFY_FALLBACK = VERIFY_FAILURES.LINE_UNAVAILABLE;

/**
 * POST /api/auth/session
 * Exchange a LIFF ID token for an opaque server session. The ID token is
 * verified against LINE and then dropped — it is never stored anywhere.
 */
router.post("/auth/session", async (req, res) => {
  if (!isAllowedOrigin(req.get("Origin"))) {
    return res.status(403).json({ message: "forbidden" });
  }

  const idToken = req.body && req.body.idToken;
  if (typeof idToken !== "string" || idToken === "") {
    return res.status(400).json({ message: "idToken is required." });
  }
  if (idToken.length > MAX_ID_TOKEN_LENGTH) {
    return res.status(400).json({ message: "idToken is malformed." });
  }

  let profile;
  try {
    profile = await verifyIdToken(idToken);
  } catch (err) {
    const failure = VERIFY_FAILURES[err && err.code] || VERIFY_FALLBACK;
    console.error("[auth] id token verify failed", {
      code: (err && err.code) || "UNCLASSIFIED",
      status: failure.status,
      message: err && err.message,
    });
    return res.status(failure.status).json({ message: failure.message });
  }

  // Rotate: mint the new session before dropping the old one, so a Redis
  // failure halfway through never leaves the caller with no session at all.
  const previousToken = readSessionToken(req.headers.cookie);
  let token;
  try {
    token = await createSession(profile);
  } catch (err) {
    console.error("[auth] session create failed", err && err.message);
    return res.status(503).json({ message: "session store unavailable." });
  }

  if (previousToken && previousToken !== token) {
    destroySession(previousToken).catch(err =>
      console.error("[auth] stale session cleanup failed", err && err.message)
    );
  }

  setSessionCookie(res, token);
  res.json(profile);
});

/**
 * POST /api/auth/logout — idempotent; no session is still a 200.
 */
router.post("/auth/logout", async (req, res) => {
  if (!isAllowedOrigin(req.get("Origin"))) {
    return res.status(403).json({ message: "forbidden" });
  }

  const token = readSessionToken(req.headers.cookie);

  if (token) {
    try {
      await destroySession(token);
    } catch (err) {
      // Leave the cookie in place: clearing it while the Redis record still
      // lives would strand a session nobody can revoke.
      console.error("[auth] session destroy failed", err && err.message);
      return res.status(503).json({ message: "session store unavailable." });
    }
  }

  clearSessionCookie(res);
  res.json({ ok: true });
});

module.exports = router;
