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
const { DefaultLogger } = require("../src/util/Logger");

const LEGACY_TABLE = "chat_user_data_legacy_snapshot";
const NEW_TABLE = "chat_user_data";
const PAUSE_FLAG = "CHAT_XP_PAUSED";
const PIONEER_ACHIEVEMENT_KEY = "prestige_pioneer";

class RollbackAbort extends Error {
  constructor(message) {
    super(message);
    this.name = "RollbackAbort";
  }
}

async function assertPaused() {
  const flag = await redis.get(PAUSE_FLAG);
  if (flag !== "1") {
    throw new RollbackAbort(
      `${PAUSE_FLAG} is not set to "1" (got ${JSON.stringify(flag)}). Set it before rolling back so the new pipeline doesn't race the schema swap.`
    );
  }
}

async function assertSchemaForRollback() {
  const hasLegacy = await mysql.schema.hasTable(LEGACY_TABLE);
  if (!hasLegacy) {
    throw new RollbackAbort(
      `${LEGACY_TABLE} not found — the rollback window has likely closed (T+72h drop). Restore from logical backup if needed.`
    );
  }
  const hasNew = await mysql.schema.hasTable(NEW_TABLE);
  if (!hasNew) {
    throw new RollbackAbort(
      `${NEW_TABLE} not found. The schema is already partially rolled back; finish manually with \`RENAME TABLE\` and audit.`
    );
  }
}

async function findPioneerAchievementId() {
  const row = await mysql("achievements").where({ key: PIONEER_ACHIEVEMENT_KEY }).first("id");
  if (!row) {
    throw new RollbackAbort(
      `achievements row with key='${PIONEER_ACHIEVEMENT_KEY}' missing — cannot revoke.`
    );
  }
  return row.id;
}

async function swapSchema() {
  // DROP first, then RENAME. Order matters because both targets share the
  // name `chat_user_data`. If the RENAME fails after the DROP, the operator
  // must restore from a logical backup — the runbook documents this.
  await mysql.schema.dropTable(NEW_TABLE);
  await mysql.schema.renameTable(LEGACY_TABLE, NEW_TABLE);
}

async function revokePioneerAchievement(achievementId) {
  return mysql("user_achievements").where({ achievement_id: achievementId }).del();
}

function writeAuditLog(audit) {
  const logDir = path.resolve(__dirname, "../logs");
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const stamp = moment(audit.started_at).format("YYYYMMDD-HHmmss");
    const file = path.join(logDir, `rollback-prestige-${stamp}.log`);
    fs.writeFileSync(file, JSON.stringify(audit, null, 2));
    return file;
  } catch (err) {
    DefaultLogger.error(`[rollback-prestige-system] failed to write audit log: ${err.message}`);
    return null;
  }
}

async function main() {
  const audit = {
    started_at: new Date().toISOString(),
    finished_at: null,
    pioneer_achievement_id: null,
    revoked_count: 0,
    schema_swapped: false,
  };

  await assertPaused();
  await assertSchemaForRollback();

  const achievementId = await findPioneerAchievementId();
  audit.pioneer_achievement_id = achievementId;

  await swapSchema();
  audit.schema_swapped = true;

  audit.revoked_count = await revokePioneerAchievement(achievementId);

  audit.finished_at = new Date().toISOString();
  const logPath = writeAuditLog(audit);
  DefaultLogger.info(
    `[rollback-prestige-system] done. revoked=${audit.revoked_count}${logPath ? ` log=${logPath}` : ""}`
  );

  return audit;
}

module.exports = main;
module.exports.RollbackAbort = RollbackAbort;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      if (err instanceof RollbackAbort) {
        DefaultLogger.error(`[rollback-prestige-system] ABORT: ${err.message}`);
      } else {
        DefaultLogger.error(`[rollback-prestige-system] fatal: ${err.message}`);
        console.error(err);
      }
      process.exit(1);
    });
}
