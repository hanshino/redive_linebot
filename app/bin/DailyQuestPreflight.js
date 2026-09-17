// Standalone operator CLI preload; worker/test require paths do not execute this branch.
if (require.main === module && process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
}

const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");
const { todayUtc8, toUtc8Date } = require("../src/util/date");
const DailyQuestService = require("../src/service/DailyQuestService");

const BRIDGE_ID = 1;

function value(row, lower, upper) {
  return row[lower] === undefined ? row[upper] : row[lower];
}

async function inspect({ db = mysql, manualAuditReference = "", runtimeDate = todayUtc8() } = {}) {
  const issues = [];
  const auditReference =
    typeof manualAuditReference === "string" ? manualAuditReference.trim() : "";
  const validAuditReference = /^[A-Za-z0-9._:/-]{3,200}$/.test(auditReference);
  const state = await db("daily_quest_bridge_state").where({ id: BRIDGE_ID }).first();
  if (!state) {
    return { ok: false, sinceDate: null, issues: [{ code: "BRIDGE_STATE_MISSING" }] };
  }
  const sinceDate = toUtc8Date(state.since_date);
  if (state.activated_at) issues.push({ code: "ALREADY_ACTIVATED" });
  const [timezoneRows] = await db.raw(
    "SELECT @@session.time_zone AS session_time_zone, " +
      "TIMEDIFF(NOW(), UTC_TIMESTAMP()) AS utc_offset, CURDATE() AS db_date"
  );
  const timezone = timezoneRows[0];
  if (String(value(timezone, "session_time_zone", "SESSION_TIME_ZONE")) !== "+08:00") {
    issues.push({ code: "SESSION_TIME_ZONE_MISMATCH" });
  }
  if (String(value(timezone, "utc_offset", "UTC_OFFSET")) !== "08:00:00") {
    issues.push({ code: "SESSION_UTC_OFFSET_MISMATCH" });
  }
  const dbDate = toUtc8Date(value(timezone, "db_date", "DB_DATE"));
  if (runtimeDate !== dbDate) issues.push({ code: "RUNTIME_DB_DATE_MISMATCH" });
  if (sinceDate !== runtimeDate) issues.push({ code: "SINCE_DATE_NOT_TODAY" });
  const weekday = require("moment").utc(sinceDate, "YYYY-MM-DD").day();
  if (weekday < 1 || weekday > 5) issues.push({ code: "SINCE_DATE_NOT_WEEKDAY" });
  if (!validAuditReference) {
    issues.push({ code: "MANUAL_AUDIT_UNCONFIRMED" });
  }

  const weekStart = DailyQuestService.weekStartOf(sinceDate);
  const weekEnd = require("moment")
    .utc(weekStart, "YYYY-MM-DD")
    .add(7, "days")
    .format("YYYY-MM-DD");
  const legacyRows = await db("daily_quest")
    .whereNull("quest_date")
    .whereRaw("DATE(created_at) >= ?", [weekStart])
    .whereRaw("DATE(created_at) < ?", [weekEnd])
    .orderBy("id")
    .select("id", "user_id", db.raw("DATE(created_at) AS quest_date"));

  const grouped = new Map();
  for (const row of legacyRows) {
    const date = toUtc8Date(row.quest_date);
    const key = `${row.user_id}\0${date}`;
    const current = grouped.get(key) || { userId: row.user_id, date, ids: [] };
    current.ids.push(row.id);
    grouped.set(key, current);
  }
  for (const group of grouped.values()) {
    if (group.ids.length > 1) {
      issues.push({
        code: "LEGACY_DUPLICATE_DATE",
        userId: group.userId,
        ids: group.ids,
        date: group.date,
      });
    }
    const [signin, janken] = await Promise.all([
      DailyQuestService.hasNormalSignin(db, group.userId, group.date),
      DailyQuestService.hasQualifyingJanken(db, group.userId, group.date),
    ]);
    if (!signin || !janken) {
      issues.push({
        code: "LEGACY_SOURCE_MISMATCH",
        userId: group.userId,
        ids: group.ids,
        date: group.date,
      });
    }
  }

  const counts = new Map();
  for (const row of legacyRows) counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
  for (const [userId, count] of counts) {
    if (count >= 7) issues.push({ code: "LEGACY_WEEK_COUNT_GE_7", userId, count });
  }
  return {
    ok: issues.length === 0,
    sinceDate,
    manualAuditReference: validAuditReference ? auditReference : null,
    issues,
  };
}

async function main(options = {}) {
  const result = await inspect(options);
  DefaultLogger.info(
    `[DailyQuestPreflight] ok=${result.ok} since_date=${result.sinceDate || "missing"} ` +
      `audit_reference=${result.manualAuditReference || "missing"} issues=${result.issues.length}`
  );
  for (const issue of result.issues) {
    DefaultLogger.warn(`[DailyQuestPreflight] STOP ${JSON.stringify(issue)}`);
  }
  if (!result.ok) {
    const error = Object.assign(new Error("DailyQuest preflight failed"), {
      code: "DAILY_QUEST_PREFLIGHT_FAILED",
      result,
    });
    throw error;
  }
  return result;
}

module.exports = main;
module.exports.inspect = inspect;

if (require.main === module) {
  const referenceArg = process.argv.find(arg => arg.startsWith("--manual-audit-reference="));
  const manualAuditReference = referenceArg
    ? referenceArg.slice(referenceArg.indexOf("=") + 1)
    : "";
  main({ manualAuditReference })
    .then(() => process.exit(0))
    .catch(error => {
      DefaultLogger.error(`[DailyQuestPreflight] fatal code=${error.code || "UNKNOWN"}`);
      process.exit(1);
    });
}
