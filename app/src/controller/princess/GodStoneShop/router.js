// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const GodStoneShopModel = require("../../../model/princess/GodStoneShop");
const GodStoneShopTemplate = require("../../../templates/princess/GodStoneShop");
const chunk = require("lodash/chunk");
const i18n = require("../../../util/i18n");

exports.router = [text(/^[.#]轉蛋(兌換|商店)/, showStoneShop)];

/**
 * @param {Context} context
 */
async function showStoneShop(context) {
  const data = await GodStoneShopModel.all();

  const viewData = data
    .map(item => {
      const { star, itemImage: image } = item;

      return {
        ...item,
        image,
        star,
      };
    })
    .filter(item => item);

  if (viewData.length === 0) {
    return context.quoteReply(i18n.__("message.god_stone_shop_empty"));
  }

  const bubbles = viewData.map(item => GodStoneShopTemplate.genShopItem(item));

  chunk(bubbles, 10).forEach(chunk => {
    context.replyFlex("女神石兌換商店", {
      type: "carousel",
      contents: chunk,
    });
  });
}
