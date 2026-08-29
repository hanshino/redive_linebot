require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
const {
  PREFIX,
  ACTIVE_SLOT,
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
} = require("../../__tests__/helpers/worldBossFixture");
const testDatabase = createWorldBossTestDatabase("battle");
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);
const MinigameLevel = require("../../model/application/MinigameLevel");
const WorldBossSeasonBoss = require("../../model/application/WorldBossSeasonBoss");
const WorldBossRound = require("../../model/application/WorldBossRound");
const WorldBossRoundEffect = require("../../model/application/WorldBossRoundEffect");
const { createBattleService } = require("../WorldBossBattleService");

const prefix = `${PREFIX}battle_`;
const now = new Date("2026-07-20T04:00:00.000Z");
const ROSTER_SIZE = WorldBossSeasonBoss.ROSTER_SIZE;
const sentinel = {
  userId: `${prefix}sentinel_user`,
  bossName: `${prefix}sentinel_boss`,
  seasonName: `${prefix}sentinel_season`,
};

function ownedUserId(label) {
  return `${prefix}${label}`;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/**
 * Releases every arriver only once `count` of them have arrived. Without this a
 * "concurrent" test can degenerate into two sequential attacks and still pass.
 */
function barrier(count) {
  const gate = deferred();
  let arrived = 0;
  return () => {
    arrived += 1;
    if (arrived >= count) gate.resolve();
    return gate.promise;
  };
}

function domainCode(error) {
  return error && error.code;
}

async function cleanupOwned({ includeSentinels = false } = {}) {
  const cleanupPrefix = query => {
    query.whereRaw("LEFT(??, ?) = ?", ["platform_id", prefix.length, prefix]);
    if (!includeSentinels) query.whereNot({ platform_id: sentinel.userId });
    return query;
  };
  const seasons = await mysql("world_boss_season")
    .whereRaw("LEFT(??, ?) = ?", ["name", prefix.length, prefix])
    .modify(query => {
      if (!includeSentinels) query.whereNot({ name: sentinel.seasonName });
    })
    .select("id");
  const seasonIds = seasons.map(season => season.id);
  if (seasonIds.length) {
    // FK RESTRICT: the score/effect ledgers point at contributions, so they must go first.
    await mysql("world_boss_score_event").whereIn("season_id", seasonIds).del();
    await mysql("world_boss_round_effect").whereIn("season_id", seasonIds).del();
    await mysql("world_boss_season_reward").whereIn("season_id", seasonIds).del();
    await mysql("world_boss_contribution").whereIn("season_id", seasonIds).del();
    const roster = await mysql("world_boss_season_boss")
      .whereIn("season_id", seasonIds)
      .select("id");
    const rosterIds = roster.map(row => row.id);
    if (rosterIds.length) {
      await mysql("world_boss_round").whereIn("season_boss_id", rosterIds).del();
      await mysql("world_boss_season_boss").whereIn("id", rosterIds).del();
    }
    await mysql("world_boss_season").whereIn("id", seasonIds).del();
  }
  await mysql("world_boss")
    .whereRaw("LEFT(??, ?) = ?", ["name", prefix.length, prefix])
    .modify(query => {
      if (!includeSentinels) query.whereNot({ name: sentinel.bossName });
    })
    .del();

  const users = await cleanupPrefix(mysql("user")).select("id");
  const userIds = users.map(user => user.id);
  if (userIds.length) await mysql("minigame_level").whereIn("user_id", userIds).del();
  await cleanupPrefix(mysql("user")).del();
}

async function createUser(userId, { progress = { level: 1, exp: 0 } } = {}) {
  const [id] = await mysql("user").insert({ platform: "line", platform_id: userId, status: 1 });
  if (progress) await mysql("minigame_level").insert({ user_id: id, ...progress });
  return id;
}

/**
 * Builds an active season with a full five-boss roster and one cycle whose per-boss HP is
 * given explicitly, so a test can express "four already dead, one alive" directly.
 */
async function createBattleFixture({
  label,
  userId = ownedUserId(`${label}_user`),
  progress = { level: 1, exp: 0 },
  maxHp = 100,
  currentHps = new Array(ROSTER_SIZE).fill(maxHp),
  cycleNo = 1,
  endTime = new Date("2026-07-21T04:00:00.000Z"),
  rosterSize = ROSTER_SIZE,
} = {}) {
  const userDbId = await createUser(userId, { progress });
  const bossIds = [];
  for (let index = 0; index < rosterSize; index += 1) {
    const [id] = await mysql("world_boss").insert({
      name: `${prefix}${label}_boss_${index + 1}`,
      hp_weight: 1,
      description: `${prefix}${label}_desc_${index + 1}`,
    });
    bossIds.push(id);
  }
  const [seasonId] = await mysql("world_boss_season").insert({
    name: `${prefix}${label}_season`,
    status: "active",
    active_slot: ACTIVE_SLOT,
    start_time: new Date("2026-07-19T04:00:00.000Z"),
    end_time: endTime,
  });
  const roster = await mysql.transaction(async trx => {
    await WorldBossSeasonBoss.replaceForSeason(trx, seasonId, bossIds);
    return WorldBossSeasonBoss.listBySeason(seasonId, trx);
  });
  if (cycleNo) {
    await mysql("world_boss_round").insert(
      roster.map((entry, index) => {
        const currentHp = String(currentHps[index] ?? maxHp);
        return {
          season_boss_id: entry.id,
          cycle_no: cycleNo,
          max_hp: String(maxHp),
          current_hp: currentHp,
          cleared_at: currentHp === "0" ? now : null,
        };
      })
    );
  }
  const rounds = cycleNo ? await WorldBossRound.listCycle(seasonId, cycleNo) : [];
  return { userId, userDbId, bossIds, seasonId, roster, rounds, cycleNo };
}

function attackWith(service, overrides) {
  return service.attack({
    attackType: "standard",
    jobKey: "swordman",
    cost: 1,
    exp: 1,
    ...overrides,
    roundId: String(overrides.roundId),
  });
}

async function listContributions(seasonId) {
  return mysql("world_boss_contribution").where({ season_id: seasonId }).orderBy("id");
}

async function listScoreEvents(seasonId) {
  return mysql("world_boss_score_event").where({ season_id: seasonId }).orderBy("id");
}

async function listEffects(seasonId) {
  return mysql("world_boss_round_effect").where({ season_id: seasonId }).orderBy("id");
}

/**
 * The three ledgers of one contribution, as plain strings. Reading damage alone can no
 * longer tell a seal detonation apart from a bigger raw hit, so every damage assertion
 * checks raw / effect / HP-applied together plus the direct score.
 */
async function ledgerOf(contributionId) {
  const row = await mysql("world_boss_contribution").where({ id: contributionId }).first();
  const direct = await mysql("world_boss_score_event")
    .where({ contribution_id: contributionId, kind: "direct" })
    .first();
  return {
    raw_damage: String(row.raw_damage),
    effect_damage: String(row.effect_damage),
    damage: String(row.damage),
    job_key: row.job_key,
    direct_points: direct ? String(direct.points) : null,
  };
}

/**
 * An unconsumed effect left by `userId` on `roundId`. The FK to a source contribution is
 * NOT NULL, so a seeded effect needs a seeded contribution to hang off — that contribution
 * is deliberately given cost 0 so it cannot disturb a quota assertion.
 */
async function seedEffect({ seasonId, roundId, userId, type, value, at = now }) {
  const [sourceContributionId] = await mysql("world_boss_contribution").insert({
    season_id: seasonId,
    round_id: roundId,
    user_id: userId,
    raw_damage: String(value),
    effect_damage: "0",
    job_key: type === "banner" ? "adventurer" : "mage",
    damage: "0",
    cost: 0,
    created_at: at,
    updated_at: at,
  });
  const [id] = await mysql("world_boss_round_effect").insert({
    season_id: seasonId,
    round_id: roundId,
    source_contribution_id: sourceContributionId,
    source_user_id: userId,
    effect_type: type,
    value: String(value),
    consumed_by_contribution_id: null,
    created_at: at,
    updated_at: at,
  });
  return { id, sourceContributionId };
}

async function assertSentinelsPreserved() {
  await expect(
    mysql("user").where({ platform_id: sentinel.userId }).first()
  ).resolves.toMatchObject({
    platform: "line",
    status: 1,
  });
  await expect(
    mysql("world_boss").where({ name: sentinel.bossName }).first()
  ).resolves.toMatchObject({
    hp_weight: "1.000",
  });
  await expect(
    mysql("world_boss_season").where({ name: sentinel.seasonName }).first()
  ).resolves.toMatchObject({ status: "draft", active_slot: null });
}

beforeAll(async () => {
  await expect(testDatabase.setup()).resolves.toMatch(/^Princess_wbtest_battle_/);
  await cleanupOwned({ includeSentinels: true });
  await mysql("user").insert({ platform: "line", platform_id: sentinel.userId, status: 1 });
  await mysql("world_boss").insert({ name: sentinel.bossName, hp_weight: 1 });
  await mysql("world_boss_season").insert({
    name: sentinel.seasonName,
    status: "draft",
    end_time: new Date("2030-01-01T00:00:00.000Z"),
  });
}, SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await cleanupOwned();
  await assertSentinelsPreserved();
});

