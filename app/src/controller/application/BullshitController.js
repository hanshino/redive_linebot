const { text } = require("bottender/router");
const Axios = require("axios");
const i18n = require("../../util/i18n");
const config = require("config");
const { get } = require("lodash");
const axios = Axios.create({
  baseURL: config.get("api.bullshit"),
});

exports.router = [
  text(/^[.#/](幹話|bullshit)$/i, bullshitManual),
  text(/^[.#/](幹話|bullshit)\s(?<topic>\S+)(\s(?<minLen>\d{1,3}))?$/i, bullshitGenerator),
];

async function bullshitManual(context) {
  await context.quoteReply(i18n.__("message.bullshit.manual"));
}

/**
 * 幹話產生器
 * @param {import ("bottender").LineContext} context
 * @param {import ("bottender").Props} props
 */
async function bullshitGenerator(context, props) {
  const { topic, minLen = 10 } = props.match.groups;
  const result = await axios
    .post(
      "/bullshit",
      {
        Topic: topic,
        MinLen: parseInt(minLen),
      },
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
        },
        responseType: "text",
      }
    )
    .catch(err => {
      console.error(err.response.data);
    });

  const data = get(result, "data");
  if (!data) {
    await context.quoteReply(
      i18n.__("message.bullshit.failed", {
        userId: get(context, "event.source.userId"),
      })
    );
    return;
  }

  // remove nbsp and trim
  // then replace all <br> with new line
  const bullshit = data
    .replace(/&nbsp;/g, "")
    .trim()
    .replace(/<br>/g, "\n");

  await context.quoteReply(bullshit);
}
