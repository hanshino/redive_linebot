const ScratchCard = require("../../model/application/ScratchCard");
const template = require("../../templates/application/ScratchCard");
const { text } = require("bottender/router");
const { chunk } = require("lodash");

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

exports.api.list = async (req, res) => {
  const cards = await ScratchCard.fetchAllTypes();
  res.json(cards);
};

/**
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.api.generateCards = async (req, res) => {
  const { id, data } = req.body;
  const cards = [];

  data.forEach(d => {
    const { reward, count } = d;
    cards.push(...Array.from({ length: count }, () => ({ scratch_card_type_id: id, reward })));
  });

  for (const chunkedCards of chunk(cards, 100)) {
    await ScratchCard.insert(chunkedCards);
  }

  res.json({ message: "ok" });
};

exports.api.show = async (req, res) => {
  const { id } = req.params;
  const [card, cardInfo] = await Promise.all([ScratchCard.find(id), ScratchCard.getCardInfo(id)]);

  res.json({
    ...card,
    info: cardInfo,
  });
};
