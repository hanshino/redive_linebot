const { default: axios } = require("axios");
const AdminModel = require("../model/application/Admin");

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
 * 驗證line token
 * @param {String} token Liff的token
 */
exports.verifyToken = (req, res, next) => {
  const auth = req.get("Authorization");

  if (auth === undefined) {
    return Unauthorized(res);
  }

  const token = auth.split(" ")[1] || "";

  axios
    .get("https://api.line.me/v2/profile", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    .then(resp => {
      if (resp.status !== 200) return Promise.reject();
      return resp.data;
    })
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

exports.verifyPrivilege = (allow = 9) => {
  return (req, res, next) => {
    let { privilege } = req.profile;
    privilege = parseInt(privilege);

    if (privilege < allow) {
      return Unauthorized(res);
    }

    next();
  };
};

exports.socketSetProfile = async (socket, next) => {
  const { token } = socket.handshake.query;

  if (token === null || token === "null" || token === undefined) {
    next(new Error("Authentication error"));
    return;
  }

  const profile = await axios
    .get("https://api.line.me/v2/profile", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    .then(resp => {
      if (resp.status !== 200) return Promise.reject();
      return resp.data;
    })
    .catch(() => {
      next(new Error("Authentication error"));
      return;
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
