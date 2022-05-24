const { default: axios } = require("axios");
const API_TOKEN = "https://notify-bot.line.me/oauth/token";
const API_REVOKE = "https://notify-api.line.me/api/revoke";
const API_NOTIFY = "https://notify-api.line.me/api/notify";
const { CustomLogger } = require("./Logger");

/**
 * 取得Line Notify的Token
 * @param {String} code 由LineNotify轉址回來所帶的code
 */
exports.queryToken = async code => {
  const query = new URLSearchParams();
  query.set("grant_type", "authorization_code");
  query.set("code", code);
  query.set("redirect_uri", `https://${process.env.APP_DOMAIN}/api/Bot/Notify/Callback`);
  query.set("client_id", process.env.LINE_NOTIFY_CLIENT_ID);
  query.set("client_secret", process.env.LINE_NOTIFY_CLIENT_SECRET);

  CustomLogger.info("Request", API_TOKEN, "code =>", code);

  return await axios
    .post(API_TOKEN, query.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })
    .then(res => res.data)
    .then(data => data.access_token)
    .catch(err => {
      if (err.response) {
        CustomLogger.error(
          "Query LineNotify Token Failed.",
          "status",
          err.response.status,
          "data",
          JSON.stringify(err.response.data),
          "headers",
          JSON.stringify(err.response.headers)
        );
      }
      return null;
    });
};

/**
 * 將token進行撤銷
 * @param {String} token
 */
exports.revokeToken = token => {
  return axios.post(API_REVOKE, {}, { headers: { Authorization: `Bearer ${token}` } });
};

/**
 * 發送訊息
 * @param {Object} objData
 * @param {String} objData.message
 * @param {String} objData.token
 */
exports.pushMessage = objData => {
  const query = new URLSearchParams();
  query.set("message", objData.message);

  CustomLogger.info("Request", API_NOTIFY, JSON.stringify(objData));

  return axios
    .post(API_NOTIFY, query.toString(), {
      headers: { Authorization: `Bearer ${objData.token}` },
    })
    .catch(err => {
      CustomLogger.error(
        "Push Message Failed.",
        "status",
        err.response.status,
        "data",
        JSON.stringify(err.response.data),
        "headers",
        JSON.stringify(err.response.headers)
      );
    });
};
