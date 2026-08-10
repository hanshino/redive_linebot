const PublicMarketModel = require("../model/application/PublicMarket");
const { inventory: InventoryModel } = require("../model/application/Inventory");
const { model: GachaPoolModel } = require("../model/princess/gacha");
const { resolveDisplayName } = require("./ProfileService");
const AchievementEngine = require("./AchievementEngine");
const mysql = require("../util/mysql");
const { DefaultLogger } = require("../util/Logger");

const FEE_PERCENT = 5;
const MAX_OPEN_LISTINGS = 10;
const MIN_PRICE = 1;
const MAX_PRICE = 10000000;
const GOD_STONE_ITEM_ID = 999;

/**
 * 手續費：成交價的 5%，無條件進位。手續費是「銷毀」的 —— 買家付 price，
 * 賣家收 price - fee，沒有第三方入帳，差額直接從流通量消失。
 * @param {Number} price
 * @returns {Number}
 */
function calcFee(price) {
  return Math.ceil((price * FEE_PERCENT) / 100);
}

/**
 * 賣家實收。
 * @param {Number} price
 * @returns {Number}
 */
function calcNetProceeds(price) {
  return price - calcFee(price);
}

/**
 * 價格必須是 1 ～ 10000000 的整數。
 * @param {*} price
 * @returns {Boolean}
 */
function isValidPrice(price) {
  return Number.isInteger(price) && price >= MIN_PRICE && price <= MAX_PRICE;
}

/**
 * 角色的初始星數（升星強化不隨交易轉移）。
 * @param {Object} character gacha_pool 資料列
 * @returns {Number}
 */
function baseStarOf(character) {
  const raw = character && (character.Star !== undefined ? character.Star : character.star);
  const star = parseInt(raw, 10);
  return Number.isFinite(star) && star > 0 ? star : 1;
}

/**
 * 買家取得角色時寫入的 attributes —— 一律基礎星數，不繼承賣家的升星。
 * 形狀與 GachaService / GodStoneShop 一致。
 * @param {Object} character
 * @returns {String}
 */
function baseAttributes(character) {
  return JSON.stringify([{ key: "star", value: baseStarOf(character) }]);
}

async function getBalance(userId, trx) {
  // 女神石是 append-only 帳本，餘額 = SUM(itemAmount)。
  // 帶 trx 時加上 FOR UPDATE，讓同一買家的並發購買排隊，避免用同一筆餘額買兩單。
  let query = (trx || mysql)("inventory")
    .where({ userId, itemId: GOD_STONE_ITEM_ID })
    .sum({ amount: "itemAmount" });

  if (trx) query = query.forUpdate();

  const row = await query.first();
  return Number((row && row.amount) || 0);
}

async function ownsCharacter(userId, itemId, trx) {
  const row = await (trx || mysql)("inventory")
    .where({ userId, itemId })
    .sum({ amount: "itemAmount" })
    .first();

  return Number((row && row.amount) || 0) > 0;
}

/**
 * 批次解析 displayName，同一個 userId 只查一次。
 * @param {Array<String>} userIds
 * @returns {Promise<Object>} userId -> displayName
 */
async function resolveNames(userIds) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const names = await Promise.all(unique.map(id => resolveDisplayName(id)));
  return unique.reduce((acc, id, i) => ({ ...acc, [id]: names[i] }), {});
}

/**
 * 把 model 的資料列整成 API 形狀。
 * star 一律取 gacha_pool 的基礎星數（升星不隨交易轉移），
 * baseStarOf 讀得懂 Star / star 兩種鍵，查無值退回 1。
 * @param {Object} row
 * @param {Object} [param1]
 * @param {String} [param1.viewerId] 觀看者，用來算 mine
 * @param {Object} [param1.names] userId -> displayName 對照
 * @returns {Object}
 */
