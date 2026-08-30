const config = require("config");
const mysql = require("../util/mysql");
const WorldBossSeason = require("../model/application/WorldBossSeason");
const WorldBossSeasonBoss = require("../model/application/WorldBossSeasonBoss");
const WorldBossRound = require("../model/application/WorldBossRound");
const WorldBossContribution = require("../model/application/WorldBossContribution");
const WorldBossScoreEvent = require("../model/application/WorldBossScoreEvent");
const WorldBossRoundEffect = require("../model/application/WorldBossRoundEffect");
const WorldBossSeasonReward = require("../model/application/WorldBossSeasonReward");
const { inventory } = require("../model/application/Inventory");
const UserTitle = require("../model/application/UserTitle");
const { createBattleService } = require("./WorldBossBattleService");
const { canonicalUnsignedInteger, canonicalPositiveInteger } = require("../util/decimalInteger");

const TABLE = "world_boss_season";
const REWARD_TABLE = "world_boss_season_reward";
const MAX_OPEN_ATTEMPTS = 2;
const ROSTER_SIZE = WorldBossSeasonBoss.ROSTER_SIZE;
const SEASON_ACTIVE_UNIQUE = /uq_wbs_active_slot/;
const SEASON_REWARD_UNIQUE = /uq_wbsr_season_user/;
const SEASON_REWARDS = config.get("worldboss.season_rewards");

function fail(code) {
  return Object.assign(new Error(code), { code });
}

function dateValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeName(value) {
  if (typeof value !== "string") throw fail("INVALID_NAME");
  const name = value.trim();
  if (!name || name.length > 64) throw fail("INVALID_NAME");
  return name;
}

/**
 * A season roster is exactly ROSTER_SIZE distinct bosses; array order fixes positions 1..N.
 */
function normalizeBossIds(value) {
  if (!Array.isArray(value) || value.length !== ROSTER_SIZE) throw fail("INVALID_ROSTER_SIZE");
  const ids = value.map(candidate => {
    try {
      return canonicalPositiveInteger(candidate);
    } catch {
      throw fail("INVALID_ROSTER_BOSS_ID");
    }
  });
  if (new Set(ids).size !== ROSTER_SIZE) throw fail("DUPLICATE_ROSTER_BOSS");
  return ids;
}

function normalizeSeasonInput(input, now) {
  if (!input || typeof input !== "object") throw fail("INVALID_NAME");
  const endTime = dateValue(input.end_time);
  if (!endTime || endTime.getTime() <= now.getTime()) throw fail("INVALID_END_TIME");
  return {
    payload: {
      name: normalizeName(input.name),
      announcement: input.announcement ?? null,
      end_time: endTime,
    },
    bossIds: normalizeBossIds(input.boss_ids),
  };
}

function normalizeSeasonPatch(input, now, persisted) {
  const patch = {};
  let bossIds = null;
  if (Object.prototype.hasOwnProperty.call(input || {}, "name")) {
    patch.name = normalizeName(input.name);
  }
  if (Object.prototype.hasOwnProperty.call(input || {}, "announcement")) {
    patch.announcement = input.announcement ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input || {}, "end_time")) {
    const endTime = dateValue(input.end_time);
    if (!endTime || endTime.getTime() <= now.getTime()) throw fail("INVALID_END_TIME");
    patch.end_time = endTime;
  }
  if (Object.prototype.hasOwnProperty.call(input || {}, "boss_ids")) {
    bossIds = normalizeBossIds(input.boss_ids);
  }
  if (!Object.keys(patch).length && !bossIds) return { patch, bossIds };
  normalizeName(patch.name ?? persisted.name);
  const effectiveEndTime = dateValue(patch.end_time ?? persisted.end_time);
  if (!effectiveEndTime || effectiveEndTime.getTime() <= now.getTime()) {
    throw fail("INVALID_END_TIME");
  }
  return { patch, bossIds };
}

function isEnded(season, now) {
  const endTime = dateValue(season && season.end_time);
  return !endTime || now.getTime() >= endTime.getTime();
}

function knownUnique(error, pattern) {
  if (!error || error.code !== "ER_DUP_ENTRY") return false;
  return pattern.test(`${error.sqlMessage || ""} ${error.message || ""}`);
}

function isDeadlock(error) {
  return Boolean(error && error.code === "ER_LOCK_DEADLOCK");
}

