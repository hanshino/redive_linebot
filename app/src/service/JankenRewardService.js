const mysql = require("../util/mysql");
const config = require("config");
const JankenSeason = require("../model/application/JankenSeason");
const JankenDailyRewardLog = require("../model/application/JankenDailyRewardLog");
const { inventory } = require("../model/application/Inventory");
const { DefaultLogger } = require("../util/Logger");

function bucketByPosition(p, rankTier) {
  if (p === 1) return "top1";
  if (p === 2) return "top2";
  if (p === 3) return "top3";
  if (p <= 10) return "top4_10";
  if (rankTier === "legend") return "legend";
  if (rankTier === "master") return "master";
  if (rankTier === "fighter") return "fighter";
  if (rankTier === "challenger") return "challenger";
  return "beginner";
}
exports.bucketByPosition = bucketByPosition;

exports.payoutDaily = async function (rewardDate) {
  const enabled = Boolean(config.get("minigame.janken.daily_reward.enableDailyRankReward"));
  const amounts = config.get("minigame.janken.daily_reward.amounts") || {};
  const season = await JankenSeason.getActive();
  if (!season) {
    DefaultLogger.warn("[JankenRewardService] no active season; skipping daily payout");
    return { dryRun: !enabled, candidates: [], season: null };
  }

  const start = new Date(`${rewardDate}T00:00:00+08:00`);
  const end = new Date(`${rewardDate}T23:59:59.999+08:00`);

  const initiators = mysql("janken_records")
    .distinct({ u: "user_id" })
    .where("bet_amount", ">", 0)
    .whereBetween("created_at", [start, end]);
  const targets = mysql("janken_records")
    .distinct({ u: "target_user_id" })
    .where("bet_amount", ">", 0)
    .whereBetween("created_at", [start, end]);
  const activeRows = await initiators.union([targets]);
  const activeIds = activeRows.map(r => r.u);

  if (activeIds.length === 0) {
    DefaultLogger.info(`[JankenRewardService] no active players for ${rewardDate}`);
    return { dryRun: !enabled, candidates: [], season: season.id };
  }

  const ranked = await mysql("janken_rating")
    .whereIn("user_id", activeIds)
    .orderBy("elo", "desc")
    .orderBy("win_count", "desc");

  const candidates = ranked
    .map((r, i) => ({
      user_id: r.user_id,
      position: i + 1,
      rank_tier: r.rank_tier,
      reward_type: bucketByPosition(i + 1, r.rank_tier),
    }))
    .map(c => ({ ...c, amount: amounts[c.reward_type] || 0 }));

  if (!enabled) {
    DefaultLogger.info(
      `[JankenRewardService] DRY RUN ${rewardDate} season=${season.id} candidates=${candidates.length}`
    );
    return { dryRun: true, candidates, season: season.id };
  }

  let credited = 0;
  for (const c of candidates) {
    const inserted = await JankenDailyRewardLog.tryInsert({
      user_id: c.user_id,
      reward_date: rewardDate,
      season_id: season.id,
      reward_type: c.reward_type,
      amount: c.amount,
    });
    if (inserted && c.amount > 0) {
      await inventory.increaseGodStone({
        userId: c.user_id,
        amount: c.amount,
        note: "janken_daily_rank_reward",
      });
      credited += c.amount;
    }
  }

  DefaultLogger.info(
    `[JankenRewardService] paid ${rewardDate} season=${season.id} credited=${credited} stones to ${candidates.length} players`
  );
  return { dryRun: false, candidates, season: season.id, credited };
};

exports.payoutSeasonEnd = async function (snapshotRows, seasonId, trx) {
  const enabled = Boolean(config.get("minigame.janken.season.enableSeasonEndRewards"));
  if (!enabled) {
    DefaultLogger.info(`[JankenRewardService] season-end payout skipped (flag off)`);
    return { dryRun: true, paid: 0 };
  }
  const rewards = config.get("minigame.janken.season.endRewards") || {};
  let paid = 0;
  for (const row of snapshotRows) {
    let bucket = null;
    if (row.rank === 1) bucket = "top1";
    else if (row.rank === 2) bucket = "top2";
    else if (row.rank === 3) bucket = "top3";
    else if (row.rank <= 10) bucket = "top4_10";
    else if (row.rank <= 50) bucket = "top11_50";
    if (!bucket) continue;
    const amount = rewards[bucket] || 0;
    if (amount <= 0) continue;
    if (trx) inventory.setTransaction(trx);
    await inventory.increaseGodStone({
      userId: row.user_id,
      amount,
      note: "janken_season_end_reward",
    });
    paid += amount;
  }
  return { dryRun: false, paid };
};
