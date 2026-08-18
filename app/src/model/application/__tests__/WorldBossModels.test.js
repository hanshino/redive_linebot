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

  test("aggregates, bounds, orders, and competition-ranks season contributions", async () => {
    const seasonId = await createSeason({ name: `${prefix}ranking-season` });
    const roster = await createRoster(seasonId, await createBosses("ranking"));
    const [round] = await createCycle(seasonId, roster, 1);
    const roundId = round.id;
    const rows = [
      { user_id: `${prefix}u-b`, damage: 500, cost: 10 },
      { user_id: `${prefix}u-a`, damage: 500, cost: 20 },
      { user_id: `${prefix}u-c`, damage: 300, cost: 30 },
    ];
    for (let index = 0; index < 101; index += 1) {
      rows.push({
        user_id: `${prefix}rank-${String(index).padStart(3, "0")}`,
        damage: 200 - index,
        cost: 1,
      });
    }
    await mysql("world_boss_contribution").insert(
      rows.map(row => ({ season_id: seasonId, round_id: roundId, ...row }))
    );

    const publicRows = await WorldBossContribution.seasonRanking(seasonId, 100);
    expect(publicRows).toHaveLength(100);
    expect(publicRows.slice(0, 3).map(row => [row.user_id, row.total_damage, row.ranking])).toEqual(
      [
        [`${prefix}u-a`, "500", 1],
        [`${prefix}u-b`, "500", 1],
        [`${prefix}u-c`, "300", 3],
      ]
    );

    const allRows = await WorldBossContribution.seasonRankingAll(seasonId);
    expect(allRows).toHaveLength(104);
    expect(allRows.find(row => row.ranking === 101)).toBeTruthy();
    expect(await WorldBossContribution.sumSeasonDamage(seasonId, `${prefix}u-a`)).toBe("500");

    for (const limit of [0, 101, 1.5, Number.NaN]) {
      await expect(WorldBossContribution.seasonRanking(seasonId, limit)).rejects.toMatchObject({
        code: "INVALID_RANKING_LIMIT",
      });
    }
    await expect(WorldBossContribution.seasonRanking(seasonId, 1)).resolves.toHaveLength(1);
    await expect(WorldBossContribution.seasonRanking(seasonId, 100)).resolves.toHaveLength(100);
  });

  test("preserves exact aggregate damage for ordering, ties, and user totals", async () => {
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
        { user_id: `${prefix}exact-b`, damage: "4503599627370497" },
        { user_id: `${prefix}exact-c`, damage: half },
        { user_id: `${prefix}exact-c`, damage: half },
      ].map(row => ({ season_id: seasonId, round_id: roundId, cost: 1, ...row }))
    );

    const ranking = await WorldBossContribution.seasonRanking(seasonId, 100);
    expect(ranking.map(row => [row.user_id, row.total_damage, row.ranking])).toEqual([
      [`${prefix}exact-a`, "9007199254740993", 1],
      [`${prefix}exact-b`, "9007199254740993", 1],
      [`${prefix}exact-c`, "9007199254740992", 3],
    ]);
    await expect(WorldBossContribution.sumSeasonDamage(seasonId, `${prefix}exact-a`)).resolves.toBe(
      "9007199254740993"
    );
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
      totalDamage: "999",
      stoneAmount: 500,
      titleKey: title.key,
      titleName: title.name,
    });
    expect(Number(latest.rewardId)).toBeGreaterThan(0);
    expect(new Date(latest.paidAt).toISOString()).toBe("2026-07-01T01:00:00.000Z");
    expect(new Date(latest.settledAt).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
