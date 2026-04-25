if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: require("path").resolve(__dirname, "../../.env"),
  });
}

const fs = require("fs");
const path = require("path");
const moment = require("moment");
const mysql = require("../src/util/mysql");
const redis = require("../src/util/redis");
const AchievementEngine = require("../src/service/AchievementEngine");
const { DefaultLogger } = require("../src/util/Logger");

// Spec line 7 / impl plan line 280: rows with experience > 8,407,860 in the
// legacy curve are at Lv.100+ — the pioneer cohort that earns the hidden
// `prestige_pioneer` achievement on cut-over.
const PIONEER_THRESHOLD = 8407860;
const LEGACY_TABLE = "chat_user_data_legacy_snapshot";
const NEW_TABLE = "chat_user_data";
const PAUSE_FLAG = "CHAT_XP_PAUSED";
const PIONEER_ACHIEVEMENT_KEY = "prestige_pioneer";

class MigrationAbort extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationAbort";
  }
}

async function assertPaused() {
  const flag = await redis.get(PAUSE_FLAG);
  if (flag !== "1") {
    throw new MigrationAbort(
      `${PAUSE_FLAG} is not set to "1" (got ${JSON.stringify(flag)}). Set it before running the migration so EventDequeue stops writing to chat_user_data.`
    );
  }
}

async function assertSchema() {
  const hasLegacy = await mysql.schema.hasTable(LEGACY_TABLE);
  if (!hasLegacy) {
    throw new MigrationAbort(
      `${LEGACY_TABLE} not found. Run \`yarn migrate\` first so the M1 rename + recreate migration executes.`
    );
  }
  const hasNew = await mysql.schema.hasTable(NEW_TABLE);
  if (!hasNew) {
    throw new MigrationAbort(
      `${NEW_TABLE} not found. The M1 migration should have recreated it as an empty table.`
    );
  }
}

async function resolveUserKeyStrategy() {
  const hasPlatformId = await mysql.schema.hasColumn(LEGACY_TABLE, "platform_id");
  if (hasPlatformId) {
    return { mode: "direct", column: "platform_id" };
  }
  const hasIntId = await mysql.schema.hasColumn(LEGACY_TABLE, "id");
  if (hasIntId) {
    return { mode: "join", column: "id" };
  }
  throw new MigrationAbort(
    `${LEGACY_TABLE} has neither \`platform_id\` nor \`id\` — cannot resolve user identity.`
  );
}

function buildBaseQuery(strategy) {
  if (strategy.mode === "direct") {
    return mysql(`${LEGACY_TABLE} as legacy`).select(
      "legacy.platform_id as user_id",
      "legacy.experience as experience"
    );
  }
  return mysql(`${LEGACY_TABLE} as legacy`)
    .join("user", "user.id", "legacy.id")
    .select("user.platform_id as user_id", "legacy.experience as experience");
}

async function fetchPioneers(strategy) {
  const rows = await buildBaseQuery(strategy)
    .where("legacy.experience", ">", PIONEER_THRESHOLD)
    .orderBy("legacy.experience", "desc");
  return rows.filter(r => r.user_id);
}

async function seedNewTable(strategy) {
  const rows = await buildBaseQuery(strategy);
  const valid = rows.filter(r => r.user_id);
  if (valid.length === 0) return { inserted: 0, skipped: rows.length };

  const payload = valid.map(r => ({
    user_id: r.user_id,
    prestige_count: 0,
    current_level: 0,
    current_exp: 0,
  }));

  // Chunked INSERT … ON DUPLICATE KEY IGNORE keeps re-runs idempotent: the
  // PK is `user_id`, so the second pass is a no-op rather than an error or
  // an unwanted overwrite of a row the new pipeline already touched.
  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    await mysql(NEW_TABLE).insert(chunk).onConflict("user_id").ignore();
  }

  return { inserted: valid.length, skipped: rows.length - valid.length };
}

