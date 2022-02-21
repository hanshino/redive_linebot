const MarketDetailModel = require("../../model/application/MarketDetail");
const { get, isNull } = require("lodash");
const i18n = require("../../util/i18n");
const { inventory: InventoryModel } = require("../../model/application/Inventory");
const { DefaultLogger } = require("../../util/Logger");

/**
 * 顯示商品詳細資訊
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.show = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.profile;
  const marketDetail = await MarketDetailModel.getById(id);

  if (!marketDetail) {
    return res.status(404).json({
      message: i18n.__("api.error.notFound"),
    });
  }

  const sellTargetList = get(marketDetail, "sell_target_list", []);
  if (!sellTargetList.includes(userId) && marketDetail.seller_id !== userId) {
    return res.status(403).json({
      message: i18n.__("api.error.forbidden"),
    });
  }

  res.json(marketDetail);
};

/**
 * 進行交易
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.transaction = async (req, res) => {
  const { userId } = req.profile;
  const { id } = req.params;

  const marketDetail = await MarketDetailModel.getById(id);
  if (!marketDetail) {
    return res.status(404).json({
      message: i18n.__("api.error.notFound"),
    });
  }

  console.log(marketDetail);

  // check market status
  if (get(marketDetail, "status", -1) !== 0) {
    return res.status(403).json({
      message: i18n.__("api.error.forbidden"),
    });
  }

  const sellTargetList = get(marketDetail, "sell_target_list", []);
  if (!sellTargetList.includes(userId)) {
    return res.status(403).json({
      message: i18n.__("api.error.forbidden"),
    });
  }

  const price = get(marketDetail, "price");

  // check current user has enough money
  const { amount = 0 } = await InventoryModel.getUserMoney(userId);
  if (isNull(amount) || parseInt(amount) < price) {
    return res.status(403).json({
      message: i18n.__("api.error.transaction.notEnoughMoney"),
    });
  }

  // check current user has already bought this item
  const { amount: userOwnAmount = 0 } = await InventoryModel.getUserOwnCountByItemId(
    userId,
    get(marketDetail, "item_id")
  );
  if (parseInt(userOwnAmount) > 0) {
    return res.status(403).json({
      message: i18n.__("api.error.transaction.alreadyBought"),
    });
  }

  const trx = await InventoryModel.transaction();

  try {
    // 1. 從賣方身上扣除該商品
    const { seller_id: sellerId, item_id: itemId } = marketDetail;
    const delResult = await InventoryModel.deleteUserItem(sellerId, itemId);
    if (!delResult) throw i18n.__("api.error.transaction.removeItemFailed");

    // 2. 從買方身上新增該商品
    const invId = await InventoryModel.create({
      userId,
      itemId,
      itemAmount: 1,
    });
    if (!invId) throw i18n.__("api.error.transaction.addItemFailed");

    // 3. 從買方身上扣除該商品的價格
    const decreaseId = await InventoryModel.create({
      userId,
      itemId: 999,
      itemAmount: price * -1,
    });
    if (!decreaseId) throw i18n.__("api.error.transaction.decreaseMoneyFailed");

    // 4. 將買方的價錢轉給賣方
    const increaseId = await InventoryModel.create({
      userId: sellerId,
      itemId: 999,
      itemAmount: price,
    });
    if (!increaseId) throw i18n.__("api.error.transaction.increaseMoneyFailed");

    // 設定 MarketDetailModel 的連線
    MarketDetailModel.setTransaction(trx);

    // 5. 更新交易狀態
    const updateResult = await MarketDetailModel.setSold(id);
    if (!updateResult) throw i18n.__("api.error.transaction.updateMarketFailed");

    // commit
    await trx.commit();
    DefaultLogger.info("success transaction item", {
      userId,
      itemId,
      sellerId,
      price,
    });

    res.json({
      message: i18n.__("api.success"),
    });
  } catch (e) {
    DefaultLogger.error(e);
    await trx.rollback();
    return res.status(500).json({
      message: i18n.__("api.error.transaction.failed"),
    });
  }
};
