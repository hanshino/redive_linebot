const axios = require("axios");

const UMAMI_URL = process.env.UMAMI_URL;
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID;
const UMAMI_HOSTNAME = process.env.APP_DOMAIN || "pudding.hanshino.dev";

const USER_AGENT = "Mozilla/5.0 (Linux; x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

function isEnabled() {
  return Boolean(UMAMI_URL && UMAMI_WEBSITE_ID);
}

function send(payload) {
  if (!isEnabled()) return;

  axios
    .post(
      `${UMAMI_URL}/api/send`,
      {
        type: "event",
        payload: {
          hostname: UMAMI_HOSTNAME,
          language: "zh-TW",
          screen: "1920x1080",
          title: "RediveLineBot",
          referrer: "",
          website: UMAMI_WEBSITE_ID,
          ...payload,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
      }
    )
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
  const fullUrl = `https://${UMAMI_HOSTNAME}${url}`;
  send({ url: fullUrl, name, data });
};
