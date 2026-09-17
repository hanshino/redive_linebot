const moment = require("moment");
const config = require("config");
const mysql = require("../util/mysql");
const { DefaultLogger } = require("../util/Logger");
const { toUtc8Date, todayUtc8 } = require("../util/date");

const BRIDGE_ID = 1;
const PAGE_SIZE = 500;
const SOURCE = Object.freeze({ MANUAL: "manual", ARENA: "arena", AUTO: "auto" });

function normalizeDate(value, label = "date") {
  const date = value instanceof Date ? toUtc8Date(value) : String(value || "");
  if (!moment(date, "YYYY-MM-DD", true).isValid()) throw new Error(`Invalid ${label}`);
  return date;
}

function addDays(date, days) {
  return moment.utc(date, "YYYY-MM-DD").add(days, "days").format("YYYY-MM-DD");
}

function dateBounds(date) {
  const normalized = normalizeDate(date);
  const start = moment.parseZone(`${normalized}T00:00:00+08:00`);
  return { start: start.toDate(), end: start.clone().add(1, "day").toDate() };
}

function weekStartOf(date) {
  const day = moment.utc(normalizeDate(date), "YYYY-MM-DD");
  return day.subtract(day.day(), "days").format("YYYY-MM-DD");
}

async function hasNormalSignin(db, userId, date) {
  return Boolean(
    await db("signin_ledger")
      .where({ user_id: userId, signin_date: date, source: "normal" })
      .first("id")
  );
}

async function hasQualifyingJanken(db, userId, date) {
  const { start, end } = dateBounds(date);
  const manual = await db("janken_result as result")
    .join("janken_records as record", "record.id", "result.record_id")
    .where("result.user_id", userId)
    .whereIn("record.source", [SOURCE.MANUAL, SOURCE.ARENA])
    .where("result.created_at", ">=", start)
    .where("result.created_at", "<", end)
    .first("result.id");
  if (manual) return true;

  // U3 的 janken_result.created_at 是 commit 時刻；auto 跨午夜時必須回到 immutable manifest
  // 的 run_date，不能把翌日 commit 時刻冒充事件歸屬日。
  return Boolean(
    await db("janken_result as result")
      .join("janken_records as record", "record.id", "result.record_id")
      .join("janken_auto_match_participant as participant", function () {
        this.on("participant.match_id", "=", "result.record_id").andOn(
          "participant.user_id",
          "=",
          "result.user_id"
        );
      })
      .where("result.user_id", userId)
      .where("record.source", SOURCE.AUTO)
      .where("participant.run_date", date)
      .where("participant.status", "completed")
      .first("result.id")
  );
}

async function isEligible(db, userId, date) {
  if (!(await hasNormalSignin(db, userId, date))) return false;
  return hasQualifyingJanken(db, userId, date);
}

async function countWeek(db, userId, date, sinceDate) {
  const weekStart = weekStartOf(date);
  const weekEnd = addDays(weekStart, 7);
  if (weekStart === weekStartOf(sinceDate)) {
    const row = await db("daily_quest")
      .where({ user_id: userId })
      .whereRaw("COALESCE(quest_date, DATE(created_at)) >= ?", [weekStart])
      .whereRaw("COALESCE(quest_date, DATE(created_at)) < ?", [weekEnd])
      .select(db.raw("COUNT(DISTINCT COALESCE(quest_date, DATE(created_at))) AS count"))
      .first();
    return Number(row.count || 0);
  }
  const row = await db("daily_quest_completion")
    .where({ user_id: userId })
    .where("quest_date", ">=", weekStart)
    .where("quest_date", "<", weekEnd)
    .count({ count: "*" })
    .first();
  return Number(row.count || 0);
}

async function readActiveState(db = mysql) {
  const row = await db("daily_quest_bridge_state").where({ id: BRIDGE_ID }).first();
  if (!row || !row.activated_at) return null;
  return { sinceDate: normalizeDate(row.since_date, "since_date"), activatedAt: row.activated_at };
}

async function settleUserDay(userId, date, sinceDate) {
  const questDate = normalizeDate(date);
  const fixedSinceDate = normalizeDate(sinceDate, "since_date");
  if (questDate < fixedSinceDate) throw new Error("quest date precedes since_date");
  const state = await readActiveState();
  if (!state || state.sinceDate !== fixedSinceDate) return { status: "inactive" };

  // U6 contract: ensure is autocommit and must happen before opening the effect transaction.
  const AchievementEngine = require("./AchievementEngine");
  await AchievementEngine.ensureUserLock(userId);
  return mysql.transaction(async trx => {
    await AchievementEngine.lockUserInTransaction(trx, userId);
    if (!(await isEligible(trx, userId, questDate))) return { status: "ineligible" };

    const completion = await trx("daily_quest_completion")
      .where({ user_id: userId, quest_date: questDate })
      .first();
    if (completion) return { status: "completed" };

    const existingQuest = await trx("daily_quest")
      .where({ user_id: userId })
      .whereRaw("COALESCE(quest_date, DATE(created_at)) = ?", [questDate])
      .first("id");

    await trx("daily_quest_completion").insert({ user_id: userId, quest_date: questDate });
    let rewarded = false;
    if (!existingQuest) {
      await trx("daily_quest").insert({ user_id: userId, quest_date: questDate });
      await trx("inventory").insert({
        userId,
        itemId: config.get("daily_quest.reward.itemId"),
        itemAmount: config.get("daily_quest.reward.itemAmount"),
        note: "daily_quest",
      });
      rewarded = true;
    }

    const weekStart = weekStartOf(questDate);
    let weeklyRewarded = false;
    if ((await countWeek(trx, userId, questDate, fixedSinceDate)) >= 7) {
      const claim = await trx("daily_quest_weekly_claim")
        .where({ user_id: userId, week_start: weekStart })
        .first();
      if (!claim) {
        await trx("daily_quest_weekly_claim").insert({ user_id: userId, week_start: weekStart });
        await trx("inventory").insert({
          userId,
          itemId: config.get("daily_quest.weekly_reward.itemId"),
          itemAmount: config.get("daily_quest.weekly_reward.itemAmount"),
          note: "daily_quest_weekly",
        });
        weeklyRewarded = true;
      }
    }
    return { status: existingQuest ? "seeded" : "rewarded", rewarded, weeklyRewarded };
  });
}

