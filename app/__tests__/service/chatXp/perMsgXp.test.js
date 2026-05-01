const { computePerMsgXp } = require("../../../src/service/chatXp/perMsgXp");

const baseStatus = { blessings: [] };

describe("computePerMsgXp", () => {
  describe("return shape", () => {
    it("returns { raw, blessing1Mult } object", () => {
      const out = computePerMsgXp({
        base: 5,
        cooldownRate: 1.0,
        groupBonus: 1.0,
        status: baseStatus,
      });
      expect(out).toHaveProperty("raw");
      expect(out).toHaveProperty("blessing1Mult");
    });

    it("raw is an integer (Math.round applied)", () => {
      const { raw } = computePerMsgXp({
        base: 5,
        cooldownRate: 1.2,
        groupBonus: 1.1,
        status: { blessings: [1] },
      });
      // 5 × 1.2 × 1.1 × 1.08 = 7.128 → round → 7
      expect(raw).toBe(7);
    });
  });

  describe("no blessing 1", () => {
    it("blessing1Mult=1, raw = round(base × cooldown × group)", () => {
      const { raw, blessing1Mult } = computePerMsgXp({
        base: 5,
        cooldownRate: 1.0,
        groupBonus: 1.1,
        status: baseStatus,
      });
      expect(blessing1Mult).toBe(1);
      expect(raw).toBe(Math.round(5 * 1.0 * 1.1)); // 6
    });

    it("returns raw=base at full cooldown, no group bonus", () => {
      const { raw } = computePerMsgXp({
        base: 90,
        cooldownRate: 1.0,
        groupBonus: 1.0,
        status: baseStatus,
      });
      expect(raw).toBe(90);
    });

    it("scales by cooldownRate", () => {
      expect(
        computePerMsgXp({ base: 90, cooldownRate: 0.5, groupBonus: 1.0, status: baseStatus }).raw
      ).toBe(45);
      expect(
        computePerMsgXp({ base: 90, cooldownRate: 0.1, groupBonus: 1.0, status: baseStatus }).raw
      ).toBe(9);
    });

    it("returns raw=0 when cooldownRate is 0", () => {
      const { raw } = computePerMsgXp({
        base: 90,
        cooldownRate: 0,
        groupBonus: 2.0,
        status: { blessings: [1] },
      });
      expect(raw).toBe(0);
    });

    it("scales by groupBonus", () => {
      const { raw } = computePerMsgXp({
        base: 90,
        cooldownRate: 1.0,
        groupBonus: 1.5,
        status: baseStatus,
      });
      expect(raw).toBe(135);
    });
  });

  describe("blessing 1 (+8%)", () => {
    it("blessing1Mult=1.08", () => {
      const { blessing1Mult } = computePerMsgXp({
        base: 5,
        cooldownRate: 1.0,
        groupBonus: 1.0,
        status: { blessings: [1] },
      });
      expect(blessing1Mult).toBeCloseTo(1.08);
    });

    it("raw = round(base × cooldown × group × 1.08)", () => {
      // 90 * 1.08 = 97.2 -> 97
      const { raw } = computePerMsgXp({
        base: 90,
        cooldownRate: 1.0,
        groupBonus: 1.0,
        status: { blessings: [1] },
      });
      expect(raw).toBe(97);
    });

    it("composes all factors: 90 * 0.8 * 1.10 * 1.08 = 85.536 -> 86", () => {
      const { raw } = computePerMsgXp({
        base: 90,
        cooldownRate: 0.8,
        groupBonus: 1.1,
        status: { blessings: [1] },
      });
      expect(raw).toBe(86);
    });
  });

  describe("edge cases", () => {
    it("rounds via Math.round (0.5 rounds up): 10 * 0.25 = 2.5 -> 3", () => {
      const { raw } = computePerMsgXp({
        base: 10,
        cooldownRate: 0.25,
        groupBonus: 1.0,
        status: baseStatus,
      });
      expect(raw).toBe(3);
    });

    it("handles missing blessings array gracefully — blessing1Mult=1", () => {
      const { raw, blessing1Mult } = computePerMsgXp({
        base: 90,
        cooldownRate: 1.0,
        groupBonus: 1.0,
        status: {},
      });
      expect(raw).toBe(90);
      expect(blessing1Mult).toBe(1);
    });

    it("non-array blessings tolerated — blessing1Mult=1", () => {
      const { blessing1Mult } = computePerMsgXp({
        base: 5,
        cooldownRate: 1.0,
        groupBonus: 1.0,
        status: { blessings: null },
      });
      expect(blessing1Mult).toBe(1);
    });
  });
});
