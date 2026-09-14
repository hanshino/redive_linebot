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

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      DefaultLogger.error(`[DailyQuestQueueArchive] fatal code=${error.code || "UNKNOWN"}`);
      process.exit(1);
    });
}
