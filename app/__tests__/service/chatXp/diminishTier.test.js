const { applyDiminish } = require("../../../src/service/chatXp/diminishTier");

const base = { blessings: [] };

describe("applyDiminish", () => {
  describe("baseline tiers (400 / 1000 / inf)", () => {
    it("returns full incoming when entirely in tier 1", () => {
      expect(applyDiminish(50, 0, base)).toBe(50);
      expect(applyDiminish(100, 299, base)).toBe(100);
    });
    it("splits 100 at dailyBefore=350 across tier1 and tier2", () => {
      // 50 at 100% + 50 at 30% = 50 + 15 = 65
      expect(applyDiminish(100, 350, base)).toBeCloseTo(65, 5);
    });
    it("computes moderate-day full spend: 600 at dailyBefore=0", () => {
      // 400 at 100% + 200 at 30% = 460
      expect(applyDiminish(600, 0, base)).toBeCloseTo(460, 5);
    });
    it("splits across all three tiers: 2000 at dailyBefore=0", () => {
      // 400 at 100% + 600 at 30% + 1000 at 3% = 400 + 180 + 30 = 610
      expect(applyDiminish(2000, 0, base)).toBeCloseTo(610, 5);
    });
    it("returns 3% when entirely above 1000", () => {
      expect(applyDiminish(100, 1100, base)).toBeCloseTo(3, 5);
    });
    it("splits 100 at dailyBefore=950 across tier2 and tier3", () => {
      // 50 at 30% + 50 at 3% = 15 + 1.5 = 16.5
      expect(applyDiminish(100, 950, base)).toBeCloseTo(16.5, 5);
    });
  });

  describe("blessing 4 (tier1 expanded 0-400 -> 0-600)", () => {
    const s = { blessings: [4] };
    it("covers 600 entirely in tier 1", () => {
      expect(applyDiminish(600, 0, s)).toBeCloseTo(600, 5);
    });
    it("splits 100 at dailyBefore=550 across expanded tier1 and tier2", () => {
      // 50 at 100% + 50 at 30% = 50 + 15 = 65
      expect(applyDiminish(100, 550, s)).toBeCloseTo(65, 5);
    });
  });

  describe("blessing 5 (tier2 expanded 400-1000 -> 400-1200)", () => {
    const s = { blessings: [5] };
    it("keeps tier1 at 400, extends tier2 to 1200", () => {
      // dailyBefore=1150, incoming=100: 50 at 30% + 50 at 3% = 15 + 1.5 = 16.5
      expect(applyDiminish(100, 1150, s)).toBeCloseTo(16.5, 5);
    });
    it("compares vs baseline at same inputs (verifies tier shift)", () => {
      // baseline: dailyBefore=1150 is entirely in tier3 (1000+), 100 at 3% = 3
      expect(applyDiminish(100, 1150, base)).toBeCloseTo(3, 5);
    });
  });

  describe("blessings 4 + 5 combined (tiers 0-600 / 600-1200 / 1200+)", () => {
    const s = { blessings: [4, 5] };
    it("computes 2000 at dailyBefore=0", () => {
      // 600 at 100% + 600 at 30% + 800 at 3% = 600 + 180 + 24 = 804
      expect(applyDiminish(2000, 0, s)).toBeCloseTo(804, 5);
    });
  });

  describe("edge cases", () => {
    it("returns 0 for incoming=0", () => {
      expect(applyDiminish(0, 100, base)).toBe(0);
    });
    it("handles incoming exactly on tier1 upper boundary", () => {
      // dailyBefore=400, incoming=50: entirely at 30% = 15
      expect(applyDiminish(50, 400, base)).toBeCloseTo(15, 5);
    });
  });
});
