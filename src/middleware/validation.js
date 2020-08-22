const fetch = require("node-fetch");

/**
 * 驗證line token
 * @param {String} token Liff的token
 */
exports.verifyToken = (req, res, next) => {
  const auth = req.get("Authorization");

  if (auth === undefined) {
    res.json({ message: "invalid token." });
    return;
  }

  const token = auth.split(" ")[1] || "";

  fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${token}`)
    .then(() => next())
    .catch(() => res.json({ message: "invalid token." }));
};
