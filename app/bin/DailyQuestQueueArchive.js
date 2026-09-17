// Standalone operator CLI preload; worker/test require paths do not execute this branch.
if (require.main === module && process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
}

const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");
const { toUtc8Date } = require("../src/util/date");
const DailyQuestService = require("../src/service/DailyQuestService");

const BRIDGE_ID = 1;
const INSERT_BATCH_SIZE = 500;
const AUDIT_PAGE_SIZE = 500;

function parseUserId(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.userId === "string" && parsed.userId ? parsed.userId : null;
  } catch {
    return null;
  }
}

async function classify(db, raw, sinceDate) {
  const userId = parseUserId(raw);
  if (!userId) return "unknown";
  const legacyPaid = await db("daily_quest")
    .where({ user_id: userId })
    .whereRaw("COALESCE(quest_date, DATE(created_at)) = ?", [sinceDate])
    .first("id");
  if (legacyPaid) return "legacyPaid";

  const [signin, janken] = await Promise.all([
    DailyQuestService.hasNormalSignin(db, userId, sinceDate),
    DailyQuestService.hasQualifyingJanken(db, userId, sinceDate),
  ]);
  if (signin && janken) return "scannerWillPay";
  if (!signin && !janken) return "notEligible";
  return "unknown";
}

async function main(options = {}) {
  const db = options.db || mysql;
  const state = await db("daily_quest_bridge_state").where({ id: BRIDGE_ID }).first();
  if (!state) {
    throw Object.assign(new Error("bridge state missing"), { code: "BRIDGE_STATE_MISSING" });
  }
  if (state.activated_at) {
    throw Object.assign(new Error("bridge already activated"), {
      code: "BRIDGE_ALREADY_ACTIVATED",
    });
  }
  const redisClient = options.redisClient || require("../src/util/redis");
  const capturedAt = options.capturedAt || new Date();
  const queueKey = options.queueKey || require("config").get("event_center.daily_quest");
  const sinceDate = toUtc8Date(state.since_date);
  const raws = await redisClient.lRange(queueKey, 0, -1);

  await db.transaction(async trx => {
    for (let i = 0; i < raws.length; i += INSERT_BATCH_SIZE) {
      await trx("daily_quest_legacy_queue_archive").insert(
        raws.slice(i, i + INSERT_BATCH_SIZE).map(raw => ({ raw, captured_at: capturedAt }))
      );
    }
  });

  const counts = { legacyPaid: 0, scannerWillPay: 0, notEligible: 0, unknown: 0 };
  const unknownIndexes = [];
  const classifications = [];
  for (let index = 0; index < raws.length; index += 1) {
    const classification = await classify(db, raws[index], sinceDate);
    counts[classification] += 1;
    classifications.push({ index, classification });
    if (classification === "unknown") unknownIndexes.push(index);
  }
  DefaultLogger.info(
    `[DailyQuestQueueArchive] archived=${raws.length} legacy_paid=${counts.legacyPaid} ` +
      `scanner_will_pay=${counts.scannerWillPay} not_eligible=${counts.notEligible} ` +
      `unknown=${counts.unknown}`
  );
  DefaultLogger.info(`[DailyQuestQueueArchive] classifications=${JSON.stringify(classifications)}`);
  return { archived: raws.length, counts, unknownIndexes, classifications };
}

module.exports = main;
module.exports.main = main;
module.exports.classify = classify;

/**
 * Pre-activation-only, read-only re-classification of every persisted
 * daily_quest_legacy_queue_archive row (not just the most recent capture),
 * using the same `classify` against the bridge's fixed `since_date`.
 *
 * No SQL write, no Redis import/access, no schema/replay/delete/activation.
 * Traverses the full table via stable ascending-id keyset pagination (no
 * "newest capture only" filter), so unknowns left over from an earlier
 * capture are still reported even if the live queue is currently empty —
 * this function never reads the live queue at all.
 *
 * Same fail-closed pre-activation contract as `main`: missing or already
 * activated bridge state throws before any row is read.
 */