function excludeCompleted(query, date) {
  return query.whereNotExists(function () {
    this.select(mysql.raw("1"))
      .from("daily_quest_completion as completion")
      .whereRaw("completion.user_id = result.user_id")
      .where("completion.quest_date", date);
  });
}

async function scanRows(queryFactory, initialCursor, cursorOf) {
  const users = new Set();
  let cursor = initialCursor;
  while (true) {
    const rows = await queryFactory(cursor);
    if (rows.length === 0) break;
    for (const row of rows) users.add(row.user_id);
    cursor = cursorOf(rows[rows.length - 1]);
    if (rows.length < PAGE_SIZE) break;
  }
  return users;
}

async function candidateUsersForDate(date) {
  const { start, end } = dateBounds(date);
  const manual = await scanRows(
    cursor => {
      const query = mysql("janken_result as result")
        .join("janken_records as record", "record.id", "result.record_id")
        .join("signin_ledger as signin", "signin.user_id", "result.user_id")
        .whereIn("record.source", [SOURCE.MANUAL, SOURCE.ARENA])
        .where("signin.signin_date", date)
        .where("signin.source", "normal")
        .where("result.created_at", ">=", start)
        .where("result.created_at", "<", end)
        .andWhere(builder =>
          builder
            .where("result.created_at", ">", cursor.createdAt)
            .orWhere(sub =>
              sub.where("result.created_at", cursor.createdAt).where("result.id", ">", cursor.id)
            )
        )
        .orderBy("result.created_at", "asc")
        .orderBy("result.id", "asc")
        .limit(PAGE_SIZE)
        .select("result.id", "result.user_id", "result.created_at");
      return excludeCompleted(query, date);
    },
    { createdAt: start, id: 0 },
    row => ({ createdAt: row.created_at, id: row.id })
  );
  const auto = await scanRows(
    cursor => {
      const query = mysql("janken_result as result")
        .join("janken_records as record", "record.id", "result.record_id")
        .join("signin_ledger as signin", "signin.user_id", "result.user_id")
        .join("janken_auto_match_participant as participant", function () {
          this.on("participant.match_id", "=", "result.record_id").andOn(
            "participant.user_id",
            "=",
            "result.user_id"
          );
        })
        .where("record.source", SOURCE.AUTO)
        .where("signin.signin_date", date)
        .where("signin.source", "normal")
        .where("participant.run_date", date)
        .where("participant.status", "completed")
        .andWhere(builder =>
          builder
            .where("result.created_at", ">", cursor.createdAt)
            .orWhere(sub =>
              sub.where("result.created_at", cursor.createdAt).where("result.id", ">", cursor.id)
            )
        )
        .orderBy("result.created_at", "asc")
        .orderBy("result.id", "asc")
        .limit(PAGE_SIZE)
        .select("result.id", "result.user_id", "result.created_at");
      return excludeCompleted(query, date);
    },
    { createdAt: new Date(0), id: 0 },
    row => ({ createdAt: row.created_at, id: row.id })
  );
  return new Set([...manual, ...auto]);
}

async function run({ today = todayUtc8() } = {}) {
  const state = await readActiveState();
  if (!state) return { activated: false, processed: 0, rewarded: 0, weeklyRewarded: 0, failed: 0 };
  const endDate = normalizeDate(today, "today");
  if (endDate < state.sinceDate) {
    return { activated: true, processed: 0, rewarded: 0, weeklyRewarded: 0, failed: 0 };
  }

  const result = { activated: true, processed: 0, rewarded: 0, weeklyRewarded: 0, failed: 0 };
  for (let date = state.sinceDate; date <= endDate; date = addDays(date, 1)) {
    const users = await candidateUsersForDate(date);
    for (const userId of users) {
      try {
        const settled = await settleUserDay(userId, date, state.sinceDate);
        if (!["inactive", "ineligible", "completed"].includes(settled.status)) {
          result.processed += 1;
        }
        if (settled.rewarded) result.rewarded += 1;
        if (settled.weeklyRewarded) result.weeklyRewarded += 1;
      } catch (error) {
        result.failed += 1;
        DefaultLogger.warn(`[DailyQuest] settlement failed code=${error.code || "UNKNOWN"}`);
      }
    }
  }
  return result;
}

module.exports = {
  run,
  settleUserDay,
  readActiveState,
  hasNormalSignin,
  hasQualifyingJanken,
  isEligible,
  dateBounds,
  weekStartOf,
};
