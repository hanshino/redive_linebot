require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
const {
  PREFIX,
  ACTIVE_SLOT,
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
  deleteSeasonTree,
} = require("../../__tests__/helpers/worldBossFixture");
const testDatabase = createWorldBossTestDatabase("season");
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);
const { inventory } = require("../../model/application/Inventory");
const UserTitle = require("../../model/application/UserTitle");
const WorldBossSeasonBoss = require("../../model/application/WorldBossSeasonBoss");
const WorldBossRound = require("../../model/application/WorldBossRound");
const WorldBossRoundEffect = require("../../model/application/WorldBossRoundEffect");
const { createSeasonService } = require("../WorldBossSeasonService");

const prefix = `${PREFIX}season_`;
const now = new Date("2026-07-20T04:00:00.000Z");
const later = new Date("2026-07-21T04:00:00.000Z");
const ROSTER_SIZE = WorldBossSeasonBoss.ROSTER_SIZE;
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
  await deleteSeasonTree(
    mysql,
    seasons.map(row => row.id)
  );
  await literalPrefix(mysql("inventory"), "userId").del();
  await literalPrefix(mysql("user_titles"), "user_id").del();
  await literalPrefix(mysql("world_boss"), "name").del();
  await literalPrefix(mysql("user"), "platform_id").del();
}

async function sharedTitleSnapshot() {
  return mysql("user_titles as owned")
    .join("titles as title", "owned.title_id", "title.id")
    .whereNot("title.key", "like", "worldboss\\_%")
    .select("owned.id", "owned.user_id", "owned.title_id", "owned.granted_at")
    .orderBy("owned.id");
}

/**
 * Creates ROSTER_SIZE catalog bosses with distinct weights so snapshot assertions can
 * tell one roster slot from another.
 */
async function createBosses(label, count = ROSTER_SIZE) {
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const [id] = await mysql("world_boss").insert({
      name: owned(`${label}_${index + 1}`),
      hp_weight: 1 + index / 10,
      description: owned(`${label}_desc_${index + 1}`),
    });
    ids.push(id);
  }
  return ids;
}

