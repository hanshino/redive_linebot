// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const { chunk } = require("lodash");
const i18n = require("../../util/i18n");
const config = require("config");
const advModel = require("../../model/application/Advancement");
const advTemplate = require("../../templates/application/Advancement");

exports.router = [text(/^[.#/](成就|稱號|adv)/, list)];

/**
 * 秀出成就
 * @param {Context} context
 */
async function list(context) {
  const { userId } = context.event.source;
  const data = await advModel.findUserAdvancementsByPlatformId(userId);

  if (data.length === 0) {
    return context.replyText(i18n.__("message.advancement.no_data"));
  }

  const rows = data.map(item => {
    const { icon, name, order } = item;
    const isNeedTrans = /^[a-zA-z0-9_]+$/.test(name);
    return advTemplate.generateRowBox({
      icon,
      name: isNeedTrans ? i18n.__(`advancement.${name}`) : name,
      colorCode: config.get(`advancement.rarity_color.${order}`) || "#80808099",
    });
  });

  const bubbles = chunk(rows, 5).map(piece => advTemplate.generateBubble(piece));
  const manualBubble = advTemplate.generateRuleBubble(config.get("advancement.manual"));

  const flex = {
    type: "carousel",
    contents: [manualBubble, ...bubbles],
  };

  return context.replyFlex("成就稱號系統", flex);
}
