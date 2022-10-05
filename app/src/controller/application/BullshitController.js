const { text } = require("bottender/router");
const { default: axios } = require("axios");
const i18n = require("../../util/i18n");
const config = require("config");

exports.router = [
  text(/^[.#/](幹話|bullshit)$/i, bullshitManual),
  text(/^[.#/](幹話|bullshit)\s(?<topic>\S+)$/i, bullshitGenerator),
];

async function bullshitManual(context) {
  await context.replyText(i18n.__("message.bullshit.manual"));
}

/**
 * 幹話產生器
 * @param {import ("bottender").LineContext} context
 * @param {import ("bottender").Props} props
 */
async function bullshitGenerator(context, props) {
  const { topic } = props.match.groups;
  const apiUrl = `${config.get("api.bullshit")}/bullshit`;
  const { data } = await axios
    .post(apiUrl, {
      Topic: topic,
      MinLen: 10,
    })
    .catch(err => console.error(err));

  if (!data) {
    await context.replyText(i18n.__("message.bullshit.failed"));
    return;
  }

  // remove nbsp and trim
  const bullshit = data.replace(/&nbsp;/g, "").trim();

  await context.replyText(bullshit);
}
