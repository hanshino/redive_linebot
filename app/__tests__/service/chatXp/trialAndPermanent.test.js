const { applyTrialAndPermanent } = require("../../../src/service/chatXp/trialAndPermanent");

describe("applyTrialAndPermanent", () => {
  it("returns input unchanged when no trial and no permanent", () => {
    expect(
      applyTrialAndPermanent(100, { active_trial_star: null, permanent_xp_multiplier: 0 })
    ).toBeCloseTo(100, 5);
  });

  describe("trial current-period multiplier", () => {
    it("★1 active: x1.0", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 1, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(100, 5);
    });
    it("★2 active: x0.7", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 2, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(70, 5);
    });
    it("★3 active: x1.0 (cooldown-only restriction)", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 3, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(100, 5);
    });
    it("★4 active: x1.0 (group-bonus-only restriction)", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 4, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(100, 5);
    });
    it("★5 active: x0.5", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 5, permanent_xp_multiplier: 0 })
      ).toBeCloseTo(50, 5);
    });
  });

  describe("permanent multiplier", () => {
    it("★2 passed (+0.10): x1.10", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: null, permanent_xp_multiplier: 0.1 })
      ).toBeCloseTo(110, 5);
    });
    it("★2 + ★5 passed (+0.25): x1.25", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: null, permanent_xp_multiplier: 0.25 })
      ).toBeCloseTo(125, 5);
    });
  });

  describe("trial + permanent combined", () => {
    it("★5 active + ★2 passed: 100 * 0.5 * 1.10 = 55", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 5, permanent_xp_multiplier: 0.1 })
      ).toBeCloseTo(55, 5);
    });
    it("★3 active + ★2+★5 passed: 100 * 1.0 * 1.25 = 125", () => {
      expect(
        applyTrialAndPermanent(100, { active_trial_star: 3, permanent_xp_multiplier: 0.25 })
      ).toBeCloseTo(125, 5);
    });
  });
});
