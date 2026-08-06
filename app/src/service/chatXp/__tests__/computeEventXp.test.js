const { computeEventXp } = require("../computeEventXp");

// Minimal state: no blessings, prestiged (honeymoon off), no trial/permanent.
const baseState = {
  prestige_count: 1,
  blessings: [],
  active_trial_star: null,
  rhythm_mastery: false,
  active_trial_id: null,
  // 0 = no permanent bonus (permanentMult = 1 + this, per trialAndPermanent.js).
  // The brief's fixture had this at 1 (→ permanentMult 2), which contradicts the
  // "no trial/permanent" comment above and breaks the effectiveInt===raw / ×1.1
  // identities below regardless of implementation — fixed to 0 per task guidance
  // (adjust the fixture, not the implementation, when a baseline number doesn't hold).
  permanent_xp_multiplier: 0,
};
const args = (over = {}) => ({
  event: { timeSinceLastMsg: 10000, groupCount: 1 }, // >6s gap → cooldownRate 1.0
  state: baseState,
  base: 90,
  effects: {},
  dailyRawBefore: 0,
  rawDeltaSoFar: 0,
  catchupMult: 1,
  ...over,
});

describe("computeEventXp", () => {
  it("neutral effects reproduce baseline (cooldownRate 1.0 for a long gap)", () => {
    const r = computeEventXp(args());
    expect(r.cooldownRate).toBe(1.0);
    expect(r.raw).toBeGreaterThan(0);
    expect(r.effectiveInt).toBe(Math.round(r.raw)); // no diminish yet, no other mults
  });

  it("effective_xp_mult scales final effective XP", () => {
    const neutral = computeEventXp(args());
    const boosted = computeEventXp(args({ effects: { effective_xp_mult: 1.1 } }));
    expect(boosted.effectiveInt).toBe(Math.round(neutral.raw * 1.1));
  });

  it("raw_xp_mult scales raw XP", () => {
    const neutral = computeEventXp(args());
    const reduced = computeEventXp(args({ effects: { raw_xp_mult: 0.9 } }));
    expect(reduced.raw).toBeCloseTo(neutral.raw * 0.9, 5);
  });

  it("silence_burst applies its highest raw multiplier after 24h", () => {
    const neutral = computeEventXp(args());
    const weather = computeEventXp(
      args({
        event: { timeSinceLastMsg: 86400000, groupCount: 1 },
        effects: { silence_burst: [{ gapMs: 86400000, mult: 10 }] },
      })
    );
    expect(weather.raw).toBeCloseTo(neutral.raw * 10, 5);
  });

  it("null silence uses the highest tier without NaN", () => {
    const r = computeEventXp(
      args({
        event: { timeSinceLastMsg: null, groupCount: 1 },
        effects: { silence_burst: [{ gapMs: 86400000, mult: 10 }] },
      })
    );
    expect(r.raw).toBeCloseTo(computeEventXp(args()).raw * 10, 5);
    expect(Number.isNaN(r.raw)).toBe(false);
  });

  it("cooldown_required_mult>1 lengthens the window: a 5s gap drops below full rate", () => {
    // 5000ms < 6000 (t4_6) but >4000 (t2_4) → baseline rate 0.8 without weather.
    const neutral = computeEventXp(args({ event: { timeSinceLastMsg: 5000, groupCount: 1 } }));
    // /1.1 → 4545ms, still in the 0.8 tier here; use a gap that crosses a boundary:
    // 4200ms neutral → 0.8 tier; /1.1 = 3818ms → 0.5 tier (t2_4=4000). Lower rate ⇒ less raw.
    const n2 = computeEventXp(args({ event: { timeSinceLastMsg: 4200, groupCount: 1 } }));
    const w2 = computeEventXp(
      args({
        event: { timeSinceLastMsg: 4200, groupCount: 1 },
        effects: { cooldown_required_mult: 1.1 },
      })
    );
    expect(w2.cooldownRate).toBeLessThan(n2.cooldownRate);
    expect(neutral.cooldownRate).toBeGreaterThan(0); // sanity
  });

  it("null timeSinceLastMsg stays null (no NaN) → cooldownRate 1.0", () => {
    const r = computeEventXp(
      args({
        event: { timeSinceLastMsg: null, groupCount: 1 },
        effects: { cooldown_required_mult: 1.1 },
      })
    );
    expect(r.cooldownRate).toBe(1.0);
    expect(Number.isNaN(r.raw)).toBe(false);
  });

  it("group_bonus_mult scales the group bonus", () => {
    const neutral = computeEventXp(args());
    const boosted = computeEventXp(args({ effects: { group_bonus_mult: 1.1 } }));
    expect(boosted.groupBonus).toBeCloseTo(neutral.groupBonus * 1.1, 5);
  });
});
