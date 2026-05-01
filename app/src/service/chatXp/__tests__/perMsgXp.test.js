const { computePerMsgXp } = require("../perMsgXp");

describe("computePerMsgXp", () => {
  test("no blessing 1: blessing1Mult = 1.0, raw = round(base × cooldown × group)", () => {
    const out = computePerMsgXp({
      base: 5,
      cooldownRate: 1.0,
      groupBonus: 1.1,
      status: { blessings: [] },
    });
    expect(out.blessing1Mult).toBe(1);
    expect(out.raw).toBe(Math.round(5 * 1.0 * 1.1)); // 6
  });

  test("blessing 1 owned: blessing1Mult = 1.08", () => {
    const out = computePerMsgXp({
      base: 5,
      cooldownRate: 1.0,
      groupBonus: 1.0,
      status: { blessings: [1] },
    });
    expect(out.blessing1Mult).toBeCloseTo(1.08);
    expect(out.raw).toBe(Math.round(5 * 1.0 * 1.0 * 1.08)); // 5
  });

  test("non-array blessings tolerated", () => {
    const out = computePerMsgXp({
      base: 5,
      cooldownRate: 1.0,
      groupBonus: 1.0,
      status: { blessings: null },
    });
    expect(out.blessing1Mult).toBe(1);
  });

  test("rounds to integer raw", () => {
    const out = computePerMsgXp({
      base: 5,
      cooldownRate: 1.2,
      groupBonus: 1.1,
      status: { blessings: [1] },
    });
    // 5 × 1.2 × 1.1 × 1.08 = 7.128 → round → 7
    expect(out.raw).toBe(7);
  });
});
