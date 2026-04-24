const { selectCooldownRate } = require("../../../src/service/chatXp/cooldownTable");

const baseStatus = {
  prestige_count: 0,
  blessings: [],
  active_trial_star: null,
  rhythm_mastery: false,
};

describe("selectCooldownRate", () => {
  describe("first message", () => {
    it("returns 1.0 when timeDiffMs is null", () => {
      expect(selectCooldownRate(null, baseStatus)).toBe(1.0);
    });
    it("returns 1.0 when timeDiffMs is undefined", () => {
      expect(selectCooldownRate(undefined, baseStatus)).toBe(1.0);
    });
  });

  describe("baseline (no modifiers)", () => {
    it("returns 0 for <1s", () => {
      expect(selectCooldownRate(500, baseStatus)).toBe(0);
      expect(selectCooldownRate(999, baseStatus)).toBe(0);
    });
    it("returns 0.1 for 1-2s", () => {
      expect(selectCooldownRate(1000, baseStatus)).toBe(0.1);
      expect(selectCooldownRate(1999, baseStatus)).toBe(0.1);
    });
    it("returns 0.5 for 2-4s", () => {
      expect(selectCooldownRate(2000, baseStatus)).toBe(0.5);
      expect(selectCooldownRate(3999, baseStatus)).toBe(0.5);
    });
    it("returns 0.8 for 4-6s", () => {
      expect(selectCooldownRate(4000, baseStatus)).toBe(0.8);
      expect(selectCooldownRate(5999, baseStatus)).toBe(0.8);
    });
    it("returns 1.0 for >=6s", () => {
      expect(selectCooldownRate(6000, baseStatus)).toBe(1.0);
      expect(selectCooldownRate(60000, baseStatus)).toBe(1.0);
    });
  });

  describe("blessing 2 (swift tongue: full-speed threshold 6s -> 5s)", () => {
    const s = { ...baseStatus, blessings: [2] };
    it("still returns 0.8 for 4-5s", () => {
      expect(selectCooldownRate(4500, s)).toBe(0.8);
    });
    it("returns 1.0 at 5s (new threshold)", () => {
      expect(selectCooldownRate(5000, s)).toBe(1.0);
      expect(selectCooldownRate(5500, s)).toBe(1.0);
    });
  });

  describe("blessing 3 (ember afterglow: left tiers 0.1 / 0.3)", () => {
    const s = { ...baseStatus, blessings: [3] };
    it("returns 0.1 for <1s", () => {
      expect(selectCooldownRate(500, s)).toBe(0.1);
    });
    it("returns 0.3 for 1-2s", () => {
      expect(selectCooldownRate(1500, s)).toBe(0.3);
    });
    it("returns 0.5 for 2-4s unchanged", () => {
      expect(selectCooldownRate(3000, s)).toBe(0.5);
    });
  });

  describe("rhythm mastery (★3 permanent: mid tiers 0.7 / 0.9)", () => {
    const s = { ...baseStatus, rhythm_mastery: true };
    it("returns 0.7 for 2-4s", () => {
      expect(selectCooldownRate(3000, s)).toBe(0.7);
    });
    it("returns 0.9 for 4-6s", () => {
      expect(selectCooldownRate(5000, s)).toBe(0.9);
    });
    it("returns 0 for <1s unchanged", () => {
      expect(selectCooldownRate(500, s)).toBe(0);
    });
  });

  describe("★3 trial active (right-shift all thresholds x1.333)", () => {
    const s = { ...baseStatus, active_trial_star: 3 };
    it("returns 0 for <1.333s", () => {
      expect(selectCooldownRate(1332, s)).toBe(0);
    });
    it("returns 0.1 for 1.333-2.666s", () => {
      expect(selectCooldownRate(1333, s)).toBe(0.1);
      expect(selectCooldownRate(2665, s)).toBe(0.1);
    });
    it("returns 0.5 for 2.666-5.333s", () => {
      expect(selectCooldownRate(2666, s)).toBe(0.5);
      expect(selectCooldownRate(5332, s)).toBe(0.5);
    });
    it("returns 0.8 for 5.333-7.998s", () => {
      expect(selectCooldownRate(5333, s)).toBe(0.8);
      expect(selectCooldownRate(7997, s)).toBe(0.8);
    });
    it("returns 1.0 at 7.998s (shifted full-speed)", () => {
      expect(selectCooldownRate(7998, s)).toBe(1.0);
    });
  });

  describe("★3 trial + all blessings + rhythm mastery (spec line 132-138)", () => {
    const s = {
      ...baseStatus,
      active_trial_star: 3,
      blessings: [2, 3],
      rhythm_mastery: true,
    };
    it("returns 0.1 for <1.333s (blessing 3 overrides 0->0.1)", () => {
      expect(selectCooldownRate(500, s)).toBe(0.1);
    });
    it("returns 0.3 for 1.333-2.666s (blessing 3 overrides 0.1->0.3)", () => {
      expect(selectCooldownRate(2000, s)).toBe(0.3);
    });
    it("returns 0.7 for 2.666-5.333s (rhythm mastery mid)", () => {
      expect(selectCooldownRate(4000, s)).toBe(0.7);
    });
    it("returns 0.9 for 5.333-6.998s (blessing 2 lowered upper by 1000ms)", () => {
      expect(selectCooldownRate(5500, s)).toBe(0.9);
      expect(selectCooldownRate(6997, s)).toBe(0.9);
    });
    it("returns 1.0 at 6.998s (★3 shift 7998 - blessing 2 subtracts 1000)", () => {
      expect(selectCooldownRate(6998, s)).toBe(1.0);
    });
  });
});
