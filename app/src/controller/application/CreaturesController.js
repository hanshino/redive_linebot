const { text, route } = require("bottender/router");
const creatureModel = require("../../model/application/Creature");
const userHasCreatureModel = require("../../model/application/UserHasCreature");
const i18n = require("../../util/i18n");
const creatureTemplate = require("../../templates/application/Creatures");
const { hasSpace } = require("../../util/string");
const { get } = require("lodash");
const quickReplies = require("../../templates/common/quickReplies");
const config = require("config");
const { CustomLogger } = require("../../util/Logger");

exports.router = [
  text(/^[/#.]養成$/, main),
  text(/^[/#.]養成建立$/, preCreate),
  isCreating(confirmCreate),
  hasChecked(create),
];

/**
 * 檢查 `context.state` 是否在建立角色狀態
 * @param {Function} action
 */
function isCreating(action) {
  return route(context => get(context.state, "creature.isCreating", false), action);
}

/**
 * 檢查 `context.state` 是否已經是驗證過的狀態
 * @param {Function} action
 */
function hasChecked(action) {
  return route(context => get(context.state, "creature.check", false), action);
}

/**
 * 主要養成頁面
 * @param {import ("bottender").LineContext} context
 */
async function main(context) {
  const { id: userNo } = context.event.source;

  // 先檢查有沒有角色
  const userHasCreatures = await creatureModel.findUserCreature(userNo);

  if (!userHasCreatures) {
    context.replyText(i18n.__("message.creatures.not_found"));
    return await preCreate(context, { isNeedCheck: false });
  }

  const bubbles = creatureTemplate.generateCreatureMainBubble(userHasCreatures);

  context.replyFlex(`${get(userHasCreatures, "nickname")}的狀態`, bubbles);
}

/**
 * 建立角色前置動作
 * @param {import ("bottender").LineContext} context
 * @param {Object} props 額外參數
 * @param {Boolean} props.isNeedCheck 是否需要檢查角色是否存在，通常源自於用戶直接呼叫主頁面，沒有角色存在，而被導向至此，所以無須檢查
 */
async function preCreate(context, { isNeedCheck = true }) {
  const { id: userNo } = context.event.source;

  if (isNeedCheck) {
    // 先檢查有沒有角色
    const userHasCreatures = await creatureModel.findUserCreature(userNo);

    if (userHasCreatures) {
      await context.replyText(i18n.__("message.creatures.already_exists"));
      return;
    }
  }

  const creatures = await creatureModel.all({
    filter: {
      is_able_to_create: 1,
    },
  });

  if (creatures.length === 0) {
    await context.replyText(
      i18n.__("message.creatures.admin_error", {
        userId: context.event.source.userId,
      })
    );
    return;
  }

  context.replyFlex("創建角色", creatureTemplate.generateCreateBubble(creatures[0]));
}

/**
 * 處理建立角色的前置動作
 * @param {import ("bottender").LineContext} context
 */
exports.initCreate = async (context, { payload }) => {
  const { id: userNo } = context.event.source;

  // 先檢查有沒有角色
  const userHasCreatures = await creatureModel.findUserCreature(userNo);

  if (userHasCreatures) {
    await context.replyText(i18n.__("message.creatures.already_exists"));
    return;
  }

  const { creature_id } = payload;
  const creature = await creatureModel.findById(creature_id);

  if (!creature) {
    await context.replyText(
      i18n.__("message.creatures.admin_error", {
        userId: context.event.source.userId,
      })
    );
    return;
  }

  context.replyText(i18n.__("message.creatures.ask_for_nickname", { name: creature.name }));
  context.setState({
    creature: {
      isCreating: true,
      creatureId: creature_id,
    },
  });
};

/**
 * 確認角色名稱的合法性，並且詢問是否要建立角色
 * @param {import ("bottender").LineContext} context
 */
async function confirmCreate(context) {
  const { id: userNo } = context.event.source;
  const { text: nickname } = context.event.message;

  if (hasSpace(nickname)) {
    await context.replyText(i18n.__("message.creatures.nickname_has_space"));
    return;
  }

  CustomLogger.info("check user has creatures", userNo, context.event.source);

  const userHasCreatures = await creatureModel.findUserCreature(userNo);
  if (userHasCreatures) {
    await context.replyText(i18n.__("message.creatures.already_exists"));
    clearState(context);
    return;
  }

  const creatureId = get(context.state, "creature.creatureId");
  if (!creatureId) {
    await context.replyText(i18n.__("message.creatures.admin_error"));
    clearState(context);
    return;
  }

  const creature = await creatureModel.findById(creatureId);
  if (!creature) {
    await context.replyText(
      i18n.__("message.creatures.admin_error", {
        userId: context.event.source.userId,
      })
    );
    clearState(context);
    return;
  }

  context.setState({
    creature: {
      ...context.state.creature,
      check: true,
      isCreating: false,
      nickname,
    },
  });

  const quickReply = {
    items: [quickReplies.yes, quickReplies.no],
  };

  await context.replyText(
    i18n.__("message.creatures.ask_for_nickname_confirm", {
      name: creature.name,
      nickname,
    }),
    {
      quickReply,
    }
  );
}

/**
 * 建立角色
 * @param {import ("bottender").LineContext} context
 */
async function create(context) {
  const { id: userNo } = context.event.source;
  const { nickname, creatureId } = context.state.creature;
  const { text } = context.event.message;
  const allowText = config.get("message.yes") || [];
  const denyText = config.get("message.no") || [];

  if (denyText.includes(text)) {
    clearState(context);
    context.replyText(i18n.__("message.creatures.create_user_cancel"));
    return;
  }

  const creature = await creatureModel.findById(creatureId);
  if (!allowText.includes(text)) {
    context.replyText(
      i18n.__("message.creatures.ask_for_nickname_confirm", {
        name: get(creature, "name", ""),
        nickname,
      })
    );
    return;
  }

  const id = await userHasCreatureModel.create({
    user_id: userNo,
    creature_id: creatureId,
    nickname,
  });

  if (!id) {
    context.replyText(i18n.__("message.creatures.admin_error"));
    clearState(context);
    return;
  }

  await context.replyText(
    i18n.__("message.creatures.create_success", {
      name: get(creature, "name", ""),
      nickname,
    })
  );

  clearState(context);
}

/**
 * 清除建立角色的狀態
 * @param {import ("bottender").LineContext} context
 */
function clearState(context) {
  context.setState({
    creature: {
      isCreating: false,
      creatureId: null,
    },
  });
}
