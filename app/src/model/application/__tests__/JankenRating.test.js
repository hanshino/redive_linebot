jest.mock("config", () => ({
  get: jest.fn(key => {
    if (key === "minigame.janken.elo.tiers") {
      return [
        { key: "beginner", name: "見習者", minElo: 0 },
        { key: "challenger", name: "挑戰者", minElo: 1100 },
        { key: "fighter", name: "強者", minElo: 1250 },
        { key: "master", name: "達人", minElo: 1400 },
        { key: "legend", name: "傳說", minElo: 1550 },
      ];
    }
    if (key === "minigame.janken.elo.initial") return 1000;
    return undefined;
  }),
}));

const JankenRating = require("../JankenRating");

describe("JankenRating tiers from config", () => {
  test("returns fighter at 1250", () => {
    expect(JankenRating.getRankTier(1250)).toBe("fighter");
  });
  test("returns master at 1400", () => {
    expect(JankenRating.getRankTier(1400)).toBe("master");
  });
  test("returns challenger at 1100", () => {
    expect(JankenRating.getRankTier(1100)).toBe("challenger");
  });
  test("returns beginner at 1099", () => {
    expect(JankenRating.getRankTier(1099)).toBe("beginner");
  });
  test("getNextTierElo from challenger returns fighter floor", () => {
    expect(JankenRating.getNextTierElo(1150)).toBe(1250);
  });
});
