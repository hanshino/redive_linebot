const { Context } = require("bottender");
const { text } = require("bottender/router");
const GodStoneShopModel = require("../../../model/princess/GodStoneShop");
const CharacterModel = require("../../../model/princess/character");
const GodStoneShopTemplate = require("../../../templates/princess/GodStoneShop");
const chunk = require("lodash/chunk");

exports.router = [text("/godstoneshop", test)];

/**
 * @param {Context} context
 */
async function test(context) {
  const data = await GodStoneShopModel.all();

  const viewData = data
    .map(item => {
      const { name } = item;
      const { Image: image = null, Star: star } = CharacterModel.findByName(name);

      if (!image) {
        return null;
      }

      return {
        ...item,
        image,
        star,
      };
    })
    .filter(item => item);

  const bubbles = viewData.map(item => GodStoneShopTemplate.genShopItem(item));

  chunk(bubbles, 10).forEach(chunk => {
    context.replyFlex("女神石兌換商店", {
      type: "carousel",
      contents: chunk,
    });
  });
}