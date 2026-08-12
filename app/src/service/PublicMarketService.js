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

const SELL = "sell";
const BUY = "buy";

/**
 * 委託方向。缺值一律當賣單 —— 第一階段的資料與連結全部沒有這個欄位。
 * @param {*} value
 * @returns {"sell"|"buy"}
 */
function normalizeOrderType(value) {
  return String(value == null ? SELL : value).toLowerCase() === BUY ? BUY : SELL;
}

/**
 * 嚴格版：只接受 sell / buy / 缺省，其餘回 null 讓呼叫端擋下來。
 * 發布委託是會動到錢的動作，方向拼錯不能靜靜地當成賣單。
 * @param {*} value
 * @returns {?("sell"|"buy")}
 */
function parseOrderType(value) {
  if (value === undefined || value === null || value === "") return SELL;
  const normalized = String(value).toLowerCase();
  return normalized === SELL || normalized === BUY ? normalized : null;
}

/**
 * 手續費：成交價的 5%，無條件進位。手續費是「銷毀」的 —— 買家付 price，
 * 賣家收 price - fee，沒有第三方入帳，差額直接從流通量消失。
 * 兩個方向的算法完全一樣，只是誰先付錢不同。
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
  // 帶 trx 時加上 FOR UPDATE，讓同一使用者的並發扣款排隊，避免用同一筆餘額付兩次。
  let query = (trx || mysql)("inventory")
    .where({ userId, itemId: GOD_STONE_ITEM_ID })
    .sum({ amount: "itemAmount" });

  if (trx) query = query.forUpdate();

  const row = await query.first();
  return Number((row && row.amount) || 0);
}

/**
 * 持有判定。
 *
 * 帶 trx 時是 locking read：REPEATABLE READ 下的普通 SELECT 讀的是交易開始時的快照，
 * 「檢查完到寫入之間」對方剛拿到角色的話這裡會看不到（賣單購買的既有破口 —— 買家
 * 在同一瞬間抽到同一隻角色，仍會成交而變成重複持有）。FOR UPDATE 讀最新已提交版本
 * 並鎖住，把那個空窗關掉。
 *
 * @param {String} userId
 * @param {Number} itemId
 * @param {import("knex").Knex.Transaction} [trx]
 * @returns {Promise<Boolean>}
 */