async function createSeasonRow({
  label,
  status = "draft",
  activeSlot = status === "active" ? ACTIVE_SLOT : null,
  startTime = status === "active" ? new Date(now.getTime() - 1000) : null,
  endTime = later,
  settledAt = status === "settled" ? now : null,
  bossIds = null,
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
  const roster = bossIds || (await createBosses(`${label}_roster`));
  await mysql.transaction(trx => WorldBossSeasonBoss.replaceForSeason(trx, id, roster));
  return id;
}

async function createActiveFixture({ label, endTime = now } = {}) {
  const seasonId = await createSeasonRow({ label: `${label}_season`, status: "active", endTime });
  const roster = await WorldBossSeasonBoss.listBySeason(seasonId);
  await mysql("world_boss_round").insert(
    roster.map(entry => ({
      season_boss_id: entry.id,
      cycle_no: 1,
      max_hp: 1000,
      current_hp: 700,
      cleared_at: null,
    }))
  );
  const rounds = await WorldBossRound.listCycle(seasonId, 1);
  return { seasonId, roster, rounds, roundId: rounds[0].id };
}

/**
 * Seeds one v2 attack per damage value: a contribution plus its `direct` score event.
 * Score and damage are equal here so a test that only cares about ranking can keep using
 * a single number; tests that need them to diverge use `addScoreEvents` / `addLegacy`.
 */
async function addContributions(seasonId, roundId, rows) {
  for (const { userId, damages } of rows) {
    for (const [index, damage] of damages.entries()) {
      const at = new Date(now.getTime() + index);
      const [contributionId] = await mysql("world_boss_contribution").insert({
        season_id: seasonId,
        round_id: roundId,
        user_id: userId,
        raw_damage: String(damage),
        effect_damage: 0,
        job_key: "swordman",
        damage,
        cost: 1,
        created_at: at,
        updated_at: at,
      });
      await mysql("world_boss_score_event").insert({
        season_id: seasonId,
        round_id: roundId,
        contribution_id: contributionId,
        effect_id: null,
        beneficiary_user_id: userId,
        kind: "direct",
        points: String(damage),
        created_at: at,
        updated_at: at,
      });
    }
  }
}

/**
 * Seeds a v1 contribution and the legacy `direct` event the migration backfills for it:
 * points equal contribution.damage and `raw_damage` stays NULL.
 */
async function addLegacyContribution(seasonId, roundId, userId, damage) {
  const [contributionId] = await mysql("world_boss_contribution").insert({
    season_id: seasonId,
    round_id: roundId,
    user_id: userId,
    raw_damage: null,
    effect_damage: 0,
    job_key: null,
    damage,
    cost: 1,
    created_at: now,
    updated_at: now,
  });
  await mysql("world_boss_score_event").insert({
    season_id: seasonId,
    round_id: roundId,
    contribution_id: contributionId,
    effect_id: null,
    beneficiary_user_id: userId,
    kind: "direct",
    points: String(damage),
    created_at: now,
    updated_at: now,
  });
  return contributionId;
}

/**
 * Attaches extra score events (assist / relay) to an existing contribution, which is how a
 * beneficiary can outscore the damage they personally dealt.
 */
async function addScoreEvents(seasonId, roundId, contributionId, effectId, events) {
  await mysql("world_boss_score_event").insert(
    events.map(({ userId, kind, points }) => ({
      season_id: seasonId,
      round_id: roundId,
      contribution_id: contributionId,
      effect_id: effectId,
      beneficiary_user_id: userId,
      kind,
      points: String(points),
      created_at: now,
      updated_at: now,
    }))
  );
}

async function addEffect(seasonId, roundId, sourceContributionId, sourceUserId, value) {
  const [id] = await mysql("world_boss_round_effect").insert({
    season_id: seasonId,
    round_id: roundId,
    source_contribution_id: sourceContributionId,
    source_user_id: sourceUserId,
    effect_type: "banner",
    value: String(value),
    consumed_by_contribution_id: null,
    created_at: now,
    updated_at: now,
  });
  return id;
}

/**
 * The driver returns a small BIGINT as a JS number and a large one as a string, so ledger
 * assertions compare canonical decimal strings rather than whatever the wire produced.
 */
function ledgerFacts(row) {
  return [row.user_id, row.ranking, String(row.total_score), String(row.total_damage)];
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
  await expect(testDatabase.setup()).resolves.toMatch(/^Princess_wbtest_season_/);
  ownedTitleIds = (await mysql("titles").whereIn("key", worldBossTitleKeys).select("id")).map(
    row => row.id
  );
  expect(ownedTitleIds).toHaveLength(2);
  await cleanupOwned();
}, SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await cleanupOwned();
});

afterEach(async () => {
  await cleanupOwned();
});

afterAll(() => testDatabase.teardown());

