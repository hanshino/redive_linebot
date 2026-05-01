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

// Legacy `chat_exp_unit` cumulative XP at each milestone level. The migration
// grants tiered memorial achievements based on a snapshot of `chat_user_data.experience`
// at cut-over. A user is awarded every tier whose threshold they cleared
// (e.g. an Lv.100+ user receives all three).
const LEGACY_TIERS = [
  { key: "prestige_pioneer", label: "lv100", threshold: 8407860 },
  { key: "legacy_lv80", label: "lv80", threshold: 3357460 },
  { key: "legacy_lv50", label: "lv50", threshold: 200860 },
];
const LOWEST_THRESHOLD = LEGACY_TIERS.reduce(
  (min, t) => Math.min(min, t.threshold),
  Number.POSITIVE_INFINITY
);
const LEGACY_TABLE = "chat_user_data_legacy_snapshot";
const NEW_TABLE = "chat_user_data";
const PAUSE_FLAG = "CHAT_XP_PAUSED";

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

async function fetchTierMembers(strategy) {
  const rows = await buildBaseQuery(strategy)
    .where("legacy.experience", ">=", LOWEST_THRESHOLD)
    .orderBy("legacy.experience", "desc");
  return rows.filter(r => r.user_id);
}

function tiersForExperience(experience) {
  return LEGACY_TIERS.filter(t => experience >= t.threshold);
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

function newTierStat() {
  return { count: 0, unlocked: 0, already_unlocked: 0, errors: 0 };
}

async function grantTierAchievements(members) {
  const summary = {
    unlocked: 0,
    already_unlocked: 0,
    errors: 0,
    by_tier: {},
    grants: [],
  };
  for (const tier of LEGACY_TIERS) {
    summary.by_tier[tier.label] = newTierStat();
  }

  for (const member of members) {
    const tiers = tiersForExperience(member.experience);
    for (const tier of tiers) {
      const stat = summary.by_tier[tier.label];
      stat.count += 1;

      let status;
      try {
        const result = await AchievementEngine.unlockByKey(member.user_id, tier.key);
        if (result.unlocked) {
          status = "unlocked";
          summary.unlocked += 1;
          stat.unlocked += 1;
        } else if (result.reason === "already_unlocked") {
          status = "already_unlocked";
          summary.already_unlocked += 1;
          stat.already_unlocked += 1;
        } else {
          status = `error:${result.reason || "unknown"}`;
          summary.errors += 1;
          stat.errors += 1;
        }
      } catch (err) {
        status = `error:${err.message}`;
        summary.errors += 1;
        stat.errors += 1;
        DefaultLogger.error(
          `[migrate-prestige-system] unlockByKey threw for ${member.user_id}/${tier.key}: ${err.message}`
        );
      }

      summary.grants.push({
        user_id: member.user_id,
        experience: member.experience,
        achievement_key: tier.key,
        tier: tier.label,
        achievement_result: status,
      });
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
    legacy_tiers: LEGACY_TIERS.map(t => ({
      key: t.key,
      label: t.label,
      threshold: t.threshold,
    })),
    snapshot_user_count: 0,
    seeded_count: 0,
    skipped_no_user_id: 0,
    tier_member_count: 0,
    achievement_unlocked: 0,
    achievement_already_unlocked: 0,
    achievement_errors: 0,
    by_tier: {},
    grants: [],
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

  const members = await fetchTierMembers(strategy);
  audit.tier_member_count = members.length;

  const grant = await grantTierAchievements(members);
  audit.achievement_unlocked = grant.unlocked;
  audit.achievement_already_unlocked = grant.already_unlocked;
  audit.achievement_errors = grant.errors;
  audit.by_tier = grant.by_tier;
  audit.grants = grant.grants;

  audit.finished_at = new Date().toISOString();
  const logPath = writeAuditLog(audit);
  const tierBreakdown = LEGACY_TIERS.map(t => `${t.label}=${audit.by_tier[t.label].count}`).join(
    " "
  );
  DefaultLogger.info(
    `[migrate-prestige-system] done. snapshot=${audit.snapshot_user_count} seeded=${audit.seeded_count} ${tierBreakdown} unlocked=${audit.achievement_unlocked} already=${audit.achievement_already_unlocked} errors=${audit.achievement_errors}${logPath ? ` log=${logPath}` : ""}`
  );

  return audit;
}

module.exports = main;
module.exports.MigrationAbort = MigrationAbort;
module.exports.LEGACY_TIERS = LEGACY_TIERS;
// Backward compat: runbook references PIONEER_THRESHOLD by name.
module.exports.PIONEER_THRESHOLD = LEGACY_TIERS.find(t => t.key === "prestige_pioneer").threshold;

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
