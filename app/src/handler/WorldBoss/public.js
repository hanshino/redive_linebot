const SeasonService = require("../../service/WorldBossSeasonService");
const BattleService = require("../../service/WorldBossBattleService");
const AttackService = require("../../service/WorldBossAttackService");
const { canonicalPositiveInteger } = require("../../util/decimalInteger");
const { toApiDto, respondError, fail, parseLeaderboardLimit } = require(".");

const ATTACK_TYPES = new Set(["standard", "skill"]);
// Group ids only. Rooms (R…) are not a supported announcement destination, so a
// room id is rejected at the trust boundary rather than silently ignored later.
const GROUP_ID = /^C[0-9a-f]{32}$/;

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
    res.json(toApiDto({ seasonId, rows }));
  } catch (error) {
    respondError(res, error);
  }
};

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
      const [totalDamage, daily] = await Promise.all([
        SeasonService.getUserTotalDamage(seasonId, userId),
        BattleService.getRemainingDailyCost(userId),
      ]);
      current = {
        seasonId,
        totalDamage,
        daily,
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
    const status = await SeasonService.getBattleStatus().catch(() => null);

    res.json(
      toApiDto({
        attack: {
          roundId,
          attackType,
          damage: result.damage,
          effectiveDamage: result.effectiveDamage,
          wastedDamage: result.wastedDamage,
          cost: result.cost,
          cleared: Boolean(result.cleared),
          cycleAdvanced: Boolean(result.cycleAdvanced),
          attackedCycleNo: result.attackedCycleNo,
          cycleNo: result.cycleNo,
          boss: result.boss,
          levelResult: result.levelResult,
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
