const mysql = require("../../util/mysql");
const { canonicalPositiveInteger } = require("../../util/decimalInteger");

const TABLE = "world_boss_round_effect";

// 只有兩種效果，所以這是一張表加兩個常數，不是一套 buff engine：沒有 DSL、沒有
// handler registry、沒有 stack/duration/priority。要加第三種再說。
const TYPES = { BANNER: "banner", SEAL: "seal" };

// 哪個職業在攻擊後留下什麼效果。swordman / thief 不在表內 = 不留效果。
const EFFECT_BY_JOB = {
  adventurer: { effect_type: TYPES.BANNER, percent: 25n },
  mage: { effect_type: TYPES.SEAL, percent: 50n },
};

function fail(code) {
  return Object.assign(new Error(code), { code });
}

/**
 * 本次攻擊應該留下的效果，null 代表不留。
 *
 * 回傳 null 有兩種原因，呼叫端不需要分辨：職業本來就不留效果，或算出來的 value 是 0
 * （極低等級玩家真的會發生）—— 後者不能 INSERT，會撞 CHECK(value > 0)。
 */
exports.planFor = function (jobKey, rawDamage) {
  const spec = EFFECT_BY_JOB[jobKey];
  if (!spec) return null;
  // BigInt 除法向零截斷，rawDamage 恆為正，等同 floor。
  const value = (BigInt(canonicalPositiveInteger(rawDamage)) * spec.percent) / 100n;
  return value > 0n ? { effect_type: spec.effect_type, value } : null;
};

/**
 * 下一筆可被這名玩家消耗的效果（FIFO）。
 *
 * `source_user_id <> ?` 必須留在 SQL：若先取最舊的一筆、再於 application code 發現是
 * 本人然後放棄，攻擊者自己留下的舊效果會永久擋住排在它後面、其他玩家留下的可消耗效果。
 */
exports.findConsumableForUpdate = async function (trx, { roundId, userId }) {
  return trx(TABLE)
    .where({ round_id: roundId })
    .whereNull("consumed_by_contribution_id")
    .whereNot({ source_user_id: userId })
    .orderBy("id", "asc")
    .forUpdate()
    .first();
};

exports.insert = async function (trx, row) {
  const [id] = await trx(TABLE).insert(row);
  return id;
};

/**
 * 條件式消耗。affected rows 不等於 1 就丟 error 讓整筆 transaction rollback。
 *
 * 目前每次攻擊都先鎖住 active season，效果的選取與消耗已經被全域序列化，所以這裡永遠
 * 不該踩到 —— 它是 invariant backstop，不是可回復的競態，因此故意不做重試。
 */
exports.consume = async function (trx, { effectId, contributionId, now }) {
  const affected = await trx(TABLE)
    .where({ id: effectId })
    .whereNull("consumed_by_contribution_id")
    .update({ consumed_by_contribution_id: contributionId, updated_at: now });
  if (affected !== 1) throw fail("EFFECT_ALREADY_CONSUMED");
};

exports.toDto = function (effect) {
  return {
    id: canonicalPositiveInteger(effect.id),
    type: effect.effect_type,
    value: canonicalPositiveInteger(effect.value),
    sourceUserId: effect.source_user_id,
  };
};

exports.listUnconsumedByRound = async function (roundId, trx) {
  const db = trx || mysql;
  return db(TABLE)
    .where({ round_id: roundId })
    .whereNull("consumed_by_contribution_id")
    .orderBy("id", "asc");
};

/**
 * 玩家自己留下的效果，以及它最後被誰接走（單一 query，含未被接走的）。
 *
 * `consumed_at` 取消耗方 contribution 的 created_at，而不是 effect.updated_at：後者只是
 * 「這列最後被改動的時間」，任何之後的維護性 UPDATE 都會把它蓋掉。
 *
 * 來源端不 join contribution —— source_user_id 已經反正規化在本表上，join 回去只會拿到
 * 同一個值。過濾條件 (season_id, source_user_id) 正好走 idx_wbre_season_source_user。
 * 顯示名稱刻意不在這裡 join：呼叫端只需要對「被接走的那幾筆」做一次批次查詢，join 進來
 * 反而會讓每列都帶一份 user 資料。
 */
exports.listSeasonHistoryBySource = async function ({ seasonId, userId, limit }, trx) {
  const db = trx || mysql;
  return db(`${TABLE} as effect`)
    .leftJoin(
      "world_boss_contribution as consumer",
      "effect.consumed_by_contribution_id",
      "consumer.id"
    )
    .where({ "effect.season_id": seasonId, "effect.source_user_id": userId })
    .orderBy("effect.id", "desc")
    .limit(limit)
    .select(
      "effect.id as id",
      "effect.round_id as round_id",
      "effect.effect_type as effect_type",
      "effect.value as value",
      "effect.created_at as created_at",
      "consumer.user_id as consumed_by_user_id",
      "consumer.created_at as consumed_at"
    );
};

/** Count pending effects for all supplied rounds with one grouped query. */
exports.countPendingByRounds = async function (roundIds, trx) {
  const result = new Map();
  if (!roundIds.length) return result;
  const db = trx || mysql;
  const rows = await db(TABLE)
    .whereIn("round_id", roundIds)
    .whereNull("consumed_by_contribution_id")
    .select("round_id", "effect_type")
    .count({ count: "id" })
    .groupBy("round_id", "effect_type");
  for (const row of rows) {
    const counts = result.get(String(row.round_id)) || { banner: 0, seal: 0 };
    if (row.effect_type === TYPES.BANNER || row.effect_type === TYPES.SEAL) {
      counts[row.effect_type] = Number(row.count);
    }
    result.set(String(row.round_id), counts);
  }
  return result;
};

exports.TABLE = TABLE;
exports.TYPES = TYPES;
