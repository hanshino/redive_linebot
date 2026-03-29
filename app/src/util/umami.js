const axios = require("axios");

const UMAMI_URL = process.env.UMAMI_URL;
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID;
const HOSTNAME = "linebot";

function isEnabled() {
  return Boolean(UMAMI_URL && UMAMI_WEBSITE_ID);
}

function send(payload) {
  if (!isEnabled()) return;

  axios
    .post(`${UMAMI_URL}/api/send`, {
      payload: {
        hostname: HOSTNAME,
        language: "zh-TW",
        website: UMAMI_WEBSITE_ID,
        ...payload,
      },
    })
    .catch(err => {
      console.error("[umami] send failed:", err.message);
    });
}

/**
 * 從 context 提取來源資訊
 * @param {import("bottender").LineContext} context
 */
exports.getSourceData = function getSourceData(context) {
  const { type, groupId } = context.event.source;
  const data = { sourceType: type };
  if (type === "group" && groupId) {
    data.groupId = groupId;
  }
  return data;
};

exports.track = function track(name, url, data) {
  send({ url, name, data });
};
