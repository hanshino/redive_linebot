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

jest.mock("../../src/util/mysql", () => mockTrxQuery);

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
        expect.objectContaining({ EX: 3600 })
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
});
