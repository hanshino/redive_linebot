// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const GODDESS_STONE_ITEM_ID = 999;
const SENTINEL_NOTE = "成就獎勵 [legacy-tier-migration-2026-05-01]";

// Cumulative XP thresholds in the legacy `chat_exp_unit` curve.
// A user is awarded every tier whose threshold they cleared
// (Lv.100+ users receive all three).
const LEGACY_TIERS = [
  { key: "prestige_pioneer", threshold: 8407860, reward_stones: 500 },
  { key: "legacy_lv80", threshold: 3357460, reward_stones: 300 },
  { key: "legacy_lv50", threshold: 200860, reward_stones: 150 },
];
const LEGACY_TABLE = "chat_user_data_legacy_snapshot";

async function resolveUserKeyStrategy(knex) {
  const hasPlatformId = await knex.schema.hasColumn(LEGACY_TABLE, "platform_id");
  if (hasPlatformId) return "direct";
  const hasIntId = await knex.schema.hasColumn(LEGACY_TABLE, "id");
  if (hasIntId) return "join";
  throw new Error(
    `${LEGACY_TABLE} has neither \`platform_id\` nor \`id\` — cannot resolve user identity.`
  );
}

function userIdSelect(strategy) {
  return strategy === "direct" ? "legacy.platform_id" : "user.platform_id";
}

function fromClause(strategy) {
  return strategy === "direct"
    ? `${LEGACY_TABLE} AS legacy`
    : `${LEGACY_TABLE} AS legacy JOIN user ON user.id = legacy.id`;
}

async function seedChatUserData(trx, strategy) {
  const userIdCol = userIdSelect(strategy);
  const sql = `
    INSERT IGNORE INTO chat_user_data (user_id, prestige_count, current_level, current_exp)
    SELECT ${userIdCol}, 0, 0, 0
    FROM ${fromClause(strategy)}
    WHERE ${userIdCol} IS NOT NULL AND ${userIdCol} <> ''
  `;
  const [result] = await trx.raw(sql);
  return result.affectedRows || 0;
}

async function grantTierAchievement(trx, strategy, tier, achievementId) {
  const userIdCol = userIdSelect(strategy);

  // Step 1: ledger row (gated on "achievement not yet unlocked"). Order
  // matters — must run BEFORE the achievement insert so the NOT EXISTS
  // check filters correctly.
  const inventorySql = `
    INSERT INTO Inventory (userId, itemId, itemAmount, note)
    SELECT ${userIdCol}, ?, ?, ?
    FROM ${fromClause(strategy)}
    WHERE ${userIdCol} IS NOT NULL AND ${userIdCol} <> ''
      AND legacy.experience >= ?
      AND NOT EXISTS (
        SELECT 1 FROM user_achievements ua
        WHERE ua.user_id = ${userIdCol} AND ua.achievement_id = ?
      )
  `;
  const [invResult] = await trx.raw(inventorySql, [
    GODDESS_STONE_ITEM_ID,
    tier.reward_stones,
    SENTINEL_NOTE,
    tier.threshold,
    achievementId,
  ]);

  // Step 2: achievement row (UNIQUE(user_id, achievement_id) → re-runs no-op)
  const grantSql = `
    INSERT IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
    SELECT ${userIdCol}, ?, NOW()
    FROM ${fromClause(strategy)}
    WHERE ${userIdCol} IS NOT NULL AND ${userIdCol} <> ''
      AND legacy.experience >= ?
  `;
  const [grantResult] = await trx.raw(grantSql, [achievementId, tier.threshold]);

  return {
    inventory_inserted: invResult.affectedRows || 0,
    achievements_inserted: grantResult.affectedRows || 0,
  };
}

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  // Skip on fresh DB (no legacy snapshot to migrate from). This makes the
  // migration safe to apply on dev/CI environments that don't carry legacy
  // chat XP state.
  const hasSnapshot = await knex.schema.hasTable(LEGACY_TABLE);
  if (!hasSnapshot) {
    console.log(`[grant_legacy_tier_achievements] ${LEGACY_TABLE} not found — fresh DB, skipping.`);
    return;
  }

  const strategy = await resolveUserKeyStrategy(knex);
  const achievements = await knex("achievements")
    .whereIn(
      "key",
      LEGACY_TIERS.map(t => t.key)
    )
    .select("id", "key");
  const idByKey = Object.fromEntries(achievements.map(a => [a.key, a.id]));

  const missing = LEGACY_TIERS.filter(t => !idByKey[t.key]).map(t => t.key);
  if (missing.length > 0) {
    throw new Error(
      `achievements rows missing for keys: ${missing.join(", ")}. ` +
        `Ensure 20260424154256_seed_prestige_achievements.js ran first.`
    );
  }

  const summary = { seeded: 0, by_tier: {} };

  await knex.transaction(async trx => {
    summary.seeded = await seedChatUserData(trx, strategy);
    for (const tier of LEGACY_TIERS) {
      summary.by_tier[tier.key] = await grantTierAchievement(
        trx,
        strategy,
        tier,
        idByKey[tier.key]
      );
    }
  });

  const tierLine = LEGACY_TIERS.map(
    t => `${t.key}=${summary.by_tier[t.key].achievements_inserted}`
  ).join(" ");
  console.log(`[grant_legacy_tier_achievements] seeded=${summary.seeded} ${tierLine}`);
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  const achievementIds = await knex("achievements")
    .whereIn(
      "key",
      LEGACY_TIERS.map(t => t.key)
    )
    .pluck("id");

  const inventoryDeleted = await knex("Inventory").where({ note: SENTINEL_NOTE }).delete();
  const achievementsDeleted = await knex("user_achievements")
    .whereIn("achievement_id", achievementIds)
    .delete();

  // chat_user_data NOT reverted: service activity may have mutated rows.
  // Use M1's down (rename `chat_user_data_legacy_snapshot` back) or restore
  // the pre-T-0 mysqldump for a full data rollback.
  console.warn(
    `[grant_legacy_tier_achievements:down] reverted ${achievementsDeleted} achievements ` +
      `+ ${inventoryDeleted} inventory rows. chat_user_data NOT reverted.`
  );
};

exports.LEGACY_TIERS = LEGACY_TIERS;
exports.SENTINEL_NOTE = SENTINEL_NOTE;
