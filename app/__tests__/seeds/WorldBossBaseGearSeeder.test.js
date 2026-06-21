const Seeder = require("../../seeds/WorldBossBaseGearSeeder");

describe("WorldBossBaseGearSeeder", () => {
  test("ROLE_GEAR covers 3 slots for each of the 3 roles", () => {
    const slots = ["weapon", "armor", "accessory"];
    for (const role of ["dps", "healer", "tank"]) {
      const pieces = Seeder.ROLE_GEAR[role];
      expect(pieces).toHaveLength(3);
      expect(pieces.map(p => p.slot).sort()).toEqual([...slots].sort());
    }
  });

  test("healer gear carries support_power, tank gear carries block_power, dps carries atk_percent", () => {
    const hasKey = (role, key) =>
      Seeder.ROLE_GEAR[role].some(p => Object.prototype.hasOwnProperty.call(p.attributes, key));
    expect(hasKey("healer", "support_power")).toBe(true);
    expect(hasKey("tank", "block_power")).toBe(true);
    expect(hasKey("dps", "atk_percent")).toBe(true);
  });

  test("dps atk_percent values are fractions (<= 1), matching the live damage*(1+atk_percent) convention", () => {
    for (const piece of Seeder.ROLE_GEAR.dps) {
      const v = piece.attributes.atk_percent;
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1); // fraction, not percentage-point
    }
  });

  test("healer/tank support_power/block_power are positive INTEGER people-counts (addendum §2)", () => {
    for (const piece of Seeder.ROLE_GEAR.healer) {
      const v = piece.attributes.support_power;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
    }
    for (const piece of Seeder.ROLE_GEAR.tank) {
      const v = piece.attributes.block_power;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
    }
  });

  test("buildRows returns 9 rows with stringified attributes, valid enum rarity, and a stable sentinel name", () => {
    const rows = Seeder.buildRows();
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      expect(typeof row.name).toBe("string");
      expect(row.name.startsWith("[世界王]")).toBe(true);
      expect(typeof row.attributes).toBe("string");
      expect(() => JSON.parse(row.attributes)).not.toThrow();
      expect(["weapon", "armor", "accessory"]).toContain(row.slot);
      // rarity MUST be a valid enum member or the INSERT fails in strict mode (addendum §9).
      expect(["common", "rare", "epic", "legendary"]).toContain(row.rarity);
      expect(row.rarity).toBe("common");
    }
  });

  test("getRoleGearIds queries equipment by the seeded names for the role", async () => {
    const whereIn = jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }, { id: 13 }]);
    const select = jest.fn().mockReturnValue({ whereIn });
    const knex = jest.fn().mockReturnValue({ select });

    const ids = await Seeder.getRoleGearIds(knex, "healer");

    expect(knex).toHaveBeenCalledWith("equipment");
    expect(select).toHaveBeenCalledWith("id");
    const names = Seeder.ROLE_GEAR.healer.map(p => p.name);
    expect(whereIn).toHaveBeenCalledWith("name", names);
    expect(ids).toEqual([11, 12, 13]);
  });
});
