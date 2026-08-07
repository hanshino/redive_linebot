const AdminModel = require("../model/application/Admin");
const {
  SAFE_METHODS,
  readSessionToken,
  getSession,
  isAllowedOrigin,
} = require("../service/AuthSessionService");

/**
 * 驗證Line來源id
 */
exports.verifyId = (id, res, next) => {
  if (!/^[CUR][a-f0-9]{32}$/.test(id)) {
    res.status(400).send("");
    return;
  }

  next();
};

/**
 * 驗證Line群組ID
 */
exports.verifyLineGroupId = (groupId, res, next) => {
  if (!/^C[a-f0-9]{32}$/.test(groupId)) {
    res.status(400).send("");
    return;
  }

  next();
};

/**
 * 驗證Line使用者ID
 */
exports.verifyLineUserId = (userId, res, next) => {
  if (!/^U[a-f0-9]{32}$/.test(userId)) {
    res.status(400).send("");
    return;
  }

  next();
};

/**
 * Cookie session authentication. No Authorization bearer fallback exists —
 * the only credential the browser holds is the HttpOnly `redive_session`
 * cookie, so an attacker page cannot read or replay it.
 *
 * Contract kept from the old LIFF-token middleware: on success `req.profile`
 * carries `{ userId, displayName, pictureUrl }`.
 */
exports.verifyToken = async (req, res, next) => {
  // Cookie auth is ambient, so unsafe verbs need a same-origin check (CSRF).
  if (!SAFE_METHODS.has(req.method) && !isAllowedOrigin(req.get("Origin"))) {
    return Forbidden(res);
  }

  const token = readSessionToken(req.headers.cookie);
  if (!token) return Unauthorized(res);

  let profile;
  try {
    profile = await getSession(token);
  } catch (err) {
    // Redis is down: the session may well be valid, so do NOT log the user
    // out — 503 keeps the client's cookie and lets it retry.
    console.error("[auth] session lookup failed", err && err.message);
    return ServiceUnavailable(res);
  }

  if (!profile) return Unauthorized(res);

  req.profile = profile;
  next();
};

exports.verifyAdmin = async (req, res, next) => {
  const { userId } = req.profile;

  const adminList = await AdminModel.getList();
  var adminData = adminList.find(data => data.userId === userId);
  if (adminData === undefined) return Forbidden(res);

  req.profile = {
    ...req.profile,
    ...adminData,
  };

  next();
};

exports.verifyPrivilege = (allow = 9) => {
  return (req, res, next) => {
    let { privilege } = req.profile;
    privilege = parseInt(privilege);

    if (privilege < allow) {
      return Forbidden(res);
    }

    next();
  };
};

exports.socketSetProfile = async (socket, next) => {
  if (!isAllowedOrigin(socket.handshake.headers.origin)) {
    return next(new Error("Authentication error"));
  }

  const token = readSessionToken(socket.handshake.headers.cookie);
  if (!token) return next(new Error("Authentication error"));

  let profile;
  try {
    profile = await getSession(token);
  } catch (err) {
    console.error("[auth] socket session lookup failed", err && err.message);
    return next(new Error("Service unavailable"));
  }

  if (!profile) return next(new Error("Authentication error"));

  socket.data.profile = profile;
  return next();
};

exports.socketVerifyAdmin = async (socket, next) => {
  const { userId } = socket.data.profile || {};

  let adminData;
  try {
    const adminList = await AdminModel.getList();
    adminData = adminList.find(data => data.userId === userId);
  } catch (err) {
    console.error("[auth] socket admin lookup failed", err && err.message);
    return next(new Error("Service unavailable"));
  }

  // Every branch must call next() exactly once — calling it twice lets an
  // unauthorized socket through after the rejection.
  if (adminData === undefined) return next(new Error("Authentication error"));

  socket.data.profile = { ...socket.data.profile, ...adminData };
  return next();
};

function Unauthorized(res) {
  res.status(401).json({ message: "invalid token." });
}

function Forbidden(res) {
  res.status(403).json({ message: "forbidden" });
}

function ServiceUnavailable(res) {
  res.status(503).json({ message: "session store unavailable." });
}