function rewardFor(ranking) {
  const tier = SEASON_REWARDS.find(
    candidate => ranking >= Number(candidate.min_rank) && ranking <= Number(candidate.max_rank)
  );
  return tier
    ? { stone: Number(tier.stone), title_key: tier.title_key || null }
    : { stone: 0, title_key: null };
}

/**
 * 名次由 total_score 決定，但 ledger 兩個統計欄位都要核對：只比對其中一個，另一個被寫錯
 * 或被舊版流程寫入時會靜默通過。
 */
function ledgerMatches(ledger, row, reward) {
  return (
    ledger.user_id === row.user_id &&
    Number(ledger.ranking) === row.ranking &&
    ledger.total_score !== null &&
    ledger.total_score !== undefined &&
    canonicalUnsignedInteger(ledger.total_score) === row.total_score &&
    canonicalUnsignedInteger(ledger.total_damage) === row.total_damage &&
    Number(ledger.stone_amount) === reward.stone &&
    (ledger.title_key || null) === reward.title_key
  );
}

function settlementResult(seasonId, contributors, rewarded, zeroTier) {
  return { seasonId: canonicalUnsignedInteger(seasonId), contributors, rewarded, zeroTier };
}

/**
 * 結算用的完整名次：名次與 total_score 來自 score event，total_damage 另外從 contribution
 * 聚合後貼上，兩者都要寫進 ledger。
 *
 * 名單以 score event 為準。理論上每個受益者在同賽季都至少有一筆 contribution（assist 的
 * 受益者必須先出手才留得下效果），但 legacy backfill 只搬了 `damage > 0` 的列，所以打出
 * 0 傷害的 v1 玩家不在榜上 —— 他分數本來就是 0，屬於 zero tier，不影響任何獎勵。反向的
 * 缺漏則以 "0" 補齊，不讓 ledger 寫入 undefined。
 */
async function scoreRankingWithDamage(seasonId, trx) {
  const [ranking, damageByUser] = await Promise.all([
    WorldBossScoreEvent.seasonRankingAll(seasonId, trx),
    WorldBossContribution.seasonDamageByUser(seasonId, trx),
  ]);
  return ranking.map(row => ({ ...row, total_damage: damageByUser.get(row.user_id) || "0" }));
}

