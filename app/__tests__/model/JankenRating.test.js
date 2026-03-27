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
      expect(JankenRating.getMaxBet("beginner")).toBe(20000);
      expect(JankenRating.getMaxBet("legend")).toBe(500000);
    });
  });

  describe("getSubTier", () => {
    it("returns 5 for initial elo 1000 (beginner)", () => {
      expect(JankenRating.getSubTier(1000)).toBe(5);
    });
    it("returns 4 for elo 1040", () => {
      expect(JankenRating.getSubTier(1040)).toBe(4);
    });
    it("returns 1 for elo 1160+", () => {
      expect(JankenRating.getSubTier(1160)).toBe(1);
      expect(JankenRating.getSubTier(1199)).toBe(1);
    });
    it("returns 5 for elo 1200 (challenger base)", () => {
      expect(JankenRating.getSubTier(1200)).toBe(5);
    });
    it("returns 1 for elo 1360 (challenger top)", () => {
      expect(JankenRating.getSubTier(1360)).toBe(1);
    });
    it("returns 5 for elo 1800 (legend base)", () => {
      expect(JankenRating.getSubTier(1800)).toBe(5);
    });
    it("returns 1 for elo 1960+ (legend top)", () => {
      expect(JankenRating.getSubTier(1960)).toBe(1);
    });
    it("handles elo below 1000", () => {
      expect(JankenRating.getSubTier(900)).toBe(5);
    });
  });

  describe("getKFactor", () => {
    it("returns 8 for bet < 500", () => {
      expect(JankenRating.getKFactor(10)).toBe(8);
      expect(JankenRating.getKFactor(499)).toBe(8);
    });
    it("returns 16 for bet 500-2999", () => {
      expect(JankenRating.getKFactor(500)).toBe(16);
      expect(JankenRating.getKFactor(2999)).toBe(16);
    });
    it("returns 24 for bet 3000-9999", () => {
      expect(JankenRating.getKFactor(3000)).toBe(24);
      expect(JankenRating.getKFactor(9999)).toBe(24);
    });
    it("returns 40 for bet >= 10000", () => {
      expect(JankenRating.getKFactor(10000)).toBe(40);
      expect(JankenRating.getKFactor(50000)).toBe(40);
    });
  });

  describe("getRankLabel", () => {
    it("returns Chinese name with sub-tier", () => {
      expect(JankenRating.getRankLabel(1000)).toBe("見習者 5");
      expect(JankenRating.getRankLabel(1280)).toBe("挑戰者 3");
      expect(JankenRating.getRankLabel(1800)).toBe("傳說 5");
    });
  });

  describe("getNextTierElo", () => {
    it("returns next major tier threshold", () => {
      expect(JankenRating.getNextTierElo(1000)).toBe(1200);
      expect(JankenRating.getNextTierElo(1350)).toBe(1400);
    });
    it("returns null for legend", () => {
      expect(JankenRating.getNextTierElo(1800)).toBeNull();
    });
  });

  describe("getRankImageKey", () => {
    it("returns rank image key", () => {
      expect(JankenRating.getRankImageKey(1000)).toBe("rank_beginner");
      expect(JankenRating.getRankImageKey(1500)).toBe("rank_fighter");
    });
  });
});