function shapeListing(row, { viewerId, names = {} } = {}) {
  return {
    id: Number(row.id),
    itemId: Number(row.itemId),
    name: row.name,
    star: baseStarOf(row),
    price: Number(row.price),
    fee: Number(row.fee),
    netProceeds: Number(row.price) - Number(row.fee),
    status: row.status,
    sellerId: row.sellerId,
    sellerName: names[row.sellerId] || null,
    buyerId: row.buyerId || null,
    buyerName: row.buyerId ? names[row.buyerId] || null : null,
    mine: viewerId ? row.sellerId === viewerId : undefined,
    createdAt: row.createdAt,
    soldAt: row.soldAt || null,
    closedAt: row.closedAt || null,
  };
}

/**
 * 首頁／Flex 用的總覽數字。
 * @param {String} userId
 */
async function getSummary(userId) {
  const [balance, myOpenCount, totalOpenCount] = await Promise.all([
    getBalance(userId),
    PublicMarketModel.countOpenBySeller(userId),
    PublicMarketModel.countOpen(),
  ]);

  return {
    balance,
    myOpenCount,
    maxOpen: MAX_OPEN_LISTINGS,
    totalOpenCount,
    feePercent: FEE_PERCENT,
  };
}

/**
 * 掛單簿：目前有開放掛單的角色。
 * @returns {Promise<Array<Object>>}
 */
async function getOpenCharacters() {
  const rows = await PublicMarketModel.getOpenCharacters();
  return rows.map(row => ({
    itemId: Number(row.itemId),
    name: row.name,
    star: baseStarOf(row),
    headImage: row.headImage,
    listingCount: Number(row.listingCount),
    minPrice: Number(row.minPrice),
  }));
}

/**
 * 某角色的開放掛單，價低優先。
 * @param {Number} itemId
 * @param {String} viewerId
 */
async function getListingsByItemId(itemId, viewerId) {
  const rows = await PublicMarketModel.getOpenListingsByItemId(itemId);
  const names = await resolveNames(rows.map(r => r.sellerId));

  return rows.map(row => {
    const listing = shapeListing(row, { viewerId, names });
    // 掛單簿列表不需要買家欄位（open 掛單本來就沒買家）
    delete listing.buyerId;
    delete listing.buyerName;
    delete listing.soldAt;
    delete listing.closedAt;
    delete listing.status;
    return listing;
  });
}

/**
 * 判斷觀看者能不能買這張單，以及不能買的原因。
 * 前端會依 blockReason 換整頁畫面，所以順序不能亂：
 * 單子本身不是 open 最優先，其次才是觀看者身分。
 */
function resolveBlockReason({ status, isSeller, owns, balance, price }) {
  if (status !== "open") return "NOT_OPEN";
  if (isSeller) return "IS_SELLER";
  if (owns) return "ALREADY_OWNED";
  if (balance < price) return "INSUFFICIENT_FUNDS";
  return null;
}

/**
 * 單張掛單 + 觀看者情境。
 * @param {Number} id
 * @param {String} viewerId
 */
async function getListingDetail(id, viewerId) {
  const row = await PublicMarketModel.getById(id);
  if (!row) return null;

  const [names, balance, owns] = await Promise.all([
    resolveNames([row.sellerId, row.buyerId]),
    getBalance(viewerId),
    ownsCharacter(viewerId, row.itemId),
  ]);

  const listing = shapeListing(row, { viewerId, names });
  const isSeller = row.sellerId === viewerId;
  const blockReason = resolveBlockReason({
    status: row.status,
    isSeller,
    owns,
    balance,
    price: listing.price,
  });

  delete listing.mine;

  return {
    ...listing,
    viewer: {
      balance,
      ownsCharacter: owns,
      isSeller,
      canBuy: blockReason === null,
      blockReason,
    },
  };
}

/**
 * 建立掛單。
 *
 * ponytail: 掛單「不」把角色從 inventory 移走 —— 純狀態列，取消就是把 status 翻成
 * cancelled，賣家的升星強化自始至終沒被動過（對應文案「解除鎖定，不收手續費，
 * 升星強化留在你手上」）。反正成交當下無論如何都得重驗賣家還在不在（錯誤碼
 * SELLER_LOST_ITEM 就是為此存在），先搬走只是多一條要回滾的路徑，不會少一次驗證。
 * 代價：角色可能同時被別的功能消耗掉，此時該單在成交時自動轉 invalid 下架。
 *
 * @param {String} sellerId
 * @param {Object} param1
 * @param {Number} param1.itemId
 * @param {Number} param1.price
 */
