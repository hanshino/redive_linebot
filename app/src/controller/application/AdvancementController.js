// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const { chunk } = require("lodash");
const i18n = require("../../util/i18n");
const config = require("config");
const advModel = require("../../model/application/Advancement");
const advTemplate = require("../../templates/application/Advancement");
const minimist = require("minimist");
const get = require("lodash/get");
const { table, getBorderCharacters } = require("table");

exports.router = [text(/^[.#/](成就|稱號|adv)$/, list)];

exports.adminRouter = [text(/^[/]adv list/, adminList)];

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

/**
 * 管理員用 秀出成就
 * @param {Context} context
 */
async function adminList(context) {
  const args = minimist(context.event.message.text.split(" "));
  let page = 1;

  if (args.page) {
    page = parseInt(get(args, "page", 1));
  } else if (args.p) {
    page = parseInt(get(args, "p", 1));
  }

  const data = await advModel.all({
    pagination: {
      page,
      perPage: 10,
    },
  });

  const config = {
    columns: [
      { alignment: "center", width: 3 },
      { alignment: "justify", width: 10 },
      { alignment: "center", width: 3 },
    ],
    border: getBorderCharacters("ramac"),
    header: {
      alignment: "center",
      content: `[成就稱號系統]\n第 ${page} 頁`,
    },
  };

  const messages = table(
    data.map(item => [item.id, item.name, item.order]),
    config
  );
  return context.replyText(messages);
}
