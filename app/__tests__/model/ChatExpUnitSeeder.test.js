describe("ChatExpUnitSeeder", () => {
  const Seeder = require("../../seeds/ChatExpUnitSeeder");

  it("generates 101 rows from level 0 to 100", () => {
    const rows = Seeder.buildRows();
    expect(rows).toHaveLength(101);
    expect(rows[0]).toEqual({ unit_level: 0, total_exp: 0 });
    expect(rows[100]).toEqual({ unit_level: 100, total_exp: 130000 });
  });

  it("applies round(13 * L^2) formula", () => {
    const rows = Seeder.buildRows();
    expect(rows[10].total_exp).toBe(1300);
    expect(rows[30].total_exp).toBe(11700);
    expect(rows[50].total_exp).toBe(32500);
    expect(rows[70].total_exp).toBe(63700);
    expect(rows[90].total_exp).toBe(105300);
  });

  it("produces monotonically increasing total_exp", () => {
    const rows = Seeder.buildRows();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].total_exp).toBeGreaterThanOrEqual(rows[i - 1].total_exp);
    }
  });
});
