require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossRewardLog = require("../WorldBossRewardLog");

let dbUp = true;

describe("WorldBossRewardLog", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      // eslint-disable-next-line no-console
      console.warn(
        'SKIP: WorldBossRewardLog tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_reward_log").delete();
  });

  afterAll(() => mysql.destroy());

  test("tryInsert returns true first, false on duplicate (user_id, event)", async () => {
    if (!dbUp) return;
    const args = {
      user_id: "Uwin1",
      world_boss_event_id: 42,
      materials: 50,
      stones: 30,
      board: "dps",
      rank: 1,
      is_mvp: true,
    };
    expect(await WorldBossRewardLog.tryInsert(args)).toBe(true);
    expect(await WorldBossRewardLog.tryInsert(args)).toBe(false);
    const count = await mysql("world_boss_reward_log")
      .where({ user_id: "Uwin1", world_boss_event_id: 42 })
      .count({ c: "*" })
      .first();
    expect(Number(count.c)).toBe(1);
  });

  test("tryInsert allows same user across different events", async () => {
    if (!dbUp) return;
    expect(
      await WorldBossRewardLog.tryInsert({
        user_id: "Uwin2",
        world_boss_event_id: 1,
        materials: 15,
        stones: 0,
        board: "none",
        rank: null,
        is_mvp: false,
      })
    ).toBe(true);
    expect(
      await WorldBossRewardLog.tryInsert({
        user_id: "Uwin2",
        world_boss_event_id: 2,
        materials: 15,
        stones: 0,
        board: "none",
        rank: null,
        is_mvp: false,
      })
    ).toBe(true);
  });

  test("tryInsert participates in an outer transaction (rollback drops the row)", async () => {
    if (!dbUp) return;
    await mysql.transaction(async trx => {
      const ok = await WorldBossRewardLog.tryInsert(
        {
          user_id: "Utrx",
          world_boss_event_id: 7,
          materials: 8,
          stones: 0,
          board: "tank",
          rank: 5,
          is_mvp: false,
        },
        trx
      );
      expect(ok).toBe(true);
      await trx.rollback();
    });
    const row = await WorldBossRewardLog.getByUserAndEvent("Utrx", 7);
    expect(row).toBeUndefined();
  });

  test("getByUserAndEvent returns the row when present", async () => {
    if (!dbUp) return;
    await WorldBossRewardLog.tryInsert({
      user_id: "Uget",
      world_boss_event_id: 9,
      materials: 20,
      stones: 0,
      board: "healer",
      rank: 3,
      is_mvp: false,
    });
    const row = await WorldBossRewardLog.getByUserAndEvent("Uget", 9);
    expect(row.materials).toBe(20);
    expect(row.board).toBe("healer");
  });

  test("getUnreadForUser returns the most recent reward row for the user", async () => {
    if (!dbUp) return;
    await WorldBossRewardLog.tryInsert({
      user_id: "Uunread",
      world_boss_event_id: 100,
      materials: 15,
      stones: 0,
      board: "none",
      rank: null,
      is_mvp: false,
    });
    await WorldBossRewardLog.tryInsert({
      user_id: "Uunread",
      world_boss_event_id: 101,
      materials: 50,
      stones: 30,
      board: "dps",
      rank: 1,
      is_mvp: true,
    });
    const row = await WorldBossRewardLog.getUnreadForUser("Uunread");
    expect(row.world_boss_event_id).toBe(101);
    expect(row.is_mvp).toBeTruthy();
  });
});
