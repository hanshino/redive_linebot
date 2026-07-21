const config = require("config");
const mysql = require("../util/mysql");
const MinigameLevel = require("../model/application/MinigameLevel");
const WorldBoss = require("../model/application/WorldBoss");
const WorldBossSeason = require("../model/application/WorldBossSeason");
const WorldBossRound = require("../model/application/WorldBossRound");
const WorldBossContribution = require("../model/application/WorldBossContribution");
const { canonicalPositiveInteger } = require("../util/decimalInteger");

const DAILY_COST_LIMIT = config.get("worldboss.daily_cost_limit");
const HP_TIERS = config.get("worldboss.hp_tiers");
const DEFAULT_PROGRESS = { level: 1, exp: 0 };
const ATTACK_TYPES = new Set(["standard", "skill"]);
const ACTIVE_ROUND_SLOT = 1;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ROUND_UNIQUES = /uq_wbr_season_round|uq_wbr_season_active_slot/;

function fail(code) {
  return Object.assign(new Error(code), { code });
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function positiveBigInt(value) {
  try {
    return BigInt(canonicalPositiveInteger(value));
  } catch {
    return null;
  }
}

function excludeBoss(bosses, excludeBossId) {
  const excluded = canonicalPositiveInteger(excludeBossId);
  return bosses.filter(boss => canonicalPositiveInteger(boss.id) !== excluded);
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 && Number.isFinite(value);
}

function validateAttack(input) {
  if (!input || !ATTACK_TYPES.has(input.attackType)) throw fail("INVALID_ATTACK_TYPE");
  for (const field of ["damage", "cost", "exp"]) {
    if (!positiveSafeInteger(input[field])) throw fail(`INVALID_${field.toUpperCase()}`);
  }
}

function isExpired(season, now) {
  const endTime = new Date(season.end_time);
  return !Number.isFinite(endTime.getTime()) || now.getTime() >= endTime.getTime();
}

function knownRoundConflict(error) {
  if (!error || error.code !== "ER_DUP_ENTRY") return false;
  return ROUND_UNIQUES.test(`${error.sqlMessage || ""} ${error.message || ""}`);
}

function calculateJobExpTransition(progress, earnedExp, levelUnits) {
  const progressLevel = Number(progress && progress.level);
  const progressExp = Number(progress && progress.exp);
  if (
    !nonNegativeInteger(progressLevel) ||
    progressLevel < 1 ||
    !nonNegativeInteger(progressExp) ||
    !nonNegativeInteger(earnedExp) ||
    !Array.isArray(levelUnits) ||
    !levelUnits.length
  ) {
    throw fail("INVALID_JOB_EXP_DATA");
  }

  const thresholds = new Map();
  for (const row of levelUnits) {
    const level = Number(row && row.level);
    const maxExp = Number(row && row.max_exp);
    if (
      !nonNegativeInteger(level) ||
      level < 1 ||
      !nonNegativeInteger(maxExp) ||
      thresholds.has(level)
    ) {
      throw fail("INVALID_JOB_EXP_DATA");
    }
    thresholds.set(level, maxExp);
  }
  const levels = [...thresholds.keys()].sort((left, right) => left - right);
  if (
    levels[0] !== 1 ||
    levels.some((level, index) => level !== index + 1) ||
    !thresholds.has(progressLevel) ||
    (progressLevel > 1 && thresholds.get(progressLevel) <= 0)
  ) {
    throw fail("INVALID_JOB_EXP_DATA");
  }
  for (const [level, threshold] of thresholds) {
    if (level > 1 && threshold <= 0) throw fail("INVALID_JOB_EXP_DATA");
  }

  let newLevel = progressLevel;
  let newExp = progressExp + earnedExp;
  let levelUpCount = 0;
  let nextLevelExp = thresholds.get(newLevel + 1) ?? null;
  while (nextLevelExp !== null && newExp >= nextLevelExp) {
    newExp -= nextLevelExp;
    newLevel += 1;
    levelUpCount += 1;
    nextLevelExp = thresholds.get(newLevel + 1) ?? null;
  }
  return {
    levelUp: levelUpCount > 0,
    newLevel,
    newExp,
    levelUpCount,
    nextLevelExp,
  };
}

function createBattleService({ activeSlot = 1, clock = () => new Date(), hooks = {} } = {}) {
  const onAttackStarted = hooks.onAttackStarted || (() => {});
  const afterSeasonLock = hooks.afterSeasonLock || (() => {});
  const beforeRoundInsert = hooks.beforeRoundInsert || (() => {});
  const onRoundConflict = hooks.onRoundConflict || (() => {});
  const beforeExpUpdate = hooks.beforeExpUpdate || (() => {});

  function taipeiDayRange(now) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw fail("INVALID_DATE");
    const taipei = new Date(now.getTime() + TAIPEI_OFFSET_MS);
    const taipeiMidnightAsUtc = Date.UTC(
      taipei.getUTCFullYear(),
      taipei.getUTCMonth(),
      taipei.getUTCDate()
    );
    const startUtc = new Date(taipeiMidnightAsUtc - TAIPEI_OFFSET_MS);
    return { startUtc, endUtc: new Date(startUtc.getTime() + DAY_MS) };
  }

  function hpForRound(roundNo, hpWeight) {
    if (!Number.isInteger(roundNo) || roundNo < 1 || !positiveNumber(hpWeight)) {
      throw fail("INVALID_MAX_HP");
    }
    const tier = [...HP_TIERS]
      .sort((left, right) => Number(right.from_round) - Number(left.from_round))
      .find(candidate => roundNo >= Number(candidate.from_round));
    if (!tier) throw fail("INVALID_MAX_HP");
    const tierHp =
      Number(tier.base_hp) + (roundNo - Number(tier.from_round)) * Number(tier.per_round);
    const maxHp = Math.round(tierHp * hpWeight);
    if (!Number.isSafeInteger(maxHp) || maxHp <= 0) throw fail("INVALID_MAX_HP");
    return maxHp;
  }

  async function createRound(trx, seasonId, roundNo, excludeBossId) {
    let bosses = await WorldBoss.list(trx);
    if (!bosses.length) throw fail("NO_WORLD_BOSS");
    if (bosses.length > 1 && excludeBossId !== undefined && excludeBossId !== null) {
      bosses = excludeBoss(bosses, excludeBossId);
    }
    const boss = bosses[Math.floor(Math.random() * bosses.length)];
    const maxHp = hpForRound(roundNo, Number(boss.hp_weight));
    if (!positiveNumber(maxHp)) throw fail("INVALID_MAX_HP");
    const payload = {
      season_id: seasonId,
      round_no: roundNo,
      world_boss_id: boss.id,
      max_hp: maxHp,
      current_hp: maxHp,
      status: "active",
      active_slot: ACTIVE_ROUND_SLOT,
    };
    await beforeRoundInsert({ trx, seasonId, roundNo, payload });
    try {
      const [id] = await trx("world_boss_round").insert(payload);
      return { ...(await trx("world_boss_round").where({ id }).first()), boss };
    } catch (error) {
      if (!knownRoundConflict(error)) throw error;
      await onRoundConflict({ trx, seasonId, roundNo, error });
      const round = await WorldBossRound.findActiveForUpdate(seasonId, trx);
      if (!round) throw error;
      const persistedBoss = await trx("world_boss").where({ id: round.world_boss_id }).first();
      if (!persistedBoss) throw fail("WORLD_BOSS_NOT_FOUND");
      return { ...round, boss: persistedBoss };
    }
  }

  async function applyJobExp({ userId, progress, earnedExp, levelUnits, trx }) {
    const levelResult = calculateJobExpTransition(progress, earnedExp, levelUnits);
    await beforeExpUpdate({ trx, userId, progress, levelResult });
    await MinigameLevel.updateByUserId(
      userId,
      { level: levelResult.newLevel, exp: levelResult.newExp },
      trx
    );
    return levelResult;
  }

  async function dailyFor(userId, now, trx) {
    const { startUtc, endUtc } = taipeiDayRange(now);
    const used = await WorldBossContribution.sumCostInRange(userId, startUtc, endUtc, trx);
    return {
      limit: DAILY_COST_LIMIT,
      used,
      remaining: Math.max(0, DAILY_COST_LIMIT - used),
    };
  }

  async function getRemainingDailyCost(userId) {
    return dailyFor(userId, clock());
  }

  async function attack(input) {
    validateAttack(input);
    const { userId, damage, cost, exp } = input;
    await onAttackStarted({ userId });
    return mysql.transaction(async trx => {
      const season = await WorldBossSeason.findActiveForUpdate(activeSlot, trx);
      if (!season) throw fail("NO_ACTIVE_SEASON");
      const now = clock();
      taipeiDayRange(now);
      if (season.status !== "active" || isExpired(season, now)) throw fail("SEASON_ENDED");
      await afterSeasonLock({ trx, userId, season });

      const progress = await MinigameLevel.lockUserAndProgress(userId, DEFAULT_PROGRESS, trx);
      const beforeDaily = await dailyFor(userId, now, trx);
      if (beforeDaily.used + cost > DAILY_COST_LIMIT) throw fail("DAILY_LIMIT_EXCEEDED");

      let round = await WorldBossRound.findActiveForUpdate(season.id, trx);
      if (!round) throw fail("NO_ACTIVE_ROUND");
      const maxHp = positiveBigInt(round.max_hp);
      let currentHp = positiveBigInt(round.current_hp);
      if (maxHp === null || currentHp === null || currentHp > maxHp) throw fail("INVALID_MAX_HP");
      let boss = await trx("world_boss").where({ id: round.world_boss_id }).first();
      if (!boss) throw fail("WORLD_BOSS_NOT_FOUND");

      let remainingDamage = BigInt(damage);
      const clearedRounds = [];
      const contributionRoundId = round.id;
      while (remainingDamage >= currentHp) {
        remainingDamage -= currentHp;
        await trx("world_boss_round").where({ id: round.id }).update({
          current_hp: "0",
          status: "cleared",
          active_slot: null,
          cleared_at: now,
        });
        clearedRounds.push(Number(round.round_no));
        const nextRoundNo = Number(round.round_no) + 1;
        const created = await createRound(trx, season.id, nextRoundNo, round.world_boss_id);
        boss = created.boss;
        round = { ...created };
        delete round.boss;
        currentHp = positiveBigInt(round.current_hp);
        if (currentHp === null) throw fail("INVALID_MAX_HP");
        if (remainingDamage <= 0n) break;
      }
      if (remainingDamage > 0n) {
        await trx("world_boss_round")
          .where({ id: round.id })
          .update({ current_hp: (currentHp - remainingDamage).toString() });
        round = await trx("world_boss_round").where({ id: round.id }).first();
      }

      await trx("world_boss_contribution").insert({
        season_id: season.id,
        round_id: contributionRoundId,
        user_id: userId,
        damage,
        cost,
        created_at: now,
        updated_at: now,
      });
      const levelUnits = await trx("minigame_level_unit").select("level", "max_exp");
      const levelResult = await applyJobExp({ userId, progress, earnedExp: exp, levelUnits, trx });
      const seasonTotalDamage = await WorldBossContribution.sumSeasonDamage(season.id, userId, trx);
      const daily = await dailyFor(userId, now, trx);

      return {
        season,
        round,
        boss,
        clearedRounds,
        damage,
        cost,
        levelResult,
        seasonTotalDamage,
        daily,
      };
    });
  }

  return {
    attack,
    getRemainingDailyCost,
    hpForRound,
    createRound,
    calculateJobExpTransition,
    applyJobExp,
    taipeiDayRange,
  };
}

const defaultService = createBattleService();
module.exports = defaultService;
module.exports.createBattleService = createBattleService;
module.exports.isExpired = isExpired;
module.exports.excludeBoss = excludeBoss;
