const config = require("config");
const mysql = require("../util/mysql");
const MinigameLevel = require("../model/application/MinigameLevel");
const WorldBossSeason = require("../model/application/WorldBossSeason");
const WorldBossSeasonBoss = require("../model/application/WorldBossSeasonBoss");
const WorldBossRound = require("../model/application/WorldBossRound");
const WorldBossContribution = require("../model/application/WorldBossContribution");
const WorldBossRoundEffect = require("../model/application/WorldBossRoundEffect");
const WorldBossScoreEvent = require("../model/application/WorldBossScoreEvent");
const { canonicalPositiveInteger } = require("../util/decimalInteger");

const DAILY_COST_LIMIT = config.get("worldboss.daily_cost_limit");
const HP_TIERS = config.get("worldboss.hp_tiers");
const DEFAULT_PROGRESS = { level: 1, exp: 0 };
const ATTACK_TYPES = new Set(["standard", "skill"]);
const JOB_KEYS = new Set(["adventurer", "swordman", "mage", "thief"]);
const ROSTER_SIZE = WorldBossSeasonBoss.ROSTER_SIZE;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function fail(code) {
  return Object.assign(new Error(code), { code });
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function unsignedBigInt(value) {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function positiveBigInt(value) {
  try {
    return BigInt(canonicalPositiveInteger(value));
  } catch {
    return null;
  }
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 && Number.isFinite(value);
}

function validateAttack(input) {
  if (!input || !ATTACK_TYPES.has(input.attackType)) throw fail("INVALID_ATTACK_TYPE");
  // rawDamage is the player's own uncapped output; it is BIGINT in the schema, so it is
  // validated as a canonical decimal integer rather than a JS number.
  let rawDamage;
  try {
    rawDamage = BigInt(canonicalPositiveInteger(input.rawDamage));
  } catch {
    throw fail("INVALID_RAW_DAMAGE");
  }
  if (!JOB_KEYS.has(input.jobKey)) throw fail("INVALID_JOB_KEY");
  for (const field of ["cost", "exp"]) {
    if (!positiveSafeInteger(input[field])) throw fail(`INVALID_${field.toUpperCase()}`);
  }
  let roundId;
  try {
    roundId = canonicalPositiveInteger(input.roundId);
  } catch {
    throw fail("INVALID_ROUND_ID");
  }
  return { roundId, rawDamage };
}

function isExpired(season, now) {
  const endTime = new Date(season.end_time);
  return !Number.isFinite(endTime.getTime()) || now.getTime() >= endTime.getTime();
}

function bossOf(round) {
  return {
    id: round.world_boss_id,
    position: Number(round.position),
    name: round.name,
    image: round.image,
    description: round.description,
    hp_weight: round.hp_weight,
  };
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
  const beforeCycleInsert = hooks.beforeCycleInsert || (() => {});
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

  function hpForCycle(cycleNo, hpWeight) {
    if (!Number.isInteger(cycleNo) || cycleNo < 1 || !positiveNumber(hpWeight)) {
      throw fail("INVALID_MAX_HP");
    }
    const tier = [...HP_TIERS]
      .sort((left, right) => Number(right.from_round) - Number(left.from_round))
      .find(candidate => cycleNo >= Number(candidate.from_round));
    if (!tier) throw fail("INVALID_MAX_HP");
    const tierHp =
      Number(tier.base_hp) + (cycleNo - Number(tier.from_round)) * Number(tier.per_round);
    const maxHp = Math.round(tierHp * hpWeight);
    if (!Number.isSafeInteger(maxHp) || maxHp <= 0) throw fail("INVALID_MAX_HP");
    return maxHp;
  }

  /**
   * Creates all ROSTER_SIZE encounters of one cycle in a single insert so a cycle can
   * never be half-open. UNIQUE(season_boss_id, cycle_no) is a pure invariant backstop:
   * every attack holds the season row lock first, which globally serialises cycle
   * creation, so a violation means the data is corrupt and must roll the transaction
   * back — it is deliberately not treated as a recoverable race.
   */
  async function openCycle(trx, seasonId, cycleNo) {
    const roster = await WorldBossSeasonBoss.listBySeasonForUpdate(seasonId, trx);
    if (roster.length !== ROSTER_SIZE) throw fail("INVALID_SEASON_ROSTER");

    const rows = roster.map(entry => {
      const maxHp = hpForCycle(cycleNo, Number(entry.hp_weight));
      return {
        season_boss_id: entry.id,
        cycle_no: cycleNo,
        max_hp: maxHp,
        current_hp: maxHp,
        cleared_at: null,
      };
    });
    await beforeCycleInsert({ trx, seasonId, cycleNo, rows });
    await WorldBossRound.insertCycle(trx, rows);
    // Locking current read, not the transaction snapshot: the caller returns these rows.
    const rounds = await WorldBossRound.listCycleForUpdate(seasonId, cycleNo, trx);
    if (rounds.length !== ROSTER_SIZE) throw fail("INVALID_SEASON_ROSTER");
    return { cycleNo, rounds };
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

  /**
   * Builds the score ledger for one attack. Three layers, three rules:
   *  - direct  : always, to the attacker, worth the UNCAPPED raw damage. Overkill is
   *              discarded from HP but never from score, otherwise the last hit on a
   *              boss would be worth less than the same hit one second earlier.
   *  - assist  : to whoever left the effect, worth the effect's value.
   *  - relay   : only for a banner, to the attacker. A seal already paid the attacker
   *              in HP damage, so paying a relay on top would double-count it.
   */
  function scoreRowsFor({ season, round, contributionId, userId, rawDamage, effect, now }) {
    const base = {
      season_id: season.id,
      round_id: round.id,
      contribution_id: contributionId,
      created_at: now,
      updated_at: now,
    };
    const rows = [
      {
        ...base,
        effect_id: null,
        beneficiary_user_id: userId,
        kind: WorldBossScoreEvent.KINDS.DIRECT,
        points: rawDamage.toString(),
      },
    ];
    if (!effect) return rows;

    const points = canonicalPositiveInteger(effect.value);
    rows.push({
      ...base,
      effect_id: effect.id,
      beneficiary_user_id: effect.source_user_id,
      kind: WorldBossScoreEvent.KINDS.ASSIST,
      points,
    });
    if (effect.effect_type === WorldBossRoundEffect.TYPES.BANNER) {
      rows.push({
        ...base,
        effect_id: effect.id,
        beneficiary_user_id: userId,
        kind: WorldBossScoreEvent.KINDS.RELAY,
        points,
      });
    }
    return rows;
  }

  async function attack(input) {
    const { roundId, rawDamage } = validateAttack(input);
    const { userId, jobKey, cost, exp } = input;
    await onAttackStarted({ userId });
    return mysql.transaction(async trx => {
      // The season row is the single global serializer for every attack; every later
      // lock (roster, rounds, user, effects) is only ever taken while holding it, so no
      // attack pair can deadlock on ordering.
      const season = await WorldBossSeason.findActiveForUpdate(activeSlot, trx);
      if (!season) throw fail("NO_ACTIVE_SEASON");
      const now = clock();
      taipeiDayRange(now);
      if (season.status !== "active" || isExpired(season, now)) throw fail("SEASON_ENDED");
      await afterSeasonLock({ trx, userId, season });

      const currentCycleNo = await WorldBossRound.currentCycleNo(season.id, trx);
      if (!currentCycleNo) throw fail("NO_ACTIVE_ROUND");

      // Target validation happens before any write — including the implicit progress-row
      // creation — so a stale/cleared/foreign target leaves the transaction side-effect free.
      const round = await WorldBossRound.findByIdForUpdate(roundId, season.id, trx);
      if (!round) throw fail("ROUND_NOT_FOUND");
      if (Number(round.cycle_no) !== currentCycleNo) throw fail("ROUND_STALE");
      const maxHp = positiveBigInt(round.max_hp);
      const currentHp = unsignedBigInt(round.current_hp);
      if (maxHp === null || currentHp === null || currentHp > maxHp) throw fail("INVALID_MAX_HP");
      if (currentHp === 0n || round.cleared_at) throw fail("ROUND_CLEARED");

      const progress = await MinigameLevel.lockUserAndProgress(userId, DEFAULT_PROGRESS, trx);
      const beforeDaily = await dailyFor(userId, now, trx);
      if (beforeDaily.used + cost > DAILY_COST_LIMIT) throw fail("DAILY_LIMIT_EXCEEDED");

      // Consume before creating, or an adventurer/mage would detonate the effect it just
      // left in this very hit. The "not my own effect" filter lives in SQL — see the model.
      const effect = await WorldBossRoundEffect.findConsumableForUpdate(trx, {
        roundId: round.id,
        userId,
      });
      // A banner is pure score: it pays an assist and a relay but removes no HP. A seal is
      // stored damage: it detonates into the HP pool and therefore into the overkill cap.
      const effectDamage =
        effect && effect.effect_type === WorldBossRoundEffect.TYPES.SEAL
          ? BigInt(canonicalPositiveInteger(effect.value))
          : 0n;

      // Overkill removes no HP, but it is still credited as score — only the HP ledger caps.
      const requestedDamage = rawDamage + effectDamage;
      const effectiveDamage = requestedDamage > currentHp ? currentHp : requestedDamage;
      const remainingHp = currentHp - effectiveDamage;
      const cleared = remainingHp === 0n;
      await trx("world_boss_round")
        .where({ id: round.id })
        .update({
          current_hp: remainingHp.toString(),
          cleared_at: cleared ? now : null,
        });

      const [contributionId] = await trx("world_boss_contribution").insert({
        season_id: season.id,
        round_id: round.id,
        user_id: userId,
        raw_damage: rawDamage.toString(),
        effect_damage: effectDamage.toString(),
        job_key: jobKey,
        damage: effectiveDamage.toString(),
        cost,
        created_at: now,
        updated_at: now,
      });

      if (effect) {
        await WorldBossRoundEffect.consume(trx, {
          effectId: effect.id,
          contributionId,
          now,
        });
      }
      const scoreRows = scoreRowsFor({
        season,
        round,
        contributionId,
        userId,
        rawDamage,
        effect,
        now,
      });
      await WorldBossScoreEvent.insertMany(trx, scoreRows);

      // A dead boss can never be attacked again, so an effect left on this hit could never
      // be consumed — do not create data that is unreachable by construction.
      const plan = cleared ? null : WorldBossRoundEffect.planFor(jobKey, rawDamage.toString());
      let createdEffect = null;
      if (plan) {
        const createdId = await WorldBossRoundEffect.insert(trx, {
          season_id: season.id,
          round_id: round.id,
          source_contribution_id: contributionId,
          source_user_id: userId,
          effect_type: plan.effect_type,
          value: plan.value.toString(),
          consumed_by_contribution_id: null,
          created_at: now,
          updated_at: now,
        });
        createdEffect = WorldBossRoundEffect.toDto({
          id: createdId,
          effect_type: plan.effect_type,
          value: plan.value.toString(),
          source_user_id: userId,
        });
      }

      const cycleRounds = await WorldBossRound.listCycleForUpdate(season.id, currentCycleNo, trx);
      const allCleared =
        cycleRounds.length === ROSTER_SIZE &&
        cycleRounds.every(row => unsignedBigInt(row.current_hp) === 0n);

      let cycleNo = currentCycleNo;
      let rounds = cycleRounds;
      if (allCleared) {
        const opened = await openCycle(trx, season.id, currentCycleNo + 1);
        cycleNo = opened.cycleNo;
        rounds = opened.rounds;
      }

      const levelUnits = await trx("minigame_level_unit").select("level", "max_exp");
      const levelResult = await applyJobExp({ userId, progress, earnedExp: exp, levelUnits, trx });
      const seasonTotalDamage = await WorldBossContribution.sumSeasonDamage(season.id, userId, trx);
      const seasonTotalScore = await WorldBossScoreEvent.sumSeasonScore(season.id, userId, trx);
      const daily = await dailyFor(userId, now, trx);
      const attackedRound = cycleRounds.find(row => String(row.id) === String(round.id));

      return {
        season,
        attackedCycleNo: currentCycleNo,
        cycleNo,
        cycleAdvanced: allCleared,
        round: attackedRound,
        boss: bossOf(round),
        rounds,
        cleared,
        rawDamage: rawDamage.toString(),
        effectDamage: effectDamage.toString(),
        // The HP actually removed — same semantics as the contribution.damage column.
        effectiveDamage: effectiveDamage.toString(),
        overkillDamage: (requestedDamage - effectiveDamage).toString(),
        // The whole ledger this attack wrote, not just the attacker's slice: `direct` and
        // `relay` go to the attacker, `assist` goes to consumedEffect.sourceUserId. Filtering
        // to the attacker would make `assist` a permanently-zero field, since a player can
        // never consume their own effect.
        scoreGained: WorldBossScoreEvent.breakdown(scoreRows),
        consumedEffect: effect ? WorldBossRoundEffect.toDto(effect) : null,
        createdEffect,
        cost,
        levelResult,
        seasonTotalDamage,
        seasonTotalScore,
        daily,
      };
    });
  }

  return {
    attack,
    getRemainingDailyCost,
    hpForCycle,
    openCycle,
    calculateJobExpTransition,
    applyJobExp,
    taipeiDayRange,
  };
}

const defaultService = createBattleService();
module.exports = defaultService;
module.exports.createBattleService = createBattleService;
module.exports.isExpired = isExpired;
module.exports.ROSTER_SIZE = ROSTER_SIZE;
