const axios = require("axios");
const { URLSearchParams } = require("url");

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

  return axios({
    method: "post",
    url: "https://hanshino-bot.herokuapp.com/Randosoru/Notify",
    data: {
      token,
      data: {
        message,
        notificationDisabled: !alert,
      },
    },
  }).then(res => res.ok);
};
