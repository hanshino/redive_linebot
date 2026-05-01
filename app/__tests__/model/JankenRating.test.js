// Integration tests against the real default.json config.
// Pure-unit tier tests with a mocked config live at
// app/src/model/application/__tests__/JankenRating.test.js.
const JankenRating = require("../../src/model/application/JankenRating");

describe("JankenRating", () => {
  describe("getRankTier", () => {
    it("returns beginner for elo < 1100", () => {
      expect(JankenRating.getRankTier(1000)).toBe("beginner");
      expect(JankenRating.getRankTier(1099)).toBe("beginner");
    });

    it("returns challenger for elo 1100-1249", () => {
      expect(JankenRating.getRankTier(1100)).toBe("challenger");
      expect(JankenRating.getRankTier(1249)).toBe("challenger");
    });

    it("returns fighter for elo 1250-1399", () => {
      expect(JankenRating.getRankTier(1250)).toBe("fighter");
    });

    it("returns master for elo 1400-1549", () => {
      expect(JankenRating.getRankTier(1400)).toBe("master");
    });

    it("returns legend for elo >= 1550", () => {
      expect(JankenRating.getRankTier(1550)).toBe("legend");
      expect(JankenRating.getRankTier(2500)).toBe("legend");
    });
  });

  describe("getMaxBet", () => {
    it("returns max bet for rank tier", () => {
      expect(JankenRating.getMaxBet("beginner")).toBe(50000);
      expect(JankenRating.getMaxBet("legend")).toBe(1000000);
    });
  });

  describe("getSubTier", () => {
    it("returns 5 for initial elo 1000 (beginner)", () => {
      expect(JankenRating.getSubTier(1000)).toBe(5);
    });
    it("returns 4 for elo 1040", () => {
      expect(JankenRating.getSubTier(1040)).toBe(4);
    });
    it("returns 5 for elo 1100 (challenger base)", () => {
      expect(JankenRating.getSubTier(1100)).toBe(5);
    });
    it("returns 3 for elo 1200 (challenger mid)", () => {
      expect(JankenRating.getSubTier(1200)).toBe(3);
    });
    it("returns 5 for elo 1250 (fighter base)", () => {
      expect(JankenRating.getSubTier(1250)).toBe(5);
    });
    it("returns 2 for elo 1390+ (fighter top)", () => {
      expect(JankenRating.getSubTier(1390)).toBe(2);
      expect(JankenRating.getSubTier(1399)).toBe(2);
    });
    it("returns 5 for elo 1550 (legend base)", () => {
      expect(JankenRating.getSubTier(1550)).toBe(5);
    });
    it("returns 1 for elo 1710+ (legend top)", () => {
      expect(JankenRating.getSubTier(1710)).toBe(1);
    });
    it("handles elo below 1000", () => {
      expect(JankenRating.getSubTier(900)).toBe(5);
    });
  });

  describe("getKFactor", () => {
    it("returns 12 for bet < 100", () => {
      expect(JankenRating.getKFactor(10)).toBe(12);
      expect(JankenRating.getKFactor(99)).toBe(12);
    });
    it("returns 20 for bet 100-999", () => {
      expect(JankenRating.getKFactor(100)).toBe(20);
      expect(JankenRating.getKFactor(999)).toBe(20);
    });
    it("returns 32 for bet 1000-4999", () => {
      expect(JankenRating.getKFactor(1000)).toBe(32);
      expect(JankenRating.getKFactor(4999)).toBe(32);
    });
    it("returns 60 for bet 5000-49999", () => {
      expect(JankenRating.getKFactor(5000)).toBe(60);
      expect(JankenRating.getKFactor(49999)).toBe(60);
    });
    it("returns 80 for bet >= 50000", () => {
      expect(JankenRating.getKFactor(50000)).toBe(80);
      expect(JankenRating.getKFactor(100000)).toBe(80);
    });
  });

  describe("getRankLabel", () => {
    it("returns Chinese name with sub-tier", () => {
      expect(JankenRating.getRankLabel(1000)).toBe("見習者 5");
      expect(JankenRating.getRankLabel(1550)).toBe("傳說 5");
    });
  });

  describe("getNextTierElo", () => {
    it("returns next major tier threshold", () => {
      expect(JankenRating.getNextTierElo(1000)).toBe(1100);
      expect(JankenRating.getNextTierElo(1200)).toBe(1250);
    });
    it("returns null for legend", () => {
      expect(JankenRating.getNextTierElo(1550)).toBeNull();
    });
  });

  describe("getRankImageKey", () => {
    it("returns rank image key", () => {
      expect(JankenRating.getRankImageKey(1000)).toBe("rank_beginner");
      expect(JankenRating.getRankImageKey(1300)).toBe("rank_fighter");
    });
  });
});
