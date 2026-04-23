describe("ChatExpUnitSeeder", () => {
  const Seeder = require("../../seeds/ChatExpUnitSeeder");

  it("generates 101 rows from level 0 to 100", () => {
    const rows = Seeder.buildRows();
    expect(rows).toHaveLength(101);
    expect(rows[0]).toEqual({ unit_level: 0, total_exp: 0 });
    expect(rows[100]).toEqual({ unit_level: 100, total_exp: 27000 });
  });

  it("applies round(2.7 * L^2) formula", () => {
    const rows = Seeder.buildRows();
    expect(rows[10].total_exp).toBe(270);
    expect(rows[30].total_exp).toBe(2430);
    expect(rows[50].total_exp).toBe(6750);
    expect(rows[70].total_exp).toBe(13230);
    expect(rows[90].total_exp).toBe(21870);
  });

  it("produces monotonically increasing total_exp", () => {
    const rows = Seeder.buildRows();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].total_exp).toBeGreaterThanOrEqual(rows[i - 1].total_exp);
    }
  });
});
