require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossEvent = require("../WorldBossEvent");

let dbUp = true;
let bossId;

async function seed({ status, startOffsetMin, endOffsetMin, killedAt, settledAt }) {
  const [id] = await mysql("world_boss_event").insert({
    world_boss_id: bossId,
    announcement: "t",
    start_time: mysql.raw("now() + interval ? minute", [startOffsetMin]),
    end_time: mysql.raw("now() + interval ? minute", [endOffsetMin]),
    status,
    killed_at: killedAt || null,
    settled_at: settledAt || null,
  });
  return id;
}

describe("WorldBossEvent lifecycle helpers (LOCK §E)", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      console.warn(
        'SKIP: WorldBossEvent lifecycle tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_event").delete();
    await mysql("world_boss").where({ name: "T-WBEL" }).delete();
    [bossId] = await mysql("world_boss").insert({
      name: "T-WBEL",
      hp: 1000,
      level: 1,
      attack: 0,
      defense: 0,
      speed: 0,
      luck: 0,
      exp: 0,
      gold: 0,
    });
  });

  afterAll(() => mysql.destroy());

  test("getActive returns the active event whose window contains now", async () => {
    if (!dbUp) return;
    const activeId = await seed({ status: "active", startOffsetMin: -60, endOffsetMin: 60 });
    await seed({ status: "active", startOffsetMin: 60, endOffsetMin: 120 }); // not yet started
    await seed({ status: "killed", startOffsetMin: -60, endOffsetMin: 60 }); // not active
    const row = await WorldBossEvent.getActive();
    expect(row).not.toBeNull();
    expect(row.id).toBe(activeId);
  });

  test("getActive returns null when none active in window", async () => {
    if (!dbUp) return;
    await seed({ status: "expired", startOffsetMin: -120, endOffsetMin: -60 });
    const row = await WorldBossEvent.getActive();
    expect(row).toBeNull();
  });

  test("getKilledUnsettled returns killed rows with settled_at IS NULL only", async () => {
    if (!dbUp) return;
    const a = await seed({ status: "killed", startOffsetMin: -60, endOffsetMin: 60 });
    await seed({
      status: "killed",
      startOffsetMin: -60,
      endOffsetMin: 60,
      settledAt: mysql.raw("now()"),
    });
    const rows = await WorldBossEvent.getKilledUnsettled();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(a);
  });

  test("getOverdueActive returns active rows past end_time", async () => {
    if (!dbUp) return;
    const overdue = await seed({ status: "active", startOffsetMin: -120, endOffsetMin: -10 });
    await seed({ status: "active", startOffsetMin: -60, endOffsetMin: 60 }); // still in window
    const rows = await WorldBossEvent.getOverdueActive();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(overdue);
  });

  test("casStatus transitions only when from matches; returns true once, false on retry", async () => {
    if (!dbUp) return;
    const id = await seed({ status: "active", startOffsetMin: -60, endOffsetMin: 60 });
    const first = await WorldBossEvent.casStatus(id, "active", "killed", {
      killed_at: mysql.raw("now()"),
    });
    expect(first).toBe(true);
    const second = await WorldBossEvent.casStatus(id, "active", "killed");
    expect(second).toBe(false);
    const row = await mysql("world_boss_event").where({ id }).first();
    expect(row.status).toBe("killed");
    expect(row.killed_at).not.toBeNull();
  });

  test("findRaw reads an event even when its world_boss template is gone", async () => {
    if (!dbUp) return;
    const id = await seed({ status: "killed", startOffsetMin: -60, endOffsetMin: 60 });
    await mysql("world_boss").where({ id: bossId }).delete(); // orphan the event
    const raw = await WorldBossEvent.findRaw(id);
    expect(raw).not.toBeUndefined();
    expect(raw.id).toBe(id);
    expect(raw.status).toBe("killed");
  });

  test("markSettled claims once (true), then false on a second call", async () => {
    if (!dbUp) return;
    const id = await seed({ status: "killed", startOffsetMin: -60, endOffsetMin: 60 });
    expect(await WorldBossEvent.markSettled(id)).toBe(true);
    expect(await WorldBossEvent.markSettled(id)).toBe(false);
    const row = await mysql("world_boss_event").where({ id }).first();
    expect(row.settled_at).not.toBeNull();
  });
});
