jest.mock("config", () => {
  const data = {
    "minigame.janken.elo.kFactorTiers": [
      { minBet: 50000, k: 80 },
      { minBet: 5000, k: 60 },
      { minBet: 1000, k: 32 },
      { minBet: 100, k: 20 },
      { minBet: 0, k: 12 },
    ],
    "minigame.janken.elo.lossFactor": 0.5,
    "minigame.janken.elo.nonBetK": 0,
    "minigame.janken.elo.streakBonus": [
      { minStreak: 7, multiplier: 2.0 },
      { minStreak: 5, multiplier: 1.5 },
      { minStreak: 3, multiplier: 1.25 },
    ],
    "minigame.janken.elo.initial": 1000,
    "minigame.janken.elo.tiers": [{ key: "beginner", name: "見習者", minElo: 0 }],
    "minigame.janken.bet.feeRate": 0.1,
    "minigame.janken.bet.minAmount": 10,
    "minigame.janken.streak.bountyMinBet": 1000,
    "minigame.janken.streak.bountyClaimMultiplier": 5,
    "redis.keys.jankenDecide": "jankenDecide",
    "redis.keys.jankenChallenge": "jankenChallenge",
  };
  return { get: jest.fn(key => data[key]) };
});

const JankenService = require("../JankenService");

describe("JankenService.calculateEloChange (rebalanced K table)", () => {
  test("avg bet of 289 lands in K=20 tier (was K=8)", () => {
    const change = JankenService.calculateEloChange(1000, 1000, "win", 289);
    // K=20, expected=0.5, raw = 20 * 0.5 = 10; multiplier 1 (streak 0) → floor(10) = 10
    expect(change).toBe(10);
  });

  test("loss at K=20 even matchup applies lossFactor 0.5", () => {
    const change = JankenService.calculateEloChange(1000, 1000, "lose", 289);
    // raw = 20 * (0 - 0.5) = -10; lossFactor 0.5 → ceil(-10 * 0.5) = -5
    expect(change).toBe(-5);
  });

  test("non-bet match returns 0 when nonBetK=0", () => {
    expect(JankenService.calculateEloChange(1000, 1000, "win", 0)).toBe(0);
  });
});
