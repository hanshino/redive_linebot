const { applyDiminish } = require("../../../src/service/chatXp/diminishTier");

const base = { blessings: [] };

describe("applyDiminish", () => {
  describe("return shape", () => {
    it("returns { result, factor } object", () => {
      const out = applyDiminish(10, 0, base);
      expect(out).toHaveProperty("result");
      expect(out).toHaveProperty("factor");
    });

    it("incoming=0 → result=0, factor=0", () => {
      const { result, factor } = applyDiminish(0, 0, base);
      expect(result).toBe(0);
      expect(factor).toBe(0);
    });
  });

  describe("baseline tiers (400 / 1000 / inf)", () => {
    it("returns full incoming when entirely in tier 1 — factor=1", () => {
      const { result, factor } = applyDiminish(50, 0, base);
      expect(result).toBe(50);
      expect(factor).toBe(1);

      const r2 = applyDiminish(100, 299, base);
      expect(r2.result).toBe(100);
      expect(r2.factor).toBe(1);
    });

    it("splits 100 at dailyBefore=350 across tier1 and tier2", () => {
      // 50 at 100% + 50 at 30% = 50 + 15 = 65; factor = 65/100 = 0.65
      const { result, factor } = applyDiminish(100, 350, base);
      expect(result).toBeCloseTo(65, 5);
      expect(factor).toBeCloseTo(0.65, 5);
    });

    it("computes moderate-day full spend: 600 at dailyBefore=0", () => {
      // 400 at 100% + 200 at 30% = 460; factor = 460/600
      const { result, factor } = applyDiminish(600, 0, base);
      expect(result).toBeCloseTo(460, 5);
      expect(factor).toBeCloseTo(460 / 600, 5);
    });

    it("splits across all three tiers: 2000 at dailyBefore=0", () => {
      // 400 at 100% + 600 at 30% + 1000 at 3% = 400 + 180 + 30 = 610
      const { result } = applyDiminish(2000, 0, base);
      expect(result).toBeCloseTo(610, 5);
    });

    it("returns 3% (factor≈0.03) when entirely above 1000", () => {
      const { result, factor } = applyDiminish(100, 1100, base);
      expect(result).toBeCloseTo(3, 5);
      expect(factor).toBeCloseTo(0.03, 5);
    });

    it("splits 100 at dailyBefore=950 across tier2 and tier3", () => {
      // 50 at 30% + 50 at 3% = 15 + 1.5 = 16.5
      const { result } = applyDiminish(100, 950, base);
      expect(result).toBeCloseTo(16.5, 5);
    });

    it("entirely in tier 2: factor=0.3", () => {
      // dailyBefore=500 (already past 400), tier2_upper=1000
      const { result, factor } = applyDiminish(100, 500, base);
      expect(result).toBeCloseTo(30);
      expect(factor).toBeCloseTo(0.3);
    });

    it("handles incoming exactly on tier1 upper boundary (dailyBefore=400)", () => {
      // entirely at 30% = 15
      const { result } = applyDiminish(50, 400, base);
      expect(result).toBeCloseTo(15, 5);
    });
  });

  describe("blessing 4 (tier1 expanded 0-400 -> 0-600)", () => {
    const s = { blessings: [4] };
    it("covers 600 entirely in tier 1 — factor=1", () => {
      const { result, factor } = applyDiminish(600, 0, s);
      expect(result).toBeCloseTo(600, 5);
      expect(factor).toBe(1);
    });

    it("splits 100 at dailyBefore=550 across expanded tier1 and tier2", () => {
      // 50 at 100% + 50 at 30% = 50 + 15 = 65
      const { result } = applyDiminish(100, 550, s);
      expect(result).toBeCloseTo(65, 5);
    });

    it("factor=1 when 100 incoming, dailyBefore=500 (still in expanded tier1)", () => {
      const { result, factor } = applyDiminish(100, 500, s);
      expect(result).toBe(100);
      expect(factor).toBe(1);
    });
  });

  describe("blessing 5 (tier2 expanded 400-1000 -> 400-1200)", () => {
    const s = { blessings: [5] };
    it("keeps tier1 at 400, extends tier2 to 1200", () => {
      // dailyBefore=1150, incoming=100: 50 at 30% + 50 at 3% = 15 + 1.5 = 16.5
      const { result } = applyDiminish(100, 1150, s);
      expect(result).toBeCloseTo(16.5, 5);
    });

    it("factor=0.3 when dailyBefore=1100 (still within extended tier2)", () => {
      const { result, factor } = applyDiminish(100, 1100, s);
      expect(result).toBeCloseTo(30);
      expect(factor).toBeCloseTo(0.3);
    });

    it("compares vs baseline at same inputs (verifies tier shift)", () => {
      // baseline: dailyBefore=1150 is entirely in tier3 (1000+), 100 at 3% = 3
      const { result } = applyDiminish(100, 1150, base);
      expect(result).toBeCloseTo(3, 5);
    });
  });

  describe("blessings 4 + 5 combined (tiers 0-600 / 600-1200 / 1200+)", () => {
    const s = { blessings: [4, 5] };
    it("computes 2000 at dailyBefore=0", () => {
      // 600 at 100% + 600 at 30% + 800 at 3% = 600 + 180 + 24 = 804
      const { result } = applyDiminish(2000, 0, s);
      expect(result).toBeCloseTo(804, 5);
    });
  });

  describe("edge cases", () => {
    it("returns 0 result and 0 factor for incoming=0", () => {
      const { result, factor } = applyDiminish(0, 100, base);
      expect(result).toBe(0);
      expect(factor).toBe(0);
    });
  });
});