describe("WorldBossSeasonService CRUD and opening", () => {
  test("lists newest seasons deterministically and only mutates drafts", async () => {
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    const firstId = await createSeasonRow({ label: "list_first" });
    const secondId = await createSeasonRow({ label: "list_second" });
    await mysql("world_boss_season").whereIn("id", [firstId, secondId]).update({ created_at: now });

    const rows = (await service.listSeasons()).filter(row => row.name.startsWith(prefix));
    expect(rows.map(row => Number(row.id))).toEqual([secondId, firstId]);

    const bossIds = await createBosses("crud");
    const createdId = await service.createSeason({
      name: owned("crud"),
      announcement: "created",
      end_time: later,
      boss_ids: bossIds,
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
    await expect(service.getSeasonRoster(createdId)).resolves.toMatchObject(
      bossIds.map((bossId, index) => ({
        position: index + 1,
        world_boss_id: bossId,
        name: owned(`crud_${index + 1}`),
      }))
    );

    const reordered = [...bossIds].reverse();
    await expect(
      service.updateSeason(createdId, {
        name: owned("crud_updated"),
        announcement: "updated",
        end_time: new Date(later.getTime() + 1000),
        boss_ids: reordered,
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
    await expect(service.getSeasonRoster(createdId)).resolves.toMatchObject(
      reordered.map((bossId, index) => ({ position: index + 1, world_boss_id: bossId }))
    );

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

    // Deleting a draft cascades its roster away.
    await expect(service.deleteSeason(createdId)).resolves.toBe(createdId);
    await expect(seasonRow(createdId)).resolves.toBeUndefined();
    await expect(service.getSeasonRoster(createdId)).resolves.toEqual([]);
    await expect(service.updateSeason(999999999, { name: owned("missing") })).rejects.toMatchObject(
      {
        code: "SEASON_NOT_FOUND",
      }
    );
  });

  test("requires exactly five distinct roster bosses on create and update", async () => {
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    const bossIds = await createBosses("roster_validation", 6);
    const base = { name: owned("roster_validation"), end_time: later };

    for (const bossIdsInput of [
      undefined,
      null,
      "not-an-array",
      [],
      bossIds.slice(0, 4),
      bossIds.slice(0, 6),
    ]) {
      await expect(service.createSeason({ ...base, boss_ids: bossIdsInput })).rejects.toMatchObject(
        { code: "INVALID_ROSTER_SIZE" }
      );
    }
    for (const bossIdsInput of [
      [bossIds[0], bossIds[1], bossIds[2], bossIds[3], 0],
      [bossIds[0], bossIds[1], bossIds[2], bossIds[3], -1],
      [bossIds[0], bossIds[1], bossIds[2], bossIds[3], 1.5],
      [bossIds[0], bossIds[1], bossIds[2], bossIds[3], "abc"],
      [bossIds[0], bossIds[1], bossIds[2], bossIds[3], null],
    ]) {
      await expect(service.createSeason({ ...base, boss_ids: bossIdsInput })).rejects.toMatchObject(
        { code: "INVALID_ROSTER_BOSS_ID" }
      );
    }
    await expect(
      service.createSeason({
        ...base,
        boss_ids: [bossIds[0], bossIds[0], bossIds[1], bossIds[2], bossIds[3]],
      })
    ).rejects.toMatchObject({ code: "DUPLICATE_ROSTER_BOSS" });
    await expect(
      service.createSeason({
        ...base,
        boss_ids: [bossIds[0], bossIds[1], bossIds[2], bossIds[3], 999999999],
      })
    ).rejects.toMatchObject({ code: "ROSTER_BOSS_NOT_FOUND" });
    await expect(
      literalPrefix(mysql("world_boss_season"), "name", owned("roster_validation"))
    ).resolves.toEqual([]);

    const validId = await service.createSeason({ ...base, boss_ids: bossIds.slice(0, 5) });
    const before = await service.getSeasonRoster(validId);
    await expect(
      service.updateSeason(validId, { boss_ids: bossIds.slice(0, 4) })
    ).rejects.toMatchObject({ code: "INVALID_ROSTER_SIZE" });
    await expect(
      service.updateSeason(validId, {
        boss_ids: [bossIds[0], bossIds[0], bossIds[1], bossIds[2], bossIds[3]],
      })
    ).rejects.toMatchObject({ code: "DUPLICATE_ROSTER_BOSS" });
    await expect(service.getSeasonRoster(validId)).resolves.toEqual(before);
  });

  test("validates names and dates at the trust boundary and makes start_time server-owned", async () => {
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    const bossIds = await createBosses("date_validation");
    for (const name of [undefined, "", "   ", "x".repeat(65)]) {
      await expect(
        service.createSeason({ name, end_time: later, boss_ids: bossIds })
      ).rejects.toMatchObject({ code: "INVALID_NAME" });
    }
    for (const endTime of [undefined, null, "not-a-date", now, new Date(now.getTime() - 1)]) {
      await expect(
        service.createSeason({
          name: owned("invalid_date"),
          end_time: endTime,
          boss_ids: bossIds,
        })
      ).rejects.toMatchObject({ code: "INVALID_END_TIME" });
    }

    const id = await service.createSeason({
      name: `  ${owned("trimmed")}  `,
      end_time: later.toISOString(),
      boss_ids: bossIds,
      start_time: new Date("2040-01-01T00:00:00.000Z"),
    });
    await expect(seasonRow(id)).resolves.toMatchObject({
      name: owned("trimmed"),
      start_time: null,
    });
    await service.updateSeason(id, { start_time: new Date("2041-01-01T00:00:00.000Z") });
    await expect(seasonRow(id)).resolves.toMatchObject({ start_time: null });

    const opened = await service.openSeason(id);
    expect(opened.seasonId).toBe(id);
    expect(opened.cycleNo).toBe(1);
    expect(opened.rounds).toHaveLength(ROSTER_SIZE);
    await expect(seasonRow(id)).resolves.toMatchObject({
      status: "active",
      active_slot: ACTIVE_SLOT,
      start_time: now,
    });
  });

  test("opening re-snapshots the roster and creates exactly five cycle-1 encounters", async () => {
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    const bossIds = await createBosses("open_snapshot");
    const id = await service.createSeason({
      name: owned("open_snapshot"),
      end_time: later,
      boss_ids: bossIds,
    });
    // Catalog edits before opening must be picked up; edits after must not.
    await mysql("world_boss")
      .where({ id: bossIds[0] })
      .update({ name: owned("open_snapshot_renamed"), hp_weight: 2, description: "renamed" });

    const opened = await service.openSeason(id);
    expect(opened.roster[0]).toMatchObject({
      position: 1,
      name: owned("open_snapshot_renamed"),
      hp_weight: "2.000",
      description: "renamed",
    });
    expect(opened.rounds).toHaveLength(ROSTER_SIZE);
    expect(opened.rounds.map(row => row.position)).toEqual([1, 2, 3, 4, 5]);
    // Cycle 1 base HP is 30000; boss 1's weight 2 doubles it, the rest use 1.0..1.4.
    expect(opened.rounds.map(row => Number(row.max_hp))).toEqual([
      60000, 33000, 36000, 39000, 42000,
    ]);
    expect(opened.rounds.map(row => Number(row.current_hp))).toEqual([
      60000, 33000, 36000, 39000, 42000,
    ]);
    expect(opened.rounds.every(row => row.cleared_at === null)).toBe(true);

    await mysql("world_boss")
      .where({ id: bossIds[0] })
      .update({ name: owned("after_open") });
    await expect(service.getSeasonRoster(id)).resolves.toMatchObject([
      { position: 1, name: owned("open_snapshot_renamed") },
      ...bossIds.slice(1).map((_, index) => ({ position: index + 2 })),
    ]);
  });

  test("concurrent opens produce exactly one active season and one cycle of five", async () => {
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
    const active = await mysql("world_boss_season").where({
      status: "active",
      active_slot: ACTIVE_SLOT,
    });
    expect(active).toHaveLength(1);
    const cycle = await WorldBossRound.listCurrentCycle(active[0].id);
    expect(cycle).toMatchObject({ cycleNo: 1 });
    expect(cycle.rounds).toHaveLength(ROSTER_SIZE);
    // The season that lost the race must have no encounters at all.
    const loserId = Number(active[0].id) === firstId ? secondId : firstId;
    await expect(WorldBossRound.listCurrentCycle(loserId)).resolves.toEqual({
      cycleNo: 0,
      rounds: [],
    });
  });

  test("deadlock retry uses a new transaction and reruns validation before committing", async () => {
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

    await expect(service.openSeason(id)).resolves.toMatchObject({ seasonId: id, cycleNo: 1 });
    expect(attempts).toEqual([1, 2]);
    expect(trxObjects[0]).not.toBe(trxObjects[1]);
    await expect(seasonRow(id)).resolves.toMatchObject({
      status: "active",
      active_slot: ACTIVE_SLOT,
    });
    // The rolled-back first attempt must not leave a partial cycle.
    await expect(WorldBossRound.listCycle(id, 1)).resolves.toHaveLength(ROSTER_SIZE);
  });

  test("maps an exhausted deadlock retry to the deterministic winner", async () => {
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
    await expect(WorldBossRound.listCurrentCycle(losingId)).resolves.toEqual({
      cycleNo: 0,
      rounds: [],
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
    await mysql("user").insert([
      { platform: "line", platform_id: owned("rank_a"), display_name: "甲" },
      { platform: "line", platform_id: owned("rank_b"), display_name: "   " },
    ]);

    const status = await service.getBattleStatus();
    expect(status).toMatchObject({
      season: { id: fixture.seasonId },
      cycleNo: 1,
      ended: true,
    });
    expect(status.rounds).toHaveLength(ROSTER_SIZE);
    expect(status.rounds.map(row => row.position)).toEqual([1, 2, 3, 4, 5]);
    expect(status.rounds.map(row => Number(row.current_hp))).toEqual(
      new Array(ROSTER_SIZE).fill(700)
    );

    const ranking = await service.getRanking(fixture.seasonId, 100);
    expect(ranking.map(row => row.ranking)).toEqual([1, 1, 3]);
    expect(ranking.map(row => row.display_name)).toEqual(["甲", null, null]);
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

  test("enriches live rounds with grouped pending effects and clears stale counts", async () => {
    const fixture = await createActiveFixture({ label: "pending_effects" });
    const [sourceContributionId] = await mysql("world_boss_contribution").insert({
      season_id: fixture.seasonId,
      round_id: fixture.roundId,
      user_id: owned("effect_source"),
      raw_damage: "100",
      effect_damage: 0,
      job_key: "adventurer",
      damage: 100,
      cost: 1,
      created_at: now,
      updated_at: now,
    });
    const secondRound = fixture.rounds[1];
    const [secondContributionId] = await mysql("world_boss_contribution").insert({
      season_id: fixture.seasonId,
      round_id: secondRound.id,
      user_id: owned("effect_source_2"),
      raw_damage: "100",
      effect_damage: 0,
      job_key: "mage",
      damage: 100,
      cost: 1,
      created_at: now,
      updated_at: now,
    });
    await WorldBossRoundEffect.insert(mysql, {
      season_id: fixture.seasonId,
      round_id: fixture.roundId,
      source_contribution_id: sourceContributionId,
      source_user_id: owned("effect_source"),
      effect_type: "banner",
      value: 25,
    });
    await WorldBossRoundEffect.insert(mysql, {
      season_id: fixture.seasonId,
      round_id: fixture.roundId,
      source_contribution_id: secondContributionId,
      source_user_id: owned("effect_source_2"),
      effect_type: "seal",
      value: 50,
    });
    await mysql("world_boss_round").where({ id: secondRound.id }).update({
      current_hp: 0,
      cleared_at: now,
    });

    const status = await createSeasonService({
      activeSlot: ACTIVE_SLOT,
      clock: () => now,
    }).getBattleStatus();
    expect(status.rounds[0].pending_effects).toEqual({ banner: 1, seal: 1 });
    expect(status.rounds[1].pending_effects).toEqual({ banner: 0, seal: 0 });
    expect(status.rounds.slice(2).map(round => round.pending_effects)).toEqual([
      { banner: 0, seal: 0 },
      { banner: 0, seal: 0 },
      { banner: 0, seal: 0 },
    ]);
  });

  test("batch-enriches ranking names once without changing ranking rows", async () => {
    const fixture = await createActiveFixture({ label: "ranking_names" });
    const rows = [
      { userId: owned("named"), damages: [500] },
      { userId: owned("missing"), damages: [400] },
      { userId: owned("blank"), damages: [300] },
    ];
    await addContributions(fixture.seasonId, fixture.roundId, rows);
    await mysql("user").insert([
      { platform: "line", platform_id: owned("named"), display_name: "玩家甲" },
      { platform: "line", platform_id: owned("blank"), display_name: "  " },
    ]);
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    const userQueries = [];
    const onQuery = query => {
      if (/from [`]?user[`]?/i.test(query.sql)) userQueries.push(query.sql);
    };
    mysql.on("query", onQuery);
    try {
      await expect(service.getRanking(fixture.seasonId, 2)).resolves.toEqual([
        { user_id: owned("named"), total_score: "500", ranking: 1, display_name: "玩家甲" },
        { user_id: owned("missing"), total_score: "400", ranking: 2, display_name: null },
      ]);
    } finally {
      mysql.removeListener("query", onQuery);
    }
    expect(userQueries).toHaveLength(1);
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

  test("settles exact score totals into distinct tiers and exact reward ledgers", async () => {
    const fixture = await createActiveFixture({ label: "exact_damage" });
    const topUser = owned("exact_top");
    const secondUser = owned("exact_second");
    await addContributions(fixture.seasonId, fixture.roundId, [
      { userId: topUser, damages: ["4503599627370496", "4503599627370497"] },
      { userId: secondUser, damages: ["4503599627370496", "4503599627370496"] },
    ]);
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });

    await expect(service.getRanking(fixture.seasonId, 100)).resolves.toEqual([
      { user_id: topUser, total_score: "9007199254740993", ranking: 1, display_name: null },
      { user_id: secondUser, total_score: "9007199254740992", ranking: 2, display_name: null },
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
        totalScore: row.total_score,
        totalDamage: row.total_damage,
        stoneAmount: row.stone_amount,
        titleKey: row.title_key,
      }))
    ).toEqual([
      {
        userId: topUser,
        ranking: 1,
        totalScore: "9007199254740993",
        totalDamage: "9007199254740993",
        stoneAmount: 100,
        titleKey: "worldboss_annihilator",
      },
      {
        userId: secondUser,
        ranking: 2,
        totalScore: "9007199254740992",
        totalDamage: "9007199254740992",
        stoneAmount: 60,
        titleKey: "worldboss_vanguard",
      },
    ]);
    await expect(service.getLatestSettledResult(topUser)).resolves.toMatchObject({
      ranking: 1,
      totalScore: "9007199254740993",
      totalDamage: "9007199254740993",
    });
  });

  test("ranks by score, not damage, and stores both in the ledger", async () => {
    const fixture = await createActiveFixture({ label: "score_ranking" });
    // The bruiser removes the most HP; the supporter deals less but banks assist + relay
    // score, so the score leaderboard inverts the damage leaderboard.
    const bruiser = owned("score_bruiser");
    const supporter = owned("score_supporter");
    await addContributions(fixture.seasonId, fixture.roundId, [
      { userId: bruiser, damages: [500] },
      { userId: supporter, damages: [300] },
    ]);
    const [supporterContribution] = await mysql("world_boss_contribution")
      .where({ season_id: fixture.seasonId, user_id: supporter })
      .select("id");
    const effectId = await addEffect(
      fixture.seasonId,
      fixture.roundId,
      supporterContribution.id,
      supporter,
      75
    );
    await addScoreEvents(
      fixture.seasonId,
      fixture.roundId,
      supporterContribution.id,
      effectId,
      // 300 direct + 150 from assisting = 450, still below the bruiser.
      [{ userId: supporter, kind: "assist", points: 150 }]
    );
    // A second assist on a different contribution pushes the supporter past 500.
    const [bruiserContribution] = await mysql("world_boss_contribution")
      .where({ season_id: fixture.seasonId, user_id: bruiser })
      .select("id");
    const secondEffect = await addEffect(
      fixture.seasonId,
      fixture.roundId,
      bruiserContribution.id,
      bruiser,
      100
    );
    await addScoreEvents(fixture.seasonId, fixture.roundId, bruiserContribution.id, secondEffect, [
      { userId: supporter, kind: "relay", points: 100 },
    ]);
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });

    await expect(service.getRanking(fixture.seasonId, 100)).resolves.toEqual([
      { user_id: supporter, total_score: "550", ranking: 1, display_name: null },
      { user_id: bruiser, total_score: "500", ranking: 2, display_name: null },
    ]);
    await expect(service.settleSeason(fixture.seasonId)).resolves.toMatchObject({
      contributors: 2,
      rewarded: 2,
    });
    const ledgers = await mysql("world_boss_season_reward")
      .where({ season_id: fixture.seasonId })
      .orderBy("ranking");
    expect(ledgers.map(ledgerFacts)).toEqual([
      [supporter, 1, "550", "300"],
      [bruiser, 2, "500", "500"],
    ]);
  });

  test("settles a mixed v1 legacy and v2 season on one leaderboard", async () => {
    const fixture = await createActiveFixture({ label: "mixed_season" });
    const legacyUser = owned("mixed_legacy");
    const mixedUser = owned("mixed_both");
    const v2User = owned("mixed_v2");
    // v1-only player: raw_damage NULL, score comes purely from the legacy backfill.
    await addLegacyContribution(fixture.seasonId, fixture.roundId, legacyUser, 300);
    // Returning player: 300 legacy + 100 v2 direct + 50 assist + 50 relay = 500.
    await addLegacyContribution(fixture.seasonId, fixture.roundId, mixedUser, 300);
    await addContributions(fixture.seasonId, fixture.roundId, [
      { userId: mixedUser, damages: [100] },
      { userId: v2User, damages: [400] },
    ]);
    const [mixedV2] = await mysql("world_boss_contribution")
      .where({ season_id: fixture.seasonId, user_id: mixedUser })
      .whereNotNull("raw_damage")
      .select("id");
    const effectId = await addEffect(fixture.seasonId, fixture.roundId, mixedV2.id, mixedUser, 50);
    await addScoreEvents(fixture.seasonId, fixture.roundId, mixedV2.id, effectId, [
      { userId: mixedUser, kind: "assist", points: 50 },
      { userId: mixedUser, kind: "relay", points: 50 },
    ]);
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });

    // Nobody who played v1 is zeroed out by the switch.
    await expect(service.getRanking(fixture.seasonId, 100)).resolves.toEqual([
      { user_id: mixedUser, total_score: "500", ranking: 1, display_name: null },
      { user_id: v2User, total_score: "400", ranking: 2, display_name: null },
      { user_id: legacyUser, total_score: "300", ranking: 3, display_name: null },
    ]);
    await expect(service.getUserSeasonStats(fixture.seasonId, mixedUser)).resolves.toEqual({
      seasonId: String(fixture.seasonId),
      totalScore: "500",
      score: { direct: "400", assist: "50", relay: "50" },
      // The v1 row contributes 300 to effective only; raw/effect/overkill stay v2-only.
      damage: { raw: "100", effect: "0", effective: "400", overkill: "0" },
    });
    await expect(service.getUserSeasonStats(fixture.seasonId, legacyUser)).resolves.toEqual({
      seasonId: String(fixture.seasonId),
      totalScore: "300",
      score: { direct: "300", assist: "0", relay: "0" },
      damage: { raw: "0", effect: "0", effective: "300", overkill: "0" },
    });

    await expect(service.settleSeason(fixture.seasonId)).resolves.toMatchObject({
      contributors: 3,
      rewarded: 3,
    });
    const ledgers = await mysql("world_boss_season_reward")
      .where({ season_id: fixture.seasonId })
      .orderBy("ranking");
    expect(ledgers.map(ledgerFacts)).toEqual([
      [mixedUser, 1, "500", "400"],
      [v2User, 2, "400", "400"],
      [legacyUser, 3, "300", "300"],
    ]);
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
    const service = createSeasonService({ activeSlot: ACTIVE_SLOT, clock: () => now });
    const correct = {
      season_id: fixture.seasonId,
      user_id: userId,
      ranking: 1,
      total_score: 500,
      total_damage: 500,
      stone_amount: 100,
      title_key: "worldboss_annihilator",
      paid_at: null,
    };

    // Every fact the ledger records is proof-checked, including both aggregates
    // independently: a ledger that matches on damage but not on score must still fail.
    for (const wrong of [
      { ranking: 51, stone_amount: 0, title_key: null },
      { total_score: 499 },
      { total_damage: 499 },
      { total_score: null },
      { stone_amount: 60 },
      { title_key: "worldboss_vanguard" },
    ]) {
      await mysql("world_boss_season_reward").where({ season_id: fixture.seasonId }).del();
      await mysql("world_boss_season_reward").insert({ ...correct, ...wrong });
      await expect(service.settleSeason(fixture.seasonId)).rejects.toMatchObject({
        code: "SETTLEMENT_INCOMPLETE",
      });
      expect(await inventoryStoneTotal(userId)).toBe(0);
      await expect(seasonRow(fixture.seasonId)).resolves.toMatchObject({ status: "active" });
    }
  });

  test("completes a pre-existing unpaid ledger exactly once before settling", async () => {
    const fixture = await createActiveFixture({ label: "unpaid" });
    const userId = owned("unpaid_user");
    await addContributions(fixture.seasonId, fixture.roundId, [{ userId, damages: [500] }]);
    await mysql("world_boss_season_reward").insert({
      season_id: fixture.seasonId,
      user_id: userId,
      ranking: 1,
      total_score: 500,
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
      total_score: 1,
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

    const newerId = await service.createSeason({
      name: owned("latest_new"),
      end_time: later,
      boss_ids: await createBosses("latest_new_roster"),
    });
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
