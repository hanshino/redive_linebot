const SeasonService = require("../../service/WorldBossSeasonService");
const BattleService = require("../../service/WorldBossBattleService");
const { canonicalPositiveInteger } = require("../../util/decimalInteger");
const { toApiDto, respondError, parseLeaderboardLimit } = require(".");

function activeSeasonId(status) {
  return status && status.season ? canonicalPositiveInteger(status.season.id) : null;
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
    res.json(toApiDto(seasonId ? await SeasonService.getRanking(seasonId, limit) : []));
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
