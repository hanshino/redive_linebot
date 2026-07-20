require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const {
  PREFIX,
  ACTIVE_SLOT,
  cleanupByPrefix,
} = require("../../../__tests__/helpers/worldBossFixture");
const WorldBossSeason = require("../WorldBossSeason");
const WorldBossRound = require("../WorldBossRound");
const WorldBossContribution = require("../WorldBossContribution");
const WorldBossSeasonReward = require("../WorldBossSeasonReward");

describe("World Boss v2 models", () => {
  const prefix = `${PREFIX}models_`;
  const sentinelName = "xxwbtestXmodelsXsentinel";
  const activeSlot = ACTIVE_SLOT;

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

  async function createRound(seasonId, bossId, attributes = {}) {
    const [id] = await mysql("world_boss_round").insert({
      season_id: seasonId,
      round_no: attributes.round_no || 1,
      world_boss_id: bossId,
      max_hp: attributes.max_hp || 100,
      current_hp: attributes.current_hp || 100,
      status: attributes.status || "cleared",
      active_slot: attributes.active_slot || null,
      cleared_at: attributes.cleared_at || null,
    });
    return id;
  }

  beforeEach(async () => {
    await cleanupByPrefix(mysql, prefix);
    await mysql("world_boss_season").where({ name: sentinelName }).del();
    await mysql("world_boss_season").insert({
      name: sentinelName,
      status: "draft",
      end_time: new Date("2030-01-01T00:00:00.000Z"),
    });
  });

  afterEach(async () => {
    await cleanupByPrefix(mysql, prefix);
    expect(await mysql("world_boss_season").where({ name: sentinelName }).first()).toBeTruthy();
    await mysql("world_boss_season").where({ name: sentinelName }).del();
  });

  afterAll(() => mysql.destroy());

  test("finds and locks the active season and its active round", async () => {
    const [bossId] = await mysql("world_boss").insert({
      name: `${prefix}active-boss`,
      hp_weight: 1,
    });
    const seasonId = await createSeason({
      name: `${prefix}active-season`,
      status: "active",
      active_slot: activeSlot,
    });
    const roundId = await createRound(seasonId, bossId, {
      status: "active",
      active_slot: activeSlot,
    });

    const active = await WorldBossSeason.findActive();
    expect(Number(active.id)).toBe(seasonId);

    await mysql.transaction(async trx => {
      const lockedSeason = await WorldBossSeason.findActiveForUpdate(activeSlot, trx);
      const lockedById = await WorldBossSeason.findForUpdate(seasonId, trx);
      const lockedRound = await WorldBossRound.findActiveForUpdate(seasonId, trx);
      expect(Number(lockedSeason.id)).toBe(seasonId);
      expect(Number(lockedById.id)).toBe(seasonId);
      expect(Number(lockedRound.id)).toBe(roundId);
    });

    const activeRound = await WorldBossRound.findActiveBySeason(seasonId);
    expect(Number(activeRound.id)).toBe(roundId);
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

  test("aggregates, bounds, orders, and competition-ranks season contributions", async () => {
    const seasonId = await createSeason({ name: `${prefix}ranking-season` });
    const [bossId] = await mysql("world_boss").insert({
      name: `${prefix}ranking-boss`,
      hp_weight: 1,
    });
    const roundId = await createRound(seasonId, bossId);
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
        [`${prefix}u-a`, 500, 1],
        [`${prefix}u-b`, 500, 1],
        [`${prefix}u-c`, 300, 3],
      ]
    );

    const allRows = await WorldBossContribution.seasonRankingAll(seasonId);
    expect(allRows).toHaveLength(104);
    expect(allRows.find(row => row.ranking === 101)).toBeTruthy();
    expect(await WorldBossContribution.sumSeasonDamage(seasonId, `${prefix}u-a`)).toBe(500);

    for (const limit of [0, 101, 1.5, Number.NaN]) {
      await expect(WorldBossContribution.seasonRanking(seasonId, limit)).rejects.toMatchObject({
        code: "INVALID_RANKING_LIMIT",
      });
    }
    await expect(WorldBossContribution.seasonRanking(seasonId, 1)).resolves.toHaveLength(1);
    await expect(WorldBossContribution.seasonRanking(seasonId, 100)).resolves.toHaveLength(100);
  });

  test("sums cost using a half-open UTC range at the Taipei midnight boundary", async () => {
    const seasonId = await createSeason({ name: `${prefix}quota-season` });
    const [bossId] = await mysql("world_boss").insert({
      name: `${prefix}quota-boss`,
      hp_weight: 1,
    });
    const roundId = await createRound(seasonId, bossId);
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
    const [bossId] = await mysql("world_boss").insert({
      name: `${prefix}reward-boss`,
      hp_weight: 1,
    });
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
    await createRound(activeSeasonId, bossId, { status: "active", active_slot: activeSlot });

    await mysql.transaction(async trx => {
      const locked = await WorldBossSeasonReward.findForUpdate(settledSeasonId, userId, trx);
      expect(locked).toMatchObject({ season_id: settledSeasonId, user_id: userId });
    });

    const latest = await WorldBossSeasonReward.findLatestSettledByUser(userId);
    expect(latest).toMatchObject({
      seasonId: settledSeasonId,
      seasonName: `${prefix}settled-season`,
      ranking: 1,
      totalDamage: 999,
      stoneAmount: 500,
      titleKey: title.key,
      titleName: title.name,
    });
    expect(Number(latest.rewardId)).toBeGreaterThan(0);
    expect(new Date(latest.paidAt).toISOString()).toBe("2026-07-01T01:00:00.000Z");
    expect(new Date(latest.settledAt).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
