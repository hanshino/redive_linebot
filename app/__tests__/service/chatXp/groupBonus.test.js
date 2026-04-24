const { computeGroupBonus } = require("../../../src/service/chatXp/groupBonus");

const baseStatus = {
  blessings: [],
  active_trial_star: null,
  group_bonus_double: false,
};

describe("computeGroupBonus", () => {
  describe("baseline slope 0.02", () => {
    it("returns 1.0 for <5 members", () => {
      expect(computeGroupBonus(2, baseStatus)).toBe(1.0);
      expect(computeGroupBonus(4, baseStatus)).toBe(1.0);
    });
    it("returns 1.0 at 5 members (boundary)", () => {
      expect(computeGroupBonus(5, baseStatus)).toBe(1.0);
    });
    it("returns 1.10 at 10 members", () => {
      expect(computeGroupBonus(10, baseStatus)).toBeCloseTo(1.1, 5);
    });
    it("returns 1.50 at 30 members", () => {
      expect(computeGroupBonus(30, baseStatus)).toBeCloseTo(1.5, 5);
    });
  });

  describe("★4 trial active (group bonus disabled)", () => {
    const s = { ...baseStatus, active_trial_star: 4 };
    it("returns 1.0 regardless of member count", () => {
      expect(computeGroupBonus(50, s)).toBe(1.0);
      expect(computeGroupBonus(3, s)).toBe(1.0);
    });
    it("overrides blessing 6 and 7 and group_bonus_double", () => {
      expect(computeGroupBonus(50, { ...s, blessings: [6, 7], group_bonus_double: true })).toBe(
        1.0
      );
    });
  });

  describe("blessing 6 (slope -> 0.025)", () => {
    const s = { ...baseStatus, blessings: [6] };
    it("returns 1.125 at 10 members", () => {
      expect(computeGroupBonus(10, s)).toBeCloseTo(1.125, 5);
    });
    it("returns 1.625 at 30 members", () => {
      expect(computeGroupBonus(30, s)).toBeCloseTo(1.625, 5);
    });
  });

  describe("★4 reward (group_bonus_double: slope -> max(base*2, 0.04))", () => {
    it("doubles baseline slope: 0.02 -> 0.04 at 10 members", () => {
      const s = { ...baseStatus, group_bonus_double: true };
      expect(computeGroupBonus(10, s)).toBeCloseTo(1.2, 5);
    });
    it("takes max vs blessing 6: max(0.025*2, 0.04) = 0.05 at 10 members", () => {
      const s = { ...baseStatus, blessings: [6], group_bonus_double: true };
      expect(computeGroupBonus(10, s)).toBeCloseTo(1.25, 5);
    });
  });

  describe("blessing 7 (small group <10 members x1.3)", () => {
    it("multiplies baseline slope by 1.3 at 8 members (no blessing 6)", () => {
      const s = { ...baseStatus, blessings: [7] };
      // (1 + 3*0.02) * 1.3 = 1.06 * 1.3 = 1.378
      expect(computeGroupBonus(8, s)).toBeCloseTo(1.378, 4);
    });
    it("does NOT multiply at 10 members (boundary exclusive)", () => {
      const s = { ...baseStatus, blessings: [7] };
      expect(computeGroupBonus(10, s)).toBeCloseTo(1.1, 5);
    });
    it("stacks with blessing 6 at 8 members", () => {
      const s = { ...baseStatus, blessings: [6, 7] };
      // (1 + 3*0.025) * 1.3 = 1.075 * 1.3 = 1.3975
      expect(computeGroupBonus(8, s)).toBeCloseTo(1.3975, 4);
    });
  });

  describe("no blessings, solo chat", () => {
    it("returns 1.0 for 1-member room", () => {
      expect(computeGroupBonus(1, baseStatus)).toBe(1.0);
    });
  });
});