async function ownsCharacter(userId, itemId, trx) {
  let query = (trx || mysql)("inventory").where({ userId, itemId }).sum({ amount: "itemAmount" });

  if (trx) query = query.forUpdate();

  const row = await query.first();
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
 * 發布這張單的人：賣單是賣家，收購單是買家。
 * 收購單開放期間 seller_id 是 NULL（還沒人履約），所以不能一律看 seller_id。
 * @param {Object} row model 的 API 形狀資料列（camelCase）
 * @returns {?String}
 */
function requesterIdOf(row) {
  return normalizeOrderType(row.orderType) === BUY ? row.buyerId || null : row.sellerId || null;
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
  const orderType = normalizeOrderType(row.orderType);
  const price = Number(row.price);
  const requesterId = requesterIdOf({ ...row, orderType });

  const listing = {
    id: Number(row.id),
    itemId: Number(row.itemId),
    orderType,
    name: row.name,
    star: baseStarOf(row),
    price,
    fee: Number(row.fee),
    netProceeds: price - Number(row.fee),
    status: row.status,
    sellerId: row.sellerId || null,
    sellerName: row.sellerId ? names[row.sellerId] || null : null,
    buyerId: row.buyerId || null,
    buyerName: row.buyerId ? names[row.buyerId] || null : null,
    mine: viewerId ? requesterId === viewerId : undefined,
    createdAt: row.createdAt,
    soldAt: row.soldAt || null,
    closedAt: row.closedAt || null,
  };

  // 收購單一旦取消／失效，預扣的女神石一定已全額退回（退款與狀態變更同一筆交易）。
  // 前端要寫出實際金額，這裡直接給，省得它自己猜。
  if (orderType === BUY && (row.status === "cancelled" || row.status === "invalid")) {
    listing.refundedAmount = price;
  }

  return listing;
}

/**
 * 首頁／Flex 用的總覽數字。
 * myOpenCount 是賣單 + 收購單「合計」，上限兩者共用。
 * @param {String} userId
 */
async function getSummary(userId) {
  const [balance, myOpenCount, totalOpenCount] = await Promise.all([
    getBalance(userId),
    PublicMarketModel.countOpenByRequester(userId),
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
 * 掛單簿：某方向目前有開放掛單的角色。
 * bestPrice 的語意隨方向翻轉：賣單是最低售價，收購單是最高收購價。
 * @param {"sell"|"buy"} [orderType]
 * @returns {Promise<Array<Object>>}
 */
async function getOpenCharacters(orderType = SELL) {
  const type = normalizeOrderType(orderType);
  const rows = await PublicMarketModel.getOpenCharacters(type);

  return rows.map(row => ({
    itemId: Number(row.itemId),
    orderType: type,
    name: row.name,
    star: baseStarOf(row),
    headImage: row.headImage,
    listingCount: Number(row.listingCount),
    bestPrice: Number(row.bestPrice),
  }));
}

/**
 * 某角色某方向的開放掛單。賣單價低優先、收購單價高優先。
 * @param {Number} itemId
 * @param {String} viewerId
 * @param {"sell"|"buy"} [orderType]
 */
async function getListingsByItemId(itemId, viewerId, orderType = SELL) {
  const type = normalizeOrderType(orderType);
  const rows = await PublicMarketModel.getOpenListingsByItemId(itemId, type);
  const names = await resolveNames(rows.map(r => (type === BUY ? r.buyerId : r.sellerId)));

  return rows.map(row => {
    const listing = shapeListing({ ...row, orderType: type }, { viewerId, names });

    // open 掛單沒有對手方，把還沒有意義的欄位剪掉：
    // 賣單沒有買家、收購單沒有賣家。
    if (type === BUY) {
      delete listing.sellerId;
      delete listing.sellerName;
    } else {
      delete listing.buyerId;
      delete listing.buyerName;
    }
    delete listing.soldAt;
    delete listing.closedAt;
    delete listing.status;
    return listing;
  });
}

/**
 * 判斷觀看者能不能操作這張單，以及不能的原因。
 * 前端會依 blockReason 換整頁畫面，所以順序不能亂：
 * 單子本身不是 open 最優先，其次才是觀看者身分。
 *
 * 兩個方向的守門條件不同：
 *   sell —— 我要付錢買，所以看「是不是自己掛的 / 已經有了 / 錢夠不夠」
 *   buy  —— 我要交出角色換錢，所以看「是不是自己發的 / 有沒有那隻角色」。
 *            買家的錢在發單時就預扣了，履約時不需要再驗餘額。
 *
 * @param {Object} param0
 * @param {"sell"|"buy"} [param0.orderType]
 * @returns {?String}
 */
function resolveBlockReason({ orderType, status, isSeller, isRequester, owns, balance, price }) {
  if (status !== "open") return "NOT_OPEN";

  if (normalizeOrderType(orderType) === BUY) {
    if (isRequester) return "IS_BUYER";
    if (!owns) return "NOT_OWNED";
    return null;
  }

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
  const isBuyOrder = listing.orderType === BUY;
  const isSeller = !isBuyOrder && row.sellerId === viewerId;
  const isRequester = isBuyOrder && row.buyerId === viewerId;

  const blockReason = resolveBlockReason({
    orderType: listing.orderType,
    status: row.status,
    isSeller,
    isRequester,
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
      // 收購單的發布者是買家；前端兩個名字都認，兩邊都給省得它猜。
      isBuyer: isRequester,
      isRequester,
      canBuy: !isBuyOrder && blockReason === null,
      canFulfill: isBuyOrder && blockReason === null,
      blockReason,
    },
  };
}

/**
 * 建立賣出委託。
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
async function createSellListing(sellerId, { itemId, price }) {
  // 上限是賣單 + 收購單合計，兩種單都佔同一個配額。
  const openCount = await PublicMarketModel.countOpenByRequester(sellerId);
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
    order_type: SELL,
    seller_id: sellerId,
    item_id: itemId,
    price,
    fee: calcFee(price),
    status: "open",
  });

  const row = await PublicMarketModel.getById(id);
  const names = await resolveNames([sellerId]);

  return { ok: true, listing: shapeListing(row, { viewerId: sellerId, names }) };
}

/**
 * 建立收購委託。
 *
 * 與賣單最大的差別：收購單「先付錢」。發布當下就把全額從買家帳上扣走（預扣／escrow），
 * 履約時買家不再扣款。理由是履約的人交出的是不可逆的資產（角色離開 box），
 * 不能讓他成交後才發現對方沒錢 —— 那筆角色收不回來。
 *
 * 交易內的順序固定為：
 *   1. 餘額 locking read —— 同一買家的並發發單在這裡排隊，這是本流程唯一的序列化點。
 *      因為它先跑，之後的計數／重複檢查讀到的都是前一筆 commit 之後的狀態，
 *      掛單上限與「同角色一張」不需要再各自加鎖（在 public_market 上加範圍鎖會與
 *      purchase / fulfill 的「掛單列 → inventory」鎖序相反，換來死鎖）。
 *   2. 掛單數合計檢查
 *   3. 持有／重複單檢查
 *   4. 寫入掛單列
 *   5. 預扣
 * 先鎖錢再做其他檢查，是因為之後才鎖的話，兩張同時進來的單會各自讀到扣款前的餘額，
 * 兩張都通過檢查而把餘額扣成負的。
 *
 * @param {String} buyerId
 * @param {Object} param1
 * @param {Number} param1.itemId
 * @param {Number} param1.price
 */
async function createBuyOrder(buyerId, { itemId, price }) {
  let result;

  await mysql.transaction(async trx => {
    const balance = await getBalance(buyerId, trx);

    const openCount = await PublicMarketModel.countOpenByRequester(buyerId, trx);
    if (openCount >= MAX_OPEN_LISTINGS) {
      result = {
        ok: false,
        code: "LISTING_CAP",
        myOpenCount: openCount,
        maxOpen: MAX_OPEN_LISTINGS,
      };
      return;
    }

    // 角色一人一隻：已經有的角色收購回來也不會生效，等於白鎖一筆錢。
    if (await ownsCharacter(buyerId, itemId, trx)) {
      result = { ok: false, code: "ALREADY_OWNED" };
      return;
    }

    const duplicated = await PublicMarketModel.findOpenBuyByBuyerAndItem(buyerId, itemId, trx);
    if (duplicated) {
      result = { ok: false, code: "ALREADY_REQUESTED" };
      return;
    }

    if (balance < price) {
      result = {
        ok: false,
        code: "NOT_ENOUGH_TO_RESERVE",
        balance,
        price,
        shortfall: price - balance,
      };
      return;
    }

    const id = await PublicMarketModel.create(
      {
        order_type: BUY,
        buyer_id: buyerId,
        // 收購單開著的時候還不知道誰會賣，成交才寫入履約者。
        seller_id: null,
        item_id: itemId,
        price,
        fee: calcFee(price),
        status: "open",
      },
      trx
    );

    await InventoryModel.decreaseGodStone({
      userId: buyerId,
      amount: price,
      note: `public_market:buy_order:reserve:${id}`,
      trx,
    });

    const row = await PublicMarketModel.getById(id, trx);
    result = { ok: true, id, row, balanceAfter: balance - price };
  });

  if (!result.ok) return result;

  const names = await resolveNames([buyerId]);

  return {
    ok: true,
    listing: {
      ...shapeListing(result.row, { viewerId: buyerId, names }),
      // 前端要立刻寫出「已預扣」後的錢包數字，不用再打一次 summary。
      balanceAfter: result.balanceAfter,
    },
  };
}

/**
 * 建立委託。缺省或 sell 走賣單，buy 走收購單。
 * @param {String} userId
 * @param {Object} param1
 * @param {Number} param1.itemId
 * @param {Number} param1.price
 * @param {"sell"|"buy"} [param1.orderType]
 */
async function createListing(userId, { itemId, price, orderType }) {
  const type = parseOrderType(orderType);
  if (type === null) {
    return { ok: false, code: "INVALID_ORDER_TYPE" };
  }

  if (!isValidPrice(price)) {
    return { ok: false, code: "INVALID_PRICE" };
  }

  // itemId 999 是女神石本身，不是角色，兩個方向都不准拿來掛單。
  if (!Number.isInteger(itemId) || itemId <= 0 || itemId === GOD_STONE_ITEM_ID) {
    return { ok: false, code: type === BUY ? "INVALID_ITEM" : "NOT_OWNED" };
  }

  try {
    return type === BUY
      ? await createBuyOrder(userId, { itemId, price })
      : await createSellListing(userId, { itemId, price });
  } catch (e) {
    DefaultLogger.error(e);
    throw e;
  }
}

/**
 * 發布者取消自己的委託。
 *
 * 賣單：不收手續費，角色本來就沒離開過賣家身上。
 * 收購單：預扣的女神石全額退回，且只能退一次 —— 退款綁在「條件式關閉真的改到那一列」
 * 這件事上（markClosed 回傳受影響列數）。兩個請求同時打進來時只有一個會拿到 1，
 * 另一個看到 0 就當作已結束處理，不會再退第二次。
 *
 * @param {Number} id
 * @param {String} userId
 */
async function cancelListing(id, userId) {
  let result;

  try {
    await mysql.transaction(async trx => {
      const listing = await PublicMarketModel.lockById(id, trx);
      if (!listing) {
        result = { ok: false, code: "NOT_FOUND" };
        return;
      }

      const orderType = normalizeOrderType(listing.order_type);
      const requesterId = orderType === BUY ? listing.buyer_id : listing.seller_id;

      if (requesterId !== userId) {
        result = { ok: false, code: "FORBIDDEN" };
        return;
      }

      if (listing.status !== "open") {
        result = { ok: false, code: "NOT_OPEN" };
        return;
      }

      const affected = await PublicMarketModel.markClosed(id, "cancelled", trx);
      if (!affected) {
        result = { ok: false, code: "NOT_OPEN" };
        return;
      }

      if (orderType !== BUY) {
        result = { ok: true, listingId: Number(id) };
        return;
      }

      const price = Number(listing.price);
      await InventoryModel.increaseGodStone({
        userId,
        amount: price,
        note: `public_market:buy_order:refund:cancel:${id}`,
        trx,
      });

      result = { ok: true, listingId: Number(id), refundedAmount: price };
    });
  } catch (e) {
    DefaultLogger.error(e);
    throw e;
  }

  return result;
}

/**
 * 買下一張賣單。整段包在單一 mysql.transaction 內。
 *
 * 競態安全靠兩層：
 * 1. 進交易先 `SELECT ... FOR UPDATE` 鎖住掛單列，後到的買家會卡住直到前一筆
 *    commit，醒來時讀到的已是 sold。
 * 2. 收尾的 UPDATE 帶 `WHERE status = 'open'`，受影響列數為 0 就整筆 rollback。
 *    即使 1 因故失效也不可能兩個買家都成功。
 *
 * 鎖序固定為「掛單列 → 買方 999（餘額）→ 買方 itemId（持有）→ 賣方 itemId」。
 * 同一使用者的 inventory 內部也照 itemId 由小到大：999 這個 itemId 比任何角色 ID 都大，
 * 但重點不是數值大小，而是每條路徑都用同一個順序 —— fulfill 沒有買方餘額鎖，
 * 其餘步驟落在同一條序列上，所以兩條路徑交錯執行不會形成環。
 *
 * 成就結算在 commit 之後（交易外）替買賣雙方結算 trade_complete，與 1 對 1 交易的做法一致。
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

      // 收購單要用 fulfill 履約，這條路徑只處理賣單。
      if (normalizeOrderType(listing.order_type) === BUY) {
        result = { ok: false, code: "WRONG_ORDER_TYPE" };
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

      // 鎖序：先鎖買方的 999（餘額），再鎖買方持有的 itemId，最後才動賣方的 itemId。
      // 這與 createBuyOrder / fulfill 走的是同一條序列 —— 先前是 itemId 先於 999，
      // 兩條路徑對同一個買家反向取鎖就有死鎖。讀的順序改了，但「檢查」的先後不變：
      // 已持有仍優先於餘額不足回報，錯誤碼與既有行為完全一致。
      const balance = await getBalance(buyerId, trx);

      if (await ownsCharacter(buyerId, itemId, trx)) {
        result = { ok: false, code: "ALREADY_OWNED" };
        return;
      }

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
 * 履約一張收購單：把自己的角色賣給發單的買家。
 *
 * 金流與賣單相反 —— 錢在發單時就預扣了，這裡只做「撥款 + 交付角色」，
 * 買家不會被再扣一次。手續費一樣是銷毀，履約者實收 price - fee。
 *
 * 三種不成交的情形，處理方式刻意不同：
 * 1. 履約者手上沒有這隻角色（NOT_OWNED）—— 收購單「保持 open」。
 *    如果這裡順手把單子作廢，任何人都能用一個沒有角色的帳號把別人的收購單掃光，
 *    那是免費的惡意下架管道。所以不動狀態、不退款、什麼都不寫。
 * 2. 買家自己已經拿到角色了（ALREADY_OWNED_REQUESTER）—— 這張單再也不可能成交，
 *    同一筆交易內作廢並把預扣全額退回買家，回傳讓前端能認的碼與退款金額。
 * 3. 其他人先成交／先取消（ALREADY_TAKEN）—— 不退款，錢在那條路徑上已經處理過。
 *
 * 鎖序與 purchase 相同：掛單列 → 買方 inventory → 賣方 inventory。
 *
 * @param {Number} id
 * @param {String} sellerId 履約者（交出角色的人）
 */
async function fulfill(id, sellerId) {
  let result;

  try {
    await mysql.transaction(async trx => {
      const listing = await PublicMarketModel.lockById(id, trx);
      if (!listing) {
        result = { ok: false, code: "NOT_FOUND" };
        return;
      }

      if (normalizeOrderType(listing.order_type) !== BUY) {
        result = { ok: false, code: "WRONG_ORDER_TYPE" };
        return;
      }

      if (listing.status !== "open") {
        result = { ok: false, code: "ALREADY_TAKEN" };
        return;
      }

      const buyerId = listing.buyer_id;
      const itemId = Number(listing.item_id);
      const price = Number(listing.price);
      const fee = Number(listing.fee);

      if (buyerId === sellerId) {
        result = { ok: false, code: "IS_BUYER" };
        return;
      }

      // 買家在發單後自己抽到了：這張單已無意義，作廢並退款。
      if (await ownsCharacter(buyerId, itemId, trx)) {
        const closed = await PublicMarketModel.markClosed(id, "invalid", trx);
        if (!closed) {
          // 別人先關掉了，退款由那條路徑負責，這裡再退就是退第二次。
          result = { ok: false, code: "ALREADY_TAKEN" };
          return;
        }

        await InventoryModel.increaseGodStone({
          userId: buyerId,
          amount: price,
          note: `public_market:buy_order:refund:buyer_owned:${id}`,
          trx,
        });

        result = { ok: false, code: "ALREADY_OWNED_REQUESTER", refundedAmount: price };
        return;
      }

      // 履約者手上沒有角色：單子原樣留著，不寫任何東西。
      const removed = await InventoryModel.deleteUserItem(sellerId, itemId, trx);
      if (!removed) {
        result = { ok: false, code: "NOT_OWNED" };
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
          note: `public_market:buy_order:fulfill:${id}`,
        },
        trx
      );

      // 買家不再扣款 —— 發單時已經預扣過，這裡再扣一次就是收兩次錢。
      await InventoryModel.increaseGodStone({
        userId: sellerId,
        amount: price - fee,
        note: `public_market:buy_order:payout:${id}`,
        trx,
      });

      const fulfilled = await PublicMarketModel.markFulfilled(id, sellerId, trx);
      if (!fulfilled) {
        throw new Error("PUBLIC_MARKET_RACE");
      }

      result = {
        ok: true,
        listingId: Number(id),
        itemId,
        name: character ? character.Name : null,
        // buyerId 只給 commit 後的成就結算用；router 的回應欄位是白名單，不會外流
        buyerId,
        price,
        fee,
        netProceeds: price - fee,
      };
    });
  } catch (e) {
    if (e && e.message === "PUBLIC_MARKET_RACE") {
      return { ok: false, code: "ALREADY_TAKEN" };
    }
    DefaultLogger.error(e);
    throw e;
  }

  if (result && result.ok) {
    await Promise.all([
      AchievementEngine.evaluate(sellerId, "trade_complete", {}).catch(() => {}),
      AchievementEngine.evaluate(result.buyerId, "trade_complete", {}).catch(() => {}),
    ]);
  }

  return result;
}

/**
 * 我的掛單：開放中（賣單 + 收購單）+ 已結束。
 * @param {String} userId
 */
async function getMyListings(userId) {
  const [openRows, closedRows] = await Promise.all([
    PublicMarketModel.getOpenListingsByRequester(userId),
    PublicMarketModel.getClosedListingsByUser(userId),
  ]);

  const names = await resolveNames([
    ...openRows.map(r => r.sellerId),
    ...openRows.map(r => r.buyerId),
    ...closedRows.map(r => r.sellerId),
    ...closedRows.map(r => r.buyerId),
  ]);

  const open = openRows.map(row => {
    const listing = shapeListing(row, { viewerId: userId, names });

    // 開放中的單沒有對手方，剪掉還沒有意義的欄位（收購單的 buyerId 就是我自己，留著）。
    if (listing.orderType === BUY) {
      delete listing.sellerId;
      delete listing.sellerName;
    } else {
      delete listing.buyerId;
      delete listing.buyerName;
    }
    return listing;
  });

  const closed = closedRows.map(row => {
    const listing = shapeListing(row, { viewerId: userId, names });
    // 角色的流向決定 role，與方向無關：交出角色的是 seller，拿到角色的是 buyer。
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
  SELL,
  BUY,
  normalizeOrderType,
  parseOrderType,
  calcFee,
  calcNetProceeds,
  isValidPrice,
  baseStarOf,
  baseAttributes,
  requesterIdOf,
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
  fulfill,
  getMyListings,
};
