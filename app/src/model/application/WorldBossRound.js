const mysql = require("../../util/mysql");

const TABLE = "world_boss_round";
const ROSTER_TABLE = "world_boss_season_boss";

const ROUND_COLUMNS = [
  "round.id as id",
  "round.season_boss_id as season_boss_id",
  "round.cycle_no as cycle_no",
  "round.max_hp as max_hp",
  "round.current_hp as current_hp",
  "round.cleared_at as cleared_at",
  "roster.season_id as season_id",
  "roster.position as position",
  "roster.world_boss_id as world_boss_id",
  "roster.name as name",
  "roster.image as image",
  "roster.description as description",
  "roster.hp_weight as hp_weight",
];

exports.TABLE = TABLE;

function joined(db) {
  return db(`${TABLE} as round`).join(
    `${ROSTER_TABLE} as roster`,
    "round.season_boss_id",
    "roster.id"
  );
}

/**
 * The highest cycle number the season has ever reached. The current cycle is derived
 * rather than stored so there is no second source of truth to keep consistent.
 */
exports.currentCycleNo = async function (seasonId, trx) {
  const db = trx || mysql;
  const row = await joined(db)
    .where("roster.season_id", seasonId)
    .max({ cycleNo: "round.cycle_no" })
    .first();
  return row && row.cycleNo !== null && row.cycleNo !== undefined ? Number(row.cycleNo) : 0;
};

exports.listCycle = async function (seasonId, cycleNo, trx) {
  const db = trx || mysql;
  return joined(db)
    .where({ "roster.season_id": seasonId, "round.cycle_no": cycleNo })
    .orderBy("roster.position", "asc")
    .select(ROUND_COLUMNS);
};

exports.listCycleForUpdate = async function (seasonId, cycleNo, trx) {
  const db = trx || mysql;
  return joined(db)
    .where({ "roster.season_id": seasonId, "round.cycle_no": cycleNo })
    .orderBy("roster.position", "asc")
    .forUpdate()
    .select(ROUND_COLUMNS);
};

exports.listCurrentCycle = async function (seasonId, trx) {
  const cycleNo = await exports.currentCycleNo(seasonId, trx);
  if (!cycleNo) return { cycleNo: 0, rounds: [] };
  return { cycleNo, rounds: await exports.listCycle(seasonId, cycleNo, trx) };
};

/**
 * Resolves a player-supplied round id back to the season it belongs to. Returns
 * undefined for ids from other seasons so the caller can reject without leaking rows.
 */
exports.findByIdForUpdate = async function (roundId, seasonId, trx) {
  const db = trx || mysql;
  return joined(db)
    .where({ "round.id": roundId, "roster.season_id": seasonId })
    .forUpdate()
    .first(ROUND_COLUMNS);
};

exports.insertCycle = async function (trx, rows) {
  await trx(TABLE).insert(rows);
};
