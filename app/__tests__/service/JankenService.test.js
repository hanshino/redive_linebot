jest.mock("../../src/service/EventCenterService", () => ({
  add: jest.fn().mockResolvedValue(undefined),
  getEventName: jest.fn(name => `event_center:${name}`),
}));

jest.mock("../../src/model/application/Inventory", () => ({
  inventory: {
    getUserMoney: jest.fn(),
    increaseGodStone: jest.fn().mockResolvedValue(undefined),
    decreaseGodStone: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../src/model/application/JankenRating", () => ({
  findOrCreate: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
  getRankTier: jest.fn(),
  getMaxBet: jest.fn(),
  getMaxBounty: jest.fn().mockReturnValue(10000),
  getKFactor: jest.fn(),
}));

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockTrxQuery = jest.fn(() => ({
  where: jest.fn(() => ({
    forUpdate: jest.fn(() => ({
      first: jest.fn(),
    })),
    update: mockUpdate,
  })),
}));
mockTrxQuery.transaction = jest.fn(async cb => cb(mockTrxQuery));
mockTrxQuery.transactionProvider = jest.fn(() => jest.fn(async () => mockTrxQuery));

jest.mock("../../src/util/mysql", () => mockTrxQuery);
jest.mock("../../src/model/application/JankenAutoFateLog", () => ({
  create: jest.fn().mockResolvedValue(1),
}));
jest.mock("../../src/model/application/UserAutoPreference", () => ({
  first: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../src/service/SubscriptionService", () => ({
  hasEffect: jest.fn().mockResolvedValue(false),
}));

const JankenService = require("../../src/service/JankenService");
const redis = require("../../src/util/redis");
const JankenRating = require("../../src/model/application/JankenRating");

describe("JankenService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("determineWinner", () => {
    it("rock beats scissors", () => {
      const [p1, p2] = JankenService.determineWinner("rock", "scissors");
      expect(p1).toBe("win");
      expect(p2).toBe("lose");
    });

    it("scissors beats paper", () => {
      const [p1, p2] = JankenService.determineWinner("scissors", "paper");
      expect(p1).toBe("win");
      expect(p2).toBe("lose");
    });

    it("paper beats rock", () => {
      const [p1, p2] = JankenService.determineWinner("paper", "rock");
      expect(p1).toBe("win");
      expect(p2).toBe("lose");
    });

    it("same choice is draw", () => {
      const [p1, p2] = JankenService.determineWinner("rock", "rock");
      expect(p1).toBe("draw");
      expect(p2).toBe("draw");
    });
  });

  describe("randomChoice", () => {
    it("returns rock, scissors, or paper", () => {
      const valid = ["rock", "scissors", "paper"];
      for (let i = 0; i < 20; i++) {
        expect(valid).toContain(JankenService.randomChoice());
      }
    });
  });

  describe("calculateBetSettlement", () => {
    it("winner gets 90% of total pot", () => {
      const result = JankenService.calculateBetSettlement(100, "win");
      expect(result.winnerGets).toBe(180);
      expect(result.fee).toBe(20);
    });

    it("draw refunds both", () => {
      const result = JankenService.calculateBetSettlement(100, "draw");
      expect(result.refundEach).toBe(100);
      expect(result.fee).toBe(0);
    });
  });

  describe("submitChoice", () => {
    it("stores choice in redis", async () => {
      redis.set.mockResolvedValue("OK");
      redis.get.mockResolvedValue(null);

      await JankenService.submitChoice("match-123", "user-1", "rock");

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining("match-123:user-1"),
        "rock",
        expect.objectContaining({ EX: 7 * 24 * 60 * 60 })
      );
    });

    it("returns both choices when both submitted", async () => {
      redis.set.mockResolvedValue("OK");
      redis.get.mockResolvedValueOnce("rock").mockResolvedValueOnce("scissors");

      const result = await JankenService.submitChoice("match-123", "user-2", "scissors", {
        p1UserId: "user-1",
        p2UserId: "user-2",
      });

      expect(result).toEqual({
        ready: true,
        p1Choice: "rock",
        p2Choice: "scissors",
      });
    });

    it("returns not ready when only one submitted", async () => {
      redis.set.mockResolvedValue("OK");
      redis.get.mockResolvedValueOnce("rock").mockResolvedValueOnce(null);

      const result = await JankenService.submitChoice("match-123", "user-1", "rock", {
        p1UserId: "user-1",
        p2UserId: "user-2",
      });

      expect(result).toEqual({ ready: false });
    });
  });

  describe("calculateBountyIncrement", () => {
    it("returns 0 for fee 0", () => {
      expect(JankenService.calculateBountyIncrement(0)).toBe(0);
    });

    it("returns the fee amount directly", () => {
      expect(JankenService.calculateBountyIncrement(100)).toBe(100);
      expect(JankenService.calculateBountyIncrement(200)).toBe(200);
    });
  });

  describe("updateStreaks", () => {
    let mockFirst;

    beforeEach(() => {
      mockFirst = jest.fn();
      mockTrxQuery.mockImplementation(() => ({
        where: jest.fn(() => ({
          forUpdate: jest.fn(() => ({
            first: mockFirst,
          })),
          update: mockUpdate,
        })),
      }));
    });

    it("increments winner streak and resets loser streak", async () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      mockFirst
        .mockResolvedValueOnce({
          user_id: "winner",
          streak: 2,
          max_streak: 5,
          bounty: 100,
          rank_tier: "beginner",
        })
        .mockResolvedValueOnce({ user_id: "loser", streak: 3, max_streak: 4, bounty: 300 });

      const result = await JankenService.updateStreaks("winner", "loser", "win", {
        betAmount: 1000,
        fee: 200,
      });

      expect(result).toEqual({
        winnerStreak: 3,
        winnerBounty: 300,
        loserPreviousStreak: 3,
        loserBounty: 300,
      });
    });

    it("updates max_streak when new record", async () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      mockFirst
        .mockResolvedValueOnce({
          user_id: "winner",
          streak: 5,
          max_streak: 5,
          bounty: 200,
          rank_tier: "beginner",
        })
        .mockResolvedValueOnce({ user_id: "loser", streak: 0, max_streak: 2, bounty: 0 });

      const result = await JankenService.updateStreaks("winner", "loser", "win", {
        betAmount: 1000,
        fee: 200,
      });

      expect(result.winnerStreak).toBe(6);
      expect(result.winnerBounty).toBe(400);
    });

    it("does not change streaks on draw", async () => {
      const result = await JankenService.updateStreaks("p1", "p2", "draw", { betAmount: 1000 });

      expect(result).toEqual({
        winnerStreak: 0,
        loserPreviousStreak: 0,
        loserBounty: 0,
      });
      expect(mockTrxQuery.transaction).not.toHaveBeenCalled();
    });

    it("does not change streaks when no bet", async () => {
      const result = await JankenService.updateStreaks("p1", "p2", "win");

      expect(result).toEqual({
        winnerStreak: 0,
        loserPreviousStreak: 0,
        loserBounty: 0,
      });
      expect(mockTrxQuery.transaction).not.toHaveBeenCalled();
    });

    it("handles p2 winning (p1Result is lose)", async () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      mockFirst
        .mockResolvedValueOnce({
          user_id: "p2",
          streak: 0,
          max_streak: 1,
          bounty: 0,
          rank_tier: "beginner",
        })
        .mockResolvedValueOnce({ user_id: "p1", streak: 4, max_streak: 7, bounty: 500 });

      const result = await JankenService.updateStreaks("p1", "p2", "lose", {
        betAmount: 1000,
        fee: 200,
      });

      expect(result.winnerStreak).toBe(1);
      expect(result.loserPreviousStreak).toBe(4);
    });

    it("does not accumulate bounty when bet below minimum threshold", async () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      mockFirst
        .mockResolvedValueOnce({
          user_id: "winner",
          streak: 3,
          max_streak: 5,
          bounty: 100,
          rank_tier: "beginner",
        })
        .mockResolvedValueOnce({ user_id: "loser", streak: 0, max_streak: 2, bounty: 0 });

      const result = await JankenService.updateStreaks("winner", "loser", "win", {
        betAmount: 100,
        fee: 20,
      });

      expect(result.winnerStreak).toBe(4);
      expect(result.winnerBounty).toBe(100); // bounty unchanged
    });

    it("caps bounty claim by bet multiplier", async () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      mockFirst
        .mockResolvedValueOnce({
          user_id: "winner",
          streak: 0,
          max_streak: 1,
          bounty: 0,
          rank_tier: "beginner",
        })
        .mockResolvedValueOnce({ user_id: "loser", streak: 5, max_streak: 5, bounty: 10000 });

      // Bet 100 -> max claim = 100 * 5 = 500
      const result = await JankenService.updateStreaks("winner", "loser", "win", {
        betAmount: 100,
        fee: 20,
      });

      expect(result.loserBounty).toBe(500);
    });

    it("claims full bounty when bet is large enough", async () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      mockFirst
        .mockResolvedValueOnce({
          user_id: "winner",
          streak: 0,
          max_streak: 1,
          bounty: 0,
          rank_tier: "beginner",
        })
        .mockResolvedValueOnce({ user_id: "loser", streak: 5, max_streak: 5, bounty: 5000 });

      // Bet 5000 -> max claim = 5000 * 5 = 25000, bounty is 5000 so full claim
      const result = await JankenService.updateStreaks("winner", "loser", "win", {
        betAmount: 5000,
        fee: 1000,
      });

      expect(result.loserBounty).toBe(5000);
    });
  });

  describe("calculateExpectedWinRate", () => {
    it("returns 0.5 for equal ratings", () => {
      expect(JankenService.calculateExpectedWinRate(1000, 1000)).toBeCloseTo(0.5);
    });
    it("returns higher rate for higher-rated player", () => {
      const rate = JankenService.calculateExpectedWinRate(1400, 1000);
      expect(rate).toBeGreaterThan(0.5);
      expect(rate).toBeLessThan(1);
    });
    it("returns lower rate for lower-rated player", () => {
      const rate = JankenService.calculateExpectedWinRate(1000, 1400);
      expect(rate).toBeLessThan(0.5);
      expect(rate).toBeGreaterThan(0);
    });
  });

  describe("calculateEloChange", () => {
    beforeEach(() => {
      JankenRating.getKFactor.mockImplementation(betAmount => {
        if (betAmount >= 10000) return 32;
        if (betAmount >= 3000) return 16;
        if (betAmount >= 500) return 8;
        return 2;
      });
    });

    it("returns positive change for winner with equal elo", () => {
      // K=8, floor(8 * 0.5) = 4
      const change = JankenService.calculateEloChange(1000, 1000, "win", 1000);
      expect(change).toBe(4);
    });
    it("returns reduced negative change for loser with equal elo (lossFactor=0.5)", () => {
      // K=8, raw = 8 * -0.5 = -4, ceil(-4 * 0.5) = ceil(-2) = -2
      const change = JankenService.calculateEloChange(1000, 1000, "lose", 1000);
      expect(change).toBe(-2);
    });
    it("returns 0 for draw", () => {
      const change = JankenService.calculateEloChange(1000, 1000, "draw", 1000);
      expect(change).toBe(0);
    });
    it("winner gains 0 when much higher rated (floor truncates small gains)", () => {
      // K=8, expected=0.909, floor(8 * 0.091) = 0
      const change = JankenService.calculateEloChange(1400, 1000, "win", 1000);
      expect(change).toBe(0);
    });
    it("loser loses less with lossFactor applied", () => {
      // K=8, expected=0.909, raw=8*(0-0.909)=-7.27, ceil(-7.27*0.5) = ceil(-3.636) = -3
      const change = JankenService.calculateEloChange(1400, 1000, "lose", 1000);
      expect(change).toBe(-3);
    });
    it("scales with bet amount K-factor", () => {
      const lowBet = JankenService.calculateEloChange(1000, 1000, "win", 100);
      const highBet = JankenService.calculateEloChange(1000, 1000, "win", 10000);
      expect(highBet).toBeGreaterThan(lowBet);
      expect(lowBet).toBe(1);
      expect(highBet).toBe(16);
    });
  });

  describe("calculatePairDampening", () => {
    it("returns 1 when below the matches threshold", () => {
      expect(JankenService.calculatePairDampening({ matches: 0, a_wins: 0, b_wins: 0 })).toBe(1);
      expect(JankenService.calculatePairDampening({ matches: 2, a_wins: 2, b_wins: 0 })).toBe(1);
    });

    it("returns 1 for balanced (50/50) pairs regardless of match count", () => {
      expect(JankenService.calculatePairDampening({ matches: 10, a_wins: 5, b_wins: 5 })).toBe(1);
      expect(JankenService.calculatePairDampening({ matches: 100, a_wins: 50, b_wins: 50 })).toBe(
        1
      );
    });

    it("decreases as a one-sided pair plays more matches (self-farm signature)", () => {
      const d3 = JankenService.calculatePairDampening({ matches: 3, a_wins: 3, b_wins: 0 });
      const d10 = JankenService.calculatePairDampening({ matches: 10, a_wins: 10, b_wins: 0 });
      const d20 = JankenService.calculatePairDampening({ matches: 20, a_wins: 20, b_wins: 0 });
      expect(d3).toBeCloseTo(1 / 1.6); // 0.625
      expect(d10).toBeCloseTo(1 / 3); // 0.333
      expect(d20).toBeCloseTo(1 / 5); // 0.2
      expect(d20).toBeLessThan(d10);
      expect(d10).toBeLessThan(d3);
    });

    it("only mildly dampens moderately skewed pairs (e.g. 67% winner)", () => {
      // 4 wins / 6 matches = 67% winRate, bias = 2*(0.67-0.5) ≈ 0.333
      const damp = JankenService.calculatePairDampening({ matches: 6, a_wins: 4, b_wins: 2 });
      // 1 / (1 + 6 * 0.2 * 0.333) = 1 / 1.4 ≈ 0.714
      expect(damp).toBeGreaterThan(0.7);
      expect(damp).toBeLessThan(0.8);
    });
  });

  describe("calculateEloChange with pairStats", () => {
    beforeEach(() => {
      JankenRating.getKFactor.mockImplementation(betAmount => {
        if (betAmount >= 10000) return 32;
        if (betAmount >= 3000) return 16;
        if (betAmount >= 500) return 8;
        return 2;
      });
    });

    it("dampens winner Elo gain when the same pair has a one-sided history", () => {
      const baseline = JankenService.calculateEloChange(1000, 1000, "win", 1000);
      const dampened = JankenService.calculateEloChange(1000, 1000, "win", 1000, {
        pairStats: { matches: 10, a_wins: 10, b_wins: 0 },
      });
      // baseline = floor(8 * 0.5) = 4
      // dampened = floor(4 * 0.333) = 1
      expect(baseline).toBe(4);
      expect(dampened).toBeLessThan(baseline);
      expect(dampened).toBe(1);
    });

    it("does not change Elo for balanced pairs (50/50 dampening = 1)", () => {
      const baseline = JankenService.calculateEloChange(1000, 1000, "win", 1000);
      const balanced = JankenService.calculateEloChange(1000, 1000, "win", 1000, {
        pairStats: { matches: 20, a_wins: 10, b_wins: 10 },
      });
      expect(balanced).toBe(baseline);
    });

    it("dampens loss path symmetrically so the loser's Elo is preserved too", () => {
      const baselineLoss = JankenService.calculateEloChange(1000, 1000, "lose", 1000);
      const dampenedLoss = JankenService.calculateEloChange(1000, 1000, "lose", 1000, {
        pairStats: { matches: 10, a_wins: 10, b_wins: 0 },
      });
      // baseline = ceil(-4 * 0.5) = -2; dampened = ceil(-1.333) = 0 (Math.ceil → -0 in JS)
      expect(baselineLoss).toBe(-2);
      expect(dampenedLoss).toBeGreaterThanOrEqual(baselineLoss);
      expect(Math.abs(dampenedLoss)).toBe(0);
    });
  });

  describe("updateStreaks opponent-switch gating", () => {
    let mockFirst;

    beforeEach(() => {
      mockFirst = jest.fn();
      mockTrxQuery.mockImplementation(() => ({
        where: jest.fn(() => ({
          forUpdate: jest.fn(() => ({
            first: mockFirst,
          })),
          update: mockUpdate,
        })),
      }));
    });

    it("does NOT increment streak when winner beats the same opponent as last streak win", () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      mockFirst
        .mockResolvedValueOnce({
          user_id: "winner",
          streak: 5,
          max_streak: 5,
          bounty: 100,
          rank_tier: "beginner",
          last_won_opponent_id: "loser",
        })
        .mockResolvedValueOnce({ user_id: "loser", streak: 0, max_streak: 2, bounty: 0 });

      return JankenService.updateStreaks("winner", "loser", "win", {
        betAmount: 1000,
        fee: 200,
      }).then(result => {
        expect(result.winnerStreak).toBe(5); // gated
      });
    });

    it("DOES increment streak when winner beats a different opponent", () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      mockFirst
        .mockResolvedValueOnce({
          user_id: "winner",
          streak: 5,
          max_streak: 5,
          bounty: 100,
          rank_tier: "beginner",
          last_won_opponent_id: "previousLoser",
        })
        .mockResolvedValueOnce({ user_id: "newLoser", streak: 0, max_streak: 2, bounty: 0 });

      return JankenService.updateStreaks("winner", "newLoser", "win", {
        betAmount: 1000,
        fee: 200,
      }).then(result => {
        expect(result.winnerStreak).toBe(6);
      });
    });

    it("starts a fresh streak (1) after a previous loss reset, even against the same opponent", () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      mockFirst
        .mockResolvedValueOnce({
          user_id: "winner",
          streak: 0, // streak got reset by an earlier loss
          max_streak: 5,
          bounty: 0,
          rank_tier: "beginner",
          last_won_opponent_id: null, // also cleared on loss
        })
        .mockResolvedValueOnce({ user_id: "loser", streak: 0, max_streak: 0, bounty: 0 });

      return JankenService.updateStreaks("winner", "loser", "win", {
        betAmount: 1000,
        fee: 200,
      }).then(result => {
        expect(result.winnerStreak).toBe(1);
      });
    });

    it("gated repeat win does not accumulate bounty (streak < 2 trigger is preserved at the gate)", () => {
      JankenRating.findOrCreate.mockResolvedValue(undefined);
      // Winner has streak=1 from a single previous win against this same opponent.
      // Repeat win should keep streak at 1, so bounty should NOT accumulate (needs streak >= 2).
      mockFirst
        .mockResolvedValueOnce({
          user_id: "winner",
          streak: 1,
          max_streak: 1,
          bounty: 0,
          rank_tier: "beginner",
          last_won_opponent_id: "loser",
        })
        .mockResolvedValueOnce({ user_id: "loser", streak: 0, max_streak: 0, bounty: 0 });

      return JankenService.updateStreaks("winner", "loser", "win", {
        betAmount: 5000,
        fee: 1000,
      }).then(result => {
        expect(result.winnerStreak).toBe(1);
        expect(result.winnerBounty).toBe(0); // gated → no bounty
      });
    });
  });
});
