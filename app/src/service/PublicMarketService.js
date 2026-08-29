const PublicMarketModel = require("../model/application/PublicMarket");
const { inventory: InventoryModel } = require("../model/application/Inventory");
const FragmentModel = require("../model/princess/CharacterFragment");
const { model: GachaPoolModel } = require("../model/princess/gacha");
const { resolveDisplayName } = require("./ProfileService");
const AchievementEngine = require("./AchievementEngine");
const mysql = require("../util/mysql");
const { DefaultLogger } = require("../util/Logger");

const FEE_PERCENT = 5;
const MAX_OPEN_LISTINGS = 10;
const MIN_PRICE = 1;
const MAX_PRICE = 10000000;
// price 是「每片／每隻」單價，所以整張單的金額還要另外設上限：
// 沿用單張角色單的天花板 10,000,000，不因為碎片可以整批掛就多開一個更高的經濟上限。
// 這個數字也讓 price / fee / 預扣金額全部離 int unsigned 上限（4,294,967,295）很遠。
const MAX_TOTAL = MAX_PRICE;
// 碎片數量上限。150 片換一隻，9999 片 ≈ 66 隻的量，遠超任何單一角色的實際庫存，
// 同時維持 4 位數讓 Flex／清單排得下。重點是不讓 client 傳任意大的數字進來。
const MAX_QUANTITY = 9999;
const GOD_STONE_ITEM_ID = 999;

const SELL = "sell";
const BUY = "buy";
const CHARACTER = "character";
const FRAGMENT = "fragment";

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
 * 標的種類。缺值一律當角色 —— 第一階段的資料與連結全部沒有這個欄位。
 * @param {*} value
 * @returns {"character"|"fragment"}
 */
function normalizeItemKind(value) {
  return String(value == null ? CHARACTER : value).toLowerCase() === FRAGMENT
    ? FRAGMENT
    : CHARACTER;
}

/**
 * 嚴格版：只接受 character / fragment / 缺省，其餘回 null。
 * 種類決定要搬走的是角色本體還是碎片，拼錯不能靜靜地當成角色單。
 *
 * 刻意「不」用 quantity > 1 推導種類：1 片碎片是完全合法的掛單，
 * 那樣推導會把它誤判成角色單，進而去 inventory 刪一隻不該動的角色。
 *
 * @param {*} value
 * @returns {?("character"|"fragment")}
 */
function parseItemKind(value) {
  if (value === undefined || value === null || value === "") return CHARACTER;
  const normalized = String(value).toLowerCase();
  return normalized === CHARACTER || normalized === FRAGMENT ? normalized : null;
}

/**
 * 手續費：成交總額的 5%，無條件進位。手續費是「銷毀」的 —— 買家付 total，
 * 賣家收 total - fee，沒有第三方入帳，差額直接從流通量消失。
 * 兩個方向的算法完全一樣，只是誰先付錢不同。
 *
 * 傳入的是**總額**（碎片單是 price × quantity），角色單的 quantity 恆為 1
 * 所以 total === price，既有行為不變。
 *
 * @param {Number} total
 * @returns {Number}
 */
function calcFee(total) {
  return Math.ceil((total * FEE_PERCENT) / 100);
}

/**
 * 賣家實收。
 * @param {Number} total
 * @returns {Number}
 */
function calcNetProceeds(total) {
  return total - calcFee(total);
}

/**
 * 價格必須是 1 ～ 10000000 的整數。語意是「每片／每隻」單價。
 * @param {*} price
 * @returns {Boolean}
 */
function isValidPrice(price) {
  return Number.isInteger(price) && price >= MIN_PRICE && price <= MAX_PRICE;
}

/**
 * 數量必須是 1 ～ MAX_QUANTITY 的整數。
 * 角色單另有「恆為 1」的硬條件（DB CHECK 也擋），由 isValidQuantityFor 負責。
 * @param {*} quantity
 * @returns {Boolean}
 */
function isValidQuantity(quantity) {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY;
}

/**
 * 種類 + 數量 + 總額的完整驗證，回傳錯誤碼或 null。
 * 寫入端（router 與 service）都走這一支，兩層驗證不會走味。
 *
 * @param {"character"|"fragment"} itemKind
 * @param {Number} quantity
 * @param {Number} price
 * @returns {?String} 錯誤碼
 */
