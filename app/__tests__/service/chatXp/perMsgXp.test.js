const { computePerMsgXp } = require("../../../src/service/chatXp/perMsgXp");

const baseStatus = { blessings: [] };

describe("computePerMsgXp", () => {
  it("returns base at full cooldown, no group bonus, no blessings", () => {
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 1.0, groupBonus: 1.0, status: baseStatus })
    ).toBe(90);
  });

  it("scales by cooldownRate", () => {
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 0.5, groupBonus: 1.0, status: baseStatus })
    ).toBe(45);
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 0.1, groupBonus: 1.0, status: baseStatus })
    ).toBe(9);
  });

  it("returns 0 when cooldownRate is 0", () => {
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 0, groupBonus: 2.0, status: { blessings: [1] } })
    ).toBe(0);
  });

  it("scales by groupBonus", () => {
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 1.0, groupBonus: 1.5, status: baseStatus })
    ).toBe(135);
  });

  it("applies blessing 1 (+8%)", () => {
    // 90 * 1.08 = 97.2 -> 97
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 1.0, groupBonus: 1.0, status: { blessings: [1] } })
    ).toBe(97);
  });

  it("composes all factors", () => {
    // 90 * 0.8 * 1.10 * 1.08 = 85.536 -> 86
    expect(
      computePerMsgXp({ base: 90, cooldownRate: 0.8, groupBonus: 1.1, status: { blessings: [1] } })
    ).toBe(86);
  });

  it("rounds via Math.round (0.5 rounds up)", () => {
    // 10 * 0.25 * 1.0 * 1.0 = 2.5 -> 3
    expect(
      computePerMsgXp({ base: 10, cooldownRate: 0.25, groupBonus: 1.0, status: baseStatus })
    ).toBe(3);
  });

  it("handles missing blessings array gracefully", () => {
    expect(computePerMsgXp({ base: 90, cooldownRate: 1.0, groupBonus: 1.0, status: {} })).toBe(90);
  });
});
