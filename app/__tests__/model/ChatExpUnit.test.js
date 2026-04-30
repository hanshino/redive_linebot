const ChatExpUnit = require("../../src/model/application/ChatExpUnit");

const ROWS = [
  { unit_level: 0, total_exp: 0 },
  { unit_level: 1, total_exp: 3 },
  { unit_level: 10, total_exp: 270 },
  { unit_level: 50, total_exp: 6750 },
  { unit_level: 100, total_exp: 130000 },
];

describe("ChatExpUnit", () => {
  describe("getLevelFromExp", () => {
    it("returns 0 when exp is 0", () => {
      expect(ChatExpUnit.getLevelFromExp(0, ROWS)).toBe(0);
    });

    it("returns the highest level whose total_exp <= exp", () => {
      expect(ChatExpUnit.getLevelFromExp(269, ROWS)).toBe(1);
      expect(ChatExpUnit.getLevelFromExp(270, ROWS)).toBe(10);
      expect(ChatExpUnit.getLevelFromExp(6749, ROWS)).toBe(10);
      expect(ChatExpUnit.getLevelFromExp(6750, ROWS)).toBe(50);
    });

    it("caps at max level when exp >= max total_exp", () => {
      expect(ChatExpUnit.getLevelFromExp(130000, ROWS)).toBe(100);
      expect(ChatExpUnit.getLevelFromExp(999999, ROWS)).toBe(100);
    });

    it("returns 0 for negative exp (never overwrites initial level)", () => {
      expect(ChatExpUnit.getLevelFromExp(-1, ROWS)).toBe(0);
      expect(ChatExpUnit.getLevelFromExp(-9999, ROWS)).toBe(0);
    });

    it("returns 0 for empty rows array", () => {
      expect(ChatExpUnit.getLevelFromExp(1000, [])).toBe(0);
    });
  });

  describe("getTotalExpForLevel", () => {
    it("returns total_exp for a known level", () => {
      expect(ChatExpUnit.getTotalExpForLevel(50, ROWS)).toBe(6750);
      expect(ChatExpUnit.getTotalExpForLevel(100, ROWS)).toBe(130000);
    });

    it("returns null for an unknown level", () => {
      expect(ChatExpUnit.getTotalExpForLevel(101, ROWS)).toBeNull();
      expect(ChatExpUnit.getTotalExpForLevel(-1, ROWS)).toBeNull();
    });
  });
});
