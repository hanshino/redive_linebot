require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");
const { PREFIX, cleanupByPrefix } = require("../../__tests__/helpers/worldBossFixture");
const WorldBossCatalogService = require("../WorldBossCatalogService");

describe("WorldBossCatalogService", () => {
  const prefix = `${PREFIX}catalog_`;
  const sentinelName = "xxwbtestXcatalogXsentinel";

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

  afterAll(() => mysql.destroy());

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

  test("refuses to delete a boss used by a test-owned round", async () => {
    const bossId = await WorldBossCatalogService.createBoss({
      name: `${prefix}in-use`,
      hp_weight: 1,
    });
    const [seasonId] = await mysql("world_boss_season").insert({
      name: `${prefix}in-use-season`,
      status: "draft",
      end_time: new Date("2030-01-01T00:00:00.000Z"),
    });
    await mysql("world_boss_round").insert({
      season_id: seasonId,
      round_no: 1,
      world_boss_id: bossId,
      max_hp: 100,
      current_hp: 100,
      status: "cleared",
      active_slot: null,
    });

    await expect(WorldBossCatalogService.deleteBoss(bossId)).rejects.toMatchObject({
      code: "BOSS_IN_USE",
    });
    expect(await mysql("world_boss").where({ id: bossId }).first()).toBeTruthy();
  });
});
