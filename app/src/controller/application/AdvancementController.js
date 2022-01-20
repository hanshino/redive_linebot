// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const { chunk, isNumber } = require("lodash");
const i18n = require("../../util/i18n");
const config = require("config");
const advModel = require("../../model/application/Advancement");
const advTemplate = require("../../templates/application/Advancement");
const minimist = require("minimist");
const get = require("lodash/get");
const { table, getBorderCharacters } = require("table");
const Ajv = require("ajv");
const { DefaultLogger } = require("../../util/Logger");

exports.router = [text(/^[.#/](成就|稱號|adv)$/, list)];

exports.adminRouter = [
  text(/^[/]adv list/, adminList),
  text(/^[/]adv add/, adminAdd),
  text(/^[/]adv attach/, adminAttach),
];

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

  if (args.help || args.h) {
    return context.replyText(i18n.__("message.advancement.list_usage"));
  }

  if (args.page) {
    page = parseInt(get(args, "page", 1));
  } else if (args.p) {
    page = parseInt(get(args, "p", 1));
  }

  const name = get(args, "name", get(args, "n", null));

  const options = {
    pagination: {
      page,
      perPage: 10,
    },
  };

  if (name) {
    options.filter = {
      name,
    };
  }

  const data = await advModel.all(options);

  const config = {
    columns: [{ alignment: "center" }, { alignment: "justify" }, { alignment: "center" }],
    border: getBorderCharacters("void"),
    columnDefault: {
      paddingLeft: 0,
      paddingRight: 1,
    },
  };

  const messages = table(
    [
      [
        i18n.__("message.advancement.id"),
        i18n.__("message.advancement.name"),
        i18n.__("message.advancement.order"),
      ],
      ...data.map(item => [item.id, item.name, item.order]),
    ],
    config
  );

  return context.replyText(messages);
}

/**
 * 管理員用 秀出成就
 * @param {Context} context
 */
async function adminAdd(context) {
  const args = minimist(context.event.message.text.split(" "));

  if (args.help || args.h) {
    return context.replyText(i18n.__("message.advancement.add_usage"));
  }

  const ajv = new Ajv();
  const schema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        minLength: 1,
      },
      type: {
        type: "string",
        minLength: 1,
      },
      order: {
        type: "integer",
        minimum: 0,
        maximum: 10,
      },
      icon: {
        type: "string",
        minLength: 1,
      },
      description: {
        type: "string",
        minLength: 1,
      },
    },
    required: ["name", "order", "icon", "description"],
  };

  const validate = ajv.compile(schema);

  const attributes = {
    name: get(args, "name", get(args, "n", null)),
    type: get(args, "type", get(args, "t", null)),
    order: get(args, "order", get(args, "o", null)),
    icon: get(args, "icon", get(args, "i", null)),
    description: get(args, "description", get(args, "d", null)),
  };

  const valid = validate(attributes);
  if (!valid) {
    DefaultLogger.warn("管理員新增成就錯誤", validate.errors);
    return context.replyText(i18n.__("message.advancement.add_invalid_bad_request"));
  }

  const result = await advModel.create(attributes);

  if (result) {
    return context.replyText(i18n.__("message.advancement.add_success", { name: attributes.name }));
  } else {
    return context.replyText(i18n.__("message.advancement.add_fail"));
  }
}

async function adminAttach(context) {
  const args = minimist(context.event.message.text.split(" "));
  const { mention } = context.event.message;
  const mentionees = get(mention, "mentionees", []);

  if (args.help || args.h) {
    return context.replyText(i18n.__("message.advancement.attach_usage"));
  }

  const advId = get(args, "_.2", null);
  if (!isNumber(advId)) {
    return context.replyText(i18n.__("message.advancement.attach_usage"));
  }

  if (mentionees.length === 0) {
    return context.replyText(i18n.__("message.advancement.attach_no_mention"));
  }

  const userIds = mentionees.map(item => item.userId);
  const result = await advModel.attachManyByPlatformId(advId, userIds);

  if (result) {
    const { name } = await advModel.find(advId);
    return context.replyText(
      i18n.__("message.advancement.attach_success", {
        players: userIds.length,
        name,
      })
    );
  } else {
    return context.replyText(i18n.__("message.advancement.attach_fail"));
  }
}
