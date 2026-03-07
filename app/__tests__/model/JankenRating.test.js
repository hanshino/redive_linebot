const JankenRating = require("../../src/model/application/JankenRating");

describe("JankenRating", () => {
  describe("getRankTier", () => {
    it("returns beginner for elo < 1200", () => {
      expect(JankenRating.getRankTier(1000)).toBe("beginner");
      expect(JankenRating.getRankTier(1199)).toBe("beginner");
    });

    it("returns challenger for elo 1200-1399", () => {
      expect(JankenRating.getRankTier(1200)).toBe("challenger");
      expect(JankenRating.getRankTier(1399)).toBe("challenger");
    });

    it("returns fighter for elo 1400-1599", () => {
      expect(JankenRating.getRankTier(1400)).toBe("fighter");
    });

    it("returns master for elo 1600-1799", () => {
      expect(JankenRating.getRankTier(1600)).toBe("master");
    });

    it("returns legend for elo >= 1800", () => {
      expect(JankenRating.getRankTier(1800)).toBe("legend");
      expect(JankenRating.getRankTier(2500)).toBe("legend");
    });
  });

  describe("getMaxBet", () => {
    it("returns max bet for rank tier", () => {
      expect(JankenRating.getMaxBet("beginner")).toBe(1000);
      expect(JankenRating.getMaxBet("legend")).toBe(50000);
    });
  });
});
