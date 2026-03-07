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
        expect.objectContaining({ EX: 3600 })
      );
    });

    it("returns both choices when both submitted", async () => {
      redis.set.mockResolvedValue("OK");
      redis.get
        .mockResolvedValueOnce("rock")
        .mockResolvedValueOnce("scissors");

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
      redis.get
        .mockResolvedValueOnce("rock")
        .mockResolvedValueOnce(null);

      const result = await JankenService.submitChoice("match-123", "user-1", "rock", {
        p1UserId: "user-1",
        p2UserId: "user-2",
      });

      expect(result).toEqual({ ready: false });
    });
  });

  describe("calculateBounty", () => {
    it("returns 0 for streak 0", () => {
      expect(JankenService.calculateBounty(0)).toBe(0);
    });

    it("returns base reward for streak 1", () => {
      expect(JankenService.calculateBounty(1)).toBe(50);
    });

    it("returns cumulative base for streak 2", () => {
      expect(JankenService.calculateBounty(2)).toBe(100);
    });

    it("adds milestone bonus at streak 3", () => {
      // 3*50 + 100 = 250
      expect(JankenService.calculateBounty(3)).toBe(250);
    });

    it("adds milestone bonus at streak 5", () => {
      // 5*50 + 100 + 300 = 650
      expect(JankenService.calculateBounty(5)).toBe(650);
    });

    it("adds milestone bonus at streak 10", () => {
      // 10*50 + 100 + 300 + 500 + 1000 = 2400
      expect(JankenService.calculateBounty(10)).toBe(2400);
    });

    it("caps at maxBounty", () => {
      expect(JankenService.calculateBounty(100)).toBe(10000);
    });
  });

  describe("updateStreaks", () => {
    it("increments winner streak and resets loser streak", async () => {
      JankenRating.findOrCreate
        .mockResolvedValueOnce({ user_id: "winner", streak: 2, max_streak: 5 })
        .mockResolvedValueOnce({ user_id: "loser", streak: 3, max_streak: 4 });

      const result = await JankenService.updateStreaks("winner", "loser", "win");

      expect(JankenRating.update).toHaveBeenCalledWith("winner", {
        streak: 3,
        max_streak: 5,
      });
      expect(JankenRating.update).toHaveBeenCalledWith("loser", {
        streak: 0,
        max_streak: 4,
      });
      expect(result).toEqual({
        winnerStreak: 3,
        loserPreviousStreak: 3,
        loserBounty: expect.any(Number),
      });
    });

    it("updates max_streak when new record", async () => {
      JankenRating.findOrCreate
        .mockResolvedValueOnce({ user_id: "winner", streak: 5, max_streak: 5 })
        .mockResolvedValueOnce({ user_id: "loser", streak: 0, max_streak: 2 });

      await JankenService.updateStreaks("winner", "loser", "win");

      expect(JankenRating.update).toHaveBeenCalledWith("winner", {
        streak: 6,
        max_streak: 6,
      });
    });

    it("does not change streaks on draw", async () => {
      const result = await JankenService.updateStreaks("p1", "p2", "draw");

      expect(JankenRating.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        winnerStreak: 0,
        loserPreviousStreak: 0,
        loserBounty: 0,
      });
    });

    it("handles p2 winning (p1Result is lose)", async () => {
      JankenRating.findOrCreate
        .mockResolvedValueOnce({ user_id: "p2", streak: 0, max_streak: 1 })
        .mockResolvedValueOnce({ user_id: "p1", streak: 4, max_streak: 7 });

      const result = await JankenService.updateStreaks("p1", "p2", "lose");

      expect(JankenRating.update).toHaveBeenCalledWith("p2", {
        streak: 1,
        max_streak: 1,
      });
      expect(JankenRating.update).toHaveBeenCalledWith("p1", {
        streak: 0,
        max_streak: 7,
      });
      expect(result.loserPreviousStreak).toBe(4);
    });
  });
});
