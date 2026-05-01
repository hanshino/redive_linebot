const { applyTrialAndPermanent } = require("../trialAndPermanent");

describe("applyTrialAndPermanent", () => {
  test("no trial, no permanent → trialMult=1, permanentMult=1", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: null, permanent_xp_multiplier: 0 });
    expect(out.result).toBe(10);
    expect(out.trialMult).toBe(1);
    expect(out.permanentMult).toBe(1);
  });

  test("★2 trial → trialMult=0.7", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: 2, permanent_xp_multiplier: 0 });
    expect(out.trialMult).toBe(0.7);
    expect(out.result).toBeCloseTo(7);
  });

  test("★5 trial → trialMult=0.5", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: 5, permanent_xp_multiplier: 0 });
    expect(out.trialMult).toBe(0.5);
    expect(out.result).toBeCloseTo(5);
  });

  test("permanent 0.05 → permanentMult=1.05", () => {
    const out = applyTrialAndPermanent(10, {
      active_trial_star: null,
      permanent_xp_multiplier: 0.05,
    });
    expect(out.permanentMult).toBeCloseTo(1.05);
    expect(out.result).toBeCloseTo(10.5);
  });

  test("trial × permanent compose multiplicatively", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: 5, permanent_xp_multiplier: 0.05 });
    expect(out.result).toBeCloseTo(10 * 0.5 * 1.05);
  });

  test("nullish permanent_xp_multiplier defaults to 0", () => {
    const out = applyTrialAndPermanent(10, { active_trial_star: null });
    expect(out.permanentMult).toBe(1);
  });
});
