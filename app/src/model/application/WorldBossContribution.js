const mysql = require("../../util/mysql");
const { canonicalUnsignedInteger } = require("../../util/decimalInteger");

const TABLE = "world_boss_contribution";

function sumOrZero(value) {
  return value === null || value === undefined ? "0" : canonicalUnsignedInteger(value);
}

exports.sumCostInRange = async function (userId, startUtc, endUtc, trx) {
  const db = trx || mysql;
  const row = await db(TABLE)
    .where({ user_id: userId })
    .where("created_at", ">=", startUtc)
    .where("created_at", "<", endUtc)
    .sum({ total_cost: "cost" })
    .first();
  return Number(row.total_cost) || 0;
};

exports.sumSeasonDamage = async function (seasonId, userId, trx) {
  const db = trx || mysql;
  const row = await db(TABLE)
    .where({ season_id: seasonId, user_id: userId })
    .sum({ total: "damage" })
    .first();
  return sumOrZero(row.total);
};

/**
 * 整季每位玩家的實際扣血總和，key 為 user_id。
 *
 * 排名已改由 world_boss_score_event 決定（見 WorldBossScoreEvent.seasonRanking），這裡
 * 只剩結算時要寫進 ledger 的統計欄位，所以刻意不回傳名次，避免有人誤用傷害排名。
 */
exports.seasonDamageByUser = async function (seasonId, trx) {
  const db = trx || mysql;
  const rows = await db(TABLE)
    .where({ season_id: seasonId })
    .select("user_id")
    .sum({ total_damage: "damage" })
    .groupBy("user_id");
  return new Map(rows.map(row => [row.user_id, sumOrZero(row.total_damage)]));
};

/**
 * 個人賽季傷害統計（全部為 decimal string）。
 *
 * v1 舊資料的辨識子是 `raw_damage IS NULL`：那時候沒有 raw / effect 的概念，用 damage
 * 代入會讓統計失真，所以 raw / effect / overkill 一律只計 v2 列。effective 是實際扣掉的
 * 血量，對 v1、v2 都成立，因此涵蓋全部列。
 *
 * overkill = Σ(raw + effect) − Σ(v2 的 damage)：逐列都是 raw+effect−min(raw+effect, hp)，
 * 恆為非負，所以聚合後相減不會出現負值，也不必冒 BIGINT UNSIGNED 相減溢位的風險。
 */
exports.seasonDamageStats = async function (seasonId, userId, trx) {
  const db = trx || mysql;
  const row = await db(TABLE)
    .where({ season_id: seasonId, user_id: userId })
    .select(
      db.raw("SUM(??) AS ??", ["damage", "effective"]),
      // SUM 略過 NULL，所以 raw 天生只計 v2 列。
      db.raw("SUM(??) AS ??", ["raw_damage", "raw"]),
      db.raw("SUM(CASE WHEN ?? IS NULL THEN 0 ELSE ?? END) AS ??", [
        "raw_damage",
        "effect_damage",
        "effect",
      ]),
      db.raw("SUM(CASE WHEN ?? IS NULL THEN 0 ELSE ?? END) AS ??", [
        "raw_damage",
        "damage",
        "effective_v2",
      ])
    )
    .first();
  const raw = sumOrZero(row.raw);
  const effect = sumOrZero(row.effect);
  return {
    raw,
    effect,
    effective: sumOrZero(row.effective),
    overkill: (BigInt(raw) + BigInt(effect) - BigInt(sumOrZero(row.effective_v2))).toString(),
  };
};
