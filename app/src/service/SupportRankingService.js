const mysql = require("../util/mysql");
const UserModel = require("../model/application/UserModel");

// 卡種 → 月數權重。未知 card_key 一律 0（CASE 的 ELSE 分支），不拋錯——sponsorship
// 是站務人工登記的自由欄位，排行榜計算不該因一筆舊資料/未知卡種而整支查詢炸掉。
// ponytail: 固定小表，寫死在這裡；卡種變動需求出現前不做成 config。
const CARD_MONTH_WEIGHT = { month: 1, month_plus: 2, season: 3 };

// 無卡贊助（card_count=0）：金額換算月數，30 元 = 1 個月，無條件捨去。
const AMOUNT_PER_MONTH = 30;

const CARD_MONTHS_CASE = mysql.raw(
  `SUM(CASE WHEN card_count > 0 THEN card_count * (CASE card_key
      WHEN 'month' THEN ?
      WHEN 'month_plus' THEN ?
      WHEN 'season' THEN ?
      ELSE 0 END)
    ELSE 0 END) AS card_months`,
  [CARD_MONTH_WEIGHT.month, CARD_MONTH_WEIGHT.month_plus, CARD_MONTH_WEIGHT.season]
);

const CARDLESS_AMOUNT_SUM = mysql.raw(
  "SUM(CASE WHEN card_count = 0 THEN amount ELSE 0 END) AS cardless_amount"
);

/**
 * 依 sponsorship 表，用單一 GROUP BY 聚合算出每位「已綁定付款人」的支持月數。
 *
 * 規則（見任務規格）：
 * - 只計 user_id NOT NULL 的列（未綁定的 history 排除）。
 * - card_count>0 的列：月數 = Σ(card_count × WEIGHT[card_key])，未知 card_key 記 0。
 * - card_count=0 的列：金額另外加總，FLOOR(Σamount / 30) 併入月數（FLOOR 在 JS 端做，
 *   避免 DECIMAL/DOUBLE 在 SQL 端做除法時的精度陷阱）。
 * - 月數 <=0 的使用者不上榜（filter 在 JS 端做：FLOOR 混合 card_months + cardless_amount/30
 *   無法只靠 SQL HAVING 一次表示，交給 DB 算完 SUM 後在這裡做最後判斷）。
 *
 * @returns {Promise<Array<{userId:Number, months:Number, firstReceivedAt:Date}>>}
 *   未排序（呼叫端依 months desc, firstReceivedAt asc, userId asc 排序）。
 */
async function computeMonthsByUser() {
  const rows = await mysql("sponsorship")
    .whereNotNull("user_id")
    .groupBy("user_id")
    .select({ userId: "user_id" })
    .select(CARD_MONTHS_CASE)
    .select(CARDLESS_AMOUNT_SUM)
    .min({ firstReceivedAt: "received_at" });

  return rows
    .map(row => ({
      userId: row.userId,
      months: Number(row.card_months) + Math.floor(Number(row.cardless_amount) / AMOUNT_PER_MONTH),
      firstReceivedAt: row.firstReceivedAt,
    }))
    .filter(row => row.months > 0);
}

/**
 * 排序＋排名：months desc, firstReceivedAt asc（早支持者優先）, userId asc。
 * Rank 是排除隱藏使用者「之後」的 1-based 名次（隱藏者不佔名次）。
 * @param {Array<{userId:Number, months:Number, firstReceivedAt:Date}>} rows
 * @returns {Array<{userId:Number, months:Number, firstReceivedAt:Date, rank:Number}>}
 */
function rankRows(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (b.months !== a.months) return b.months - a.months;
    const at = new Date(a.firstReceivedAt).getTime() - new Date(b.firstReceivedAt).getTime();
    if (at !== 0) return at;
    return a.userId - b.userId;
  });
  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * 依隱藏名單過濾＋排名，回傳可見清單（供 getPublicRanking / getMyStatus 共用同一份規則）。
 * @param {Array<{userId:Number, months:Number, firstReceivedAt:Date}>} monthsRows
 */
async function rankVisible(monthsRows) {
  if (monthsRows.length === 0) return { ranked: [], userById: new Map() };

  const userIds = monthsRows.map(r => r.userId);
  const users = await mysql("user")
    .whereIn("id", userIds)
    .select("id", "display_name", "picture_url", "hide_support_ranking");
  const userById = new Map(users.map(u => [u.id, u]));

  const visibleRows = monthsRows.filter(row => {
    const user = userById.get(row.userId);
    return user && !user.hide_support_ranking;
  });

  return { ranked: rankRows(visibleRows), userById };
}

/**
 * 公開支持榜：只回可公開欄位，絕不含金額/卡種。
 * 隱藏名單（user.hide_support_ranking=true）先剔除再排名，名次因此往前遞補。
 * ponytail: 沒分頁，量小；成長到需要分頁時再加 limit/offset。
 * @returns {Promise<{items: Array<{rank:Number, display_name:String, picture_url:?String, months:Number}>, total:Number}>}
 */
async function getPublicRanking() {
  const monthsRows = await computeMonthsByUser();
  const { ranked, userById } = await rankVisible(monthsRows);

  return {
    items: ranked.map(row => {
      const user = userById.get(row.userId);
      return {
        rank: row.rank,
        display_name: (user.display_name && user.display_name.trim()) || "玩家",
        picture_url: user.picture_url || null,
        months: row.months,
      };
    }),
    total: ranked.length,
  };
}

/**
 * 個人支持狀態：`GET /support-rankings/me` 用。
 * 未知使用者（沒有 sponsorship 紀錄）一律回未上榜、未隱藏、0 個月。
 * @param {Number} userId user.id（非 LINE platform_id）
 * @returns {Promise<{has_support:Boolean, hidden:Boolean, months:Number, rank:?Number}>}
 */
async function getMyStatus(userId) {
  const [user, monthsRows] = await Promise.all([
    mysql("user").where({ id: userId }).select("hide_support_ranking").first(),
    computeMonthsByUser(),
  ]);

  const hidden = Boolean(user && user.hide_support_ranking);
  const myRow = monthsRows.find(r => r.userId === userId);

  if (!myRow) {
    return { has_support: false, hidden, months: 0, rank: null };
  }

  const months = myRow.months;

  if (hidden) {
    return { has_support: true, hidden: true, months, rank: null };
  }

  const { ranked } = await rankVisible(monthsRows);
  const found = ranked.find(r => r.userId === userId);

  return { has_support: true, hidden: false, months, rank: found ? found.rank : null };
}

/**
 * 更新個人隱藏偏好。呼叫端須先確認該使用者有支持資格（months>0），否則回 403（router 層判斷）。
 * @param {Number} userId
 * @param {Boolean} hidden
 */
async function setHidden(userId, hidden) {
  await mysql("user").where({ id: userId }).update({ hide_support_ranking: hidden });
}

module.exports = {
  CARD_MONTH_WEIGHT,
  AMOUNT_PER_MONTH,
  computeMonthsByUser,
  rankRows,
  getPublicRanking,
  getMyStatus,
  setHidden,
  // exposed for LINE userId -> user.id resolution at the router/controller layer
  UserModel,
};
