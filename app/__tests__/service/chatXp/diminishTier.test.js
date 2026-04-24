const { applyDiminish } = require("../../../src/service/chatXp/diminishTier");

const base = { blessings: [] };

describe("applyDiminish", () => {
  describe("baseline tiers (200 / 500 / inf)", () => {
    it("returns full incoming when entirely in tier 1", () => {
      expect(applyDiminish(50, 0, base)).toBe(50);
      expect(applyDiminish(100, 99, base)).toBe(100);
    });
    it("splits 100 at dailyBefore=150 across tier1 and tier2", () => {
      // 50 at 100% + 50 at 30% = 50 + 15 = 65
      expect(applyDiminish(100, 150, base)).toBeCloseTo(65, 5);
    });
    it("computes moderate-day full spend: 300 at dailyBefore=0", () => {
      // 200 at 100% + 100 at 30% = 230
      expect(applyDiminish(300, 0, base)).toBeCloseTo(230, 5);
    });
    it("splits across all three tiers: 1000 at dailyBefore=0", () => {
      // 200 at 100% + 300 at 30% + 500 at 3% = 200 + 90 + 15 = 305
      expect(applyDiminish(1000, 0, base)).toBeCloseTo(305, 5);
    });
    it("returns 3% when entirely above 500", () => {
      expect(applyDiminish(100, 600, base)).toBeCloseTo(3, 5);
    });
    it("splits 100 at dailyBefore=450 across tier2 and tier3", () => {
      // 50 at 30% + 50 at 3% = 15 + 1.5 = 16.5
      expect(applyDiminish(100, 450, base)).toBeCloseTo(16.5, 5);
    });
  });

  describe("blessing 4 (tier1 expanded 0-200 -> 0-300)", () => {
    const s = { blessings: [4] };
    it("covers 300 entirely in tier 1", () => {
      expect(applyDiminish(300, 0, s)).toBeCloseTo(300, 5);
    });
    it("splits 100 at dailyBefore=250 across expanded tier1 and tier2", () => {
      // 50 at 100% + 50 at 30% = 50 + 15 = 65
      expect(applyDiminish(100, 250, s)).toBeCloseTo(65, 5);
    });
  });

  describe("blessing 5 (tier2 expanded 200-500 -> 200-600)", () => {
    const s = { blessings: [5] };
    it("keeps tier1 at 200, extends tier2 to 600", () => {
      // dailyBefore=550, incoming=100: 50 at 30% + 50 at 3% = 15 + 1.5 = 16.5
      expect(applyDiminish(100, 550, s)).toBeCloseTo(16.5, 5);
    });
    it("compares vs baseline at same inputs (verifies tier shift)", () => {
      // baseline: dailyBefore=550 is entirely in tier3 (500+), 100 at 3% = 3
      expect(applyDiminish(100, 550, base)).toBeCloseTo(3, 5);
    });
  });

  describe("blessings 4 + 5 combined (tiers 0-300 / 300-600 / 600+)", () => {
    const s = { blessings: [4, 5] };
    it("computes 1000 at dailyBefore=0", () => {
      // 300 at 100% + 300 at 30% + 400 at 3% = 300 + 90 + 12 = 402
      expect(applyDiminish(1000, 0, s)).toBeCloseTo(402, 5);
    });
  });

  describe("edge cases", () => {
    it("returns 0 for incoming=0", () => {
      expect(applyDiminish(0, 100, base)).toBe(0);
    });
    it("handles incoming exactly on tier1 upper boundary", () => {
      // dailyBefore=200, incoming=50: entirely at 30% = 15
      expect(applyDiminish(50, 200, base)).toBeCloseTo(15, 5);
    });
  });
});
