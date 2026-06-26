const { computeCatchupMult } = require("../../../src/service/chatXp/catchupMult");

const cfg = {
  enabled: true,
  targetRate: 722,
  maxBoost: 2.0,
  graceDays: 7,
  floor: 100,
  lvMaxExp: 130000,
};
const DAY = 86400000;
const now = 1_700_000_000_000;
const daysAgo = d => new Date(now - d * DAY);

describe("computeCatchupMult", () => {
  it("on-track player (lifetime == expected) gets no boost", () => {
    // age 100d → expected 72200; lifetime 72200 → ratio 1.0
    const status = { created_at: daysAgo(100), prestige_count: 0, current_exp: 72200 };
    expect(computeCatchupMult(status, cfg, now)).toBe(1.0);
  });

  it("badly-behind player is boosted but capped at maxBoost", () => {
    const status = { created_at: daysAgo(100), prestige_count: 0, current_exp: 1000 };
    expect(computeCatchupMult(status, cfg, now)).toBe(2.0);
  });

  it("mid-tier behind player gets a partial boost", () => {
    // expected 72200 / lifetime 48000 = 1.504
    const status = { created_at: daysAgo(100), prestige_count: 0, current_exp: 48000 };
    expect(computeCatchupMult(status, cfg, now)).toBeCloseTo(1.504, 2);
  });

  it("whale ahead of pace gets no boost", () => {
    // age 50d → expected 36100; lifetime 130000 (1 prestige) → ratio < 1
    const status = { created_at: daysAgo(50), prestige_count: 1, current_exp: 0 };
    expect(computeCatchupMult(status, cfg, now)).toBe(1.0);
  });

  it("newcomer inside the grace window gets no boost", () => {
    const status = { created_at: daysAgo(3), prestige_count: 0, current_exp: 0 };
    expect(computeCatchupMult(status, cfg, now)).toBe(1.0);
  });

  it("missing created_at → no boost (stale cache safety)", () => {
    expect(computeCatchupMult({ prestige_count: 0, current_exp: 0 }, cfg, now)).toBe(1.0);
  });

  it("disabled config → no boost", () => {
    const status = { created_at: daysAgo(100), prestige_count: 0, current_exp: 1000 };
    expect(computeCatchupMult(status, { ...cfg, enabled: false }, now)).toBe(1.0);
  });
});
