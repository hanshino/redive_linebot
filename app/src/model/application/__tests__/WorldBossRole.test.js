require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../../.env") });
jest.unmock("../../../util/mysql");
const mysql = jest.requireActual("../../../util/mysql");
const WorldBossRole = require("../WorldBossRole");

let dbUp = true;

describe("WorldBossRole model", () => {
  beforeAll(async () => {
    try {
      await mysql.raw("select 1");
    } catch (err) {
      dbUp = false;
      console.warn(
        'SKIP: WorldBossRole model tests need a live MySQL — run "make infra" first.',
        err.code || err.message
      );
    }
  });

  beforeEach(async () => {
    if (!dbUp) return;
    await mysql("world_boss_role").delete();
  });

  afterAll(() => mysql.destroy());

  test("create then find returns the row by platform_id", async () => {
    if (!dbUp) return;
    await WorldBossRole.create({ user_id: "Urole1", role: "tank", reselect_count: 0 });
    const row = await WorldBossRole.find("Urole1");
    expect(row.role).toBe("tank");
    expect(row.reselect_count).toBe(0);
  });

  test("find returns undefined when absent", async () => {
    if (!dbUp) return;
    const row = await WorldBossRole.find("Umissing");
    expect(row).toBeUndefined();
  });

  test("update changes role + reselect_count keyed on user_id", async () => {
    if (!dbUp) return;
    await WorldBossRole.create({ user_id: "Urole2", role: "dps", reselect_count: 0 });
    await WorldBossRole.update("Urole2", { role: "healer", reselect_count: 1 });
    const row = await WorldBossRole.find("Urole2");
    expect(row.role).toBe("healer");
    expect(row.reselect_count).toBe(1);
  });

  test("create only persists fillable fields", async () => {
    if (!dbUp) return;
    await WorldBossRole.create({ user_id: "Urole3", role: "dps", bogus: "x" });
    const row = await WorldBossRole.find("Urole3");
    expect(row.role).toBe("dps");
    expect(row.bogus).toBeUndefined();
  });

  test("update participates in an external transaction (rollback leaves row unchanged)", async () => {
    if (!dbUp) return;
    await WorldBossRole.create({ user_id: "Utx", role: "dps", reselect_count: 0 });
    await mysql
      .transaction(async trx => {
        await WorldBossRole.update("Utx", { role: "tank" }, { trx });
        await trx.rollback(); // abort
      })
      .catch(() => {});
    const row = await WorldBossRole.find("Utx");
    expect(row.role).toBe("dps"); // rollback undid the update
  });
});