function validateQuantityAndTotal(itemKind, quantity, price) {
  if (!isValidQuantity(quantity)) return "INVALID_QUANTITY";
  // 角色是不可分割的單一資產，數量只能是 1（DB 也有 CHECK 擋）。
  if (itemKind !== FRAGMENT && quantity !== 1) return "INVALID_QUANTITY";
  if (price * quantity > MAX_TOTAL) return "INVALID_TOTAL";
  return null;
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
 *
 * price 是每片／每隻單價，total = price × quantity 才是實際金流金額，
 * 手續費與實收都以 total 為基準（角色單 quantity 恆為 1，total === price）。
 *
 * 星數欄位刻意分兩個名字：角色單給 `star`（就是這隻角色的星數），
 * 碎片單給 `baseStar`（那隻角色的原生星數，只供圖卡顯示，碎片本身沒有星級）。
 * 同名會讓前端把「20 片 3★ 碎片」畫成「一隻 3★ 角色」。
 *
 * @param {Object} row
 * @param {Object} [param1]
 * @param {String} [param1.viewerId] 觀看者，用來算 mine
 * @param {Object} [param1.names] userId -> displayName 對照
 * @returns {Object}
 */
function shapeListing(row, { viewerId, names = {} } = {}) {
  const orderType = normalizeOrderType(row.orderType);
  const itemKind = normalizeItemKind(row.itemKind);
  const price = Number(row.price);
  const quantity = itemKind === FRAGMENT ? Number(row.quantity) || 1 : 1;
  const total = price * quantity;
  const requesterId = requesterIdOf({ ...row, orderType });

  const listing = {
    id: Number(row.id),
    itemId: Number(row.itemId),
    itemKind,
    orderType,
    name: row.name,
    quantity,
    price,
    total,
    fee: Number(row.fee),
    netProceeds: total - Number(row.fee),
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

  if (itemKind === FRAGMENT) {
    listing.baseStar = baseStarOf(row);
  } else {
    listing.star = baseStarOf(row);
  }

  // 收購單一旦取消／失效，預扣的女神石一定已全額退回（退款與狀態變更同一筆交易）。
  // 前端要寫出實際金額，這裡直接給，省得它自己猜。預扣的是 total 而非單價。
  if (orderType === BUY && (row.status === "cancelled" || row.status === "invalid")) {
    listing.refundedAmount = total;
  }

  return listing;
}

/**
 * 掛單列（model 原始 snake_case 形狀）的實際金流金額。
 *
 * price 是單價，總額才是「買家付多少 / 預扣多少 / 退多少」。角色單的 quantity
 * 恆為 1，所以這支對舊資料回傳的就是 price 本身，既有金流一位數都不會變。
 * quantity 缺值（第一階段資料、mock 列）一律當 1，不會算出 NaN 把金流搞爛。
 *
 * @param {Object} row public_market 原始資料列
 * @returns {Number}
 */
function totalOfRow(row) {
  const price = Number(row.price);
  if (normalizeItemKind(row.item_kind) !== FRAGMENT) return price;
  const quantity = Number(row.quantity);
  return price * (Number.isInteger(quantity) && quantity > 0 ? quantity : 1);
}

/**
 * 取得「某使用者 × 某角色」的序列化鎖，回傳鎖定後的碎片餘額。
 *
 * 鎖的實體是 `character_fragments` 的那一列。它在 UNIQUE(user_id, item_id) 上是
 * 每個 (使用者, 角色) 組合唯一的一列，所以拿到的是**排它 record lock** ——
 * 同一組合的兩個交易一定一個等另一個，這是 gap lock 給不了的性質
 * （gap lock 可被多個交易同時持有，見下）。
 *
 * 為什麼要先 `increase(..., 0)`：對**不存在**的列下 FOR UPDATE，在 REPEATABLE READ
 * 下拿到的是 gap lock，而 gap lock 是「可共存」的 —— 兩個交易可以同時持有同一個 gap，
 * 於是雙方都驗到「這裡沒有東西」，接著各自 INSERT，insert intention lock 與對方的
 * gap lock 互衝而成環。`increase(..., 0)` 是單一語句的原子 upsert，自己就會在 UNIQUE
 * 索引上取得該列的排它鎖，之後的 FOR UPDATE 命中的是一筆確定存在的紀錄。
 * 加 0 不改變任何餘額，餘額列歸零也不刪，所以這個動作沒有可觀察的副作用。
 *
 * 角色成交也用這一列當鎖：角色的「二元持有」在 inventory 裡沒有可鎖的實體
 * （沒有這隻角色就是沒有那一列，鎖下去只會拿到 gap），而這一列與角色持有是同一個
 * (user, item) 粒度，且 `CharacterFragmentService.redeem` 早就用它當序列化點 ——
 * 兩條「會把角色發給使用者」的路徑因此鎖在同一個實體上，而不是各鎖各的。
 *
 * @param {String} userId
 * @param {Number} itemId
 * @param {import("knex").Knex.Transaction} trx
 * @returns {Promise<Number>} 鎖定後的碎片餘額
 */
async function lockOwnershipSlot(userId, itemId, trx) {
  // 確保列存在，把 gap lock 變成 record lock。amount + 0 是 no-op。
  await FragmentModel.increase(userId, itemId, 0, trx);
  return FragmentModel.getBalance(userId, itemId, trx, { forUpdate: true });
}

/**
 * 兩位使用者的碎片列鎖定，固定按 user_id 的字典順序取鎖。
 *
 * 為什麼要排序：碎片交易一定會動到兩個人的同一個 item_id 兩列。若各自照「先賣方
 * 後買方」的角色順序取鎖，A 賣給 B 與 B 賣給 A 兩筆同時發生時就是反向取鎖，直接成環。
 * 照 user_id 排序後，任何兩筆交易對同一組資源的取鎖順序都一致，不可能等待成環。
 *
 * 每一列怎麼鎖、為什麼要先 upsert，見 lockOwnershipSlot。
 *
 * @param {String} userIdA
 * @param {String} userIdB
 * @param {Number} itemId
 * @param {import("knex").Knex.Transaction} trx
 * @returns {Promise<Object>} userId -> 鎖定後的餘額
 */
async function lockFragmentRowsForTrade(userIdA, userIdB, itemId, trx) {
  const balances = {};

  for (const userId of [userIdA, userIdB].sort()) {
    balances[userId] = await lockOwnershipSlot(userId, itemId, trx);
  }

  return balances;
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
 * 掛單簿：某方向、某種類目前有開放掛單的角色。
 * bestPrice 的語意隨方向翻轉：賣單是最低售價，收購單是最高收購價，
 * 碎片的話一律是「每片」單價。
 * @param {"sell"|"buy"} [orderType]
 * @param {"character"|"fragment"} [itemKind]
 * @returns {Promise<Array<Object>>}
 */
async function getOpenCharacters(orderType = SELL, itemKind = CHARACTER) {
  const type = normalizeOrderType(orderType);
  const kind = normalizeItemKind(itemKind);
  const rows = await PublicMarketModel.getOpenCharacters(type, kind);

  return rows.map(row => ({
    itemId: Number(row.itemId),
    orderType: type,
    itemKind: kind,
    name: row.name,
    star: baseStarOf(row),
    headImage: row.headImage,
    listingCount: Number(row.listingCount),
    bestPrice: Number(row.bestPrice),
  }));
}

/**
 * 某角色某方向某種類的開放掛單。賣單價低優先、收購單價高優先。
 * @param {Number} itemId
 * @param {String} viewerId
 * @param {"sell"|"buy"} [orderType]
 * @param {"character"|"fragment"} [itemKind]
 */
async function getListingsByItemId(itemId, viewerId, orderType = SELL, itemKind = CHARACTER) {
  const type = normalizeOrderType(orderType);
  const kind = normalizeItemKind(itemKind);
  const rows = await PublicMarketModel.getOpenListingsByItemId(itemId, type, kind);
  const names = await resolveNames(rows.map(r => (type === BUY ? r.buyerId : r.sellerId)));

  return rows.map(row => {
    const listing = shapeListing({ ...row, orderType: type, itemKind: kind }, { viewerId, names });

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
 *   buy  —— 我要交出資產換錢，所以看「是不是自己發的 / 有沒有那個資產」。
 *            買家的錢在發單時就預扣了，履約時不需要再驗餘額。
 *
 * 碎片與角色差兩點：
 *   - 買碎片沒有 ALREADY_OWNED —— 碎片可以無限累積，已持有角色也能買。
 *   - 履約碎片收購單看的是碎片餘額夠不夠 quantity，不是「有沒有這隻角色」。
 *
 * `total` 缺省時退回 `price`（角色單 quantity 恆為 1，兩者相同）。
 *
 * @param {Object} param0
 * @param {"sell"|"buy"} [param0.orderType]
 * @param {"character"|"fragment"} [param0.itemKind]
 * @returns {?String}
 */
function resolveBlockReason({
  orderType,
  itemKind,
  status,
  isSeller,
  isRequester,
  owns,
  balance,
  price,
  total,
  fragmentBalance = 0,
  quantity = 1,
}) {
  if (status !== "open") return "NOT_OPEN";

  const isFragment = normalizeItemKind(itemKind) === FRAGMENT;
  const amountDue = total == null ? price : total;

  if (normalizeOrderType(orderType) === BUY) {
    if (isRequester) return "IS_BUYER";
    if (isFragment) return fragmentBalance >= quantity ? null : "INSUFFICIENT_FRAGMENTS";
    if (!owns) return "NOT_OWNED";
    return null;
  }

  if (isSeller) return "IS_SELLER";
  // 碎片不受「一人一隻」限制，跳過 ALREADY_OWNED。
  if (!isFragment && owns) return "ALREADY_OWNED";
  if (balance < amountDue) return "INSUFFICIENT_FUNDS";
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

  const isFragment = normalizeItemKind(row.itemKind) === FRAGMENT;

  const [names, balance, owns, fragmentBalance] = await Promise.all([
    resolveNames([row.sellerId, row.buyerId]),
    getBalance(viewerId),
    ownsCharacter(viewerId, row.itemId),
    // 碎片單才需要碎片餘額；角色單問了也用不到，省一次查詢。
    isFragment ? FragmentModel.getBalance(viewerId, Number(row.itemId)) : 0,
  ]);

  const listing = shapeListing(row, { viewerId, names });
  const isBuyOrder = listing.orderType === BUY;
  const isSeller = !isBuyOrder && row.sellerId === viewerId;
  const isRequester = isBuyOrder && row.buyerId === viewerId;

  const blockReason = resolveBlockReason({
    orderType: listing.orderType,
    itemKind: listing.itemKind,
    status: row.status,
    isSeller,
    isRequester,
    owns,
    balance,
    price: listing.price,
    total: listing.total,
    fragmentBalance,
    quantity: listing.quantity,
  });

  delete listing.mine;

  return {
    ...listing,
    viewer: {
      balance,
      ownsCharacter: owns,
      // 碎片單才有意義的欄位就只在碎片單出現，角色頁不用管它。
      ...(isFragment ? { fragmentBalance } : {}),
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
 * ponytail: 掛單「不」把資產從持有處移走 —— 純狀態列，取消就是把 status 翻成
 * cancelled，賣家的升星強化／碎片自始至終沒被動過（對應文案「解除鎖定，不收手續費，
 * 升星強化留在你手上」）。反正成交當下無論如何都得重驗賣家還在不在（錯誤碼
 * SELLER_LOST_ITEM / SELLER_LOST_FRAGMENTS 就是為此存在），先搬走只是多一條要回滾的
 * 路徑，不會少一次驗證。代價：資產可能同時被別的功能消耗掉，此時該單在成交時自動轉
 * invalid 下架。
 *
 * @param {String} sellerId
 * @param {Object} param1
 * @param {Number} param1.itemId
 * @param {Number} param1.price 每片／每隻單價
 * @param {"character"|"fragment"} param1.itemKind
 * @param {Number} param1.quantity 碎片片數；角色恆為 1
 */
async function createSellListing(sellerId, { itemId, price, itemKind, quantity }) {
  const attributes = {
    order_type: SELL,
    seller_id: sellerId,
    item_id: itemId,
    item_kind: itemKind,
    quantity,
    price,
    // 手續費以總額計，不是單價 —— 每片各進位一次會多收好幾成。
    fee: calcFee(price * quantity),
    status: "open",
  };

  if (itemKind === FRAGMENT) {
    return createFragmentSellListing(sellerId, { itemId, quantity, attributes });
  }

  // 上限是賣單 + 收購單合計，兩種單都佔同一個配額。
  const openCount = await PublicMarketModel.countOpenByRequester(sellerId);
  if (openCount >= MAX_OPEN_LISTINGS) {
    return { ok: false, code: "LISTING_CAP", myOpenCount: openCount, maxOpen: MAX_OPEN_LISTINGS };
  }

  if (!(await ownsCharacter(sellerId, itemId))) {
    return { ok: false, code: "NOT_OWNED" };
  }

  const duplicated = await PublicMarketModel.findOpenBySellerAndItem(sellerId, itemId, CHARACTER);
  if (duplicated) {
    return { ok: false, code: "ALREADY_LISTED" };
  }

  const id = await PublicMarketModel.create(attributes);

  const row = await PublicMarketModel.getById(id);
  const names = await resolveNames([sellerId]);

  return { ok: true, listing: shapeListing(row, { viewerId: sellerId, names }) };
}

/**
 * 建立碎片賣單。
 *
 * 與角色賣單同樣「不預扣」，但整段必須在交易內：碎片是可分割的餘額，掛單數上限與
 * 「同標的一張」都得建立在同一個快照上，否則同一使用者連點兩次會掛出兩張各 20 片、
 * 合計超過實際持有量的單（成交時雖會被擋掉並轉 invalid，但那是把問題丟給買家）。
 *
 * 鎖：只鎖自己的碎片列這一個資源，而它在 UNIQUE(user_id, item_id) 上必然是一筆真實
 * 存在的紀錄（Lane B 的餘額列歸零不刪），所以拿到的是 record lock 而不是 gap lock。
 * 只持有單一 record lock 的交易不可能形成等待環。這裡刻意不鎖 public_market ——
 * countOpenByRequester 的範圍鎖會與 purchase / fulfill 的「掛單列 → 資產」鎖序相反。
 *
 * @param {String} sellerId
 * @param {Object} param1
 * @param {Number} param1.itemId
 * @param {Number} param1.quantity
 * @param {Object} param1.attributes 已算好的掛單欄位
 */
async function createFragmentSellListing(sellerId, { itemId, quantity, attributes }) {
  let result;

  await mysql.transaction(async trx => {
    // 序列化點：同一使用者對同一角色的並發掛單在這裡排隊。
    const fragmentBalance = await FragmentModel.getBalance(sellerId, itemId, trx, {
      forUpdate: true,
    });

    const openCount = await PublicMarketModel.countOpenByRequester(sellerId, trx);
    if (openCount >= MAX_OPEN_LISTINGS) {
      result = {
        ok: false,
        code: "LISTING_CAP",
        myOpenCount: openCount,
        maxOpen: MAX_OPEN_LISTINGS,
      };
      return;
    }

    const duplicated = await PublicMarketModel.findOpenBySellerAndItem(
      sellerId,
      itemId,
      FRAGMENT,
      trx
    );
    if (duplicated) {
      result = { ok: false, code: "ALREADY_LISTED" };
      return;
    }

    if (fragmentBalance < quantity) {
      result = {
        ok: false,
        code: "INSUFFICIENT_FRAGMENTS",
        balance: fragmentBalance,
        required: quantity,
        shortfall: quantity - fragmentBalance,
      };
      return;
    }

    const id = await PublicMarketModel.create(attributes, trx);
    result = { ok: true, row: await PublicMarketModel.getById(id, trx) };
  });

  if (!result.ok) return result;

  const names = await resolveNames([sellerId]);

  return { ok: true, listing: shapeListing(result.row, { viewerId: sellerId, names }) };
}

/**
 * 建立收購委託。
 *
 * 與賣單最大的差別：收購單「先付錢」。發布當下就把**總額**（price × quantity）從買家
 * 帳上扣走（預扣／escrow），履約時買家不再扣款。理由是履約的人交出的是不可逆的資產
 * （角色離開 box、碎片離開餘額），不能讓他成交後才發現對方沒錢。
 *
 * 交易內的順序固定為：
 *   1. 餘額 locking read —— 同一買家的並發發單在這裡排隊，這是本流程唯一的序列化點。
 *      因為它先跑，之後的計數／重複檢查讀到的都是前一筆 commit 之後的狀態，
 *      掛單上限與「同標的一張」不需要再各自加鎖（在 public_market 上加範圍鎖會與
 *      purchase / fulfill 的「掛單列 → 資產」鎖序相反，換來死鎖）。
 *   2. 掛單數合計檢查
 *   3. 持有（僅角色）／重複單檢查
 *   4. 寫入掛單列
 *   5. 預扣總額
 * 先鎖錢再做其他檢查，是因為之後才鎖的話，兩張同時進來的單會各自讀到扣款前的餘額，
 * 兩張都通過檢查而把餘額扣成負的。
 *
 * 女神石那句 FOR UPDATE 保留 —— 足額檢查與預扣是 read-modify-write，非鎖不可。
 * 在 READ COMMITTED 下它只鎖實際存在的 999 列，不再下 gap lock：
 *   - 買家有 999 列 → 鎖到真實紀錄，同一買家的並發發單在 record lock 上排隊。
 *   - 買家沒有 999 列 → 餘額 0，而 total >= 1，必然在預扣前退出，整筆交易不對
 *     inventory 做任何 INSERT，沒有 insert intention lock 去跟別人的 gap lock 互衝。
 * 兩種情況都不可能把餘額扣成負的，也不可能成環。
 *
 * @param {String} buyerId
 * @param {Object} param1
 * @param {Number} param1.itemId
 * @param {Number} param1.price 每片／每隻單價
 * @param {"character"|"fragment"} param1.itemKind
 * @param {Number} param1.quantity
 */
async function createBuyOrder(buyerId, { itemId, price, itemKind, quantity }) {
  let result;
  const total = price * quantity;

  await mysql.transaction(
    async trx => {
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
      // 碎片沒有這個限制 —— 已持有角色的人繼續收碎片是預期用法（囤著／轉賣）。
      if (itemKind !== FRAGMENT && (await ownsCharacter(buyerId, itemId, trx))) {
        result = { ok: false, code: "ALREADY_OWNED" };
        return;
      }

      const duplicated = await PublicMarketModel.findOpenBuyByBuyerAndItem(
        buyerId,
        itemId,
        itemKind,
        trx
      );
      if (duplicated) {
        result = { ok: false, code: "ALREADY_REQUESTED" };
        return;
      }

      if (balance < total) {
        result = {
          ok: false,
          code: "NOT_ENOUGH_TO_RESERVE",
          balance,
          // price 這個鍵沿用既有 API 契約：「這筆需要多少」。碎片單即為總額
          // （price × quantity）。刻意不另外多一個 total 鍵 —— 角色單的失敗回應
          // 形狀必須與第一階段完全相同。
          price: total,
          shortfall: total - balance,
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
          item_kind: itemKind,
          quantity,
          price,
          fee: calcFee(total),
          status: "open",
        },
        trx
      );

      // 預扣總額，不是單價 —— 履約時買家不再付款，這裡少扣就是系統倒貼差額。
      await InventoryModel.decreaseGodStone({
        userId: buyerId,
        amount: total,
        note: `public_market:buy_order:reserve:${id}`,
        trx,
      });

      const row = await PublicMarketModel.getById(id, trx);
      result = { ok: true, id, row, balanceAfter: balance - total };
    },
    // 兩種標的都跑 READ COMMITTED，理由與 purchase / fulfill 相同（見 transactionOptions）：
    // 女神石那句 FOR UPDATE 在 RR 下的 gap lock 是死鎖來源，RC 不下 gap lock。
    transactionOptions()
  );

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
 * 建立委託。缺省或 sell 走賣單，buy 走收購單；缺省 character 走角色，fragment 走碎片。
 * @param {String} userId
 * @param {Object} param1
 * @param {Number} param1.itemId
 * @param {Number} param1.price 每片／每隻單價
 * @param {"sell"|"buy"} [param1.orderType]
 * @param {"character"|"fragment"} [param1.itemKind]
 * @param {Number} [param1.quantity] 缺省 1
 */
async function createListing(userId, { itemId, price, orderType, itemKind, quantity }) {
  const type = parseOrderType(orderType);
  if (type === null) {
    return { ok: false, code: "INVALID_ORDER_TYPE" };
  }

  const kind = parseItemKind(itemKind);
  if (kind === null) {
    return { ok: false, code: "INVALID_ITEM_KIND" };
  }

  if (!isValidPrice(price)) {
    return { ok: false, code: "INVALID_PRICE" };
  }

  // 缺省 1 才能相容第一階段完全沒有這個欄位的 client；空字串同理（表單常送空值）。
  const count = quantity === undefined || quantity === null || quantity === "" ? 1 : quantity;
  const quantityError = validateQuantityAndTotal(kind, count, price);
  if (quantityError) {
    return { ok: false, code: quantityError };
  }

  // itemId 999 是女神石本身，不是角色，任何組合都不准拿來掛單。
  if (!Number.isInteger(itemId) || itemId <= 0 || itemId === GOD_STONE_ITEM_ID) {
    return { ok: false, code: type === BUY || kind === FRAGMENT ? "INVALID_ITEM" : "NOT_OWNED" };
  }

  try {
    return type === BUY
      ? await createBuyOrder(userId, { itemId, price, itemKind: kind, quantity: count })
      : await createSellListing(userId, { itemId, price, itemKind: kind, quantity: count });
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

      const total = totalOfRow(listing);
      await InventoryModel.increaseGodStone({
        userId,
        amount: total,
        note: `public_market:buy_order:refund:cancel:${id}`,
        trx,
      });

      result = { ok: true, listingId: Number(id), refundedAmount: total };
    });
  } catch (e) {
    DefaultLogger.error(e);
    throw e;
  }

  return result;
}

/**
 * 成交交易一律跑 READ COMMITTED。
 *
 * 理由是實測出來的，不是偏好：買方餘額那句 `SUM(itemAmount) ... FOR UPDATE` 在
 * REPEATABLE READ 下會對 `idx_inventory_userId_itemId` 下 gap lock（使用者在該 itemId
 * 上還沒有任何列時鎖的是空區間），兩個 userId 相鄰時雙方鎖到同一個 gap，接著各自
 * INSERT 女神石異動就用 insert intention lock 互衝成環。實測 A↔B 反向角色交易 80 筆：
 * RR 死鎖 39 筆，RC 降到 0。
 *
 * 正確性不靠隔離等級，靠鎖：
 *   - 防雙重成交 —— 掛單列的 `lockById()`（FOR UPDATE）加上條件式
 *     `markSold`/`markFulfilled`/`markClosed`（`WHERE status='open'` + 受影響列數）。
 *     兩者都是 locking read / 寫入，在 RC 下語意完全相同。
 *   - 防重複持有 / 防超賣 —— `lockOwnershipSlot()` 在 character_fragments 上取得
 *     (user, item) 粒度的排它 record lock，這是真正的互斥，與隔離等級無關。
 *     RC 少掉的 gap lock 本來就不提供互斥（gap lock 可共存），拿掉不減少任何保護；
 *     詳細論證見 purchase 的註解。
 *
 * 這條路徑上沒有任何邏輯依賴「同一交易內重複讀同一資源要一致」—— 每個資源都只讀
 * 一次，且全是 locking read（讀最新已提交版本，比 RR 的交易起始快照更新）。
 *
 * @returns {Object} knex transaction 選項
 */
function transactionOptions() {
  return { isolationLevel: "read committed" };
}

/**
 * 買下一張賣單（角色或碎片）。整段包在單一 mysql.transaction 內。
 *
 * 競態安全靠兩層，兩種標的共用：
 * 1. 進交易先 `SELECT ... FOR UPDATE` 鎖住掛單列，後到的買家會卡住直到前一筆
 *    commit，醒來時讀到的已是 sold。
 * 2. 收尾的 UPDATE 帶 `WHERE status = 'open'`，受影響列數為 0 就整筆 rollback。
 *    即使 1 因故失效也不可能兩個買家都成功（資產只會轉移一次）。
 *
 * 鎖序，兩種標的共用同一條序列：「掛單列 → 標的鎖（character_fragments，
 * 依 user_id 字典序）→ 資產搬移」。角色只需要鎖買方（賣方的持有由條件式
 * `deleteUserItem` 的受影響列數把關，那是 inventory 上確定存在的列，不是 gap），
 * 碎片兩造都要鎖（雙方餘額都要 read-modify-write）。
 *
 * 為什麼角色要拿 character_fragments 的列當鎖：買家「不可已持有」這個檢查，在 RR 下
 * 原本靠 `ownsCharacter(..., trx)` 對 inventory 下 FOR UPDATE，但買家還沒有這隻角色時
 * 那是**空區間**，拿到的是 gap lock。gap lock 不提供互斥（多個交易可同時持有同一個
 * gap），所以它本來就擋不住「兩筆並發各自驗到沒有、各自寫入」—— 真正在阻止重複持有的
 * 是兩邊接著 INSERT 時 insert intention 互衝，而那個結果是 **ER_LOCK_DEADLOCK**，
 * 不是乾淨的 ALREADY_OWNED。這就是 39/80 死鎖的來源：把死鎖當互斥用。
 *
 * 換成 `lockOwnershipSlot()` 之後，(user, item) 粒度的排它 record lock 才是真互斥：
 * 同一買家同一角色的兩筆並發一定一個等另一個，後者醒來時看到的是前者 commit 後的
 * inventory，於是拿到 ALREADY_OWNED 而不是死鎖。保護變強、死鎖歸零。
 *
 * 這一列同時也是 `CharacterFragmentService.redeem` 的序列化點，所以「買下角色」與
 * 「碎片兌換角色」兩條發角色的路徑鎖在同一個實體上，跨路徑的重複持有一樣擋得到。
 *
 * 隔離等級一律 READ COMMITTED，見 transactionOptions。
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
      const itemKind = normalizeItemKind(listing.item_kind);
      const isFragment = itemKind === FRAGMENT;
      const quantity = isFragment ? Number(listing.quantity) || 1 : 1;
      // 單價 × 片數。角色單 quantity 恆為 1，total === price，金流一位數都沒變。
      const total = totalOfRow(listing);
      const fee = Number(listing.fee);

      if (sellerId === buyerId) {
        result = { ok: false, code: "IS_SELLER" };
        return;
      }

      // 標的鎖先取得，再讀餘額與持有 —— 這樣「檢查」與「寫入」之間不會有別人插進來。
      // 碎片要兩造（雙方餘額都會變），角色只鎖買方（賣方持有由 deleteUserItem 把關）。
      const fragmentBalances = isFragment
        ? await lockFragmentRowsForTrade(sellerId, buyerId, itemId, trx)
        : null;
      if (!isFragment) {
        await lockOwnershipSlot(buyerId, itemId, trx);
      }

      // 餘額仍是 locking read（getBalance 帶 trx 就會加 FOR UPDATE）—— 足額檢查
      // 一步都不能放鬆。在 READ COMMITTED 下這句只鎖「實際存在的 999 列」，不再下
      // gap lock，所以死鎖來源消失而互斥保留：
      //   - 買家有 999 列（餘額可能 > 0）→ 鎖到真實紀錄，同一買家的並發扣款照樣排隊。
      //   - 買家沒有 999 列 → 鎖不到東西，但那代表餘額 0，而 total >= 1，
      //     必然在下面的足額檢查就退出，整筆交易不會寫入任何女神石異動。
      // 兩種情況都不可能把餘額扣成負的。
      const balance = await getBalance(buyerId, trx);

      // 碎片沒有「一人一隻」的限制，已持有角色的人照樣可以買碎片，所以整段跳過。
      // 這次持有判定在標的鎖之後，讀的是最新已提交版本，是權威的檢查。
      if (!isFragment && (await ownsCharacter(buyerId, itemId, trx))) {
        result = { ok: false, code: "ALREADY_OWNED" };
        return;
      }

      if (balance < total) {
        result = {
          ok: false,
          code: "INSUFFICIENT_FUNDS",
          balance,
          // price 這個鍵沿用既有 API 契約：「這筆要付多少」，碎片單即為總額。
          // 不另外加 total，角色單的失敗回應形狀才與第一階段完全相同。
          price: total,
          shortfall: total - balance,
        };
        return;
      }

      const character = await GachaPoolModel.find(itemId, trx);

      if (isFragment) {
        // 賣家掛單後可能把碎片回收／兌換掉。片數不足就把掛單標記 invalid 自動下架，
        // 買方一毛都不扣（與角色的 SELLER_LOST_ITEM 同一個策略）。
        if (fragmentBalances[sellerId] < quantity) {
          await PublicMarketModel.markClosed(id, "invalid", trx);
          result = {
            ok: false,
            code: "SELLER_LOST_FRAGMENTS",
            available: fragmentBalances[sellerId],
            required: quantity,
          };
          return;
        }

        const decreased = await FragmentModel.decreaseLocked(sellerId, itemId, quantity, trx);
        if (!decreased) {
          // 剛剛才在同一個交易裡鎖著這一列讀到足夠片數，扣不動代表鎖沒生效，
          // 整筆回滾遠比把碎片憑空變出來安全。
          throw new Error("PUBLIC_MARKET_RACE");
        }

        await FragmentModel.increase(buyerId, itemId, quantity, trx);
      } else {
        // 賣家可能在掛單後把角色弄丟（其他功能消耗）。刪除受影響列數為 0 即代表已無此角色，
        // 此時把掛單標記 invalid 自動下架，且不動任何女神石。
        const removed = await InventoryModel.deleteUserItem(sellerId, itemId, trx);
        if (!removed) {
          await PublicMarketModel.markClosed(id, "invalid", trx);
          result = { ok: false, code: "SELLER_LOST_ITEM" };
          return;
        }

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
      }

      await InventoryModel.decreaseGodStone({
        userId: buyerId,
        amount: total,
        note: `public_market:buy:${id}`,
        trx,
      });

      // 手續費銷毀：賣家只入帳 total - fee，沒有任何第三方收到 fee。
      await InventoryModel.increaseGodStone({
        userId: sellerId,
        amount: total - fee,
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
        itemKind,
        quantity,
        name: character ? character.Name : null,
        // sellerId 只給 commit 後的成就結算用；router 的回應欄位是白名單，不會外流
        sellerId,
        price: Number(listing.price),
        total,
        fee,
        netProceeds: total - fee,
        balanceAfter: balance - total,
      };
    }, transactionOptions());
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
 * 金流與賣單相反 —— 錢在發單時就預扣了，這裡只做「撥款 + 交付資產」，
 * 買家不會被再扣一次。手續費一樣是銷毀，履約者實收 total - fee。
 *
 * 三種不成交的情形，處理方式刻意不同：
 * 1. 履約者手上沒有資產（角色 NOT_OWNED／碎片 INSUFFICIENT_FRAGMENTS）—— 收購單
 *    「保持 open」。如果這裡順手把單子作廢，任何人都能用一個沒有資產的帳號把別人的
 *    收購單掃光，那是免費的惡意下架管道。所以不動狀態、不退款、什麼都不寫。
 * 2. 買家自己已經拿到角色了（ALREADY_OWNED_REQUESTER）—— 這張單再也不可能成交，
 *    同一筆交易內作廢並把預扣全額退回買家，回傳讓前端能認的碼與退款金額。
 *    **碎片單沒有這條路徑**：碎片可以無限累積，收購方拿到角色、甚至已經湊滿都不影響
 *    這張單的意義，所以碎片單不會因為「對方持有」而失效。
 * 3. 其他人先成交／先取消（ALREADY_TAKEN）—— 不退款，錢在那條路徑上已經處理過。
 *
 * 鎖序與 purchase 完全相同：「掛單列 → 標的鎖（character_fragments，依 user_id
 * 字典序）→ 資產搬移」。角色只鎖收購方（拿到角色的那一方），碎片鎖兩造。
 * 為什麼角色也要拿 character_fragments 的列當鎖、以及 gap lock 為什麼不是互斥，
 * 見 purchase 的註解；隔離等級一律 READ COMMITTED，見 transactionOptions。
 *
 * 這條路徑本身不讀買方餘額（發單時已預扣），但撥款那筆 INSERT 仍落在 inventory 上，
 * 跟 purchase 交錯執行時一樣會撞上對方的 gap lock，所以兩條路徑用同一個隔離等級。
 *
 * @param {Number} id
 * @param {String} sellerId 履約者（交出資產的人）
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
      const itemKind = normalizeItemKind(listing.item_kind);
      const isFragment = itemKind === FRAGMENT;
      const quantity = isFragment ? Number(listing.quantity) || 1 : 1;
      const total = totalOfRow(listing);
      const fee = Number(listing.fee);

      if (buyerId === sellerId) {
        result = { ok: false, code: "IS_BUYER" };
        return;
      }

      const character = await GachaPoolModel.find(itemId, trx);

      // 標的鎖：碎片鎖兩造，角色只鎖收購方（拿到角色的那一方）。
      const fragmentBalances = isFragment
        ? await lockFragmentRowsForTrade(sellerId, buyerId, itemId, trx)
        : null;
      if (!isFragment) {
        await lockOwnershipSlot(buyerId, itemId, trx);
      }

      if (isFragment) {
        // 片數不足：單子原樣留著（保持 open），不寫任何東西、不退款。
        // 與角色的 NOT_OWNED 同一個理由 —— 否則這是免費把別人收購單下架的管道。
        if (fragmentBalances[sellerId] < quantity) {
          result = {
            ok: false,
            code: "INSUFFICIENT_FRAGMENTS",
            balance: fragmentBalances[sellerId],
            required: quantity,
            shortfall: quantity - fragmentBalances[sellerId],
          };
          return;
        }

        const decreased = await FragmentModel.decreaseLocked(sellerId, itemId, quantity, trx);
        if (!decreased) {
          throw new Error("PUBLIC_MARKET_RACE");
        }

        await FragmentModel.increase(buyerId, itemId, quantity, trx);
      } else {
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
            amount: total,
            note: `public_market:buy_order:refund:buyer_owned:${id}`,
            trx,
          });

          result = { ok: false, code: "ALREADY_OWNED_REQUESTER", refundedAmount: total };
          return;
        }

        // 履約者手上沒有角色：單子原樣留著，不寫任何東西。
        const removed = await InventoryModel.deleteUserItem(sellerId, itemId, trx);
        if (!removed) {
          result = { ok: false, code: "NOT_OWNED" };
          return;
        }

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
      }

      // 買家不再扣款 —— 發單時已經預扣過總額，這裡再扣一次就是收兩次錢。
      await InventoryModel.increaseGodStone({
        userId: sellerId,
        amount: total - fee,
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
        itemKind,
        quantity,
        name: character ? character.Name : null,
        // buyerId 只給 commit 後的成就結算用；router 的回應欄位是白名單，不會外流
        buyerId,
        price: Number(listing.price),
        total,
        fee,
        netProceeds: total - fee,
      };
    }, transactionOptions());
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
  MAX_QUANTITY,
  MAX_TOTAL,
  SELL,
  BUY,
  CHARACTER,
  FRAGMENT,
  normalizeOrderType,
  parseOrderType,
  normalizeItemKind,
  parseItemKind,
  calcFee,
  calcNetProceeds,
  isValidPrice,
  isValidQuantity,
  validateQuantityAndTotal,
  baseStarOf,
  baseAttributes,
  requesterIdOf,
  totalOfRow,
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