afterEach(async () => {
  await cleanupOwned();
  await assertSentinelsPreserved();
});

afterAll(() => testDatabase.teardown());

describe("WorldBossBattleService", () => {
  test("normal hit changes only the targeted boss HP, contribution, EXP, totals, and quota", async () => {
    const fixture = await createBattleFixture({ label: "normal" });
    const target = fixture.rounds[2];
    const service = createBattleService({ clock: () => now });

    const result = await service.attack({
      userId: fixture.userId,
      roundId: String(target.id),
      attackType: "standard",
      rawDamage: 25,
      jobKey: "swordman",
      cost: 10,
      exp: 5,
    });

    expect(result).toMatchObject({
      rawDamage: "25",
      effectDamage: "0",
      effectiveDamage: "25",
      overkillDamage: "0",
      scoreGained: { direct: "25", assist: "0", relay: "0" },
      consumedEffect: null,
      createdEffect: null,
      cost: 10,
      cleared: false,
      cycleAdvanced: false,
      attackedCycleNo: 1,
      cycleNo: 1,
      seasonTotalDamage: "25",
      seasonTotalScore: "25",
      daily: { limit: 100, used: 10, remaining: 90 },
      levelResult: { levelUp: false, newLevel: 1, newExp: 5, levelUpCount: 0, nextLevelExp: 24 },
    });
    expect(Number(result.season.id)).toBe(fixture.seasonId);
    expect(Number(result.boss.id)).toBe(fixture.bossIds[2]);
    expect(result.boss.position).toBe(3);
    expect(result.rounds).toHaveLength(ROSTER_SIZE);

    const rounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    expect(rounds.map(row => Number(row.current_hp))).toEqual([100, 100, 75, 100, 100]);
    expect(rounds.every(row => row.cleared_at === null)).toBe(true);
    const [contribution] = await listContributions(fixture.seasonId);
    expect(contribution).toMatchObject({
      user_id: fixture.userId,
      round_id: target.id,
      damage: 25,
      cost: 10,
    });
    await expect(ledgerOf(contribution.id)).resolves.toEqual({
      raw_damage: "25",
      effect_damage: "0",
      damage: "25",
      job_key: "swordman",
      direct_points: "25",
    });
    // Exactly one score event, and no effect written or consumed by a swordman.
    const events = await listScoreEvents(fixture.seasonId);
    expect(events.map(row => [row.kind, row.beneficiary_user_id, String(row.points)])).toEqual([
      ["direct", fixture.userId, "25"],
    ]);
    expect(events[0].effect_id).toBeNull();
    await expect(listEffects(fixture.seasonId)).resolves.toEqual([]);
    // One attack, one quota charge.
    expect(await listContributions(fixture.seasonId)).toHaveLength(1);
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toMatchObject({ level: 1, exp: 5 });
  });

  test("players may freely pick any surviving boss in the current cycle", async () => {
    const fixture = await createBattleFixture({ label: "free_target" });
    const service = createBattleService({ clock: () => now });

    for (const round of fixture.rounds) {
      await expect(
        service.attack({
          userId: fixture.userId,
          roundId: String(round.id),
          attackType: "standard",
          rawDamage: 10,
          jobKey: "swordman",
          cost: 1,
          exp: 1,
        })
      ).resolves.toMatchObject({ cleared: false, effectiveDamage: "10" });
    }

    const rounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    expect(rounds.map(row => Number(row.current_hp))).toEqual([90, 90, 90, 90, 90]);
    // Every hit is credited to its own encounter, not merged onto one.
    const contributions = await mysql("world_boss_contribution")
      .where({ season_id: fixture.seasonId })
      .orderBy("round_id");
    expect(contributions.map(row => Number(row.round_id))).toEqual(
      fixture.rounds.map(row => Number(row.id)).sort((left, right) => left - right)
    );
  });

  test("overkill is discarded: contribution records only the effective damage", async () => {
    const fixture = await createBattleFixture({ label: "overkill", maxHp: 100 });
    const target = fixture.rounds[0];
    const service = createBattleService({ clock: () => now });

    const result = await service.attack({
      userId: fixture.userId,
      roundId: String(target.id),
      attackType: "skill",
      rawDamage: 45123,
      jobKey: "swordman",
      cost: 10,
      exp: 7,
    });

    expect(result).toMatchObject({
      rawDamage: "45123",
      effectDamage: "0",
      effectiveDamage: "100",
      overkillDamage: "45023",
      // Overkill is discarded from HP but not from score: direct is the full raw hit.
      scoreGained: { direct: "45123", assist: "0", relay: "0" },
      cleared: true,
      cycleAdvanced: false,
      seasonTotalDamage: "100",
      seasonTotalScore: "45123",
    });
    const [contribution] = await listContributions(fixture.seasonId);
    expect(contribution).toMatchObject({ damage: 100, cost: 10 });
    await expect(ledgerOf(contribution.id)).resolves.toEqual({
      raw_damage: "45123",
      effect_damage: "0",
      damage: "100",
      job_key: "swordman",
      direct_points: "45123",
    });
    const rounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    expect(Number(rounds[0].current_hp)).toBe(0);
    expect(rounds[0].cleared_at).toBeInstanceOf(Date);
    expect(rounds.slice(1).map(row => Number(row.current_hp))).toEqual([100, 100, 100, 100]);
  });

  test("clearing four of five bosses does not advance the cycle", async () => {
    const fixture = await createBattleFixture({
      label: "four_kills",
      maxHp: 10,
      currentHps: [10, 10, 10, 10, 10],
    });
    const service = createBattleService({ clock: () => now });

    for (const round of fixture.rounds.slice(0, 4)) {
      const result = await service.attack({
        userId: fixture.userId,
        roundId: String(round.id),
        attackType: "standard",
        rawDamage: 10,
        jobKey: "swordman",
        cost: 1,
        exp: 1,
      });
      expect(result).toMatchObject({ cleared: true, cycleAdvanced: false, cycleNo: 1 });
    }

    expect(await WorldBossRound.currentCycleNo(fixture.seasonId)).toBe(1);
    const rounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    expect(rounds.map(row => Number(row.current_hp))).toEqual([0, 0, 0, 0, 10]);
    expect(rounds.filter(row => row.cleared_at).length).toBe(4);
  });

  test("the fifth kill atomically opens the next cycle with five fresh encounters", async () => {
    const fixture = await createBattleFixture({
      label: "fifth_kill",
      maxHp: 10,
      currentHps: [0, 0, 0, 0, 10],
    });
    const survivor = fixture.rounds[4];
    const service = createBattleService({ clock: () => now });

    const result = await service.attack({
      userId: fixture.userId,
      roundId: String(survivor.id),
      attackType: "skill",
      rawDamage: 10,
      jobKey: "swordman",
      cost: 5,
      exp: 5,
    });

    expect(result).toMatchObject({
      cleared: true,
      cycleAdvanced: true,
      attackedCycleNo: 1,
      cycleNo: 2,
      effectiveDamage: "10",
    });
    expect(result.rounds).toHaveLength(ROSTER_SIZE);
    expect(result.rounds.map(row => row.position)).toEqual([1, 2, 3, 4, 5]);

    expect(await WorldBossRound.currentCycleNo(fixture.seasonId)).toBe(2);
    const cycleOne = await WorldBossRound.listCycle(fixture.seasonId, 1);
    expect(cycleOne.every(row => Number(row.current_hp) === 0 && row.cleared_at)).toBe(true);
    const cycleTwo = await WorldBossRound.listCycle(fixture.seasonId, 2);
    expect(cycleTwo).toHaveLength(ROSTER_SIZE);
    expect(cycleTwo.every(row => row.cleared_at === null)).toBe(true);
    // Same season roster carries over — the next cycle reuses the identical five bosses.
    expect(cycleTwo.map(row => Number(row.world_boss_id))).toEqual(fixture.bossIds);
    expect(cycleTwo.map(row => Number(row.season_boss_id))).toEqual(
      fixture.roster.map(row => Number(row.id))
    );
    // Contribution is attributed to the encounter that was actually hit, not the new cycle.
    await expect(
      mysql("world_boss_contribution").where({ season_id: fixture.seasonId }).first()
    ).resolves.toMatchObject({ round_id: survivor.id, damage: 10 });
  });

  test("next cycle HP uses the per-boss weight snapshot, not the live catalog", async () => {
    const fixture = await createBattleFixture({
      label: "weight",
      maxHp: 10,
      currentHps: [0, 0, 0, 0, 10],
    });
    // Distinct frozen weights, then a catalog edit that must be ignored.
    const weights = ["0.500", "1.000", "1.500", "2.000", "2.500"];
    for (const [index, entry] of fixture.roster.entries()) {
      await mysql("world_boss_season_boss")
        .where({ id: entry.id })
        .update({ hp_weight: weights[index] });
    }
    await mysql("world_boss").whereIn("id", fixture.bossIds).update({ hp_weight: 9 });
    const service = createBattleService({ clock: () => now });

    await service.attack({
      userId: fixture.userId,
      roundId: String(fixture.rounds[4].id),
      attackType: "standard",
      rawDamage: 10,
      jobKey: "swordman",
      cost: 1,
      exp: 1,
    });

    // Cycle 2 base HP from config tier 1: 30000 + (2 - 1) * 15000 = 45000.
    const cycleTwo = await WorldBossRound.listCycle(fixture.seasonId, 2);
    expect(cycleTwo.map(row => Number(row.max_hp))).toEqual([22500, 45000, 67500, 90000, 112500]);
    expect(cycleTwo.map(row => Number(row.current_hp))).toEqual([
      22500, 45000, 67500, 90000, 112500,
    ]);
    expect(service.hpForCycle(2, 0.5)).toBe(22500);
  });

  test("rejects a cleared target with no cost, EXP, or contribution side effects", async () => {
    const fixture = await createBattleFixture({
      label: "cleared",
      maxHp: 10,
      currentHps: [0, 10, 10, 10, 10],
    });
    const service = createBattleService({ clock: () => now });
    const before = {
      rounds: await WorldBossRound.listCycle(fixture.seasonId, 1),
      progress: await mysql("minigame_level").where({ user_id: fixture.userDbId }).first(),
    };

    await expect(
      service.attack({
        userId: fixture.userId,
        roundId: String(fixture.rounds[0].id),
        attackType: "standard",
        rawDamage: 10,
        jobKey: "swordman",
        cost: 10,
        exp: 10,
      })
    ).rejects.toMatchObject({ code: "ROUND_CLEARED" });

    await expect(WorldBossRound.listCycle(fixture.seasonId, 1)).resolves.toEqual(before.rounds);
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toEqual(before.progress);
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
    await expect(service.getRemainingDailyCost(fixture.userId)).resolves.toEqual({
      limit: 100,
      used: 0,
      remaining: 100,
    });
  });

  test("rejects a previous-cycle target with no cost, EXP, or contribution side effects", async () => {
    const fixture = await createBattleFixture({
      label: "stale_cycle",
      maxHp: 10,
      currentHps: [0, 0, 0, 0, 10],
    });
    const service = createBattleService({ clock: () => now });
    await service.attack({
      userId: fixture.userId,
      roundId: String(fixture.rounds[4].id),
      attackType: "standard",
      rawDamage: 10,
      jobKey: "swordman",
      cost: 1,
      exp: 1,
    });
    const cycleTwo = await WorldBossRound.listCycle(fixture.seasonId, 2);
    const beforeProgress = await mysql("minigame_level")
      .where({ user_id: fixture.userDbId })
      .first();
    const beforeCost = await service.getRemainingDailyCost(fixture.userId);

    // Every cycle-1 round id is now stale, including the ones that were never cleared by HP.
    for (const round of fixture.rounds) {
      await expect(
        service.attack({
          userId: fixture.userId,
          roundId: String(round.id),
          attackType: "standard",
          rawDamage: 5,
          jobKey: "swordman",
          cost: 10,
          exp: 10,
        })
      ).rejects.toMatchObject({ code: "ROUND_STALE" });
    }

    await expect(WorldBossRound.listCycle(fixture.seasonId, 2)).resolves.toEqual(cycleTwo);
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toEqual(beforeProgress);
    await expect(service.getRemainingDailyCost(fixture.userId)).resolves.toEqual(beforeCost);
    await expect(
      mysql("world_boss_contribution").where({ season_id: fixture.seasonId })
    ).resolves.toHaveLength(1);
  });

  test("rejects a round id from another season without creating a progress row", async () => {
    const foreign = await createBattleFixture({ label: "foreign" });
    // Retire the first season so a second one can hold the active slot.
    await mysql("world_boss_season")
      .where({ id: foreign.seasonId })
      .update({ status: "settled", active_slot: null, settled_at: now });
    const fixture = await createBattleFixture({ label: "own" });
    const newPlayer = ownedUserId("no_progress_player");
    await createUser(newPlayer, { progress: null });
    const service = createBattleService({ clock: () => now });

    await expect(
      service.attack({
        userId: newPlayer,
        roundId: String(foreign.rounds[0].id),
        attackType: "standard",
        rawDamage: 10,
        jobKey: "swordman",
        cost: 10,
        exp: 10,
      })
    ).rejects.toMatchObject({ code: "ROUND_NOT_FOUND" });

    const newPlayerDbId = (await mysql("user").where({ platform_id: newPlayer }).first()).id;
    // Target validation runs before lockUserAndProgress, so no row was created.
    await expect(mysql("minigame_level").where({ user_id: newPlayerDbId })).resolves.toEqual([]);
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
  });

  test("rejects invalid attack input and round ids before hooks or writes", async () => {
    const fixture = await createBattleFixture({ label: "validation" });
    const roundId = String(fixture.rounds[0].id);
    const onAttackStarted = jest.fn();
    const service = createBattleService({ clock: () => now, hooks: { onAttackStarted } });
    const before = {
      rounds: await WorldBossRound.listCycle(fixture.seasonId, 1),
      progress: await mysql("minigame_level").where({ user_id: fixture.userDbId }).first(),
    };

    await expect(
      service.attack({
        userId: fixture.userId,
        roundId,
        attackType: "unknown",
        rawDamage: 1,
        jobKey: "swordman",
        cost: 1,
        exp: 1,
      })
    ).rejects.toMatchObject({ code: "INVALID_ATTACK_TYPE" });
    for (const field of ["rawDamage", "cost", "exp"]) {
      for (const value of [0, -1, 0.5, Number.NaN, Infinity]) {
        await expect(
          service.attack({
            userId: fixture.userId,
            roundId,
            attackType: "standard",
            rawDamage: 1,
            jobKey: "swordman",
            cost: 1,
            exp: 1,
            [field]: value,
          })
        ).rejects.toMatchObject({
          code: `INVALID_${field === "rawDamage" ? "RAW_DAMAGE" : field.toUpperCase()}`,
        });
      }
    }
    // cost/exp stay JS-safe integers; rawDamage is BIGINT, so a value past
    // MAX_SAFE_INTEGER must arrive as an exact decimal string, never as a float.
    for (const field of ["cost", "exp"]) {
      await expect(
        service.attack({
          userId: fixture.userId,
          roundId,
          attackType: "standard",
          rawDamage: 1,
          jobKey: "swordman",
          cost: 1,
          exp: 1,
          [field]: Number.MAX_SAFE_INTEGER + 1,
        })
      ).rejects.toMatchObject({ code: `INVALID_${field.toUpperCase()}` });
    }
    for (const rawDamage of [Number.MAX_SAFE_INTEGER + 1, "1e3", "01x", "-5", "1.0", {}, null]) {
      await expect(
        service.attack({
          userId: fixture.userId,
          roundId,
          attackType: "standard",
          rawDamage,
          jobKey: "swordman",
          cost: 1,
          exp: 1,
        })
      ).rejects.toMatchObject({ code: "INVALID_RAW_DAMAGE" });
    }
    for (const jobKey of [undefined, null, "", "ADVENTURER", "priest", 1, {}]) {
      await expect(
        service.attack({
          userId: fixture.userId,
          roundId,
          attackType: "standard",
          rawDamage: 1,
          jobKey,
          cost: 1,
          exp: 1,
        })
      ).rejects.toMatchObject({ code: "INVALID_JOB_KEY" });
    }
    for (const value of [undefined, null, "", "0", 0, -1, 1.5, "abc", "1e3", {}]) {
      await expect(
        service.attack({
          userId: fixture.userId,
          roundId: value,
          attackType: "standard",
          rawDamage: 1,
          jobKey: "swordman",
          cost: 1,
          exp: 1,
        })
      ).rejects.toMatchObject({ code: "INVALID_ROUND_ID" });
    }
    expect(onAttackStarted).not.toHaveBeenCalled();
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
    await expect(WorldBossRound.listCycle(fixture.seasonId, 1)).resolves.toEqual(before.rounds);
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toEqual(before.progress);

    for (const attackType of ["standard", "skill"]) {
      await expect(
        service.attack({
          userId: fixture.userId,
          roundId,
          attackType,
          rawDamage: 1,
          jobKey: "swordman",
          cost: 1,
          exp: 1,
        })
      ).resolves.toMatchObject({ rawDamage: "1", effectiveDamage: "1", cost: 1 });
    }
  });

  test("rejects invalid cycle HP output before any encounter row is written", async () => {
    const fixture = await createBattleFixture({ label: "bad_hp", cycleNo: 0 });
    const service = createBattleService({ clock: () => now });
    for (const [cycleNo, hpWeight] of [
      [0, 1],
      [-1, 1],
      [1.5, 1],
      [1, 0],
      [1, -1],
      [1, Number.NaN],
      [1, Infinity],
      [1, Number.MIN_VALUE],
    ]) {
      expect(() => service.hpForCycle(cycleNo, hpWeight)).toThrow("INVALID_MAX_HP");
    }

    // With the DB check lifted, a zero snapshot weight makes hpForCycle throw; openCycle must
    // then leave no partial cycle behind — the five rows are computed before any insert.
    await mysql.raw(
      "ALTER TABLE `world_boss_season_boss` DROP CHECK `chk_wbsb_hp_weight_positive`"
    );
    try {
      await mysql("world_boss_season_boss")
        .where({ id: fixture.roster[2].id })
        .update({ hp_weight: 0 });
      await expect(
        mysql.transaction(trx => service.openCycle(trx, fixture.seasonId, 1))
      ).rejects.toMatchObject({ code: "INVALID_MAX_HP" });
      expect(await WorldBossRound.currentCycleNo(fixture.seasonId)).toBe(0);
      await expect(WorldBossRound.listCycle(fixture.seasonId, 1)).resolves.toEqual([]);
    } finally {
      await mysql("world_boss_season_boss")
        .where({ id: fixture.roster[2].id })
        .update({ hp_weight: 1 });
      await mysql.raw(
        "ALTER TABLE `world_boss_season_boss` ADD CONSTRAINT `chk_wbsb_hp_weight_positive` CHECK (`hp_weight` > 0)"
      );
    }
  });

  test("openCycle refuses a roster that is not exactly five bosses", async () => {
    const fixture = await createBattleFixture({ label: "short_roster", cycleNo: 0, rosterSize: 4 });
    const service = createBattleService({ clock: () => now });

    await expect(
      mysql.transaction(trx => service.openCycle(trx, fixture.seasonId, 1))
    ).rejects.toMatchObject({ code: "INVALID_SEASON_ROSTER" });
    expect(await WorldBossRound.currentCycleNo(fixture.seasonId)).toBe(0);
  });

  test("subtracts a safe attack from BIGINT HP exactly and returns an exact season total", async () => {
    const fixture = await createBattleFixture({
      label: "exact_hp",
      maxHp: "9007199254740993",
    });
    const target = fixture.rounds[0];
    await mysql("world_boss_contribution").insert({
      season_id: fixture.seasonId,
      round_id: target.id,
      user_id: fixture.userId,
      damage: "9007199254740991",
      cost: 1,
      created_at: new Date(now.getTime() - 1),
      updated_at: new Date(now.getTime() - 1),
    });
    const service = createBattleService({ clock: () => now });

    const result = await service.attack({
      userId: fixture.userId,
      roundId: String(target.id),
      attackType: "standard",
      rawDamage: 1,
      jobKey: "swordman",
      cost: 1,
      exp: 1,
    });

    await expect(mysql("world_boss_round").where({ id: target.id }).first()).resolves.toMatchObject(
      { current_hp: "9007199254740992" }
    );
    expect(result.seasonTotalDamage).toBe("9007199254740992");
    expect(result.effectiveDamage).toBe("1");
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  test("subtracts near-limit damage from BIGINT HP without rounding", async () => {
    const fixture = await createBattleFixture({
      label: "hp_rem",
      maxHp: "9007199254740993",
    });
    const target = fixture.rounds[0];
    const service = createBattleService({ clock: () => now });

    await expect(
      service.attack({
        userId: fixture.userId,
        roundId: String(target.id),
        attackType: "standard",
        rawDamage: Number.MAX_SAFE_INTEGER,
        jobKey: "swordman",
        cost: 1,
        exp: 1,
      })
    ).resolves.toMatchObject({
      seasonTotalDamage: "9007199254740991",
      effectiveDamage: "9007199254740991",
    });

    await expect(mysql("world_boss_round").where({ id: target.id }).first()).resolves.toMatchObject(
      { current_hp: 2 }
    );
  });

  test("treats now equal to end_time as ended without quota, HP, contribution, or EXP writes", async () => {
    const fixture = await createBattleFixture({ label: "ended", endTime: now });
    const service = createBattleService({ clock: () => now });
    const beforeRounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    const beforeProgress = await mysql("minigame_level")
      .where({ user_id: fixture.userDbId })
      .first();

    await expect(
      service.attack({
        userId: fixture.userId,
        roundId: String(fixture.rounds[0].id),
        attackType: "standard",
        rawDamage: 100,
        jobKey: "swordman",
        cost: 10,
        exp: 10,
      })
    ).rejects.toMatchObject({ code: "SEASON_ENDED" });

    await expect(WorldBossRound.listCycle(fixture.seasonId, 1)).resolves.toEqual(beforeRounds);
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toEqual(beforeProgress);
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
  });

  test("samples expiry after acquiring the season lock", async () => {
    const fixture = await createBattleFixture({
      label: "lock_expiry",
      endTime: new Date(now.getTime() + 1),
    });
    let clockCall = 0;
    const service = createBattleService({
      clock: () => {
        clockCall += 1;
        return new Date(now.getTime() + 1);
      },
    });

    await expect(
      service.attack({
        userId: fixture.userId,
        roundId: String(fixture.rounds[0].id),
        attackType: "standard",
        rawDamage: 1,
        jobKey: "swordman",
        cost: 1,
        exp: 1,
      })
    ).rejects.toMatchObject({ code: "SEASON_ENDED" });
    expect(clockCall).toBe(1);
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
  });

  test("forced EXP hook failure rolls back contribution, HP, the new cycle, and EXP", async () => {
    const fixture = await createBattleFixture({
      label: "rollback",
      maxHp: 5,
      currentHps: [0, 0, 0, 0, 5],
    });
    const beforeRounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    const forcedError = new Error("forced exp failure");
    const service = createBattleService({
      clock: () => now,
      hooks: { beforeExpUpdate: jest.fn().mockRejectedValue(forcedError) },
    });

    await expect(
      service.attack({
        userId: fixture.userId,
        roundId: String(fixture.rounds[4].id),
        attackType: "skill",
        rawDamage: 10,
        jobKey: "swordman",
        cost: 10,
        exp: 5,
      })
    ).rejects.toBe(forcedError);

    await expect(WorldBossRound.listCycle(fixture.seasonId, 1)).resolves.toEqual(beforeRounds);
    expect(await WorldBossRound.currentCycleNo(fixture.seasonId)).toBe(1);
    await expect(WorldBossRound.listCycle(fixture.seasonId, 2)).resolves.toEqual([]);
    expect(await mysql("world_boss_contribution").where({ season_id: fixture.seasonId })).toEqual(
      []
    );
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toMatchObject({ level: 1, exp: 0 });
  });

  test("two first attacks create one progress row and update it through the serialized transaction", async () => {
    const userId = ownedUserId("new_player");
    const fixture = await createBattleFixture({ label: "new_player", userId, progress: null });
    const service = createBattleService({ clock: () => now });
    const first = service.attack({
      userId,
      roundId: String(fixture.rounds[0].id),
      attackType: "standard",
      rawDamage: 1,
      jobKey: "swordman",
      cost: 1,
      exp: 1,
    });
    const second = service.attack({
      userId,
      roundId: String(fixture.rounds[1].id),
      attackType: "skill",
      rawDamage: 1,
      jobKey: "swordman",
      cost: 1,
      exp: 1,
    });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    const progressRows = await mysql("minigame_level").where({ user_id: fixture.userDbId });
    expect(progressRows).toHaveLength(1);
    expect(progressRows[0]).toMatchObject({ level: 1, exp: 2 });
  });

  test("uses a half-open Taipei civil day independent of the MySQL session timezone", async () => {
    const fixture = await createBattleFixture({ label: "day_range" });
    const roundId = fixture.rounds[0].id;
    const service = createBattleService({ clock: () => now });
    const startUtc = new Date("2026-07-19T16:00:00.000Z");
    const endUtc = new Date("2026-07-20T16:00:00.000Z");
    expect(service.taipeiDayRange(new Date("2026-07-20T15:59:59.999Z"))).toEqual({
      startUtc,
      endUtc,
    });
    expect(service.taipeiDayRange(new Date("2026-07-20T16:00:00.000Z"))).toEqual({
      startUtc: endUtc,
      endUtc: new Date("2026-07-21T16:00:00.000Z"),
    });
    for (const invalid of [new Date("invalid"), null, "2026-07-20"]) {
      expect(() => service.taipeiDayRange(invalid)).toThrow("INVALID_DATE");
    }

    await mysql("world_boss_contribution").insert(
      [
        { cost: 10, at: new Date("2026-07-19T15:59:59.000Z") },
        { cost: 20, at: startUtc },
        { cost: 30, at: endUtc },
      ].map(({ cost, at }) => ({
        season_id: fixture.seasonId,
        round_id: roundId,
        user_id: fixture.userId,
        damage: 1,
        cost,
        created_at: at,
        updated_at: at,
      }))
    );

    await expect(service.getRemainingDailyCost(fixture.userId)).resolves.toEqual({
      limit: 100,
      used: 20,
      remaining: 80,
    });
  });

  test("calculates exact multi-level and max-level EXP transitions and persists once in the trx", async () => {
    const fixture = await createBattleFixture({
      label: "exp",
      progress: { level: 1, exp: 100 },
    });
    const service = createBattleService({ clock: () => now });
    const units = [
      { level: 1, max_exp: 0 },
      { level: 2, max_exp: 1000 },
      { level: 3, max_exp: 1000 },
      { level: 4, max_exp: 1000 },
    ];

    expect(service.calculateJobExpTransition({ level: 1, exp: 100 }, 200, units)).toEqual({
      levelUp: false,
      newLevel: 1,
      newExp: 300,
      levelUpCount: 0,
      nextLevelExp: 1000,
    });
    expect(service.calculateJobExpTransition({ level: 1, exp: 900 }, 2200, units)).toEqual({
      levelUp: true,
      newLevel: 4,
      newExp: 100,
      levelUpCount: 3,
      nextLevelExp: null,
    });
    expect(service.calculateJobExpTransition({ level: 4, exp: 500 }, 120, units)).toEqual({
      levelUp: false,
      newLevel: 4,
      newExp: 620,
      levelUpCount: 0,
      nextLevelExp: null,
    });
    expect(service.calculateJobExpTransition({ level: 1, exp: 100 }, 0, units)).toEqual({
      levelUp: false,
      newLevel: 1,
      newExp: 100,
      levelUpCount: 0,
      nextLevelExp: 1000,
    });
    expect(() =>
      service.calculateJobExpTransition({ level: 1, exp: 0 }, 1, [
        { level: 1, max_exp: 0 },
        { level: 2, max_exp: 10 },
        { level: 2, max_exp: 20 },
      ])
    ).toThrow("INVALID_JOB_EXP_DATA");
    expect(() => service.calculateJobExpTransition({ level: 1 }, 1, units)).toThrow(
      "INVALID_JOB_EXP_DATA"
    );
    expect(() =>
      service.calculateJobExpTransition({ level: 1, exp: 0 }, 1, [
        { level: 1, max_exp: 0 },
        { level: 3, max_exp: 10 },
      ])
    ).toThrow("INVALID_JOB_EXP_DATA");

    const updateSpy = jest.spyOn(MinigameLevel, "updateByUserId");
    try {
      await mysql.transaction(async trx => {
        const progress = await MinigameLevel.lockUserAndProgress(
          fixture.userId,
          { level: 1, exp: 0 },
          trx
        );
        const levelResult = await service.applyJobExp({
          userId: fixture.userId,
          progress,
          earnedExp: 200,
          levelUnits: units,
          trx,
        });
        expect(levelResult).toEqual({
          levelUp: false,
          newLevel: 1,
          newExp: 300,
          levelUpCount: 0,
          nextLevelExp: 1000,
        });
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith(fixture.userId, { level: 1, exp: 300 }, trx);
        await expect(
          trx("minigame_level").where({ user_id: fixture.userDbId }).first()
        ).resolves.toMatchObject({ level: 1, exp: 300 });
      });
    } finally {
      updateSpy.mockRestore();
    }
  });

  test("serializes near-limit attacks so exactly one reaches cost 100 and changes HP and EXP", async () => {
    const fixture = await createBattleFixture({ label: "quota", maxHp: 100 });
    await mysql("world_boss_contribution").insert({
      season_id: fixture.seasonId,
      round_id: fixture.rounds[0].id,
      user_id: fixture.userId,
      damage: 1,
      cost: 90,
      created_at: now,
      updated_at: now,
    });
    const service = createBattleService({ clock: () => now });

    const first = service.attack({
      userId: fixture.userId,
      roundId: String(fixture.rounds[0].id),
      attackType: "standard",
      rawDamage: 10,
      jobKey: "swordman",
      cost: 10,
      exp: 5,
    });
    const second = service.attack({
      userId: fixture.userId,
      roundId: String(fixture.rounds[1].id),
      attackType: "skill",
      rawDamage: 10,
      jobKey: "swordman",
      cost: 10,
      exp: 5,
    });
    const settled = await Promise.allSettled([first, second]);

    expect(settled.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.filter(result => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(domainCode(rejected[0].reason)).toBe("DAILY_LIMIT_EXCEEDED");
    await expect(service.getRemainingDailyCost(fixture.userId)).resolves.toEqual({
      limit: 100,
      used: 100,
      remaining: 0,
    });
    const rounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    const damaged = rounds.filter(row => Number(row.current_hp) !== 100);
    expect(damaged).toHaveLength(1);
    expect(Number(damaged[0].current_hp)).toBe(90);
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toMatchObject({ level: 1, exp: 5 });
  });

  // Same-boss case: both players target the one surviving boss. The loser must not
  // double-subtract HP nor open a second cycle. Renamed from "two concurrent final
  // kills" — it only ever exercised one boss, and the genuine two-boss race is the
  // separate test below.
  test("two concurrent lethal attacks on the same last boss open exactly one cycle", async () => {
    const firstUserId = ownedUserId("final_a");
    const fixture = await createBattleFixture({
      label: "final_kill",
      userId: firstUserId,
      maxHp: 10,
      currentHps: [0, 0, 0, 10, 10],
    });
    const secondUserId = ownedUserId("final_b");
    await createUser(secondUserId);

    const firstAtCycleInsert = deferred();
    const releaseFirst = deferred();
    const secondStarted = deferred();
    const firstAfterLock = jest.fn();
    const secondAfterLock = jest.fn();
    const firstService = createBattleService({
      clock: () => now,
      hooks: {
        afterSeasonLock: firstAfterLock,
        beforeCycleInsert: async ({ seasonId, cycleNo }) => {
          expect(seasonId).toBe(fixture.seasonId);
          expect(cycleNo).toBe(2);
          firstAtCycleInsert.resolve();
          await releaseFirst.promise;
        },
      },
    });
    const secondService = createBattleService({
      clock: () => now,
      hooks: {
        onAttackStarted: () => secondStarted.resolve(),
        afterSeasonLock: secondAfterLock,
      },
    });

    // First kills boss 4 — no cycle change; then kills boss 5 and parks inside openCycle.
    await firstService.attack({
      userId: firstUserId,
      roundId: String(fixture.rounds[3].id),
      attackType: "standard",
      rawDamage: 10,
      jobKey: "swordman",
      cost: 1,
      exp: 1,
    });
    const firstAttack = firstService.attack({
      userId: firstUserId,
      roundId: String(fixture.rounds[4].id),
      attackType: "standard",
      rawDamage: 10,
      jobKey: "swordman",
      cost: 1,
      exp: 1,
    });
    await firstAtCycleInsert.promise;
    expect(firstAfterLock).toHaveBeenCalledTimes(2);

    // The second player targets the same last boss while the first still holds the season lock.
    const secondAttack = secondService
      .attack({
        userId: secondUserId,
        roundId: String(fixture.rounds[4].id),
        attackType: "skill",
        rawDamage: 10,
        jobKey: "swordman",
        cost: 1,
        exp: 1,
      })
      .catch(error => error);
    await secondStarted.promise;
    expect(secondAfterLock).not.toHaveBeenCalled();
    releaseFirst.resolve();

    const [firstResult, secondOutcome] = await Promise.all([firstAttack, secondAttack]);
    expect(firstResult).toMatchObject({ cycleAdvanced: true, cycleNo: 2 });
    expect(secondAfterLock).toHaveBeenCalledTimes(1);
    // The loser sees a cleared/stale target, never a second cycle-2 insert.
    expect(domainCode(secondOutcome)).toBe("ROUND_STALE");

    expect(await WorldBossRound.currentCycleNo(fixture.seasonId)).toBe(2);
    const cycleTwo = await WorldBossRound.listCycle(fixture.seasonId, 2);
    expect(cycleTwo).toHaveLength(ROSTER_SIZE);
    const duplicates = await mysql("world_boss_round as round")
      .join("world_boss_season_boss as roster", "round.season_boss_id", "roster.id")
      .where("roster.season_id", fixture.seasonId)
      .select("round.season_boss_id", "round.cycle_no")
      .count({ count: "round.id" })
      .groupBy("round.season_boss_id", "round.cycle_no")
      .havingRaw("COUNT(*) > 1");
    expect(duplicates).toEqual([]);
    // Only the effective kills were credited; the loser wrote nothing.
    const contributions = await mysql("world_boss_contribution")
      .where({ season_id: fixture.seasonId })
      .orderBy("id");
    expect(contributions.map(row => row.user_id)).toEqual([firstUserId, firstUserId]);
  });

  test("two players concurrently killing the last two bosses open exactly one cycle", async () => {
    const fourthKiller = ownedUserId("last_two_a");
    const fifthKiller = ownedUserId("last_two_b");
    // Positions 1-3 already cleared; 4 and 5 each one lethal hit from death.
    const fixture = await createBattleFixture({
      label: "last_two",
      userId: fourthKiller,
      maxHp: 10,
      currentHps: [0, 0, 0, 5, 7],
    });
    await createUser(fifthKiller);
    const fourthRound = fixture.rounds[3];
    const fifthRound = fixture.rounds[4];

    // Both attacks must have an open transaction before either can commit, otherwise
    // this degenerates into two sequential attacks and proves nothing. onAttackStarted
    // runs immediately before mysql.transaction, so a two-party barrier there is the
    // last point both callers can be held at without fighting the season lock itself.
    const bothStarted = barrier(2);
    const service = createBattleService({
      clock: () => now,
      hooks: { onAttackStarted: bothStarted },
    });

    const [fourthResult, fifthResult] = await Promise.all([
      service.attack({
        userId: fourthKiller,
        roundId: String(fourthRound.id),
        attackType: "standard",
        rawDamage: 5,
        jobKey: "swordman",
        cost: 3,
        exp: 1,
      }),
      service.attack({
        userId: fifthKiller,
        roundId: String(fifthRound.id),
        attackType: "skill",
        // Overkill: the effective damage must be boss 5's 7 HP, not the requested 900.
        rawDamage: 900,
        jobKey: "swordman",
        cost: 4,
        exp: 1,
      }),
    ]);

    expect(fourthResult).toMatchObject({
      cleared: true,
      attackedCycleNo: 1,
      rawDamage: "5",
      effectDamage: "0",
      effectiveDamage: "5",
      overkillDamage: "0",
      scoreGained: { direct: "5", assist: "0", relay: "0" },
    });
    expect(fifthResult).toMatchObject({
      cleared: true,
      attackedCycleNo: 1,
      rawDamage: "900",
      effectDamage: "0",
      effectiveDamage: "7",
      overkillDamage: "893",
      // Overkill still scores in full: the ledger and the HP pool are separate books.
      scoreGained: { direct: "900", assist: "0", relay: "0" },
    });

    // Whichever transaction commits second sees all five dead — and only it advances.
    const advanced = [fourthResult, fifthResult].filter(result => result.cycleAdvanced === true);
    expect(advanced).toHaveLength(1);
    expect(advanced[0].cycleNo).toBe(2);
    const notAdvanced = [fourthResult, fifthResult].filter(result => !result.cycleAdvanced);
    expect(notAdvanced).toHaveLength(1);
    expect(notAdvanced[0].cycleNo).toBe(1);

    expect(await WorldBossRound.currentCycleNo(fixture.seasonId)).toBe(2);
    const cycleOne = await WorldBossRound.listCycle(fixture.seasonId, 1);
    expect(cycleOne.every(row => Number(row.current_hp) === 0 && row.cleared_at)).toBe(true);
    const cycleTwo = await WorldBossRound.listCycle(fixture.seasonId, 2);
    expect(cycleTwo).toHaveLength(ROSTER_SIZE);
    expect(cycleTwo.map(row => row.position)).toEqual([1, 2, 3, 4, 5]);
    expect(cycleTwo.every(row => row.cleared_at === null)).toBe(true);
    // A third cycle, or a second copy of cycle 2, is the failure this test exists for.
    const cycleNumbers = await mysql("world_boss_round as round")
      .join("world_boss_season_boss as roster", "round.season_boss_id", "roster.id")
      .where("roster.season_id", fixture.seasonId)
      .select("round.season_boss_id", "round.cycle_no")
      .count({ count: "round.id" })
      .groupBy("round.season_boss_id", "round.cycle_no");
    expect(cycleNumbers).toHaveLength(ROSTER_SIZE * 2);
    expect(cycleNumbers.every(row => Number(row.count) === 1)).toBe(true);

    // Exactly one contribution each, credited to the encounter that was actually hit,
    // and exactly one direct score event each — a double-credited kill is the failure here.
    const rows = await mysql("world_boss_contribution")
      .where({ season_id: fixture.seasonId })
      .orderBy("user_id");
    expect(rows).toHaveLength(2);
    expect(
      rows.map(row => ({
        user_id: row.user_id,
        round_id: Number(row.round_id),
        raw_damage: String(row.raw_damage),
        effect_damage: String(row.effect_damage),
        damage: Number(row.damage),
        cost: row.cost,
      }))
    ).toEqual([
      {
        user_id: fourthKiller,
        round_id: Number(fourthRound.id),
        raw_damage: "5",
        effect_damage: "0",
        damage: 5,
        cost: 3,
      },
      {
        user_id: fifthKiller,
        round_id: Number(fifthRound.id),
        raw_damage: "900",
        effect_damage: "0",
        damage: 7,
        cost: 4,
      },
    ]);
    const events = await listScoreEvents(fixture.seasonId);
    expect(
      events
        .map(row => [row.beneficiary_user_id, row.kind, String(row.points)])
        .sort((left, right) => left[0].localeCompare(right[0]))
    ).toEqual([
      [fourthKiller, "direct", "5"],
      [fifthKiller, "direct", "900"],
    ]);
    // A lethal hit leaves no effect, so nothing unconsumable was created either.
    await expect(listEffects(fixture.seasonId)).resolves.toEqual([]);
  });
});

describe("WorldBossBattleService — effect lifecycle and score events", () => {
  test("an adventurer leaves a banner worth 25% of raw damage and scores only direct", async () => {
    const fixture = await createBattleFixture({ label: "bnew", maxHp: 1000 });
    const target = fixture.rounds[0];
    const service = createBattleService({ clock: () => now });

    const result = await attackWith(service, {
      userId: fixture.userId,
      roundId: target.id,
      rawDamage: 101,
      jobKey: "adventurer",
      cost: 8,
    });

    // floor(101 * 25 / 100) = 25 — the fractional part is dropped, not rounded.
    expect(result).toMatchObject({
      rawDamage: "101",
      effectDamage: "0",
      effectiveDamage: "101",
      overkillDamage: "0",
      consumedEffect: null,
      createdEffect: { type: "banner", value: "25", sourceUserId: fixture.userId },
      scoreGained: { direct: "101", assist: "0", relay: "0" },
    });
    // The banner is pure score: the boss lost the raw damage only.
    await expect(mysql("world_boss_round").where({ id: target.id }).first()).resolves.toMatchObject(
      { current_hp: 899 }
    );
    const [contribution] = await listContributions(fixture.seasonId);
    await expect(ledgerOf(contribution.id)).resolves.toEqual({
      raw_damage: "101",
      effect_damage: "0",
      damage: "101",
      job_key: "adventurer",
      direct_points: "101",
    });
    const [effect] = await listEffects(fixture.seasonId);
    expect(effect).toMatchObject({
      effect_type: "banner",
      value: 25,
      source_user_id: fixture.userId,
      source_contribution_id: contribution.id,
      consumed_by_contribution_id: null,
      round_id: target.id,
    });
    // Creating a banner pays nobody an assist or relay yet.
    const events = await listScoreEvents(fixture.seasonId);
    expect(events.map(row => row.kind)).toEqual(["direct"]);
  });

  test("a creator never consumes their own effect and skips it to the next eligible one", async () => {
    const owner = ownedUserId("self_owner");
    const other = ownedUserId("self_other");
    const fixture = await createBattleFixture({
      label: "self_skip",
      userId: owner,
      maxHp: 100000,
    });
    await createUser(other);
    const target = fixture.rounds[0];
    const service = createBattleService({ clock: () => now });

    // Own banner first (lower id), then someone else's banner.
    const ownEffect = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: owner,
      type: "banner",
      value: 40,
    });
    const otherEffect = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: other,
      type: "banner",
      value: 7,
    });
    expect(Number(ownEffect.id)).toBeLessThan(Number(otherEffect.id));

    const result = await attackWith(service, {
      userId: owner,
      roundId: target.id,
      rawDamage: 200,
      jobKey: "adventurer",
      cost: 8,
    });

    // The proof the exclusion is in SQL and not in JS: the oldest row is skipped rather
    // than blocking, and the next eligible row is consumed in the same hit.
    expect(result).toMatchObject({
      effectDamage: "0",
      consumedEffect: { id: String(otherEffect.id), type: "banner", value: "7" },
      scoreGained: { direct: "200", assist: "7", relay: "7" },
    });
    const rows = await listEffects(fixture.seasonId);
    const byId = new Map(rows.map(row => [String(row.id), row]));
    expect(byId.get(String(ownEffect.id)).consumed_by_contribution_id).toBeNull();
    expect(byId.get(String(otherEffect.id)).consumed_by_contribution_id).not.toBeNull();
  });

  test("a creator attacking again neither consumes nor stacks on their own banner", async () => {
    const fixture = await createBattleFixture({ label: "self_only", maxHp: 100000 });
    const target = fixture.rounds[0];
    const service = createBattleService({ clock: () => now });

    await attackWith(service, {
      userId: fixture.userId,
      roundId: target.id,
      rawDamage: 100,
      jobKey: "adventurer",
      cost: 8,
    });
    const second = await attackWith(service, {
      userId: fixture.userId,
      roundId: target.id,
      rawDamage: 100,
      jobKey: "adventurer",
      cost: 8,
    });

    expect(second).toMatchObject({ effectDamage: "0", consumedEffect: null });
    const rows = await listEffects(fixture.seasonId);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.consumed_by_contribution_id === null)).toBe(true);
    // Two hits, two quota charges, no assist/relay ever paid to the same player.
    await expect(service.getRemainingDailyCost(fixture.userId)).resolves.toMatchObject({
      used: 16,
    });
    const events = await listScoreEvents(fixture.seasonId);
    expect(events.map(row => row.kind)).toEqual(["direct", "direct"]);
  });

  test("a banner survives with no TTL and pays assist to the creator and relay to the taker", async () => {
    const creator = ownedUserId("banner_creator");
    const taker = ownedUserId("banner_taker");
    const fixture = await createBattleFixture({
      label: "banner_relay",
      userId: creator,
      maxHp: 100000,
    });
    await createUser(taker);
    const target = fixture.rounds[0];
    // Injectable clock: hours pass between the two hits, and nothing expires.
    let currentTime = now;
    const service = createBattleService({ clock: () => currentTime });

    await attackWith(service, {
      userId: creator,
      roundId: target.id,
      rawDamage: 400,
      jobKey: "adventurer",
      cost: 8,
    });
    const hpAfterCreate = Number(
      (await mysql("world_boss_round").where({ id: target.id }).first()).current_hp
    );
    currentTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    const result = await attackWith(service, {
      userId: taker,
      roundId: target.id,
      rawDamage: 300,
      jobKey: "swordman",
      cost: 10,
    });

    expect(result).toMatchObject({
      rawDamage: "300",
      // A banner adds score, never HP: the taker's own contribution stays at 300.
      effectDamage: "0",
      effectiveDamage: "300",
      consumedEffect: { type: "banner", value: "100", sourceUserId: creator },
      createdEffect: null,
      scoreGained: { direct: "300", assist: "100", relay: "100" },
      seasonTotalScore: "400",
    });
    await expect(mysql("world_boss_round").where({ id: target.id }).first()).resolves.toMatchObject(
      { current_hp: hpAfterCreate - 300 }
    );
    const takerContribution = (await listContributions(fixture.seasonId)).find(
      row => row.user_id === taker
    );
    await expect(ledgerOf(takerContribution.id)).resolves.toEqual({
      raw_damage: "300",
      effect_damage: "0",
      damage: "300",
      job_key: "swordman",
      direct_points: "300",
    });
    const events = await listScoreEvents(fixture.seasonId);
    expect(events.map(row => [row.beneficiary_user_id, row.kind, String(row.points)])).toEqual([
      [creator, "direct", "400"],
      [taker, "direct", "300"],
      [creator, "assist", "100"],
      [taker, "relay", "100"],
    ]);
    // One attack still costs exactly one quota charge, effect or not.
    await expect(service.getRemainingDailyCost(taker)).resolves.toMatchObject({ used: 10 });
  });

  test("a mage leaves a seal worth 50% of raw damage and still scores only its own raw", async () => {
    const fixture = await createBattleFixture({ label: "seal_create", maxHp: 100000 });
    const target = fixture.rounds[0];
    const service = createBattleService({ clock: () => now });

    const result = await attackWith(service, {
      userId: fixture.userId,
      roundId: target.id,
      rawDamage: 501,
      jobKey: "mage",
      cost: 7,
    });

    // floor(501 * 50 / 100) = 250.
    expect(result).toMatchObject({
      rawDamage: "501",
      effectDamage: "0",
      effectiveDamage: "501",
      createdEffect: { type: "seal", value: "250", sourceUserId: fixture.userId },
      scoreGained: { direct: "501", assist: "0", relay: "0" },
    });
    const [effect] = await listEffects(fixture.seasonId);
    expect(effect).toMatchObject({ effect_type: "seal", value: 250 });
    await expect(mysql("world_boss_round").where({ id: target.id }).first()).resolves.toMatchObject(
      { current_hp: 100000 - 501 }
    );
  });

  test("a seal detonates into HP, pays the creator an assist, and pays the taker no relay", async () => {
    const creator = ownedUserId("seal_creator");
    const taker = ownedUserId("seal_taker");
    const fixture = await createBattleFixture({
      label: "seal_relay",
      userId: creator,
      maxHp: 100000,
    });
    await createUser(taker);
    const target = fixture.rounds[0];
    const service = createBattleService({ clock: () => now });
    const seal = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: creator,
      type: "seal",
      value: 250,
    });

    const result = await attackWith(service, {
      userId: taker,
      roundId: target.id,
      rawDamage: 300,
      jobKey: "swordman",
      cost: 10,
    });

    expect(result).toMatchObject({
      rawDamage: "300",
      effectDamage: "250",
      effectiveDamage: "550",
      overkillDamage: "0",
      cleared: false,
      consumedEffect: { id: String(seal.id), type: "seal", value: "250" },
      // The taker's own score is their raw damage only — the seal already paid them in HP.
      scoreGained: { direct: "300", assist: "250", relay: "0" },
    });
    await expect(mysql("world_boss_round").where({ id: target.id }).first()).resolves.toMatchObject(
      { current_hp: 100000 - 550 }
    );
    const takerContribution = (await listContributions(fixture.seasonId)).find(
      row => row.user_id === taker
    );
    await expect(ledgerOf(takerContribution.id)).resolves.toEqual({
      raw_damage: "300",
      effect_damage: "250",
      damage: "550",
      job_key: "swordman",
      direct_points: "300",
    });
    const events = await mysql("world_boss_score_event")
      .where({ contribution_id: takerContribution.id })
      .orderBy("id");
    expect(events.map(row => [row.beneficiary_user_id, row.kind, String(row.points)])).toEqual([
      [taker, "direct", "300"],
      [creator, "assist", "250"],
    ]);
    await expect(service.getRemainingDailyCost(taker)).resolves.toMatchObject({ used: 10 });
  });

  test("a seal detonation that overkills still scores the full raw and assist", async () => {
    const creator = ownedUserId("seal_ok_creator");
    const taker = ownedUserId("seal_ok_taker");
    const fixture = await createBattleFixture({
      label: "seal_overkill",
      maxHp: 100,
      userId: creator,
    });
    await createUser(taker);
    const target = fixture.rounds[0];
    const service = createBattleService({ clock: () => now });
    await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: creator,
      type: "seal",
      value: 50,
    });

    // HP 100, raw 80, seal 50 → requested 130, applied 100, overkill 30.
    const result = await attackWith(service, {
      userId: taker,
      roundId: target.id,
      rawDamage: 80,
      jobKey: "mage",
      cost: 7,
    });

    expect(result).toMatchObject({
      rawDamage: "80",
      effectDamage: "50",
      effectiveDamage: "100",
      overkillDamage: "30",
      cleared: true,
      // The cap belongs to the HP ledger only: direct is still the full 80.
      scoreGained: { direct: "80", assist: "50", relay: "0" },
      // The killing blow leaves no effect, even for a mage.
      createdEffect: null,
    });
    const takerContribution = (await listContributions(fixture.seasonId)).find(
      row => row.user_id === taker
    );
    await expect(ledgerOf(takerContribution.id)).resolves.toEqual({
      raw_damage: "80",
      effect_damage: "50",
      damage: "100",
      job_key: "mage",
      direct_points: "80",
    });
    const rounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    expect(Number(rounds[0].current_hp)).toBe(0);
    expect(rounds[0].cleared_at).toBeInstanceOf(Date);
    // Exactly one effect ever existed on this round, and it is now consumed.
    const rows = await listEffects(fixture.seasonId);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].consumed_by_contribution_id)).toBe(String(takerContribution.id));
  });

  test("an unconsumed effect on a cleared round is stranded, not carried into the next cycle", async () => {
    const creator = ownedUserId("stranded_creator");
    const killer = ownedUserId("stranded_killer");
    const fixture = await createBattleFixture({
      label: "stranded",
      userId: creator,
      maxHp: 10,
      // Four already dead, so the fifth kill also opens cycle 2.
      currentHps: [0, 0, 0, 0, 10],
    });
    await createUser(killer);
    const target = fixture.rounds[4];
    const service = createBattleService({ clock: () => now });
    // Two effects, but one attack consumes at most one — the second is stranded by the kill.
    await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: creator,
      type: "banner",
      value: 500,
    });
    const stranded = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: creator,
      type: "seal",
      value: 999,
    });

    const kill = await attackWith(service, {
      userId: killer,
      roundId: target.id,
      rawDamage: 10,
      jobKey: "swordman",
      cost: 1,
    });
    expect(kill.cycleAdvanced).toBe(true);
    expect(kill.consumedEffect).toMatchObject({ type: "banner", value: "500" });

    // The cleared round rejects every further attack, so the stranded seal can never detonate.
    await expect(
      attackWith(service, {
        userId: killer,
        roundId: target.id,
        rawDamage: 10,
        jobKey: "swordman",
        cost: 1,
      })
    ).rejects.toMatchObject({ code: "ROUND_STALE" });

    // A cycle-2 attack looks up effects by round id, so it sees none of cycle 1's.
    const cycleTwo = await WorldBossRound.listCycle(fixture.seasonId, 2);
    const next = await attackWith(service, {
      userId: killer,
      roundId: cycleTwo[0].id,
      rawDamage: 10,
      jobKey: "swordman",
      cost: 1,
    });
    expect(next).toMatchObject({ effectDamage: "0", consumedEffect: null });
    await expect(
      mysql("world_boss_round_effect").where({ id: stranded.id }).first()
    ).resolves.toMatchObject({ consumed_by_contribution_id: null });
  });

  test("consumes eligible effects strictly oldest first", async () => {
    const first = ownedUserId("fifo_first");
    const second = ownedUserId("fifo_second");
    const taker = ownedUserId("fifo_taker");
    const fixture = await createBattleFixture({ label: "fifo", userId: first, maxHp: 100000 });
    await createUser(second);
    await createUser(taker);
    const target = fixture.rounds[0];
    const service = createBattleService({ clock: () => now });
    const older = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: first,
      type: "banner",
      value: 11,
    });
    const newer = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: second,
      type: "banner",
      value: 22,
    });

    const firstTake = await attackWith(service, {
      userId: taker,
      roundId: target.id,
      rawDamage: 50,
      jobKey: "swordman",
      cost: 1,
    });
    const secondTake = await attackWith(service, {
      userId: taker,
      roundId: target.id,
      rawDamage: 50,
      jobKey: "swordman",
      cost: 1,
    });

    // Strict FIFO by id, and at most one effect per attack.
    expect(firstTake.consumedEffect).toMatchObject({ id: String(older.id), value: "11" });
    expect(secondTake.consumedEffect).toMatchObject({ id: String(newer.id), value: "22" });
    expect(firstTake.scoreGained).toEqual({ direct: "50", assist: "11", relay: "11" });
    expect(secondTake.scoreGained).toEqual({ direct: "50", assist: "22", relay: "22" });
    await expect(
      attackWith(service, {
        userId: taker,
        roundId: target.id,
        rawDamage: 50,
        jobKey: "swordman",
        cost: 1,
      })
    ).resolves.toMatchObject({ consumedEffect: null, effectDamage: "0" });
  });

  test("a forced failure rolls back the consumption, the score events, and the new effect", async () => {
    const creator = ownedUserId("rb_creator");
    const taker = ownedUserId("rb_taker");
    const fixture = await createBattleFixture({
      label: "effect_rollback",
      userId: creator,
      maxHp: 1000,
    });
    await createUser(taker);
    const target = fixture.rounds[0];
    const seal = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: creator,
      type: "seal",
      value: 90,
    });
    const beforeRounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    const beforeContributions = await listContributions(fixture.seasonId);
    const beforeCost = await createBattleService({ clock: () => now }).getRemainingDailyCost(taker);
    const forcedError = new Error("forced exp failure");
    const service = createBattleService({
      clock: () => now,
      hooks: { beforeExpUpdate: jest.fn().mockRejectedValue(forcedError) },
    });

    await expect(
      attackWith(service, {
        userId: taker,
        roundId: target.id,
        // A mage so the rolled-back transaction also had a new effect to create.
        rawDamage: 200,
        jobKey: "mage",
        cost: 7,
        exp: 5,
      })
    ).rejects.toBe(forcedError);

    await expect(WorldBossRound.listCycle(fixture.seasonId, 1)).resolves.toEqual(beforeRounds);
    await expect(listContributions(fixture.seasonId)).resolves.toEqual(beforeContributions);
    // The consumption is back to NULL and no second effect was left behind.
    const rows = await listEffects(fixture.seasonId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: seal.id, consumed_by_contribution_id: null });
    await expect(listScoreEvents(fixture.seasonId)).resolves.toEqual([]);
    await expect(service.getRemainingDailyCost(taker)).resolves.toEqual(beforeCost);
    await expect(
      mysql("minigame_level").where({ user_id: fixture.userDbId }).first()
    ).resolves.toMatchObject({ level: 1, exp: 0 });
  });

  test("a double consume of the same effect aborts the whole attack", async () => {
    const creator = ownedUserId("dup_creator");
    const taker = ownedUserId("dup_taker");
    const fixture = await createBattleFixture({
      label: "dup_consume",
      userId: creator,
      maxHp: 1000,
    });
    await createUser(taker);
    const target = fixture.rounds[0];
    const seal = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: target.id,
      userId: creator,
      type: "seal",
      value: 60,
    });
    const beforeRounds = await WorldBossRound.listCycle(fixture.seasonId, 1);
    const beforeContributions = await listContributions(fixture.seasonId);

    // Simulate the row already being consumed between the FOR UPDATE read and the UPDATE.
    // The conditional UPDATE must then affect 0 rows and take the transaction down with it.
    const service = createBattleService({
      clock: () => now,
      hooks: {
        afterSeasonLock: async ({ trx }) => {
          await trx("world_boss_round_effect")
            .where({ id: seal.id })
            .update({ consumed_by_contribution_id: seal.sourceContributionId });
        },
      },
    });
    const consumeSpy = jest
      .spyOn(WorldBossRoundEffect, "findConsumableForUpdate")
      .mockResolvedValue({
        id: seal.id,
        effect_type: "seal",
        value: "60",
        source_user_id: creator,
      });

    try {
      await expect(
        attackWith(service, {
          userId: taker,
          roundId: target.id,
          rawDamage: 100,
          jobKey: "swordman",
          cost: 10,
        })
      ).rejects.toMatchObject({ code: "EFFECT_ALREADY_CONSUMED" });
    } finally {
      consumeSpy.mockRestore();
    }

    await expect(WorldBossRound.listCycle(fixture.seasonId, 1)).resolves.toEqual(beforeRounds);
    await expect(listContributions(fixture.seasonId)).resolves.toEqual(beforeContributions);
    await expect(listScoreEvents(fixture.seasonId)).resolves.toEqual([]);
    await expect(
      mysql("world_boss_round_effect").where({ id: seal.id }).first()
    ).resolves.toMatchObject({ consumed_by_contribution_id: null });
    await expect(service.getRemainingDailyCost(taker)).resolves.toMatchObject({ used: 0 });
  });

  test("concurrent lethal hits advance the cycle once and consume each effect once", async () => {
    const creator = ownedUserId("conc_creator");
    const fourthKiller = ownedUserId("conc_a");
    const fifthKiller = ownedUserId("conc_b");
    const fixture = await createBattleFixture({
      label: "conc_effect",
      userId: creator,
      maxHp: 10,
      currentHps: [0, 0, 0, 5, 7],
    });
    await createUser(fourthKiller);
    await createUser(fifthKiller);
    const fourthRound = fixture.rounds[3];
    const fifthRound = fixture.rounds[4];
    const fourthSeal = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: fourthRound.id,
      userId: creator,
      type: "banner",
      value: 3,
    });
    const fifthSeal = await seedEffect({
      seasonId: fixture.seasonId,
      roundId: fifthRound.id,
      userId: creator,
      type: "banner",
      value: 4,
    });

    const bothStarted = barrier(2);
    const service = createBattleService({
      clock: () => now,
      hooks: { onAttackStarted: bothStarted },
    });

    const [fourthResult, fifthResult] = await Promise.all([
      attackWith(service, {
        userId: fourthKiller,
        roundId: fourthRound.id,
        rawDamage: 5,
        jobKey: "adventurer",
        cost: 3,
      }),
      attackWith(service, {
        userId: fifthKiller,
        roundId: fifthRound.id,
        rawDamage: 7,
        jobKey: "mage",
        cost: 4,
      }),
    ]);

    expect(
      [fourthResult, fifthResult].filter(result => result.cycleAdvanced === true)
    ).toHaveLength(1);
    expect(await WorldBossRound.currentCycleNo(fixture.seasonId)).toBe(2);
    const cycleCounts = await mysql("world_boss_round as round")
      .join("world_boss_season_boss as roster", "round.season_boss_id", "roster.id")
      .where("roster.season_id", fixture.seasonId)
      .select("round.season_boss_id", "round.cycle_no")
      .count({ count: "round.id" })
      .groupBy("round.season_boss_id", "round.cycle_no");
    expect(cycleCounts).toHaveLength(ROSTER_SIZE * 2);
    expect(cycleCounts.every(row => Number(row.count) === 1)).toBe(true);

    // Each attacker wrote exactly one direct event; each banner was consumed exactly once.
    const events = await listScoreEvents(fixture.seasonId);
    const directs = events.filter(row => row.kind === "direct");
    expect(directs.map(row => row.beneficiary_user_id).sort()).toEqual(
      [fourthKiller, fifthKiller].sort()
    );
    const consumers = (await listEffects(fixture.seasonId)).map(row => [
      String(row.id),
      String(row.consumed_by_contribution_id),
    ]);
    expect(new Set(consumers.map(pair => pair[1])).size).toBe(consumers.length);
    expect(consumers.map(pair => pair[0]).sort()).toEqual(
      [String(fourthSeal.id), String(fifthSeal.id)].sort()
    );
    // Both bosses died, so neither killer left a new effect behind.
    expect(fourthResult.createdEffect).toBeNull();
    expect(fifthResult.createdEffect).toBeNull();
  });
});
