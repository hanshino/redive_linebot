const { default: axios } = require("axios");
const { URLSearchParams } = require("url");
const { DefaultLogger } = require("../lib/Logger");

/**
 * 使用 Line Notify 發送訊息
 * @param {Object} option
 * @param {String} option.message 發送訊息內容，參照 Line Message object
 * @param {?String} option.token Line Notify AccessToken
 * @param {Boolean} option.alert 是否通知
 */
exports.push = option => {
  let { message, token, alert } = option;
  token = token || process.env.LINE_NOTIFY_TOKEN;
  message = message || "請輸入發送訊息";

  if (!token) return false;

  const params = new URLSearchParams();
  params.append("message", `${message}`);
  params.append("notificationDisabled", !alert);

  return axios
    .post("https://notify-api.line.me/api/notify", params, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })
    .then(res => res.ok)
    .catch(err => {
      DefaultLogger.error(err);
      return false;
    });
};
