const moment = require("moment");
const mysql = require("../util/mysql");
const { todayUtc8 } = require("../util/date");
const gacha = require("../model/princess/gacha");
const AchievementEngine = require("./AchievementEngine");
const { toUnlockNoticeList } = require("./achievementPublicView");
const { DefaultLogger } = require("../util/Logger");

const TABLE = "signin_ledger";
const GODDESS_STONE_ITEM_ID = 999;
const MAKEUP_COST = 20000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// MySQL 的 DATE 欄位會被 driver 轉成 JS Date，再受連線時區影響。
// 直接在 SQL 端格式化成字串，整條路徑就只有一種型別，不必在 JS 端再猜時區。
const DATE_SELECT = "DATE_FORMAT(signin_date, '%Y-%m-%d') AS signin_date";

class SigninError extends Error {
  constructor(code) {
    super(code);
    this.name = "SigninError";
    this.code = code;
  }
}

const qb = trx => (trx || mysql)(TABLE);

const isDuplicate = e => e && e.code === "ER_DUP_ENTRY";

function isValidDate(date) {
  return (
    typeof date === "string" &&
    DATE_PATTERN.test(date) &&
    moment(date, "YYYY-MM-DD", true).isValid()
  );
}

/**
 * 從 today（今天已簽）或 yesterday（今天未簽但昨天有簽）往回數連續天數。
 * normal 與 makeup 等價 —— ledger 有列就算簽到。
 *
 * @param {Array<String>} dates 該使用者所有簽到日期（YYYY-MM-DD，順序不拘）
 * @param {String} today
 * @returns {Number}
 */
function computeStreak(dates, today) {
  const set = new Set(dates);
  const yesterday = moment(today, "YYYY-MM-DD").subtract(1, "day").format("YYYY-MM-DD");

  let cursor;
  if (set.has(today)) cursor = today;
  else if (set.has(yesterday)) cursor = yesterday;
  else return 0;

  let streak = 0;
  const walker = moment(cursor, "YYYY-MM-DD");
  while (set.has(walker.format("YYYY-MM-DD"))) {
    streak += 1;
    walker.subtract(1, "day");
  }
  return streak;
}

function listDates(userId, trx) {
  return qb(trx)
    .where({ user_id: userId })
    .orderBy("signin_date", "desc")
    .select(mysql.raw(DATE_SELECT))
    .then(rows => rows.map(row => row.signin_date));
}

/**
 * 寫入一筆「正常」簽到（每日一抽觸發）。已存在則不重複寫、不報錯。
 * 呼叫端若傳入 trx，寫入會落在該交易內（每日一抽就是這樣共用同一筆交易）。
 *
 * @param {String} userId
 * @param {Object} [options]
 * @param {import("knex").Knex.Transaction} [options.trx]
 * @param {String} [options.date] YYYY-MM-DD，預設今天（UTC+8）
 * @returns {Promise<{created: Boolean, date: String}>}
 */
async function recordNormal(userId, options = {}) {
  const { trx } = options;
  const date = options.date || todayUtc8();

  const existing = await qb(trx).where({ user_id: userId, signin_date: date }).first("id");
  if (existing) return { created: false, date };

  try {
    await qb(trx).insert({
      user_id: userId,
      signin_date: date,
      source: "normal",
      cost_stones: 0,
    });
  } catch (e) {
    if (isDuplicate(e)) return { created: false, date };
    throw e;
  }

  return { created: true, date };
}

/**
 * 補簽：只允許當月、昨天（含）以前的日期，扣除女神石後補一筆 makeup ledger。
 * 錯誤以 domain code 回傳（不 throw），意料外的例外才往上拋。
 *
 * @param {String} userId
 * @param {String} date YYYY-MM-DD
 * @returns {Promise<{ok: Boolean, code?: String, date?: String, cost?: Number,
 *   balance?: Number, unlocked?: Array}>}
 */
