const SeasonService = require("../../service/WorldBossSeasonService");
const BattleService = require("../../service/WorldBossBattleService");
const AttackService = require("../../service/WorldBossAttackService");
const WorldBossRoundEffect = require("../../model/application/WorldBossRoundEffect");
const UserModel = require("../../model/application/UserModel");
const { canonicalPositiveInteger, canonicalUnsignedInteger } = require("../../util/decimalInteger");
const { toApiDto, respondError, fail, parseLeaderboardLimit } = require(".");

const ATTACK_TYPES = new Set(["standard", "skill"]);
// Group ids only. Rooms (R…) are not a supported announcement destination, so a
// room id is rejected at the trust boundary rather than silently ignored later.
const GROUP_ID = /^C[0-9a-f]{32}$/;
// ponytail: fixed newest-50 window instead of a pagination route. The board only ever
// shows "who took my effects lately"; add a cursor route when someone asks to scroll.
const EFFECT_HISTORY_LIMIT = 50;

function activeSeasonId(status) {
  return status && status.season ? canonicalPositiveInteger(status.season.id) : null;
}

/**
 * Trust boundary: the round id, attack type and group id are the only client inputs.
 * The acting user is always `req.profile.userId` — a body `userId` is never read.
 */
function parseAttackBody(body) {
  const input = body && typeof body === "object" ? body : {};
  let roundId;
  try {
    roundId = canonicalPositiveInteger(input.roundId);
  } catch {
    throw fail("INVALID_ROUND_ID");
  }
  if (!ATTACK_TYPES.has(input.attackType)) throw fail("INVALID_ATTACK_TYPE");
  const groupId = input.groupId;
  if (groupId !== undefined && groupId !== null && !GROUP_ID.test(String(groupId))) {
    throw fail("INVALID_GROUP_ID");
  }
  return { roundId, attackType: input.attackType, groupId: groupId ? String(groupId) : null };
}

/**
 * Ranking is scored by `total_score`; `total_damage` is deliberately not projected, so a
 * future extra column on the service row can never silently become the displayed score.
 */
function leaderboardRow(row) {
  return {
    user_id: row.user_id,
    display_name: row.display_name ?? null,
    total_score: canonicalUnsignedInteger(row.total_score),
    ranking: row.ranking,
  };
}

/**
 * "Who took the effects I left." Two queries regardless of row count: one windowed read
 * of the effect ledger, then one batched name lookup for the consumers that exist.
 */
async function effectHistory(seasonId, userId) {
  const rows = await WorldBossRoundEffect.listSeasonHistoryBySource({
    seasonId,
    userId,
    limit: EFFECT_HISTORY_LIMIT,
  });
  const nameByUserId = await UserModel.getDisplayNames(
    rows.map(row => row.consumed_by_user_id).filter(Boolean)
  );
  return rows.map(row => ({
    effectId: canonicalPositiveInteger(row.id),
    type: row.effect_type,
    value: canonicalPositiveInteger(row.value),
    roundId: canonicalPositiveInteger(row.round_id),
    createdAt: row.created_at ?? null,
    consumedAt: row.consumed_at ?? null,
    consumedBy: row.consumed_by_user_id
      ? {
          userId: row.consumed_by_user_id,
          displayName: nameByUserId.get(row.consumed_by_user_id) ?? null,
        }
      : null,
  }));
}

/**
 * The consumed effect belongs to someone else, so the board needs a name to render
 * "you took X's banner". At most one effect is consumed per attack — this is a single
 * lookup, not a per-row one — and a missing profile degrades to null rather than failing
 * an attack that already committed.
 */
async function consumedEffectDto(consumedEffect) {
  if (!consumedEffect) return null;
  const { sourceUserId } = consumedEffect;
  const nameByUserId = await UserModel.getDisplayNames([sourceUserId]).catch(() => new Map());
  return { ...consumedEffect, sourceDisplayName: nameByUserId.get(sourceUserId) ?? null };
}

exports.status = async function (req, res) {
  try {
    res.json(toApiDto(await SeasonService.getBattleStatus()));
  } catch (error) {
    respondError(res, error);
  }
};

exports.leaderboard = async function (req, res) {
  try {
    const limit = parseLeaderboardLimit(req.query.limit);
    const status = await SeasonService.getBattleStatus();
    const seasonId = activeSeasonId(status);
    const rows = seasonId ? await SeasonService.getRanking(seasonId, limit) : [];
    res.json(toApiDto({ seasonId, rows: rows.map(leaderboardRow) }));
  } catch (error) {
    respondError(res, error);
  }
};

/**
 * Strictly the caller's own view: every read is keyed by `req.profile.userId`, and no
 * request input selects a subject.
 */
exports.me = async function (req, res) {
  try {
    const { userId } = req.profile;
    const [status, latestReward] = await Promise.all([
      SeasonService.getBattleStatus(),
      SeasonService.getLatestSettledResult(userId),
    ]);
    const seasonId = activeSeasonId(status);
    let current = null;
    if (seasonId) {
      const [stats, daily, effects] = await Promise.all([
        SeasonService.getUserSeasonStats(seasonId, userId),
        BattleService.getRemainingDailyCost(userId),
        effectHistory(seasonId, userId),
      ]);
      current = {
        seasonId: stats.seasonId,
        totalScore: stats.totalScore,
        score: stats.score,
        damage: stats.damage,
        daily,
        effects,
      };
    }
    res.json(toApiDto({ current, latestReward: latestReward || null }));
  } catch (error) {
    respondError(res, error);
  }
};

/**
 * The only attack entry point. Private response — it may carry the caller's own
 * quota, EXP and reward data because it never reaches a group.
 */
exports.attack = async function (req, res) {
  try {
    const { userId, displayName } = req.profile;
    const { roundId, attackType, groupId } = parseAttackBody(req.body);
    const { result, announcementQueued, latestReward } = await AttackService.attack({
      userId,
      roundId,
      attackType,
      groupId,
      displayName,
    });
    const [status, consumedEffect] = await Promise.all([
      SeasonService.getBattleStatus().catch(() => null),
      consumedEffectDto(result.consumedEffect),
    ]);

    res.json(
      toApiDto({
        // Field-by-field on purpose: spreading the battle result would publish every
        // internal field the transaction happens to return, forever.
        attack: {
          roundId,
          attackType,
          rawDamage: result.rawDamage,
          effectDamage: result.effectDamage,
          effectiveDamage: result.effectiveDamage,
          overkillDamage: result.overkillDamage,
          scoreGained: result.scoreGained,
          consumedEffect,
          createdEffect: result.createdEffect,
          cost: result.cost,
          cleared: Boolean(result.cleared),
          cycleAdvanced: Boolean(result.cycleAdvanced),
          attackedCycleNo: result.attackedCycleNo,
          cycleNo: result.cycleNo,
          round: result.round,
          boss: result.boss,
          rounds: result.rounds,
          levelResult: result.levelResult,
          seasonTotalScore: result.seasonTotalScore,
          seasonTotalDamage: result.seasonTotalDamage,
          daily: result.daily,
        },
        announcementQueued,
        latestReward,
        status,
      })
    );
  } catch (error) {
    respondError(res, error);
  }
};