function createSeasonService({ activeSlot = 1, clock = () => new Date(), hooks = {} } = {}) {
  if (activeSlot !== 1) throw fail("INVALID_ACTIVE_SLOT");
  const beforeOpenMutation = hooks.beforeOpenMutation || (() => {});
  const beforePayment = hooks.beforePayment || (() => {});
  const battleService = createBattleService({ activeSlot, clock });

  function serviceNow() {
    const now = clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw fail("INVALID_DATE");
    return new Date(now.getTime());
  }

  async function listSeasons() {
    const seasons = await mysql(TABLE).orderBy("created_at", "desc").orderBy("id", "desc");
    return Promise.all(
      seasons.map(async season => ({ ...season, roster: await getSeasonRoster(season.id) }))
    );
  }

  async function createSeason(input) {
    const { payload, bossIds } = normalizeSeasonInput(input, serviceNow());
    return mysql.transaction(async trx => {
      const [id] = await trx(TABLE).insert({
        ...payload,
        status: "draft",
        active_slot: null,
        start_time: null,
        settled_at: null,
      });
      await WorldBossSeasonBoss.replaceForSeason(trx, id, bossIds);
      return id;
    });
  }

  async function updateSeason(id, input) {
    return mysql.transaction(async trx => {
      const season = await WorldBossSeason.findForUpdate(id, trx);
      if (!season) throw fail("SEASON_NOT_FOUND");
      if (season.status !== "draft") throw fail("SEASON_NOT_DRAFT");
      const { patch, bossIds } = normalizeSeasonPatch(input, serviceNow(), season);
      if (Object.keys(patch).length) await trx(TABLE).where({ id }).update(patch);
      if (bossIds) await WorldBossSeasonBoss.replaceForSeason(trx, id, bossIds);
      return id;
    });
  }

  async function deleteSeason(id) {
    return mysql.transaction(async trx => {
      const season = await WorldBossSeason.findForUpdate(id, trx);
      if (!season) throw fail("SEASON_NOT_FOUND");
      if (season.status !== "draft") throw fail("SEASON_NOT_DRAFT");
      await trx(TABLE).where({ id }).del();
      return id;
    });
  }

  async function openAttempt(id, attempt) {
    return mysql.transaction(async trx => {
      const season = await WorldBossSeason.findForUpdate(id, trx);
      if (!season) throw fail("SEASON_NOT_FOUND");
      if (season.status !== "draft") throw fail("SEASON_NOT_DRAFT");
      const now = serviceNow();
      const endTime = dateValue(season.end_time);
      if (!endTime || endTime.getTime() <= now.getTime()) throw fail("INVALID_END_TIME");
      if (await WorldBossSeason.findActive(activeSlot, trx)) {
        throw fail("ANOTHER_SEASON_ACTIVE");
      }
      // Re-snapshot so the season freezes the catalog values that were true at open time.
      const roster = await WorldBossSeasonBoss.refreshSnapshot(trx, id);
      if (roster.length !== ROSTER_SIZE) throw fail("INVALID_SEASON_ROSTER");
      await beforeOpenMutation({ attempt, trx, season });
      await trx(TABLE).where({ id }).update({
        status: "active",
        active_slot: activeSlot,
        start_time: now,
      });
      const cycle = await battleService.openCycle(trx, id, 1);
      return { seasonId: id, roster, cycleNo: cycle.cycleNo, rounds: cycle.rounds };
    });
  }

  async function openSeason(id) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_OPEN_ATTEMPTS; attempt += 1) {
      try {
        return await openAttempt(id, attempt);
      } catch (error) {
        if (knownUnique(error, SEASON_ACTIVE_UNIQUE)) {
          const winner = await WorldBossSeason.findActive(activeSlot);
          if (winner) throw fail("ANOTHER_SEASON_ACTIVE");
          throw error;
        }
        if (!isDeadlock(error)) throw error;
        lastError = error;
      }
    }
    const winner = await WorldBossSeason.findActive(activeSlot);
    if (winner) throw fail("ANOTHER_SEASON_ACTIVE");
    throw lastError;
  }

  async function getBattleStatus() {
    const season = await WorldBossSeason.findActive(activeSlot);
    if (!season) return null;
    const ended = isEnded(season, serviceNow());
    const { cycleNo, rounds } = await WorldBossRound.listCurrentCycle(season.id);
    const pendingByRound = await WorldBossRoundEffect.countPendingByRounds(
      rounds.map(round => round.id)
    );
    rounds.forEach(round => {
      round.pending_effects =
        round.cleared_at || BigInt(round.current_hp) === 0n
          ? { banner: 0, seal: 0 }
          : pendingByRound.get(String(round.id)) || { banner: 0, seal: 0 };
    });
    return { season, cycleNo, rounds, ended };
  }

  async function getSeasonRoster(seasonId) {
    return WorldBossSeasonBoss.listBySeason(seasonId);
  }

  async function getRanking(seasonId, limit) {
    const ranking = await WorldBossScoreEvent.seasonRanking(seasonId, limit);
    const userIds = ranking.map(row => row.user_id);
    const profiles = userIds.length
      ? await mysql("user").whereIn("platform_id", userIds).select("platform_id", "display_name")
      : [];
    const nameByUserId = Object.fromEntries(
      profiles.map(profile => [profile.platform_id, profile.display_name?.trim() || null])
    );
    return ranking.map(row => ({ ...row, display_name: nameByUserId[row.user_id] || null }));
  }

  async function getUserTotalDamage(seasonId, userId) {
    return WorldBossContribution.sumSeasonDamage(seasonId, userId);
  }

  /**
   * 個人賽季統計。分數來自 score event、傷害來自 contribution —— 兩者在 v2 之後是不同的
   * 帳本，不可互相推導。v1 舊資料（raw_damage IS NULL）不計入 damage.raw / effect /
   * overkill，詳見 WorldBossContribution.seasonDamageStats。
   */
  async function getUserSeasonStats(seasonId, userId) {
    const [totalScore, score, damage] = await Promise.all([
      WorldBossScoreEvent.sumSeasonScore(seasonId, userId),
      WorldBossScoreEvent.seasonScoreByKind(seasonId, userId),
      WorldBossContribution.seasonDamageStats(seasonId, userId),
    ]);
    return { seasonId: canonicalUnsignedInteger(seasonId), totalScore, score, damage };
  }

  async function getLatestSettledResult(userId) {
    return WorldBossSeasonReward.findLatestSettledByUser(userId);
  }

  async function lockOrCreateLedger(trx, seasonId, row, reward) {
    let ledger = await WorldBossSeasonReward.findForUpdate(seasonId, row.user_id, trx);
    if (ledger) {
      if (!ledgerMatches(ledger, row, reward)) throw fail("SETTLEMENT_INCOMPLETE");
      return ledger;
    }
    try {
      await trx(REWARD_TABLE).insert({
        season_id: seasonId,
        user_id: row.user_id,
        ranking: row.ranking,
        total_score: row.total_score,
        total_damage: row.total_damage,
        stone_amount: reward.stone,
        title_key: reward.title_key,
        paid_at: null,
      });
    } catch (error) {
      if (!knownUnique(error, SEASON_REWARD_UNIQUE)) throw error;
    }
    ledger = await WorldBossSeasonReward.findForUpdate(seasonId, row.user_id, trx);
    if (!ledger || !ledgerMatches(ledger, row, reward)) throw fail("SETTLEMENT_INCOMPLETE");
    return ledger;
  }

  async function payLedger(trx, season, row, ledger, paidAt) {
    if (ledger.paid_at) return;
    await beforePayment({ trx, season, userId: row.user_id, ranking: row.ranking, ledger });
    if (Number(ledger.stone_amount) > 0) {
      await inventory.increaseGodStone({
        userId: row.user_id,
        amount: Number(ledger.stone_amount),
        note: `worldboss_season_${season.id}`,
        trx,
      });
    }
    if (ledger.title_key) {
      const title = await trx("titles").where({ key: ledger.title_key }).first();
      if (!title) throw fail("SETTLEMENT_INCOMPLETE");
      await UserTitle.grantByPlatformId(row.user_id, title.id, trx);
    }
    await trx(REWARD_TABLE)
      .where({ id: ledger.id })
      .whereNull("paid_at")
      .update({ paid_at: paidAt });
  }

  async function settleSeason(id) {
    return mysql.transaction(async trx => {
      const season = await WorldBossSeason.findForUpdate(id, trx);
      if (!season) throw fail("SEASON_NOT_FOUND");
      const now = serviceNow();
      if (season.status !== "active" || !isEnded(season, now)) {
        throw fail("SEASON_NOT_EXPIRED");
      }
      const ranking = await scoreRankingWithDamage(season.id, trx);
      let rewarded = 0;
      let zeroTier = 0;
      for (const row of ranking) {
        const reward = rewardFor(row.ranking);
        if (reward.stone > 0 || reward.title_key) rewarded += 1;
        else zeroTier += 1;
        const ledger = await lockOrCreateLedger(trx, season.id, row, reward);
        await payLedger(trx, season, row, ledger, now);
      }
      const ledgers = await trx(REWARD_TABLE).where({ season_id: season.id }).orderBy("user_id");
      const expectedByUser = new Map(
        ranking.map(row => [row.user_id, { row, reward: rewardFor(row.ranking) }])
      );
      if (
        ledgers.length !== ranking.length ||
        ledgers.some(ledger => {
          const expected = expectedByUser.get(ledger.user_id);
          return (
            !expected || !ledger.paid_at || !ledgerMatches(ledger, expected.row, expected.reward)
          );
        })
      ) {
        throw fail("SETTLEMENT_INCOMPLETE");
      }
      await trx(TABLE).where({ id: season.id }).update({
        status: "settled",
        active_slot: null,
        settled_at: now,
      });
      return settlementResult(season.id, ranking.length, rewarded, zeroTier);
    });
  }

  async function settleExpiredSeasons() {
    const seasons = await WorldBossSeason.findSettleable(serviceNow(), activeSlot);
    const results = [];
    for (const season of seasons) results.push(await settleSeason(season.id));
    return results;
  }

  return {
    listSeasons,
    createSeason,
    updateSeason,
    deleteSeason,
    openSeason,
    getBattleStatus,
    getSeasonRoster,
    getRanking,
    getUserTotalDamage,
    getUserSeasonStats,
    getLatestSettledResult,
    settleSeason,
    settleExpiredSeasons,
  };
}

const defaultService = createSeasonService();
module.exports = defaultService;
module.exports.createSeasonService = createSeasonService;
module.exports.isEnded = isEnded;
module.exports.settlementResult = settlementResult;
