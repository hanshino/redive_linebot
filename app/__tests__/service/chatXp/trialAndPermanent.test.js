const { applyTrialAndPermanent } = require("../../../src/service/chatXp/trialAndPermanent");

describe("applyTrialAndPermanent", () => {
  describe("return shape", () => {
    it("returns { result, trialMult, permanentMult } object", () => {
      const out = applyTrialAndPermanent(10, {
        active_trial_star: null,
        permanent_xp_multiplier: 0,
      });
      expect(out).toHaveProperty("result");
      expect(out).toHaveProperty("trialMult");
      expect(out).toHaveProperty("permanentMult");
    });

    it("no trial, no permanent → trialMult=1, permanentMult=1, result unchanged", () => {
      const { result, trialMult, permanentMult } = applyTrialAndPermanent(100, {
        active_trial_star: null,
        permanent_xp_multiplier: 0,
      });
      expect(result).toBeCloseTo(100, 5);
      expect(trialMult).toBe(1);
      expect(permanentMult).toBe(1);
    });
  });

  describe("trial current-period multiplier", () => {
    it("★1 active: trialMult=1.0, result unchanged", () => {
      const { result, trialMult } = applyTrialAndPermanent(100, {
        active_trial_star: 1,
        permanent_xp_multiplier: 0,
      });
      expect(result).toBeCloseTo(100, 5);
      expect(trialMult).toBe(1);
    });

    it("★2 active: trialMult=0.7, result x0.7", () => {
      const { result, trialMult } = applyTrialAndPermanent(100, {
        active_trial_star: 2,
        permanent_xp_multiplier: 0,
      });
      expect(result).toBeCloseTo(70, 5);
      expect(trialMult).toBe(0.7);
    });

    it("★3 active: trialMult=1.0 (cooldown-only restriction)", () => {
      const { result, trialMult } = applyTrialAndPermanent(100, {
        active_trial_star: 3,
        permanent_xp_multiplier: 0,
      });
      expect(result).toBeCloseTo(100, 5);
      expect(trialMult).toBe(1);
    });

    it("★4 active: trialMult=1.0 (group-bonus-only restriction)", () => {
      const { result, trialMult } = applyTrialAndPermanent(100, {
        active_trial_star: 4,
        permanent_xp_multiplier: 0,
      });
      expect(result).toBeCloseTo(100, 5);
      expect(trialMult).toBe(1);
    });

    it("★5 active: trialMult=0.5, result x0.5", () => {
      const { result, trialMult } = applyTrialAndPermanent(100, {
        active_trial_star: 5,
        permanent_xp_multiplier: 0,
      });
      expect(result).toBeCloseTo(50, 5);
      expect(trialMult).toBe(0.5);
    });
  });

  describe("permanent multiplier", () => {
    it("★2 passed (+0.10): permanentMult=1.10, result x1.10", () => {
      const { result, permanentMult } = applyTrialAndPermanent(100, {
        active_trial_star: null,
        permanent_xp_multiplier: 0.1,
      });
      expect(result).toBeCloseTo(110, 5);
      expect(permanentMult).toBeCloseTo(1.1);
    });

    it("★2 + ★5 passed (+0.25): permanentMult=1.25, result x1.25", () => {
      const { result, permanentMult } = applyTrialAndPermanent(100, {
        active_trial_star: null,
        permanent_xp_multiplier: 0.25,
      });
      expect(result).toBeCloseTo(125, 5);
      expect(permanentMult).toBeCloseTo(1.25);
    });

    it("permanent 0.05 → permanentMult=1.05", () => {
      const { result, permanentMult } = applyTrialAndPermanent(10, {
        active_trial_star: null,
        permanent_xp_multiplier: 0.05,
      });
      expect(permanentMult).toBeCloseTo(1.05);
      expect(result).toBeCloseTo(10.5);
    });

    it("nullish permanent_xp_multiplier defaults to 0 → permanentMult=1", () => {
      const { permanentMult } = applyTrialAndPermanent(10, { active_trial_star: null });
      expect(permanentMult).toBe(1);
    });
  });

  describe("trial + permanent combined", () => {
    it("★5 active + ★2 passed: 100 * 0.5 * 1.10 = 55", () => {
      const { result } = applyTrialAndPermanent(100, {
        active_trial_star: 5,
        permanent_xp_multiplier: 0.1,
      });
      expect(result).toBeCloseTo(55, 5);
    });

    it("★3 active + ★2+★5 passed: 100 * 1.0 * 1.25 = 125", () => {
      const { result } = applyTrialAndPermanent(100, {
        active_trial_star: 3,
        permanent_xp_multiplier: 0.25,
      });
      expect(result).toBeCloseTo(125, 5);
    });

    it("trial × permanent compose multiplicatively", () => {
      const { result } = applyTrialAndPermanent(10, {
        active_trial_star: 5,
        permanent_xp_multiplier: 0.05,
      });
      expect(result).toBeCloseTo(10 * 0.5 * 1.05);
    });
  });
});
