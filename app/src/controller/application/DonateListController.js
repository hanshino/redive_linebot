// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const DonateModel = require("../../model/application/DonateList");
const i18n = require("../../util/i18n");
const { get } = require("lodash");
const { table, getBorderCharacters } = require("table");
const { DefaultLogger } = require("../../util/Logger");
const minimist = require("minimist");

exports.adminRouter = [text(/^[/]donate list/, adminList), text(/^[/]donate add/, adminAdd)];

/**
 * 管理員查看捐款紀錄
 * @param {Context} context
 */
async function adminList(context) {
  const args = minimist(context.event.message.text.split(" "));
  let page = 1;

  if (args.help || args.h) {
    return context.replyText(i18n.__("message.advancement.list_usage"));
  }

  if (args.page) {
    page = parseInt(get(args, "page", 1));
  } else if (args.p) {
    page = parseInt(get(args, "p", 1));
  }

  const options = {
    pagination: {
      page,
      perPage: 10,
    },
  };

  const data = await DonateModel.all(options);

  if (data.length === 0) {
    return context.replyText(i18n.__("message.donate.no_data"));
  }

  const rows = data.map(item => [item.user_id, item.amount]);

  const config = {
    columns: [{ alignment: "justify" }, { alignment: "justify" }],
    border: getBorderCharacters("void"),
    columnDefault: {
      paddingLeft: 0,
      paddingRight: 1,
    },
  };

  const message = table(rows, config);

  return context.replyText(message);
}

async function adminAdd(context) {
  const args = minimist(context.event.message.text.split(" "));
  const { mention } = context.event.message;
  const mentionees = get(mention, "mentionees", []);

  if (args.help || args.h) {
    return context.replyText(i18n.__("message.donate.add_usage"));
  }

  if (mentionees.length === 0) {
    return context.replyText(i18n.__("message.donate.add_no_mention"));
  }

  const userId = get(mentionees, "0.userId", null);
  const amount = get(args, "_.2", null);

  if (!userId || !amount) {
    return context.replyText(i18n.__("message.donate.add_usage"));
  }

  try {
    await DonateModel.create({ user_id: userId, amount });
  } catch (e) {
    DefaultLogger.error(e);
    return context.replyText(i18n.__("message.donate.add_fail"));
  }

  return context.replyText(i18n.__("message.donate.add_success", { amount }));
}
