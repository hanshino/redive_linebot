const PREFIX = "__wbtest_";

function slotFor(suiteNumber) {
  return 900000 + suiteNumber;
}

async function cleanupByPrefix(mysql, prefix = PREFIX, slot) {
  void slot;
  const seasons = await mysql("world_boss_season").where("name", "like", `${prefix}%`).select("id");
  const ids = seasons.map(row => row.id);

  if (ids.length) {
    await mysql("world_boss_season_reward").whereIn("season_id", ids).del();
    await mysql("world_boss_contribution").whereIn("season_id", ids).del();
    await mysql("world_boss_round").whereIn("season_id", ids).del();
    await mysql("world_boss_season").whereIn("id", ids).del();
  }

  await mysql("world_boss").where("name", "like", `${prefix}%`).del();
}

module.exports = { PREFIX, slotFor, cleanupByPrefix };
