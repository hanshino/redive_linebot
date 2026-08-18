const mysql = require("../../util/mysql");

const TABLE = "world_boss_season_boss";
const ROSTER_SIZE = 5;
const POSITIONS = Object.freeze(Array.from({ length: ROSTER_SIZE }, (_, index) => index + 1));

exports.TABLE = TABLE;
exports.ROSTER_SIZE = ROSTER_SIZE;
exports.POSITIONS = POSITIONS;

exports.listBySeason = async function (seasonId, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ season_id: seasonId }).orderBy("position", "asc");
};

exports.listBySeasonForUpdate = async function (seasonId, trx) {
  const db = trx || mysql;
  return db(TABLE).where({ season_id: seasonId }).orderBy("position", "asc").forUpdate();
};

/**
 * Draft roster selection. Positions are always 1..ROSTER_SIZE in the given order,
 * and the display/HP columns are snapshotted from the live catalog at write time.
 * Callers must have already validated size/distinctness.
 */
exports.replaceForSeason = async function (trx, seasonId, bossIds) {
  const bosses = await trx("world_boss").whereIn("id", bossIds);
  const byId = new Map(bosses.map(boss => [String(boss.id), boss]));
  const rows = bossIds.map((bossId, index) => {
    const boss = byId.get(String(bossId));
    if (!boss) {
      throw Object.assign(new Error("ROSTER_BOSS_NOT_FOUND"), { code: "ROSTER_BOSS_NOT_FOUND" });
    }
    return {
      season_id: seasonId,
      position: index + 1,
      world_boss_id: boss.id,
      name: boss.name,
      image: boss.image ?? null,
      description: boss.description ?? null,
      hp_weight: boss.hp_weight,
    };
  });
  await trx(TABLE).where({ season_id: seasonId }).del();
  await trx(TABLE).insert(rows);
  return rows.length;
};

/**
 * Re-reads the live catalog so the season locks in the values that were true at open time.
 */
exports.refreshSnapshot = async function (trx, seasonId) {
  const roster = await exports.listBySeasonForUpdate(seasonId, trx);
  const bosses = await trx("world_boss").whereIn(
    "id",
    roster.map(row => row.world_boss_id)
  );
  const byId = new Map(bosses.map(boss => [String(boss.id), boss]));
  for (const row of roster) {
    const boss = byId.get(String(row.world_boss_id));
    if (!boss) {
      throw Object.assign(new Error("ROSTER_BOSS_NOT_FOUND"), { code: "ROSTER_BOSS_NOT_FOUND" });
    }
    await trx(TABLE)
      .where({ id: row.id })
      .update({
        name: boss.name,
        image: boss.image ?? null,
        description: boss.description ?? null,
        hp_weight: boss.hp_weight,
      });
  }
  return exports.listBySeason(seasonId, trx);
};
