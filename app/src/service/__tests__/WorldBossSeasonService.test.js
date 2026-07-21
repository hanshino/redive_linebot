require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");
const { inventory } = require("../../model/application/Inventory");
const UserTitle = require("../../model/application/UserTitle");
const { PREFIX, ACTIVE_SLOT } = require("../../__tests__/helpers/worldBossFixture");
const { createSeasonService } = require("../WorldBossSeasonService");

const prefix = `${PREFIX}season_`;
const now = new Date("2026-07-20T04:00:00.000Z");
const later = new Date("2026-07-21T04:00:00.000Z");
const worldBossTitleKeys = ["worldboss_annihilator", "worldboss_vanguard"];
let ownedTitleIds = [];

function owned(label) {
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

function literalPrefix(query, column, value = prefix) {
  return query.whereRaw("LEFT(??, ?) = ?", [column, value.length, value]);
}

async function cleanupOwned() {
  const seasons = await literalPrefix(mysql("world_boss_season"), "name").select("id");
  const seasonIds = seasons.map(row => row.id);
  if (seasonIds.length) {
    await mysql("world_boss_season_reward").whereIn("season_id", seasonIds).del();
    await mysql("world_boss_contribution").whereIn("season_id", seasonIds).del();
    await mysql("world_boss_round").whereIn("season_id", seasonIds).del();
    await mysql("world_boss_season").whereIn("id", seasonIds).del();
  }
  await literalPrefix(mysql("inventory"), "userId").del();
  await literalPrefix(mysql("user_titles"), "user_id").del();
  await literalPrefix(mysql("world_boss"), "name").del();
}

async function sharedTitleSnapshot() {
  return mysql("user_titles as owned")
    .join("titles as title", "owned.title_id", "title.id")
    .whereNot("title.key", "like", "worldboss\\_%")
    .select("owned.id", "owned.user_id", "owned.title_id", "owned.granted_at")
    .orderBy("owned.id");
}

async function createBoss(label = "boss") {
  const [id] = await mysql("world_boss").insert({ name: owned(label), hp_weight: 1 });
  return id;
}

async function createSeasonRow({
  label,
  status = "draft",
  activeSlot = status === "active" ? ACTIVE_SLOT : null,
  startTime = status === "active" ? new Date(now.getTime() - 1000) : null,
  endTime = later,
  settledAt = status === "settled" ? now : null,
} = {}) {
  const [id] = await mysql("world_boss_season").insert({
    name: owned(label),
    announcement: `${owned(label)}_announcement`,
    status,
    active_slot: activeSlot,
    start_time: startTime,
    end_time: endTime,
    settled_at: settledAt,
  });
  return id;
}

async function createActiveFixture({ label, endTime = now } = {}) {
  const bossId = await createBoss(`${label}_boss`);
  const seasonId = await createSeasonRow({ label: `${label}_season`, status: "active", endTime });
  const [roundId] = await mysql("world_boss_round").insert({
    season_id: seasonId,
    round_no: 1,
    world_boss_id: bossId,
    max_hp: 1000,
    current_hp: 700,
    status: "active",
    active_slot: ACTIVE_SLOT,
  });
  return { bossId, seasonId, roundId };
}

async function addContributions(seasonId, roundId, rows) {
  await mysql("world_boss_contribution").insert(
    rows.flatMap(({ userId, damages }) =>
      damages.map((damage, index) => ({
        season_id: seasonId,
        round_id: roundId,
        user_id: userId,
        damage,
        cost: 1,
        created_at: new Date(now.getTime() + index),
        updated_at: new Date(now.getTime() + index),
      }))
    )
  );
}

async function inventoryStoneTotal(userId) {
  const row = await mysql("inventory")
    .where({ userId, itemId: 999 })
    .sum({ total: "itemAmount" })
    .first();
  return Number(row.total) || 0;
}

async function seasonRow(id) {
  return mysql("world_boss_season").where({ id }).first();
}

async function titleId(key) {
  const title = await mysql("titles").where({ key }).first();
  return title && title.id;
}

beforeAll(async () => {
  ownedTitleIds = (await mysql("titles").whereIn("key", worldBossTitleKeys).select("id")).map(
    row => row.id
  );
  expect(ownedTitleIds).toHaveLength(2);
  await cleanupOwned();
});

beforeEach(async () => {
  await cleanupOwned();
});

afterEach(async () => {
  await cleanupOwned();
});

afterAll(async () => {
  await cleanupOwned();
  await mysql.destroy();
});

describe("WorldBossSeasonService CRUD and opening", () => {
  test("lists newest seasons deterministically and only mutates drafts", async () => {
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    const firstId = await createSeasonRow({ label: "list_first" });
    const secondId = await createSeasonRow({ label: "list_second" });
    await mysql("world_boss_season").whereIn("id", [firstId, secondId]).update({ created_at: now });

    const rows = (await service.listSeasons()).filter(row => row.name.startsWith(prefix));
    expect(rows.map(row => Number(row.id))).toEqual([secondId, firstId]);

    const createdId = await service.createSeason({
      name: owned("crud"),
      announcement: "created",
      end_time: later,
      start_time: new Date("2035-01-01T00:00:00.000Z"),
      status: "settled",
      active_slot: 99,
    });
    await expect(seasonRow(createdId)).resolves.toMatchObject({
      name: owned("crud"),
      announcement: "created",
      status: "draft",
      active_slot: null,
      start_time: null,
    });

    await expect(
      service.updateSeason(createdId, {
        name: owned("crud_updated"),
        announcement: "updated",
        end_time: new Date(later.getTime() + 1000),
        start_time: new Date("2036-01-01T00:00:00.000Z"),
        status: "active",
        active_slot: 99,
      })
    ).resolves.toBe(createdId);
    await expect(seasonRow(createdId)).resolves.toMatchObject({
      name: owned("crud_updated"),
      announcement: "updated",
      status: "draft",
      active_slot: null,
      start_time: null,
    });

    const activeId = await createSeasonRow({ label: "active", status: "active" });
    const settledId = await createSeasonRow({ label: "settled", status: "settled" });
    const activeBefore = await seasonRow(activeId);
    const settledBefore = await seasonRow(settledId);
    await expect(service.updateSeason(activeId, { name: owned("changed") })).rejects.toMatchObject({
      code: "SEASON_NOT_DRAFT",
    });
    await expect(service.deleteSeason(activeId)).rejects.toMatchObject({
      code: "SEASON_NOT_DRAFT",
    });
    await expect(service.updateSeason(settledId, { name: owned("changed") })).rejects.toMatchObject(
      {
        code: "SEASON_NOT_DRAFT",
      }
    );
    await expect(service.deleteSeason(settledId)).rejects.toMatchObject({
      code: "SEASON_NOT_DRAFT",
    });
    await expect(seasonRow(activeId)).resolves.toEqual(activeBefore);
    await expect(seasonRow(settledId)).resolves.toEqual(settledBefore);

    await expect(service.deleteSeason(createdId)).resolves.toBe(createdId);
    await expect(seasonRow(createdId)).resolves.toBeUndefined();
    await expect(service.updateSeason(999999999, { name: owned("missing") })).rejects.toMatchObject(
      {
        code: "SEASON_NOT_FOUND",
      }
    );
  });

  test("validates names and dates at the trust boundary and makes start_time server-owned", async () => {
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    for (const name of [undefined, "", "   ", "x".repeat(65)]) {
      await expect(service.createSeason({ name, end_time: later })).rejects.toMatchObject({
        code: "INVALID_NAME",
      });
    }
    for (const endTime of [undefined, null, "not-a-date", now, new Date(now.getTime() - 1)]) {
      await expect(
        service.createSeason({ name: owned("invalid_date"), end_time: endTime })
      ).rejects.toMatchObject({ code: "INVALID_END_TIME" });
    }

    const id = await service.createSeason({
      name: `  ${owned("trimmed")}  `,
      end_time: later.toISOString(),
      start_time: new Date("2040-01-01T00:00:00.000Z"),
    });
    await expect(seasonRow(id)).resolves.toMatchObject({
      name: owned("trimmed"),
      start_time: null,
    });
    await service.updateSeason(id, { start_time: new Date("2041-01-01T00:00:00.000Z") });
    await expect(seasonRow(id)).resolves.toMatchObject({ start_time: null });

    await createBoss("open_boss");
    const opened = await service.openSeason(id);
    expect(opened.seasonId).toBe(id);
    expect(Number(opened.round.round_no)).toBe(1);
    await expect(seasonRow(id)).resolves.toMatchObject({
      status: "active",
      active_slot: ACTIVE_SLOT,
      start_time: now,
    });
  });

  test("concurrent opens produce exactly one active season and one active round", async () => {
    await createBoss("concurrent_boss");
    const firstId = await createSeasonRow({ label: "concurrent_a" });
    const secondId = await createSeasonRow({ label: "concurrent_b" });
    const firstAtMutation = deferred();
    const secondAtMutation = deferred();
    const releaseBoth = deferred();
    const firstService = createSeasonService({
      activeSlot: ACTIVE_SLOT,
      clock: () => now,
      hooks: {
        beforeOpenMutation: async () => {
          firstAtMutation.resolve();
          await releaseBoth.promise;
        },
      },
    });
    const secondService = createSeasonService({
      activeSlot: ACTIVE_SLOT,
      clock: () => now,
      hooks: {
        beforeOpenMutation: async () => {
          secondAtMutation.resolve();
          await releaseBoth.promise;
        },
      },
    });

    const firstOpen = firstService.openSeason(firstId);
    await firstAtMutation.promise;
    const secondOpen = secondService.openSeason(secondId);
    await secondAtMutation.promise;
    releaseBoth.resolve();
    const results = await Promise.allSettled([firstOpen, secondOpen]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(result => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "ANOTHER_SEASON_ACTIVE" });
    await expect(
      mysql("world_boss_season").where({ status: "active", active_slot: ACTIVE_SLOT })
    ).resolves.toHaveLength(1);
    await expect(
      mysql("world_boss_round").where({ status: "active", active_slot: ACTIVE_SLOT })
    ).resolves.toHaveLength(1);
  });

  test("deadlock retry uses a new transaction and reruns validation before committing", async () => {
    await createBoss("retry_boss");
    const id = await createSeasonRow({ label: "retry" });
    const attempts = [];
    const trxObjects = [];
    const service = createSeasonService({
      activeSlot: ACTIVE_SLOT,
      clock: () => now,
      hooks: {
        beforeOpenMutation: async ({ attempt, trx, season }) => {
          attempts.push(attempt);
          trxObjects.push(trx);
          expect(Number(season.id)).toBe(id);
          if (attempt === 1)
            throw Object.assign(new Error("forced deadlock"), { code: "ER_LOCK_DEADLOCK" });
        },
      },
    });

    await expect(service.openSeason(id)).resolves.toMatchObject({ seasonId: id });
    expect(attempts).toEqual([1, 2]);
    expect(trxObjects[0]).not.toBe(trxObjects[1]);
    await expect(seasonRow(id)).resolves.toMatchObject({
      status: "active",
      active_slot: ACTIVE_SLOT,
    });
    await expect(mysql("world_boss_round").where({ season_id: id })).resolves.toHaveLength(1);
  });

  test("maps an exhausted deadlock retry to the deterministic winner", async () => {
    await createBoss("winner_boss");
    const losingId = await createSeasonRow({ label: "winner_loser" });
    const winnerId = await createSeasonRow({ label: "winner_actual" });
    const attempts = [];
    const service = createSeasonService({
      activeSlot: ACTIVE_SLOT,
      clock: () => now,
      hooks: {
        beforeOpenMutation: async ({ attempt }) => {
          attempts.push(attempt);
          if (attempt === 2) {
            await mysql("world_boss_season").where({ id: winnerId }).update({
              status: "active",
              active_slot: ACTIVE_SLOT,
              start_time: now,
            });
          }
          throw Object.assign(new Error("forced deadlock"), { code: "ER_LOCK_DEADLOCK" });
        },
      },
    });

    await expect(service.openSeason(losingId)).rejects.toMatchObject({
      code: "ANOTHER_SEASON_ACTIVE",
    });
    expect(attempts).toEqual([1, 2]);
    await expect(seasonRow(winnerId)).resolves.toMatchObject({
      status: "active",
      active_slot: ACTIVE_SLOT,
    });
    await expect(seasonRow(losingId)).resolves.toMatchObject({
      status: "draft",
      active_slot: null,
    });
  });

  test("reports status, deterministic public ranking, and expiry at an inclusive boundary", async () => {
    const fixture = await createActiveFixture({ label: "status", endTime: now });
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    await addContributions(fixture.seasonId, fixture.roundId, [
      { userId: owned("rank_a"), damages: [250, 250] },
      { userId: owned("rank_b"), damages: [500] },
      { userId: owned("rank_c"), damages: [300] },
    ]);

    await expect(service.getBattleStatus()).resolves.toMatchObject({
      season: { id: fixture.seasonId },
      round: { id: fixture.roundId },
      boss: { id: fixture.bossId },
      ended: true,
    });
    const ranking = await service.getRanking(fixture.seasonId, 100);
    expect(ranking.map(row => row.ranking)).toEqual([1, 1, 3]);
    await expect(service.getUserTotalDamage(fixture.seasonId, owned("rank_c"))).resolves.toBe(
      "300"
    );
    await expect(service.getUserTotalDamage(fixture.seasonId, owned("not_ranked"))).resolves.toBe(
      "0"
    );
    await expect(service.getRanking(fixture.seasonId, 0)).rejects.toMatchObject({
      code: "INVALID_RANKING_LIMIT",
    });
    await expect(service.settleSeason(fixture.seasonId)).resolves.toMatchObject({
      seasonId: String(fixture.seasonId),
    });
  });
});

describe("WorldBossSeasonService settlement", () => {
  test("settles unbounded competition ranking with identical tie tiers and paid zero-tier ledgers", async () => {
    const fixture = await createActiveFixture({ label: "ranking" });
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    const rows = [
      { userId: owned("tie_a"), damages: [500] },
      { userId: owned("tie_b"), damages: [500] },
      { userId: owned("rank_three"), damages: [300] },
    ];
    for (let rank = 4; rank <= 102; rank += 1) {
      rows.push({ userId: owned(`bulk_${String(rank).padStart(3, "0")}`), damages: [304 - rank] });
    }
    await addContributions(fixture.seasonId, fixture.roundId, rows);

    const result = await service.settleSeason(fixture.seasonId);
    expect(result).toEqual({
      seasonId: String(fixture.seasonId),
      contributors: 102,
      rewarded: 50,
      zeroTier: 52,
    });
    const ledgers = await mysql("world_boss_season_reward")
      .where({ season_id: fixture.seasonId })
      .orderBy("ranking");
    expect(ledgers).toHaveLength(102);
    expect(ledgers.every(row => row.paid_at)).toBe(true);
    expect(
      ledgers.slice(0, 2).map(row => ({
        ranking: row.ranking,
        stone: row.stone_amount,
        title: row.title_key,
      }))
    ).toEqual([
      { ranking: 1, stone: 100, title: "worldboss_annihilator" },
      { ranking: 1, stone: 100, title: "worldboss_annihilator" },
    ]);
    const rankThree = ledgers.find(row => row.ranking === 3);
    expect(rankThree).toMatchObject({ stone_amount: 60, title_key: "worldboss_vanguard" });
    const rank51 = ledgers.find(row => row.ranking === 51);
    expect(rank51).toMatchObject({ stone_amount: 0, title_key: null });
    await expect(service.getLatestSettledResult(rank51.user_id)).resolves.toMatchObject({
      seasonId: String(fixture.seasonId),
      ranking: 51,
      stoneAmount: 0,
      titleKey: null,
      paidAt: expect.any(Date),
    });
  });

  test("settles exact damage totals into distinct tiers and exact reward ledgers", async () => {
    const fixture = await createActiveFixture({ label: "exact_damage" });
    const topUser = owned("exact_top");
    const secondUser = owned("exact_second");
    await addContributions(fixture.seasonId, fixture.roundId, [
      { userId: topUser, damages: ["4503599627370496", "4503599627370497"] },
      { userId: secondUser, damages: ["4503599627370496", "4503599627370496"] },
    ]);
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });

    await expect(service.getRanking(fixture.seasonId, 100)).resolves.toEqual([
      { user_id: topUser, total_damage: "9007199254740993", ranking: 1 },
      { user_id: secondUser, total_damage: "9007199254740992", ranking: 2 },
    ]);
    await expect(service.settleSeason(fixture.seasonId)).resolves.toMatchObject({
      contributors: 2,
      rewarded: 2,
      zeroTier: 0,
    });

    const ledgers = await mysql("world_boss_season_reward")
      .where({ season_id: fixture.seasonId })
      .orderBy("ranking");
    expect(
      ledgers.map(row => ({
        userId: row.user_id,
        ranking: row.ranking,
        totalDamage: row.total_damage,
        stoneAmount: row.stone_amount,
        titleKey: row.title_key,
      }))
    ).toEqual([
      {
        userId: topUser,
        ranking: 1,
        totalDamage: "9007199254740993",
        stoneAmount: 100,
        titleKey: "worldboss_annihilator",
      },
      {
        userId: secondUser,
        ranking: 2,
        totalDamage: "9007199254740992",
        stoneAmount: 60,
        titleKey: "worldboss_vanguard",
      },
    ]);
    await expect(service.getLatestSettledResult(topUser)).resolves.toMatchObject({
      ranking: 1,
      totalDamage: "9007199254740993",
    });
  });

  test("preserves a BIGINT season id in settlement output", () => {
    const { settlementResult } = require("../WorldBossSeasonService");

    expect(settlementResult("9007199254740993", 2, 2, 0)).toEqual({
      seasonId: "9007199254740993",
      contributors: 2,
      rewarded: 2,
      zeroTier: 0,
    });
  });

  test("concurrent settlements make one payment and one paid ledger per contributor", async () => {
    const fixture = await createActiveFixture({ label: "concurrent_settle" });
    const userId = owned("concurrent_paid");
    await addContributions(fixture.seasonId, fixture.roundId, [{ userId, damages: [500] }]);
    const firstAtPayment = deferred();
    const releaseFirst = deferred();
    const firstService = createSeasonService({
      activeSlot: ACTIVE_SLOT,
      clock: () => now,
      hooks: {
        beforePayment: async () => {
          firstAtPayment.resolve();
          await releaseFirst.promise;
        },
      },
    });
    const secondService = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });

    const first = firstService.settleSeason(fixture.seasonId);
    await firstAtPayment.promise;
    const second = secondService.settleSeason(fixture.seasonId);
    releaseFirst.resolve();
    const results = await Promise.allSettled([first, second]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")[0].reason).toMatchObject({
      code: "SEASON_NOT_EXPIRED",
    });
    expect(await inventoryStoneTotal(userId)).toBe(100);
    await expect(
      mysql("world_boss_season_reward").where({ season_id: fixture.seasonId, user_id: userId })
    ).resolves.toEqual([expect.objectContaining({ paid_at: expect.any(Date) })]);
  });

  test("pre-owned titles are idempotent across later seasons while stones pay once", async () => {
    const title = await titleId("worldboss_annihilator");
    const userId = owned("preowned_title");
    await UserTitle.grantByPlatformId(userId, title);
    const first = await createActiveFixture({ label: "preowned_first" });
    await addContributions(first.seasonId, first.roundId, [{ userId, damages: [500] }]);
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    await expect(service.settleSeason(first.seasonId)).resolves.toMatchObject({ rewarded: 1 });

    const second = await createActiveFixture({ label: "preowned_second" });
    await addContributions(second.seasonId, second.roundId, [{ userId, damages: [600] }]);
    await expect(service.settleSeason(second.seasonId)).resolves.toMatchObject({ rewarded: 1 });

    expect(await inventoryStoneTotal(userId)).toBe(200);
    await expect(
      mysql("user_titles").where({ user_id: userId, title_id: title })
    ).resolves.toHaveLength(1);
    await expect(
      mysql("world_boss_season_reward").where({ user_id: userId }).whereNotNull("paid_at")
    ).resolves.toHaveLength(2);
  });

  test("forced Inventory failure rolls back ledger, stones, titles, paid_at, and status", async () => {
    const fixture = await createActiveFixture({ label: "rollback" });
    const firstUser = owned("rollback_first");
    const secondUser = owned("rollback_second");
    await addContributions(fixture.seasonId, fixture.roundId, [
      { userId: firstUser, damages: [500] },
      { userId: secondUser, damages: [400] },
    ]);
    const forced = new Error("forced Inventory failure");
    let calls = 0;
    const actualIncrease = inventory.increaseGodStone.bind(inventory);
    const increaseSpy = jest
      .spyOn(inventory, "increaseGodStone")
      .mockImplementation(async input => {
        calls += 1;
        if (calls === 2) throw forced;
        return actualIncrease(input);
      });
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    try {
      await expect(service.settleSeason(fixture.seasonId)).rejects.toBe(forced);
    } finally {
      increaseSpy.mockRestore();
    }

    expect(calls).toBe(2);
    await expect(
      mysql("world_boss_season_reward").where({ season_id: fixture.seasonId })
    ).resolves.toEqual([]);
    expect(await inventoryStoneTotal(firstUser)).toBe(0);
    expect(await inventoryStoneTotal(secondUser)).toBe(0);
    await expect(literalPrefix(mysql("user_titles"), "user_id")).resolves.toEqual([]);
    await expect(seasonRow(fixture.seasonId)).resolves.toMatchObject({
      status: "active",
      active_slot: ACTIVE_SLOT,
      settled_at: null,
    });
  });

  test("rejects a pre-existing unpaid ledger whose reward facts do not match ranking", async () => {
    const fixture = await createActiveFixture({ label: "mismatch" });
    const userId = owned("mismatch_user");
    await addContributions(fixture.seasonId, fixture.roundId, [{ userId, damages: [500] }]);
    await mysql("world_boss_season_reward").insert({
      season_id: fixture.seasonId,
      user_id: userId,
      ranking: 51,
      total_damage: 500,
      stone_amount: 0,
      title_key: null,
      paid_at: null,
    });
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });

    await expect(service.settleSeason(fixture.seasonId)).rejects.toMatchObject({
      code: "SETTLEMENT_INCOMPLETE",
    });
    expect(await inventoryStoneTotal(userId)).toBe(0);
    await expect(seasonRow(fixture.seasonId)).resolves.toMatchObject({ status: "active" });
  });

  test("completes a pre-existing unpaid ledger exactly once before settling", async () => {
    const fixture = await createActiveFixture({ label: "unpaid" });
    const userId = owned("unpaid_user");
    await addContributions(fixture.seasonId, fixture.roundId, [{ userId, damages: [500] }]);
    await mysql("world_boss_season_reward").insert({
      season_id: fixture.seasonId,
      user_id: userId,
      ranking: 1,
      total_damage: 500,
      stone_amount: 100,
      title_key: "worldboss_annihilator",
      paid_at: null,
    });
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });

    await expect(service.settleSeason(fixture.seasonId)).resolves.toEqual({
      seasonId: String(fixture.seasonId),
      contributors: 1,
      rewarded: 1,
      zeroTier: 0,
    });
    expect(await inventoryStoneTotal(userId)).toBe(100);
    await expect(
      mysql("world_boss_season_reward").where({ season_id: fixture.seasonId, user_id: userId })
    ).resolves.toEqual([expect.objectContaining({ paid_at: now })]);
    await expect(service.settleSeason(fixture.seasonId)).rejects.toMatchObject({
      code: "SEASON_NOT_EXPIRED",
    });
    expect(await inventoryStoneTotal(userId)).toBe(100);
  });

  test("rejects settlement when any contributor proof is missing or unpaid", async () => {
    const fixture = await createActiveFixture({ label: "incomplete" });
    const firstUser = owned("incomplete_a");
    const secondUser = owned("incomplete_b");
    await addContributions(fixture.seasonId, fixture.roundId, [
      { userId: firstUser, damages: [500] },
      { userId: secondUser, damages: [400] },
    ]);
    const service = createSeasonService({
      activeSlot: ACTIVE_SLOT,
      clock: () => now,
      hooks: {
        beforePayment: async ({ userId, trx }) => {
          if (userId === secondUser) {
            await trx("world_boss_season_reward")
              .where({ season_id: fixture.seasonId, user_id: firstUser })
              .update({ paid_at: null });
          }
        },
      },
    });

    await expect(service.settleSeason(fixture.seasonId)).rejects.toMatchObject({
      code: "SETTLEMENT_INCOMPLETE",
    });
    await expect(
      mysql("world_boss_season_reward").where({ season_id: fixture.seasonId })
    ).resolves.toEqual([]);
    await expect(seasonRow(fixture.seasonId)).resolves.toMatchObject({ status: "active" });
  });

  test("exact proof rejects an extra paid ghost ledger", async () => {
    const fixture = await createActiveFixture({ label: "ghost" });
    const userId = owned("ghost_real");
    await addContributions(fixture.seasonId, fixture.roundId, [{ userId, damages: [500] }]);
    await mysql("world_boss_season_reward").insert({
      season_id: fixture.seasonId,
      user_id: owned("ghost_extra"),
      ranking: 99,
      total_damage: 1,
      stone_amount: 0,
      title_key: null,
      paid_at: now,
    });
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });

    await expect(service.settleSeason(fixture.seasonId)).rejects.toMatchObject({
      code: "SETTLEMENT_INCOMPLETE",
    });
    expect(await inventoryStoneTotal(userId)).toBe(0);
    await expect(seasonRow(fixture.seasonId)).resolves.toMatchObject({ status: "active" });
  });

  test("latest settled result remains discoverable after a newer active season opens", async () => {
    const first = await createActiveFixture({ label: "latest_settled" });
    const userId = owned("latest_user");
    await addContributions(first.seasonId, first.roundId, [{ userId, damages: [500] }]);
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    await service.settleSeason(first.seasonId);

    await createBoss("latest_new_boss");
    const newerId = await service.createSeason({ name: owned("latest_new"), end_time: later });
    await service.openSeason(newerId);

    await expect(service.getLatestSettledResult(userId)).resolves.toMatchObject({
      rewardId: expect.stringMatching(/^[1-9]\d*$/),
      seasonId: String(first.seasonId),
      ranking: 1,
      stoneAmount: 100,
      titleKey: "worldboss_annihilator",
      paidAt: expect.any(Date),
      settledAt: expect.any(Date),
    });
  });

  test("settles every expired season found in deterministic order", async () => {
    const first = await createActiveFixture({ label: "expired_first" });
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    await addContributions(first.seasonId, first.roundId, [
      { userId: owned("expired_user"), damages: [100] },
    ]);

    const results = await service.settleExpiredSeasons();
    expect(results).toEqual([
      { seasonId: String(first.seasonId), contributors: 1, rewarded: 1, zeroTier: 0 },
    ]);
    await expect(service.settleExpiredSeasons()).resolves.toEqual([]);
  });
});

