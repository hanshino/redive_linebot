const ScratchCard = require("../../model/application/ScratchCard");
const template = require("../../templates/application/ScratchCard");
const commonTemplate = require("../../templates/common");
const { text } = require("bottender/router");
const { chunk, groupBy } = require("lodash");
const { inventory: Inventory } = require("../../model/application/Inventory");

exports.router = [
  text(/^[.#/](scratch|刮刮卡)$/, list),
  text(/^[.#/](刮刮卡開獎)$/, showUnused),
  text(/^[.#/](購買刮刮卡) (?<name>\S+) (?<count>\d{1,2})$/, buy),
];
exports.api = {};

/**
 * 秀出刮刮樂
 * @param {import("bottender").Context} context
 */
async function list(context) {
  const cards = await ScratchCard.fetchAllTypes();
  const panel = template.generateScratchCardPanel();

  const carousel = cards.map(card =>
    template.generateScratchCard({
      title: card.name,
      maxPrize: card.max_reward,
      link: commonTemplate.getLiffUri("full", `/ScratchCard/${card.id}`),
      ...card,
    })
  );

  carousel.unshift(panel);

  await context.replyFlex("刮刮樂", {
    type: "carousel",
    contents: carousel,
  });
}

/**
 * 顯示尚未兌換的刮刮樂
 * @param {import("bottender").Context} context
 */
async function showUnused(context) {
  const { userId, displayName, pictureUrl } = context.event.source;
  const sender = { name: displayName, iconUrl: pictureUrl };
  const cards = await ScratchCard.fetchMyUnusedCards(userId);

  if (cards.length === 0) {
    return await context.replyText("窩沒有刮刮卡了", { sender });
  }

  const group = groupBy(cards, ({ reward, name }) => `${reward},${name}`);
  const groupKeys = Object.keys(group);
  const rows = groupKeys.map(key => {
    const [reward, name] = key.split(",");
    return template.generateTableRow({
      name,
      reward,
      count: group[key].length,
    });
  });
  const bubble = template.generateScratchCardUnusedTable(userId, rows);

  await context.replyFlex("刮刮樂", bubble);
}

/**
 * 購買刮刮樂
 * @param {import("bottender").Context} context
 */
async function buy(context, props) {
  const { userId, displayName, pictureUrl } = context.event.source;
  const sender = { name: displayName, iconUrl: pictureUrl };
  const { name, count = 1 } = props.match.groups;
  const card = await ScratchCard.fetchByName(name);
  if (!card) {
    return await context.replyText("沒有這張刮刮卡");
  }

  const ownCostGodStone = await Inventory.getUserMoney(userId);
  const exceptCostGodStone = card.price * count;

  if (exceptCostGodStone > ownCostGodStone) {
    return await context.replyText("窩的錢錢不夠QQ", { sender });
  }

  const unusedCard = await ScratchCard.fetchRandomCards(card.id, count);
  const cardIds = unusedCard.map(c => c.id);

  const trx = await ScratchCard.transaction();
  Inventory.setTransaction(trx);

  try {
    const affectedRows = await trx
      .update({
        buyer_id: userId,
      })
      .whereIn("id", cardIds)
      .where("buyer_id", null)
      .where("scratch_card_type_id", card.id)
      .from(ScratchCard.table);

    const actualCostGodStone = card.price * affectedRows;
    await Inventory.decreaseGodStone({
      userId,
      amount: actualCostGodStone,
      note: "購買刮刮卡",
    });

    await trx.commit();
  } catch (error) {
    await trx.rollback();
    console.log(error);
    return await context.replyText("購買失敗", { sender });
  }

  await context.replyText("購買成功", { sender });
}

exports.exchange = exchange;

/**
 * 進行兌換
 * @param {import("bottender").Context} context
 */
async function exchange(context, { payload }) {
  const { sourceId } = payload;
  const { userId, displayName, pictureUrl } = context.event.source;
  if (sourceId !== userId) return;
  const sender = {
    name: displayName,
    iconUrl: pictureUrl,
  };

  const cards = await ScratchCard.fetchMyUnusedCards(userId);
  if (cards.length === 0) {
    return await context.replyText("窩沒有刮刮卡了", { sender });
  }

  // 計算總共可以兌換多少女神石
  const totalGodStone = cards.reduce((acc, card) => acc + card.reward, 0);
  const exchangeIds = cards.map(c => c.id);

  const trx = await ScratchCard.transaction();
  Inventory.setTransaction(trx);

  try {
    await Inventory.increaseGodStone({
      userId,
      amount: totalGodStone,
      note: "刮刮樂兌換",
    });
    await trx
      .from(ScratchCard.table)
      .update({
        is_used: true,
      })
      .whereIn("id", exchangeIds);
    await trx.commit();
  } catch (e) {
    await trx.rollback();
    throw e;
  }

  await context.replyText(`YA~我獲得了 ${totalGodStone} 個女神石`, { sender });
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

    const actualCostGodStone = affectedRows * card.price;
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

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.api.showMyCards = async (req, res) => {
  const { userId } = req.profile;
  const { limit = 10, offset = 0 } = req.query;

  const cards = await ScratchCard.fetchMyCards(userId, { limit, offset });

  res.json(cards);
};

exports.api.myCardsCount = async (req, res) => {
  const { userId } = req.profile;
  const count = await ScratchCard.fetchMyCardsCount(userId);

  res.json({ count });
};

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.api.exchange = async (req, res) => {
  const { userId } = req.profile;
  const cards = await ScratchCard.fetchMyUnusedCards(userId);
  if (cards.length === 0) {
    return res.status(400).json({ message: "你沒有可兌換的刮刮樂" });
  }

  // 計算總共可以兌換多少女神石
  const totalGodStone = cards.reduce((acc, card) => acc + card.reward, 0);
  const exchangeIds = cards.map(c => c.id);

  const trx = await ScratchCard.transaction();
  Inventory.setTransaction(trx);

  try {
    await Inventory.increaseGodStone({
      userId,
      amount: totalGodStone,
      note: "刮刮樂兌換",
    });
    await trx
      .from(ScratchCard.table)
      .update({
        is_used: true,
      })
      .whereIn("id", exchangeIds);
    await trx.commit();
  } catch (e) {
    await trx.rollback();
    throw e;
  }

  res.json({
    message: "兌換成功",
    rewards: totalGodStone,
  });
};