async function makeup(userId, date) {
  if (!isValidDate(date)) return { ok: false, code: "INVALID_DATE" };

  const today = todayUtc8();
  if (date.slice(0, 7) !== today.slice(0, 7)) return { ok: false, code: "NOT_CURRENT_MONTH" };
  // 字串比較在同格式的 YYYY-MM-DD 上等價於日期比較；今天與未來都不可補。
  if (date >= today) return { ok: false, code: "DATE_NOT_PAST" };

  let balance = 0;
  try {
    await mysql.transaction(async trx => {
      // per-user 鎖：SELECT ... FOR UPDATE 鎖住這位使用者的女神石帳列，
      // 讓同一人的補簽序列化 —— 餘額讀取與扣款落在同一把鎖內，
      // 兩筆併發不會各自通過餘額檢查後重複扣。
      // 沒有任何帳列 = 餘額 0，必然被 INSUFFICIENT_STONES 擋下，不需另外鎖。
      const rows = await trx("inventory")
        .where({ userId, itemId: GODDESS_STONE_ITEM_ID })
        .select("itemAmount")
        .forUpdate();
      balance = rows.reduce((acc, row) => acc + Number(row.itemAmount || 0), 0);

      // 先看有沒有簽過：已簽的人該拿到 ALREADY_SIGNED，不該被餘額不足蓋掉。
      const existing = await qb(trx).where({ user_id: userId, signin_date: date }).first("id");
      if (existing) throw new SigninError("ALREADY_SIGNED");

      if (balance < MAKEUP_COST) throw new SigninError("INSUFFICIENT_STONES");

      // ledger 先寫：unique(user_id, signin_date) 撞車會讓整筆交易回滾，
      // 扣款那列跟著不存在 —— 重複補簽絕不會重複扣女神石。
      await qb(trx).insert({
        user_id: userId,
        signin_date: date,
        source: "makeup",
        cost_stones: MAKEUP_COST,
      });

      await trx("inventory").insert({
        userId,
        itemId: GODDESS_STONE_ITEM_ID,
        itemAmount: -MAKEUP_COST,
        note: `signin_makeup:${date}`,
      });
    });
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, code: "ALREADY_SIGNED" };
    if (e instanceof SigninError) {
      return e.code === "INSUFFICIENT_STONES"
        ? { ok: false, code: e.code, balance, cost: MAKEUP_COST }
        : { ok: false, code: e.code };
    }
    throw e;
  }

  // evaluateAchievements 自己吞例外並回 { unlocked: [] }，補簽本身已經 commit，
  // 成就掛掉不該讓呼叫端以為補簽失敗。
  // 這裡是給前端的出口，投影成 unlock notice —— 不得帶出 condition / notify_message。
  const { unlocked } = await evaluateAchievements(userId, { source: "makeup", date });

  return { ok: true, date, cost: MAKEUP_COST, unlocked: toUnlockNoticeList(unlocked) };
}

/**
 * 簽到統計。streak 跨月連續計算，total 為 ledger 全部筆數，
 * fullMonth 僅在當月每一天都有 ledger 時為 true。
 *
 * @param {String} userId
 * @param {Object} [options]
 * @param {import("knex").Knex.Transaction} [options.trx]
 * @returns {Promise<{month:String, today:String, daysInMonth:Number, streak:Number,
 *   total:Number, monthCount:Number, fullMonth:Boolean}>}
 */
async function getSummary(userId, options = {}) {
  const today = todayUtc8();
  const month = today.slice(0, 7);
  const daysInMonth = moment(today, "YYYY-MM-DD").daysInMonth();

  const dates = await listDates(userId, options.trx);
  const monthCount = dates.filter(d => d.startsWith(month)).length;

  return {
    month,
    today,
    daysInMonth,
    streak: computeStreak(dates, today),
    total: dates.length,
    monthCount,
    // unique(user_id, signin_date) 保證一天最多一列，所以列數就等於天數。
    fullMonth: monthCount >= daysInMonth,
  };
}

/**
 * 當月月曆 payload（GET /api/me/signins 的回應本體）。
 * @param {String} userId
 */
async function getCalendar(userId) {
  const summary = await getSummary(userId);
  const monthEnd = `${summary.month}-${String(summary.daysInMonth).padStart(2, "0")}`;

  const [rows, godStoneBalance] = await Promise.all([
    qb()
      .where({ user_id: userId })
      .andWhere("signin_date", ">=", `${summary.month}-01`)
      .andWhere("signin_date", "<=", monthEnd)
      .orderBy("signin_date", "asc")
      .select(mysql.raw(DATE_SELECT), "source", "cost_stones"),
    gacha.getUserGodStoneCount(userId),
  ]);

  return {
    month: summary.month,
    today: summary.today,
    daysInMonth: summary.daysInMonth,
    makeupCost: MAKEUP_COST,
    godStoneBalance: Number(godStoneBalance) || 0,
    entries: rows.map(row => ({
      date: row.signin_date,
      source: row.source,
      costStones: Number(row.cost_stones) || 0,
    })),
    stats: {
      streak: summary.streak,
      total: summary.total,
      monthCount: summary.monthCount,
      fullMonth: summary.fullMonth,
    },
  };
}

/**
 * 簽到成就評估。只在「真的新增了一筆 ledger」之後、交易 commit 完才呼叫，
 * 否則 streak/total 會讀到未提交的狀態。失敗只記錄，不影響簽到本身。
 *
 * @param {String} userId
 * @param {Object} meta
 * @param {"normal"|"makeup"} meta.source
 * @param {String} meta.date
 * @returns {Promise<{unlocked: Array}>}
 */
async function evaluateAchievements(userId, meta) {
  try {
    const summary = await getSummary(userId);
    return await AchievementEngine.evaluate(userId, "signin", {
      source: meta.source,
      date: meta.date,
      // 當前月份（UTC+8 的 YYYY-MM）—— 讓 definition 能用 condition.month 綁定
      // 特定月份的全勤成就。不從 meta.date 推導：補簽的是過去某天，
      // 但 fullMonth 講的一律是「現在這個月」，兩者混用會在跨月時給錯月份。
      month: summary.month,
      streak: summary.streak,
      total: summary.total,
      monthCount: summary.monthCount,
      daysInMonth: summary.daysInMonth,
      fullMonth: summary.fullMonth,
    });
  } catch (err) {
    DefaultLogger.warn(
      `SigninService.evaluateAchievements failed user=${userId}: ${err && err.message}`
    );
    return { unlocked: [] };
  }
}

module.exports = {
  MAKEUP_COST,
  recordNormal,
  makeup,
  getSummary,
  getCalendar,
  evaluateAchievements,
  _computeStreak: computeStreak,
};
