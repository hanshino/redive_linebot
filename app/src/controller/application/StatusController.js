const { text } = require("bottender/router");
const { inventory: inventoryModel } = require("../../model/application/Inventory");
const i18n = require("../../util/i18n");

exports.router = [
  text(/^[.#/](my[-_]?money|我的錢錢|我的女神石)$/, godStone),
  text(/^[.#/](my[-_]?character|我的角色|我的角色數量)$/, ownCharacter),
];

/**
 * 查詢我的女神石
 * @param {import ("bottender").LineContext} context
 */
async function godStone(context) {
  const { userId } = context.event.source;
  const { amount = 0 } = await inventoryModel.getUserMoney(userId);

  context.quoteReply(i18n.__("message.user_own_god_stone", { god_stone: amount }));
}

/**
 * 查詢我擁有的角色數量
 * @param {import ("bottender").LineContext} context
 */
async function ownCharacter(context) {
  const { userId } = context.event.source;
  const result = await inventoryModel.getAllUserOwn(userId);

  context.quoteReply(
    i18n.__("message.user_own_character_count", { character_count: result.length })
  );
}
