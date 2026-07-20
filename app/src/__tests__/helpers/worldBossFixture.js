const PREFIX = "__wbtest_";
const ACTIVE_SLOT = 1;

function slotFor() {
  return ACTIVE_SLOT;
}

function whereLiteralPrefix(query, column, prefix) {
  return query.whereRaw("LEFT(??, ?) = ?", [column, prefix.length, prefix]);
}

async function cleanupByPrefix(mysql, prefix = PREFIX) {
  const seasons = await whereLiteralPrefix(mysql("world_boss_season"), "name", prefix).select("id");
  const ids = seasons.map(row => row.id);

  if (ids.length) {
    await mysql("world_boss_season_reward").whereIn("season_id", ids).del();
    await mysql("world_boss_contribution").whereIn("season_id", ids).del();
    await mysql("world_boss_round").whereIn("season_id", ids).del();
    await mysql("world_boss_season").whereIn("id", ids).del();
  }

  await whereLiteralPrefix(mysql("world_boss"), "name", prefix).del();
}

module.exports = { PREFIX, ACTIVE_SLOT, slotFor, cleanupByPrefix };
