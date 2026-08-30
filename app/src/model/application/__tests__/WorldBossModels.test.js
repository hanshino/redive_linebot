require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
const {
  PREFIX,
  ACTIVE_SLOT,
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
  cleanupByPrefix,
} = require("../../../__tests__/helpers/worldBossFixture");
const testDatabase = createWorldBossTestDatabase("models");
const mysql = testDatabase.mysql;
jest.mock("../../../util/mysql", () => mysql);
const WorldBossSeason = require("../WorldBossSeason");
const WorldBossSeasonBoss = require("../WorldBossSeasonBoss");
const WorldBossRound = require("../WorldBossRound");
const WorldBossContribution = require("../WorldBossContribution");
const WorldBossSeasonReward = require("../WorldBossSeasonReward");
const WorldBossRoundEffect = require("../WorldBossRoundEffect");
const WorldBossScoreEvent = require("../WorldBossScoreEvent");

describe("World Boss v2 models", () => {
  const prefix = `${PREFIX}models_`;
  const sentinelName = `${PREFIX}sentinel_models_preserve`;
  const activeSlot = ACTIVE_SLOT;
  const ROSTER_SIZE = WorldBossSeasonBoss.ROSTER_SIZE;
  let sentinelSnapshot;

  async function createSeason({
    name,
    status = "draft",
    active_slot = null,
    end_time = new Date("2030-01-01T00:00:00.000Z"),
    settled_at = null,
  } = {}) {
    const [id] = await mysql("world_boss_season").insert({
      name: name || `${prefix}season`,
      status,
      active_slot,
      start_time: status === "active" ? new Date("2026-01-01T00:00:00.000Z") : null,
      end_time,
      settled_at,
    });
    return id;
  }

  async function createBosses(label, count = ROSTER_SIZE) {
    const ids = [];
    for (let index = 0; index < count; index += 1) {
      const [id] = await mysql("world_boss").insert({
        name: `${prefix}${label}_${index + 1}`,
        hp_weight: 1 + index / 10,
        description: `${prefix}${label}_desc_${index + 1}`,
      });
      ids.push(id);
    }
    return ids;
  }

  async function createRoster(seasonId, bossIds) {
    return mysql.transaction(async trx => {
      await WorldBossSeasonBoss.replaceForSeason(trx, seasonId, bossIds);
      return WorldBossSeasonBoss.listBySeason(seasonId, trx);
    });
  }

  async function createCycle(seasonId, roster, cycleNo, hpByPosition = {}) {
    await mysql("world_boss_round").insert(
      roster.map(entry => {
        const currentHp = hpByPosition[entry.position] ?? 100;
        return {
          season_boss_id: entry.id,
          cycle_no: cycleNo,
          max_hp: 100,
          current_hp: currentHp,
          cleared_at: Number(currentHp) === 0 ? new Date("2026-07-20T00:00:00.000Z") : null,
        };
      })
    );
    return WorldBossRound.listCycle(seasonId, cycleNo);
  }

  beforeAll(async () => {
    await expect(testDatabase.setup()).resolves.toMatch(/^Princess_wbtest_models_/);
    await cleanupByPrefix(mysql, prefix);
    await mysql("world_boss_season").where({ name: sentinelName }).del();
    await mysql("world_boss_season").insert({
      name: sentinelName,
      status: "draft",
      announcement: "preserve this sentinel",
      end_time: new Date("2030-01-01T00:00:00.000Z"),
    });
    sentinelSnapshot = await mysql("world_boss_season").where({ name: sentinelName }).first();
  }, SETUP_TIMEOUT_MS);

  beforeEach(async () => {
    await cleanupByPrefix(mysql, prefix);
    await expect(mysql("world_boss_season").where({ name: sentinelName }).first()).resolves.toEqual(
      sentinelSnapshot
    );
  });

  afterEach(async () => {
    await cleanupByPrefix(mysql, prefix);
    await expect(mysql("world_boss_season").where({ name: sentinelName }).first()).resolves.toEqual(
      sentinelSnapshot
    );
  });

  afterAll(() => testDatabase.teardown());

  test("finds and locks the active season", async () => {
    const seasonId = await createSeason({
      name: `${prefix}active-season`,
      status: "active",
      active_slot: activeSlot,
    });

    const active = await WorldBossSeason.findActive();
    expect(Number(active.id)).toBe(seasonId);

    await mysql.transaction(async trx => {
      const lockedSeason = await WorldBossSeason.findActiveForUpdate(activeSlot, trx);
      const lockedById = await WorldBossSeason.findForUpdate(seasonId, trx);
      expect(Number(lockedSeason.id)).toBe(seasonId);
      expect(Number(lockedById.id)).toBe(seasonId);
    });
  });

  test("finds active seasons that are settleable at an inclusive end boundary", async () => {
    const endTime = new Date("2026-07-20T00:00:00.000Z");
    const seasonId = await createSeason({
      name: `${prefix}settleable`,
      status: "active",
      active_slot: activeSlot,
      end_time: endTime,
    });

    const settleable = await WorldBossSeason.findSettleable(endTime, activeSlot);
    expect(settleable.map(row => Number(row.id))).toContain(seasonId);
  });

  test("roster snapshots the catalog at positions 1..5 and replaces atomically", async () => {
    const seasonId = await createSeason({ name: `${prefix}roster-season` });
    const bossIds = await createBosses("roster");

    const roster = await createRoster(seasonId, bossIds);
    expect(roster.map(row => row.position)).toEqual([1, 2, 3, 4, 5]);
    expect(roster.map(row => Number(row.world_boss_id))).toEqual(bossIds);
    expect(roster.map(row => row.name)).toEqual(bossIds.map((_, i) => `${prefix}roster_${i + 1}`));
    expect(roster.map(row => row.hp_weight)).toEqual(["1.000", "1.100", "1.200", "1.300", "1.400"]);

    // Replacing rewrites positions from the new order and leaves no stale rows behind.
    const reordered = [...bossIds].reverse();
    const replaced = await createRoster(seasonId, reordered);
    expect(replaced).toHaveLength(ROSTER_SIZE);
    expect(replaced.map(row => Number(row.world_boss_id))).toEqual(reordered);

    await expect(
      mysql("world_boss_season_boss").where({ season_id: seasonId })
    ).resolves.toHaveLength(ROSTER_SIZE);
  });

  test("refreshSnapshot re-freezes display and HP weight from the live catalog", async () => {
    const seasonId = await createSeason({ name: `${prefix}refresh-season` });
    const bossIds = await createBosses("refresh");
    await createRoster(seasonId, bossIds);

    await mysql("world_boss")
      .where({ id: bossIds[0] })
      .update({ name: `${prefix}refresh_renamed`, hp_weight: 3.5, description: "renamed" });

    const refreshed = await mysql.transaction(trx =>
      WorldBossSeasonBoss.refreshSnapshot(trx, seasonId)
    );
    expect(refreshed[0]).toMatchObject({
      position: 1,
      name: `${prefix}refresh_renamed`,
      hp_weight: "3.500",
      description: "renamed",
    });

    // Later catalog edits no longer leak into the frozen season roster.
    await mysql("world_boss")
      .where({ id: bossIds[0] })
      .update({ name: `${prefix}refresh_after` });
    const frozen = await WorldBossSeasonBoss.listBySeason(seasonId);
    expect(frozen[0].name).toBe(`${prefix}refresh_renamed`);
  });

  test("derives the current cycle from MAX(cycle_no) and joins position from the roster", async () => {
    const seasonId = await createSeason({
      name: `${prefix}cycle-season`,
      status: "active",
      active_slot: activeSlot,
    });
    const roster = await createRoster(seasonId, await createBosses("cycle"));

    expect(await WorldBossRound.currentCycleNo(seasonId)).toBe(0);
    await expect(WorldBossRound.listCurrentCycle(seasonId)).resolves.toEqual({
      cycleNo: 0,
      rounds: [],
    });

    await createCycle(seasonId, roster, 1, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    expect(await WorldBossRound.currentCycleNo(seasonId)).toBe(1);
    await createCycle(seasonId, roster, 2);
    expect(await WorldBossRound.currentCycleNo(seasonId)).toBe(2);

    const current = await WorldBossRound.listCurrentCycle(seasonId);
    expect(current.cycleNo).toBe(2);
    expect(current.rounds).toHaveLength(ROSTER_SIZE);
    expect(current.rounds.map(row => row.position)).toEqual([1, 2, 3, 4, 5]);
    expect(current.rounds.map(row => Number(row.season_id))).toEqual(
      new Array(ROSTER_SIZE).fill(seasonId)
    );
    expect(current.rounds.every(row => row.cleared_at === null)).toBe(true);

    const first = await WorldBossRound.listCycle(seasonId, 1);
    expect(first.every(row => Number(row.current_hp) === 0 && row.cleared_at)).toBe(true);
  });

  test("resolves a round id only within its own season and locks it", async () => {
    const seasonId = await createSeason({
      name: `${prefix}lookup-season`,
      status: "active",
      active_slot: activeSlot,
    });
    const otherSeasonId = await createSeason({ name: `${prefix}lookup-other` });
    const roster = await createRoster(seasonId, await createBosses("lookup"));
    const rounds = await createCycle(seasonId, roster, 1);

    await mysql.transaction(async trx => {
      const found = await WorldBossRound.findByIdForUpdate(rounds[2].id, seasonId, trx);
      expect(found).toMatchObject({ position: 3, cycle_no: 1 });
      // A round id from a different season must not resolve — that is the stale-target guard.
      await expect(
        WorldBossRound.findByIdForUpdate(rounds[2].id, otherSeasonId, trx)
      ).resolves.toBeUndefined();
      await expect(
        WorldBossRound.findByIdForUpdate(999999999, seasonId, trx)
      ).resolves.toBeUndefined();
    });
  });

  test("rejects a duplicate cycle row for the same season boss", async () => {
    const seasonId = await createSeason({ name: `${prefix}unique-season` });
    const roster = await createRoster(seasonId, await createBosses("unique"));
    await createCycle(seasonId, roster, 1);

    await expect(
      mysql("world_boss_round").insert({
        season_boss_id: roster[0].id,
        cycle_no: 1,
        max_hp: 100,
        current_hp: 100,
      })
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
  });

  test("aggregates season contribution damage per user without ranking it", async () => {
    const seasonId = await createSeason({ name: `${prefix}ranking-season` });
    const roster = await createRoster(seasonId, await createBosses("ranking"));
    const [round] = await createCycle(seasonId, roster, 1);
    const roundId = round.id;
    await mysql("world_boss_contribution").insert(
      [
        { user_id: `${prefix}u-b`, damage: 500, cost: 10 },
        { user_id: `${prefix}u-a`, damage: 300, cost: 20 },
        { user_id: `${prefix}u-a`, damage: 200, cost: 20 },
        { user_id: `${prefix}u-c`, damage: 300, cost: 30 },
      ].map(row => ({ season_id: seasonId, round_id: roundId, ...row }))
    );

    // Damage is a private statistic now — the model must not hand out a damage leaderboard.
    expect(WorldBossContribution.seasonRanking).toBeUndefined();
    expect(WorldBossContribution.seasonRankingAll).toBeUndefined();
    expect(WorldBossContribution.withCompetitionRank).toBeUndefined();

    await expect(WorldBossContribution.sumSeasonDamage(seasonId, `${prefix}u-a`)).resolves.toBe(
      "500"
    );
    await expect(WorldBossContribution.sumSeasonDamage(seasonId, `${prefix}nobody`)).resolves.toBe(
      "0"
    );
    const byUser = await WorldBossContribution.seasonDamageByUser(seasonId);
    expect([...byUser.entries()].sort()).toEqual([
      [`${prefix}u-a`, "500"],
      [`${prefix}u-b`, "500"],
      [`${prefix}u-c`, "300"],
    ]);
    await expect(WorldBossContribution.seasonDamageByUser(999999999)).resolves.toEqual(new Map());
  });

  test("preserves exact aggregate damage for user totals beyond Number.MAX_SAFE_INTEGER", async () => {
    const seasonId = await createSeason({ name: `${prefix}exact-ranking-season` });
    const roster = await createRoster(seasonId, await createBosses("exact"));
    const [round] = await createCycle(seasonId, roster, 1);
    const roundId = round.id;
    const half = "4503599627370496";
    await mysql("world_boss_contribution").insert(
      [
        { user_id: `${prefix}exact-a`, damage: half },
        { user_id: `${prefix}exact-a`, damage: "4503599627370497" },
        { user_id: `${prefix}exact-b`, damage: half },
        { user_id: `${prefix}exact-b`, damage: half },
      ].map(row => ({ season_id: seasonId, round_id: roundId, cost: 1, ...row }))
    );

    await expect(WorldBossContribution.sumSeasonDamage(seasonId, `${prefix}exact-a`)).resolves.toBe(
      "9007199254740993"
    );
    await expect(WorldBossContribution.seasonDamageByUser(seasonId)).resolves.toEqual(
      new Map([
        [`${prefix}exact-a`, "9007199254740993"],
        [`${prefix}exact-b`, "9007199254740992"],
      ])
    );
  });

  test("excludes v1 rows from raw/effect/overkill stats but keeps them in effective", async () => {
    const seasonId = await createSeason({ name: `${prefix}stats-season` });
    const roster = await createRoster(seasonId, await createBosses("stats"));
    const [round] = await createCycle(seasonId, roster, 1);
    const userId = `${prefix}stats-user`;
    await mysql("world_boss_contribution").insert(
      [
        // v1: raw_damage IS NULL. Its 700 damage is real HP removed, so it counts as
        // effective — but nothing may be inferred about raw / effect / overkill.
        { raw_damage: null, effect_damage: 0, job_key: null, damage: 700 },
        // v2 with an overkill tail: 100 + 50 swung, only 30 landed.
        { raw_damage: 100, effect_damage: 50, job_key: "mage", damage: 30 },
        // v2 with no waste at all.
        { raw_damage: 40, effect_damage: 0, job_key: "thief", damage: 40 },
      ].map(row => ({ season_id: seasonId, round_id: round.id, user_id: userId, cost: 1, ...row }))
    );

    await expect(WorldBossContribution.seasonDamageStats(seasonId, userId)).resolves.toEqual({
      raw: "140",
      effect: "50",
      effective: "770",
      overkill: "120",
    });
    await expect(
      WorldBossContribution.seasonDamageStats(seasonId, `${prefix}nobody`)
    ).resolves.toEqual({ raw: "0", effect: "0", effective: "0", overkill: "0" });
  });

  test("sums cost using a half-open UTC range at the Taipei midnight boundary", async () => {
    const seasonId = await createSeason({ name: `${prefix}quota-season` });
    const roster = await createRoster(seasonId, await createBosses("quota"));
    const [round] = await createCycle(seasonId, roster, 1);
    const roundId = round.id;
    const userId = `${prefix}quota-user`;
    const startUtc = new Date("2026-07-19T16:00:00.000Z");
    const endUtc = new Date("2026-07-20T16:00:00.000Z");
    await mysql("world_boss_contribution").insert([
      {
        season_id: seasonId,
        round_id: roundId,
        user_id: userId,
        damage: 1,
        cost: 10,
        created_at: new Date("2026-07-19T15:59:59.000Z"),
        updated_at: new Date("2026-07-19T15:59:59.000Z"),
      },
      {
        season_id: seasonId,
        round_id: roundId,
        user_id: userId,
        damage: 1,
        cost: 20,
        created_at: startUtc,
        updated_at: startUtc,
      },
      {
        season_id: seasonId,
        round_id: roundId,
        user_id: userId,
        damage: 1,
        cost: 30,
        created_at: endUtc,
        updated_at: endUtc,
      },
      {
        season_id: seasonId,
        round_id: roundId,
        user_id: userId,
        damage: 1,
        cost: 40,
        created_at: new Date("2026-07-20T16:00:01.000Z"),
        updated_at: new Date("2026-07-20T16:00:01.000Z"),
      },
    ]);

    expect(await WorldBossContribution.sumCostInRange(userId, startUtc, endUtc)).toBe(20);
  });

  test("uses the reward ledger for duplicate protection and latest paid settlement lookup", async () => {
    const settledSeasonId = await createSeason({
      name: `${prefix}settled-season`,
      status: "settled",
      end_time: new Date("2026-07-01T00:00:00.000Z"),
      settled_at: new Date("2026-07-01T00:00:00.000Z"),
    });
    const unpaidSettledSeasonId = await createSeason({
      name: `${prefix}unpaid-settled-season`,
      status: "settled",
      end_time: new Date("2026-07-02T00:00:00.000Z"),
      settled_at: new Date("2026-07-02T00:00:00.000Z"),
    });
    const activeSeasonId = await createSeason({
      name: `${prefix}newer-active-season`,
      status: "active",
      active_slot: activeSlot,
      end_time: new Date("2030-01-01T00:00:00.000Z"),
    });
    const title = await mysql("titles").where({ key: "worldboss_annihilator" }).first();
    const userId = `${prefix}reward-user`;
    const payload = {
      season_id: settledSeasonId,
      user_id: userId,
      ranking: 1,
      total_score: 1200,
      total_damage: 999,
      stone_amount: 500,
      title_key: title.key,
      paid_at: new Date("2026-07-01T01:00:00.000Z"),
    };

    expect(await WorldBossSeasonReward.tryInsert(payload)).toBe(true);
    expect(await WorldBossSeasonReward.tryInsert(payload)).toBe(false);
    expect(
      await WorldBossSeasonReward.tryInsert({
        ...payload,
        season_id: unpaidSettledSeasonId,
        paid_at: null,
      })
    ).toBe(true);
    const roster = await createRoster(activeSeasonId, await createBosses("reward"));
    await createCycle(activeSeasonId, roster, 1);

    await mysql.transaction(async trx => {
      const locked = await WorldBossSeasonReward.findForUpdate(settledSeasonId, userId, trx);
      expect(locked).toMatchObject({ season_id: settledSeasonId, user_id: userId });
    });

    const latest = await WorldBossSeasonReward.findLatestSettledByUser(userId);
    expect(latest).toMatchObject({
      seasonId: String(settledSeasonId),
      seasonName: `${prefix}settled-season`,
      ranking: 1,
      totalScore: "1200",
      totalDamage: "999",
      stoneAmount: 500,
      titleKey: title.key,
      titleName: title.name,
    });
    expect(Number(latest.rewardId)).toBeGreaterThan(0);
    expect(new Date(latest.paidAt).toISOString()).toBe("2026-07-01T01:00:00.000Z");
    expect(new Date(latest.settledAt).toISOString()).toBe("2026-07-01T00:00:00.000Z");

    // A pre-v2 ledger has no total_score; it must stay null rather than borrow total_damage.
    const legacyUserId = `${prefix}reward-legacy`;
    await WorldBossSeasonReward.tryInsert({
      ...payload,
      user_id: legacyUserId,
      total_score: null,
    });
    await expect(
      WorldBossSeasonReward.findLatestSettledByUser(legacyUserId)
    ).resolves.toMatchObject({ totalScore: null, totalDamage: "999" });
  });

  describe("effect and score ledgers", () => {
    let seasonId;
    let rounds;

    async function addContribution(userId, overrides = {}) {
      const [id] = await mysql("world_boss_contribution").insert({
        season_id: seasonId,
        round_id: rounds[0].id,
        user_id: userId,
        raw_damage: "100",
        effect_damage: "0",
        job_key: "mage",
        damage: "100",
        cost: 1,
        ...overrides,
      });
      return id;
    }

    async function addEffect(overrides = {}) {
      const sourceContributionId =
        overrides.source_contribution_id ?? (await addContribution(`${prefix}fx-src`));
      const [id] = await mysql("world_boss_round_effect").insert({
        season_id: seasonId,
        round_id: rounds[0].id,
        source_contribution_id: sourceContributionId,
        source_user_id: `${prefix}fx-src`,
        effect_type: "seal",
        value: "50",
        consumed_by_contribution_id: null,
        ...overrides,
      });
      return id;
    }

    function scoreRow(overrides = {}) {
      return {
        season_id: seasonId,
        round_id: rounds[0].id,
        effect_id: null,
        beneficiary_user_id: `${prefix}score-user`,
        kind: "direct",
        points: "100",
        ...overrides,
      };
    }

    beforeEach(async () => {
      seasonId = await createSeason({
        name: `${prefix}ledger-season`,
        status: "active",
        active_slot: activeSlot,
      });
      const roster = await createRoster(seasonId, await createBosses("ledger"));
      rounds = await createCycle(seasonId, roster, 1);
    });

    test("allows at most one effect per source contribution", async () => {
      const contributionId = await addContribution(`${prefix}fx-src`);
      await addEffect({ source_contribution_id: contributionId });

      await expect(addEffect({ source_contribution_id: contributionId })).rejects.toMatchObject({
        code: "ER_DUP_ENTRY",
      });
    });

    test("allows at most one effect consumed by the same contribution", async () => {
      const consumerId = await addContribution(`${prefix}fx-consumer`);
      const first = await addEffect();
      const second = await addEffect();
      await mysql("world_boss_round_effect")
        .where({ id: first })
        .update({ consumed_by_contribution_id: consumerId });

      // One attack may detonate at most one effect — two rows pointing at the same
      // contribution would mean a hit silently consumed two.
      await expect(
        mysql("world_boss_round_effect")
          .where({ id: second })
          .update({ consumed_by_contribution_id: consumerId })
      ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      // Many unconsumed effects may coexist: NULL is not "the same value" to a UNIQUE index.
      await expect(
        mysql("world_boss_round_effect").where({ consumed_by_contribution_id: null })
      ).resolves.toHaveLength(1);
    });

    test("rejects a zero-value effect", async () => {
      await expect(addEffect({ value: "0" })).rejects.toMatchObject({
        code: "ER_CHECK_CONSTRAINT_VIOLATED",
      });
    });

    test("planFor skips a zero-value effect instead of writing an illegal row", async () => {
      // floor(3 * 25 / 100) === 0 for a very low level adventurer.
      expect(WorldBossRoundEffect.planFor("adventurer", 3)).toBeNull();
      expect(WorldBossRoundEffect.planFor("mage", 1)).toBeNull();
      expect(WorldBossRoundEffect.planFor("adventurer", 4)).toEqual({
        effect_type: "banner",
        value: 1n,
      });
      expect(WorldBossRoundEffect.planFor("mage", 501)).toEqual({
        effect_type: "seal",
        value: 250n,
      });
      // Swordman and thief leave nothing behind at any damage.
      expect(WorldBossRoundEffect.planFor("swordman", 1000000)).toBeNull();
      expect(WorldBossRoundEffect.planFor("thief", 1000000)).toBeNull();
      // BIGINT stays exact: a JS Number would round this to ...992.
      expect(WorldBossRoundEffect.planFor("mage", "18014398509481985").value).toBe(
        9007199254740992n
      );
    });

    test("rejects a zero-point score event", async () => {
      const contributionId = await addContribution(`${prefix}score-user`);
      await expect(
        mysql("world_boss_score_event").insert(
          scoreRow({ contribution_id: contributionId, points: "0" })
        )
      ).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    });

    test("rejects a duplicate (contribution, kind, beneficiary) score event", async () => {
      const contributionId = await addContribution(`${prefix}score-user`);
      const row = scoreRow({ contribution_id: contributionId });
      await mysql("world_boss_score_event").insert(row);

      await expect(mysql("world_boss_score_event").insert(row)).rejects.toMatchObject({
        code: "ER_DUP_ENTRY",
      });
      // A different kind for the same contribution and user is legitimate.
      await expect(
        mysql("world_boss_score_event").insert({ ...row, kind: "relay" })
      ).resolves.toBeDefined();
    });

    test("rejects a duplicate (effect, kind, beneficiary) score event", async () => {
      const effectId = await addEffect();
      const first = await addContribution(`${prefix}score-a`);
      const second = await addContribution(`${prefix}score-b`);
      const base = {
        effect_id: effectId,
        kind: "assist",
        beneficiary_user_id: `${prefix}fx-src`,
      };
      await mysql("world_boss_score_event").insert(scoreRow({ ...base, contribution_id: first }));

      // One effect may only ever pay one assist, even from a different contribution.
      await expect(
        mysql("world_boss_score_event").insert(scoreRow({ ...base, contribution_id: second }))
      ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    });

    test("lets many effect_id NULL direct events coexist", async () => {
      const first = await addContribution(`${prefix}score-user`);
      const second = await addContribution(`${prefix}score-user`);
      const third = await addContribution(`${prefix}score-user`);

      // UNIQUE(effect_id, kind, beneficiary) must not collapse every direct event of one
      // player into one row: MySQL treats each NULL as distinct, which is the design.
      await mysql("world_boss_score_event").insert([
        scoreRow({ contribution_id: first }),
        scoreRow({ contribution_id: second }),
        scoreRow({ contribution_id: third }),
      ]);

      await expect(
        mysql("world_boss_score_event").where({ season_id: seasonId, effect_id: null })
      ).resolves.toHaveLength(3);
    });

    test("blocks deleting a contribution or effect that a ledger row still references", async () => {
      const effectId = await addEffect();
      const sourceContributionId = (
        await mysql("world_boss_round_effect").where({ id: effectId }).first()
      ).source_contribution_id;
      const scored = await addContribution(`${prefix}score-user`);
      await mysql("world_boss_score_event").insert(
        scoreRow({ contribution_id: scored, effect_id: effectId, kind: "assist" })
      );

      await expect(
        mysql("world_boss_contribution").where({ id: sourceContributionId }).del()
      ).rejects.toMatchObject({ code: "ER_ROW_IS_REFERENCED_2" });
      await expect(
        mysql("world_boss_contribution").where({ id: scored }).del()
      ).rejects.toMatchObject({ code: "ER_ROW_IS_REFERENCED_2" });
      await expect(
        mysql("world_boss_round_effect").where({ id: effectId }).del()
      ).rejects.toMatchObject({ code: "ER_ROW_IS_REFERENCED_2" });
    });

    test("sums and ranks BIGINT score points beyond Number.MAX_SAFE_INTEGER exactly", async () => {
      const half = "4503599627370496";
      const users = [`${prefix}sc-a`, `${prefix}sc-b`, `${prefix}sc-c`];
      const rows = [];
      for (const [index, user] of users.entries()) {
        const points = index === 2 ? [half, half] : [half, "4503599627370497"];
        for (const value of points) {
          const contributionId = await addContribution(user);
          rows.push(
            scoreRow({ contribution_id: contributionId, beneficiary_user_id: user, points: value })
          );
        }
      }
      await mysql("world_boss_score_event").insert(rows);

      await expect(WorldBossScoreEvent.sumSeasonScore(seasonId, users[0])).resolves.toBe(
        "9007199254740993"
      );
      const ranking = await WorldBossScoreEvent.seasonRanking(seasonId, 100);
      expect(ranking.map(row => [row.user_id, row.total_score, row.ranking])).toEqual([
        [users[0], "9007199254740993", 1],
        [users[1], "9007199254740993", 1],
        [users[2], "9007199254740992", 3],
      ]);
      await expect(WorldBossScoreEvent.seasonRankingAll(seasonId)).resolves.toHaveLength(3);
      for (const limit of [0, 101, 1.5, Number.NaN]) {
        await expect(WorldBossScoreEvent.seasonRanking(seasonId, limit)).rejects.toMatchObject({
          code: "INVALID_RANKING_LIMIT",
        });
      }
      await expect(WorldBossScoreEvent.sumSeasonScore(seasonId, `${prefix}nobody`)).resolves.toBe(
        "0"
      );
    });

    test("bounds the public leaderboard and ranks every contributor internally", async () => {
      const rows = [];
      for (let index = 0; index < 104; index += 1) {
        const user = `${prefix}rank-${String(index).padStart(3, "0")}`;
        const contributionId = await addContribution(user);
        rows.push(
          scoreRow({
            contribution_id: contributionId,
            beneficiary_user_id: user,
            points: String(500 - index),
          })
        );
      }
      // Two ties inserted in reverse user_id order: the tie-break must come from the query,
      // not from insertion order.
      for (const user of [`${prefix}tie-z`, `${prefix}tie-a`]) {
        const contributionId = await addContribution(user);
        rows.push(
          scoreRow({ contribution_id: contributionId, beneficiary_user_id: user, points: "500" })
        );
      }
      await mysql("world_boss_score_event").insert(rows);

      await expect(WorldBossScoreEvent.seasonRanking(seasonId, 1)).resolves.toHaveLength(1);
      await expect(WorldBossScoreEvent.seasonRanking(seasonId, 100)).resolves.toHaveLength(100);
      const all = await WorldBossScoreEvent.seasonRankingAll(seasonId);
      expect(all).toHaveLength(106);
      expect(all.slice(0, 3).map(row => [row.user_id, row.total_score, row.ranking])).toEqual([
        [`${prefix}rank-000`, "500", 1],
        [`${prefix}tie-a`, "500", 1],
        [`${prefix}tie-z`, "500", 1],
      ]);
      expect(all[3]).toMatchObject({ user_id: `${prefix}rank-001`, ranking: 4 });
      expect(all.find(row => row.ranking === 103)).toBeTruthy();
    });

    test("ranks a legacy v1 backfill and v2 kinds on one mixed leaderboard", async () => {
      const legacyUser = `${prefix}mix-legacy`;
      const mixedUser = `${prefix}mix-both`;
      const v2User = `${prefix}mix-v2`;
      const rows = [];
      // v1 player: only a backfilled legacy direct event, whose contribution has no raw_damage.
      const legacyContribution = await addContribution(legacyUser, {
        raw_damage: null,
        effect_damage: 0,
        job_key: null,
        damage: "300",
      });
      rows.push(
        scoreRow({
          contribution_id: legacyContribution,
          beneficiary_user_id: legacyUser,
          points: "300",
        })
      );
      // Returning player: legacy direct 300 + v2 direct 100 + assist 50 + relay 50 = 500.
      const mixedLegacy = await addContribution(mixedUser, {
        raw_damage: null,
        effect_damage: 0,
        job_key: null,
        damage: "300",
      });
      rows.push(
        scoreRow({ contribution_id: mixedLegacy, beneficiary_user_id: mixedUser, points: "300" })
      );
      const mixedV2 = await addContribution(mixedUser);
      const effectId = await addEffect();
      rows.push(
        scoreRow({ contribution_id: mixedV2, beneficiary_user_id: mixedUser, points: "100" }),
        scoreRow({
          contribution_id: mixedV2,
          effect_id: effectId,
          beneficiary_user_id: mixedUser,
          kind: "assist",
          points: "50",
        }),
        scoreRow({
          contribution_id: mixedV2,
          effect_id: effectId,
          beneficiary_user_id: mixedUser,
          kind: "relay",
          points: "50",
        })
      );
      // Pure v2 player, tied with the returning player on 500.
      const v2Contribution = await addContribution(v2User, { raw_damage: "500", damage: "500" });
      rows.push(
        scoreRow({ contribution_id: v2Contribution, beneficiary_user_id: v2User, points: "500" })
      );
      await mysql("world_boss_score_event").insert(rows);

      await expect(WorldBossScoreEvent.sumSeasonScore(seasonId, mixedUser)).resolves.toBe("500");
      await expect(WorldBossScoreEvent.seasonScoreByKind(seasonId, mixedUser)).resolves.toEqual({
        direct: "400",
        assist: "50",
        relay: "50",
      });
      await expect(WorldBossScoreEvent.seasonScoreByKind(seasonId, legacyUser)).resolves.toEqual({
        direct: "300",
        assist: "0",
        relay: "0",
      });
      const ranking = await WorldBossScoreEvent.seasonRankingAll(seasonId);
      expect(
        ranking
          .filter(row => row.user_id.startsWith(`${prefix}mix-`))
          .map(row => [row.user_id, row.total_score, row.ranking])
      ).toEqual([
        [mixedUser, "500", 1],
        [v2User, "500", 1],
        [legacyUser, "300", 3],
      ]);
    });

    test("lists a player's own effects newest first with the consumer joined in one query", async () => {
      const source = `${prefix}hist-src`;
      const taker = `${prefix}hist-taker`;
      const stranger = `${prefix}hist-other`;
      const consumedAt = new Date("2026-07-20T03:00:00.000Z");
      const consumerId = await addContribution(taker, { created_at: consumedAt });
      const takenId = await addEffect({
        source_user_id: source,
        effect_type: "banner",
        value: "25",
        consumed_by_contribution_id: consumerId,
      });
      const pendingId = await addEffect({ source_user_id: source, effect_type: "seal" });
      // Someone else's effect and another season's effect must both stay out.
      await addEffect({ source_user_id: stranger });
      const otherSeasonId = await createSeason({ name: `${prefix}hist-other-season` });

      const rows = await WorldBossRoundEffect.listSeasonHistoryBySource({
        seasonId,
        userId: source,
        limit: 50,
      });

      expect(rows.map(row => String(row.id))).toEqual([String(pendingId), String(takenId)]);
      expect(rows[0]).toMatchObject({
        effect_type: "seal",
        value: 50,
        consumed_by_user_id: null,
        consumed_at: null,
      });
      expect(rows[1]).toMatchObject({
        effect_type: "banner",
        value: 25,
        consumed_by_user_id: taker,
      });
      expect(Number(rows[1].round_id)).toBe(Number(rounds[0].id));
      // consumed_at comes from the consuming contribution, not the effect's updated_at.
      expect(new Date(rows[1].consumed_at).toISOString()).toBe(consumedAt.toISOString());
      expect(rows[1].created_at).toBeInstanceOf(Date);

      await expect(
        WorldBossRoundEffect.listSeasonHistoryBySource({ seasonId, userId: source, limit: 1 })
      ).resolves.toHaveLength(1);
      await expect(
        WorldBossRoundEffect.listSeasonHistoryBySource({
          seasonId: otherSeasonId,
          userId: source,
          limit: 50,
        })
      ).resolves.toEqual([]);
      await expect(
        WorldBossRoundEffect.listSeasonHistoryBySource({
          seasonId,
          userId: `${prefix}nobody`,
          limit: 50,
        })
      ).resolves.toEqual([]);
    });

    test("finds the oldest consumable effect and never the caller's own", async () => {
      const mine = await addEffect({ source_user_id: `${prefix}me` });
      const theirs = await addEffect({ source_user_id: `${prefix}them` });
      const consumerId = await addContribution(`${prefix}me`);

      await mysql.transaction(async trx => {
        // The exclusion is a SQL predicate, so my own older effect is skipped rather than
        // returned and then discarded — otherwise it would block `theirs` forever.
        const picked = await WorldBossRoundEffect.findConsumableForUpdate(trx, {
          roundId: rounds[0].id,
          userId: `${prefix}me`,
        });
        expect(Number(picked.id)).toBe(Number(theirs));
        // Someone else sees the true oldest.
        const other = await WorldBossRoundEffect.findConsumableForUpdate(trx, {
          roundId: rounds[0].id,
          userId: `${prefix}stranger`,
        });
        expect(Number(other.id)).toBe(Number(mine));

        await WorldBossRoundEffect.consume(trx, {
          effectId: theirs,
          contributionId: consumerId,
          now: new Date("2026-07-20T00:00:00.000Z"),
        });
        // Second consume of the same row affects 0 rows and must abort, not silently pass.
        await expect(
          WorldBossRoundEffect.consume(trx, {
            effectId: theirs,
            contributionId: consumerId,
            now: new Date("2026-07-20T00:00:00.000Z"),
          })
        ).rejects.toMatchObject({ code: "EFFECT_ALREADY_CONSUMED" });
      });

      await expect(WorldBossRoundEffect.listUnconsumedByRound(rounds[0].id)).resolves.toHaveLength(
        1
      );
    });
  });
});