async function audit(options = {}) {
  const db = options.db || mysql;
  const pageSize = options.pageSize || AUDIT_PAGE_SIZE;
  const state = await db("daily_quest_bridge_state").where({ id: BRIDGE_ID }).first();
  if (!state) {
    throw Object.assign(new Error("bridge state missing"), { code: "BRIDGE_STATE_MISSING" });
  }
  if (state.activated_at) {
    throw Object.assign(new Error("bridge already activated"), {
      code: "BRIDGE_ALREADY_ACTIVATED",
    });
  }
  const sinceDate = toUtc8Date(state.since_date);

  const counts = { legacyPaid: 0, scannerWillPay: 0, notEligible: 0, unknown: 0 };
  const unknownIds = [];
  let total = 0;
  let lastId = 0;
  for (;;) {
    const page = await db("daily_quest_legacy_queue_archive")
      .where("id", ">", lastId)
      .orderBy("id", "asc")
      .limit(pageSize)
      .select("id", "raw");
    if (!page.length) break;
    // Per-page {archiveId, classification} pairs only — never accumulated across pages,
    // so memory stays bounded regardless of table size. Only stable DB ids + counts +
    // unknownIds survive past this page; raw payloads/userIds never enter the log.
    const pageClassifications = [];
    for (const row of page) {
      const classification = await classify(db, row.raw, sinceDate);
      counts[classification] += 1;
      pageClassifications.push({ archiveId: row.id, classification });
      if (classification === "unknown") unknownIds.push(row.id);
      total += 1;
    }
    DefaultLogger.info(
      `[DailyQuestQueueArchive] audit page=${JSON.stringify(pageClassifications)}`
    );
    lastId = page[page.length - 1].id;
    if (page.length < pageSize) break;
  }

  return { passed: unknownIds.length === 0, sinceDate, total, counts, unknownIds };
}

module.exports.audit = audit;

/**
 * CLI entry seam, extracted so tests can exercise exit-code behavior via an
 * injected `exit` function instead of a real `process.exit`, without going
 * through the require.main dotenv/server-adjacent bootstrap.
 *
 * Strict argv contract: only exactly `[]` (capture mode, backward compatible)
 * or exactly `["--audit"]` (audit mode) are accepted. Any unknown flag,
 * duplicate, or extra positional argument fails closed — exit(1) before any
 * `main`/`audit` call, so no capture/audit SQL or Redis I/O happens on a
 * malformed invocation (the shared `mysql` module import itself may still
 * run its own timezone bootstrap query independent of argv validation —
 * see `src/util/mysql.js`). The rejected argv itself is never logged (could
 * carry operator-typo'd sensitive values); only a generic count/code is
 * logged.
 */
async function runCLI({ argv = process.argv.slice(2), exit = process.exit, options = {} } = {}) {
  const isCaptureArgv = argv.length === 0;
  const isAuditArgv = argv.length === 1 && argv[0] === "--audit";
  if (!isCaptureArgv && !isAuditArgv) {
    DefaultLogger.error(
      `[DailyQuestQueueArchive] fatal code=INVALID_ARGV arg_count=${argv.length}`
    );
    exit(1);
    return;
  }
  try {
    if (isAuditArgv) {
      const result = await audit(options);
      DefaultLogger.info(
        `[DailyQuestQueueArchive] audit passed=${result.passed} since_date=${result.sinceDate} ` +
          `total=${result.total} legacy_paid=${result.counts.legacyPaid} ` +
          `scanner_will_pay=${result.counts.scannerWillPay} not_eligible=${result.counts.notEligible} ` +
          `unknown=${result.counts.unknown}`
      );
      if (result.unknownIds.length) {
        DefaultLogger.warn(
          `[DailyQuestQueueArchive] audit unknown_archive_ids=${JSON.stringify(result.unknownIds)}`
        );
      }
      exit(result.passed ? 0 : 1);
      return;
    }
    await main(options);
    exit(0);
  } catch (error) {
    DefaultLogger.error(`[DailyQuestQueueArchive] fatal code=${error.code || "UNKNOWN"}`);
    exit(1);
  }
}

module.exports.runCLI = runCLI;

if (require.main === module) {
  runCLI();
}
