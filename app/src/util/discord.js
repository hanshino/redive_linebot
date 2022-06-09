const axios = require("axios").default;
const { URLSearchParams } = require("url");

exports.webhook = {};

exports.webhook.test = webhook => {
  return webhookSend(webhook, {
    content: "Webhook 連動測試",
    username: "Re:Dive 機器人",
  });
};

exports.webhook.send = webhookSend;

/**
 * 發送webhook訊息
 * @param {String} webhook
 * @param {Object} objData
 * @param {String} objData.content
 * @param {String=} objData.username
 * @param {String=} objData.avatar_url
 */
function webhookSend(webhook, objData) {
  const params = new URLSearchParams();
  Object.keys(objData).forEach(key => params.append(key, objData[key]));

  return axios
    .post(webhook, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })
    .then(() => {
      return true;
    })
    .catch(err => {
      console.error(err);
      return false;
    });
}
