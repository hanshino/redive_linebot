require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
const {
  PREFIX,
  SETUP_TIMEOUT_MS,
  createWorldBossTestDatabase,
  cleanupByPrefix,
} = require("../../__tests__/helpers/worldBossFixture");
const testDatabase = createWorldBossTestDatabase("catalog");
const mysql = testDatabase.mysql;
jest.mock("../../util/mysql", () => mysql);
const WorldBoss = require("../../model/application/WorldBoss");
const WorldBossCatalogService = require("../WorldBossCatalogService");

describe("WorldBossCatalogService", () => {
  const prefix = `${PREFIX}catalog_`;
  const sentinelName = "xxwbtestXcatalogXsentinel";

  beforeAll(async () => {
    await expect(testDatabase.setup()).resolves.toMatch(/^Princess_wbtest_catalog_/);
  }, SETUP_TIMEOUT_MS);

  beforeEach(async () => {
    await cleanupByPrefix(mysql, prefix);
    await mysql("world_boss").where({ name: sentinelName }).del();
    await mysql("world_boss").insert({ name: sentinelName, hp_weight: 1 });
  });

  afterEach(async () => {
    await cleanupByPrefix(mysql, prefix);
    expect(await mysql("world_boss").where({ name: sentinelName }).first()).toBeTruthy();
    await mysql("world_boss").where({ name: sentinelName }).del();
  });

  afterAll(() => testDatabase.teardown());

  test("validates boss names and hp weights while trimming a valid name", async () => {
    expect(() => WorldBossCatalogService.normalizeBossInput({ name: "", hp_weight: 1 })).toThrow(
      "INVALID_BOSS_NAME"
    );
    expect(() =>
      WorldBossCatalogService.normalizeBossInput({ name: "x".repeat(65), hp_weight: 1 })
    ).toThrow("INVALID_BOSS_NAME");
    for (const invalidInput of [null, 42, "invalid"]) {
      expect(() => WorldBossCatalogService.normalizeBossInput(invalidInput)).toThrow(
        "INVALID_BOSS_NAME"
      );
    }

    for (const hpWeight of [0, -1, Number.NaN, Infinity]) {
      expect(() =>
        WorldBossCatalogService.normalizeBossInput({
          name: `${prefix}invalid`,
          hp_weight: hpWeight,
        })
      ).toThrow("INVALID_HP_WEIGHT");
    }

    const id = await WorldBossCatalogService.createBoss({
      name: `  ${prefix}trimmed  `,
      hp_weight: 1.25,
      image: "https://example.test/boss.png",
      description: "test boss",
    });
    const created = await mysql("world_boss").where({ id }).first();
    expect(created.name).toBe(`${prefix}trimmed`);
    expect(Number(created.hp_weight)).toBe(1.25);
  });

  test("lists bosses by ascending id deterministically", async () => {
    const firstId = await WorldBossCatalogService.createBoss({
      name: `${prefix}first`,
      hp_weight: 1,
    });
    const secondId = await WorldBossCatalogService.createBoss({
      name: `${prefix}second`,
      hp_weight: 1,
    });

    const rows = await WorldBossCatalogService.listBosses();
    const ids = rows.map(row => Number(row.id));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(
      rows.filter(row => [firstId, secondId].includes(Number(row.id))).map(row => row.id)
    ).toEqual([firstId, secondId]);
  });

  test("translates the expected foreign-key deletion error to BOSS_IN_USE", async () => {
    const deleteError = Object.assign(new Error("Cannot delete or update a parent row"), {
      code: "ER_ROW_IS_REFERENCED_2",
      errno: 1451,
      sqlMessage:
        "Cannot delete or update a parent row: a foreign key constraint fails (`Princess`.`world_boss_season_boss`, CONSTRAINT `fk_wbsb_world_boss` FOREIGN KEY (`world_boss_id`) REFERENCES `world_boss` (`id`))",
    });
    const deleteSpy = jest.spyOn(WorldBoss.model, "delete").mockRejectedValue(deleteError);

    try {
      await expect(WorldBossCatalogService.deleteBoss(123)).rejects.toMatchObject({
        code: "BOSS_IN_USE",
      });
      expect(deleteSpy).toHaveBeenCalledWith(123, undefined);
    } finally {
      deleteSpy.mockRestore();
    }
  });

  test("a boss referenced by a season roster cannot be deleted", async () => {
    const bossId = await WorldBossCatalogService.createBoss({
      name: `${prefix}in_use`,
      hp_weight: 1,
    });
    const [seasonId] = await mysql("world_boss_season").insert({
      name: `${prefix}in_use_season`,
      status: "draft",
      end_time: new Date("2030-01-01T00:00:00.000Z"),
    });
    await mysql("world_boss_season_boss").insert({
      season_id: seasonId,
      position: 1,
      world_boss_id: bossId,
      name: `${prefix}in_use`,
      hp_weight: 1,
    });

    await expect(WorldBossCatalogService.deleteBoss(bossId)).rejects.toMatchObject({
      code: "BOSS_IN_USE",
    });
    await expect(mysql("world_boss").where({ id: bossId }).first()).resolves.toBeDefined();
  });

  test("bubbles an unrelated referenced-row error unchanged", async () => {
    const deleteError = Object.assign(new Error("Cannot delete another parent row"), {
      code: "ER_ROW_IS_REFERENCED_2",
      errno: 1451,
      sqlMessage:
        "Cannot delete or update a parent row: a foreign key constraint fails (`Princess`.`other_child`, CONSTRAINT `fk_other_child_parent` FOREIGN KEY (`parent_id`) REFERENCES `other_parent` (`id`))",
    });
    const deleteSpy = jest.spyOn(WorldBoss.model, "delete").mockRejectedValue(deleteError);

    try {
      await expect(WorldBossCatalogService.deleteBoss(123)).rejects.toBe(deleteError);
    } finally {
      deleteSpy.mockRestore();
    }
  });
});