async function grantPioneerAchievement(pioneers) {
  const summary = {
    unlocked: 0,
    already_unlocked: 0,
    errors: 0,
    detail: [],
  };

  for (const pioneer of pioneers) {
    try {
      const result = await AchievementEngine.unlockByKey(pioneer.user_id, PIONEER_ACHIEVEMENT_KEY);
      const status = result.unlocked
        ? "unlocked"
        : result.reason === "already_unlocked"
          ? "already_unlocked"
          : `error:${result.reason || "unknown"}`;

      if (result.unlocked) summary.unlocked += 1;
      else if (result.reason === "already_unlocked") summary.already_unlocked += 1;
      else summary.errors += 1;

      summary.detail.push({
        user_id: pioneer.user_id,
        experience: pioneer.experience,
        achievement_result: status,
      });
    } catch (err) {
      summary.errors += 1;
      summary.detail.push({
        user_id: pioneer.user_id,
        experience: pioneer.experience,
        achievement_result: `error:${err.message}`,
      });
      DefaultLogger.error(
        `[migrate-prestige-system] unlockByKey threw for ${pioneer.user_id}: ${err.message}`
      );
    }
  }

  return summary;
}

function writeAuditLog(audit) {
  const logDir = path.resolve(__dirname, "../logs");
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const stamp = moment(audit.started_at).format("YYYYMMDD-HHmmss");
    const file = path.join(logDir, `migrate-prestige-${stamp}.log`);
    fs.writeFileSync(file, JSON.stringify(audit, null, 2));
    return file;
  } catch (err) {
    DefaultLogger.error(`[migrate-prestige-system] failed to write audit log: ${err.message}`);
    return null;
  }
}

async function main() {
  const audit = {
    started_at: new Date().toISOString(),
    finished_at: null,
    pioneer_threshold: PIONEER_THRESHOLD,
    snapshot_user_count: 0,
    seeded_count: 0,
    skipped_no_user_id: 0,
    pioneer_count: 0,
    achievement_unlocked: 0,
    achievement_already_unlocked: 0,
    achievement_errors: 0,
    pioneers: [],
  };

  await assertPaused();
  await assertSchema();
  const strategy = await resolveUserKeyStrategy();
  DefaultLogger.info(`[migrate-prestige-system] user-key strategy: ${strategy.mode}`);

  const totalRow = await mysql(LEGACY_TABLE).count({ count: "*" }).first();
  audit.snapshot_user_count = Number(totalRow.count) || 0;

  const seedResult = await seedNewTable(strategy);
  audit.seeded_count = seedResult.inserted;
  audit.skipped_no_user_id = seedResult.skipped;

  const pioneers = await fetchPioneers(strategy);
  audit.pioneer_count = pioneers.length;

  const grant = await grantPioneerAchievement(pioneers);
  audit.achievement_unlocked = grant.unlocked;
  audit.achievement_already_unlocked = grant.already_unlocked;
  audit.achievement_errors = grant.errors;
  audit.pioneers = grant.detail;

  audit.finished_at = new Date().toISOString();
  const logPath = writeAuditLog(audit);
  DefaultLogger.info(
    `[migrate-prestige-system] done. snapshot=${audit.snapshot_user_count} seeded=${audit.seeded_count} pioneers=${audit.pioneer_count} unlocked=${audit.achievement_unlocked} already=${audit.achievement_already_unlocked} errors=${audit.achievement_errors}${logPath ? ` log=${logPath}` : ""}`
  );

  return audit;
}

module.exports = main;
module.exports.MigrationAbort = MigrationAbort;
module.exports.PIONEER_THRESHOLD = PIONEER_THRESHOLD;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      if (err instanceof MigrationAbort) {
        DefaultLogger.error(`[migrate-prestige-system] ABORT: ${err.message}`);
      } else {
        DefaultLogger.error(`[migrate-prestige-system] fatal: ${err.message}`);
        console.error(err);
      }
      process.exit(1);
    });
}
