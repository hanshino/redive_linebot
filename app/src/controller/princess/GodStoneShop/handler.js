const InventoryModel = require("../../../model/application/Inventory");
const GodStoneShopModel = require("../../../model/princess/GodStoneShop");
const GachaModel = require("../../../model/princess/gacha");
const gacha = GachaModel.model;
const i18n = require("../../../util/i18n");

/**
 * 使用女神石兌換物品
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.exchangeItem = async function (req, res) {
  const { userId } = req.profile;
  const { itemId, itemCount } = req.body;

  // 檢查要兌換的目標物品是否已存在
  const targetList = await InventoryModel.fetchUserOwnItems(userId, [itemId]);
  if (targetList.length !== 0) {
    return res.status(400).json({
      error: i18n.__("api.error.gacha.shop.exchanged"),
    });
  }

  // 取得商品資訊
  const itemInfo = await GodStoneShopModel.findByItemId(itemId);
  if (!itemInfo) {
    return res.status(400).json({
      error: i18n.__("api.error.gacha.shop.itemNotFound"),
    });
  }

  // 檢查是否有足夠的女神石
  const godStone = await GachaModel.getUserGodStoneCount(userId);
  if (godStone < itemInfo.price) {
    return res.status(400).json({
      error: i18n.__("api.error.gacha.shop.notEnoughGodStone"),
    });
  }

  const character = await gacha.find(itemId);

  // 兌換物品
  // 1. 扣除女神石
  // 2. 加入物品
  const remainGodStone = parseInt(godStone) - parseInt(itemInfo.price);
  console.log("使用女神石兌換物品", itemInfo.price, remainGodStone, godStone);
  await InventoryModel.deleteItem(userId, 999);
  await InventoryModel.insertItems([
    {
      userId,
      itemId,
      itemAmount: itemCount,
      attributes: JSON.stringify([{ key: "star", value: character.Star }]),
    },
    { userId, itemId: 999, itemAmount: remainGodStone },
  ]);

  res.json({ userId, itemId, itemCount, remainGodStone });
};

/**
 * 查看用戶兌換記錄
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.history = async function (req, res) {
  const { userId } = req.profile;

  const shopList = (await GodStoneShopModel.all()).map(item => item.itemId);
  const [holdingList, godStone] = await Promise.all([
    InventoryModel.fetchUserOwnItems(userId, shopList),
    GachaModel.getUserGodStoneCount(userId),
  ]);

  res.json({ userId, holdingList, shopList, godStone: parseInt(godStone) });
};

/**
 * 新增女神石商品
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.addGodStoneShopItem = async function (req, res) {
  const { id, price, item_image } = req.body;

  await GodStoneShopModel.create({
    item_id: id,
    item_image,
    price,
  });

  res.json({ item_id: id, price, item_image });
};

/**
 * 刪除女神石商品
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.destroyGodStoneShopItem = async function (req, res) {
  const { id } = req.params;

  try {
    const result = await GodStoneShopModel.delete(id);

    if (!result) {
      throw i18n.__("api.error.gacha.shop.itemNotFound");
    }

    res.json({});
  } catch (e) {
    return res.status(400).json({
      error: e,
    });
  }
};

/**
 * 更新女神石商品
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.updateGodStoneShopItem = async function (req, res) {
  const { id, price, item_image } = req.body;

  try {
    const result = await GodStoneShopModel.update(id, {
      price,
      item_image,
    });

    if (!result) {
      throw i18n.__("api.error.gacha.shop.itemNotFound");
    }

    res.json({});
  } catch (e) {
    return res.status(400).json({
      error: e,
    });
  }
};