describe("UserTitle lifecycle preservation", () => {
  test("grantByPlatformId ignores only the named duplicate and rethrows unrelated DB errors", async () => {
    const userId = owned("grant_exact");
    const ownedTitle = ownedTitleIds[0];
    await expect(UserTitle.grantByPlatformId(userId, ownedTitle)).resolves.toBeDefined();
    await expect(UserTitle.grantByPlatformId(userId, ownedTitle)).resolves.toBeUndefined();
    await expect(
      mysql("user_titles").where({ user_id: userId, title_id: ownedTitle })
    ).resolves.toHaveLength(1);
    await expect(UserTitle.grantByPlatformId(owned("bad_title"), 4294967295)).rejects.toMatchObject(
      {
        code: "ER_NO_REFERENCED_ROW_2",
      }
    );
  });

  test("clearAllExcept preserves shared non-worldboss title assignments outside rollback", async () => {
    const unrelatedTitle = await mysql("titles").whereNot("key", "like", "worldboss\\_%").first();
    expect(unrelatedTitle).toBeDefined();
    const sentinelUser = owned("clear_sentinel");
    await mysql("user_titles").insert({ user_id: sentinelUser, title_id: unrelatedTitle.id });
    const sharedBefore = await sharedTitleSnapshot();
    expect(sharedBefore).toContainEqual(
      expect.objectContaining({ user_id: sentinelUser, title_id: unrelatedTitle.id })
    );
    const ownedTitle = ownedTitleIds[0];
    const worldbossUser = owned("clear_worldboss");
    const unrelatedUser = owned("clear_unrelated");

    const trx = await mysql.transaction();
    try {
      await trx("user_titles").insert([
        { user_id: worldbossUser, title_id: ownedTitle },
        { user_id: unrelatedUser, title_id: unrelatedTitle.id },
      ]);
      await UserTitle.clearAllExcept("worldboss_", trx);
      await expect(trx("user_titles").where({ user_id: worldbossUser })).resolves.toHaveLength(1);
      await expect(trx("user_titles").where({ user_id: unrelatedUser })).resolves.toHaveLength(0);
    } finally {
      await trx.rollback();
    }

    await expect(sharedTitleSnapshot()).resolves.toEqual(sharedBefore);
    await expect(
      mysql("user_titles").where({ user_id: sentinelUser, title_id: unrelatedTitle.id }).first()
    ).resolves.toBeDefined();
  });
});
