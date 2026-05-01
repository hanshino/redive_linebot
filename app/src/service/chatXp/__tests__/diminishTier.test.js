const { applyDiminish } = require("../diminishTier");

describe("applyDiminish", () => {
  test("returns { result, factor } shape", () => {
    const out = applyDiminish(10, 0, { blessings: [] });
    expect(out).toHaveProperty("result");
    expect(out).toHaveProperty("factor");
  });

  test("tier 1 only: factor=1.0, result === incoming", () => {
    const { result, factor } = applyDiminish(50, 100, { blessings: [] });
    expect(result).toBe(50);
    expect(factor).toBe(1);
  });

  test("entirely in tier 2: factor=0.3", () => {
    // dailyBefore=500 (already past 400), tier2_upper=1000
    const { result, factor } = applyDiminish(100, 500, { blessings: [] });
    expect(result).toBeCloseTo(30);
    expect(factor).toBeCloseTo(0.3);
  });

  test("entirely in tier 3: factor=0.03", () => {
    const { result, factor } = applyDiminish(100, 1500, { blessings: [] });
    expect(result).toBeCloseTo(3);
    expect(factor).toBeCloseTo(0.03);
  });

  test("crosses tier 1 to tier 2: factor is mixed (>0.3, <1)", () => {
    // 100 incoming, dailyBefore=350, tier1_upper=400 → 50 at 1.0 + 50 at 0.3 = 65
    const { result, factor } = applyDiminish(100, 350, { blessings: [] });
    expect(result).toBeCloseTo(65);
    expect(factor).toBeCloseTo(0.65);
  });

  test("incoming = 0 → result 0, factor 0", () => {
    const { result, factor } = applyDiminish(0, 0, { blessings: [] });
    expect(result).toBe(0);
    expect(factor).toBe(0);
  });

  test("blessing 4 expands tier 1 cap to 600", () => {
    const { result, factor } = applyDiminish(100, 500, { blessings: [4] });
    expect(result).toBe(100);
    expect(factor).toBe(1);
  });

  test("blessing 5 expands tier 2 cap to 1200", () => {
    // dailyBefore=1100, tier2_upper=1200 (with blessing 5), 100 incoming → 30 at tier2 ratio
    const { result, factor } = applyDiminish(100, 1100, { blessings: [5] });
    expect(result).toBeCloseTo(30);
    expect(factor).toBeCloseTo(0.3);
  });
});