async function createListing(sellerId, { itemId, price }) {
  if (!isValidPrice(price)) {
    return { ok: false, code: "INVALID_PRICE" };
  }

  if (!Number.isInteger(itemId) || itemId <= 0 || itemId === GOD_STONE_ITEM_ID) {
    return { ok: false, code: "NOT_OWNED" };
  }

  const openCount = await PublicMarketModel.countOpenBySeller(sellerId);
  if (openCount >= MAX_OPEN_LISTINGS) {
    return { ok: false, code: "LISTING_CAP", myOpenCount: openCount, maxOpen: MAX_OPEN_LISTINGS };
  }

  if (!(await ownsCharacter(sellerId, itemId))) {
    return { ok: false, code: "NOT_OWNED" };
  }

  const duplicated = await PublicMarketModel.findOpenBySellerAndItem(sellerId, itemId);
  if (duplicated) {
    return { ok: false, code: "ALREADY_LISTED" };
  }

  const id = await PublicMarketModel.create({
    seller_id: sellerId,
    item_id: itemId,
    price,
    fee: calcFee(price),
    status: "open",
  });

  const row = await PublicMarketModel.getById(id);
  const names = await resolveNames([sellerId]);
  const listing = shapeListing(row, { viewerId: sellerId, names });

  return { ok: true, listing };
}

/**
 * 賣家取消掛單。不收手續費，角色本來就沒離開過賣家身上。
 * @param {Number} id
 * @param {String} userId
 */
async function cancelListing(id, userId) {
  const row = await PublicMarketModel.find(id);
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (row.seller_id !== userId) return { ok: false, code: "FORBIDDEN" };
  if (row.status !== "open") return { ok: false, code: "NOT_OPEN" };

  const affected = await PublicMarketModel.markClosed(id, "cancelled");
  if (!affected) return { ok: false, code: "NOT_OPEN" };

  return { ok: true, listingId: Number(id) };
}

/**
 * 執行購買。整段包在單一 mysql.transaction 內。
 *
 * 競態安全靠兩層：
 * 1. 進交易先 `SELECT ... FOR UPDATE` 鎖住掛單列，後到的買家會卡住直到前一筆
 *    commit，醒來時讀到的已是 sold。
 * 2. 收尾的 UPDATE 帶 `WHERE status = 'open'`，受影響列數為 0 就整筆 rollback。
 *    即使 1 因故失效也不可能兩個買家都成功。
 *
 * 成交後（交易外）替買賣雙方結算 trade_complete 成就，與 1 對 1 交易的做法一致。
 *
 * @param {Number} id
 * @param {String} buyerId
 * @returns {Promise<Object>} `{ ok: true, ... }` 或 `{ ok: false, code }`
 */
