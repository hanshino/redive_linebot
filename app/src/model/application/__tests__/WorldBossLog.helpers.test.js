require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossLog = require("../WorldBossLog");

let dbUp = true;
let eventId;
let uidA; // numeric user.id
let uidB;

describe("WorldBossLog query helpers (LOCK §E)", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      console.warn(
        'SKIP: WorldBossLog helper tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("user").whereIn("platform_id", ["UwblA", "UwblB"]).delete();
    [uidA] = await mysql("user").insert({ platform: "line", platform_id: "UwblA" });
    [uidB] = await mysql("user").insert({ platform: "line", platform_id: "UwblB" });

    await mysql("world_boss").where({ name: "T-WBL" }).delete();
    const [bossId] = await mysql("world_boss").insert({
      name: "T-WBL",
      hp: 100000,
      level: 1,
      exp: 0,
      gold: 0,
    });
    [eventId] = await mysql("world_boss_event").insert({
      world_boss_id: bossId,
      announcement: "t",
      start_time: "2026-06-20 00:00:00",
      end_time: "2026-06-21 00:00:00",
      status: "active",
    });
  });

  afterEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_event_log").where({ world_boss_event_id: eventId }).delete();
    await mysql("world_boss_event").where({ id: eventId }).delete();
    await mysql("world_boss").where({ name: "T-WBL" }).delete();
    await mysql("user").whereIn("platform_id", ["UwblA", "UwblB"]).delete();
  });

  afterAll(() => mysql.destroy());

  test("createWithRole inserts a row with role + contribution", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "sword|skillOne",
      damage: 500,
      cost: 10,
      contribution: 500,
    });
    const row = await mysql("world_boss_event_log")
      .where({ world_boss_event_id: eventId, user_id: uidA })
      .first();
    expect(row.role).toBe("dps");
    expect(row.contribution).toBe(500);
    expect(row.damage).toBe(500);
  });

  test("createWithRole honors an outer transaction (rollback drops the row)", async () => {
    if (!dbUp) return;
    await mysql.transaction(async trx => {
      await WorldBossLog.createWithRole(
        {
          user_id: uidA,
          world_boss_event_id: eventId,
          role: "tank",
          action_type: "block",
          damage: 0,
          cost: 10,
          contribution: 1,
        },
        trx
      );
      await trx.rollback();
    });
    const row = await mysql("world_boss_event_log")
      .where({ world_boss_event_id: eventId, user_id: uidA })
      .first();
    expect(row).toBeUndefined();
  });

  test("getDamageRank returns both ids ordered by SUM(damage) desc", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 100,
      cost: 10,
      contribution: 100,
    });
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 50,
      cost: 10,
      contribution: 50,
    });
    await WorldBossLog.createWithRole({
      user_id: uidB,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 80,
      cost: 10,
      contribution: 80,
    });
    const rank = await WorldBossLog.getDamageRank({ eventId, limit: 10 });
    expect(rank).toHaveLength(2);
    expect(rank[0].user_id).toBe(uidA);
    expect(rank[0].platform_id).toBe("UwblA");
    expect(Number(rank[0].total_damage)).toBe(150);
    expect(rank[1].user_id).toBe(uidB);
    expect(rank[1].platform_id).toBe("UwblB");
  });

  test("getContributionRank filters by role and sums contribution", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "healer",
      action_type: "revive",
      damage: 0,
      cost: 10,
      contribution: 3,
    });
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "healer",
      action_type: "shield",
      damage: 0,
      cost: 10,
      contribution: 2,
    });
    await WorldBossLog.createWithRole({
      user_id: uidB,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 999,
      cost: 10,
      contribution: 999,
    });
    const rank = await WorldBossLog.getContributionRank({ eventId, role: "healer", limit: 10 });
    expect(rank).toHaveLength(1);
    expect(rank[0].user_id).toBe(uidA);
    expect(rank[0].platform_id).toBe("UwblA");
    expect(Number(rank[0].total_contribution)).toBe(5);
  });

  test("getRecentAttackers returns both ids within the window, newest first", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 1,
      cost: 10,
      contribution: 1,
    });
    await WorldBossLog.createWithRole({
      user_id: uidB,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 1,
      cost: 10,
      contribution: 1,
    });
    const recent = await WorldBossLog.getRecentAttackers({ eventId, minutes: 60, limit: 10 });
    expect(recent.length).toBeGreaterThanOrEqual(2);
    expect(recent[0]).toHaveProperty("user_id");
    expect(recent[0]).toHaveProperty("platform_id");
    const platformIds = recent.map(r => r.platform_id);
    expect(platformIds).toContain("UwblA");
    expect(platformIds).toContain("UwblB");
  });

  test("getSupportRatio = support-distinct / total-distinct (0 when no actions)", async () => {
    if (!dbUp) return;
    expect(await WorldBossLog.getSupportRatio(eventId)).toBe(0);
    // A is a healer (support), B is dps only -> 1 of 2 distinct users supports
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "healer",
      action_type: "revive",
      damage: 0,
      cost: 10,
      contribution: 1,
    });
    await WorldBossLog.createWithRole({
      user_id: uidB,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 10,
      cost: 10,
      contribution: 10,
    });
    expect(await WorldBossLog.getSupportRatio(eventId)).toBeCloseTo(0.5, 5);
  });

  test("getParticipants returns distinct users with both ids", async () => {
    if (!dbUp) return;
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 1,
      cost: 10,
      contribution: 1,
    });
    await WorldBossLog.createWithRole({
      user_id: uidA,
      world_boss_event_id: eventId,
      role: "dps",
      action_type: "a",
      damage: 1,
      cost: 10,
      contribution: 1,
    });
    const parts = await WorldBossLog.getParticipants(eventId);
    expect(parts).toHaveLength(1);
    expect(parts[0].user_id).toBe(uidA);
    expect(parts[0].platform_id).toBe("UwblA");
  });

  test("resolveUserIds maps numeric->platform_id and skips missing", async () => {
    if (!dbUp) return;
    const map = await WorldBossLog.resolveUserIds([uidA, uidB, 99999999]);
    expect(map instanceof Map).toBe(true);
    expect(map.get(uidA)).toBe("UwblA");
    expect(map.get(uidB)).toBe("UwblB");
    expect(map.has(99999999)).toBe(false);
  });
});
