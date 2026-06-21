require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossEvent = require("../WorldBossEvent");

let dbUp = true;
let bossId;

describe("WorldBossEvent lifecycle fillable", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      console.warn(
        'SKIP: WorldBossEvent tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_event").delete();
    await mysql("world_boss").where({ name: "T-WBE" }).delete();
    [bossId] = await mysql("world_boss").insert({
      name: "T-WBE",
      hp: 1000,
      level: 1,
      exp: 0,
      gold: 0,
    });
  });

  afterAll(() => mysql.destroy());

  test("create without status defaults to active (column default)", async () => {
    if (!dbUp) return;
    await WorldBossEvent.create({
      world_boss_id: bossId,
      announcement: "x",
      start_time: "2026-06-20 00:00:00",
      end_time: "2026-06-21 00:00:00",
    });
    const row = await mysql("world_boss_event").where({ world_boss_id: bossId }).first();
    expect(row.status).toBe("active");
    expect(row.killed_at).toBeNull();
    expect(row.settled_at).toBeNull();
  });

  test("create persists status when provided (no longer dropped by pick)", async () => {
    if (!dbUp) return;
    await WorldBossEvent.create({
      world_boss_id: bossId,
      announcement: "x",
      start_time: "2026-06-20 00:00:00",
      end_time: "2026-06-21 00:00:00",
      status: "pending",
    });
    const row = await mysql("world_boss_event").where({ world_boss_id: bossId }).first();
    expect(row.status).toBe("pending");
  });

  test("update stamps killed_at + settled_at + status (the M6/M7 stamp path)", async () => {
    if (!dbUp) return;
    await WorldBossEvent.create({
      world_boss_id: bossId,
      announcement: "x",
      start_time: "2026-06-20 00:00:00",
      end_time: "2026-06-21 00:00:00",
    });
    const created = await mysql("world_boss_event").where({ world_boss_id: bossId }).first();
    await WorldBossEvent.update(created.id, {
      status: "killed",
      killed_at: "2026-06-20 10:00:00",
      settled_at: "2026-06-20 10:01:00",
    });
    const row = await mysql("world_boss_event").where({ id: created.id }).first();
    expect(row.status).toBe("killed");
    expect(row.killed_at).not.toBeNull();
    expect(row.settled_at).not.toBeNull();
  });
});
