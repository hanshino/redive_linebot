const FragmentModel = require("../model/princess/CharacterFragment");
const { inventory: InventoryModel, fetchUserOwnItems } = require("../model/application/Inventory");
const { model: GachaPoolModel } = require("../model/princess/gacha");
// 借用市場那邊已經寫好的持有判定 locking read。它就是這個 repo 對「append-only
// 帳本的持有狀態要怎麼安全地讀」的唯一定義，在這裡重寫一份只會多一個會走味的副本。
// 刻意「不」借 baseAttributes —— 那個抓的是角色原生星數，碎片兌換一律 1★。
const { ownsCharacter } = require("./PublicMarketService");
const mysql = require("../util/mysql");
const { DefaultLogger } = require("../util/Logger");

// 兌換價寫死：任何角色一律 150 碎片換 1★。不看原生星數、不進 config ——
// 這是產品定案的單一數字，做成設定只會多一個沒人會調的旋鈕。
const REDEEM_COST = 150;
const REDEEM_STAR = 1;
const GOD_STONE_ITEM_ID = 999;

/**
 * 角色 ID 驗證。999 是女神石本身，不是角色，不可能有碎片。
 * @param {*} value
 * @returns {Boolean}
 */
function isValidItemId(value) {
  return Number.isInteger(value) && value > 0 && value !== GOD_STONE_ITEM_ID;
}

/**
 * 回收數量驗證：正整數。0／負數／小數／字串垃圾一律擋掉，
 * 負數特別致命 —— 會變成「回收」出碎片又拿到負女神石。
 * @param {*} value
 * @returns {Boolean}
 */
