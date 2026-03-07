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

const JankenService = require("../../src/service/JankenService");
const redis = require("../../src/util/redis");

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
});
