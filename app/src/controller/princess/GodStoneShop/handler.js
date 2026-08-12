const InventoryModel = require("../../../model/application/Inventory");
const GodStoneShopModel = require("../../../model/princess/GodStoneShop");
const GachaModel = require("../../../model/princess/gacha");
const gacha = GachaModel.model;
const mysql = require("../../../util/mysql");
const i18n = require("../../../util/i18n");
const AchievementEngine = require("../../../service/AchievementEngine");

const GOD_STONE_ITEM_ID = 999;

// i18n 的 `updateFiles: false` 讓查無的 key 直接回傳 key 字串本身，
// 而 locales/zh_tw.json 不在這次的改動範圍內，所以這條訊息先寫死。
// 真正的前端送不出這種請求（寫死 itemCount: 1），會看到它的只有直接打 API 的人。
const INVALID_ITEM_COUNT_MESSAGE = "兌換數量不正確，一次只能兌換一個";

/**
 * 兌換數量的信任邊界。
 *
 * 商店的商品是角色，角色一人一隻 —— 前端寫死送 1，價格也是「一份」的價格。
 * 但這是使用者可控的輸入：送 itemCount: 5 進來，舊碼會照 price × 1 扣款卻寫入
 * itemAmount: 5，等於用一份的錢拿五份；送負數則反而把持有量寫成負的。
 * 所以這裡不做「夾在合法範圍」而是嚴格只收整數 1，其餘一律擋掉 ——
 * 商業上本來就沒有第二種合法值，放寬只會多開一條要驗的路。
 *
 * 字串 "1" 也接受：JSON body 經過某些客戶端會變成字串，那不是攻擊。
 * 但 1.0 以外的浮點、"1abc"、true、[1] 全部拒絕。
 *
 * @param {*} value
 * @returns {Boolean}
 */
function isValidItemCount(value) {
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return /^\s*1\s*$/.test(value);
  return false;
}

/**
 * itemId 必須是正整數，且不能是女神石本身（999）——
 * 拿女神石當商品會走進「用女神石買女神石」的自我扣款路徑。
 *
 * 只收 number 或數字字串：`Number(true)` 是 1、`Number([101])` 是 101，
 * 直接 Number() 會讓 `true` / `[101]` 這種輸入變成合法的商品編號。
 *
 * @param {*} value
 * @returns {Boolean}
 */
function isValidItemId(value) {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !/^\s*\d+\s*$/.test(value)) return false;

  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id !== GOD_STONE_ITEM_ID;
}

/**
 * 使用女神石兌換物品
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
exports.exchangeItem = async function (req, res) {
  const { userId } = req.profile;
  const { itemId: rawItemId, itemCount } = req.body;

  if (!isValidItemId(rawItemId)) {
    return res.status(400).json({
      error: i18n.__("api.error.gacha.shop.itemNotFound"),
    });
  }

  if (!isValidItemCount(itemCount)) {
    return res.status(400).json({
      error: INVALID_ITEM_COUNT_MESSAGE,
    });
  }

  const itemId = Number(rawItemId);
  // 通過驗證後數量恆為 1，後面一律用這個常數，不再碰使用者送來的值。
  const quantity = 1;

  // 快速失敗：已擁有就不用再往下查商品／開交易。
  // 這只是省一趟來回，真正說了算的是交易內那次 locking read（見下方）。
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

  const price = parseInt(itemInfo.price, 10);
  // 商品價格來自 DB，理論上可信，但壞資料（NULL／非數字／負數）會讓扣款變成加錢。
  if (!Number.isInteger(price) || price < 0) {
    return res.status(400).json({
      error: i18n.__("api.error.gacha.shop.itemNotFound"),
    });
  }

  const character = await gacha.find(itemId);
  if (!character) {
    return res.status(400).json({
      error: i18n.__("api.error.gacha.shop.itemNotFound"),
    });
  }

  let outcome;

  // 女神石是 append-only 帳本（餘額 = SUM(itemAmount)）。
  // 舊寫法是「讀餘額 → 刪掉使用者所有 999 列 → 插一列剩餘額」，等於把整本帳
  // 壓成單一列：只要在讀跟刪之間有任何一筆入帳（公開市場退款、成交撥款、轉帳），
  // 那筆錢會連同舊列一起被刪除且不在剩餘額裡 —— 使用者的錢憑空消失。
  // 改成只 append 一列負數，其他來源的列碰都不碰。
  //
  // 鎖序：先鎖 999（餘額）再鎖 itemId（持有），與 PublicMarketService 的
  // 「999 → itemId」一致，兩邊交錯執行不會反向取鎖。
  await mysql.transaction(async trx => {
    const balanceRow = await trx("inventory")
      .where({ userId, itemId: GOD_STONE_ITEM_ID })
      .sum({ amount: "itemAmount" })
      .forUpdate()
      .first();
    const godStone = Number((balanceRow && balanceRow.amount) || 0);

    // 權威的重複持有檢查。交易外那次是快取式的 fast-path，讀的是自己交易開始前的
    // 快照，兩個並發請求會雙雙看到「還沒有」而各寫入一次，同一角色拿到兩隻。
    // FOR UPDATE 讀最新已提交版本並上鎖，後到的那筆在這裡排隊，醒來就看得到。
    const ownedRow = await trx("inventory")
      .where({ userId, itemId })
      .sum({ amount: "itemAmount" })
      .forUpdate()
      .first();
    if (Number((ownedRow && ownedRow.amount) || 0) > 0) {
      outcome = { ok: false, code: "exchanged" };
      return;
    }

    if (godStone < price) {
      outcome = { ok: false, code: "notEnoughGodStone" };
      return;
    }

    await InventoryModel.inventory.create(
      {
        userId,
        itemId,
        itemAmount: quantity,
        attributes: JSON.stringify([{ key: "star", value: character.Star }]),
        note: `god_stone_shop:exchange:${itemId}`,
      },
      trx
    );

    await InventoryModel.inventory.decreaseGodStone({
      userId,
      amount: price,
      note: `god_stone_shop:exchange:${itemId}`,
      trx,
    });

    outcome = { ok: true, remainGodStone: godStone - price };
  });

  if (!outcome.ok) {
    return res.status(400).json({
      error: i18n.__(`api.error.gacha.shop.${outcome.code}`),
    });
  }

  await AchievementEngine.evaluate(userId, "shop_exchange", {
    spend: price * quantity,
  }).catch(() => {});

  res.json({ userId, itemId, itemCount: quantity, remainGodStone: outcome.remainGodStone });
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
