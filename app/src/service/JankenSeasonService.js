const mysql = require("../util/mysql");
const config = require("config");
const JankenSeason = require("../model/application/JankenSeason");
const JankenSeasonSnapshot = require("../model/application/JankenSeasonSnapshot");
const JankenRating = require("../model/application/JankenRating");
const JankenRewardService = require("./JankenRewardService");
const { DefaultLogger } = require("../util/Logger");

exports.endCurrentAndOpenNext = async function ({ note = null, payoutEnabled = false } = {}) {
  const snapshotTopN = config.get("minigame.janken.season.snapshotTopN") || 50;
  const enableSeasonEndRewards =
    payoutEnabled && Boolean(config.get("minigame.janken.season.enableSeasonEndRewards"));

  return mysql.transaction(async trx => {
    const active = await JankenSeason.getActive(trx);
    if (!active) throw new Error("Janken: no active season to close");

    const top = await JankenRating.getTopByElo(snapshotTopN, trx);
    const userIds = top.map(r => r.user_id);
    const profiles = userIds.length
      ? await trx("user").whereIn("platform_id", userIds).select("platform_id", "display_name")
      : [];
    const nameByUid = Object.fromEntries(profiles.map(p => [p.platform_id, p.display_name]));

    const snapshotRows = top.map((r, i) => ({
      rank: i + 1,
      user_id: r.user_id,
      display_name: nameByUid[r.user_id] || null,
      elo: r.elo,
      rank_tier: r.rank_tier,
      win_count: r.win_count,
      lose_count: r.lose_count,
      draw_count: r.draw_count,
      max_streak: r.max_streak,
    }));
    await JankenSeasonSnapshot.bulkInsert(active.id, snapshotRows, trx);

    if (enableSeasonEndRewards) {
      await JankenRewardService.payoutSeasonEnd(snapshotRows, active.id, trx);
    } else {
      DefaultLogger.info(
        `[JankenSeasonService] season-end rewards skipped (payoutEnabled=${payoutEnabled}, flag=${config.get(
          "minigame.janken.season.enableSeasonEndRewards"
        )})`
      );
    }

    await JankenSeason.close(active.id, trx);
    await JankenRating.resetSeasonFields(trx);
    const newSeasonId = await JankenSeason.openNew(note, trx);

    DefaultLogger.info(
      `[JankenSeasonService] season ${active.id} closed, ${snapshotRows.length} snapshotted, season ${newSeasonId} opened`
    );

    return {
      closedSeasonId: active.id,
      newSeasonId,
      snapshotCount: snapshotRows.length,
      payoutEnabled: enableSeasonEndRewards,
    };
  });
};
