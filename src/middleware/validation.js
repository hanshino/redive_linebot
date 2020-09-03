const fetch = require("node-fetch");
const AdminModel = require("../model/application/Admin");

/**
 * 驗證line token
 * @param {String} token Liff的token
 */
exports.verifyToken = (req, res, next) => {
  const auth = req.get("Authorization");

  if (auth === undefined) {
    return Unauthorized(res);
  }

  const token = auth.split(" ")[1] || "";

  fetch("https://api.line.me/v2/profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then(result => result.json())
    .then(profile => {
      req.profile = profile;
      next();
    })
    .catch(() => Unauthorized(res));
};

exports.verifyAdmin = async (req, res, next) => {
  const { userId } = req.profile;

  const adminList = await AdminModel.getList();
  var adminData = adminList.find(data => data.userId === userId);
  if (adminData === undefined) return Unauthorized(res);

  req.profile = {
    ...req.profile,
    ...adminData,
  };

  next();
};

exports.socketSetProfile = async (socket, next) => {
  const { token } = socket.handshake.query;

  if (token === null || token === "null" || token === undefined) {
    next(new Error("Authentication error"));
    return;
  }

  const profile = await fetch("https://api.line.me/v2/profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then(result => result.json())
    .catch(() => {
      next(new Error("Authentication error"));
      return false;
    });

  if (profile === false) return;

  socket.handshake.query = {
    ...socket.handshake.query,
    ...profile,
  };

  return next();
};

exports.socketVerifyAdmin = async (socket, next) => {
  const { userId } = socket.handshake.query;

  const adminList = await AdminModel.getList();
  var adminData = adminList.find(data => data.userId === userId);
  if (adminData === undefined) next(new Error("Authentication error"));

  return next();
};

function Unauthorized(res) {
  res.status(401).json({ message: "invalid token." });
}