function isValidQuantity(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * 原生星數（只用於顯示；兌換給的星數與這個無關）。
 * @param {Object} row
 * @returns {Number}
 */
function baseStarOf(row) {
  const star = parseInt(row && row.star, 10);
  return Number.isFinite(star) && star > 0 ? star : 1;
}

/**
 * 批次持有判定。
 *
 * 一定要真的去問 inventory —— 不能用「有沒有碎片」推導。整個設計的核心就是
 * 已持有的人會繼續累積碎片（那是市場的供給來源），兩件事完全獨立。
 *
 * 語意與 PublicMarketService.ownsCharacter 一致：同 itemId 的 itemAmount 加總 > 0。
 * 這裡是清單用的非鎖定讀，寫入路徑一律走 ownsCharacter(..., trx)。
 *
 * @param {String} userId
 * @param {Array<Number>} itemIds
 * @returns {Promise<Set<Number>>}
 */
async function ownedItemIdSet(userId, itemIds) {
  if (itemIds.length === 0) return new Set();

  const rows = await fetchUserOwnItems(userId, itemIds);
  const sums = rows.reduce((acc, row) => {
    const itemId = Number(row.itemId);
    acc[itemId] = (acc[itemId] || 0) + Number(row.itemAmount || 0);
    return acc;
  }, {});

  return new Set(
    Object.keys(sums)
      .filter(id => sums[id] > 0)
      .map(Number)
  );
}

/**
 * 我的碎片清單。只回 amount > 0 的。
 * @param {String} userId
 * @returns {Promise<Array<Object>>}
 */
async function getInventory(userId) {
  const rows = await FragmentModel.listByUser(userId);
  const owned = await ownedItemIdSet(
    userId,
    rows.map(row => Number(row.itemId))
  );

  return rows.map(row => {
    const itemId = Number(row.itemId);
    const amount = Number(row.amount);
    const isOwned = owned.has(itemId);

    return {
      itemId,
      name: row.name || null,
      headImage: row.headImage || null,
      baseStar: baseStarOf(row),
      amount,
      owned: isOwned,
      // 已持有仍可以留著／回收／拿去賣，只是不能兌換。
      canRedeem: amount >= REDEEM_COST && !isOwned,
    };
  });
}

/**
 * 回收碎片換女神石：1 碎片 = 1 女神石，數量任意。
 *
 * 交易邊界：整段（碎片鎖 → 扣碎片 → 入帳女神石）在單一 mysql.transaction 內。
 * 交易外先讀後扣是不行的 —— 兩個並發請求會讀到同一個餘額，扣一次卻領兩次錢。
 *
 * 鎖：只鎖碎片列這一個資源。女神石是 append-only 帳本，入帳是純 INSERT，
 * 沒有 read-modify-write，所以不需要（也刻意不要）先鎖 999 範圍。
 *
 * 這裡原本為了「對齊全域鎖序 999 → 碎片」而先對 999 下一次 FOR UPDATE，
 * 結果是 12 個並發回收有 11 個 ER_LOCK_DEADLOCK：使用者還沒有任何 999 列時，
 * `WHERE userId=? AND itemId=999 FOR UPDATE` 鎖的是一個「空區間」，拿到的是
 * gap lock —— gap lock 可以被多個交易同時持有，接著每個交易都要 INSERT 進同一個
 * gap，insert intention lock 與別人的 gap lock 互衝，直接成環。
 * 預先在 inventory 塞一列 999 可讓死鎖歸零，反證了就是這個 gap 造成的。
 *
 * 只持有單一個鎖的交易不可能形成等待環，所以拿掉之後這條路徑是結構性無死鎖的，
 * 比「湊齊鎖序」更強。代價是回應少了女神石餘額（見 return），這是刻意的。
 *
 * 已持有該角色「不」阻擋回收 —— 老玩家累積不需要的碎片並變現，是這個系統的設計目的。
 *
 * @param {String} userId
 * @param {Number} itemId
 * @param {Number} quantity
 * @returns {Promise<Object>} `{ ok: true, ... }` 或 `{ ok: false, code }`
 */
async function recycle(userId, itemId, quantity) {
  if (!isValidItemId(itemId)) return { ok: false, code: "INVALID_ITEM" };
  if (!isValidQuantity(quantity)) return { ok: false, code: "INVALID_QUANTITY" };

  let result;

  try {
    await mysql.transaction(async trx => {
      const balance = await FragmentModel.getBalance(userId, itemId, trx, { forUpdate: true });
      if (balance < quantity) {
        result = {
          ok: false,
          code: "INSUFFICIENT_FRAGMENTS",
          balance,
          required: quantity,
          shortfall: quantity - balance,
        };
        return;
      }

      const affected = await FragmentModel.decreaseLocked(userId, itemId, quantity, trx);
      if (!affected) {
        // 上面剛在同一個交易裡鎖著這一列讀到足夠餘額，扣不動代表鎖沒生效。
        // 這種情況寧可整筆回滾，也不要把女神石發出去。
        throw new Error("CHARACTER_FRAGMENT_RACE");
      }

      await InventoryModel.increaseGodStone({
        userId,
        amount: quantity,
        note: `character_fragment:recycle:${itemId}`,
        trx,
      });

      result = {
        ok: true,
        itemId,
        quantity,
        fragmentBalanceAfter: balance - quantity,
        godStoneGained: quantity,
      };
    });
  } catch (e) {
    DefaultLogger.error(e);
    throw e;
  }

  return result;
}

/**
 * 兌換角色：固定 150 碎片換該角色 1★。
 *
 * 交易邊界：持有判定與扣碎片、寫入角色全部在單一 mysql.transaction 內。
 * 交易外的 fast-path 檢查沒有意義（讀的是自己交易開始前的快照），
 * 所以這裡根本不做，直接在交易內用 locking read 判斷。
 *
 * 鎖序：`碎片列 → inventory 角色持有列`，並且跑在 READ COMMITTED 下。
 * 兩個決定都是被實測逼出來的，不是偏好問題：
 *
 * 1. 碎片列先鎖。碎片列在 UNIQUE(user_id, item_id) 上必然存在（餘額歸零也保留），
 *    所以那是一個「確定命中的 record lock」，可以當本流程的序列化點。反過來先鎖
 *    inventory 的話，`WHERE userId=? AND itemId=?` 在使用者還沒有這隻角色時是空區間，
 *    拿到的是 gap lock —— 多個交易可同時持有同一個 gap，接著各自 INSERT，
 *    insert intention lock 與別人的 gap lock 互衝而成環。實測同一使用者並發兌換
 *    6 隻不同角色：先鎖 inventory 是 5/6 ER_LOCK_DEADLOCK，先鎖碎片後降到 0/6。
 *
 * 2. READ COMMITTED。光是換順序只解決「同一角色」的並發；同一使用者同時兌換
 *    多隻不同角色時，inventory 那次 locking read 仍在不同的空區間上拿 gap lock，
 *    RR 下依然 5/6 死鎖。RC 不下 gap lock，實測降到 0/6、跨使用者 12 筆併發也 0 死鎖。
 *    正確性不受影響：這裡沒有任何依賴「同一交易重複讀要一致」的邏輯，
 *    每個資源都只讀一次且都是 locking read（讀最新已提交版本）。
 *
 * 與其他路徑混用隔離等級是安全的：重複持有的唯一防線是 inventory 持有範圍上的
 * FOR UPDATE，兩邊都會取得它並互相阻塞。實測本流程（RC）對打 PublicMarket
 * purchase 形狀的授予流程（RR）25 回，未出現重複持有。
 *
 * 星數寫死 1：不讀 gacha_pool.Star、也不用 PublicMarketService.baseAttributes。
 *
 * @param {String} userId
 * @param {Number} itemId
 * @returns {Promise<Object>} `{ ok: true, ... }` 或 `{ ok: false, code }`
 */
async function redeem(userId, itemId) {
  if (!isValidItemId(itemId)) return { ok: false, code: "INVALID_ITEM" };

  const character = await GachaPoolModel.find(itemId);
  if (!character) return { ok: false, code: "ITEM_NOT_FOUND" };

  let result;

  try {
    await mysql.transaction(
      async trx => {
        // 先鎖碎片列（必然存在的 record lock），它是本流程的序列化點。
        const balance = await FragmentModel.getBalance(userId, itemId, trx, { forUpdate: true });
        if (balance < REDEEM_COST) {
          // 「已持有」比「碎片不足」更能解釋為什麼兌換不了 —— 不然已經有這隻角色的人
          // 會以為再湊 150 片就能換。這裡刻意用非鎖定讀：後面沒有任何寫入，
          // 讀舊一點的快照最多只是選錯錯誤訊息，卻能避免在失敗路徑上多拿一個
          // inventory 空區間的 gap lock（那正是本流程死鎖的來源）。
          if (await ownsCharacter(userId, itemId)) {
            result = { ok: false, code: "ALREADY_OWNED" };
            return;
          }

          result = {
            ok: false,
            code: "INSUFFICIENT_FRAGMENTS",
            balance,
            required: REDEEM_COST,
            shortfall: REDEEM_COST - balance,
          };
          return;
        }

        // 權威的重複持有檢查，且必須在扣碎片之前 —— 已持有時碎片一片都不能動。
        // 兩個同時打進來的兌換，後到的那筆已被上面的碎片鎖擋住，醒來後這裡
        // 讀到最新已提交版本就會看到角色已在手上。抽卡／市場在同一瞬間把角色
        // 塞進來也一樣擋得到（實測：redeem 對打 gacha 形狀的 insert 回 ALREADY_OWNED，
        // 且碎片未被扣）。
        if (await ownsCharacter(userId, itemId, trx)) {
          result = { ok: false, code: "ALREADY_OWNED" };
          return;
        }

        const affected = await FragmentModel.decreaseLocked(userId, itemId, REDEEM_COST, trx);
        if (!affected) {
          throw new Error("CHARACTER_FRAGMENT_RACE");
        }

        await InventoryModel.create(
          {
            userId,
            itemId,
            itemAmount: 1,
            // 一律 1★：碎片兌換來的角色不繼承原生星數，也不繼承任何人的升星。
            attributes: JSON.stringify([{ key: "star", value: REDEEM_STAR }]),
            note: `character_fragment:redeem:${itemId}`,
          },
          trx
        );

        result = {
          ok: true,
          itemId,
          name: character.Name,
          headImage: character.HeadImage_Url,
          star: REDEEM_STAR,
          cost: REDEEM_COST,
          fragmentBalanceAfter: balance - REDEEM_COST,
        };
      },
      // 見上方鎖序註解：RC 不下 gap lock，是這條路徑不死鎖的另一半原因。
      { isolationLevel: "read committed" }
    );
  } catch (e) {
    DefaultLogger.error(e);
    throw e;
  }

  return result;
}

module.exports = {
  REDEEM_COST,
  REDEEM_STAR,
  isValidItemId,
  isValidQuantity,
  getInventory,
  recycle,
  redeem,
};
