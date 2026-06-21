const config = require("config");

describe("worldboss role config (owned by M3, consumed by M2)", () => {
  test("reselect_stone_cost is a positive number", () => {
    const cost = config.get("worldboss.reselect_stone_cost");
    expect(typeof cost).toBe("number");
    expect(cost).toBeGreaterThan(0);
  });
});
