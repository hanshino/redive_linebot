const ScratchCard = require("../../model/application/ScratchCard");
const template = require("../../templates/application/ScratchCard");
const { text } = require("bottender/router");

exports.router = [text(/^[.#/](scratch|刮刮樂|刮刮卡)$/, list)];
exports.api = {};

/**
 * 秀出刮刮樂
 * @param {import("bottender").Context} context
 */
async function list(context) {
  const cards = await ScratchCard.fetchAllTypes();

  const carousel = cards.map(card =>
    template.generateScratchCard({
      title: card.name,
      maxPrize: card.max_reward,
      ...card,
    })
  );

  await context.replyFlex("刮刮樂", {
    type: "carousel",
    contents: carousel,
  });
}