async function purchase(id, buyerId) {
  let result;

  try {
    await mysql.transaction(async trx => {
      const listing = await PublicMarketModel.lockById(id, trx);
      if (!listing) {
        result = { ok: false, code: "NOT_FOUND" };
        return;
      }

      if (listing.status !== "open") {
        result = { ok: false, code: "ALREADY_TAKEN" };
        return;
      }

      const sellerId = listing.seller_id;
      const itemId = Number(listing.item_id);
      const price = Number(listing.price);
      const fee = Number(listing.fee);

      if (sellerId === buyerId) {
        result = { ok: false, code: "IS_SELLER" };
        return;
      }

      if (await ownsCharacter(buyerId, itemId, trx)) {
        result = { ok: false, code: "ALREADY_OWNED" };
        return;
      }

      const balance = await getBalance(buyerId, trx);
      if (balance < price) {
        result = {
          ok: false,
          code: "INSUFFICIENT_FUNDS",
          balance,
          price,
          shortfall: price - balance,
        };
        return;
      }

      // 賣家可能在掛單後把角色弄丟（其他功能消耗）。刪除受影響列數為 0 即代表已無此角色，
      // 此時把掛單標記 invalid 自動下架，且不動任何女神石。
      const removed = await InventoryModel.deleteUserItem(sellerId, itemId, trx);
      if (!removed) {
        await PublicMarketModel.markClosed(id, "invalid", trx);
        result = { ok: false, code: "SELLER_LOST_ITEM" };
        return;
      }

      const character = await GachaPoolModel.find(itemId, trx);

      // 升星強化不轉移：買家拿到的是基礎星數。
      await InventoryModel.create(
        {
          userId: buyerId,
          itemId,
          itemAmount: 1,
          attributes: baseAttributes(character),
          note: `public_market:buy:${id}`,
        },
        trx
      );

      await InventoryModel.decreaseGodStone({
        userId: buyerId,
        amount: price,
        note: `public_market:buy:${id}`,
        trx,
      });

      // 手續費銷毀：賣家只入帳 price - fee，沒有任何第三方收到 fee。
      await InventoryModel.increaseGodStone({
        userId: sellerId,
        amount: price - fee,
        note: `public_market:sell:${id}`,
        trx,
      });

      const sold = await PublicMarketModel.markSold(id, buyerId, trx);
      if (!sold) {
        // 理論上被 FOR UPDATE 擋掉了，走到這裡代表有人繞過鎖，整筆回滾比較安全。
        throw new Error("PUBLIC_MARKET_RACE");
      }

      result = {
        ok: true,
        listingId: Number(id),
        itemId,
        name: character ? character.Name : null,
        // sellerId 只給 commit 後的成就結算用；router 的回應欄位是白名單，不會外流
        sellerId,
        price,
        fee,
        netProceeds: price - fee,
        balanceAfter: balance - price,
      };
    });
  } catch (e) {
    if (e && e.message === "PUBLIC_MARKET_RACE") {
      return { ok: false, code: "ALREADY_TAKEN" };
    }
    DefaultLogger.error(e);
    throw e;
  }

  // 成就結算一定要在 commit 之後：放在交易內的話，後續 rollback 會留下已發的成就，
  // 而且成就自己的寫入會把掛單的行鎖一路撐住。失敗一律吞掉，不能反過來弄壞已成交的交易。
  if (result && result.ok) {
    await Promise.all([
      AchievementEngine.evaluate(buyerId, "trade_complete", {}).catch(() => {}),
      AchievementEngine.evaluate(result.sellerId, "trade_complete", {}).catch(() => {}),
    ]);
  }

  return result;
}

/**
 * 我的掛單：開放中 + 已結束。
 * @param {String} userId
 */
async function getMyListings(userId) {
  const [openRows, closedRows] = await Promise.all([
    PublicMarketModel.getOpenListingsBySeller(userId),
    PublicMarketModel.getClosedListingsByUser(userId),
  ]);

  const names = await resolveNames([
    ...openRows.map(r => r.sellerId),
    ...closedRows.map(r => r.sellerId),
    ...closedRows.map(r => r.buyerId),
  ]);

  const open = openRows.map(row => {
    const listing = shapeListing(row, { viewerId: userId, names });
    delete listing.buyerId;
    delete listing.buyerName;
    return listing;
  });

  const closed = closedRows.map(row => {
    const listing = shapeListing(row, { viewerId: userId, names });
    const role = row.sellerId === userId ? "seller" : "buyer";
    const counterpartyId = role === "seller" ? row.buyerId : row.sellerId;

    return {
      ...listing,
      role,
      counterpartyId: counterpartyId || null,
      counterpartyName: counterpartyId ? names[counterpartyId] || null : null,
    };
  });

  return { open, closed };
}

module.exports = {
  FEE_PERCENT,
  MAX_OPEN_LISTINGS,
  MIN_PRICE,
  MAX_PRICE,
  calcFee,
  calcNetProceeds,
  isValidPrice,
  baseStarOf,
  baseAttributes,
  resolveBlockReason,
  getBalance,
  ownsCharacter,
  getSummary,
  getOpenCharacters,
  getListingsByItemId,
  getListingDetail,
  createListing,
  cancelListing,
  purchase,
  getMyListings,
};
