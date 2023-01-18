const ScratchCard = require("../../model/application/ScratchCard");
const template = require("../../templates/application/ScratchCard");
const { text } = require("bottender/router");
const { chunk } = require("lodash");
const { inventory: Inventory } = require("../../model/application/Inventory");

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

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.api.show = async (req, res) => {
  const { id } = req.params;
  const [card, cardInfo] = await Promise.all([ScratchCard.find(id), ScratchCard.getCardInfo(id)]);

  res.json({
    ...card,
    info: cardInfo,
  });
};

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.api.purchase = async (req, res) => {
  const { id } = req.params;
  const { count } = req.body;
  const { userId } = req.profile;
  const card = await ScratchCard.find(id);

  let { amount: userGodStoneCount = 0 } = await Inventory.getUserMoney(userId);
  userGodStoneCount = parseInt(userGodStoneCount);

  const exceptCostGodStone = card.price * count;

  if (userGodStoneCount < exceptCostGodStone) {
    return res.status(400).json({ message: "你的女神石不足" });
  }

  const cards = await ScratchCard.fetchRandomCards(id, count);

  if (cards.length === 0) {
    return res.status(400).json({ message: "刮刮樂已經售完" });
  }

  const trx = await ScratchCard.transaction();
  Inventory.setTransaction(trx);

  try {
    const affectedRows = await trx
      .from(ScratchCard.table)
      .update({
        buyer_id: userId,
      })
      .where("buyer_id", null)
      .andWhere("scratch_card_type_id", id)
      .whereIn(
        "id",
        cards.map(c => c.id)
      );

    console.log(affectedRows);

    const actualCostGodStone = exceptCostGodStone - affectedRows * card.price;
    await Inventory.decreaseGodStone({
      userId,
      amount: actualCostGodStone,
      note: "刮刮樂購買",
    });
    await trx.commit();
  } catch (e) {
    await trx.rollback();
    throw e;
  }

  res.json({
    cards,
  });
};
